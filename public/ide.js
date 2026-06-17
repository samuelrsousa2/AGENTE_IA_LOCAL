// ==========================================================================
// IDE Logic: File Explorer, Monaco Editor, Terminal
// ==========================================================================

// Globals
var monacoEditor = null;
var monacoModels = {}; // path -> monaco model
var openTabs = []; // [{ path, name, modified }]
var activeTab = null; // path of active tab
var fileTreeData = [];
var xterm = null;
var fitAddon = null;

// Socket compartilhado via window
window.appSocket = null;

// ==========================================================================
// Boot
// ==========================================================================
window.addEventListener('DOMContentLoaded', () => {
  console.log('[IDE] Initializing...');

  // Connect Socket.IO
  try {
    window.appSocket = io();
    window.appSocket.on('connect', () => console.log('[IDE] Socket.IO connected:', window.appSocket.id));
    window.appSocket.on('connect_error', (e) => console.error('[IDE] Socket error:', e.message));
  } catch (e) {
    console.error('[IDE] Socket.IO failed:', e);
  }

  // Init components
  loadFileTree();
  initTerminal();
  initMonaco();
  initResizeHandlers();
  initMobileBar();
  initExplorerButtons();
  initProjectRunner();

  // File System Events are handled in the boot function above

  if (window.appSocket) {
    window.appSocket.on('fs-change', () => loadFileTree());
  }

  console.log('[IDE] Ready!');
});

// ==========================================================================
// Monaco Editor
// ==========================================================================
function initMonaco() {
  if (typeof require === 'undefined' || !require.config) {
    console.warn('[IDE] Monaco loader not available');
    return;
  }

  require.config({
    paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' }
  });

  require(['vs/editor/editor.main'], function () {
    monaco.editor.defineTheme('agenteTheme', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#0d1117',
        'editor.foreground': '#e6edf3',
        'editorLineNumber.foreground': '#484f58',
        'editorLineNumber.activeForeground': '#7d8590',
        'editor.selectionBackground': '#264f78',
        'editor.lineHighlightBackground': '#161b22',
        'editorCursor.foreground': '#6366f1',
        'editorIndentGuide.background': '#21262d'
      }
    });

    monacoEditor = monaco.editor.create(document.getElementById('editor-area'), {
      value: '',
      language: 'plaintext',
      theme: 'agenteTheme',
      fontFamily: "'JetBrains Mono', Consolas, monospace",
      fontSize: 14,
      lineHeight: 22,
      minimap: { enabled: true, scale: 1 },
      automaticLayout: true,
      scrollBeyondLastLine: false,
      padding: { top: 8, bottom: 8 },
      wordWrap: 'on',
      tabSize: 2,
      renderWhitespace: 'selection',
      bracketPairColorization: { enabled: true },
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on'
    });

    monacoEditor.getContainerDomNode().style.display = 'none';

    monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveCurrentFile();
    });

    monacoEditor.onDidChangeModelContent(() => {
      if (activeTab) {
        const tab = openTabs.find(t => t.path === activeTab);
        if (tab && !tab.modified) {
          tab.modified = true;
          renderTabs();
        }
      }
    });

    console.log('[IDE] Monaco Editor ready');
  });
}

// ==========================================================================
// File Explorer
// ==========================================================================
async function loadFileTree() {
  try {
    const res = await fetch('/api/tree');
    fileTreeData = await res.json();
    renderFileTree(fileTreeData, document.getElementById('file-tree'), 0);
    console.log('[IDE] File tree loaded:', fileTreeData.length, 'items');
  } catch (e) {
    console.error('[IDE] Error loading file tree:', e);
  }
}

function renderFileTree(items, container, depth) {
  container.innerHTML = '';
  for (const item of items) {
    if (item.type === 'directory') {
      const dirEl = document.createElement('div');
      dirEl.className = 'tree-dir';

      const itemEl = document.createElement('div');
      itemEl.className = 'tree-item';
      itemEl.style.paddingLeft = (8 + depth * 16) + 'px';
      itemEl.innerHTML = `<span class="tree-chevron">▸</span> 📁 <span class="tree-item-name">${item.name}</span>`;

      const childrenEl = document.createElement('div');
      childrenEl.className = 'tree-children';

      itemEl.addEventListener('click', () => {
        const isOpen = childrenEl.classList.toggle('open');
        itemEl.querySelector('.tree-chevron').textContent = isOpen ? '▾' : '▸';
      });

      itemEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e, item);
      });

      dirEl.appendChild(itemEl);
      dirEl.appendChild(childrenEl);
      container.appendChild(dirEl);

      if (item.children && item.children.length > 0) {
        renderFileTree(item.children, childrenEl, depth + 1);
      }
    } else {
      const fileEl = document.createElement('div');
      fileEl.className = 'tree-item';
      fileEl.style.paddingLeft = (8 + depth * 16) + 'px';
      const icon = getFileIcon(item.name);
      fileEl.innerHTML = `${icon} <span class="tree-item-name">${item.name}</span>`;

      fileEl.addEventListener('click', () => openFile(item.path));
      fileEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e, item);
      });

      container.appendChild(fileEl);
    }
  }
}

function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const icons = {
    js: '🟨', ts: '🔷', jsx: '⚛️', tsx: '⚛️',
    html: '🟧', css: '🔵', json: '📋',
    py: '🐍', md: '📝', txt: '📄',
    yml: '⚙️', yaml: '⚙️', xml: '📰',
    sh: '🖥️', bash: '🖥️', env: '🔒',
    default: '📄'
  };
  return icons[ext] || icons.default;
}

function getLanguage(name) {
  const ext = name.split('.').pop().toLowerCase();
  const langs = {
    js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript',
    html: 'html', css: 'css', json: 'json', md: 'markdown',
    py: 'python', yml: 'yaml', yaml: 'yaml', xml: 'xml',
    sh: 'shell', bash: 'shell', sql: 'sql', java: 'java',
    cpp: 'cpp', c: 'c', cs: 'csharp', rb: 'ruby', php: 'php',
    go: 'go', rs: 'rust', toml: 'toml', env: 'ini'
  };
  return langs[ext] || 'plaintext';
}

// ==========================================================================
// File Opening & Tabs
// ==========================================================================
async function openFile(filePath) {
  const existingTab = openTabs.find(t => t.path === filePath);
  if (existingTab) {
    activateTab(filePath);
    return;
  }

  try {
    const res = await fetch(`/api/files/${filePath}`);
    if (!res.ok) throw new Error('Failed to load');
    const data = await res.json();
    const name = filePath.split('/').pop();
    const language = getLanguage(name);

    if (!monacoEditor || typeof monaco === 'undefined') {
      console.warn('[IDE] Monaco not ready yet');
      return;
    }

    const model = monaco.editor.createModel(data.content, language);
    monacoModels[filePath] = model;
    openTabs.push({ path: filePath, name, modified: false });
    activateTab(filePath);
    renderTabs();
  } catch (e) {
    console.error('[IDE] Error opening file:', e);
  }
}

function activateTab(filePath) {
  activeTab = filePath;
  const model = monacoModels[filePath];
  if (model && monacoEditor) {
    monacoEditor.setModel(model);
    monacoEditor.getContainerDomNode().style.display = 'block';
    document.getElementById('editor-welcome').style.display = 'none';
  }
  renderTabs();
  if (typeof updatePreviewButton === 'function') updatePreviewButton();
}

function closeTab(filePath) {
  const idx = openTabs.findIndex(t => t.path === filePath);
  if (idx === -1) return;

  if (monacoModels[filePath]) {
    monacoModels[filePath].dispose();
    delete monacoModels[filePath];
  }

  openTabs.splice(idx, 1);

  if (activeTab === filePath) {
    if (openTabs.length > 0) {
      activateTab(openTabs[Math.min(idx, openTabs.length - 1)].path);
    } else {
      activeTab = null;
      if (monacoEditor) {
        monacoEditor.setModel(null);
        monacoEditor.getContainerDomNode().style.display = 'none';
      }
      document.getElementById('editor-welcome').style.display = 'flex';
    }
  }
  renderTabs();
}

function renderTabs() {
  const tabsScroll = document.getElementById('tabs-scroll');
  tabsScroll.innerHTML = '';

  if (openTabs.length === 0) {
    tabsScroll.innerHTML = '<div class="tab-placeholder">Abra um arquivo no explorador</div>';
    return;
  }

  for (const tab of openTabs) {
    const tabEl = document.createElement('div');
    tabEl.className = `tab ${tab.path === activeTab ? 'active' : ''} ${tab.modified ? 'modified' : ''}`;
    tabEl.innerHTML = `
      <span class="tab-name" title="${tab.path}">${tab.name}</span>
      <button class="tab-close" title="Fechar">✕</button>
    `;

    tabEl.querySelector('.tab-name').addEventListener('click', () => activateTab(tab.path));
    tabEl.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(tab.path);
    });

    tabsScroll.appendChild(tabEl);
  }
}

// ==========================================================================
// Save File
// ==========================================================================
async function saveCurrentFile() {
  if (!activeTab || !monacoModels[activeTab]) return;
  const content = monacoModels[activeTab].getValue();
  try {
    await fetch(`/api/files/${activeTab}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    const tab = openTabs.find(t => t.path === activeTab);
    if (tab) { tab.modified = false; renderTabs(); }
    console.log('[IDE] File saved:', activeTab);
  } catch (e) {
    console.error('[IDE] Error saving:', e);
  }
}

// ==========================================================================
// Terminal (xterm.js)
// ==========================================================================
function initTerminal() {
  if (typeof Terminal === 'undefined') {
    console.warn('[IDE] xterm.js not loaded');
    document.getElementById('terminal-container').innerHTML =
      '<div style="padding:12px;color:#7d8590;font-size:12px;">Terminal não disponível</div>';
    return;
  }

  const container = document.getElementById('terminal-container');

  xterm = new Terminal({
    fontFamily: "'JetBrains Mono', Consolas, monospace",
    fontSize: 13,
    lineHeight: 1.4,
    theme: {
      background: '#0a0c10',
      foreground: '#e6edf3',
      cursor: '#6366f1',
      selectionBackground: '#264f78',
      black: '#484f58', red: '#f85149', green: '#3fb950',
      yellow: '#d29922', blue: '#58a6ff', magenta: '#bc8cff',
      cyan: '#39d353', white: '#e6edf3'
    },
    cursorBlink: true,
    scrollback: 5000
  });

  if (typeof FitAddon !== 'undefined') {
    fitAddon = new FitAddon.FitAddon();
    xterm.loadAddon(fitAddon);
  }

  xterm.open(container);
  setTimeout(() => { if (fitAddon) fitAddon.fit(); }, 200);

  xterm.onData((data) => {
    if (window.appSocket) window.appSocket.emit('terminal-input', data);
  });

  if (window.appSocket) {
    window.appSocket.on('terminal-output', (data) => xterm.write(data));
    window.appSocket.on('terminal-ready', () => {
      xterm.clear();
      xterm.write('\x1b[36m~ Terminal conectado ~\x1b[0m\r\n\r\n');
    });
    window.appSocket.emit('terminal-start');
  }

  window.addEventListener('resize', () => { if (fitAddon) fitAddon.fit(); });
  console.log('[IDE] Terminal initialized');
}

// ==========================================================================
// Context Menu
// ==========================================================================
let contextMenuEl = null;

function showContextMenu(event, item) {
  removeContextMenu();
  contextMenuEl = document.createElement('div');
  contextMenuEl.className = 'context-menu';
  contextMenuEl.style.left = event.pageX + 'px';
  contextMenuEl.style.top = event.pageY + 'px';

  const actions = [];
  if (item.type === 'directory') {
    actions.push({ label: '📄 Novo Arquivo', action: () => createFileInDir(item.path) });
    actions.push({ label: '📁 Nova Pasta', action: () => createFolderInDir(item.path) });
  }
  actions.push({ label: '🗑️ Excluir', action: () => deleteItem(item.path), danger: true });

  for (const act of actions) {
    const menuItem = document.createElement('div');
    menuItem.className = `context-menu-item ${act.danger ? 'danger' : ''}`;
    menuItem.textContent = act.label;
    menuItem.addEventListener('click', () => { act.action(); removeContextMenu(); });
    contextMenuEl.appendChild(menuItem);
  }

  document.body.appendChild(contextMenuEl);
  setTimeout(() => document.addEventListener('click', removeContextMenu, { once: true }), 10);
}

function removeContextMenu() {
  if (contextMenuEl) { contextMenuEl.remove(); contextMenuEl = null; }
}

async function createFileInDir(dirPath) {
  const name = prompt('Nome do arquivo:');
  if (!name) return;
  const filePath = dirPath ? `${dirPath}/${name}` : name;
  await fetch(`/api/files/${filePath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '' })
  });
  loadFileTree();
  openFile(filePath);
}

async function createFolderInDir(dirPath) {
  const name = prompt('Nome da pasta:');
  if (!name) return;
  const folderPath = dirPath ? `${dirPath}/${name}` : name;
  await fetch(`/api/files/${folderPath}/.gitkeep`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '' })
  });
  loadFileTree();
}

async function deleteItem(itemPath) {
  if (!confirm(`Excluir "${itemPath}"?`)) return;
  await fetch(`/api/files/${itemPath}`, { method: 'DELETE' });
  if (openTabs.find(t => t.path === itemPath)) closeTab(itemPath);
  loadFileTree();
}

// ==========================================================================
// Explorer Buttons
// ==========================================================================
function initExplorerButtons() {
  document.getElementById('btn-new-file').addEventListener('click', () => createFileInDir(''));
  document.getElementById('btn-new-folder').addEventListener('click', () => createFolderInDir(''));
  document.getElementById('btn-refresh-tree').addEventListener('click', loadFileTree);

  document.getElementById('btn-toggle-terminal').addEventListener('click', () => {
    document.getElementById('terminal-area').classList.toggle('collapsed');
    if (monacoEditor) monacoEditor.layout();
    if (fitAddon) setTimeout(() => fitAddon.fit(), 100);
  });

  document.getElementById('btn-clear-terminal').addEventListener('click', () => {
    if (xterm) xterm.clear();
  });

  // Preview buttons
  document.getElementById('btn-preview').addEventListener('click', togglePreview);
  document.getElementById('btn-preview-close').addEventListener('click', closePreview);
  document.getElementById('btn-preview-refresh').addEventListener('click', refreshPreview);
  document.getElementById('btn-preview-open').addEventListener('click', () => {
    if (activeTab) window.open(`/preview/${activeTab}`, '_blank');
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === '`') {
      e.preventDefault();
      document.getElementById('terminal-area').classList.toggle('collapsed');
      if (monacoEditor) monacoEditor.layout();
      if (fitAddon) setTimeout(() => fitAddon.fit(), 100);
    }
  });
}

// ==========================================================================
// Preview Mode
// ==========================================================================
function togglePreview() {
  const previewArea = document.getElementById('preview-area');
  if (previewArea.style.display === 'none') {
    openPreview();
  } else {
    closePreview();
  }
}

async function openPreview() {
  if (!activeTab) return;
  const ext = activeTab.split('.').pop().toLowerCase();

  await saveCurrentFile();

  if (ext === 'html') {
    // Direct iframe preview
    showIframePreview(`/preview/${activeTab}?t=${Date.now()}`);
  } else if (ext === 'ts' || ext === 'tsx') {
    // Compile TypeScript then preview
    showPreviewLoading('⚙️ Compilando TypeScript...');
    try {
      const res = await fetch('/api/compile-ts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: activeTab })
      });
      const data = await res.json();
      if (data.success && data.outputFile) {
        if (data.outputFile.endsWith('.html')) {
          showIframePreview(`/preview/${data.outputFile}?t=${Date.now()}`);
        } else {
          // JS output — wrap in a minimal HTML
          showIframePreview(`/preview/${data.outputFile}?t=${Date.now()}`);
        }
      } else {
        showPreviewError('Erro de compilação TypeScript:\n' + (data.error || 'Erro desconhecido'));
      }
    } catch (e) {
      showPreviewError('Erro ao compilar: ' + e.message);
    }
  } else if (ext === 'js' || ext === 'jsx') {
    // JS: wrap in HTML and preview
    const content = monacoModels[activeTab] ? monacoModels[activeTab].getValue() : '';
    const wrapped = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{background:#1e1e2e;color:#cdd6f4;font-family:monospace;padding:16px;}</style>
</head><body><script type="module">\n${content}\n<\/script></body></html>`;
    const blob = new Blob([wrapped], { type: 'text/html' });
    showIframePreview(URL.createObjectURL(blob));
  } else if (ext === 'md') {
    // Markdown: render as HTML
    const content = monacoModels[activeTab] ? monacoModels[activeTab].getValue() : '';
    const html = typeof marked !== 'undefined'
      ? `<!DOCTYPE html><html><head><meta charset="UTF-8">
         <style>body{font-family:system-ui;max-width:800px;margin:0 auto;padding:24px;line-height:1.6;}
         pre{background:#f5f5f5;padding:12px;border-radius:6px;overflow:auto;}
         code{background:#f5f5f5;padding:2px 4px;border-radius:3px;}</style></head>
         <body>${marked.parse(content)}</body></html>`
      : `<pre>${content}</pre>`;
    const blob = new Blob([html], { type: 'text/html' });
    showIframePreview(URL.createObjectURL(blob));
  } else {
    showPreviewError(`Preview não suportado para .${ext}\n\nUse o terminal para rodar este arquivo.`);
  }
}

function showIframePreview(url) {
  const previewArea = document.getElementById('preview-area');
  const iframe = document.getElementById('preview-iframe');
  const errorDiv = document.getElementById('preview-error');
  if (errorDiv) errorDiv.style.display = 'none';
  iframe.style.display = 'flex';
  iframe.src = url;
  previewArea.style.display = 'flex';
  if (monacoEditor) monacoEditor.layout();
}

function showPreviewLoading(msg) {
  const previewArea = document.getElementById('preview-area');
  const iframe = document.getElementById('preview-iframe');
  previewArea.style.display = 'flex';
  iframe.srcdoc = `<html><body style="background:#1e1e2e;color:#cdd6f4;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
    <div style="text-align:center"><div style="font-size:32px;margin-bottom:16px">⚙️</div><p>${msg}</p></div></body></html>`;
  if (monacoEditor) monacoEditor.layout();
}

function showPreviewError(msg) {
  const iframe = document.getElementById('preview-iframe');
  const safeMsg = msg.replace(/</g, '&lt;').replace(/\n/g, '<br>');
  iframe.srcdoc = `<html><body style="background:#1e1e2e;color:#f38ba8;font-family:monospace;padding:24px;">
    <h3>⚠️ Erro</h3><pre style="white-space:pre-wrap;">${safeMsg}</pre></body></html>`;
}

function closePreview() {
  const previewArea = document.getElementById('preview-area');
  const iframe = document.getElementById('preview-iframe');
  previewArea.style.display = 'none';
  iframe.src = 'about:blank';
  if (monacoEditor) monacoEditor.layout();
}

async function refreshPreview() {
  if (activeTab) {
    await saveCurrentFile();
    await openPreview();
  }
}

// Show/hide preview button based on file type + update label
function updatePreviewButton() {
  const btn = document.getElementById('btn-preview');
  const ext = activeTab ? activeTab.split('.').pop().toLowerCase() : '';
  const supportedTypes = ['html', 'ts', 'tsx', 'js', 'jsx', 'md'];

  if (activeTab && supportedTypes.includes(ext)) {
    btn.style.display = 'flex';
    const labels = {
      html: '👁️ Preview',
      ts: '⚙️ Compilar & Ver',
      tsx: '⚙️ Compilar & Ver',
      js: '▶ Executar',
      jsx: '▶ Executar',
      md: '📄 Renderizar'
    };
    btn.textContent = labels[ext] || '👁️ Preview';
  } else {
    btn.style.display = 'none';
    // Close preview if open and changed to unsupported file
    const previewArea = document.getElementById('preview-area');
    if (previewArea.style.display !== 'none') closePreview();
  }
}


// ==========================================================================
// Resize Handlers
// ==========================================================================
function initResizeHandlers() {
  setupResize('resize-explorer', (dx) => {
    const explorer = document.getElementById('file-explorer');
    const newW = Math.max(150, Math.min(500, explorer.offsetWidth + dx));
    document.documentElement.style.setProperty('--sidebar-w', newW + 'px');
  }, 'horizontal');

  setupResize('resize-chat', (dx) => {
    const chat = document.getElementById('chat-panel');
    const newW = Math.max(280, Math.min(600, chat.offsetWidth - dx));
    document.documentElement.style.setProperty('--chat-w', newW + 'px');
  }, 'horizontal');

  setupResize('resize-terminal', (dy) => {
    const termArea = document.getElementById('terminal-area');
    const newH = Math.max(80, Math.min(500, termArea.offsetHeight - dy));
    document.documentElement.style.setProperty('--terminal-h', newH + 'px');
    if (fitAddon) setTimeout(() => fitAddon.fit(), 50);
  }, 'vertical');
}

function setupResize(handleId, onMove, dir) {
  const handle = document.getElementById(handleId);
  if (!handle) return;

  handle.addEventListener('mousedown', (e) => {
    let start = dir === 'horizontal' ? e.clientX : e.clientY;
    handle.classList.add('active');
    const moveHandler = (e) => {
      const current = dir === 'horizontal' ? e.clientX : e.clientY;
      const delta = current - start;
      start = current;
      onMove(delta);
    };
    const upHandler = () => {
      handle.classList.remove('active');
      document.removeEventListener('mousemove', moveHandler);
      document.removeEventListener('mouseup', upHandler);
      if (monacoEditor) monacoEditor.layout();
      if (fitAddon) fitAddon.fit();
    };
    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', upHandler);
  });
}

// ==========================================================================
// Mobile Panel Switching
// ==========================================================================
function initMobileBar() {
  document.querySelectorAll('.mobile-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const panelId = tab.getAttribute('data-panel');
      document.querySelectorAll('.file-explorer, .center-panel, .chat-panel').forEach(p => {
        p.classList.remove('mobile-active');
      });
      document.getElementById(panelId).classList.add('mobile-active');
      document.querySelectorAll('.mobile-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      if (monacoEditor) setTimeout(() => monacoEditor.layout(), 50);
      if (fitAddon) setTimeout(() => fitAddon.fit(), 50);
    });
  });
  document.getElementById('center-panel').classList.add('mobile-active');
}

// File System Events are handled in the boot function above

// ==========================================================================
// Project Runner — ▶ Rodar Projeto
// ==========================================================================
function initProjectRunner() {
  const btnRun = document.getElementById('btn-run-project');
  const btnStop = document.getElementById('btn-stop-project');
  const statusBar = document.getElementById('project-status-bar');
  const statusLink = document.getElementById('project-status-link');
  const statusCmd = document.getElementById('project-status-cmd');

  if (!btnRun) return;

  // Verificar status atual ao iniciar
  checkProjectStatus();

  btnRun.addEventListener('click', async () => {
    btnRun.disabled = true;
    btnRun.textContent = '⏳ Iniciando...';
    btnRun.style.opacity = '0.7';

    try {
      const res = await fetch('/api/project/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await res.json();

      if (data.success) {
        showProjectRunning(data.url, data.command);
        // Abre no painel de preview da própria IDE automaticamente
        setTimeout(() => {
          if (typeof showIframePreview === 'function') {
            showIframePreview(data.url);
          } else {
            window.open(data.url, '_blank');
          }
        }, 500);
      } else {
        btnRun.disabled = false;
        btnRun.textContent = '▶ Rodar Projeto';
        btnRun.style.opacity = '1';
        alert('❌ Erro ao iniciar:\n' + data.error);
      }
    } catch (e) {
      btnRun.disabled = false;
      btnRun.textContent = '▶ Rodar Projeto';
      btnRun.style.opacity = '1';
      alert('Erro: ' + e.message);
    }
  });

  btnStop.addEventListener('click', async () => {
    await fetch('/api/project/stop', { method: 'POST' });
    showProjectStopped();
  });

  function showProjectRunning(url, cmd) {
    btnRun.textContent = '🔄 Reiniciar';
    btnRun.style.opacity = '1';
    btnRun.disabled = false;
    btnStop.style.display = 'block';
    statusBar.style.display = 'flex';
    statusLink.href = url;
    statusLink.textContent = url;
    statusCmd.textContent = cmd ? `(${cmd})` : '';
  }

  function showProjectStopped() {
    btnRun.textContent = '▶ Rodar Projeto';
    btnRun.style.opacity = '1';
    btnRun.disabled = false;
    btnStop.style.display = 'none';
    statusBar.style.display = 'none';
  }

  async function checkProjectStatus() {
    try {
      const res = await fetch('/api/project/status');
      const data = await res.json();
      if (data.running) showProjectRunning(data.url, data.command);
    } catch (e) {}
  }
}
