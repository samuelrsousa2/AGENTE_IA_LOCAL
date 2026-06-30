// ==========================================================================
// Agent Engine — IDE Agêntica com Ollama — Modo Autônomo Máximo
// ==========================================================================
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { mcpManager } = require('./mcp-manager');

const MAX_ITERATIONS = 30;          // Mais iterações = mais autonomia
const COMMAND_TIMEOUT = 120000;     // 2 min para npm install, compilações etc.
const BACKGROUND_TIMEOUT = 8000;    // 8s para servidores em background

// ==========================================================================
// Definição das Ferramentas — Conjunto Completo para Autonomia Total
// ==========================================================================
const TOOLS_DEFINITION = [
  {
    type: 'function',
    function: {
      name: 'create_file',
      description: 'Create or overwrite a file with content. Use for ANY file type: .ts, .js, .html, .css, .json, .py, .sql, .md, .env, Dockerfile, etc.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace (e.g. "src/index.ts", "package.json")' },
          content: { type: 'string', description: 'The COMPLETE file content. Never leave placeholders.' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read an existing file. ALWAYS use this before editing.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Edit a file by replacing a specific text. Use read_file first to get exact text.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace' },
          old_text: { type: 'string', description: 'The exact text to find and replace (must match exactly)' },
          new_text: { type: 'string', description: 'The replacement text' }
        },
        required: ['path', 'old_text', 'new_text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Execute a shell command synchronously and get output. Use for: npm install, tsc, node, python, git, curl, ls, cat, etc. For long-running servers, use run_background instead.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to run (e.g. "npm install", "npx tsc", "node dist/index.js")' },
          timeout_seconds: { type: 'number', description: 'Optional timeout in seconds (default 120)' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_background',
      description: 'Start a long-running server/process in background and get the URL. Use for: node server.js, ts-node app.ts, python app.py, npm run dev. Returns the port/URL.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command to run in background (e.g. "node server.js", "ts-node src/index.ts")' },
          port: { type: 'number', description: 'Port the server listens on (e.g. 3001, 4000, 8000). Use the port requested by the user, or 3001 by default.' },
          wait_seconds: { type: 'number', description: 'Seconds to wait for server to start (default 3)' }
        },
        required: ['command', 'port']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List all files in a directory. ALWAYS call this first to understand the workspace.',
      parameters: {
        type: 'object',
        properties: {
          directory: { type: 'string', description: 'Directory to list (use "." for workspace root)' }
        },
        required: ['directory']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete a file or directory from the workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File or directory path to delete' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search text across all files. Use to find bugs, check imports, understand code.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Text to search for' },
          directory: { type: 'string', description: 'Directory to search (use "." for all)' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'zip_project',
      description: 'Create a downloadable ZIP of the workspace. Use when user asks to download the project.',
      parameters: {
        type: 'object',
        properties: {
          folder: { type: 'string', description: 'Folder to zip. Use "." for entire workspace.' },
          name: { type: 'string', description: 'ZIP file name without extension' }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_mcp_tools',
      description: 'List all available MCP (Model Context Protocol) tools from connected external servers (databases, APIs, browsers, etc.). Call this first to discover what MCP tools are available.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mcp_call',
      description: 'Call a tool from a connected MCP server. Use list_mcp_tools first to discover available tools and their parameters.',
      parameters: {
        type: 'object',
        properties: {
          server: { type: 'string', description: 'MCP server name (e.g. "postgres", "browser", "github")' },
          tool: { type: 'string', description: 'Tool name from that server' },
          arguments: { type: 'object', description: 'Tool-specific arguments as an object' }
        },
        required: ['server', 'tool']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the internet for information. Returns a list of results with titles, URLs and snippets. Use this to find documentation, tutorials, API references, package info, or any external knowledge.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query (e.g. "express typescript setup tutorial")' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_read',
      description: 'Read the text content of a web page URL. Use to read documentation pages, API references, README files, etc.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Full URL to read (e.g. "https://expressjs.com/en/starter/installing.html")' }
        },
        required: ['url']
      }
    }
  }
];

// ==========================================================================
// SUPER-AGENT PIPELINE — Fases do fluxo de trabalho
// ==========================================================================
// Fluxo: Prompt → Planejamento → Aprovação do usuário → Execução →
//        Build → Corrigir → Build → Testes → Corrigir → Testes →
//        Executar → Validar → Autoavaliação → Entregar
const PIPELINE_PHASES = [
  { id: 'planning',   label: '📋 Planejamento',   emoji: '📋' },
  { id: 'approval',   label: '✋ Aguardando aprovação', emoji: '✋' },
  { id: 'execution',  label: '⚙️ Execução',        emoji: '⚙️' },
  { id: 'build',      label: '🔨 Build',           emoji: '🔨' },
  { id: 'test',       label: '🧪 Testes',          emoji: '🧪' },
  { id: 'run',        label: '▶️ Executar',         emoji: '▶️' },
  { id: 'validate',   label: '✅ Validar',          emoji: '✅' },
  { id: 'selfreview', label: '🔍 Autoavaliação',   emoji: '🔍' },
  { id: 'deliver',    label: '🎁 Entregar',         emoji: '🎁' }
];

function emitPhase(socket, phaseId, detail = '') {
  const phase = PIPELINE_PHASES.find(p => p.id === phaseId);
  if (!phase) return;
  socket.emit('agent-phase', { phase: phaseId, label: phase.label, emoji: phase.emoji, detail });
}

// ==========================================================================
// System Prompt — Máxima Autonomia + Pipeline de Super-Agente
// ==========================================================================
const AGENT_SYSTEM_PROMPT = `You are an elite autonomous software engineer AI ("Super Agente"). You work COMPLETELY INDEPENDENTLY — you plan, implement, build, test, and fix code following a STRICT engineering pipeline.

## 🔄 SUPER-AGENT PIPELINE — FOLLOW THIS EXACT ORDER EVERY TIME
You operate as a structured pipeline. Announce each phase before doing it, prefixed with its emoji:

1. 📋 PLANEJAMENTO — Analyze the request, survey the workspace (list_files), and write a clear plan into "plano.md" using create_file.
2. ✋ APROVAÇÃO — Stop and ask the user to approve the plan (ONLY when planning mode is on). If planning mode is off, proceed automatically.
3. ⚙️ EXECUÇÃO — Create ALL source files, configs, and a test file. Install dependencies.
4. 🔨 BUILD — Compile/build the project (npm install, npx tsc, etc.). If it FAILS → fix the error → BUILD AGAIN. Repeat until the build is clean (max 3 attempts per error).
5. 🧪 TESTES — Run your automated test file. If tests FAIL → read the error → fix the code → run TESTES AGAIN. Repeat until all tests pass (exit code 0).
6. ▶️ EXECUTAR — Start the app/server with run_background and capture the URL.
7. ✅ VALIDAR — Verify the running app actually responds (e.g. fetch the health endpoint / hit the API). Confirm there are no runtime errors.
8. 🔍 AUTOAVALIAÇÃO — Critically review your own work: did you meet every requirement? List what works and any limitations. If you find a gap, go back and fix it.
9. 🎁 ENTREGAR — Give the final summary: what was built, how to run it, the URL, and the test results.

CRITICAL: Never skip BUILD or TESTES. Never claim "done" until the app builds, all tests pass, AND it runs and responds. The loop "Build → Corrigir → Build" and "Testes → Corrigir → Testes" is MANDATORY — keep iterating until green.

## CORE PRINCIPLES — NEVER BREAK THESE

### 1. ALWAYS ACT — NEVER ASK
- DO NOT ask "should I create X?" — just create it
- DO NOT ask "can I run npm install?" — just run it  
- DO NOT say "you can do X" — DO IT YOURSELF
- DO NOT show code examples without saving them as files
- If something is unclear, make a reasonable assumption and proceed

### 1.5. FILE AND TOOL ACCESS
- You DO have access to the user's local workspace.
- NEVER say "I don't have access to this file".
- ALWAYS use the \`read_file\` tool to read files instead of asking the user to provide them.
- ALWAYS use the \`list_files\` tool to explore the directory structure.
- CRITICAL: If you output code in markdown blocks instead of using tools, you MUST put the exact file path as a comment on the VERY FIRST LINE of the code block. (e.g. \`// src/server.js\` or \`<!-- public/login.html -->\` or \`# setup.sh\`).

### 2. AUTONOMOUS WORKFLOW — FOLLOW THE PIPELINE EVERY TIME
1. 📋 list_files(".") — survey the workspace, then write the plan to plano.md
2. ✋ If planning mode is ON: stop and wait for the user to approve. If OFF: continue.
3. ⚙️ Execute: create ALL files (including source files and a test script), install ALL dependencies
4. 🔨 Build: compile/build. On failure → fix → build again (loop until clean)
5. 🧪 Test: run your automated test script (test.js / test.ts) and verify exit code 0. On failure → fix → test again (loop until green)
6. ▶️ Run: start the server/app in the background with run_background
7. ✅ Validate: confirm the running app responds (fetch endpoint / call API), no runtime errors
8. 🔍 Self-review: confirm every requirement is met; fix any gap you find
9. 🎁 Deliver: only message "done" when build is clean, ALL tests pass, AND the app runs and responds

### 3. COMPLETE PROJECTS — NO HALF-MEASURES
- Every project needs: package.json → npm install → all source files → tested and running
- TypeScript projects: ALWAYS compile your code to JavaScript using tsc to generate dist/index.js or server.js, and test using node on the compiled file. Do not rely solely on ts-node.
- Node.js servers: always start them with run_background and provide the URL
- Frontend: always create complete HTML with CSS (dark theme, modern design)
- Databases: always create tables on startup, add sample data for demos

### 4. ERROR RECOVERY — AUTO-FIX EVERYTHING
- If npm install fails → try alternative package names
- If TypeScript compile fails → read error, fix types, recompile
- If port is in use → try next port (3001 → 3002 → 3003)
- If module not found → install it immediately
- NEVER give up on the first error — try at least 3 times

### 5. TYPESCRIPT PROJECTS — COMPLETE SETUP
\`\`\`json
// package.json for TypeScript
{
  "name": "project-name",
  "version": "1.0.0",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "node dist/index.js",
    "test": "node test.js"
  },
  "dependencies": { "express": "^4.18.0" },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0",
    "@types/express": "^4.17.0"
  }
}
\`\`\`

\`\`\`json
// tsconfig.json — always create this
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
\`\`\`

### 6. RUNNING SERVERS — USE run_background
For TypeScript/Node.js web servers:
- Install deps: run_command("npm install")
- Compile code: run_command("npx tsc")
- Start server: run_background("node dist/index.js", port=3001)
- Tell the user: "✅ Server running at http://localhost:3001"

### 7. SQLITE DATABASES
\`\`\`typescript
import Database from 'better-sqlite3';
const db = new Database('./data.db');
db.exec(\`CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)\`);
\`\`\`

### 8. COMPLETE FULL-STACK APP STRUCTURE
When asked for a complete app (any tech), create:
- package.json + tsconfig.json (if TypeScript)
- src/index.ts or server.js (main entry)
- src/database.ts (if using DB)
- src/routes/*.ts (API routes)
- public/index.html (frontend UI — beautiful dark design)
- public/style.css (modern CSS)
- public/app.js (frontend JavaScript)
- .env (PORT, DB_PATH)
- README.md (how to run + API docs)

### 9. STYLE GUIDE — ALWAYS BEAUTIFUL
- Dark theme with gradient backgrounds (#0f0f13, #1e1e2e)
- Accent color: purple (#7c3aed) or cyan (#06b6d4)
- Modern typography: Inter or system-ui
- Responsive with flexbox/grid
- Smooth hover animations

### 10. MANDATORY AUTOMATED TESTING & VERIFICATION
- For every feature, backend API, or webpage you build, you MUST write an automated test file (e.g., test.js or test.ts) that verifies the core functionality.
- If it's a signup or login page, write a script (using simple HTTP requests or simulating submissions) to verify that user registration works, validation works, and data is correctly saved.
- Example test script (test.js):
  \`\`\`javascript
  const assert = require('assert');
  async function runTests() {
    console.log("🤖 Running automated tests...");
    try {
      // 1. Test that the API is up and accepts registrations
      const res = await fetch('http://localhost:3001/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', password: 'password123', name: 'Tester' })
      });
      assert.strictEqual(res.status, 200, "API status should be 200");
      const data = await res.json();
      assert.ok(data.success, "Response should have success=true");
      console.log("✅ API signup test passed!");
    } catch (e) {
      console.error("❌ Test failed:", e.message);
      process.exit(1);
    }
  }
  runTests();
  \`\`\`
- Always start the server in background first using run_background, then run the test file using run_command (e.g., node test.js).
- If tests fail, read the logs, fix the bug, and re-run. Do NOT say you have finished until all your tests pass.

## RESPONSE FORMAT
- Keep responses SHORT — the user sees your actions in real time
- After completing work: "✅ [What was done]. Running at http://localhost:PORT"
- On error: explain what failed and what you fixed (max 2 sentences)
- Respond in the SAME LANGUAGE as the user (Portuguese if they write Portuguese)
- NEVER say "I cannot" — find a way or a workaround

### 11. MCP (MODEL CONTEXT PROTOCOL) — EXTERNAL TOOLS
- If MCP tools are available (listed in the workspace context), you can use them to interact with external databases, APIs, browsers, etc.
- ALWAYS call list_mcp_tools first to discover what is available before using mcp_call.
- Use mcp_call(server, tool, arguments) to execute an MCP tool.
- MCP tools are powerful: you can query databases, browse the web, interact with GitHub, etc.

### 12. WEB SEARCH & READING — YOU CAN SEARCH THE INTERNET!
- You have access to the live internet via web_search and web_read tools.
- **ALWAYS use web_search when the user asks about:**
  - Current/real-time data (prices, exchange rates, weather, news, sports scores, etc.)
  - Recent events or information that may have changed after your training data cutoff
  - Specific package versions, changelogs, or release notes
  - Documentation for libraries or frameworks you're not 100% sure about
  - Any factual question where accuracy matters
- Use web_search to find information, then use web_read to get full details from relevant URLs.
- When you encounter an error you don't recognize, SEARCH FOR IT before guessing a fix.
- When the user asks about a technology you're unsure about, SEARCH before responding.
- Format search results clearly for the user, citing your sources.
- NEVER say "I don't have access to real-time data" — you DO have access via web_search!

### 13. GENERATION LIMITS
- Write your code or response ONCE. Do NOT repeat or loop the same code blocks.
- When your task is done, STOP generating text immediately. Do NOT start over.`;


// ==========================================================================
// Background process tracker
// ==========================================================================
const backgroundProcesses = new Map(); // port → { process, pid }

// ==========================================================================
// Tool Execution
// ==========================================================================
async function executeTool(toolName, args, workspacePath) {
  try {
    switch (toolName) {
      case 'create_file':    return toolCreateFile(args, workspacePath);
      case 'read_file':      return toolReadFile(args, workspacePath);
      case 'edit_file':      return toolEditFile(args, workspacePath);
      case 'run_command':    return toolRunCommand(args, workspacePath);
      case 'run_background': return toolRunBackground(args, workspacePath);
      case 'list_files':     return toolListFiles(args, workspacePath);
      case 'delete_file':    return toolDeleteFile(args, workspacePath);
      case 'search_files':   return toolSearchFiles(args, workspacePath);
      case 'zip_project':    return toolZipProject(args, workspacePath);
      case 'list_mcp_tools': return toolListMcpTools();
      case 'mcp_call':       return await toolMcpCall(args);
      case 'web_search':     return await toolWebSearch(args);
      case 'web_read':       return await toolWebRead(args);
      default: return { success: false, result: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    return { success: false, result: `Tool error: ${error.message}` };
  }
}

function toolCreateFile(args, workspacePath) {
  const filePath = path.resolve(workspacePath, args.path);
  if (!filePath.startsWith(workspacePath)) return { success: false, result: 'Path outside workspace' };
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, args.content, 'utf8');
  const lines = args.content.split('\n').length;
  return { success: true, result: `✅ Created: ${args.path} (${lines} lines)` };
}

function toolReadFile(args, workspacePath) {
  const filePath = path.resolve(workspacePath, args.path);
  if (!filePath.startsWith(workspacePath)) return { success: false, result: 'Path outside workspace' };
  if (!fs.existsSync(filePath)) return { success: false, result: `File not found: ${args.path}` };
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.length > 12000) {
    return { success: true, result: content.substring(0, 12000) + '\n\n...(truncated — file has ' + content.length + ' chars total)' };
  }
  return { success: true, result: content };
}

function toolEditFile(args, workspacePath) {
  const filePath = path.resolve(workspacePath, args.path);
  if (!filePath.startsWith(workspacePath)) return { success: false, result: 'Path outside workspace' };
  if (!fs.existsSync(filePath)) return { success: false, result: `File not found: ${args.path}` };
  let content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes(args.old_text)) {
    // Try trimmed match as fallback
    const trimmedOld = args.old_text.trim();
    const trimmedContent = content.replace(/\r\n/g, '\n');
    if (!trimmedContent.includes(trimmedOld)) {
      return { success: false, result: `Text not found in ${args.path}. Use read_file to get the exact content first.` };
    }
    content = trimmedContent.replace(trimmedOld, args.new_text);
  } else {
    content = content.replace(args.old_text, args.new_text);
  }
  fs.writeFileSync(filePath, content, 'utf8');
  return { success: true, result: `✅ Edited: ${args.path}` };
}

function toolRunCommand(args, workspacePath) {
  const timeout = (args.timeout_seconds || 120) * 1000;
  try {
    const output = execSync(args.command, {
      cwd: workspacePath,
      timeout: Math.min(timeout, COMMAND_TIMEOUT),
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }
    });
    const result = (output || '(completed with no output)').trim();
    // Truncate long outputs but keep the end (errors are at the end)
    if (result.length > 3000) {
      return { success: true, result: '...(truncated)\n' + result.slice(-3000) };
    }
    return { success: true, result };
  } catch (error) {
    const out = ((error.stdout || '') + '\n' + (error.stderr || '')).trim();
    const msg = `Exit code ${error.status}:\n${out || error.message}`;
    return { success: false, result: msg.length > 3000 ? msg.slice(-3000) : msg };
  }
}

// ==========================================================================
// Auto-hooks: instala deps e starta servidor automaticamente
// ==========================================================================
function autoInstallAndRun(workspacePath, socket, iteration) {
  const pkgPath = path.join(workspacePath, 'package.json');
  if (!fs.existsSync(pkgPath)) return;

  // Só instala se node_modules não existe
  const nmPath = path.join(workspacePath, 'node_modules');
  if (!fs.existsSync(nmPath)) {
    socket.emit('agent-action', { tool: 'run_command', args: { command: 'npm install' }, iteration, auto: true });
    const r = toolRunCommand({ command: 'npm install' }, workspacePath);
    socket.emit('agent-action-result', { tool: 'run_command', success: r.success, result: r.result, iteration, auto: true });
  }

  // Detecta TypeScript e compila
  const tsconfigPath = path.join(workspacePath, 'tsconfig.json');
  if (fs.existsSync(tsconfigPath)) {
    socket.emit('agent-action', { tool: 'run_command', args: { command: 'npx tsc --noEmit false 2>&1 || true' }, iteration, auto: true });
    const r = toolRunCommand({ command: 'npx tsc 2>&1 || true' }, workspacePath);
    socket.emit('agent-action-result', { tool: 'run_command', success: true, result: r.result, iteration, auto: true });
  }
}

function toolRunBackground(args, workspacePath) {
  const { spawn } = require('child_process');
  const port = args.port || 3001;
  const waitMs = (args.wait_seconds || 4) * 1000;

  // Kill existing process on this port
  if (backgroundProcesses.has(port)) {
    try { backgroundProcesses.get(port).kill(); } catch (e) {}
    backgroundProcesses.delete(port);
  }

  // Also try to free the port
  try {
    execSync(`npx kill-port ${port} 2>/dev/null || true`, { cwd: workspacePath, timeout: 5000, shell: true });
  } catch (e) {}

  const proc = spawn(args.command, [], {
    cwd: workspacePath,
    shell: true,
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port), NODE_ENV: 'development' }
  });

  backgroundProcesses.set(port, proc);

  let output = '';
  proc.stdout?.on('data', d => { output += d.toString(); });
  proc.stderr?.on('data', d => { output += d.toString(); });
  proc.on('error', e => { output += `\nProcess error: ${e.message}`; });

  // Wait a bit for the server to start
  const start = Date.now();
  while (Date.now() - start < waitMs) {
    // Busy-wait (this runs in the tool executor context)
    const now = Date.now();
    while (Date.now() - now < 100) {} // 100ms sleep simulation
    // Check if process died
    if (proc.exitCode !== null) {
      return {
        success: false,
        result: `Process died immediately (exit ${proc.exitCode}):\n${output.slice(-1000)}`
      };
    }
  }

  // Check if still running
  if (proc.killed || proc.exitCode !== null) {
    return {
      success: false,
      result: `Process exited (exit ${proc.exitCode}):\n${output.slice(-1000)}`
    };
  }

  return {
    success: true,
    result: `✅ Server started on port ${port}\n🔗 URL: http://localhost:${port}\n\nStartup output:\n${output.slice(-500) || '(no output yet — server may still be starting)'}`
  };
}

function toolListFiles(args, workspacePath) {
  const dirPath = path.resolve(workspacePath, args.directory || '.');
  if (!dirPath.startsWith(workspacePath)) return { success: false, result: 'Path outside workspace' };
  if (!fs.existsSync(dirPath)) return { success: false, result: `Directory not found: ${args.directory}` };

  const result = [];
  function walk(dir, prefix, depth) {
    if (depth > 5) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '__pycache__' || entry.name === 'dist') continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { result.push(`📁 ${rel}/`); walk(path.join(dir, entry.name), rel, depth + 1); }
      else result.push(`📄 ${rel}`);
    }
  }
  walk(dirPath, '', 0);
  return { success: true, result: result.length > 0 ? result.join('\n') : '(empty workspace — start fresh!)' };
}

function toolZipProject(args, workspacePath) {
  const folder = args.folder && args.folder !== '.' ? encodeURIComponent(args.folder) : null;
  const name = (args.name || 'projeto').replace(/[^a-zA-Z0-9_\-]/g, '_');
  const url = folder ? `/api/download-zip/${folder}?name=${name}` : `/api/download-zip?name=${name}`;
  return { success: true, result: `ZIP_DOWNLOAD_URL:${url}|${args.name || 'projeto'}` };
}

function toolDeleteFile(args, workspacePath) {
  const filePath = path.resolve(workspacePath, args.path);
  if (!filePath.startsWith(workspacePath)) return { success: false, result: 'Path outside workspace' };
  if (!fs.existsSync(filePath)) return { success: false, result: `Not found: ${args.path}` };
  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) fs.rmSync(filePath, { recursive: true });
  else fs.unlinkSync(filePath);
  return { success: true, result: `✅ Deleted: ${args.path}` };
}

function toolSearchFiles(args, workspacePath) {
  const dirPath = path.resolve(workspacePath, args.directory || '.');
  if (!dirPath.startsWith(workspacePath)) return { success: false, result: 'Path outside workspace' };
  const results = [];
  function search(dir) {
    if (results.length > 40) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) { search(fullPath); }
      else {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(args.query.toLowerCase())) {
              results.push(`${path.relative(workspacePath, fullPath)}:${i + 1}: ${lines[i].trim()}`);
            }
          }
        } catch (e) {}
      }
    }
  }
  search(dirPath);
  return { success: true, result: results.length > 0 ? results.slice(0, 40).join('\n') : `No matches for "${args.query}"` };
}

// ==========================================================================
// MCP Tools — Ferramentas do Model Context Protocol
// ==========================================================================
function toolListMcpTools() {
  try {
    const tools = mcpManager.getAvailableTools();
    if (tools.length === 0) {
      return { success: true, result: 'No MCP servers are connected. Ask an admin to configure MCP servers in the Admin Panel → MCP Servers tab.' };
    }
    const lines = ['🔌 Available MCP Tools:\n'];
    const grouped = {};
    for (const t of tools) {
      if (!grouped[t.server]) grouped[t.server] = [];
      grouped[t.server].push(t);
    }
    for (const [server, serverTools] of Object.entries(grouped)) {
      lines.push(`📡 Server: ${server}`);
      for (const t of serverTools) {
        const params = t.inputSchema?.properties
          ? Object.keys(t.inputSchema.properties).join(', ')
          : 'none';
        lines.push(`  • ${t.name} — ${t.description || '(no description)'} [params: ${params}]`);
      }
      lines.push('');
    }
    return { success: true, result: lines.join('\n') };
  } catch (e) {
    return { success: false, result: `Error listing MCP tools: ${e.message}` };
  }
}

async function toolMcpCall(args) {
  try {
    const { server, tool, arguments: toolArgs } = args;
    if (!server || !tool) {
      return { success: false, result: 'Both "server" and "tool" are required. Use list_mcp_tools to discover available tools.' };
    }
    const result = await mcpManager.callTool(server, tool, toolArgs || {});
    return { success: true, result: typeof result === 'string' ? result : JSON.stringify(result, null, 2) };
  } catch (e) {
    return { success: false, result: `MCP call failed: ${e.message}` };
  }
}

// ==========================================================================
// Web Search & Read — Pesquisa na Internet
// ==========================================================================
async function toolWebSearch(args) {
  try {
    const query = args.query;
    if (!query) return { success: false, result: 'Query is required' };

    // Usar DuckDuckGo HTML lite (sem API key, sem bloqueio)
    const encodedQuery = encodeURIComponent(query);
    const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }

    const html = await response.text();

    // Parse results from DuckDuckGo HTML
    const results = [];
    const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

    let match;
    const titles = [];
    const urls = [];
    while ((match = resultRegex.exec(html)) !== null && titles.length < 8) {
      let href = match[1];
      // DuckDuckGo wraps URLs in redirects
      const udMatch = href.match(/uddg=([^&]+)/);
      if (udMatch) href = decodeURIComponent(udMatch[1]);
      titles.push(match[2].replace(/<[^>]*>/g, '').trim());
      urls.push(href);
    }

    const snippets = [];
    while ((match = snippetRegex.exec(html)) !== null && snippets.length < 8) {
      snippets.push(match[1].replace(/<[^>]*>/g, '').trim());
    }

    for (let i = 0; i < titles.length; i++) {
      results.push(`${i + 1}. ${titles[i]}\n   URL: ${urls[i]}\n   ${snippets[i] || ''}\n`);
    }

    if (results.length === 0) {
      return { success: true, result: `No results found for "${query}". Try a different query.` };
    }

    return { success: true, result: `🔍 Search results for "${query}":\n\n${results.join('\n')}` };
  } catch (e) {
    return { success: false, result: `Web search failed: ${e.message}` };
  }
}

async function toolWebRead(args) {
  try {
    const url = args.url;
    if (!url) return { success: false, result: 'URL is required' };

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    let text;

    if (contentType.includes('application/json')) {
      const json = await response.json();
      text = JSON.stringify(json, null, 2);
    } else {
      const html = await response.text();
      // Extrair texto útil do HTML
      text = html
        // Remove scripts e styles
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[\s\S]*?<\/footer>/gi, '')
        .replace(/<header[\s\S]*?<\/header>/gi, '')
        // Remove tags HTML preservando conteúdo
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/h[1-6]>/gi, '\n\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<\/tr>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        // Decode HTML entities
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&nbsp;/g, ' ')
        // Limpar espaços em excesso
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
    }

    // Limitar tamanho para não sobrecarregar o contexto
    const maxLen = 6000;
    if (text.length > maxLen) {
      text = text.substring(0, maxLen) + '\n\n... (content truncated — use web_search to find more specific pages)';
    }

    return { success: true, result: `📄 Content from ${url}:\n\n${text}` };
  } catch (e) {
    return { success: false, result: `Failed to read URL: ${e.message}` };
  }
}

// ==========================================================================
// Fallback: Parse código E comandos de modelos pequenos (1B)
// ==========================================================================
function parseCodeBlocksFromResponse(content, workspacePath, socket, iteration = 0) {
  let filesCreated = 0;
  const usedBlocks = new Set();

  // Strategy 1: Explicit file paths in fence ```path/file.ext
  const explicitFileRegex = /```(\S+\/?\S+\.\w{1,5})\n([\s\S]*?)```/g;
  let match;
  const langOnly = new Set(['html', 'css', 'javascript', 'js', 'python', 'json', 'bash',
    'shell', 'sh', 'typescript', 'ts', 'sql', 'yaml', 'xml', 'markdown', 'md',
    'jsx', 'tsx', 'py', 'rb', 'go', 'rs', 'php', 'java', 'c', 'cpp', 'toml',
    'text', 'txt', 'ini', 'env', 'dockerfile']);

  while ((match = explicitFileRegex.exec(content)) !== null) {
    const filePath = match[1];
    if (langOnly.has(filePath.toLowerCase())) continue;
    const fileContent = match[2];
    socket.emit('agent-action', { tool: 'create_file', args: { path: filePath }, iteration });
    const result = toolCreateFile({ path: filePath, content: fileContent }, workspacePath);
    socket.emit('agent-action-result', { tool: 'create_file', success: result.success, result: result.result, iteration });
    if (result.success) { filesCreated++; usedBlocks.add(match.index); }
  }

  // Strategy 2: Language blocks with inferred names
  const langBlockRegex = /```(html|css|javascript|js|python|py|json|typescript|ts|sql|bash|sh)\n([\s\S]*?)```/gi;
  while ((match = langBlockRegex.exec(content)) !== null) {
    if (usedBlocks.has(match.index)) continue;
    const lang = match[1].toLowerCase();
    const fileContent = match[2];
    const ext = { html: 'html', css: 'css', javascript: 'js', js: 'js', python: 'py', py: 'py', json: 'json', typescript: 'ts', ts: 'ts', sql: 'sql', bash: 'sh', sh: 'sh' }[lang] || lang;

    const textBefore = content.substring(Math.max(0, match.index - 400), match.index);
    const fileNameMatch = textBefore.match(/[`"']?([\w][\w.\-/]*\.\w{1,5})[`"']?[\s:]*$/m) ||
                          textBefore.match(/(?:arquivo|file|crie?|create?|salv[ae]|named?)[\s:]+[`"']?([\w][\w.\-/]*\.\w{1,5})[`"']?/i);
    let fileName;
    
    const firstLineMatch = fileContent.trim().split('\n')[0].match(/^(?:\/\/|#|<!--|\/\*)\s*(?:file:\s*|arquivo:\s*|path:\s*|caminho:\s*)?([\w][\w.\-/]+\.\w{1,5})\s*(?:-->|\*\/)?\s*$/i);
    
    if (firstLineMatch?.[1]) {
      fileName = firstLineMatch[1];
    } else if (fileNameMatch?.[1]) {
      fileName = fileNameMatch[1];
    } else {
      if (ext === 'html') fileName = /login|signin/i.test(fileContent) ? 'login.html' : /register|cadastr/i.test(fileContent) ? 'register.html' : 'index.html';
      else if (ext === 'css') fileName = 'style.css';
      else if (ext === 'js') fileName = /express|require.*express/i.test(fileContent) ? 'server.js' : /database|sqlite/i.test(fileContent) ? 'database.js' : 'app.js';
      else if (ext === 'ts') fileName = /express/i.test(fileContent) ? 'src/server.ts' : 'src/index.ts';
      else if (ext === 'py') fileName = /flask|fastapi|django/i.test(fileContent) ? 'app.py' : 'main.py';
      else if (ext === 'json') fileName = /dependencies|scripts/i.test(fileContent) ? 'package.json' : 'data.json';
      else fileName = `file_${filesCreated}.${ext}`;
    }

    const fullPath = path.resolve(workspacePath, fileName);
    if (fs.existsSync(fullPath) && filesCreated > 0) {
      const e = path.extname(fileName);
      fileName = `${path.basename(fileName, e)}_${filesCreated}${e}`;
    }

    socket.emit('agent-action', { tool: 'create_file', args: { path: fileName }, iteration });
    const result = toolCreateFile({ path: fileName, content: fileContent }, workspacePath);
    socket.emit('agent-action-result', { tool: 'create_file', success: result.success, result: result.result, iteration });
    if (result.success) filesCreated++;
  }

  // ─── AUTO-EXECUTE: comandos detectados no texto ───────────────────────────
  // Detecta blocos de comando: ```bash\nnpm install\n``` ou linhas como "Run: npm install"
  const cmdPatterns = [
    /```(?:bash|sh|shell|cmd)\n([\s\S]*?)```/gi,
    /(?:^|\n)(?:run|execute|rode|execute|run:|\$)\s+`([^`\n]+)`/gim,
    /(?:^|\n)\$\s+([\w][^\n]{3,60})/gm
  ];

  // Comandos seguros para auto-executar
  const safeCommands = /^(npm\s|npx\s|node\s|tsc|ts-node|python|pip\s|yarn\s)/i;
  const dangerousCommands = /rm\s+-rf|del\s|format|shutdown|reboot|dd\s+if/i;

  const executedCmds = new Set();
  for (const pattern of cmdPatterns) {
    let cmdMatch;
    pattern.lastIndex = 0;
    while ((cmdMatch = pattern.exec(content)) !== null) {
      const rawCmds = cmdMatch[1].trim();
      // Split multiple commands
      const lines = rawCmds.split('\n').map(l => l.replace(/^\$\s*/, '').trim()).filter(Boolean);
      for (const cmd of lines) {
        if (executedCmds.has(cmd)) continue;
        if (!safeCommands.test(cmd)) continue;
        if (dangerousCommands.test(cmd)) continue;
        executedCmds.add(cmd);

        socket.emit('agent-action', { tool: 'run_command', args: { command: cmd }, iteration, auto: true });
        const r = toolRunCommand({ command: cmd }, workspacePath);
        socket.emit('agent-action-result', { tool: 'run_command', success: r.success, result: r.result, iteration, auto: true });
      }
    }
  }

  // ─── AUTO-INSTALL: se criou package.json e não tem node_modules ──────────
  if (filesCreated > 0) {
    const pkgPath = path.join(workspacePath, 'package.json');
    const nmPath = path.join(workspacePath, 'node_modules');
    if (fs.existsSync(pkgPath) && !fs.existsSync(nmPath)) {
      socket.emit('agent-action', { tool: 'run_command', args: { command: 'npm install' }, iteration, auto: true });
      const r = toolRunCommand({ command: 'npm install' }, workspacePath);
      socket.emit('agent-action-result', { tool: 'run_command', success: r.success, result: r.result, iteration, auto: true });

      // Auto-compile TypeScript if tsconfig exists
      const tscPath = path.join(workspacePath, 'tsconfig.json');
      if (fs.existsSync(tscPath) && r.success) {
        socket.emit('agent-action', { tool: 'run_command', args: { command: 'npx tsc 2>&1 || true' }, iteration, auto: true });
        const tscR = toolRunCommand({ command: 'npx tsc 2>&1 || true' }, workspacePath);
        socket.emit('agent-action-result', { tool: 'run_command', success: true, result: tscR.result, iteration, auto: true });
      }
    }
  }

  return filesCreated;
}

// ==========================================================================
// Loop Agêntico Principal — Máxima Autonomia + Fila de Mensagens
// ==========================================================================
async function runAgentLoop(ollamaUrl, model, chatMessages, workspacePath, socket, getNextInterrupt = null, numCtx = 4096, planningMode = false) {
  // Contexto automático do workspace
  let contextNote = '';
  try {
    const filesResult = toolListFiles({ directory: '.' }, workspacePath);
    if (filesResult.success && filesResult.result !== '(empty workspace — start fresh!)') {
      contextNote = `\n\n## CURRENT WORKSPACE\n${filesResult.result}`;
    }
  } catch (e) {}

  // Também detectar se há package.json para injetar info de dependências
  try {
    const pkgPath = path.join(workspacePath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps = Object.keys(pkg.dependencies || {}).concat(Object.keys(pkg.devDependencies || {}));
      if (deps.length > 0) contextNote += `\n\nInstalled packages: ${deps.join(', ')}`;
    }
  } catch (e) {}

  // Injetar informações sobre MCP tools disponíveis
  try {
    const mcpTools = mcpManager.getAvailableTools();
    if (mcpTools.length > 0) {
      contextNote += '\n\n## AVAILABLE MCP TOOLS\n';
      const grouped = {};
      for (const t of mcpTools) {
        if (!grouped[t.server]) grouped[t.server] = [];
        grouped[t.server].push(t);
      }
      for (const [server, tools] of Object.entries(grouped)) {
        contextNote += `Server "${server}":\n`;
        for (const t of tools) {
          contextNote += `  - ${t.name}: ${t.description || '(no description)'}\n`;
        }
      }
      contextNote += '\nUse list_mcp_tools and mcp_call to interact with these external tools.';
    }
  } catch (e) {}

  const planningPrompt = planningMode ? `\n\n## ✋ MODO DE PLANEJAMENTO/APROVAÇÃO ATIVADO
O usuário quer aprovar o plano ANTES da execução. Siga o início do pipeline:
1. 📋 PLANEJAMENTO: Explore o workspace com list_files/read_file para entender o contexto.
2. Crie um arquivo "plano.md" com create_file contendo o plano DETALHADO: objetivo, arquivos a criar, dependências, como será o build, quais testes serão escritos, e como o app será executado/validado.
3. ✋ APROVAÇÃO: Após criar o plano.md, PARE e mande UMA mensagem curta no chat pedindo aprovação ("Revise o plano.md. Posso prosseguir? Responda 'aprovado' para eu executar todo o pipeline: Build → Testes → Executar → Validar → Entregar.").
4. CRÍTICO: NÃO crie arquivos do projeto, nem use edit_file/delete_file/run_command/run_background até o usuário responder "aprovado" (ou equivalente).
5. Assim que aprovado, execute o RESTANTE DO PIPELINE inteiro automaticamente, sem parar de novo: ⚙️ Execução → 🔨 Build (corrigir e rebuildar até passar) → 🧪 Testes (corrigir e re-testar até passar) → ▶️ Executar → ✅ Validar → 🔍 Autoavaliação → 🎁 Entregar.` : '';

  const messages = [
    { role: 'system', content: AGENT_SYSTEM_PROMPT + contextNote + planningPrompt },
    ...chatMessages
  ];

  let iterations = 0;
  const isSmallModel = /^(.*:)?(0\.5b|1b|1\.5b)$/i.test(model) || /1b-/i.test(model);

  // ── Detector de fase do pipeline (a partir do texto/emoji do agente) ──
  let lastPhase = null;
  let awaitingApproval = false;
  // Approval tem prioridade: se o agente pede aprovação, trava nessa fase.
  const approvalRe = /✋|aprova(r|ção|do)|aguardando aprova|posso prosseguir|responda ['"]?aprovado/i;
  const phaseMatchers = [
    { id: 'planning',   re: /📋|planejamento/i },
    { id: 'execution',  re: /⚙️|execução|criando (os )?arquivos/i },
    { id: 'build',      re: /🔨|\bbuild\b|compilando|compilação/i },
    { id: 'test',       re: /🧪|\btestes?\b|rodando teste/i },
    { id: 'run',        re: /▶️|iniciando (o )?servidor|servidor (started|iniciad)/i },
    { id: 'validate',   re: /✅|validar|validação|verificando.*(endpoint|health)/i },
    { id: 'selfreview', re: /🔍|autoavalia|auto-avalia/i },
    { id: 'deliver',    re: /🎁|entregue|concluíd[oa]/i }
  ];
  function detectAndEmitPhase(text) {
    if (!text) return;
    // Approval vence tudo enquanto a frase de aprovação estiver presente
    if (approvalRe.test(text)) {
      awaitingApproval = true;
      if (lastPhase !== 'approval') { lastPhase = 'approval'; emitPhase(socket, 'approval', ''); }
      return;
    }
    for (let i = phaseMatchers.length - 1; i >= 0; i--) {
      if (phaseMatchers[i].re.test(text)) {
        if (lastPhase !== phaseMatchers[i].id) {
          lastPhase = phaseMatchers[i].id;
          emitPhase(socket, phaseMatchers[i].id, '');
        }
        return;
      }
    }
  }
  function emitPhaseOnce(phaseId) {
    if (lastPhase === phaseId) return;
    lastPhase = phaseId;
    emitPhase(socket, phaseId, '');
  }

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    // ══ Verifica fila de interrupts entre iterações ═════════════════════════════════
    if (getNextInterrupt) {
      const interruptMsg = getNextInterrupt();
      if (interruptMsg) {
        // Se o usuário aprovou, libera o pipeline para continuar
        if (/aprovad|aprovo|pode (prosseguir|continuar|seguir)|sim,? pode|✅/i.test(interruptMsg)) {
          awaitingApproval = false;
          emitPhaseOnce('execution');
        }
        // Notifica o frontend que o agente leu a mensagem
        socket.emit('interrupt-received', { content: interruptMsg });
        // Injeta como mensagem do usuário com contexto especial
        messages.push({
          role: 'user',
          content: `[INTERRUPT — mensagem enviada pelo usuário enquanto você trabalhava]: ${interruptMsg}

Responda ou execute o que foi pedido. Se era uma pergunta, responda brevemente. Se era uma instrução, execute agora incorporando ao que já estava fazendo. Depois continue o trabalho anterior se ainda não terminou.`
        });
      }
    }

    socket.emit('agent-thinking', { iteration: iterations });

    try {
      const requestBody = {
        model,
        messages,
        stream: true,
        options: {
          temperature: model.toLowerCase().includes('deepseek') ? 0.6 : 0.15,
          num_ctx: numCtx,
          repeat_penalty: model.toLowerCase().includes('deepseek') ? 1.15 : 1.05,
          top_p: 0.9,
          stop: ['<|im_end|>', '<|endoftext|>', '<|eot_id|>', 'User:', 'Assistant:', 'System:', '<｜end▁of▁sentence｜>']
        }
      };

      if (!isSmallModel) {
        requestBody.tools = TOOLS_DEFINITION;
      }

      const response = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Ollama API: ${response.status} — ${errText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let assistantMessage = { role: 'assistant', content: '', tool_calls: [] };
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim()) {
            try {
              const chunk = JSON.parse(buffer);
              if (chunk.message?.content) {
                assistantMessage.content += chunk.message.content;
                socket.emit('agent-stream', { content: chunk.message.content, iteration: iterations });
              }
              if (chunk.message?.tool_calls) {
                assistantMessage.tool_calls = chunk.message.tool_calls;
              }
            } catch(e) {}
          }
          break;
        }
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Guarda o pedaço incompleto para o próximo chunk

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            if (chunk.message?.content) {
              assistantMessage.content += chunk.message.content;
              socket.emit('agent-stream', { content: chunk.message.content, iteration: iterations });
              detectAndEmitPhase(assistantMessage.content);
            }
            if (chunk.message?.tool_calls) {
              assistantMessage.tool_calls = chunk.message.tool_calls;
            }
          } catch (e) {
            // ignora pedaços malformados
          }
        }
      }

      messages.push(assistantMessage);

      // ── Tool calls (modelos 3B+) ──────────────────────────────────────────
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        let hasMoreWork = false;

        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.function.name;
          let toolArgs;
          try {
            toolArgs = typeof toolCall.function.arguments === 'string'
              ? JSON.parse(toolCall.function.arguments)
              : (toolCall.function.arguments || {});
          } catch { toolArgs = {}; }

          // Emit action to frontend
          socket.emit('agent-action', { tool: toolName, args: toolArgs, iteration: iterations });

          // Mapeia ferramenta → fase do pipeline
          if (toolName === 'create_file' || toolName === 'edit_file' || toolName === 'delete_file') {
            const p = (toolArgs.path || '').toLowerCase();
            if (p === 'plano.md') emitPhaseOnce('planning');
            else if (/test/.test(p)) emitPhaseOnce('test');
            else emitPhaseOnce('execution');
          } else if (toolName === 'run_command') {
            const cmd = (toolArgs.command || '').toLowerCase();
            if (/test/.test(cmd)) emitPhaseOnce('test');
            else if (/install|tsc|build|compile/.test(cmd)) emitPhaseOnce('build');
          } else if (toolName === 'run_background') {
            emitPhaseOnce('run');
          }

          const toolResult = await executeTool(toolName, toolArgs, workspacePath);

          // Emit result
          const resultPreview = toolResult.result.length > 1500
            ? '...(truncated)\n' + toolResult.result.slice(-1500)
            : toolResult.result;

          socket.emit('agent-action-result', {
            tool: toolName,
            success: toolResult.success,
            result: resultPreview,
            iteration: iterations
          });

          messages.push({ role: 'tool', content: toolResult.result });

          // Se o agente criou arquivos ou rodou comandos, provavelmente tem mais trabalho
          if (['create_file', 'run_command', 'run_background', 'edit_file'].includes(toolName)) {
            hasMoreWork = true;
          }
        }

        // Continua o loop para o agente processar os resultados das ferramentas
        continue;
      }

      // ── Resposta final de texto ───────────────────────────────────────────
      const finalContent = assistantMessage.content || '';

      // Fallback 1: Extrai tool calls manuais formatados como JSON no texto (comum em Qwen/Llama)
      const manualToolRegex = /\{[\s\n]*"name"[\s\n]*:[\s\n]*"([^"]+)"[\s\n]*,[\s\n]*"arguments"[\s\n]*:[\s\n]*(\{.*?\})[\s\n]*\}/gs;
      let match;
      let toolsExecuted = false;
      while ((match = manualToolRegex.exec(finalContent)) !== null) {
        try {
          const toolName = match[1];
          const toolArgs = JSON.parse(match[2]);
          socket.emit('agent-action', { tool: toolName, args: toolArgs, iteration: iterations });
          const toolResult = await executeTool(toolName, toolArgs, workspacePath);
          const resultPreview = toolResult.result.length > 1500 ? '...(truncated)\n' + toolResult.result.slice(-1500) : toolResult.result;
          socket.emit('agent-action-result', { tool: toolName, success: toolResult.success, result: resultPreview, iteration: iterations });
          messages.push({ role: 'tool', content: toolResult.result });
          toolsExecuted = true;
        } catch(e) {
          console.error('Erro ao fazer parse de tool call manual:', e);
        }
      }

      if (toolsExecuted) {
        continue; // Volta para processar o resultado e permitir novas ações na mesma task
      }

      // Fallback 2: extrai arquivos e executa comandos do texto
      // Aplica para modelos pequenos (1B) E para qualquer modelo que retornou
      // código em blocos sem usar tool calls
      if (finalContent && finalContent.includes('```')) {
        const filesCreated = parseCodeBlocksFromResponse(finalContent, workspacePath, socket, iterations);
        if (filesCreated > 0) {
          let cleanContent = finalContent
            .replace(/```[\w./\-]*\n[\s\S]*?```/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
          if (!cleanContent) cleanContent = `✅ ${filesCreated} arquivo(s) criado(s) com sucesso!`;
          if (!awaitingApproval) emitPhaseOnce('deliver');
          socket.emit('agent-done', { content: cleanContent, iterations });
          return { content: cleanContent, messages: messages.slice(1), iterations };
        }
      }

      // Se não está aguardando aprovação, a resposta final é a entrega
      if (!awaitingApproval && !approvalRe.test(finalContent)) emitPhaseOnce('deliver');
      socket.emit('agent-done', { content: finalContent, iterations });
      return { content: finalContent, messages: messages.slice(1), iterations };

    } catch (error) {
      socket.emit('agent-error', { error: error.message, iteration: iterations });
      return { content: `❌ Erro: ${error.message}`, messages: messages.slice(1), iterations, error: true };
    }
  }

  const msg = `⚠️ Limite de ${MAX_ITERATIONS} iterações atingido. O projeto pode estar incompleto.`;
  socket.emit('agent-error', { error: msg });
  return { content: msg, messages: messages.slice(1), iterations, error: true };
}

module.exports = { runAgentLoop, TOOLS_DEFINITION, AGENT_SYSTEM_PROMPT, executeTool };
