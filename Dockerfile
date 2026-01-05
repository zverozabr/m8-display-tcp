# M8 Display Server - Docker Image
# Multi-stage build for smaller image

FROM node:20-slim AS builder

WORKDIR /app

# Install build dependencies for serialport
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    libudev-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for build)
RUN npm ci

# Copy source
COPY src ./src
COPY tsconfig.json ./

# ---

FROM node:20-slim AS runner

WORKDIR /app

# Install runtime dependencies for serialport, USB, and ALSA audio
RUN apt-get update && apt-get install -y \
    libudev-dev \
    libusb-1.0-0 \
    udev \
    alsa-utils \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Copy node_modules and source from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tsconfig.json ./

# Expose ports
# HTTP/WebSocket server
EXPOSE 8080
# TCP proxy for remote m8c clients
EXPOSE 3333

# Environment variables with defaults
ENV M8_HTTP_PORT=8080
ENV M8_TCP_PORT=3333
ENV M8_SERIAL_PORT=""
ENV M8_LOG_LEVEL=info

# Run server with tsx
CMD ["npx", "tsx", "src/index.ts"]
