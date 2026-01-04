FROM node:20-slim

# Install OpenSSH client for tunnel
RUN apt-get update && apt-get install -y openssh-client autossh && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3000

CMD ["node", "dist/index.js"]
