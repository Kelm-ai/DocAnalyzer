import asyncio

try:
    from document_summarizer import summarize_all_supporting_docs
    import document_summarizer
except ImportError:
    from api.document_summarizer import summarize_all_supporting_docs
    from api import document_summarizer


class _FakeStorageBucket:
    def download(self, path):
        return f"pdf-bytes-for:{path}".encode()


class _FakeStorageClient:
    def from_(self, bucket_name):
        assert bucket_name == "documents"
        return _FakeStorageBucket()


class _FakeQuery:
    def __init__(self, client, table_name):
        self.client = client
        self.table_name = table_name
        self.payload = None
        self.filter_field = None
        self.filter_value = None

    def update(self, payload):
        self.payload = payload
        return self

    def eq(self, field, value):
        self.filter_field = field
        self.filter_value = value
        return self

    def execute(self):
        self.client.operations.append({
            "table": self.table_name,
            "payload": self.payload,
            "filter_field": self.filter_field,
            "filter_value": self.filter_value,
        })
        return None


class _FakeSupabase:
    def __init__(self):
        self.storage = _FakeStorageClient()
        self.operations = []

    def table(self, table_name):
        return _FakeQuery(self, table_name)


def test_summarize_all_supporting_docs_tracks_initial_incremental_and_final_progress(monkeypatch):
    async def fake_summarize_document_from_bytes(file_bytes, file_name, model=None):
        return {
            "summary_text": f"summary for {file_name}",
            "tokens_used": 12,
            "model": "gpt-test",
            "generated_at": "2026-03-17T00:00:00",
        }

    monkeypatch.setattr(
        document_summarizer,
        "summarize_document_from_bytes",
        fake_summarize_document_from_bytes,
    )

    documents = [
        {"id": "doc-1", "file_name": "one.pdf", "storage_path": "documents/evaluations/eval-1/supporting/one.pdf"},
        {"id": "doc-2", "file_name": "two.pdf", "storage_path": "documents/evaluations/eval-1/supporting/two.pdf"},
    ]
    supabase = _FakeSupabase()

    results = asyncio.run(
        summarize_all_supporting_docs(
            documents=documents,
            supabase_client=supabase,
            evaluation_id="eval-1",
            max_concurrent=1,
        )
    )

    assert [result["success"] for result in results] == [True, True]

    evaluation_updates = [
        op for op in supabase.operations
        if op["table"] == "document_evaluations"
    ]
    document_updates = [
        op for op in supabase.operations
        if op["table"] == "evaluation_documents"
    ]

    assert evaluation_updates[0]["payload"] == {
        "summaries_status": "generating",
        "summaries_total": 2,
        "summaries_completed": 0,
    }
    assert {"summaries_completed": 1} in [op["payload"] for op in evaluation_updates]
    assert {"summaries_completed": 2} in [op["payload"] for op in evaluation_updates]
    assert evaluation_updates[-1]["payload"] == {
        "summaries_status": "completed",
        "summaries_completed": 2,
    }
    assert len(document_updates) == 2


def test_summarize_all_supporting_docs_marks_failed_runs_and_still_updates_processed_count(monkeypatch):
    async def fake_summarize_document_from_bytes(file_bytes, file_name, model=None):
        if file_name == "bad.pdf":
            raise RuntimeError("boom")
        return {
            "summary_text": f"summary for {file_name}",
            "tokens_used": 12,
            "model": "gpt-test",
            "generated_at": "2026-03-17T00:00:00",
        }

    monkeypatch.setattr(
        document_summarizer,
        "summarize_document_from_bytes",
        fake_summarize_document_from_bytes,
    )

    documents = [
        {"id": "doc-1", "file_name": "good.pdf", "storage_path": "documents/evaluations/eval-2/supporting/good.pdf"},
        {"id": "doc-2", "file_name": "bad.pdf", "storage_path": "documents/evaluations/eval-2/supporting/bad.pdf"},
    ]
    supabase = _FakeSupabase()

    results = asyncio.run(
        summarize_all_supporting_docs(
            documents=documents,
            supabase_client=supabase,
            evaluation_id="eval-2",
            max_concurrent=1,
        )
    )

    assert [result["success"] for result in results] == [True, False]

    evaluation_updates = [
        op["payload"] for op in supabase.operations
        if op["table"] == "document_evaluations"
    ]

    assert evaluation_updates[0] == {
        "summaries_status": "generating",
        "summaries_total": 2,
        "summaries_completed": 0,
    }
    assert {"summaries_completed": 1} in evaluation_updates
    assert {"summaries_completed": 2} in evaluation_updates
    assert evaluation_updates[-1] == {
        "summaries_status": "failed",
        "summaries_completed": 2,
    }
