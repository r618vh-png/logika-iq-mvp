FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node .openai/ .openai/
COPY --chown=node:node src/ src/
COPY --chown=node:node scripts/ scripts/
COPY --chown=node:node drizzle/ drizzle/
RUN mkdir data dist && chown node:node data dist
USER node
ENV BIND_HOST=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["node", "scripts/local.mjs"]
