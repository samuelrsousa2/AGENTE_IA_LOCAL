// ==========================================================================
// auth/middleware.js — JWT middleware simples (sem Google, sem Stripe)
// ==========================================================================
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// JWT secret: usa o do .env; se não houver (ou for o placeholder fraco),
// gera um segredo aleatório forte e o persiste em data/.jwt-secret.
function resolveJwtSecret() {
  const fromEnv = process.env.JWT_SECRET;
  const weakDefaults = [
    'ide-secret-local-dev-change-in-prod',
    'ide-secret-mude-isso-em-producao-use-string-longa-e-aleatoria'
  ];
  if (fromEnv && !weakDefaults.includes(fromEnv)) return fromEnv;

  const secretFile = path.join(__dirname, '..', 'data', '.jwt-secret');
  try {
    if (fs.existsSync(secretFile)) {
      const saved = fs.readFileSync(secretFile, 'utf8').trim();
      if (saved.length >= 32) return saved;
    }
    const generated = crypto.randomBytes(48).toString('hex');
    fs.mkdirSync(path.dirname(secretFile), { recursive: true });
    fs.writeFileSync(secretFile, generated, 'utf8');
    console.warn('⚠️  JWT_SECRET não definido no .env — gerado um segredo aleatório em data/.jwt-secret');
    return generated;
  } catch (e) {
    // Último recurso: segredo aleatório em memória (invalida tokens a cada restart)
    console.warn('⚠️  Não foi possível persistir o JWT secret — usando segredo efêmero:', e.message);
    return crypto.randomBytes(48).toString('hex');
  }
}

const JWT_SECRET = resolveJwtSecret();

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
