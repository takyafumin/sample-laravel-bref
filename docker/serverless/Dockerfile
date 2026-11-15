FROM node:26-alpine
RUN npm install --global osls@3 && npm cache clean --force
ENTRYPOINT ["serverless"]
