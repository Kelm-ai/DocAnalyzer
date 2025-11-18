# ISO 14971 Compliance System Scripts

This directory contains scripts to manage the complete ISO 14971 compliance evaluation system.

## Quick Start

```bash
# Start the complete system
./start-system.sh

# Check system status
./status.sh

# Stop all services
./stop-system.sh
```

## Scripts Overview

### 🚀 `start-system.sh`
**Comprehensive system startup script**

**Features:**
- Validates project structure and dependencies
- Checks port availability (defaults 8000/5173, override with `API_PORT` / `FRONTEND_PORT`)
- Creates Python virtual environment for API
- Installs all dependencies automatically
- Starts API server (FastAPI + uvicorn)
- Starts frontend development server (Vite)
- Waits for services to be ready
- Provides system status and URLs
- Monitors services and handles graceful shutdown

**Usage:**
```bash
./start-system.sh

# Custom ports
API_PORT=8001 FRONTEND_PORT=3001 ./start-system.sh
```

**Services Started:**
- **API Server**: http://localhost:8000 (override with `API_PORT`)
- **Frontend**: http://localhost:5173 (override with `FRONTEND_PORT`)
- **API Documentation**: http://localhost:8000/docs

### 🔍 `status.sh`
**Comprehensive system status checker**

**Features:**
- Checks prerequisites (Python, Node.js, npm)
- Validates project structure
- Verifies environment configuration
- Shows dependency status
- Displays running services and PIDs
- Shows recent log entries
- Provides system URLs and commands

**Usage:**
```bash
./status.sh
```

### 🛑 `stop-system.sh`
**Safe system shutdown script**

**Features:**
- Gracefully stops all services
- Force kills if necessary
- Releases ports (default 8000 / 5173)
- Archives log files with timestamps
- Cleans up temporary files
- Removes Python cache files

**Usage:**
```bash
./stop-system.sh
```

## System Requirements

### Prerequisites
- **Python 3.8+** (for backend API and pipeline)
- **Node.js 16+** (for frontend development server)
- **npm** (for frontend dependencies)

### Environment Setup
Create `scripts/.env` with your service credentials:
```env
# Azure OpenAI
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_KEY=your-api-key
AZURE_OPENAI_DEPLOYMENT=gpt-4o
AZURE_OPENAI_API_VERSION=2024-12-01-preview

# Azure Search
AZURE_SEARCH_ENDPOINT=https://your-search.search.windows.net
AZURE_SEARCH_KEY=your-search-key
AZURE_SEARCH_INDEX=iso-analysis

# Azure Document Intelligence
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=https://your-docintance.cognitiveservices.azure.com
AZURE_DOCUMENT_INTELLIGENCE_KEY=your-doc-intelligence-key
AZURE_DOCUMENT_INTELLIGENCE_API_VERSION=2024-11-30

# Azure Storage
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;...

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

**Document Intelligence endpoint options**
- Use `output_format=markdown|text` on `POST /api/document-intelligence/markdown` to pick Azure's markdown or plain-text rendering.
- `sanitize`, `convert_tables`, and `strip_comments` let you control HTML cleanup (all `true` by default for cleaner markdown).
- Add `store_in_supabase=true` to persist the processed output into the shared `processed_documents` table for pipeline reuse.

## System Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   API Server     │    │   Azure         │
│   (React/Vite)  │───▶│   (FastAPI)      │───▶│   Services      │
│   Port: 5173*   │    │   Port: 8000*    │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │   Supabase       │
                       │   Database       │
                       └──────────────────┘
```

*Ports shown are defaults. Override with `FRONTEND_PORT` / `API_PORT` when starting the system.*

## Troubleshooting

### Port Conflicts
If the default ports (8000 / 5173) or your overrides are in use:
```bash
# Find process using port
lsof -i :8000   # or :$API_PORT
lsof -i :5173   # or :$FRONTEND_PORT

# Kill process
kill -9 <PID>
```

### Service Not Starting
1. Check logs:
   ```bash
   tail -f api/api.log
   tail -f frontend/frontend.log
   ```

2. Verify environment:
   ```bash
   ./status.sh
   ```

3. Check dependencies:
   ```bash
   # API dependencies
   cd api && source venv/bin/activate && pip list
   
   # Frontend dependencies
   cd frontend && npm list
   ```

### Clean Restart
```bash
./stop-system.sh
rm -rf api/venv api/api.log
rm -rf frontend/node_modules frontend/frontend.log
./start-system.sh
```

## Log Files

**Locations:**
- API: `api/api.log`
- Frontend: `frontend/frontend.log`

**Log Rotation:**
- Logs are automatically archived when stopping services
- Format: `service-YYYYMMDD-HHMMSS.log`

## Development Notes

### API Development
- **Hot reload**: API server automatically reloads on code changes
- **OpenAPI docs**: Available at http://localhost:8001/docs
- **Virtual environment**: Isolated Python dependencies in `api/venv/`

### Frontend Development
- **Hot reload**: Frontend automatically reloads on code changes
- **Build tool**: Vite for fast development builds
- **Dependencies**: React 19, TypeScript, Tailwind CSS

### Integration Testing
1. Start system: `./start-system.sh`
2. Upload test document via frontend
3. Monitor evaluation progress
4. View compliance report
5. Check API logs for detailed processing info

## Production Deployment

For production deployment, consider:
- Use production WSGI server (Gunicorn) instead of uvicorn
- Build and serve static frontend files
- Use environment-specific configuration
- Set up proper logging and monitoring
- Use Docker containers for consistent deployment
- Configure reverse proxy (nginx) for routing

---

**System Status**: Use `./status.sh` for real-time system information
**Quick Start**: Run `./start-system.sh` to get everything running
**Documentation**: Visit http://localhost:8001/docs for API documentation
