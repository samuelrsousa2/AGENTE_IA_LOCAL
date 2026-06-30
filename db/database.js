// ==========================================================================
// db/database.js — SQLite para users, assinaturas e projetos (local, sem Prisma)
// ==========================================================================
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'ide.db');
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Tabelas
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    avatar TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    plan TEXT NOT NULL DEFAULT 'starter',
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    port INTEGER,
    status TEXT NOT NULL DEFAULT 'stopped',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

function generateId() {
  return crypto.randomBytes(10).toString('hex');
}

// Cria conta admin padrão se não existir
function ensureAdminExists() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@local.dev';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const existing = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
  
  if (!existing) {
    const hash = bcrypt.hashSync(adminPassword, 10);
    db.prepare(`
      INSERT INTO users (id, email, password, name, role, plan)
      VALUES (?, ?, ?, ?, 'admin', 'unlimited')
    `).run(generateId(), adminEmail, hash, 'Administrador');
    console.log(`\n✅ Conta admin criada: ${adminEmail} / ${adminPassword}`);
    console.log('   ⚠️  Mude a senha em: Admin Panel → Usuários\n');
  }
}

ensureAdminExists();

// ==========================================================================
// Queries
// ==========================================================================
const queries = {
  // Auth
  getUserByEmail(email) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  },

  getUserById(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  },

  validatePassword(user, password) {
    return bcrypt.compareSync(password, user.password);
  },

  // Google OAuth: cria ou atualiza usuário a partir do perfil do Google
  upsertGoogleUser(profile) {
    const email = (profile.emails && profile.emails[0] && profile.emails[0].value || '').toLowerCase();
    const name = profile.displayName || email.split('@')[0] || 'Usuário Google';
    const avatar = (profile.photos && profile.photos[0] && profile.photos[0].value) || null;
    if (!email) throw new Error('Perfil do Google sem email');

    const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (existing) {
      db.prepare('UPDATE users SET name = ?, avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(name, avatar, existing.id);
      return db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id);
    }
    // Cria novo usuário (senha aleatória, já que o login é via Google)
    const id = generateId();
    const randomPass = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);
    db.prepare(`
      INSERT INTO users (id, email, password, name, avatar, role, plan)
      VALUES (?, ?, ?, ?, ?, 'user', 'starter')
    `).run(id, email, randomPass, name, avatar);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  },

  // Admin: criar usuário
  createUser({ email, password, name, role = 'user', plan = 'starter' }) {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) throw new Error('Email já cadastrado');
    const id = generateId();
    const hash = bcrypt.hashSync(password, 10);
    db.prepare(`
      INSERT INTO users (id, email, password, name, role, plan)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, email, hash, name, role, plan);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  },

  // Admin: listar todos
  getAllUsers() {
    return db.prepare('SELECT id, email, name, role, plan, active, created_at FROM users ORDER BY created_at DESC').all();
  },

  updateUser(id, { name, plan, active, role }) {
    db.prepare(`
      UPDATE users SET name = ?, plan = ?, active = ?, role = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, plan, active, role, id);
  },

  changePassword(id, newPassword) {
    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, id);
  },

  deleteUser(id) {
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  },

  // Stats
  getStats() {
    return {
      totalUsers: db.prepare("SELECT COUNT(*) as c FROM users WHERE role != 'admin'").get().c,
      activeUsers: db.prepare("SELECT COUNT(*) as c FROM users WHERE active = 1 AND role != 'admin'").get().c,
      starterPlan: db.prepare("SELECT COUNT(*) as c FROM users WHERE plan = 'starter' AND role != 'admin'").get().c,
      proPlan: db.prepare("SELECT COUNT(*) as c FROM users WHERE plan = 'pro' AND role != 'admin'").get().c,
      unlimitedPlan: db.prepare("SELECT COUNT(*) as c FROM users WHERE plan = 'unlimited' AND role != 'admin'").get().c,
    };
  }
};

module.exports = { db, queries };
