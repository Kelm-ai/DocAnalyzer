from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional


logger = logging.getLogger(__name__)


class ProgressTracker:
    """Debounced progress writer for long-running document evaluations."""

    def __init__(
        self,
        evaluation_id: str,
        supabase_client: Any,
        debounce_seconds: float = 2.0,
    ) -> None:
        self.evaluation_id = evaluation_id
        self.supabase = supabase_client
        self.debounce_seconds = debounce_seconds
        self._completed_count = 0
        self._total_requirements = 0
        self._phase = "pending"
        self._status_message = "Waiting to start evaluation..."
        self._eval_start_time: Optional[float] = None
        self._last_db_write = 0.0
        self._pending_write_task: Optional[asyncio.Task[None]] = None
        self._closed = False
        self._lock = asyncio.Lock()

    async def set_phase(self, phase: str, message: str) -> None:
        async with self._lock:
            if self._closed:
                return
            self._phase = phase
            self._status_message = message
            if phase == "evaluating" and self._eval_start_time is None:
                self._eval_start_time = time.monotonic()
        await self._write_metadata()

    async def set_total_requirements(self, total: int) -> None:
        async with self._lock:
            if self._closed:
                return
            self._total_requirements = max(0, int(total))
            if self._phase == "evaluating":
                self._status_message = self._build_default_status_message()
        await self._write_metadata()

    async def on_requirement_complete(self) -> None:
        write_now = False
        remaining_delay = 0.0

        async with self._lock:
            if self._closed:
                return
            self._completed_count += 1
            self._status_message = self._build_default_status_message()
            now = time.monotonic()
            if self._eval_start_time is None:
                self._eval_start_time = now
            elapsed_since_write = now - self._last_db_write
            if elapsed_since_write >= self.debounce_seconds:
                write_now = True
            elif self._pending_write_task is None or self._pending_write_task.done():
                remaining_delay = max(0.0, self.debounce_seconds - elapsed_since_write)
                self._pending_write_task = asyncio.create_task(self._delayed_write(remaining_delay))

        if write_now:
            await self._write_metadata()

    async def close(self, *, flush: bool) -> None:
        pending_task: Optional[asyncio.Task[None]] = None
        should_force_write = False

        async with self._lock:
            if self._closed:
                return
            should_force_write = flush
            self._closed = True
            pending_task = self._pending_write_task
            self._pending_write_task = None

        if pending_task is not None and not pending_task.done():
            pending_task.cancel()
            try:
                await pending_task
            except asyncio.CancelledError:
                pass

        if should_force_write:
            await self._write_metadata(force=True)

    async def _delayed_write(self, delay_seconds: float) -> None:
        try:
            await asyncio.sleep(delay_seconds)
            await self._write_metadata()
        except asyncio.CancelledError:
            raise
        finally:
            async with self._lock:
                if self._pending_write_task is not None and asyncio.current_task() is self._pending_write_task:
                    self._pending_write_task = None

    async def _write_metadata(self, *, force: bool = False) -> None:
        payload: Optional[Dict[str, Any]] = None

        async with self._lock:
            if self._closed and not force:
                return

            completed = self._completed_count
            total = self._total_requirements
            progress_percent = int((completed / total) * 100) if total > 0 else 0
            estimated_seconds_remaining = self._calculate_eta_locked(completed, total)
            payload = {
                "phase": self._phase,
                "progress_percent": progress_percent,
                "completed_requirements": completed,
                "total_requirements": total,
                "status_message": self._status_message,
                "estimated_seconds_remaining": estimated_seconds_remaining,
                "last_updated": datetime.now(timezone.utc).isoformat(),
            }

        try:
            self.supabase.table("document_evaluations").update({
                "metadata": payload,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", self.evaluation_id).execute()
            async with self._lock:
                self._last_db_write = time.monotonic()
        except Exception as exc:
            logger.warning("Failed to write evaluation progress metadata for %s: %s", self.evaluation_id, exc)

    def _calculate_eta_locked(self, completed: int, total: int) -> Optional[float]:
        if completed < 3 or total <= completed or self._eval_start_time is None:
            return None
        elapsed = max(0.0, time.monotonic() - self._eval_start_time)
        if elapsed <= 0:
            return None
        remaining = total - completed
        seconds_per_completion = elapsed / completed
        return round(seconds_per_completion * remaining, 1)

    def _build_default_status_message(self) -> str:
        if self._phase == "evaluating" and self._total_requirements > 0:
            return (
                f"Evaluating requirements "
                f"({self._completed_count} of {self._total_requirements})..."
            )
        return self._status_message
