FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY . .
RUN npx prisma generate

CMD ["sh", "-c", "npx prisma db push && node seed.js; node server.js"]
