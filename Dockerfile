FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node cloud/dist ./cloud/dist
COPY --chown=node:node v21/lib ./v21/lib
COPY --chown=node:node v21/platform ./v21/platform
COPY --chown=node:node portable/start-cloud.cjs ./portable/start-cloud.cjs
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "portable/start-cloud.cjs"]
