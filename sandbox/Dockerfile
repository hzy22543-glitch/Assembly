# =====================================================
# ASM Sandbox - Secure Assembly Execution Environment
# Base: Debian Bookworm Slim (lightweight + good toolchain support)
# Tools: NASM, GCC (32-bit linking), GDB, Make
# =====================================================

FROM debian:bookworm-slim

# Avoid interactive prompts during install
ENV DEBIAN_FRONTEND=noninteractive

# Install assembly toolchain + 32-bit support + DOSBox
RUN apt-get update && apt-get install -y --no-install-recommends \
    nasm \
    gcc \
    gcc-multilib \
    libc6-dev-i386 \
    gdb \
    make \
    python3 \
    python3-pip \
    python3-venv \
    dosbox \
    && rm -rf /var/lib/apt/lists/*

# Create non-root sandbox user for code execution
RUN groupadd -r sandbox && useradd -r -g sandbox -m -s /bin/bash sandbox

# Create workspace directory
RUN mkdir -p /workspace /app && chown sandbox:sandbox /workspace

# Copy Python app
COPY requirements.txt /app/
RUN python3 -m venv /app/venv && \
    /app/venv/bin/pip install --no-cache-dir -r /app/requirements.txt

# Optional JWasm and WLink tools are mounted separately by Compose.
COPY *.py /app/
COPY include/ /app/include/

# Set working directory
WORKDIR /app

# Expose API port
EXPOSE 5000

# Run as non-root
USER sandbox

# Start the API server
CMD ["/app/venv/bin/python3", "/app/api_endpoint.py"]
