FROM node:current-alpine
RUN npm install --global osls@3 && npm cache clean --force
ENTRYPOINT ["serverless"]
