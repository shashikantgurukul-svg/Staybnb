FROM node:22-alpine

WORKDIR /app
COPY package.json ./
COPY shared ./shared
COPY services ./services
RUN npm install --omit=dev
