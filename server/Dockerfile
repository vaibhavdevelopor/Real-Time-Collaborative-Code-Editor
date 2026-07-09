# ─── Server Dockerfile ───
# Uses lightweight Node.js 20 Alpine Linux image for security and speed
FROM node:20-alpine

# Set working directory inside container
WORKDIR /app

# Copy package.json and package-lock.json first (leverages Docker cache layer)
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy all server source code into the container
COPY . .

# Expose port 5001 (where Express & Socket.IO run)
EXPOSE 5001

# Start the Node.js server
CMD ["npm", "start"]
