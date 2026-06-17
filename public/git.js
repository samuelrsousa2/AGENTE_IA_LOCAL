// ==========================================================================
// Git / GitHub Integration UI
// ==========================================================================

window.addEventListener('DOMContentLoaded', () => {
  console.log('[Git] Initializing...');
  initGitPanel();
  checkGitHubStatus();
  refreshGitStatus();
});

// ==========================================================================
// Git Panel Toggle
// ==========================================================================
function initGitPanel() {
  const header = document.getElementById('git-toggle-header');
  const body = document.getElementById('git-body');
  const arrow = header.querySelector('.git-toggle-arrow');

  header.addEventListener('click', () => {
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    arrow.textContent = isOpen ? '▸' : '▾';
    if (!isOpen) refreshGitStatus();
  });

  // GitHub connect
  document.getElementById('btn-github-connect').addEventListener('click', connectGitHub);
  document.getElementById('btn-github-disconnect').addEventListener('click', disconnectGitHub);

  // Git actions
  document.getElementById('btn-git-init').addEventListener('click', gitInit);
  document.getElementById('btn-git-add').addEventListener('click', gitAddAll);
  document.getElementById('btn-git-commit').addEventListener('click', gitCommit);
  document.getElementById('btn-git-push').addEventListener('click', gitPush);
  document.getElementById('btn-git-pull').addEventListener('click', gitPull);
}

// ==========================================================================
// GitHub Connection
// ==========================================================================
async function checkGitHubStatus() {
  try {
    const res = await fetch('/api/github/status');
    const data = await res.json();
    updateGitHubUI(data);
  } catch (e) {
    console.error('[Git] Error checking GitHub status:', e);
  }
}

function updateGitHubUI(data) {
  const connectSection = document.getElementById('github-connect-section');
  const connectedSection = document.getElementById('github-connected-section');
  const usernameEl = document.getElementById('github-username');

  if (data.connected) {
    connectSection.style.display = 'none';
    connectedSection.style.display = 'block';
    usernameEl.textContent = data.user.login;
  } else {
    connectSection.style.display = 'block';
    connectedSection.style.display = 'none';
  }
}

async function connectGitHub() {
  const token = prompt(
    '🔑 Cole seu GitHub Personal Access Token:\n\n' +
    'Para criar um token:\n' +
    '1. Acesse github.com → Settings → Developer Settings\n' +
    '2. Personal Access Tokens → Tokens (classic)\n' +
    '3. Generate new token\n' +
    '4. Selecione os scopes: repo, workflow\n' +
    '5. Copie o token e cole aqui'
  );
  if (!token) return;

  try {
    const res = await fetch('/api/github/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    
    updateGitHubUI({ connected: true, user: data.user });
    showGitNotification(`✅ Conectado como ${data.user.login}!`, 'success');
  } catch (e) {
    showGitNotification(`❌ Erro: ${e.message}`, 'error');
  }
}

async function disconnectGitHub() {
  if (!confirm('Desconectar do GitHub?')) return;
  await fetch('/api/github/disconnect', { method: 'POST' });
  updateGitHubUI({ connected: false });
  showGitNotification('Desconectado do GitHub', 'info');
}

// ==========================================================================
// Git Operations
// ==========================================================================
async function refreshGitStatus() {
  try {
    const res = await fetch('/api/git/status');
    const data = await res.json();
    
    // Update branch display
    const branchEl = document.getElementById('git-branch');
    if (data.isRepo) {
      branchEl.innerHTML = `📌 Branch: <strong>${data.branch}</strong>`;
    } else {
      branchEl.innerHTML = `⚠️ <em>Não é um repositório Git</em>`;
    }

    // Update changed files list
    const filesList = document.getElementById('git-files-list');
    if (data.files.length === 0) {
      filesList.innerHTML = '<div style="color:var(--text-dim);font-size:11px;padding:4px 0;">Nenhuma alteração</div>';
    } else {
      filesList.innerHTML = '';
      for (const file of data.files) {
        const statusIcons = {
          'M': '🟡', 'A': '🟢', 'D': '🔴', '??': '🔵', 'R': '🟣',
          'MM': '🟡', 'AM': '🟡'
        };
        const icon = statusIcons[file.status] || '⚪';
        const el = document.createElement('div');
        el.className = 'git-file-item';
        el.innerHTML = `<span>${icon}</span> <span class="git-file-name">${file.file}</span>`;
        filesList.appendChild(el);
      }
    }
  } catch (e) {
    console.error('[Git] Error refreshing status:', e);
  }
}

async function gitInit() {
  try {
    const res = await fetch('/api/git/init', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showGitNotification('✅ Repositório Git inicializado!', 'success');
      refreshGitStatus();
    } else {
      showGitNotification(`❌ ${data.output}`, 'error');
    }
  } catch (e) {
    showGitNotification(`❌ Erro: ${e.message}`, 'error');
  }
}

async function gitAddAll() {
  try {
    const res = await fetch('/api/git/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: '.' })
    });
    const data = await res.json();
    if (data.success) {
      showGitNotification('✅ Arquivos adicionados ao staging', 'success');
      refreshGitStatus();
    } else {
      showGitNotification(`❌ ${data.output}`, 'error');
    }
  } catch (e) {
    showGitNotification(`❌ Erro: ${e.message}`, 'error');
  }
}

async function gitCommit() {
  const message = prompt('💾 Mensagem do commit:');
  if (!message) return;
  
  try {
    // Auto add before commit
    await fetch('/api/git/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: '.' })
    });

    const res = await fetch('/api/git/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    const data = await res.json();
    if (data.success) {
      showGitNotification('✅ Commit realizado!', 'success');
      refreshGitStatus();
    } else {
      showGitNotification(`❌ ${data.output}`, 'error');
    }
  } catch (e) {
    showGitNotification(`❌ Erro: ${e.message}`, 'error');
  }
}

async function gitPush() {
  // Check if remote is configured
  const statusRes = await fetch('/api/git/status');
  const status = await statusRes.json();
  
  if (!status.remote) {
    // Ask for remote URL or offer to create repo
    const choice = prompt(
      '⬆️ Nenhum remote configurado.\n\n' +
      'Cole a URL do repositório GitHub:\n' +
      '(ex: https://github.com/usuario/repo.git)\n\n' +
      'Ou digite "novo" para criar um novo repositório no GitHub'
    );
    
    if (!choice) return;
    
    if (choice.toLowerCase() === 'novo') {
      await createAndPush();
      return;
    }
    
    // Set remote
    await fetch('/api/git/remote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: choice })
    });
  }
  
  showGitNotification('⬆️ Fazendo push...', 'info');
  try {
    const res = await fetch('/api/git/push', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showGitNotification('✅ Push realizado com sucesso!', 'success');
    } else {
      showGitNotification(`❌ Push falhou: ${data.output}`, 'error');
    }
  } catch (e) {
    showGitNotification(`❌ Erro: ${e.message}`, 'error');
  }
}

async function createAndPush() {
  const name = prompt('📦 Nome do novo repositório no GitHub:');
  if (!name) return;
  
  const isPrivate = confirm('🔒 Tornar privado? (OK = Privado, Cancelar = Público)');
  
  showGitNotification('📦 Criando repositório...', 'info');
  
  try {
    const res = await fetch('/api/github/create-repo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, isPrivate })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    
    // Set remote
    await fetch('/api/git/remote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: data.repo.clone_url })
    });
    
    // Push
    const pushRes = await fetch('/api/git/push', { method: 'POST' });
    const pushData = await pushRes.json();
    
    if (pushData.success) {
      showGitNotification(`✅ Repositório criado e push feito!\n${data.repo.clone_url}`, 'success');
    } else {
      showGitNotification(`⚠️ Repo criado mas push falhou: ${pushData.output}`, 'error');
    }
  } catch (e) {
    showGitNotification(`❌ Erro: ${e.message}`, 'error');
  }
}

async function gitPull() {
  showGitNotification('⬇️ Fazendo pull...', 'info');
  try {
    const res = await fetch('/api/git/pull', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showGitNotification('✅ Pull realizado!', 'success');
      if (typeof loadFileTree === 'function') loadFileTree();
    } else {
      showGitNotification(`❌ Pull falhou: ${data.output}`, 'error');
    }
  } catch (e) {
    showGitNotification(`❌ Erro: ${e.message}`, 'error');
  }
}

// ==========================================================================
// Git Notifications (inline no painel)
// ==========================================================================
function showGitNotification(message, type) {
  const existing = document.getElementById('git-notification');
  if (existing) existing.remove();

  const colors = { success: 'var(--success)', error: 'var(--danger)', info: 'var(--info)' };

  const notif = document.createElement('div');
  notif.id = 'git-notification';
  notif.style.cssText = `
    padding: 6px 10px; margin: 4px 8px; border-radius: 4px; font-size: 11px;
    background: ${colors[type] || colors.info}22; color: ${colors[type] || colors.info};
    border-left: 3px solid ${colors[type] || colors.info}; word-break: break-word;
  `;
  notif.textContent = message;

  const gitBody = document.getElementById('git-body');
  gitBody.prepend(notif);

  // Auto-remove after 5s
  setTimeout(() => { if (notif.parentNode) notif.remove(); }, 5000);
}
