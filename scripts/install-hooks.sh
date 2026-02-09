#!/bin/bash

# Install Git hooks for CIA agent development
# This script sets up the pre-push hook to run 'make ci'

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[SETUP]${NC} $1"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Change to project root
cd "$(git rev-parse --show-toplevel)"

print_status "Installing Git hooks for CIA agent development..."

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    print_error "Not in a Git repository"
    exit 1
fi

# Create hooks directory if it doesn't exist
if [ ! -d ".git/hooks" ]; then
    mkdir -p .git/hooks
    print_status "Created .git/hooks directory"
fi

# Install pre-push hook
PRE_PUSH_HOOK=".git/hooks/pre-push"

cat > "$PRE_PUSH_HOOK" << 'EOF'
#!/bin/bash

# CIA Agent Pre-push Hook
# Runs 'make ci' to validate code quality before pushing to remote repository

set -e

echo "🔍 Running pre-push validation..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[CIA]${NC} $1"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Change to project root
cd "$(git rev-parse --show-toplevel)"

# Validate we're in the right directory and have required tools
if [ ! -f "package.json" ] || [ ! -d "packages/cli" ]; then
    print_error "Not in CIA agent project root directory"
    exit 1
fi

if [ ! -f "Makefile" ]; then
    print_error "Makefile not found - required for pre-push validation"
    exit 1
fi

if ! command -v make >/dev/null 2>&1; then
    print_error "make command not found - please install GNU make"
    exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
    print_error "bun command not found - please install Bun runtime"
    exit 1
fi

print_status "Running CI validation pipeline via 'make ci'..."
echo

# Run the complete CI pipeline
if ! make ci; then
    echo
    print_error "CI pipeline failed - push blocked"
    print_status "Fix the issues above and try pushing again"
    exit 1
fi

echo
print_success "All pre-push validations passed! ✨"
print_status "Ready to push to remote repository"
echo

exit 0
EOF

# Make the hook executable
chmod +x "$PRE_PUSH_HOOK"

print_success "Pre-push hook installed successfully"

# Test the hook
print_status "Testing pre-push hook..."
if "$PRE_PUSH_HOOK" > /dev/null 2>&1; then
    print_success "Pre-push hook test passed"
else
    print_warning "Pre-push hook test had issues (but hook is installed)"
fi

echo
print_success "Git hooks setup complete! 🎉"
echo
print_status "The pre-push hook will now run 'make ci' before every push"
print_status "This ensures code quality and prevents broken builds"
echo
print_status "To bypass the hook (not recommended): git push --no-verify"
echo