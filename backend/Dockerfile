FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache openssl bash

COPY package*.json ./
COPY .npmrc ./
RUN npm ci --registry=https://registry.npmjs.org/

COPY . .
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 4000

CMD ["./docker-entrypoint.sh"]
