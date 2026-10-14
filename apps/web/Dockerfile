# --- build: compile the TypeScript/React app to static files -----------------
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The build identifier shown in the app (CI passes sha-<commit>).
ARG VERSION=dev
RUN VERSION=${VERSION} npm run build

# --- run: nginx serves the files and forwards /api/ to the API ---------------
FROM nginx:stable-alpine
# The official image renders /etc/nginx/templates/*.template at start-up,
# substituting the environment variables that are set (12-factor: config via env).
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
ENV API_UPSTREAM=http://api:8080
EXPOSE 80
