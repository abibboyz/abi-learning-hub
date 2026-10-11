# pw-runner — runs learner Playwright tests for the hub. Internal-only (no host port).
# Official image: browsers + system deps for exactly this Playwright version (matches package.json pin).
FROM mcr.microsoft.com/playwright:v1.64.0-noble

WORKDIR /app
ENV NODE_ENV=production \
    PORT=8002 \
    PW_RUNS_DIR=/app/.runs \
    TRACKS_DIR=/app/tracks \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package.json package-lock.json ./
# Dev deps are needed at runtime: tsx runs the TypeScript server; @playwright/test is the pinned runner.
RUN npm ci --include=dev && npm cache clean --force

COPY tsconfig.json ./
COPY src ./src
RUN mkdir -p /app/.runs && chown -R pwuser:pwuser /app/.runs

# Never run learner code as root.
USER pwuser
EXPOSE 8002
HEALTHCHECK --interval=10s --timeout=3s --retries=8 --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:8002/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npx", "tsx", "src/server.ts"]
