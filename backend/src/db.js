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
    push_token    TEXT,
    is_parent     INTEGER NOT NULL DEFAULT 0
  );

  -- Each chore cycle assigned to a family member
  CREATE TABLE IF NOT EXISTS cycles (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    triggered_at  INTEGER NOT NULL,
    assigned_to   INTEGER REFERENCES members(id),
    chore_type    TEXT NOT NULL DEFAULT 'dishwasher',
    completed_at  INTEGER,
    shame_sent    INTEGER NOT NULL DEFAULT 0,
    lock_sent     INTEGER NOT NULL DEFAULT 0
  );

  -- Escalation reminders already sent for a cycle
  CREATE TABLE IF NOT EXISTS reminders (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    cycle_id  INTEGER NOT NULL REFERENCES cycles(id),
    sent_at   INTEGER NOT NULL,
    level     TEXT NOT NULL
  );

  -- Points earned by kids for completing chores
  CREATE TABLE IF NOT EXISTS points (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id   INTEGER NOT NULL REFERENCES members(id),
    cycle_id    INTEGER REFERENCES cycles(id),
    pts         INTEGER NOT NULL DEFAULT 0,
    reason      TEXT NOT NULL DEFAULT '',
    earned_at   INTEGER NOT NULL
  );

  -- Shared family shopping list
  CREATE TABLE IF NOT EXISTS shopping_list (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    text        TEXT NOT NULL,
    added_by    TEXT NOT NULL DEFAULT '',
    done        INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );

  -- Family calendar events
  CREATE TABLE IF NOT EXISTS calendar_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    date_str    TEXT NOT NULL,
    time_str    TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    created_by  TEXT NOT NULL DEFAULT '',
    created_at  INTEGER NOT NULL
  );

  -- Family noticeboard posts
  CREATE TABLE IF NOT EXISTS noticeboard_posts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    body        TEXT NOT NULL DEFAULT '',
    created_by  TEXT NOT NULL DEFAULT '',
    created_at  INTEGER NOT NULL
  );
`);

// Migrate existing cycles table to add chore_type if missing
try {
  db.exec(`ALTER TABLE cycles ADD COLUMN chore_type TEXT NOT NULL DEFAULT 'dishwasher'`);
} catch (_) {
  // Column already exists — ignore
}

// ─── Chore metadata ───────────────────────────────────────────────────────────

const CHORE_META = {
  dishwasher: { label: 'Umývačka riadu',  emoji: '🍽️',  basePoints: 10 },
  cleaning:   { label: 'Upratovanie',     emoji: '🧹',  basePoints: 15 },
  trash:      { label: 'Smeti',           emoji: '🗑️',  basePoints: 10 },
  meals:      { label: 'Varenie',         emoji: '🍳',  basePoints: 10 },
  laundry:    { label: 'Pranie',          emoji: '👕',  basePoints: 15 },
};

function getChoreMeta(choreType) {
  return CHORE_META[choreType] || CHORE_META.dishwasher;
}

/**
 * Calculate points earned based on chore type and time taken (seconds).
 * Fast bonus: under 30 min → base + 5
 * Normal:     under 60 min → base
 * Slow:       under 120 min → base - 5 (min 1)
 * Very slow:  120+ min → 0
 */
function calcPoints(choreType, elapsedSeconds) {
  const { basePoints } = getChoreMeta(choreType);
  if (elapsedSeconds < 30 * 60)  return basePoints + 5;
  if (elapsedSeconds < 60 * 60)  return basePoints;
  if (elapsedSeconds < 120 * 60) return Math.max(1, basePoints - 5);
  return 0;
}

// ─── Token helpers ────────────────────────────────────────────────────────────

function saveTokens({ access_token, refresh_token, expires_in }) {
  const expires_at = Math.floor(Date.now() / 1000) + expires_in - 60;
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

function createCycle(assigned_to_id, choreType = 'dishwasher') {
  const result = db.prepare(`
    INSERT INTO cycles (triggered_at, assigned_to, chore_type) VALUES (?, ?, ?)
  `).run(Math.floor(Date.now() / 1000), assigned_to_id, choreType);
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

// ─── Points helpers ───────────────────────────────────────────────────────────

function awardPoints(memberName, cycleId, pts, reason) {
  const member = db.prepare('SELECT id FROM members WHERE name = ?').get(memberName);
  if (!member) return;
  db.prepare(`
    INSERT INTO points (member_id, cycle_id, pts, reason, earned_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(member.id, cycleId || null, pts, reason || '', Math.floor(Date.now() / 1000));
}

function getPointsLeaderboard() {
  return db.prepare(`
    SELECT m.name, COALESCE(SUM(p.pts), 0) as total_points, COUNT(p.id) as chores_done
    FROM members m
    LEFT JOIN points p ON p.member_id = m.id
    WHERE m.is_parent = 0
    GROUP BY m.id
    ORDER BY total_points DESC
  `).all();
}

function getMemberPointHistory(name, limit = 20) {
  return db.prepare(`
    SELECT p.pts, p.reason, p.earned_at, c.chore_type
    FROM points p
    LEFT JOIN cycles c ON c.id = p.cycle_id
    JOIN members m ON m.id = p.member_id
    WHERE m.name = ?
    ORDER BY p.earned_at DESC
    LIMIT ?
  `).all(name, limit);
}

// ─── Shopping list helpers ────────────────────────────────────────────────────

function getShoppingList() {
  return db.prepare(`
    SELECT * FROM shopping_list ORDER BY done ASC, created_at DESC
  `).all();
}

function addShoppingItem(text, addedBy) {
  const now = Math.floor(Date.now() / 1000);
  const result = db.prepare(`
    INSERT INTO shopping_list (text, added_by, done, created_at, updated_at)
    VALUES (?, ?, 0, ?, ?)
  `).run(text, addedBy || '', now, now);
  return result.lastInsertRowid;
}

function setShoppingItemDone(id, done) {
  db.prepare(`
    UPDATE shopping_list SET done = ?, updated_at = ? WHERE id = ?
  `).run(done ? 1 : 0, Math.floor(Date.now() / 1000), id);
}

function deleteShoppingItem(id) {
  db.prepare('DELETE FROM shopping_list WHERE id = ?').run(id);
}

function clearDoneShoppingItems() {
  db.prepare('DELETE FROM shopping_list WHERE done = 1').run();
}

// ─── Calendar helpers ─────────────────────────────────────────────────────────

function getCalendarEvents() {
  return db.prepare(`
    SELECT * FROM calendar_events ORDER BY date_str ASC, time_str ASC
  `).all();
}

function addCalendarEvent(title, dateStr, timeStr, description, createdBy) {
  const result = db.prepare(`
    INSERT INTO calendar_events (title, date_str, time_str, description, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(title, dateStr, timeStr || '', description || '', createdBy || '', Math.floor(Date.now() / 1000));
  return result.lastInsertRowid;
}

function deleteCalendarEvent(id) {
  db.prepare('DELETE FROM calendar_events WHERE id = ?').run(id);
}

// ─── Noticeboard helpers ──────────────────────────────────────────────────────

function getNoticeboardPosts() {
  return db.prepare(`
    SELECT * FROM noticeboard_posts ORDER BY created_at DESC
  `).all();
}

function addNoticeboardPost(title, body, createdBy) {
  const result = db.prepare(`
    INSERT INTO noticeboard_posts (title, body, created_by, created_at)
    VALUES (?, ?, ?, ?)
  `).run(title, body || '', createdBy || '', Math.floor(Date.now() / 1000));
  return result.lastInsertRowid;
}

function deleteNoticeboardPost(id) {
  db.prepare('DELETE FROM noticeboard_posts WHERE id = ?').run(id);
}

module.exports = {
  db,
  CHORE_META, getChoreMeta, calcPoints,
  saveTokens, getTokens,
  upsertMember, getAllMembers, getKids, getParents, updatePushToken,
  createCycle, getActiveCycle, completeCycle, markShame, markLock, getRecentCycles,
  recordReminder, getReminderCount,
  awardPoints, getPointsLeaderboard, getMemberPointHistory,
  getShoppingList, addShoppingItem, setShoppingItemDone, deleteShoppingItem, clearDoneShoppingItems,
  getCalendarEvents, addCalendarEvent, deleteCalendarEvent,
  getNoticeboardPosts, addNoticeboardPost, deleteNoticeboardPost,
};
