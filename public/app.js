// ==========================================================================
// Chat / Agent UI Logic
// ==========================================================================

// State
const chatState = {
  activeChatId: null,
  chats: [],
  selectedModel: '',
  isGenerating: false
};

// DOM refs
const modelSelect = document.getElementById('model-select');
const chatMessages = document.getElementById('chat-messages');
const chatWelcome = document.getElementById('chat-welcome');
const chatInput = document.getElementById('chat-input');
const btnSend = document.getElementById('btn-send');
const btnNewChat = document.getElementById('btn-new-chat');

// Wait for socket to be ready (defined in ide.js)
function getSocket() { return window.appSocket; }

// Markdown renderer
if (typeof marked !== 'undefined') {
  marked.setOptions({ breaks: true, gfm: true });
}

// ==========================================================================
// Initialization
// ==========================================================================
window.addEventListener('DOMContentLoaded', async () => {
  console.log('[Chat] Initializing...');
  await loadModels();
  await loadHistory();
  initChatEvents();
  initSocketEvents();

  // Restaurar último chat ativo automaticamente
  const lastChatId = localStorage.getItem('activeChatId');
  if (lastChatId) {
    const lastChat = chatState.chats.find(c => c.id === lastChatId);
    if (lastChat) {
      chatState.activeChatId = lastChatId;
      renderChatMessages(lastChat);
      console.log('[Chat] Restored last active chat:', lastChat.title);
    }
  }

  console.log('[Chat] Ready!');
});

// ==========================================================================
// Socket Events
// ==========================================================================
function initSocketEvents() {
  const s = getSocket();
  if (!s) {
    console.warn('[Chat] No socket available');
    return;
  }

  s.on('agent-thinking', () => showThinking());

  s.on('agent-action', (data) => {
    removeThinking();
    appendAgentAction(data);
  });

  s.on('agent-action-result', (data) => {
    updateLastActionResult(data);
  });

  s.on('agent-done', (data) => {
    removeThinking();
    const content = data.content || '';

    // Detect ZIP download URL from agent tool result
    const zipMatch = content.match(/ZIP_DOWNLOAD_URL:([^\|]+)\|(.+)/);
    if (zipMatch) {
      const url = zipMatch[1];
      const name = zipMatch[2].trim();
      const textWithoutUrl = content.replace(/ZIP_DOWNLOAD_URL:[^\|]+\|.+/g, '').trim();
      if (textWithoutUrl) appendMessage('assistant', textWithoutUrl);
      renderDownloadButton(url, name);
    } else {
      appendMessage('assistant', content);
    }

    // Save to chat history
    const chat = chatState.chats.find(c => c.id === chatState.activeChatId);
    if (chat && content) {
      chat.messages.push({ role: 'assistant', content });
      saveChatToServer(chat);
      localStorage.setItem('activeChatId', chat.id);
    }
    chatState.isGenerating = false;
    btnSend.disabled = !chatInput.value.trim();
    updateInputPlaceholder();
    if (typeof loadFileTree === 'function') loadFileTree();
  });

  s.on('agent-error', (data) => {
    removeThinking();
    appendErrorMessage(data.error);
    chatState.isGenerating = false;
    btnSend.disabled = !chatInput.value.trim();
    updateInputPlaceholder();
  });

  s.on('agent-complete', async (data) => {
    const chat = chatState.chats.find(c => c.id === chatState.activeChatId);
    if (chat && data.content) {
      chat.messages.push({ role: 'assistant', content: data.content });
      await saveChatToServer(chat);
    }
    chatState.isGenerating = false;
    btnSend.disabled = !chatInput.value.trim();
    updateInputPlaceholder();
  });

  // ─── Fila de mensagens durante execução ─────────────────────────────────
  s.on('interrupt-queued', (data) => {
    showInterruptBadge(data.position, data.content);
  });

  s.on('interrupt-received', (data) => {
    // Agente leu a mensagem da fila
    removeInterruptBadges();
    appendInterruptReadNotice(data.content);
  });
}

// ==========================================================================
// Event Listeners
// ==========================================================================
function initChatEvents() {
  btnSend.addEventListener('click', sendMessage);

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
    // Não bloqueia durante geração — permite enviar para a fila
    btnSend.disabled = !chatInput.value.trim() || !chatState.selectedModel;
  });

  btnNewChat.addEventListener('click', () => {
    chatState.activeChatId = null;
    localStorage.removeItem('activeChatId');
    showChatWelcome();
  });

  modelSelect.addEventListener('change', (e) => {
    chatState.selectedModel = e.target.value;
    localStorage.setItem('selectedModel', chatState.selectedModel);
  });

  // Quick prompts
  document.querySelectorAll('.quick-prompt').forEach(btn => {
    btn.addEventListener('click', () => {
      chatInput.value = btn.getAttribute('data-prompt');
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
      btnSend.disabled = false;
      chatInput.focus();
    });
  });

  // Click on chat title to see history
  document.querySelector('.chat-header-left').addEventListener('click', () => {
    showHistoryModal();
  });
}

// ==========================================================================
// Load Models (preferir llama3.2:1b como padrão do usuário)
// ==========================================================================
async function loadModels() {
  try {
    const res = await fetch('/api/models');
    const data = await res.json();
    modelSelect.innerHTML = '';

    if (data.models && data.models.length > 0) {
      for (const model of data.models) {
        const opt = document.createElement('option');
        opt.value = model.name;
        const isReasoning = model.name.includes('deepseek-r1');
        opt.textContent = `${model.name} ${isReasoning ? '(Raciocínio Longo ⏳)' : '(Direto ⚡)'}`;
        modelSelect.appendChild(opt);
      }

      // Carregar último modelo salvo ou usar llama3.2:1b como padrão
      const saved = localStorage.getItem('selectedModel');
      const preferred = saved || 'llama3.2:1b';
      
      if (Array.from(modelSelect.options).some(o => o.value === preferred)) {
        modelSelect.value = preferred;
        chatState.selectedModel = preferred;
      } else {
        chatState.selectedModel = data.models[0].name;
        modelSelect.value = data.models[0].name;
      }

      console.log('[Chat] Model selected:', chatState.selectedModel);
    }
  } catch (e) {
    modelSelect.innerHTML = '<option disabled>Erro ao conectar</option>';
    console.error('[Chat] Error loading models:', e);
  }
}

// ==========================================================================
// Chat History
// ==========================================================================
async function loadHistory() {
  try {
    const res = await fetch('/api/history');
    chatState.chats = await res.json();
  } catch (e) {
    console.error('[Chat] Error loading history:', e);
  }
}

async function saveChatToServer(chat) {
  try {
    await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chat)
    });
  } catch (e) {
    console.error('[Chat] Error saving chat:', e);
  }
}

function showHistoryModal() {
  // Simple approach: show history as a floating list
  const existing = document.getElementById('history-modal');
  if (existing) { existing.remove(); return; }

  const modal = document.createElement('div');
  modal.id = 'history-modal';
  modal.style.cssText = `
    position:absolute; top:38px; left:0; right:0; bottom:50px;
    background:var(--bg-sidebar); z-index:50; overflow-y:auto;
    border-bottom:1px solid var(--border);
  `;

  if (chatState.chats.length === 0) {
    modal.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-dim);font-size:12px;">Nenhuma conversa</div>';
  } else {
    for (const chat of chatState.chats) {
      const item = document.createElement('div');
      item.className = 'history-item';
      item.innerHTML = `
        <span class="history-item-title">${escapeHtml(chat.title)}</span>
        <button class="icon-btn" title="Excluir" style="flex-shrink:0;font-size:12px;">🗑️</button>
      `;
      item.querySelector('.history-item-title').addEventListener('click', () => {
        selectChat(chat.id);
        modal.remove();
      });
      item.querySelector('.icon-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteChat(chat.id);
        modal.remove();
      });
      modal.appendChild(item);
    }
  }

  document.getElementById('chat-panel').appendChild(modal);
  setTimeout(() => document.addEventListener('click', function close(e) {
    if (!modal.contains(e.target) && !document.querySelector('.chat-header-left').contains(e.target)) {
      modal.remove();
      document.removeEventListener('click', close);
    }
  }), 50);
}

function selectChat(id) {
  chatState.activeChatId = id;
  const chat = chatState.chats.find(c => c.id === id);
  if (!chat) return;
  renderChatMessages(chat);
}

async function deleteChat(id) {
  await fetch(`/api/history/${id}`, { method: 'DELETE' });
  chatState.chats = chatState.chats.filter(c => c.id !== id);
  if (chatState.activeChatId === id) {
    chatState.activeChatId = null;
    showChatWelcome();
  }
}

// ==========================================================================
// Render Messages
// ==========================================================================
function showChatWelcome() {
  chatWelcome.style.display = 'flex';
  const msgs = chatMessages.querySelectorAll('.msg, .agent-action, .agent-thinking');
  msgs.forEach(m => m.remove());
}

function renderChatMessages(chat) {
  chatWelcome.style.display = 'none';
  const msgs = chatMessages.querySelectorAll('.msg, .agent-action, .agent-thinking');
  msgs.forEach(m => m.remove());
  for (const msg of chat.messages) {
    appendMessage(msg.role, msg.content);
  }
  scrollChatToBottom();
}

// Render download button when agent returns a ZIP URL
function renderDownloadButton(url, name) {
  const btn = document.createElement('a');
  btn.href = url;
  btn.download = name + '.zip';
  btn.className = 'download-zip-btn';
  btn.innerHTML = `📦 Baixar ${name}.zip`;
  btn.style.cssText = `
    display: inline-flex; align-items: center; gap: 8px;
    margin: 12px 0; padding: 10px 20px;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: white; border-radius: 8px; text-decoration: none;
    font-weight: 600; font-size: 13px; font-family: var(--font-sans);
    transition: opacity 0.2s; cursor: pointer;
  `;
  btn.onmouseenter = () => btn.style.opacity = '0.85';
  btn.onmouseleave = () => btn.style.opacity = '1';
  chatMessages.appendChild(btn);
  scrollChatToBottom();
}

function appendMessage(role, content) {
  if (!content || !content.trim()) return;
  const cssRole = role === 'assistant' ? 'bot' : 'user';
  const label = role === 'user' ? 'Você' : 'Agente IA';
  const avatarText = role === 'user' ? '👤' : '🤖';

  const msgEl = document.createElement('div');
  msgEl.className = `msg ${cssRole}`;

  const formattedContent = (role === 'assistant' && typeof marked !== 'undefined')
    ? marked.parse(content)
    : escapeHtml(content).replace(/\n/g, '<br>');

  msgEl.innerHTML = `
    <div class="msg-header">
      <span>${avatarText}</span>
      <span style="font-weight:600;">${label}</span>
    </div>
    <div class="msg-body">${formattedContent}</div>
  `;

  chatMessages.appendChild(msgEl);
  scrollChatToBottom();
}

function appendAgentAction(data) {
  const icons = {
    create_file: '📄', read_file: '👁️', edit_file: '✏️',
    run_command: '⚡', list_files: '📁', search_files: '🔍',
    delete_file: '🗑️', zip_project: '📦',
    list_mcp_tools: '🔌', mcp_call: '🔗',
    web_search: '🌐', web_read: '📖'
  };
  const labels = {
    create_file: 'Criando arquivo', read_file: 'Lendo arquivo',
    edit_file: 'Editando arquivo', run_command: 'Executando comando',
    list_files: 'Listando arquivos', search_files: 'Buscando nos arquivos',
    delete_file: 'Deletando arquivo', zip_project: 'Criando ZIP',
    list_mcp_tools: 'Listando ferramentas MCP', mcp_call: 'Chamando MCP',
    web_search: 'Pesquisando na internet', web_read: 'Lendo página web'
  };

  const icon = icons[data.tool] || '🔧';
  const label = labels[data.tool] || data.tool;
  const summary = getArgsSummary(data.tool, data.args);

  const actionEl = document.createElement('div');
  actionEl.className = 'agent-action';
  actionEl.innerHTML = `
    <div class="action-header">
      <span>${icon}</span>
      <span>${label}: ${summary}</span>
      <span style="margin-left:auto;font-size:10px;cursor:pointer;">▸</span>
    </div>
    <div class="action-result"></div>
  `;

  actionEl.querySelector('.action-header').addEventListener('click', () => {
    actionEl.querySelector('.action-result').classList.toggle('open');
  });

  chatMessages.appendChild(actionEl);
  scrollChatToBottom();
}

function updateLastActionResult(data) {
  const actions = chatMessages.querySelectorAll('.agent-action');
  const lastAction = actions[actions.length - 1];
  if (lastAction) {
    const resultEl = lastAction.querySelector('.action-result');
    resultEl.textContent = `${data.success ? '✅' : '❌'} ${data.result}`;
  }
  // Refresh file tree if files were modified
  if (data.success && (data.tool === 'create_file' || data.tool === 'edit_file')) {
    if (typeof loadFileTree === 'function') loadFileTree();
  }
}

function getArgsSummary(tool, args) {
  if (!args) return '';
  switch (tool) {
    case 'create_file': case 'read_file': case 'edit_file':
      return `<code>${escapeHtml(args.path || '')}</code>`;
    case 'run_command':
      return `<code>${escapeHtml(args.command || '')}</code>`;
    case 'list_files':
      return `<code>${escapeHtml(args.directory || '.')}</code>`;
    case 'search_files':
      return `"${escapeHtml(args.query || '')}"`;
    default: return '';
  }
}

function showThinking() {
  removeThinking();
  const thinkEl = document.createElement('div');
  thinkEl.className = 'agent-thinking';
  thinkEl.id = 'thinking-indicator';
  thinkEl.innerHTML = `
    <div class="thinking-dots"><span></span><span></span><span></span></div>
    <span>Agente pensando...</span>
  `;
  chatMessages.appendChild(thinkEl);
  scrollChatToBottom();
}

function removeThinking() {
  const el = document.getElementById('thinking-indicator');
  if (el) el.remove();
}

function finishAgentResponse(data) {
  if (data.content && data.content.trim()) {
    appendMessage('assistant', data.content);
  }
}

function appendErrorMessage(error) {
  const msgEl = document.createElement('div');
  msgEl.className = 'msg bot';
  msgEl.innerHTML = `
    <div class="msg-header"><span>⚠️</span> <span style="font-weight:600;">Erro</span></div>
    <div class="msg-body" style="color:var(--danger);">${escapeHtml(error)}</div>
  `;
  chatMessages.appendChild(msgEl);
  scrollChatToBottom();
}

// ==========================================================================
// Send Message — suporta fila durante geração
// ==========================================================================
async function sendMessage() {
  const content = chatInput.value.trim();
  if (!content || !chatState.selectedModel) return;

  const s = getSocket();
  if (!s) {
    appendErrorMessage('Socket não conectado. Recarregue a página.');
    return;
  }

  // ─── Agente está trabalhando: envia para a FILA ───
  if (chatState.isGenerating) {
    s.emit('agent-interrupt', { content });
    // Mostra no chat que foi enfileirado
    appendQueuedMessage(content);
    chatInput.value = '';
    chatInput.style.height = 'auto';
    return;
  }

  // ─── Agente livre: envia normalmente ───
  // Create chat if needed
  if (!chatState.activeChatId) {
    const newChat = {
      id: 'chat_' + Date.now(),
      title: content.length > 30 ? content.substring(0, 30) + '...' : content,
      messages: [],
      model: chatState.selectedModel,
      timestamp: new Date().toISOString()
    };
    chatState.activeChatId = newChat.id;
    chatState.chats.unshift(newChat);
    localStorage.setItem('activeChatId', newChat.id);
  }

  const chat = chatState.chats.find(c => c.id === chatState.activeChatId);
  if (!chat) return;

  // Add user message
  chat.messages.push({ role: 'user', content });

  // Reset input
  chatInput.value = '';
  chatInput.style.height = 'auto';
  btnSend.disabled = true;
  chatState.isGenerating = true;
  updateInputPlaceholder();

  // Render
  chatWelcome.style.display = 'none';
  appendMessage('user', content);

  // Send to agent
  s.emit('agent-message', {
    model: chatState.selectedModel,
    messages: chat.messages,
    chatId: chat.id
  });

  await saveChatToServer(chat);
}

// ==========================================================================
// Helpers
// ==========================================================================
function scrollChatToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// Atualiza o placeholder do input conforme estado
function updateInputPlaceholder() {
  if (chatState.isGenerating) {
    chatInput.placeholder = '💬 Agente trabalhando... escreva aqui para enviar à fila';
    chatInput.style.borderColor = 'var(--warning, #f59e0b)';
  } else {
    chatInput.placeholder = 'Peça algo ao agente...';
    chatInput.style.borderColor = '';
  }
}

// Exibe mensagem do usuário enfileirada (visual diferenciado)
function appendQueuedMessage(content) {
  const el = document.createElement('div');
  el.className = 'msg user msg-queued';
  el.innerHTML = `
    <div class="msg-header">
      <span>👤</span>
      <span>Você</span>
      <span class="queue-badge">📥 Na fila</span>
    </div>
    <div class="msg-body">${escapeHtml(content)}</div>
  `;
  chatMessages.appendChild(el);
  scrollChatToBottom();
}

// Badge flutuante informando posição na fila
function showInterruptBadge(position) {
  removeInterruptBadges();
  const badge = document.createElement('div');
  badge.className = 'interrupt-badge';
  badge.id = 'interrupt-badge';
  badge.innerHTML = `📥 Mensagem ${position > 1 ? position + 'ª ' : ''}na fila — o agente vai ler em breve`;
  chatMessages.appendChild(badge);
  scrollChatToBottom();
}

function removeInterruptBadges() {
  document.querySelectorAll('.interrupt-badge').forEach(el => el.remove());
}

// Aviso de que o agente leu a mensagem da fila
function appendInterruptReadNotice(content) {
  const el = document.createElement('div');
  el.className = 'interrupt-read-notice';
  el.innerHTML = `✅ Agente leu: <em>"${escapeHtml(content.substring(0, 60))}${content.length > 60 ? '...' : ''}"</em>`;
  chatMessages.appendChild(el);
  scrollChatToBottom();
}
