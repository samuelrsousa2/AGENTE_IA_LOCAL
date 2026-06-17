// ==========================================================================
// Server - IDE Web Agêntica com Ollama — SaaS Multi-tenant
// ==========================================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const chokidar = require('chokidar');
const AdmZip = require('adm-zip');
const cookieParser = require('cookie-parser');
const { runAgentLoop } = require('./agent');
const { generateToken, verifyToken, requireAuth, requireAdmin } = require('./auth/middleware');
const { queries } = require('./db/database');
const { mcpManager } = require('./mcp-manager');

// Configurações
const PORT = process.env.PORT || 3000;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://192.168.1.2:11434';
const WORKSPACES_DIR = process.env.WORKSPACES_DIR || path.join(__dirname, 'workspaces');
const HISTORY_DIR = path.join(__dirname, 'data', 'chats');

// Garante diretórios base
[WORKSPACES_DIR, HISTORY_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// Retorna workspace do usuário (cria se não existir)
function getUserWorkspace(userId) {
  const dir = path.join(WORKSPACES_DIR, userId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'README.md'),
      '# Meu Workspace\n\nBem-vindo! Use o agente IA para criar seus projetos aqui.\n',
      'utf8'
    );
  }
  return dir;
}

// Retorna arquivo de histórico do usuário
function getUserHistoryFile(userId) {
  const file = path.join(HISTORY_DIR, `${userId}.json`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, '[]', 'utf8');
  return file;
}

// ==========================================================================
// Express + Socket.IO Setup
// ==========================================================================
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 5e6
});

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

// CSP
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy',
    "default-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: ws: wss: http: https:; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com; " +
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com https://cdnjs.cloudflare.com; " +
    "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net; " +
    "connect-src 'self' ws: wss: http: https:; " +
    "worker-src 'self' blob: https://cdn.jsdelivr.net; " +
    "img-src 'self' data: blob: https:;"
  );
  next();
});

// ==========================================================================
// Rotas públicas (sem auth)
// ==========================================================================

// Arquivos estáticos públicos (login, pricing, etc.) — apenas login e static assets
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'public')));

// Health check público
app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '2.0.0' }));

// Servir login.html em /login
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Servir pricing.html
app.get('/pricing', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pricing.html'));
});

// ==========================================================================
// Auth Routes
// ==========================================================================

// POST /api/auth/login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }

  const user = queries.getUserByEmail(email.toLowerCase().trim());
  if (!user) return res.status(401).json({ error: 'Email ou senha incorretos' });
  if (!user.active) return res.status(403).json({ error: 'Conta desativada. Entre em contato com o suporte.' });
  if (!queries.validatePassword(user, password)) {
    return res.status(401).json({ error: 'Email ou senha incorretos' });
  }

  const token = generateToken(user);
  res.cookie('ide_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 dias
  });

  // Cria workspace do usuário
  getUserWorkspace(user.id);

  res.json({
    success: true,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, plan: user.plan }
  });
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('ide_token');
  res.json({ success: true });
});

// GET /api/auth/me
app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = queries.getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.json({ id: user.id, email: user.email, name: user.name, role: user.role, plan: user.plan });
});

// ==========================================================================
// Rota raiz — redireciona para login ou IDE
// ==========================================================================
app.get('/', (req, res) => {
  const token = req.cookies?.ide_token;
  if (token && verifyToken(token)) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  res.redirect('/login');
});

// IDE — servir index.html (protegido)
app.get('/ide', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Servir arquivos estáticos da IDE (js, css, etc.)
app.use(requireAuth, express.static(path.join(__dirname, 'public')));

// ==========================================================================
// Admin Routes
// ==========================================================================
app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// GET /api/admin/users
app.get('/api/admin/users', requireAdmin, (req, res) => {
  res.json(queries.getAllUsers());
});

// POST /api/admin/users — criar usuário
app.post('/api/admin/users', requireAdmin, (req, res) => {
  const { email, password, name, role, plan } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'email, password e name são obrigatórios' });
  }
  try {
    const user = queries.createUser({ email: email.toLowerCase().trim(), password, name, role, plan });
    getUserWorkspace(user.id); // Cria workspace
    res.json({ success: true, user });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PUT /api/admin/users/:id — atualizar usuário
app.put('/api/admin/users/:id', requireAdmin, (req, res) => {
  const { name, plan, active, role } = req.body;
  queries.updateUser(req.params.id, { name, plan, active: active ? 1 : 0, role });
  res.json({ success: true });
});

// POST /api/admin/users/:id/password — mudar senha
app.post('/api/admin/users/:id/password', requireAdmin, (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
  }
  queries.changePassword(req.params.id, password);
  res.json({ success: true });
});

// DELETE /api/admin/users/:id — deletar usuário
app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'Você não pode deletar sua própria conta' });
  }
  queries.deleteUser(req.params.id);
  res.json({ success: true });
});

// GET /api/admin/stats
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  res.json(queries.getStats());
});

// ==========================================================================
// MCP Routes (Admin only)
// ==========================================================================

// GET /api/mcp/servers — Lista todos os servidores MCP e seus status
app.get('/api/mcp/servers', requireAdmin, (req, res) => {
  res.json(mcpManager.getStatus());
});

// POST /api/mcp/servers — Adicionar novo servidor MCP
app.post('/api/mcp/servers', requireAdmin, (req, res) => {
  const { name, command, args, env, description, transport } = req.body;
  if (!name || !command) {
    return res.status(400).json({ error: 'name e command são obrigatórios' });
  }
  try {
    const server = mcpManager.addServer(name, { command, args, env, description, transport });
    res.json({ success: true, server });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PUT /api/mcp/servers/:name — Atualizar configuração
app.put('/api/mcp/servers/:name', requireAdmin, (req, res) => {
  try {
    const server = mcpManager.updateServer(req.params.name, req.body);
    res.json({ success: true, server });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE /api/mcp/servers/:name — Remover servidor
app.delete('/api/mcp/servers/:name', requireAdmin, (req, res) => {
  try {
    mcpManager.removeServer(req.params.name);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/mcp/servers/:name/toggle — Ativar/desativar
app.post('/api/mcp/servers/:name/toggle', requireAdmin, async (req, res) => {
  try {
    const enabled = mcpManager.toggleServer(req.params.name);
    // Se ativou, tenta conectar automaticamente
    if (enabled) {
      try {
        await mcpManager.connectServer(req.params.name);
      } catch (e) {
        return res.json({ success: true, enabled, connected: false, error: e.message });
      }
    }
    const conn = mcpManager.servers.get(req.params.name);
    res.json({ success: true, enabled, connected: conn?.connected || false, toolCount: conn?.tools?.length || 0 });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/mcp/servers/:name/test — Testar conexão
app.post('/api/mcp/servers/:name/test', requireAdmin, async (req, res) => {
  try {
    const conn = await mcpManager.connectServer(req.params.name);
    res.json({ success: true, tools: conn.tools.length, resources: conn.resources.length, toolList: conn.tools.map(t => ({ name: t.name, description: t.description })) });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/mcp/tools — Listar todas as ferramentas MCP disponíveis
app.get('/api/mcp/tools', requireAdmin, (req, res) => {
  res.json(mcpManager.getAvailableTools());
});

// POST /api/mcp/connect-all — Conectar a todos os servidores habilitados
app.post('/api/mcp/connect-all', requireAdmin, async (req, res) => {
  try {
    const results = await mcpManager.connectAll();
    res.json({ success: true, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Preview — serve arquivos do workspace do usuário
// ==========================================================================
app.use('/preview', requireAuth, (req, res, next) => {
  const userWorkspace = getUserWorkspace(req.user.id);
  const filePath = path.resolve(userWorkspace, req.path.replace(/^\//, ''));
  if (!filePath.startsWith(userWorkspace)) return res.status(403).send('Forbidden');
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.sendFile(filePath);
});

// ==========================================================================
// Download ZIP
// ==========================================================================
function buildZip(sourceDir, ignore = []) {
  const zip = new AdmZip();
  function addDir(dir, zipPath) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = zipPath ? `${zipPath}/${entry.name}` : entry.name;
      if (ignore.some(ig => relPath.startsWith(ig) || entry.name === ig)) continue;
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        addDir(fullPath, relPath);
      } else {
        try { zip.addLocalFile(fullPath, zipPath || ''); } catch (e) {}
      }
    }
  }
  addDir(sourceDir, '');
  return zip;
}

app.get('/api/download-zip', requireAuth, (req, res) => {
  const userWorkspace = getUserWorkspace(req.user.id);
  const name = (req.query.name || 'projeto').replace(/[^a-zA-Z0-9_\-]/g, '_');
  try {
    const zip = buildZip(userWorkspace, ['node_modules', '.git', '__pycache__', '.env']);
    const buffer = zip.toBuffer();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.zip"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================================================
// REST API — File System (user-isolated)
// ==========================================================================
function getFileTree(dirPath, relativeTo, depth = 0) {
  if (depth > 4) return [];
  const entries = [];
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const item of items) {
      if (item.name.startsWith('.') || item.name === 'node_modules') continue;
      const fullPath = path.join(dirPath, item.name);
      const relPath = path.relative(relativeTo, fullPath).replace(/\\/g, '/');
      if (item.isDirectory()) {
        entries.push({ name: item.name, path: relPath, type: 'directory', children: getFileTree(fullPath, relativeTo, depth + 1) });
      } else {
        entries.push({ name: item.name, path: relPath, type: 'file', size: fs.statSync(fullPath).size });
      }
    }
  } catch (e) {}
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

app.get('/api/models', async (req, res) => {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!response.ok) throw new Error(response.statusText);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/tree', requireAuth, (req, res) => {
  const ws = getUserWorkspace(req.user.id);
  res.json(getFileTree(ws, ws));
});

app.get('/api/files/*', requireAuth, (req, res) => {
  const ws = getUserWorkspace(req.user.id);
  const fullPath = path.resolve(ws, req.params[0]);
  if (!fullPath.startsWith(ws)) return res.status(403).json({ error: 'Access denied' });
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found' });
  try {
    res.json({ path: req.params[0], content: fs.readFileSync(fullPath, 'utf8') });
  } catch (e) {
    res.status(500).json({ error: 'Could not read file' });
  }
});

app.post('/api/files/*', requireAuth, (req, res) => {
  const ws = getUserWorkspace(req.user.id);
  const fullPath = path.resolve(ws, req.params[0]);
  if (!fullPath.startsWith(ws)) return res.status(403).json({ error: 'Access denied' });
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, req.body.content || '', 'utf8');
  res.json({ success: true, path: req.params[0] });
});

app.delete('/api/files/*', requireAuth, (req, res) => {
  const ws = getUserWorkspace(req.user.id);
  const fullPath = path.resolve(ws, req.params[0]);
  if (!fullPath.startsWith(ws)) return res.status(403).json({ error: 'Access denied' });
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Not found' });
  const stat = fs.statSync(fullPath);
  if (stat.isDirectory()) fs.rmSync(fullPath, { recursive: true });
  else fs.unlinkSync(fullPath);
  res.json({ success: true });
});

app.put('/api/files/rename', requireAuth, (req, res) => {
  const ws = getUserWorkspace(req.user.id);
  const { oldPath, newPath } = req.body;
  const fullOld = path.resolve(ws, oldPath);
  const fullNew = path.resolve(ws, newPath);
  if (!fullOld.startsWith(ws) || !fullNew.startsWith(ws)) return res.status(403).json({ error: 'Access denied' });
  if (!fs.existsSync(fullOld)) return res.status(404).json({ error: 'Source not found' });
  const dir = path.dirname(fullNew);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.renameSync(fullOld, fullNew);
  res.json({ success: true });
});

// ==========================================================================
// REST API — Chat History (per-user)
// ==========================================================================
function readHistory(userId) {
  try { return JSON.parse(fs.readFileSync(getUserHistoryFile(userId), 'utf8')); }
  catch { return []; }
}

function writeHistory(userId, data) {
  fs.writeFileSync(getUserHistoryFile(userId), JSON.stringify(data, null, 2), 'utf8');
}

app.get('/api/history', requireAuth, (req, res) => {
  res.json(readHistory(req.user.id));
});

app.post('/api/history', requireAuth, (req, res) => {
  const { id, title, messages, systemPrompt, temperature, model, timestamp } = req.body;
  if (!id) return res.status(400).json({ error: 'ID required' });
  const history = readHistory(req.user.id);
  const idx = history.findIndex(c => c.id === id);
  const chat = { id, title: title || 'Novo Chat', messages: messages || [], systemPrompt: systemPrompt || '', temperature: temperature ?? 0.7, model: model || '', timestamp: timestamp || new Date().toISOString() };
  if (idx !== -1) history[idx] = chat; else history.unshift(chat);
  writeHistory(req.user.id, history);
  res.json(chat);
});

app.delete('/api/history/:id', requireAuth, (req, res) => {
  let history = readHistory(req.user.id);
  history = history.filter(c => c.id !== req.params.id);
  writeHistory(req.user.id, history);
  res.json({ success: true });
});

// ==========================================================================
// REST API — Git / GitHub (per-user workspace)
// ==========================================================================
function getGitConfigFile(userId) {
  return path.join(__dirname, 'data', `github-${userId}.json`);
}

function readGitConfig(userId) {
  try { return JSON.parse(fs.readFileSync(getGitConfigFile(userId), 'utf8')); }
  catch { return { token: null, username: null }; }
}

function writeGitConfig(userId, config) {
  fs.writeFileSync(getGitConfigFile(userId), JSON.stringify(config, null, 2), 'utf8');
}

function execGit(args, cwd) {
  const { execSync } = require('child_process');
  try {
    const result = execSync(`git ${args}`, {
      cwd,
      encoding: 'utf8',
      timeout: 30000,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    });
    return { success: true, output: result.trim() };
  } catch (e) {
    return { success: false, output: ((e.stdout || '') + (e.stderr || e.message)).trim() };
  }
}

app.get('/api/git/check', requireAuth, (req, res) => {
  const result = execGit('--version', getUserWorkspace(req.user.id));
  res.json({ installed: result.success, version: result.output });
});

app.post('/api/github/connect', requireAuth, async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': 'Agente-IA-IDE' }
    });
    if (!response.ok) throw new Error('Token inválido');
    const user = await response.json();
    writeGitConfig(req.user.id, { token, username: user.login, name: user.name, avatar: user.avatar_url });
    res.json({ success: true, user: { login: user.login, name: user.name, avatar: user.avatar_url } });
  } catch (e) {
    res.status(401).json({ error: e.message });
  }
});

app.post('/api/github/disconnect', requireAuth, (req, res) => {
  writeGitConfig(req.user.id, { token: null, username: null });
  res.json({ success: true });
});

app.get('/api/github/status', requireAuth, (req, res) => {
  const config = readGitConfig(req.user.id);
  if (!config.token) return res.json({ connected: false });
  res.json({ connected: true, user: { login: config.username, name: config.name, avatar: config.avatar } });
});

app.get('/api/github/repos', requireAuth, async (req, res) => {
  const config = readGitConfig(req.user.id);
  if (!config.token) return res.status(401).json({ error: 'Not connected' });
  try {
    const response = await fetch('https://api.github.com/user/repos?sort=updated&per_page=30', {
      headers: { 'Authorization': `Bearer ${config.token}`, 'User-Agent': 'Agente-IA-IDE' }
    });
    const repos = await response.json();
    res.json(repos.map(r => ({ name: r.name, full_name: r.full_name, description: r.description, private: r.private, url: r.html_url, clone_url: r.clone_url, default_branch: r.default_branch, updated_at: r.updated_at })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/github/create-repo', requireAuth, async (req, res) => {
  const config = readGitConfig(req.user.id);
  if (!config.token) return res.status(401).json({ error: 'Not connected' });
  const { name, description, isPrivate } = req.body;
  try {
    const response = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${config.token}`, 'User-Agent': 'Agente-IA-IDE', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: description || '', private: isPrivate || false })
    });
    const repo = await response.json();
    if (!response.ok) throw new Error(repo.message || 'Failed to create repo');
    res.json({ success: true, repo: { name: repo.name, full_name: repo.full_name, clone_url: repo.clone_url } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/git/status', requireAuth, (req, res) => {
  const ws = getUserWorkspace(req.user.id);
  const status = execGit('status --porcelain', ws);
  const branch = execGit('branch --show-current', ws);
  const remote = execGit('remote -v', ws);
  const isRepo = execGit('rev-parse --is-inside-work-tree', ws);
  res.json({ isRepo: isRepo.success, branch: branch.output || 'main', status: status.output || '', remote: remote.output || '', files: status.output ? status.output.split('\n').filter(Boolean).map(line => ({ status: line.substring(0, 2).trim(), file: line.substring(3) })) : [] });
});

app.post('/api/git/init', requireAuth, (req, res) => {
  const ws = getUserWorkspace(req.user.id);
  const result = execGit('init', ws);
  if (result.success) execGit('branch -M main', ws);
  res.json(result);
});

app.post('/api/git/add', requireAuth, (req, res) => {
  const ws = getUserWorkspace(req.user.id);
  const { files } = req.body;
  res.json(execGit(`add ${files || '.'}`, ws));
});

app.post('/api/git/commit', requireAuth, (req, res) => {
  const ws = getUserWorkspace(req.user.id);
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });
  res.json(execGit(`commit -m "${message.replace(/"/g, '\\"')}"`, ws));
});

app.post('/api/git/push', requireAuth, (req, res) => {
  const ws = getUserWorkspace(req.user.id);
  const config = readGitConfig(req.user.id);
  if (!config.token) return res.status(401).json({ error: 'Not connected to GitHub' });
  const remoteResult = execGit('remote get-url origin', ws);
  if (!remoteResult.success) return res.status(400).json({ error: 'No remote configured.' });
  let remoteUrl = remoteResult.output;
  if (remoteUrl.startsWith('https://')) {
    const authUrl = remoteUrl.replace('https://', `https://${config.username}:${config.token}@`);
    res.json(execGit(`push ${authUrl} HEAD`, ws));
  } else {
    res.json(execGit('push', ws));
  }
});

app.post('/api/git/pull', requireAuth, (req, res) => {
  const ws = getUserWorkspace(req.user.id);
  const config = readGitConfig(req.user.id);
  const remoteResult = execGit('remote get-url origin', ws);
  if (!remoteResult.success) return res.status(400).json({ error: 'No remote configured.' });
  let remoteUrl = remoteResult.output;
  if (config.token && remoteUrl.startsWith('https://')) {
    const authUrl = remoteUrl.replace('https://', `https://${config.username}:${config.token}@`);
    res.json(execGit(`pull ${authUrl}`, ws));
  } else {
    res.json(execGit('pull', ws));
  }
});

app.post('/api/git/remote', requireAuth, (req, res) => {
  const ws = getUserWorkspace(req.user.id);
  const { url } = req.body;
  execGit('remote remove origin', ws);
  res.json(execGit(`remote add origin ${url}`, ws));
});

app.post('/api/git/clone', requireAuth, (req, res) => {
  const ws = getUserWorkspace(req.user.id);
  const config = readGitConfig(req.user.id);
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });
  let cloneUrl = url;
  if (config.token && cloneUrl.startsWith('https://')) {
    cloneUrl = cloneUrl.replace('https://', `https://${config.username}:${config.token}@`);
  }
  res.json(execGit(`clone ${cloneUrl} .`, ws));
});

// ==========================================================================
// REST API — Project Runner (▶ Rodar Projeto)
// ==========================================================================
const { spawn: spawnProc } = require('child_process');
const runningProjects = new Map(); // userId → { process, port, command }

function detectRunCommand(workspacePath) {
  const pkgPath = path.join(workspacePath, 'package.json');
  const tsconfigPath = path.join(workspacePath, 'tsconfig.json');
  const hasTsconfig = fs.existsSync(tsconfigPath);

  // Detectar entry point
  const candidates = ['server.ts', 'src/server.ts', 'src/index.ts', 'index.ts',
                      'app.ts', 'src/app.ts', 'server.js', 'src/server.js',
                      'index.js', 'app.js', 'main.ts', 'main.py', 'app.py'];

  let entry = null;
  for (const c of candidates) {
    if (fs.existsSync(path.join(workspacePath, c))) { entry = c; break; }
  }

  // Verificar scripts no package.json
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.scripts?.dev) return { cmd: 'npm run dev', entry };
      if (pkg.scripts?.start) return { cmd: 'npm start', entry };
    } catch (e) {}
  }

  if (!entry) return null;

  if (entry.endsWith('.ts')) {
    // TypeScript: compilar e rodar ou usar ts-node
    const distEntry = entry.replace(/^src\//, 'dist/').replace('.ts', '.js');
    if (fs.existsSync(path.join(workspacePath, distEntry))) {
      return { cmd: `node ${distEntry}`, entry };
    }
    return { cmd: `npx ts-node ${entry}`, entry };
  } else if (entry.endsWith('.js')) {
    return { cmd: `node ${entry}`, entry };
  } else if (entry.endsWith('.py')) {
    return { cmd: `python ${entry}`, entry };
  }
  return null;
}

function findFreeProjectPort(userId) {
  const usedPorts = new Set([...runningProjects.values()].map(p => p.port));
  for (let port = 3001; port <= 3005; port++) {
    if (!usedPorts.has(port)) return port;
  }
  return 3001; // fallback, kill current
}

app.post('/api/project/run', requireAuth, (req, res) => {
  const ws = getUserWorkspace(req.user.id);
  const { port: requestedPort } = req.body;

  // Matar processo anterior do mesmo usuário
  if (runningProjects.has(req.user.id)) {
    try { runningProjects.get(req.user.id).process.kill(); } catch (e) {}
    runningProjects.delete(req.user.id);
  }

  const detected = detectRunCommand(ws);
  if (!detected) {
    return res.status(400).json({ success: false, error: 'Nenhum projeto detectado. Precisa de server.ts, server.js, index.ts ou package.json com script start/dev.' });
  }

  const port = requestedPort || findFreeProjectPort(req.user.id);
  const proc = spawnProc(detected.cmd, [], {
    cwd: ws,
    shell: true,
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port), NODE_ENV: 'development' }
  });

  let output = '';
  let started = false;
  proc.stdout?.on('data', d => { output += d.toString(); if (!started) started = true; });
  proc.stderr?.on('data', d => { output += d.toString(); });
  proc.on('exit', (code) => {
    if (runningProjects.get(req.user.id)?.process === proc) {
      runningProjects.delete(req.user.id);
    }
  });

  runningProjects.set(req.user.id, { process: proc, port, command: detected.cmd, entry: detected.entry, startedAt: new Date().toISOString() });

  // Aguarda 3s para verificar se o processo não morreu
  setTimeout(() => {
    if (proc.exitCode !== null) {
      res.json({ success: false, error: `Processo encerrou (exit ${proc.exitCode}):\n${output.slice(-500)}` });
    } else {
      res.json({ success: true, port, url: `http://localhost:${port}`, command: detected.cmd, output: output.slice(-300) });
    }
  }, 3000);
});

app.get('/api/project/status', requireAuth, (req, res) => {
  const proj = runningProjects.get(req.user.id);
  if (!proj || proj.process.exitCode !== null) {
    runningProjects.delete(req.user.id);
    return res.json({ running: false });
  }
  res.json({ running: true, port: proj.port, url: `http://localhost:${proj.port}`, command: proj.command });
});

app.post('/api/project/stop', requireAuth, (req, res) => {
  const proj = runningProjects.get(req.user.id);
  if (proj) {
    try { proj.process.kill(); } catch (e) {}
    runningProjects.delete(req.user.id);
  }
  res.json({ success: true });
});

// ==========================================================================
// Socket.IO — Auth + Terminal + Agent (per-user)
// ==========================================================================
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.headers?.cookie?.match(/ide_token=([^;]+)/)?.[1];
  if (!token) return next(new Error('Authentication required'));
  const user = verifyToken(token);
  if (!user) return next(new Error('Invalid token'));
  socket.user = user;
  next();
});

// Per-user file watchers
const userWatchers = new Map();

// Per-socket interrupt queues (mensagens enviadas durante execução do agente)
const socketInterruptQueues = new Map(); // socketId → string[]

io.on('connection', (socket) => {
  const user = socket.user;
  const userWorkspace = getUserWorkspace(user.id);

  console.log(`[WS] ${user.name} (${user.email}) conectado`);

  // Setup file watcher for this user's workspace
  if (!userWatchers.has(user.id)) {
    const watcher = chokidar.watch(userWorkspace, {
      ignored: /(^|[/\\])\.|node_modules/,
      persistent: true,
      ignoreInitial: true,
      depth: 5
    });
    watcher.on('all', (event, filePath) => {
      const relativePath = path.relative(userWorkspace, filePath).replace(/\\/g, '/');
      // Only emit to sockets of this user
      io.sockets.sockets.forEach(s => {
        if (s.user?.id === user.id) {
          s.emit('fs-change', { event, path: relativePath });
        }
      });
    });
    userWatchers.set(user.id, watcher);
  }

  let termProcess = null;

  // Fila de interrupção: mensagens enviadas enquanto o agente trabalha
  socketInterruptQueues.set(socket.id, []);

  socket.on('agent-interrupt', (data) => {
    const queue = socketInterruptQueues.get(socket.id) || [];
    if (data.content?.trim()) {
      queue.push(data.content.trim());
      socketInterruptQueues.set(socket.id, queue);
      socket.emit('interrupt-queued', { position: queue.length, content: data.content });
      console.log(`[FILA] ${user.name}: "${data.content.substring(0, 50)}" (${queue.length} na fila)`);
    }
  });

  // Terminal
  socket.on('terminal-start', () => {
    if (termProcess) { try { termProcess.kill(); } catch (e) {} }
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
    termProcess = spawn(shell, [], {
      cwd: userWorkspace,
      env: { ...process.env, TERM: 'xterm-256color' },
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    termProcess.stdout.on('data', (data) => socket.emit('terminal-output', data.toString()));
    termProcess.stderr.on('data', (data) => socket.emit('terminal-output', data.toString()));
    termProcess.on('exit', (code) => {
      socket.emit('terminal-output', `\r\nProcess exited with code ${code}\r\n`);
      termProcess = null;
    });
    socket.emit('terminal-ready');
  });

  socket.on('terminal-input', (data) => {
    if (termProcess && termProcess.stdin.writable) termProcess.stdin.write(data);
  });

  // Agent — com fila de interrupção
  socket.on('agent-message', async (data) => {
    const { model, messages, chatId } = data;

    // Limpa fila de interrupts ao iniciar nova conversa
    socketInterruptQueues.set(socket.id, []);

    // Função que o agente chama entre iterações para verificar mensagens na fila
    const getNextInterrupt = () => {
      const queue = socketInterruptQueues.get(socket.id) || [];
      if (queue.length === 0) return null;
      const msg = queue.shift(); // pega a próxima da fila
      socketInterruptQueues.set(socket.id, queue);
      return msg;
    };

    try {
      const result = await runAgentLoop(OLLAMA_URL, model, messages, userWorkspace, socket, getNextInterrupt);
      socket.emit('agent-complete', { chatId, content: result.content, iterations: result.iterations, error: result.error || false });
    } catch (error) {
      socket.emit('agent-error', { error: error.message });
    }
  });

  socket.on('agent-stop', () => {});

  socket.on('disconnect', () => {
    console.log(`[WS] ${user.name} desconectado`);
    socketInterruptQueues.delete(socket.id);
    if (termProcess) { try { termProcess.kill(); } catch (e) {} }
  });
});

// ==========================================================================
// Iniciar Servidor
// ==========================================================================
server.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const localIP = Object.values(os.networkInterfaces()).flat().find(i => i.family === 'IPv4' && !i.internal)?.address || 'localhost';
  console.log(`\n🚀 IDE Agêntica SaaS rodando em:`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Rede:    http://${localIP}:${PORT}`);
  console.log(`   Ollama:  ${OLLAMA_URL}`);
  console.log(`   Admin:   http://localhost:${PORT}/admin`);
  console.log(`   Login:   http://localhost:${PORT}/login`);

  // Inicializar MCP Manager
  console.log(`\n🔌 Inicializando MCP Manager...`);
  mcpManager.loadConfig();
  const enabledCount = Object.values(mcpManager.config.servers || {}).filter(s => s.enabled).length;
  console.log(`   ${Object.keys(mcpManager.config.servers || {}).length} servidor(es) configurado(s), ${enabledCount} habilitado(s)`);
  if (enabledCount > 0) {
    mcpManager.connectAll().then(results => {
      for (const [name, result] of Object.entries(results)) {
        if (result.status === 'connected') {
          console.log(`   ✅ MCP "${name}": conectado (${result.tools} tools)`);
        } else if (result.status === 'error') {
          console.log(`   ❌ MCP "${name}": ${result.error}`);
        } else {
          console.log(`   ⏸️  MCP "${name}": ${result.status}`);
        }
      }
      console.log('');
    }).catch(e => {
      console.error(`   ❌ Erro ao conectar MCP:`, e.message, '\n');
    });
  } else {
    console.log(`   ℹ️  Nenhum servidor MCP habilitado. Configure em: Admin → MCP Servers\n`);
  }
});
