# ==========================================================================
# Dockerfile — IDE Agêntica SaaS
# ==========================================================================
FROM node:20-alpine

# Build tools necessários para pacotes nativos (better-sqlite3, bcryptjs)
RUN apk add --no-cache \
    git \
    python3 \
    py3-pip \
    make \
    g++ \
    curl \
    bash

WORKDIR /app

# Instala dependências primeiro (camada de cache separada)
COPY package*.json ./
RUN npm install --build-from-source

# Copia o código fonte
COPY . .

# Remove arquivos desnecessários na imagem
RUN rm -rf workspace/ workspaces/ data/ .env* *.log

# Pasta de dados (banco + chats) ficará em volume
RUN mkdir -p /app/data/chats

# Porta da IDE
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
