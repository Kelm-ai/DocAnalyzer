import asyncio
import time

try:
    from progress_tracker import ProgressTracker
except ImportError:
    from api.progress_tracker import ProgressTracker


class _FakeQuery:
    def __init__(self, client):
        self.client = client

    def update(self, payload):
        self.client.updates.append(payload)
        return self

    def eq(self, field, value):
        self.client.filters.append((field, value))
        return self

    def execute(self):
        if self.client.raise_on_execute:
            raise RuntimeError("db write failed")
        return None


class _FakeSupabase:
    def __init__(self, raise_on_execute=False):
        self.raise_on_execute = raise_on_execute
        self.updates = []
        self.filters = []

    def table(self, name):
        assert name == "document_evaluations"
        return _FakeQuery(self)


def test_progress_tracker_debounces_requirement_writes():
    async def scenario():
        supabase = _FakeSupabase()
        tracker = ProgressTracker("eval-1", supabase, debounce_seconds=0.05)

        for _ in range(10):
            await tracker.on_requirement_complete()

        await asyncio.sleep(0.08)
        await tracker.close(flush=False)
        return supabase

    supabase = asyncio.run(scenario())

    assert len(supabase.updates) <= 2
    assert supabase.updates[-1]["metadata"]["completed_requirements"] == 10


def test_progress_tracker_eta_is_none_before_three_completions():
    tracker = ProgressTracker("eval-eta-none", _FakeSupabase())
    tracker._eval_start_time = time.monotonic() - 30

    assert tracker._calculate_eta_locked(2, 10) is None


def test_progress_tracker_eta_is_calculated_after_three_completions():
    tracker = ProgressTracker("eval-eta", _FakeSupabase())
    tracker._eval_start_time = time.monotonic() - 30

    eta = tracker._calculate_eta_locked(3, 10)

    assert eta is not None
    assert 65 <= eta <= 75


def test_progress_tracker_eta_uses_recent_completion_intervals_when_available():
    tracker = ProgressTracker("eval-ema", _FakeSupabase())
    tracker._eval_start_time = 0.0
    tracker._completion_times = [100.0, 102.0, 105.0, 109.0]

    eta = tracker._calculate_eta_locked(4, 10)

    # EMA over [2, 3, 4] with alpha=0.3 = 2.81; remaining=6 -> 16.9s
    assert eta == 16.9


def test_progress_tracker_close_cancels_pending_task_and_is_idempotent():
    async def scenario():
        supabase = _FakeSupabase()
        tracker = ProgressTracker("eval-close", supabase, debounce_seconds=1.0)

        await tracker.on_requirement_complete()
        await tracker.on_requirement_complete()
        pending_task = tracker._pending_write_task

        assert pending_task is not None
        assert not pending_task.done()

        await tracker.close(flush=False)
        await tracker.close(flush=False)

        return pending_task, supabase

    pending_task, supabase = asyncio.run(scenario())

    assert pending_task.cancelled() or pending_task.done()
    assert len(supabase.updates) == 1


def test_progress_tracker_write_failures_do_not_raise():
    async def scenario():
        tracker = ProgressTracker("eval-fail", _FakeSupabase(raise_on_execute=True), debounce_seconds=0.01)
        await tracker.set_phase("evaluating", "Evaluating requirements...")
        await tracker.set_total_requirements(4)
        await tracker.on_requirement_complete()
        await tracker.close(flush=True)

    asyncio.run(scenario())
