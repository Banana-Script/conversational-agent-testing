#!/bin/bash
set -e

echo "[ENTRYPOINT] Starting Docker entrypoint script..."
echo "[ENTRYPOINT] Environment info:"
echo "  - USER: $(whoami)"
echo "  - HOME: $HOME"
echo "  - PWD: $(pwd)"

# Setup SSH key from environment variable
if [ -n "$SSH_PRIVATE_KEY" ]; then
    echo "[ENTRYPOINT] Setting up SSH private key from environment..."

    # Create .ssh directory if it doesn't exist
    mkdir -p $HOME/.ssh
    chmod 700 $HOME/.ssh

    # Write the key to file (handle both formats: with or without newlines)
    echo "$SSH_PRIVATE_KEY" | tr -d '\r' > $HOME/.ssh/id_rsa

    # Fix permissions
    chmod 600 $HOME/.ssh/id_rsa

    echo "[ENTRYPOINT] SSH key file created: $HOME/.ssh/id_rsa"
    echo "[ENTRYPOINT] SSH key permissions: $(ls -la $HOME/.ssh/id_rsa | awk '{print $1}')"

    # Create SSH config
    cat > $HOME/.ssh/config <<EOF
Host *
  StrictHostKeyChecking no
  UserKnownHostsFile /dev/null
EOF
    chmod 600 $HOME/.ssh/config

    echo "[ENTRYPOINT] ✅ SSH key configured successfully"
else
    echo "[ENTRYPOINT] ⚠️ Warning: SSH_PRIVATE_KEY not set. SSH tunnel will not work."
fi

# Start SSH tunnel in background
if [ -n "$SSH_HOST" ] && [ -f "$HOME/.ssh/id_rsa" ]; then
    echo "[ENTRYPOINT] Starting SSH tunnel..."
    echo "[ENTRYPOINT] Tunnel config:"
    echo "  - SSH_HOST: $SSH_HOST"
    echo "  - SSH_USER: $SSH_USER"
    echo "  - RDS_HOST: $RDS_HOST"
    echo "  - RDS_PORT: $RDS_PORT"
    echo "  - Local port: 3306"

    # Create tunnel: localhost:3306 -> RDS:3306
    echo "[ENTRYPOINT] Executing autossh command..."
    autossh -M 0 -f -N \
        -o "ServerAliveInterval=30" \
        -o "ServerAliveCountMax=3" \
        -L 3306:${RDS_HOST}:${RDS_PORT} \
        ${SSH_USER}@${SSH_HOST}

    # Wait for tunnel to be ready with verification
    echo "[ENTRYPOINT] Waiting for SSH tunnel to be ready..."
    echo "[ENTRYPOINT] Will check if port 3306 is listening (max wait: 30s)"
    MAX_WAIT=30
    WAITED=0
    while [ $WAITED -lt $MAX_WAIT ]; do
        if nc -z localhost 3306 2>/dev/null; then
            echo "[ENTRYPOINT] ✅ SSH tunnel established and verified (port 3306 is listening)"
            echo "[ENTRYPOINT] Tunnel became ready after ${WAITED}s"
            break
        fi
        sleep 1
        WAITED=$((WAITED + 1))
        if [ $((WAITED % 5)) -eq 0 ]; then
            echo "[ENTRYPOINT] Still waiting for tunnel... ($WAITED/$MAX_WAIT seconds)"
        fi
    done

    if [ $WAITED -ge $MAX_WAIT ]; then
        echo "[ENTRYPOINT] ❌ ERROR: SSH tunnel failed to become ready after $MAX_WAIT seconds"
        echo "[ENTRYPOINT] Debug info:"
        echo "  - SSH processes: $(ps aux | grep ssh | grep -v grep)"
        echo "  - Listening ports: $(netstat -tlnp 2>/dev/null | grep LISTEN || echo 'netstat not available')"
        exit 1
    fi
else
    echo "[ENTRYPOINT] ⚠️ Skipping SSH tunnel (SSH_HOST not set or SSH key not found)"
fi

echo "[ENTRYPOINT] ====================================="
echo "[ENTRYPOINT] Entrypoint completed successfully"
echo "[ENTRYPOINT] Executing main command: $@"
echo "[ENTRYPOINT] ====================================="

# Execute main command
exec "$@"
