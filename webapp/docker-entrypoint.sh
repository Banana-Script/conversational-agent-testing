#!/bin/bash
set -e

# Setup SSH key from environment variable
if [ -n "$SSH_PRIVATE_KEY" ]; then
    echo "Setting up SSH private key from environment..."

    # Create .ssh directory if it doesn't exist
    mkdir -p $HOME/.ssh
    chmod 700 $HOME/.ssh

    # Write the key to file (handle both formats: with or without newlines)
    echo "$SSH_PRIVATE_KEY" | tr -d '\r' > $HOME/.ssh/id_rsa

    # Fix permissions
    chmod 600 $HOME/.ssh/id_rsa

    # Create SSH config
    cat > $HOME/.ssh/config <<EOF
Host *
  StrictHostKeyChecking no
  UserKnownHostsFile /dev/null
EOF
    chmod 600 $HOME/.ssh/config

    echo "SSH key configured successfully"
else
    echo "Warning: SSH_PRIVATE_KEY not set. SSH tunnel will not work."
fi

# Start SSH tunnel in background
if [ -n "$SSH_HOST" ] && [ -f "$HOME/.ssh/id_rsa" ]; then
    echo "Starting SSH tunnel to $SSH_HOST..."

    # Create tunnel: localhost:3306 -> RDS:3306
    autossh -M 0 -f -N \
        -o "ServerAliveInterval=30" \
        -o "ServerAliveCountMax=3" \
        -L 3306:${RDS_HOST}:${RDS_PORT} \
        ${SSH_USER}@${SSH_HOST}

    # Wait for tunnel to be ready with verification
    echo "Waiting for SSH tunnel to be ready..."
    MAX_WAIT=30
    WAITED=0
    while [ $WAITED -lt $MAX_WAIT ]; do
        if nc -z localhost 3306 2>/dev/null; then
            echo "SSH tunnel established and verified (port 3306 is listening)"
            break
        fi
        sleep 1
        WAITED=$((WAITED + 1))
        if [ $((WAITED % 5)) -eq 0 ]; then
            echo "Still waiting for tunnel... ($WAITED/$MAX_WAIT seconds)"
        fi
    done

    if [ $WAITED -ge $MAX_WAIT ]; then
        echo "ERROR: SSH tunnel failed to become ready after $MAX_WAIT seconds"
        exit 1
    fi
fi

# Execute main command
exec "$@"
