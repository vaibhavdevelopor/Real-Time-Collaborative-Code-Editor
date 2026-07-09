# ─── Stage 1: Build the Vite React application ───
FROM node:20-alpine AS build

WORKDIR /app

# Copy package dependencies and install
COPY package*.json ./
RUN npm ci

# Copy client code and build the production bundle
COPY . .
# Set default server URL during build (can be overridden)
ARG VITE_SERVER_URL=http://localhost:5001
ENV VITE_SERVER_URL=$VITE_SERVER_URL
RUN npm run build

# ─── Stage 2: Serve using lightweight Nginx web server ───
FROM nginx:alpine

# Copy compiled static files from the build stage to Nginx web root
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration for single-page app routing (prevents 404 on refresh)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
