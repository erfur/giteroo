FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    git \
    zip \
    tar \
    gzip \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p /app/repositories /app/logs /app/data

ENV PORT=3000
ENV REPOSITORIES_DIR=/app/repositories
ENV LOGS_DIR=/app/logs
ENV DB_PATH=/app/data/giteroo.db

EXPOSE 3000

CMD ["npm", "start"]

