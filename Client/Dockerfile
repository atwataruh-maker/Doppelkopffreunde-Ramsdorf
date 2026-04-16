## Stage 1: React-App bauen
FROM node:20-bookworm-slim AS builder

# VITE_API_URL leer lassen → nginx übernimmt das Proxy-Routing (/api → server)
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

## Stage 2: Statische Dateien per nginx ausliefern
FROM nginx:alpine AS production
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
