#!/bin/bash

# Verificar se o processo está rodando
if ! ps -ef | grep -i "node" &> /dev/null; then
  echo "Nenhuma processo rodando"
  exit 1
fi

# Executar o comando de forma desanexada
nohup npx ts-node server.ts > /dev/null 2>&1 &

# Informar o usuário que o servidor está rodando
echo "✅ Server rodando na porta 3001"
