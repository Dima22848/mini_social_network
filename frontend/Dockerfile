FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
COPY .npmrc ./
RUN npm ci --registry=https://registry.npmjs.org/

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]
