#!/bin/bash

# Build and Push Script for Test Generator
# Docker Hub username: fricred
# Builds for linux/amd64 platform (required for Render.com)

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DOCKER_USERNAME="fricred"
IMAGE_NAME="test-generator"
VERSION=${1:-latest}  # Default to 'latest' if no version provided

echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Test Generator - Docker Build & Push                 ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}✗ Error: Docker daemon is not running${NC}"
    echo "Please start Docker Desktop and try again."
    exit 1
fi

echo -e "${YELLOW}→ Docker username:${NC} $DOCKER_USERNAME"
echo -e "${YELLOW}→ Image name:${NC} $IMAGE_NAME"
echo -e "${YELLOW}→ Version tag:${NC} $VERSION"
echo ""

# Confirm before proceeding
read -p "Continue with build and push? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}✗ Build cancelled${NC}"
    exit 1
fi

# Build the image
echo -e "\n${GREEN}Step 1/3: Building Docker image...${NC}"
echo -e "${YELLOW}→ Building for linux/amd64 platform (required for Render)${NC}"
docker build --platform linux/amd64 -t ${DOCKER_USERNAME}/${IMAGE_NAME}:${VERSION} .

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Build successful${NC}"
else
    echo -e "${RED}✗ Build failed${NC}"
    exit 1
fi

# Tag as latest if version is not 'latest'
if [ "$VERSION" != "latest" ]; then
    echo -e "\n${GREEN}Step 2/3: Tagging as latest...${NC}"
    docker tag ${DOCKER_USERNAME}/${IMAGE_NAME}:${VERSION} ${DOCKER_USERNAME}/${IMAGE_NAME}:latest
    echo -e "${GREEN}✓ Tagged as latest${NC}"
else
    echo -e "\n${YELLOW}Skipping step 2/3 (already using 'latest' tag)${NC}"
fi

# Push to Docker Hub
echo -e "\n${GREEN}Step 3/3: Pushing to Docker Hub...${NC}"
echo -e "${YELLOW}→ Pushing ${DOCKER_USERNAME}/${IMAGE_NAME}:${VERSION}${NC}"
docker push ${DOCKER_USERNAME}/${IMAGE_NAME}:${VERSION}

if [ "$VERSION" != "latest" ]; then
    echo -e "${YELLOW}→ Pushing ${DOCKER_USERNAME}/${IMAGE_NAME}:latest${NC}"
    docker push ${DOCKER_USERNAME}/${IMAGE_NAME}:latest
fi

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✓ Build and push completed successfully!             ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${GREEN}Image available at:${NC}"
    echo -e "  • docker pull ${DOCKER_USERNAME}/${IMAGE_NAME}:${VERSION}"
    if [ "$VERSION" != "latest" ]; then
        echo -e "  • docker pull ${DOCKER_USERNAME}/${IMAGE_NAME}:latest"
    fi
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo -e "  1. Go to Render.com dashboard"
    echo -e "  2. Create new Web Service"
    echo -e "  3. Deploy from Docker image: ${DOCKER_USERNAME}/${IMAGE_NAME}:${VERSION}"
    echo -e "  4. Configure environment variables"
    echo ""
else
    echo -e "${RED}✗ Push failed${NC}"
    exit 1
fi
