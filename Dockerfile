# Use the exact version of Bun on Alpine Linux for reproducibility and footprint
FROM oven/bun:1.3.14-alpine

# Set working directory inside the container
WORKDIR /app

# Copy package configuration
COPY package.json ./

# Install dependencies (pins our type definitions/environment)
RUN bun install

# Copy the rest of the application files
COPY . .

# Expose port 3000
EXPOSE 3000

# Set environment variables for production binding
ENV PORT=3000
ENV HOST=0.0.0.0
ENV NODE_ENV=production

# Start the application
CMD ["bun", "run", "src/server.ts"]
