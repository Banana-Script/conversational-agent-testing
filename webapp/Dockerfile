# ============================================
# Stage 1: Build Frontend
# ============================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy package files
COPY frontend/package*.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY frontend/ ./

# Build
RUN npm run build

# ============================================
# Stage 2: Build Backend
# ============================================
FROM node:20-alpine AS backend-builder

WORKDIR /app/backend

# Copy package files
COPY backend/package*.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY backend/ ./

# Build TypeScript
RUN npm run build

# ============================================
# Stage 3: Production Image
# ============================================
FROM node:20-slim

# Install Claude Code CLI, SSH client, autossh, and netcat for tunnel verification
RUN apt-get update && \
    apt-get install -y openssh-client autossh netcat-openbsd git jq && \
    rm -rf /var/lib/apt/lists/* && \
    npm install -g @anthropic-ai/claude-code

# Create non-root user for running the app (required for Claude CLI)
RUN useradd -m -s /bin/bash appuser

# ============================================
# Ralph Installation from GitHub
# ============================================
RUN git clone https://github.com/frankbria/ralph-claude-code.git /tmp/ralph-install && \
    cd /tmp/ralph-install && \
    chmod +x install.sh && \
    HOME=/home/appuser ./install.sh && \
    rm -rf /tmp/ralph-install && \
    chown -R appuser:appuser /home/appuser/.ralph

# Copy custom ralph_loop.sh to overwrite the installed version
COPY ralph_loop.sh /home/appuser/.ralph/ralph_loop.sh
RUN chmod +x /home/appuser/.ralph/ralph_loop.sh && \
    chown appuser:appuser /home/appuser/.ralph/ralph_loop.sh

# Create SSH directory for appuser (key will be provided via env var)
RUN mkdir -p /home/appuser/.ssh && \
    chmod 700 /home/appuser/.ssh && \
    chown -R appuser:appuser /home/appuser/.ssh

# Create app directory
WORKDIR /app

# Copy entrypoint script
COPY docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

# Copy backend build and dependencies
COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=backend-builder /app/backend/node_modules ./node_modules
COPY --from=backend-builder /app/backend/package.json ./

# Copy frontend build (served as static files)
COPY --from=frontend-builder /app/frontend/dist ./public

# Copy shared resources (prompts and templates)
COPY shared ./shared

# Create temp directory for context files and set ownership
RUN mkdir -p /tmp/context && chown -R appuser:appuser /app /tmp/context

# ============================================
# Ralph Project Setup in Workdir
# ============================================
# Initialize Ralph project structure in /app
# Note: git config must use same HOME as setup.sh
RUN HOME=/home/appuser git config --global user.email "ralph@docker.local" && \
    HOME=/home/appuser git config --global user.name "Ralph Docker" && \
    HOME=/home/appuser /home/appuser/.ralph/setup.sh ralph-project && \
    cp -r ralph-project/PROMPT.md ralph-project/@fix_plan.md ralph-project/@AGENT.md /app/ && \
    cp -r ralph-project/specs ralph-project/docs ralph-project/logs ralph-project/src ralph-project/examples /app/ && \
    rm -rf ralph-project && \
    chown -R appuser:appuser /app

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3000
ENV HOME=/home/appuser

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Use entrypoint for SSH tunnel setup
ENTRYPOINT ["/app/docker-entrypoint.sh"]

# Start server
CMD ["node", "dist/index.js"]
