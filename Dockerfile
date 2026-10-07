FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --chown=node:node src ./src
COPY --chown=node:node server.js ./server.js
USER node
EXPOSE 3000
CMD ["node", "server.js"]
