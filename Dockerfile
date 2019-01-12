FROM node:8

COPY . /img
WORKDIR /img
RUN npm i
EXPOSE 9119
CMD node index.js
