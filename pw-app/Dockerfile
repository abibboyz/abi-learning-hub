# App under test for the Playwright track. Internal-only (no host port).
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=4000
COPY package.json ./
COPY src ./src
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
