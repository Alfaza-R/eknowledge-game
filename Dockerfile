# Dockerfile — image buat Fly.io
FROM node:20-slim

WORKDIR /app

# Install deps dulu (biar layer cache kepakai)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy sisa source
COPY . .

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
