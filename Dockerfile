FROM node:8

COPY --chown=node . /img
USER node
WORKDIR /img
RUN npm i
EXPOSE 9119
CMD node index.js
