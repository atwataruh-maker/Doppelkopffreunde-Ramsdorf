FROM node:20-bookworm-slim

# Build-Tools für better-sqlite3 (native C++-Kompilierung)
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

# --build-from-source: ignoriert etwaig inkompatible Prebuilt-Binaries
# und kompiliert better-sqlite3 direkt gegen die installierten Systemheader
RUN npm ci --build-from-source

COPY . .
RUN npm run build

RUN mkdir -p /app/data

EXPOSE 3001

CMD ["node", "dist/index.js"]
