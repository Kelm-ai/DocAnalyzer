# Railway Deployment Guide

## Prerequisites
- Railway account with project created
- Both services (backend and frontend) configured in Railway

## Service Configuration

### Backend Service (API)

#### Settings
- **Root Directory**: `api`
- **Builder**: Nixpacks (auto-detected from `requirements.txt`)
- **Start Command**: Defined in `api/railway.toml`
  - `uvicorn app:app --host 0.0.0.0 --port $PORT`
- **Health Check Path**: `/api/health`

#### Required Environment Variables
```bash
# CORS Configuration
ALLOWED_ORIGINS=https://your-frontend.up.railway.app,http://localhost:5173,http://localhost:3000

# Evaluation Pipeline
EVALUATION_PIPELINE=vision

# Azure Storage
AZURE_STORAGE_CONNECTION_STRING=your_connection_string

# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Azure Document Intelligence (optional)
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=your_endpoint
AZURE_DOCUMENT_INTELLIGENCE_KEY=your_key
```

### Frontend Service

#### Settings
- **Root Directory**: `iso-compliance-frontend`
- **Builder**: Nixpacks (auto-detected from `package.json`)
- **Start Command**: Defined in `iso-compliance-frontend/railway.toml`
  - `npx serve dist -s -p $PORT`

#### Required Environment Variables
```bash
# Node.js Version (Required to avoid version mismatch)
NIXPACKS_NODE_VERSION=20

# API Backend URL
VITE_API_URL=https://your-backend.up.railway.app
```

## Deployment Steps

1. **Create Two Services in Railway**
   - One for backend (API)
   - One for frontend

2. **Configure Backend Service**
   - Set Root Directory to `api`
   - Add all required environment variables listed above
   - Update `ALLOWED_ORIGINS` to include your frontend Railway domain

3. **Configure Frontend Service**
   - Set Root Directory to `iso-compliance-frontend`
   - Set `NIXPACKS_NODE_VERSION=20` (important!)
   - Set `VITE_API_URL` to your backend Railway domain

4. **Deploy**
   - Both services will automatically deploy on push to `main` branch
   - Railway will use the `railway.toml` configurations in each directory

## Troubleshooting

### Frontend Build Fails with Node Version Error
**Error**: `Unsupported engine { required: { node: '>=22.12.0' } }`

**Solution**: Ensure `NIXPACKS_NODE_VERSION=20` is set in Railway environment variables.

### Frontend Build Fails with "Could not resolve entry module"
**Error**: `Could not resolve entry module "index.html"`

**Solution**: Verify Root Directory is set to `iso-compliance-frontend` in Railway service settings.

### Backend CORS Errors
**Error**: CORS policy blocking frontend requests

**Solution**:
1. Ensure `ALLOWED_ORIGINS` environment variable includes your frontend Railway domain
2. Format: comma-separated list without spaces
   ```
   https://frontend.railway.app,http://localhost:5173
   ```

### Health Check Failing
**Error**: Railway marks service as unhealthy

**Solution**:
1. Verify `/api/health` endpoint is accessible
2. Check that `PORT` environment variable is being used correctly
3. Review deployment logs for startup errors

## Files Created for Deployment

- `api/requirements.txt` - Python dependencies for backend
- `api/runtime.txt` - Python version specification
- `api/railway.toml` - Backend deployment configuration
- `iso-compliance-frontend/railway.toml` - Frontend deployment configuration
- `iso-compliance-frontend/Staticfile` - Static file serving configuration
- `.gitignore` - Updated to exclude build artifacts and outputs

## Monitoring

Both services include health check endpoints:
- **Backend**: `https://your-backend.railway.app/api/health`
- **Frontend**: Railway automatically monitors the web service

Check Railway dashboard for:
- Build logs
- Deployment status
- Resource usage
- Environment variables