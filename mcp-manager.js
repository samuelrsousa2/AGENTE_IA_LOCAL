// ==========================================================================
// MCP Manager — Gerencia conexões com servidores MCP (Model Context Protocol)
// ==========================================================================
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const MCP_CONFIG_PATH = process.env.MCP_CONFIG_PATH || path.join(__dirname, 'data', 'mcp-servers.json');

// ==========================================================================
// MCPServerConnection — Conexão individual com um servidor MCP via stdio
// ==========================================================================
class MCPServerConnection {
  constructor(name, config) {
    this.name = name;
    this.config = config;
    this.process = null;
    this.connected = false;
    this.tools = [];
    this.resources = [];
    this._requestId = 0;
    this._pendingRequests = new Map();
    this._buffer = '';
  }

  async connect() {
    if (this.connected) return;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout connecting to MCP server "${this.name}"`));
      }, 15000);

      try {
        const env = { ...process.env, ...(this.config.env || {}) };
        this.process = spawn(this.config.command, this.config.args || [], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env,
          shell: true
        });

        this.process.stdout.on('data', (data) => {
          this._buffer += data.toString();
          this._processBuffer();
        });

        this.process.stderr.on('data', (data) => {
          console.error(`[MCP:${this.name}] stderr:`, data.toString().trim());
        });

        this.process.on('error', (err) => {
          console.error(`[MCP:${this.name}] Process error:`, err.message);
          this.connected = false;
          clearTimeout(timeout);
          reject(err);
        });

        this.process.on('exit', (code) => {
          console.log(`[MCP:${this.name}] Process exited with code ${code}`);
          this.connected = false;
        });

        // Send initialize request (JSON-RPC 2.0)
        this._sendRequest('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'agente-ia-ide', version: '2.0.0' }
        }).then(async (result) => {
          clearTimeout(timeout);
          this.connected = true;

          // Send initialized notification
          this._sendNotification('notifications/initialized', {});

          // Discover tools
          try {
            const toolsResult = await this._sendRequest('tools/list', {});
            this.tools = (toolsResult.tools || []).map(t => ({
              name: t.name,
              description: t.description || '',
              inputSchema: t.inputSchema || {},
              server: this.name
            }));
          } catch (e) {
            this.tools = [];
          }

          // Discover resources
          try {
            const resourcesResult = await this._sendRequest('resources/list', {});
            this.resources = resourcesResult.resources || [];
          } catch (e) {
            this.resources = [];
          }

          console.log(`[MCP:${this.name}] ✅ Connected — ${this.tools.length} tools, ${this.resources.length} resources`);
          resolve();
        }).catch((err) => {
          clearTimeout(timeout);
          reject(err);
        });

      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  }

  async callTool(toolName, args) {
    if (!this.connected) throw new Error(`MCP server "${this.name}" is not connected`);
    const result = await this._sendRequest('tools/call', {
      name: toolName,
      arguments: args || {}
    });
    // Extract text content from MCP response
    if (result.content && Array.isArray(result.content)) {
      return result.content.map(c => {
        if (c.type === 'text') return c.text;
        if (c.type === 'image') return `[Image: ${c.mimeType}]`;
        if (c.type === 'resource') return `[Resource: ${c.resource?.uri}]`;
        return JSON.stringify(c);
      }).join('\n');
    }
    return JSON.stringify(result);
  }

  async readResource(uri) {
    if (!this.connected) throw new Error(`MCP server "${this.name}" is not connected`);
    const result = await this._sendRequest('resources/read', { uri });
    if (result.contents && Array.isArray(result.contents)) {
      return result.contents.map(c => c.text || JSON.stringify(c)).join('\n');
    }
    return JSON.stringify(result);
  }

  disconnect() {
    if (this.process) {
      try { this.process.kill(); } catch (e) {}
      this.process = null;
    }
    this.connected = false;
    this.tools = [];
    this.resources = [];
    this._pendingRequests.clear();
    this._buffer = '';
  }

  // ── JSON-RPC 2.0 Communication ──────────────────────────────────

  _sendRequest(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++this._requestId;
      const message = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params
      });

      const timeout = setTimeout(() => {
        this._pendingRequests.delete(id);
        reject(new Error(`Timeout waiting for response to "${method}" from "${this.name}"`));
      }, 30000);

      this._pendingRequests.set(id, { resolve, reject, timeout });

      this.process.stdin.write(message + '\n');
    });
  }

  _sendNotification(method, params) {
    const message = JSON.stringify({
      jsonrpc: '2.0',
      method,
      params
    });
    try {
      this.process.stdin.write(message + '\n');
    } catch (e) {
      console.error(`[MCP:${this.name}] Failed to send notification:`, e.message);
    }
  }

  _processBuffer() {
    const lines = this._buffer.split('\n');
    this._buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        if (msg.id !== undefined && this._pendingRequests.has(msg.id)) {
          const pending = this._pendingRequests.get(msg.id);
          this._pendingRequests.delete(msg.id);
          clearTimeout(pending.timeout);

          if (msg.error) {
            pending.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          } else {
            pending.resolve(msg.result);
          }
        }
        // Notifications from server (log, progress, etc.) — just log
        else if (!msg.id && msg.method) {
          // Server-sent notification
        }
      } catch (e) {
        // Not valid JSON — ignore
      }
    }
  }
}

// ==========================================================================
// MCPManager — Gerencia múltiplos servidores MCP
// ==========================================================================
class MCPManager {
  constructor() {
    this.servers = new Map(); // name → MCPServerConnection
    this.config = { servers: {} };
  }

  // Carrega configuração do arquivo JSON
  loadConfig() {
    try {
      if (fs.existsSync(MCP_CONFIG_PATH)) {
        const raw = fs.readFileSync(MCP_CONFIG_PATH, 'utf8');
        this.config = JSON.parse(raw);
      } else {
        // Cria arquivo de configuração padrão
        this.config = { servers: {} };
        this.saveConfig();
      }
    } catch (e) {
      console.error('[MCP] Error loading config:', e.message);
      this.config = { servers: {} };
    }
  }

  // Salva configuração no arquivo JSON
  saveConfig() {
    try {
      const dir = path.dirname(MCP_CONFIG_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(MCP_CONFIG_PATH, JSON.stringify(this.config, null, 2), 'utf8');
    } catch (e) {
      console.error('[MCP] Error saving config:', e.message);
    }
  }

  // Conecta a todos os servidores habilitados
  async connectAll() {
    this.loadConfig();
    const results = {};

    for (const [name, config] of Object.entries(this.config.servers || {})) {
      if (!config.enabled) {
        results[name] = { status: 'disabled' };
        continue;
      }
      try {
        const conn = new MCPServerConnection(name, config);
        await conn.connect();
        this.servers.set(name, conn);
        results[name] = { status: 'connected', tools: conn.tools.length };
      } catch (e) {
        console.error(`[MCP] Failed to connect to "${name}":`, e.message);
        results[name] = { status: 'error', error: e.message };
      }
    }

    return results;
  }

  // Conecta a um servidor específico
  async connectServer(name) {
    const config = this.config.servers?.[name];
    if (!config) throw new Error(`MCP server "${name}" not found in config`);

    // Desconecta se já existir
    if (this.servers.has(name)) {
      this.servers.get(name).disconnect();
      this.servers.delete(name);
    }

    const conn = new MCPServerConnection(name, config);
    await conn.connect();
    this.servers.set(name, conn);
    return conn;
  }

  // Desconecta de um servidor
  disconnectServer(name) {
    if (this.servers.has(name)) {
      this.servers.get(name).disconnect();
      this.servers.delete(name);
    }
  }

  // Desconecta de todos
  disconnectAll() {
    for (const [name, conn] of this.servers) {
      conn.disconnect();
    }
    this.servers.clear();
  }

  // Retorna lista de todas as ferramentas MCP disponíveis
  getAvailableTools() {
    const tools = [];
    for (const [name, conn] of this.servers) {
      if (!conn.connected) continue;
      for (const tool of conn.tools) {
        tools.push({
          server: name,
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        });
      }
    }
    return tools;
  }

  // Executa uma ferramenta MCP
  async callTool(serverName, toolName, args) {
    const conn = this.servers.get(serverName);
    if (!conn) throw new Error(`MCP server "${serverName}" not found or not connected`);
    if (!conn.connected) throw new Error(`MCP server "${serverName}" is not connected`);
    return await conn.callTool(toolName, args);
  }

  // Retorna status de todos os servidores
  getStatus() {
    const status = {};
    for (const [name, config] of Object.entries(this.config.servers || {})) {
      const conn = this.servers.get(name);
      status[name] = {
        ...config,
        connected: conn?.connected || false,
        toolCount: conn?.tools?.length || 0,
        tools: conn?.tools?.map(t => ({ name: t.name, description: t.description })) || []
      };
    }
    return status;
  }

  // ── CRUD de servidores ──────────────────────────────────────────

  addServer(name, config) {
    if (this.config.servers[name]) throw new Error(`Server "${name}" already exists`);
    this.config.servers[name] = {
      enabled: config.enabled !== false,
      transport: config.transport || 'stdio',
      command: config.command,
      args: config.args || [],
      env: config.env || {},
      description: config.description || ''
    };
    this.saveConfig();
    return this.config.servers[name];
  }

  updateServer(name, updates) {
    if (!this.config.servers[name]) throw new Error(`Server "${name}" not found`);
    Object.assign(this.config.servers[name], updates);
    this.saveConfig();
    return this.config.servers[name];
  }

  removeServer(name) {
    if (!this.config.servers[name]) throw new Error(`Server "${name}" not found`);
    this.disconnectServer(name);
    delete this.config.servers[name];
    this.saveConfig();
  }

  toggleServer(name) {
    if (!this.config.servers[name]) throw new Error(`Server "${name}" not found`);
    this.config.servers[name].enabled = !this.config.servers[name].enabled;
    if (!this.config.servers[name].enabled) {
      this.disconnectServer(name);
    }
    this.saveConfig();
    return this.config.servers[name].enabled;
  }
}

// Singleton
const mcpManager = new MCPManager();

module.exports = { mcpManager, MCPManager, MCPServerConnection };
