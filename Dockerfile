FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy built files
COPY dist/ ./dist/

# Expose ports
EXPOSE 3000 3001

# Run the server
CMD ["node", "dist/index.js"]
