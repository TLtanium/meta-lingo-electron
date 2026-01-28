#!/bin/bash

# ===================================
# Meta-Lingo GitHub Push Script
# ===================================
# This script pushes the project to GitHub repository
# Repository: git@github.com:TLtanium/meta-lingo-electron.git
# ===================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Repository URL
REPO_URL="git@github.com:TLtanium/meta-lingo-electron.git"

echo ""
echo "========================================"
echo "  Meta-Lingo GitHub Push Script"
echo "========================================"
echo ""

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo -e "${RED}[ERROR] Git is not installed. Please install git first.${NC}"
    exit 1
fi

# Get current directory
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

echo -e "${BLUE}[INFO] Working directory: $PROJECT_DIR${NC}"

# Check if .git directory exists
if [ ! -d ".git" ]; then
    echo -e "${YELLOW}[INFO] Initializing git repository...${NC}"
    git init
    echo -e "${GREEN}[OK] Git repository initialized.${NC}"
fi

# Check if remote origin exists
if git remote | grep -q "origin"; then
    CURRENT_URL=$(git remote get-url origin)
    if [ "$CURRENT_URL" != "$REPO_URL" ]; then
        echo -e "${YELLOW}[INFO] Updating remote origin URL...${NC}"
        git remote set-url origin "$REPO_URL"
        echo -e "${GREEN}[OK] Remote URL updated to: $REPO_URL${NC}"
    else
        echo -e "${GREEN}[OK] Remote origin already set: $REPO_URL${NC}"
    fi
else
    echo -e "${YELLOW}[INFO] Adding remote origin...${NC}"
    git remote add origin "$REPO_URL"
    echo -e "${GREEN}[OK] Remote origin added: $REPO_URL${NC}"
fi

# Clean macOS resource fork files
echo ""
echo -e "${BLUE}[INFO] Cleaning macOS resource fork files...${NC}"
find . -name "._*" -delete 2>/dev/null || true
find . -name ".DS_Store" -delete 2>/dev/null || true
echo -e "${GREEN}[OK] Resource fork files cleaned.${NC}"

# Show git status
echo ""
echo -e "${BLUE}[INFO] Git status:${NC}"
git status --short

# Check if there are changes to commit
if [ -z "$(git status --porcelain)" ]; then
    echo ""
    echo -e "${YELLOW}[INFO] No changes to commit.${NC}"
else
    # Add all files
    echo ""
    echo -e "${BLUE}[INFO] Adding files to staging...${NC}"
    git add .
    
    # Get commit message
    echo ""
    read -p "Enter commit message (or press Enter for default): " COMMIT_MSG
    if [ -z "$COMMIT_MSG" ]; then
        COMMIT_MSG="Update: $(date '+%Y-%m-%d %H:%M:%S')"
    fi
    
    # Commit changes
    echo ""
    echo -e "${BLUE}[INFO] Committing changes...${NC}"
    git commit -m "$COMMIT_MSG"
    echo -e "${GREEN}[OK] Changes committed.${NC}"
fi

# Check current branch
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "main")
if [ -z "$CURRENT_BRANCH" ]; then
    CURRENT_BRANCH="main"
fi

echo ""
echo -e "${BLUE}[INFO] Current branch: $CURRENT_BRANCH${NC}"

# Push to remote
echo ""
echo -e "${BLUE}[INFO] Pushing to remote repository...${NC}"

# Check if this is the first push
if git ls-remote --exit-code --heads origin "$CURRENT_BRANCH" &>/dev/null; then
    # Branch exists on remote
    git push origin "$CURRENT_BRANCH"
else
    # First push, set upstream
    echo -e "${YELLOW}[INFO] Setting upstream branch...${NC}"
    git push -u origin "$CURRENT_BRANCH"
fi

echo ""
echo -e "${GREEN}========================================"
echo "  Push completed successfully!"
echo "========================================${NC}"
echo ""
echo -e "Repository: ${BLUE}https://github.com/TLtanium/meta-lingo-electron${NC}"
echo ""
