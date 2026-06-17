// ==========================================================================
// auth/middleware.js — JWT middleware simples (sem Google, sem Stripe)
// ==========================================================================
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'ide-secret-local-dev-change-in-prod';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// Middleware: protege rotas da IDE
function requireAuth(req, res, next) {
  const token = req.cookies?.ide_token || req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    if (req.headers['accept']?.includes('application/json') || req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Não autenticado' });
    }
    return res.redirect('/login');
  }

  const user = verifyToken(token);
  if (!user) {
    res.clearCookie('ide_token');
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Token inválido' });
    }
    return res.redirect('/login');
  }

  req.user = user;
  next();
}

// Middleware: protege rotas de admin
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    next();
  });
}

module.exports = { generateToken, verifyToken, requireAuth, requireAdmin };
