#!/bin/bash

# ISO 14971 Compliance System Shutdown Script
# This script safely stops all system components

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

echo "======================================================"
echo "🛑 ISO 14971 Compliance System Shutdown"
echo "======================================================"
echo

print_status "Stopping system services..."

# Function to kill processes by pattern
kill_by_pattern() {
    local pattern=$1
    local service_name=$2
    
    local pids=$(pgrep -f "$pattern" 2>/dev/null || true)
    
    if [ ! -z "$pids" ]; then
        print_status "Stopping $service_name..."
        echo "$pids" | xargs kill -TERM 2>/dev/null || true
        
        # Wait a moment for graceful shutdown
        sleep 2
        
        # Force kill if still running
        local remaining_pids=$(pgrep -f "$pattern" 2>/dev/null || true)
        if [ ! -z "$remaining_pids" ]; then
            print_warning "Force killing $service_name..."
            echo "$remaining_pids" | xargs kill -KILL 2>/dev/null || true
        fi
        
        print_success "$service_name stopped"
    else
        print_status "$service_name was not running"
    fi
}

# Stop API server
kill_by_pattern "uvicorn.*app:app" "API Server"

# Stop frontend server  
kill_by_pattern "vite.*--host" "Frontend Server"

# Stop any Python processes related to our system
kill_by_pattern "python.*iso_compliance_pipeline" "Pipeline Processes"

# Check for any remaining processes on our ports
print_status "Checking for processes on system ports..."

api_port_pid=$(lsof -ti:5001 2>/dev/null || true)
if [ ! -z "$api_port_pid" ]; then
    print_warning "Killing process on port 5001 (PID: $api_port_pid)"
    kill -KILL $api_port_pid 2>/dev/null || true
fi

frontend_port_pid=$(lsof -ti:5173 2>/dev/null || true)
if [ ! -z "$frontend_port_pid" ]; then
    print_warning "Killing process on port 5173 (PID: $frontend_port_pid)"
    kill -KILL $frontend_port_pid 2>/dev/null || true
fi

# Clean up log files (optional)
print_status "Cleaning up log files..."

if [ -f "api/api.log" ]; then
    print_status "Archiving API log..."
    mv api/api.log "api/api-$(date +%Y%m%d-%H%M%S).log"
fi

if [ -f "frontend/frontend.log" ]; then
    print_status "Archiving frontend log..."
    mv frontend/frontend.log "frontend/frontend-$(date +%Y%m%d-%H%M%S).log"
fi

# Clean up any temporary files
print_status "Cleaning up temporary files..."

# Remove any .pyc files
find . -name "*.pyc" -delete 2>/dev/null || true

# Remove any __pycache__ directories
find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true

echo
print_success "System shutdown completed!"
echo
echo "📋 Summary:"
echo "  • API Server: Stopped"
echo "  • Frontend Server: Stopped" 
echo "  • Port 5001: Released"
echo "  • Port 5173: Released"
echo "  • Log files: Archived"
echo
echo "💡 To restart the system, run:"
echo "   ./start-system.sh"
echo
