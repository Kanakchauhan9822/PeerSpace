FROM node:22-bookworm-slim AS frontend-build

WORKDIR /app/Frontend
COPY Frontend/package*.json ./
RUN npm ci

COPY Frontend/ ./
RUN npm run build




FROM node:22-bookworm-slim AS production

ENV NODE_ENV=production
WORKDIR /app/Backend

COPY Backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY Backend/src ./src
COPY Backend/server.js ./
COPY --from=frontend-build /app/Frontend/dist /app/Frontend/dist

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
