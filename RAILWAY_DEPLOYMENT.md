# Railway Deployment Guide

## Prerequisites
- Railway account with project created
- Both services (backend and frontend) configured in Railway

## Service Configuration

### Backend Service (API)

#### Settings
- **Root Directory**: `api`
- **Builder**: Railpack (configured in `api/railway.toml`)
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
- **Builder**: Railpack (configured in `iso-compliance-frontend/railway.toml`)
- **Start Command**: Defined in `iso-compliance-frontend/railway.toml`
  - `npx serve dist -s -p $PORT`

#### Required Environment Variables
```bash
# Node.js Version (Required - Railpack will use the version specified in package.json engines field)
# The project requires Node 24 as specified in package.json

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
   - Set `VITE_API_URL` to your backend Railway domain
   - Railpack will automatically use Node 24 from package.json engines field

4. **Deploy**
   - Both services will automatically deploy on push to `main` branch
   - Railway will use the `railway.toml` configurations in each directory

## Troubleshooting

### Frontend Build Fails with Node Version Error
**Error**: `Unsupported engine { required: { node: '^24.0.0' } }`

**Solution**:
1. Ensure `builder = "RAILPACK"` is set in `iso-compliance-frontend/railway.toml`
2. Railpack will automatically detect and use Node 24 from the `engines` field in package.json
3. Verify your package.json has `"engines": { "node": "^24.0.0" }`

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