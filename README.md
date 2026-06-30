# Agente IA Local - Plataforma IDE & Chatbot

Este projeto é uma plataforma local completa de desenvolvimento (IDE) embutida com um agente de Inteligência Artificial avançado. Ele permite gerenciar projetos em contêineres Docker, rodar comandos, criar arquivos e bater papo com um Agente IA que possui acesso ao seu ambiente de trabalho através do Model Context Protocol (MCP).

## Funcionalidades Principais
- **Chatbot Integrado:** Converse com a IA (usando Llama ou outra LLM) diretamente pela interface. A IA pode ler e escrever arquivos no seu workspace usando MCP.
- **Gerenciador de Workspaces (IDE):** Interface web para visualizar arquivos, terminais e código, tudo rodando localmente.
- **Servidores MCP (Model Context Protocol):** Integração com Sistema de Arquivos, PostgreSQL, Navegador Puppeteer e GitHub.
- **Painel Admin:** Gerenciamento de usuários e planos de assinatura (starter, pro, unlimited).
- **Projetos via Docker:** Permite isolar os ambientes de desenvolvimento.
- **Autenticação:** Sistema próprio usando JWT e SQLite embutido (ou opcionalmente Google OAuth).

## 🔄 Fluxo do Super-Agente (Pipeline)

O agente executa um pipeline de engenharia completo e estruturado:

```
Usuário → 📋 Prompt/Planejamento → ✋ Aprovação → ⚙️ Execução →
🔨 Build → (corrigir → Build) → 🧪 Testes → (corrigir → Testes) →
▶️ Executar → ✅ Validar → 🔍 Autoavaliação → 🎁 Entregar
```

- **Planejamento**: o agente escreve um `plano.md` detalhado.
- **Aprovação**: com o "Modo Planejamento" ligado, o agente PARA e espera você responder `aprovado` no chat antes de executar.
- **Build/Testes em loop**: se o build ou os testes falham, o agente lê o erro, corrige e tenta de novo até passar.
- **Validar**: confirma que o app realmente sobe e responde.
- **Autoavaliação**: o agente revisa o próprio trabalho antes de entregar.

A IDE mostra um **tracker visual** das fases em tempo real durante a execução.

## Como Rodar o Projeto

> **Importante (Windows):** este projeto usa `better-sqlite3`, um módulo nativo que precisa
> compilar contra uma versão **estável (LTS)** do Node. Versões muito novas do Node (ex: v25)
> não têm binário pré-compilado. Por isso o projeto traz um **Node 22 LTS portátil** em `.node-lts/`
> e um `start.bat` que o utiliza automaticamente.

### Opção A — Recomendada (usa o Node LTS local)
```bat
start.bat
```

### Opção B — Manual
1. Tenha o **Node.js** instalado (de preferência LTS v20/v22).
2. Instale as dependências:
   ```bash
   npm install
   ```
   Se `better-sqlite3` falhar ao compilar, garanta que você tem o **Visual Studio Build Tools
   (workload "Desktop development with C++")** e o **Python 3.x**, depois rode:
   ```bash
   npm rebuild better-sqlite3
   ```
3. Inicie o servidor:
   ```bash
   node server.js
   ```

O painel e a IDE estarão disponíveis em `http://localhost:3000`.

### Pré-requisito: Ollama
O agente usa o **Ollama** como backend de IA. Instale (https://ollama.com), rode um modelo
(ex: `ollama run qwen2.5:7b`) e ajuste `OLLAMA_URL` no `.env` se o Ollama estiver em outra máquina.

## Usuários de Teste Padrão

Para não esquecer, a plataforma gera automaticamente um usuário administrador na primeira vez que o banco de dados é criado (via `db/database.js`).

**Acesso Admin:**
- **Email:** `admin@local.dev`
- **Senha:** `admin123`

> **Nota:** Com esse usuário você pode acessar o Painel Admin da plataforma, criar novos usuários, mudar assinaturas e ver as estatísticas.

## 🔒 Segurança

- **Isolamento de workspace**: cada usuário só acessa sua própria pasta. Tentativas de
  "escapar" (`../`, paths absolutos, diretórios irmãos) são bloqueadas no servidor e no agente.
- **Comandos destrutivos bloqueados**: `rm -rf /`, `shutdown`, `format`, `curl | bash`, etc.
  são recusados mesmo após a aprovação do plano.
- **Gate de aprovação real**: em modo planejamento, o agente fica **impedido pelo servidor**
  de criar arquivos/rodar comandos até o usuário responder "aprovado" — não depende do modelo.
- **JWT secret automático**: se não houver `JWT_SECRET` no `.env`, um segredo aleatório forte
  é gerado e salvo em `data/.jwt-secret`.
- **Bind local por padrão**: o servidor escuta em `127.0.0.1`. Para expor na rede, defina
  `BIND_HOST=0.0.0.0` no `.env` — ciente de que `run_command` executa no host.

## Notas Adicionais
- As pastas `workspace/` e `workspaces/` armazenam o código gerado em tempo de execução. Elas são ignoradas no Git (ou pelo menos seus metadados `.git` foram removidos para evitar erros de submódulo).
- O banco de dados local fica salvo em `data/ide.db` (SQLite).
- A configuração da IA, chaves de API e variáveis de ambiente devem ser configuradas no arquivo `.env` (use o `.env.example` como base).
