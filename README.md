# Agente IA Local - Plataforma IDE & Chatbot

Este projeto é uma plataforma local completa de desenvolvimento (IDE) embutida com um agente de Inteligência Artificial avançado. Ele permite gerenciar projetos em contêineres Docker, rodar comandos, criar arquivos e bater papo com um Agente IA que possui acesso ao seu ambiente de trabalho através do Model Context Protocol (MCP).

## Funcionalidades Principais
- **Chatbot Integrado:** Converse com a IA (usando Llama ou outra LLM) diretamente pela interface. A IA pode ler e escrever arquivos no seu workspace usando MCP.
- **Gerenciador de Workspaces (IDE):** Interface web para visualizar arquivos, terminais e código, tudo rodando localmente.
- **Servidores MCP (Model Context Protocol):** Integração com Sistema de Arquivos, PostgreSQL, Navegador Puppeteer e GitHub.
- **Painel Admin:** Gerenciamento de usuários e planos de assinatura (starter, pro, unlimited).
- **Projetos via Docker:** Permite isolar os ambientes de desenvolvimento.
- **Autenticação:** Sistema próprio usando JWT e SQLite embutido (ou opcionalmente Google OAuth).

## Como Rodar o Projeto

1. Certifique-se de ter o **Node.js** e o **Docker** instalados.
2. Clone o repositório ou faça o download da pasta.
3. Abra o terminal na raiz do projeto e instale as dependências:
   ```bash
   npm install
   ```
4. Inicie o servidor:
   ```bash
   npm run dev
   # ou
   node server.js
   ```

O painel e a IDE estarão disponíveis no navegador, tipicamente em `http://localhost:3000`.

## Usuários de Teste Padrão

Para não esquecer, a plataforma gera automaticamente um usuário administrador na primeira vez que o banco de dados é criado (via `db/database.js`).

**Acesso Admin:**
- **Email:** `admin@local.dev`
- **Senha:** `admin123`

> **Nota:** Com esse usuário você pode acessar o Painel Admin da plataforma, criar novos usuários, mudar assinaturas e ver as estatísticas.

## Notas Adicionais
- As pastas `workspace/` e `workspaces/` armazenam o código gerado em tempo de execução. Elas são ignoradas no Git (ou pelo menos seus metadados `.git` foram removidos para evitar erros de submódulo).
- O banco de dados local fica salvo em `data/ide.db` (SQLite).
- A configuração da IA, chaves de API e variáveis de ambiente devem ser configuradas no arquivo `.env` (use o `.env.example` como base).
