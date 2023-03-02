# First Stage
FROM node:18-bullseye-slim AS builder

WORKDIR /app

# Copy package.json and package-lock.json to the container
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code to the container
COPY . .

# Build the application
RUN NODE_ENV=production npm run build && npm prune --production

# Second Stage
FROM node:18-alpine

WORKDIR /app
EXPOSE 5000

# Copy the application files from the first stage
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build  ./build

# Start the application
CMD ["npm", "start"]