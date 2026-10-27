# Dialed API. Runs the TypeScript directly with tsx (a runtime dependency).
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY migrations ./migrations
COPY src ./src
COPY tsconfig.json ./
USER node
EXPOSE 4020
# Migrations run on boot; background jobs (expiry, review, payouts) run in-process.
CMD ["node", "--import", "tsx", "src/http/main.ts"]
