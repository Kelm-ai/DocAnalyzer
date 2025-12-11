#!/usr/bin/env python3
"""
Global document evaluation queue with position tracking.
Limits concurrent document evaluations and provides queue status.
"""

import asyncio
import logging
import os
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Coroutine, Dict, List, Optional, Tuple
from uuid import uuid4

logger = logging.getLogger(__name__)


class QueueItemStatus(Enum):
    """Status of an item in the evaluation queue."""
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class QueueItem:
    """Represents a document evaluation job in the queue."""
    id: str
    evaluation_id: str
    file_path: str
    filename: str
    created_at: datetime
    status: QueueItemStatus = QueueItemStatus.QUEUED
    position: int = 0
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API responses."""
        return {
            "queue_item_id": self.id,
            "evaluation_id": self.evaluation_id,
            "filename": self.filename,
            "status": self.status.value,
            "position": self.position,
            "created_at": self.created_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "error_message": self.error_message,
        }


@dataclass
class QueueConfig:
    """Configuration for the evaluation queue."""
    max_concurrent: int = 2  # Max documents processing at once
    max_queue_size: int = 100  # Maximum pending items in queue
    processing_timeout_seconds: float = 1800.0  # 30 minutes max per document


class EvaluationQueue:
    """
    Global queue for document evaluations.

    Manages concurrent evaluation slots and provides queue position tracking.
    """

    def __init__(self, config: Optional[QueueConfig] = None):
        self.config = config or QueueConfig()

        # Queue state
        self._pending: List[QueueItem] = []
        self._processing: Dict[str, QueueItem] = {}  # evaluation_id -> QueueItem
        self._completed: Dict[str, QueueItem] = {}   # evaluation_id -> QueueItem

        # Synchronization
        self._lock = asyncio.Lock()
        self._slot_available = asyncio.Condition()

        # Worker task
        self._worker_task: Optional[asyncio.Task] = None
        self._shutdown = False

        # Evaluation callback
        self._evaluation_callback: Optional[
            Callable[[str, str, str], Coroutine[Any, Any, None]]
        ] = None

        logger.info(
            "EvaluationQueue initialized: max_concurrent=%d, max_queue_size=%d",
            self.config.max_concurrent,
            self.config.max_queue_size
        )

    def set_evaluation_callback(
        self,
        callback: Callable[[str, str, str], Coroutine[Any, Any, None]]
    ) -> None:
        """
        Set the callback function for running evaluations.

        Args:
            callback: Async function(evaluation_id, file_path, filename) -> None
        """
        self._evaluation_callback = callback

    async def start(self) -> None:
        """Start the queue worker."""
        if self._worker_task is None or self._worker_task.done():
            self._shutdown = False
            self._worker_task = asyncio.create_task(self._worker_loop())
            logger.info("Evaluation queue worker started")

    async def stop(self) -> None:
        """Stop the queue worker gracefully."""
        self._shutdown = True

        async with self._slot_available:
            self._slot_available.notify_all()

        if self._worker_task:
            try:
                await asyncio.wait_for(self._worker_task, timeout=5.0)
            except asyncio.TimeoutError:
                self._worker_task.cancel()
                try:
                    await self._worker_task
                except asyncio.CancelledError:
                    pass
            self._worker_task = None

        logger.info("Evaluation queue worker stopped")

    async def enqueue(
        self,
        evaluation_id: str,
        file_path: str,
        filename: str
    ) -> Tuple[QueueItem, int]:
        """
        Add a document to the evaluation queue.

        Args:
            evaluation_id: ID of the document_evaluation record
            file_path: Path to the temporary file
            filename: Original filename

        Returns:
            Tuple of (QueueItem, queue_position)

        Raises:
            ValueError: If queue is full
        """
        async with self._lock:
            # Check queue capacity
            if len(self._pending) >= self.config.max_queue_size:
                raise ValueError(
                    f"Queue is full (max {self.config.max_queue_size} items). "
                    "Please try again later."
                )

            # Check if already in queue or processing
            if evaluation_id in self._processing:
                existing = self._processing[evaluation_id]
                return existing, 0  # Already processing

            for item in self._pending:
                if item.evaluation_id == evaluation_id:
                    return item, item.position

            # Create new queue item
            item = QueueItem(
                id=str(uuid4()),
                evaluation_id=evaluation_id,
                file_path=file_path,
                filename=filename,
                created_at=datetime.utcnow(),
            )

            # Add to pending queue
            self._pending.append(item)
            self._update_positions()

            logger.info(
                "Enqueued evaluation %s (filename=%s) at position %d",
                evaluation_id, filename, item.position
            )

        # Notify worker that there's work available
        async with self._slot_available:
            self._slot_available.notify()

        return item, item.position

    def _update_positions(self) -> None:
        """Update position numbers for all pending items."""
        for i, item in enumerate(self._pending):
            item.position = i + 1

    async def get_position(self, evaluation_id: str) -> Optional[int]:
        """
        Get the current queue position for an evaluation.

        Returns:
            Queue position (1-based), 0 if processing, None if not found
        """
        async with self._lock:
            if evaluation_id in self._processing:
                return 0

            for item in self._pending:
                if item.evaluation_id == evaluation_id:
                    return item.position

            return None

    async def get_status(self) -> Dict[str, Any]:
        """Get current queue status for monitoring."""
        async with self._lock:
            return {
                "pending_count": len(self._pending),
                "processing_count": len(self._processing),
                "max_concurrent": self.config.max_concurrent,
                "max_queue_size": self.config.max_queue_size,
                "available_slots": max(
                    0,
                    self.config.max_concurrent - len(self._processing)
                ),
                "queue_items": [item.to_dict() for item in self._pending[:10]],
                "processing_items": [
                    item.to_dict()
                    for item in self._processing.values()
                ],
            }

    async def get_item_status(self, evaluation_id: str) -> Optional[Dict[str, Any]]:
        """Get status of a specific queue item."""
        async with self._lock:
            # Check processing
            if evaluation_id in self._processing:
                return self._processing[evaluation_id].to_dict()

            # Check pending
            for item in self._pending:
                if item.evaluation_id == evaluation_id:
                    return item.to_dict()

            # Check completed history
            if evaluation_id in self._completed:
                return self._completed[evaluation_id].to_dict()

            return None

    async def cancel(self, evaluation_id: str) -> bool:
        """
        Cancel a pending evaluation.

        Returns:
            True if cancelled, False if not found or already processing
        """
        async with self._lock:
            for i, item in enumerate(self._pending):
                if item.evaluation_id == evaluation_id:
                    self._pending.pop(i)
                    self._update_positions()
                    logger.info("Cancelled evaluation %s", evaluation_id)
                    return True

            return False

    async def _worker_loop(self) -> None:
        """Main worker loop that processes queue items."""
        logger.info("Queue worker loop started")

        while not self._shutdown:
            try:
                # Wait for a slot to be available and work to do
                async with self._slot_available:
                    while not self._shutdown:
                        async with self._lock:
                            has_work = len(self._pending) > 0
                            has_slot = (
                                len(self._processing) < self.config.max_concurrent
                            )

                        if has_work and has_slot:
                            break

                        await self._slot_available.wait()

                if self._shutdown:
                    break

                # Get next item to process
                item: Optional[QueueItem] = None
                async with self._lock:
                    if not self._pending:
                        continue

                    if len(self._processing) >= self.config.max_concurrent:
                        continue

                    item = self._pending.pop(0)
                    item.status = QueueItemStatus.PROCESSING
                    item.started_at = datetime.utcnow()
                    self._processing[item.evaluation_id] = item
                    self._update_positions()

                if item is None:
                    continue

                # Process the item
                logger.info(
                    "Starting evaluation %s (filename=%s)",
                    item.evaluation_id, item.filename
                )

                # Run evaluation in a separate task to allow timeout
                asyncio.create_task(
                    self._process_item(item)
                )

            except asyncio.CancelledError:
                logger.info("Queue worker cancelled")
                break
            except Exception as exc:
                logger.exception("Queue worker error: %s", exc)
                await asyncio.sleep(1.0)

        logger.info("Queue worker loop ended")

    async def _process_item(self, item: QueueItem) -> None:
        """Process a single queue item."""
        try:
            if self._evaluation_callback is None:
                raise RuntimeError("Evaluation callback not set")

            # Run with timeout
            await asyncio.wait_for(
                self._evaluation_callback(
                    item.evaluation_id,
                    item.file_path,
                    item.filename
                ),
                timeout=self.config.processing_timeout_seconds
            )

            item.status = QueueItemStatus.COMPLETED
            item.completed_at = datetime.utcnow()
            logger.info(
                "Completed evaluation %s",
                item.evaluation_id
            )

        except asyncio.TimeoutError:
            item.status = QueueItemStatus.FAILED
            item.error_message = "Evaluation timed out"
            item.completed_at = datetime.utcnow()
            logger.error(
                "Evaluation %s timed out after %.0fs",
                item.evaluation_id,
                self.config.processing_timeout_seconds
            )

        except Exception as exc:
            item.status = QueueItemStatus.FAILED
            item.error_message = str(exc)
            item.completed_at = datetime.utcnow()
            logger.exception(
                "Evaluation %s failed: %s",
                item.evaluation_id, exc
            )

        finally:
            # Move from processing to completed
            async with self._lock:
                self._processing.pop(item.evaluation_id, None)

                # Keep limited history of completed items
                self._completed[item.evaluation_id] = item
                if len(self._completed) > 50:
                    # Remove oldest entries
                    oldest_keys = list(self._completed.keys())[:10]
                    for key in oldest_keys:
                        del self._completed[key]

            # Notify that a slot is available
            async with self._slot_available:
                self._slot_available.notify()


# Global singleton instance
_evaluation_queue: Optional[EvaluationQueue] = None


def get_evaluation_queue(config: Optional[QueueConfig] = None) -> EvaluationQueue:
    """Get or create the global evaluation queue singleton."""
    global _evaluation_queue
    if _evaluation_queue is None:
        # Load config from environment if not provided
        if config is None:
            config = QueueConfig(
                max_concurrent=int(os.getenv("MAX_CONCURRENT_EVALUATIONS", "2")),
                max_queue_size=int(os.getenv("MAX_QUEUE_SIZE", "100")),
                processing_timeout_seconds=float(os.getenv("EVALUATION_TIMEOUT_SECONDS", "1800")),
            )
        _evaluation_queue = EvaluationQueue(config)
    return _evaluation_queue


def reset_evaluation_queue() -> None:
    """Reset the global evaluation queue (for testing)."""
    global _evaluation_queue
    _evaluation_queue = None
