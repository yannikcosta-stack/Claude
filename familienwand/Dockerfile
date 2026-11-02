# Familienwand – ein kleines Image ohne npm-Abhängigkeiten (läuft auf x86 und ARM, z. B. Synology, QNAP, Raspberry Pi)
FROM node:22-alpine
ENV NODE_ENV=production DATA_DIR=/data PORT=8080 TZ=Europe/Berlin
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=5s --start-period=10s CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "server/docker-start.js"]
