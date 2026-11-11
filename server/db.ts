import { Database } from "bun:sqlite";
import { join } from "path";

// Cria ou abre o banco de dados SQLite local
const dbPath = join(process.cwd(), "gamehub.sqlite");
export const db = new Database(dbPath, { create: true });

// Otimizações de performance do SQLite
db.run("PRAGMA journal_mode = WAL;");
db.run("PRAGMA foreign_keys = ON;");

// Inicialização das tabelas
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    google_id TEXT UNIQUE,
    email TEXT UNIQUE,
    name TEXT NOT NULL,
    avatar_url TEXT,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_login_at INTEGER NOT NULL
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS friends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    friend_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'accepted',
    created_at INTEGER NOT NULL,
    UNIQUE(user_id, friend_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(friend_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS match_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL,
    winner_id TEXT NOT NULL,
    loser_id TEXT NOT NULL,
    played_at INTEGER NOT NULL,
    FOREIGN KEY(winner_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(loser_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

export interface UserRow {
  id: string;
  google_id: string | null;
  email: string | null;
  name: string;
  avatar_url: string | null;
  wins: number;
  losses: number;
  created_at: number;
  last_login_at: number;
}

// Prepared Statements para alta performance
const stmtGetUserById = db.prepare<UserRow, [string]>(
  "SELECT * FROM users WHERE id = ?;"
);

const stmtGetUserByGoogleId = db.prepare<UserRow, [string]>(
  "SELECT * FROM users WHERE google_id = ?;"
);

const stmtGetUserByEmail = db.prepare<UserRow, [string]>(
  "SELECT * FROM users WHERE email = ?;"
);

const stmtInsertUser = db.prepare(
  `INSERT INTO users (id, google_id, email, name, avatar_url, wins, losses, created_at, last_login_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`
);

const stmtUpdateLoginTime = db.prepare(
  "UPDATE users SET last_login_at = ?, name = COALESCE(?, name), avatar_url = COALESCE(?, avatar_url) WHERE id = ?;"
);

const stmtIncrementWins = db.prepare(
  "UPDATE users SET wins = wins + 1 WHERE id = ?;"
);

const stmtIncrementLosses = db.prepare(
  "UPDATE users SET losses = losses + 1 WHERE id = ?;"
);

const stmtInsertMatch = db.prepare(
  "INSERT INTO match_history (game_id, winner_id, loser_id, played_at) VALUES (?, ?, ?, ?);"
);

/**
 * Cria ou obtém usuário pelo ID ou credenciais Google
 */
export function getOrCreateUser(data: {
  id?: string;
  googleId?: string;
  email?: string;
  name: string;
  avatarUrl?: string;
}): UserRow {
  const now = Date.now();

  // 1. Tenta buscar por google_id se fornecido
  if (data.googleId) {
    const existing = stmtGetUserByGoogleId.get(data.googleId);
    if (existing) {
      stmtUpdateLoginTime.run(now, data.name, data.avatarUrl || null, existing.id);
      return { ...existing, last_login_at: now, name: data.name || existing.name };
    }
  }

  // 2. Tenta buscar por email se fornecido
  if (data.email) {
    const existing = stmtGetUserByEmail.get(data.email);
    if (existing) {
      stmtUpdateLoginTime.run(now, data.name, data.avatarUrl || null, existing.id);
      return { ...existing, last_login_at: now };
    }
  }

  // 3. Tenta buscar por ID
  const userId = data.id || `usr_${crypto.randomUUID()}`;
  const existing = stmtGetUserById.get(userId);
  if (existing) {
    stmtUpdateLoginTime.run(now, data.name, data.avatarUrl || null, existing.id);
    return { ...existing, last_login_at: now };
  }

  // 4. Cria novo usuário
  const newUser: UserRow = {
    id: userId,
    google_id: data.googleId || null,
    email: data.email || null,
    name: data.name,
    avatar_url: data.avatarUrl || null,
    wins: 0,
    losses: 0,
    created_at: now,
    last_login_at: now,
  };

  stmtInsertUser.run(
    newUser.id,
    newUser.google_id,
    newUser.email,
    newUser.name,
    newUser.avatar_url,
    newUser.wins,
    newUser.losses,
    newUser.created_at,
    newUser.last_login_at
  );

  return newUser;
}

/**
 * Registra o fim de uma partida e atualiza estatísticas no banco
 */
export function recordMatchResult(gameId: string, winnerId: string, loserId?: string) {
  const now = Date.now();
  stmtIncrementWins.run(winnerId);

  if (loserId && loserId !== "opponent") {
    stmtIncrementLosses.run(loserId);
    stmtInsertMatch.run(gameId, winnerId, loserId, now);
  }
}

/**
 * Retorna o Ranking global de jogadores
 */
export function getLeaderboard(limit = 50) {
  const query = `
    SELECT 
      id, 
      name, 
      avatar_url, 
      wins, 
      losses, 
      (wins + losses) AS total_matches,
      CASE 
        WHEN (wins + losses) = 0 THEN 0 
        ELSE ROUND((CAST(wins AS REAL) / (wins + losses)) * 100, 1) 
      END AS win_rate
    FROM users
    WHERE (wins + losses) > 0 OR created_at > 0
    ORDER BY wins DESC, win_rate DESC, total_matches DESC
    LIMIT ?;
  `;
  return db.query(query).all(limit);
}

/**
 * Retorna lista de amigos de um usuário com status
 */
export function getUserFriends(userId: string) {
  const query = `
    SELECT 
      u.id, 
      u.name, 
      u.avatar_url, 
      u.wins, 
      u.losses,
      f.status,
      f.created_at
    FROM friends f
    JOIN users u ON u.id = f.friend_id
    WHERE f.user_id = ?
    ORDER BY u.name ASC;
  `;
  return db.query(query).all(userId);
}

/**
 * Adiciona amizade bidirecional
 */
export function addFriendship(userId: string, friendId: string): boolean {
  if (userId === friendId) return false;
  const now = Date.now();

  try {
    const insert = db.prepare(
      "INSERT OR IGNORE INTO friends (user_id, friend_id, status, created_at) VALUES (?, ?, 'accepted', ?);"
    );
    insert.run(userId, friendId, now);
    insert.run(friendId, userId, now);
    return true;
  } catch (err) {
    console.error("Erro ao adicionar amigo:", err);
    return false;
  }
}

/**
 * Remove amizade
 */
export function removeFriendship(userId: string, friendId: string): boolean {
  try {
    const del = db.prepare("DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?);");
    del.run(userId, friendId, friendId, userId);
    return true;
  } catch (err) {
    console.error("Erro ao remover amigo:", err);
    return false;
  }
}
