FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --chown=node:node server.mjs runtime-config.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node site ./site
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node contracts ./contracts

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -q -O - http://127.0.0.1:3000/healthz >/dev/null || exit 1
CMD ["node", "server.mjs"]
