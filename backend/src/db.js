'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'chores.db');

// Ensure the data directory exists
const fs = require('fs');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  -- OAuth tokens for Home Connect
  CREATE TABLE IF NOT EXISTS oauth_tokens (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    access_token  TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at    INTEGER NOT NULL
  );

  -- Family members (the kids in rotation order)
  CREATE TABLE IF NOT EXISTS members (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL UNIQUE,
    rotation_order INTEGER NOT NULL,
    push_token    TEXT,          -- Expo push token registered by their phone
    is_parent     INTEGER NOT NULL DEFAULT 0
  );

  -- Each dishwasher cycle that triggered a chore assignment
  CREATE TABLE IF NOT EXISTS cycles (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    triggered_at  INTEGER NOT NULL,  -- unix timestamp
    assigned_to   INTEGER REFERENCES members(id),
    completed_at  INTEGER,           -- null = not done yet
    shame_sent    INTEGER NOT NULL DEFAULT 0,
    lock_sent     INTEGER NOT NULL DEFAULT 0
  );

  -- Escalation reminders already sent for a cycle
  CREATE TABLE IF NOT EXISTS reminders (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    cycle_id  INTEGER NOT NULL REFERENCES cycles(id),
    sent_at   INTEGER NOT NULL,
    level     TEXT NOT NULL  -- 'reminder', 'shame', 'lock'
  );
`);

// ─── Token helpers ────────────────────────────────────────────────────────────

function saveTokens({ access_token, refresh_token, expires_in }) {
  const expires_at = Math.floor(Date.now() / 1000) + expires_in - 60; // 60s buffer
  db.prepare(`
    INSERT INTO oauth_tokens (id, access_token, refresh_token, expires_at)
    VALUES (1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      access_token  = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at    = excluded.expires_at
  `).run(access_token, refresh_token, expires_at);
}

function getTokens() {
  return db.prepare('SELECT * FROM oauth_tokens WHERE id = 1').get();
}

// ─── Member helpers ───────────────────────────────────────────────────────────

function upsertMember({ name, rotation_order, is_parent = 0 }) {
  db.prepare(`
    INSERT INTO members (name, rotation_order, is_parent)
    VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      rotation_order = excluded.rotation_order,
      is_parent      = excluded.is_parent
  `).run(name, rotation_order, is_parent ? 1 : 0);
}

function getAllMembers() {
  return db.prepare('SELECT * FROM members ORDER BY rotation_order ASC').all();
}

function getKids() {
  return db.prepare('SELECT * FROM members WHERE is_parent = 0 ORDER BY rotation_order ASC').all();
}

function getParents() {
  return db.prepare('SELECT * FROM members WHERE is_parent = 1').all();
}

function updatePushToken(name, push_token) {
  db.prepare('UPDATE members SET push_token = ? WHERE name = ?').run(push_token, name);
}

// ─── Cycle helpers ────────────────────────────────────────────────────────────

function createCycle(assigned_to_id) {
  const result = db.prepare(`
    INSERT INTO cycles (triggered_at, assigned_to) VALUES (?, ?)
  `).run(Math.floor(Date.now() / 1000), assigned_to_id);
  return result.lastInsertRowid;
}

function getActiveCycle() {
  return db.prepare(`
    SELECT c.*, m.name as assignee_name, m.push_token as assignee_token
    FROM cycles c
    JOIN members m ON m.id = c.assigned_to
    WHERE c.completed_at IS NULL
    ORDER BY c.triggered_at DESC
    LIMIT 1
  `).get();
}

function completeCycle(cycle_id) {
  db.prepare(`
    UPDATE cycles SET completed_at = ? WHERE id = ?
  `).run(Math.floor(Date.now() / 1000), cycle_id);
}

function markShame(cycle_id) {
  db.prepare('UPDATE cycles SET shame_sent = 1 WHERE id = ?').run(cycle_id);
}

function markLock(cycle_id) {
  db.prepare('UPDATE cycles SET lock_sent = 1 WHERE id = ?').run(cycle_id);
}

function getRecentCycles(limit = 20) {
  return db.prepare(`
    SELECT c.*, m.name as assignee_name
    FROM cycles c
    JOIN members m ON m.id = c.assigned_to
    ORDER BY c.triggered_at DESC
    LIMIT ?
  `).all(limit);
}

// ─── Reminder helpers ─────────────────────────────────────────────────────────

function recordReminder(cycle_id, level) {
  db.prepare(`
    INSERT INTO reminders (cycle_id, sent_at, level) VALUES (?, ?, ?)
  `).run(cycle_id, Math.floor(Date.now() / 1000), level);
}

function getReminderCount(cycle_id) {
  return db.prepare(`
    SELECT COUNT(*) as count FROM reminders WHERE cycle_id = ? AND level = 'reminder'
  `).get(cycle_id);
}

module.exports = {
  db,
  saveTokens, getTokens,
  upsertMember, getAllMembers, getKids, getParents, updatePushToken,
  createCycle, getActiveCycle, completeCycle, markShame, markLock, getRecentCycles,
  recordReminder, getReminderCount,
};
