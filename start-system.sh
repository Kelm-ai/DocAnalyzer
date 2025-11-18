#!/bin/bash

# ISO 14971 Compliance System Startup Script
# This script starts all components of the compliance evaluation system
# Override ports using environment variables before running, e.g.:
#   API_PORT=5005 FRONTEND_PORT=3001 ./start-system.sh

set -e  # Exit on any error

# Enable forward compatibility for Python 3.14+ with pydantic
export PYO3_USE_ABI3_FORWARD_COMPATIBILITY=1

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Allow overriding ports via environment variables
API_PORT=${API_PORT:-5001}
FRONTEND_PORT=${FRONTEND_PORT:-5173}
FRONTEND_DIR=${FRONTEND_DIR:-frontend}

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if a port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to wait for a service to be ready
wait_for_service() {
    local url=$1
    local service_name=$2
    local max_attempts=30
    local attempt=1

    print_status "Waiting for $service_name to be ready..."

    while [ $attempt -le $max_attempts ]; do
        # For Vite dev server, just check if port is listening
        if [[ "$service_name" == *"Frontend"* ]]; then
            local port=$(echo "$url" | sed 's/.*://' | sed 's/\/.*//')
            if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
                print_success "$service_name is ready!"
                return 0
            fi
        else
            if curl -f -s "$url" >/dev/null 2>&1; then
                print_success "$service_name is ready!"
                return 0
            fi
        fi

        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done

    print_error "$service_name failed to start within 60 seconds"
    return 1
}

# Function to cleanup background processes on exit
cleanup() {
    print_warning "Shutting down services..."
    
    # Kill background processes
    if [ ! -z "$API_PID" ]; then
        kill $API_PID 2>/dev/null || true
        print_status "API server stopped"
    fi
    
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
        print_status "Frontend server stopped"
    fi
    
    # Kill any remaining processes on our ports
    pkill -f "uvicorn.*app:app" 2>/dev/null || true
    pkill -f "vite.*--host" 2>/dev/null || true
    
    print_success "Cleanup completed"
    exit 0
}

# Set up trap for cleanup
trap cleanup SIGINT SIGTERM EXIT

echo "======================================================"
echo "🚀 ISO 14971 Compliance System Startup"
echo "======================================================"
echo

# Check if we're in the right directory
if [ ! -f "start-system.sh" ]; then
    print_error "Please run this script from the SC directory"
    exit 1
fi

# Check for required directories
print_status "Checking project structure..."

if [ ! -d "api" ]; then
    print_error "API directory not found"
    exit 1
fi

if [ ! -d "$FRONTEND_DIR" ]; then
    print_error "Frontend directory not found at $FRONTEND_DIR"
    exit 1
fi

if [ ! -d "scripts" ]; then
    print_error "Scripts directory not found"
    exit 1
fi

print_success "Project structure verified"

# Check for required environment files
print_status "Checking environment configuration..."

if [ ! -f ".env" ]; then
    print_error "Backend .env file not found at project root (.env)"
    print_warning "Please create .env in the project root with your OpenAI and Supabase credentials"
    print_warning "Example:"
    print_warning "  OPENAI_API_KEY=your_key_here"
    print_warning "  SUPABASE_URL=your_supabase_url"
    print_warning "  SUPABASE_ANON_KEY=your_supabase_key"
    exit 1
fi

if [ ! -f "api/.env" ]; then
    print_warning "API .env file not found, copying from project root"
    cp .env api/.env
fi

print_success "Environment configuration verified"

# Check for Python
print_status "Checking Python installation..."
if ! command -v python3 &> /dev/null; then
    print_error "Python 3 is required but not installed"
    exit 1
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2)
print_success "Python $PYTHON_VERSION found"

# Check for Node.js
print_status "Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    print_error "Node.js is required but not installed"
    exit 1
fi

NODE_VERSION=$(node --version)
print_success "Node.js $NODE_VERSION found"

# Check if ports are available
print_status "Checking port availability..."

if check_port "$API_PORT"; then
    print_error "Port $API_PORT is already in use (API server port)"
    print_warning "Please stop the service using port $API_PORT or change the API port"
    exit 1
fi

if check_port "$FRONTEND_PORT"; then
    print_error "Port $FRONTEND_PORT is already in use (Frontend server port)"
    print_warning "Please stop the service using port $FRONTEND_PORT or change the frontend port"
    exit 1
fi

print_success "Ports $API_PORT and $FRONTEND_PORT are available"

# Setup Python virtual environment for API
print_status "Setting up Python environment for API..."
cd api

if [ ! -d "venv" ]; then
    print_status "Creating Python virtual environment..."
    python3 -m venv venv
fi

print_status "Activating virtual environment..."
source venv/bin/activate

print_status "Upgrading pip..."
pip install --upgrade pip >/dev/null 2>&1

print_status "Installing Python dependencies..."
if ! pip install -r ../requirements.txt >/dev/null 2>&1; then
    print_error "Failed to install Python dependencies"
    print_status "Trying installation with verbose output..."
    pip install -r ../requirements.txt
    exit 1
fi

print_success "Python environment ready"

# Surface the OpenAI package version in use for easier debugging
print_status "Verifying OpenAI SDK version..."
python - <<'PY'
import openai, sys
print(f"Using openai=={openai.__version__} from {openai.__file__}")
PY

# Start API server
print_status "Starting API server on port $API_PORT..."
nohup uvicorn app:app --host 0.0.0.0 --port "$API_PORT" --reload > api.log 2>&1 &
API_PID=$!

cd ..

# Wait for API to be ready
wait_for_service "http://localhost:${API_PORT}/" "API server"

# Setup and start frontend
print_status "Setting up frontend..."
cd "$FRONTEND_DIR"

if [ ! -d "node_modules" ]; then
    print_status "Installing frontend dependencies..."
    npm install >/dev/null 2>&1
fi

print_success "Frontend dependencies ready"

print_status "Starting frontend development server on port $FRONTEND_PORT..."
nohup npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT" > frontend.log 2>&1 &
FRONTEND_PID=$!

cd ..

# Wait for frontend to be ready
wait_for_service "http://localhost:${FRONTEND_PORT}/" "Frontend server"

echo
echo "======================================================"
echo "🎉 System Successfully Started!"
echo "======================================================"
echo
echo -e "${GREEN}Frontend:${NC} http://localhost:${FRONTEND_PORT}"
echo -e "${GREEN}API:${NC}      http://localhost:${API_PORT}"
echo -e "${GREEN}API Docs:${NC} http://localhost:${API_PORT}/docs"
echo
echo "📋 Available Services:"
echo "  • Document Upload & Processing"
echo "  • Real-time Evaluation Status"
echo "  • Compliance Report Generation"
echo "  • ISO 14971 Requirements Database"
echo
echo "📁 Log files:"
echo "  • API: api/api.log"
echo "  • Frontend: ${FRONTEND_DIR}/frontend.log"
echo
echo "⚡ System Status:"
echo -e "  API Server: ${GREEN}Running${NC} (PID: $API_PID)"
echo -e "  Frontend Server: ${GREEN}Running${NC} (PID: $FRONTEND_PID)"
echo
echo "💡 To stop the system, press Ctrl+C or run:"
echo "   ./stop-system.sh"
echo
echo "🔗 Quick Links:"
echo "  • Upload Documents: http://localhost:${FRONTEND_PORT}/"
echo "  • View Evaluations: http://localhost:${FRONTEND_PORT}/evaluations" 
echo "  • API Documentation: http://localhost:${API_PORT}/docs"
echo "  • Simplified Upload: http://localhost:${API_PORT}/api/upload/simple"
echo
print_success "System is ready for ISO 14971 compliance evaluation!"

# Keep the script running and monitor services
print_status "Monitoring services... (Press Ctrl+C to stop)"

while true; do
    # Check if API is still running
    if ! kill -0 $API_PID 2>/dev/null; then
        print_error "API server has stopped unexpectedly"
        break
    fi
    
    # Check if Frontend is still running
    if ! kill -0 $FRONTEND_PID 2>/dev/null; then
        print_error "Frontend server has stopped unexpectedly"
        break
    fi
    
    sleep 5
done
