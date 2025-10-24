FROM node:24-alpine AS build
WORKDIR /app

# Copy dependency manifests first to leverage Docker layer caching.
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the frontend source and produce the static build.
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app

# Install a lightweight static file server.
RUN npm install -g serve

# Copy the build artefacts from the previous stage.
COPY --from=build /app/dist ./dist

ENV PORT=3000
EXPOSE 3000

# Start the static file server; Railway will inject the PORT env var.
CMD ["serve", "-s", "dist", "-l", "${PORT:-3000}"]
