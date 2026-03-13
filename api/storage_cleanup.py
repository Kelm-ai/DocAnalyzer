#!/usr/bin/env python3
"""
Automatic Supabase Storage file cleanup.

Deletes uploaded document files from Supabase Storage 48 hours after upload.
Evaluation results, scores, and reports are preserved -- only the raw files
stored in the "documents" bucket are removed.

Runs as an asyncio background task within the FastAPI process, following the
same pattern as EvaluationQueue.
"""

import asyncio
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)

STORAGE_BUCKET = "documents"


@dataclass
class CleanupConfig:
    """Configuration for the storage cleanup scheduler."""
    max_age_hours: float = 48.0
    check_interval_seconds: float = 3600.0
    batch_size: int = 25


class StorageCleanupScheduler:
    """
    Background scheduler that deletes old files from Supabase Storage.

    Lifecycle:
        scheduler = StorageCleanupScheduler(config)
        scheduler.set_supabase_getter(get_supabase_client)
        await scheduler.start()
        ...
        await scheduler.stop()
    """

    def __init__(self, config: Optional[CleanupConfig] = None):
        self.config = config or CleanupConfig()
        self._task: Optional[asyncio.Task] = None
        self._shutdown = False
        self._get_supabase: Optional[Callable] = None
        self._last_run: Optional[datetime] = None
        self._total_deleted: int = 0
        self._total_errors: int = 0

    def set_supabase_getter(self, getter: Callable) -> None:
        """Set the callable that returns a Supabase client."""
        self._get_supabase = getter

    async def start(self) -> None:
        """Start the background cleanup loop."""
        if self._task is None or self._task.done():
            self._shutdown = False
            self._task = asyncio.create_task(self._loop())
            logger.info(
                "Storage cleanup scheduler started: max_age=%.0fh, interval=%.0fs, batch=%d",
                self.config.max_age_hours,
                self.config.check_interval_seconds,
                self.config.batch_size,
            )

    async def stop(self) -> None:
        """Stop the background cleanup loop gracefully."""
        self._shutdown = True
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("Storage cleanup scheduler stopped")

    async def get_status(self) -> Dict[str, Any]:
        """Return monitoring info."""
        return {
            "running": self._task is not None and not self._task.done(),
            "last_run": self._last_run.isoformat() if self._last_run else None,
            "total_deleted": self._total_deleted,
            "total_errors": self._total_errors,
            "config": {
                "max_age_hours": self.config.max_age_hours,
                "check_interval_seconds": self.config.check_interval_seconds,
                "batch_size": self.config.batch_size,
            },
        }

    async def _loop(self) -> None:
        """Main background loop. Runs cleanup, then sleeps."""
        # Wait 60s after startup for the server to stabilize
        await asyncio.sleep(60)

        while not self._shutdown:
            try:
                deleted_count = await self._run_cleanup_cycle()
                self._last_run = datetime.now(timezone.utc)
                if deleted_count > 0:
                    logger.info("Storage cleanup cycle: deleted %d file(s)", deleted_count)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                self._total_errors += 1
                logger.exception("Storage cleanup cycle failed: %s", exc)
                await asyncio.sleep(60)
                continue

            await asyncio.sleep(self.config.check_interval_seconds)

    async def _run_cleanup_cycle(self) -> int:
        """
        Single cleanup cycle:
        1. Query evaluation_documents for files older than max_age_hours
           where storage_deleted_at IS NULL
        2. Exclude files for evaluations still in_progress
        3. Delete each file from Supabase Storage
        4. Mark the row with storage_deleted_at = NOW()
        """
        if self._get_supabase is None:
            logger.warning("Supabase getter not configured, skipping cleanup")
            return 0

        supabase = self._get_supabase()
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=self.config.max_age_hours)).isoformat()

        # Find candidate files
        response = supabase.table("evaluation_documents") \
            .select("id, storage_path, evaluation_id") \
            .is_("storage_deleted_at", "null") \
            .lt("created_at", cutoff) \
            .limit(self.config.batch_size) \
            .execute()

        candidates = response.data or []
        if not candidates:
            return 0

        # Get evaluation IDs that are still in_progress (skip those)
        eval_ids = list({c["evaluation_id"] for c in candidates})
        in_progress_ids: set = set()
        for i in range(0, len(eval_ids), 50):
            batch = eval_ids[i:i + 50]
            eval_response = supabase.table("document_evaluations") \
                .select("id") \
                .in_("id", batch) \
                .eq("status", "in_progress") \
                .execute()
            for row in (eval_response.data or []):
                in_progress_ids.add(row["id"])

        # Delete files, skipping in_progress evaluations
        deleted = 0
        for doc in candidates:
            if doc["evaluation_id"] in in_progress_ids:
                continue

            try:
                self._delete_storage_file(supabase, doc["storage_path"])
                supabase.table("evaluation_documents").update({
                    "storage_deleted_at": datetime.now(timezone.utc).isoformat(),
                }).eq("id", doc["id"]).execute()
                deleted += 1
                self._total_deleted += 1
            except Exception as exc:
                self._total_errors += 1
                logger.warning(
                    "Failed to delete file %s from storage: %s",
                    doc["storage_path"], exc,
                )

        return deleted

    def _delete_storage_file(self, supabase, storage_path: str) -> None:
        """Delete a single file from Supabase Storage."""
        # storage_path is stored as "documents/evaluations/..." in the DB.
        # The storage API needs the path within the bucket (without bucket prefix).
        prefix = f"{STORAGE_BUCKET}/"
        if storage_path.startswith(prefix):
            path_in_bucket = storage_path[len(prefix):]
        else:
            path_in_bucket = storage_path

        supabase.storage.from_(STORAGE_BUCKET).remove([path_in_bucket])


# -- Singleton access -------------------------------------------------------

_cleanup_scheduler: Optional[StorageCleanupScheduler] = None


def get_storage_cleanup_scheduler(
    config: Optional[CleanupConfig] = None,
) -> StorageCleanupScheduler:
    """Get or create the global storage cleanup scheduler."""
    global _cleanup_scheduler
    if _cleanup_scheduler is None:
        if config is None:
            config = CleanupConfig(
                max_age_hours=float(os.getenv("STORAGE_CLEANUP_MAX_AGE_HOURS", "48")),
                check_interval_seconds=float(os.getenv("STORAGE_CLEANUP_INTERVAL_SECONDS", "3600")),
                batch_size=int(os.getenv("STORAGE_CLEANUP_BATCH_SIZE", "25")),
            )
        _cleanup_scheduler = StorageCleanupScheduler(config)
    return _cleanup_scheduler
