FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
ARG NEXT_PUBLIC_TERRITORY_TRANSPORT_KEY
ARG NEXT_PUBLIC_BETTER_AUTH_URL
ENV NEXT_PUBLIC_TERRITORY_TRANSPORT_KEY=$NEXT_PUBLIC_TERRITORY_TRANSPORT_KEY
ENV NEXT_PUBLIC_BETTER_AUTH_URL=$NEXT_PUBLIC_BETTER_AUTH_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN if [ -z "$NEXT_PUBLIC_TERRITORY_TRANSPORT_KEY" ]; then echo "Missing build arg NEXT_PUBLIC_TERRITORY_TRANSPORT_KEY"; exit 1; fi; npx prisma generate && npm run build -- --webpack

FROM node:20-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/seed-territories.local.json ./seed-territories.local.json
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/tsconfig.json ./tsconfig.json
EXPOSE 3101
CMD ["sh", "-c", "if [ -z \"$TERRITORY_TRANSPORT_KEY\" ] && [ -z \"$NEXT_PUBLIC_TERRITORY_TRANSPORT_KEY\" ]; then echo \"Missing TERRITORY_TRANSPORT_KEY or NEXT_PUBLIC_TERRITORY_TRANSPORT_KEY\"; exit 1; fi; if [ -n \"$TERRITORY_TRANSPORT_KEY\" ] && [ -n \"$NEXT_PUBLIC_TERRITORY_TRANSPORT_KEY\" ] && [ \"$TERRITORY_TRANSPORT_KEY\" != \"$NEXT_PUBLIC_TERRITORY_TRANSPORT_KEY\" ]; then echo \"Transport key mismatch: TERRITORY_TRANSPORT_KEY must equal NEXT_PUBLIC_TERRITORY_TRANSPORT_KEY\"; exit 1; fi; if [ -z \"$PASSWORD_HASH_ENCRYPTION_KEY\" ]; then echo \"Missing PASSWORD_HASH_ENCRYPTION_KEY\"; exit 1; fi; npx prisma db push && npm run db:seed && npm run start -- -H 0.0.0.0 -p 3101"]
