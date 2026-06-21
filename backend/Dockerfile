# node:20-alpine is NOT used here intentionally: @tensorflow/tfjs-node ships
# prebuilt native bindings compiled against glibc, and Alpine uses musl libc.
# That combination fails to load at runtime ("Error: invalid ELF header" or
# similar). node:20-slim (Debian) avoids this entirely.
FROM node:20-slim
WORKDIR /app

# canvas (used by face-api.js) needs these native libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libcairo2-dev \
    libjpeg-dev \
    libpango1.0-dev \
    libgif-dev \
    librsvg2-dev \
    python3 \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN npx prisma generate

# Download face recognition model weights once at build time so the
# container works fully offline at runtime (important for stations
# with unreliable connectivity).
RUN node scripts/downloadModels.js

EXPOSE 4000
CMD ["node", "server.js"]
