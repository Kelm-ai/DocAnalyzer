#!/bin/bash
set -e
cd ..
source api/venv/bin/activate
uvicorn api.app:app --host 0.0.0.0 --port 5001 --reload
