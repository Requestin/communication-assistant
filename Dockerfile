FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3010
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm install prisma tsx
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/lib/seed-users.ts ./src/lib/seed-users.ts
RUN npx prisma generate
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 3010
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "start"]
