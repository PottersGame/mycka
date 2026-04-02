'use strict';

/**
 * REST API used by the mobile app.
 *
 * Public endpoints (kids' phones):
 *   POST /api/register-token
 *   GET  /api/status
 *   POST /api/complete
 *   GET  /api/history
 *   GET  /api/points
 *   GET  /api/points/:name
 *   GET  /api/shopping
 *   POST /api/shopping
 *   PATCH /api/shopping/:id
 *   DELETE /api/shopping/:id
 *   DELETE /api/shopping/done  (clear all ticked items)
 *   GET  /api/calendar
 *   GET  /api/noticeboard
 *
 * Parent-only (X-Parent-Secret header):
 *   POST /api/trigger
 *   POST /api/skip
 *   POST /api/reset
 *   POST /api/calendar
 *   DELETE /api/calendar/:id
 *   POST /api/noticeboard
 *   DELETE /api/noticeboard/:id
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  getAllMembers, getKids, updatePushToken,
  getActiveCycle, getRecentCycles,
  CHORE_META, calcPoints,
  awardPoints, getPointsLeaderboard, getMemberPointHistory,
  getShoppingList, addShoppingItem, setShoppingItemDone, deleteShoppingItem, clearDoneShoppingItems,
  getCalendarEvents, addCalendarEvent, deleteCalendarEvent,
  getNoticeboardPosts, addNoticeboardPost, deleteNoticeboardPost,
} = require('../db');
const { assignNextCycle, markDone } = require('../rotation');
const { sendPush, buildInitialMessage, buildDoneMessage } = require('../notifications');

const router = express.Router();
const PARENT_SECRET = process.env.PARENT_SECRET || '';

const limiter = rateLimit({ windowMs: 60_000, max: 60 });
router.use(limiter);

const VALID_CHORE_TYPES = Object.keys(CHORE_META);

function requireParent(req, res, next) {
  if (req.headers['x-parent-secret'] !== PARENT_SECRET || !PARENT_SECRET) {
    return res.status(403).json({ error: 'Forbidden — invalid parent secret' });
  }
  next();
}

// ─── Public ───────────────────────────────────────────────────────────────────

router.post('/register-token', (req, res) => {
  const { name, pushToken } = req.body;
  if (!name || !pushToken) {
    return res.status(400).json({ error: 'name and pushToken are required' });
  }
  if (!pushToken.startsWith('ExponentPushToken[')) {
    return res.status(400).json({ error: 'Invalid Expo push token format' });
  }
  updatePushToken(name, pushToken);
  res.json({ ok: true });
});

router.get('/status', (req, res) => {
  const active = getActiveCycle();
  const kids   = getKids();

  res.json({
    activeCycle: active ? {
      id:          active.id,
      assignee:    active.assignee_name,
      choreType:   active.chore_type,
      triggeredAt: active.triggered_at,
      shamesSent:  !!active.shame_sent,
      lockSent:    !!active.lock_sent,
    } : null,
    kids: kids.map(k => ({
      name:     k.name,
      order:    k.rotation_order,
      hasToken: !!k.push_token,
    })),
    choreTypes: Object.entries(CHORE_META).map(([key, meta]) => ({
      key,
      label: meta.label,
      emoji: meta.emoji,
      basePoints: meta.basePoints,
    })),
  });
});

router.post('/complete', async (req, res) => {
  const { name, cycleId } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const completed = markDone(cycleId || null);
  if (!completed) {
    return res.status(409).json({ error: 'No active cycle to complete' });
  }

  // Calculate and award points
  const elapsed = Math.floor(Date.now() / 1000) - completed.triggered_at;
  const pts = calcPoints(completed.chore_type, elapsed);
  if (pts > 0) {
    awardPoints(name, completed.id, pts, `Completed ${completed.chore_type}`);
  }

  // Notify all family
  const allMembers = getAllMembers();
  const allTokens  = allMembers.map(m => m.push_token).filter(Boolean);
  const msg = buildDoneMessage(name, completed.chore_type, pts);
  await sendPush(allTokens, msg.title, msg.body, { type: 'done', points: pts });

  res.json({ ok: true, pointsAwarded: pts, message: `${name} marked the chore as done!` });
});

router.get('/history', (req, res) => {
  const cycles = getRecentCycles(20);
  res.json({ cycles });
});

// ─── Points ───────────────────────────────────────────────────────────────────

router.get('/points', (req, res) => {
  res.json({ leaderboard: getPointsLeaderboard() });
});

router.get('/points/:name', (req, res) => {
  const history = getMemberPointHistory(req.params.name, 30);
  res.json({ history });
});

// ─── Shopping list ────────────────────────────────────────────────────────────

router.get('/shopping', (req, res) => {
  res.json({ items: getShoppingList() });
});

router.post('/shopping', (req, res) => {
  const { text, addedBy } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  const id = addShoppingItem(text.trim(), addedBy || '');
  res.json({ ok: true, id });
});

router.patch('/shopping/:id', (req, res) => {
  const id   = parseInt(req.params.id, 10);
  const done = req.body.done !== undefined ? !!req.body.done : true;
  setShoppingItemDone(id, done);
  res.json({ ok: true });
});

router.delete('/shopping/done', (req, res) => {
  clearDoneShoppingItems();
  res.json({ ok: true });
});

router.delete('/shopping/:id', (req, res) => {
  deleteShoppingItem(parseInt(req.params.id, 10));
  res.json({ ok: true });
});

// ─── Calendar ─────────────────────────────────────────────────────────────────

router.get('/calendar', (req, res) => {
  res.json({ events: getCalendarEvents() });
});

router.post('/calendar', requireParent, (req, res) => {
  const { title, dateStr, timeStr, description, createdBy } = req.body;
  if (!title || !dateStr) {
    return res.status(400).json({ error: 'title and dateStr are required' });
  }
  const id = addCalendarEvent(title, dateStr, timeStr, description, createdBy);
  res.json({ ok: true, id });
});

router.delete('/calendar/:id', requireParent, (req, res) => {
  deleteCalendarEvent(parseInt(req.params.id, 10));
  res.json({ ok: true });
});

// ─── Noticeboard ──────────────────────────────────────────────────────────────

router.get('/noticeboard', (req, res) => {
  res.json({ posts: getNoticeboardPosts() });
});

router.post('/noticeboard', requireParent, (req, res) => {
  const { title, body, createdBy } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const id = addNoticeboardPost(title, body, createdBy);
  res.json({ ok: true, id });
});

router.delete('/noticeboard/:id', requireParent, (req, res) => {
  deleteNoticeboardPost(parseInt(req.params.id, 10));
  res.json({ ok: true });
});

// ─── Parent-only chore controls ───────────────────────────────────────────────

router.post('/trigger', requireParent, async (req, res) => {
  const choreType = VALID_CHORE_TYPES.includes(req.body?.choreType)
    ? req.body.choreType
    : 'dishwasher';

  const result = assignNextCycle(choreType);

  if (result.skipped) {
    return res.json({
      ok: false,
      message: `Skipped — there's already an active cycle for ${result.activeCycle.assignee_name}`,
    });
  }

  const { kid, cycleId } = result;
  if (kid.push_token) {
    const msg = buildInitialMessage(kid.name, choreType);
    await sendPush(kid.push_token, msg.title, msg.body, { type: 'assigned', cycleId, choreType }, 'max');
  }

  res.json({ ok: true, assignedTo: kid.name, cycleId, choreType });
});

router.post('/skip', requireParent, async (req, res) => {
  const active = getActiveCycle();
  if (!active) return res.status(409).json({ error: 'No active cycle to skip' });

  const { completeCycle } = require('../db');
  completeCycle(active.id);

  const choreType = active.chore_type || 'dishwasher';
  const result = assignNextCycle(choreType);
  if (result.skipped) {
    return res.json({ ok: false, message: 'Could not assign next kid' });
  }

  const { kid, cycleId } = result;
  if (kid.push_token) {
    const msg = buildInitialMessage(kid.name, choreType);
    await sendPush(
      kid.push_token,
      msg.title,
      `${active.assignee_name} was skipped, so now it's YOUR turn!`,
      { type: 'assigned', cycleId, choreType },
      'max',
    );
  }

  res.json({ ok: true, skipped: active.assignee_name, assignedTo: kid.name, cycleId });
});

router.post('/reset', requireParent, (req, res) => {
  const active = getActiveCycle();
  if (!active) return res.status(409).json({ error: 'No active cycle' });

  const { completeCycle } = require('../db');
  completeCycle(active.id);

  res.json({ ok: true, message: `Cycle for ${active.assignee_name} has been reset` });
});

module.exports = router;
