FROM node:20-slim

# Playwright için sistem bağımlılıkları
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Bağımlılıkları önce kopyala (cache için)
COPY package*.json ./
RUN npm ci --omit=dev

# Playwright — sistem Chromium'u kullan, indirme
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# Kaynak kodunu kopyala
COPY . .

# DB ve log klasörü
RUN mkdir -p /app/data && chown node:node /app/data

# Güvenlik: root olarak çalıştırma
USER node

EXPOSE 3000

CMD ["node", "server.js"]