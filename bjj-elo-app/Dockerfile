FROM node:22

WORKDIR /app
ENV NODE_ENV=production
ENV SIGNUPS_ENABLED=false
ENV DATA_DIR=/data

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "server/index.js"]
