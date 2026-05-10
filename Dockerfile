FROM node:22-slim AS build
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/
RUN npm run build
RUN npm prune --production

FROM node:22-slim
WORKDIR /app
COPY --from=build /app/dist/ ./dist/
COPY --from=build /app/node_modules/ ./node_modules/
EXPOSE 8080
CMD ["node", "dist/index.js"]
