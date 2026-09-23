FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
# Install production deps only
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY monitor/dashboard.html ./monitor/dashboard.html
COPY data ./data

# P2/Issue #19 FIX: Run as non-root user for security
USER node
EXPOSE 3001

# P2/Issue #19 FIX: Container-level health check
# Uses liveness endpoint — lightweight check (no version/topology leakage)
# start_period allows MongoDB connection to be established before health is checked
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=60s \
  CMD node -e "\
    const http = require('http'); \
    const req = http.get('http://localhost:3001/api/health', (res) => { \
      process.exit(res.statusCode === 200 ? 0 : 1); \
    }); \
    req.on('error', () => process.exit(1)); \
    req.setTimeout(8000, () => { req.destroy(); process.exit(1); }); \
  "

# P2/Issue #19 FIX: Use node directly (not npm start) for proper SIGTERM propagation
# The app handles SIGTERM for graceful shutdown (drains connections, closes DB/Redis)
CMD ["node", "dist-server/index.js"]
