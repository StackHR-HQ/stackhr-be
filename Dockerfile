# Stage 1: Dependencies & Build
FROM node:20-slim AS builder

WORKDIR /app

# Install build tools required for native C++ modules (e.g. argon2) and OpenSSL for Prisma
RUN apt-get update && apt-get install -y openssl python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package manifests and Prisma schema
COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# Install all dependencies
RUN npm ci

# Copy TypeScript configs and application source code
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY src ./src/

# Generate Prisma Client & compile NestJS application
RUN npx prisma generate
RUN npm run build

# Stage 2: Runtime Production Image
FROM node:20-slim AS runner

WORKDIR /app

# Install OpenSSL required by Prisma query engine at runtime
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# Copy compiled node_modules (with pre-built argon2 binaries) from builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/dist ./dist

EXPOSE 3001

CMD ["node", "dist/src/main.js"]
