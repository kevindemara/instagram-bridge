FROM ghcr.io/puppeteer/puppeteer:latest

USER root
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy app source
COPY . .

# Environment variables
ENV PORT=3000
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
# Base image sets PUPPETEER_EXECUTABLE_PATH automatically


EXPOSE 3000

CMD ["node", "server.js"]
