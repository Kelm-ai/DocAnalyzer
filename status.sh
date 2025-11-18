#!/bin/bash

# ISO 14971 Compliance System Status Check
# This script checks the status of all system components

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${CYAN}$1${NC}"
}

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
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

# Function to check if a URL is responding
check_url() {
    local url=$1
    if curl -f -s "$url" >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to get process info
get_process_info() {
    local pattern=$1
    pgrep -f "$pattern" 2>/dev/null | head -1
}

echo "======================================================"
print_header "🔍 ISO 14971 Compliance System Status"
echo "======================================================"
echo

# System Information
print_header "📊 System Information"
echo "Date: $(date)"
echo "Host: $(hostname)"
echo "User: $(whoami)"
echo "Working Directory: $(pwd)"
echo

# Check Prerequisites
print_header "🔧 Prerequisites"

# Python
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version | cut -d' ' -f2)
    print_success "Python $PYTHON_VERSION"
else
    print_error "Python 3 not found"
fi

# Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_success "Node.js $NODE_VERSION"
else
    print_error "Node.js not found"
fi

# npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    print_success "npm $NPM_VERSION"
else
    print_error "npm not found"
fi

echo

# Project Structure
print_header "📁 Project Structure"

directories=("api" "frontend" "scripts" "PM")
for dir in "${directories[@]}"; do
    if [ -d "$dir" ]; then
        print_success "$dir directory exists"
    else
        print_error "$dir directory missing"
    fi
done

echo

# Environment Configuration
print_header "⚙️ Environment Configuration"

if [ -f "scripts/.env" ]; then
    print_success "Backend .env file exists"
    
    # Check for key environment variables
    if grep -q "AZURE_OPENAI_ENDPOINT" scripts/.env; then
        print_success "Azure OpenAI configuration found"
    else
        print_warning "Azure OpenAI configuration missing"
    fi
    
    if grep -q "SUPABASE_URL" scripts/.env; then
        print_success "Supabase configuration found"
    else
        print_warning "Supabase configuration missing"
    fi
    
    if grep -q "AZURE_SEARCH_ENDPOINT" scripts/.env; then
        print_success "Azure Search configuration found"
    else
        print_warning "Azure Search configuration missing"
    fi
else
    print_error "Backend .env file missing at scripts/.env"
fi

if [ -f "api/.env" ]; then
    print_success "API .env file exists"
else
    print_warning "API .env file missing"
fi

echo

# Dependencies
print_header "📦 Dependencies"

# Python dependencies
if [ -f "api/requirements.txt" ]; then
    print_success "API requirements.txt exists"
    
    if [ -d "api/venv" ]; then
        print_success "Python virtual environment exists"
    else
        print_warning "Python virtual environment not found"
    fi
else
    print_error "API requirements.txt missing"
fi

# Frontend dependencies
if [ -f "frontend/package.json" ]; then
    print_success "Frontend package.json exists"
    
    if [ -d "frontend/node_modules" ]; then
        print_success "Frontend dependencies installed"
    else
        print_warning "Frontend dependencies not installed (run: npm install)"
    fi
else
    print_error "Frontend package.json missing"
fi

echo

# Service Status
print_header "🚀 Service Status"

# Check API Server
api_pid=$(get_process_info "uvicorn.*app:app")
if [ ! -z "$api_pid" ]; then
    print_success "API Server running (PID: $api_pid)"
    
    if check_port 8001; then
        print_success "API Server listening on port 8001"
    else
        print_warning "API Server process found but port 8001 not listening"
    fi
    
    if check_url "http://localhost:8001/"; then
        print_success "API Server responding to requests"
    else
        print_warning "API Server not responding to HTTP requests"
    fi
else
    print_error "API Server not running"
    
    if check_port 8001; then
        port_pid=$(lsof -ti:8001 2>/dev/null)
        print_warning "Port 8001 in use by another process (PID: $port_pid)"
    else
        print_status "Port 8001 is available"
    fi
fi

# Check Frontend Server
frontend_pid=$(get_process_info "vite.*--host")
if [ ! -z "$frontend_pid" ]; then
    print_success "Frontend Server running (PID: $frontend_pid)"
    
    if check_port 5173; then
        print_success "Frontend Server listening on port 5173"
    else
        print_warning "Frontend Server process found but port 5173 not listening"
    fi
    
    if check_url "http://localhost:5173/"; then
        print_success "Frontend Server responding to requests"
    else
        print_warning "Frontend Server not responding to HTTP requests"
    fi
else
    print_error "Frontend Server not running"
    
    if check_port 5173; then
        port_pid=$(lsof -ti:5173 2>/dev/null)
        print_warning "Port 5173 in use by another process (PID: $port_pid)"
    else
        print_status "Port 5173 is available"
    fi
fi

echo

# Log Files
print_header "📋 Log Files"

if [ -f "api/api.log" ]; then
    log_size=$(du -h "api/api.log" | cut -f1)
    print_success "API log file exists ($log_size)"
    
    echo -e "${BLUE}Last 3 lines of API log:${NC}"
    tail -3 api/api.log | sed 's/^/  /'
else
    print_warning "API log file not found"
fi

if [ -f "frontend/frontend.log" ]; then
    log_size=$(du -h "frontend/frontend.log" | cut -f1)
    print_success "Frontend log file exists ($log_size)"
    
    echo -e "${BLUE}Last 3 lines of Frontend log:${NC}"
    tail -3 frontend/frontend.log | sed 's/^/  /'
else
    print_warning "Frontend log file not found"
fi

echo

# System URLs
print_header "🔗 System URLs"

if [ ! -z "$api_pid" ] && [ ! -z "$frontend_pid" ]; then
    echo -e "${GREEN}Frontend:${NC}     http://localhost:5173"
    echo -e "${GREEN}API:${NC}          http://localhost:8001"
    echo -e "${GREEN}API Docs:${NC}     http://localhost:8001/docs"
    echo -e "${GREEN}Upload:${NC}       http://localhost:5173/"
    echo -e "${GREEN}Evaluations:${NC}  http://localhost:5173/evaluations"
elif [ ! -z "$api_pid" ]; then
    echo -e "${YELLOW}API Only:${NC}     http://localhost:8001"
    echo -e "${YELLOW}API Docs:${NC}     http://localhost:8001/docs"
elif [ ! -z "$frontend_pid" ]; then
    echo -e "${YELLOW}Frontend Only:${NC} http://localhost:5173"
else
    print_error "No services are currently running"
    echo -e "${BLUE}To start the system:${NC} ./start-system.sh"
fi

echo

# Summary
print_header "📋 Summary"

services_running=0
if [ ! -z "$api_pid" ]; then
    ((services_running++))
fi
if [ ! -z "$frontend_pid" ]; then
    ((services_running++))
fi

if [ $services_running -eq 2 ]; then
    print_success "System fully operational ($services_running/2 services running)"
elif [ $services_running -eq 1 ]; then
    print_warning "System partially operational ($services_running/2 services running)"
else
    print_error "System not running ($services_running/2 services running)"
fi

echo
echo -e "${BLUE}Available commands:${NC}"
echo "  ./start-system.sh  - Start the complete system"
echo "  ./stop-system.sh   - Stop all system services"
echo "  ./status.sh        - Show this status information"
echo
