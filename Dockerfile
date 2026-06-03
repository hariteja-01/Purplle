FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

# Install dependencies including native build tools for better-sqlite3
RUN apk add --no-cache python3 make g++ && \
    npm ci && \
    apk del python3 make g++

COPY . .

# Initialize the database during build
RUN npm run db:setup

RUN npm run build

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["npm", "start"]
