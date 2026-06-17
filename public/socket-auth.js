// ==========================================================================
// Port do Socket.IO — atualizado para enviar token JWT no handshake
// ==========================================================================

// Obtém o token do cookie para passar ao Socket.IO
function getAuthToken() {
  const match = document.cookie.match(/ide_token=([^;]+)/);
  return match ? match[1] : null;
}

// Inicializa Socket.IO com auth token
const s = io({
  auth: { token: getAuthToken() },
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5
});

s.on('connect_error', (err) => {
  if (err.message === 'Authentication required' || err.message === 'Invalid token') {
    window.location.href = '/login';
  }
});

export { s as socket };
