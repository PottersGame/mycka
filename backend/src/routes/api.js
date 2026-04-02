'use strict';

/**
 * REST API used by the mobile app and parent dashboard.
 *
 * Public endpoints (used by kids' phones):
 *   POST /api/register-token   — register an Expo push token for a family member
 *   GET  /api/status           — get current rotation status
 *   POST /api/complete         — mark the active chore as done
 *   GET  /api/history          — recent cycle history
 *
 * Parent-only endpoints (require X-Parent-Secret header):
 *   POST /api/trigger          — manually trigger a new cycle (as if dishwasher finished)
 *   POST /api/skip             — skip the current kid and assign to next
 *   POST /api/reset            — clear the active cycle without completing
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { getAllMembers, getKids, getParents, updatePushToken, getActiveCycle, getRecentCycles } = require('../db');
const { assignNextCycle, markDone } = require('../rotation');
const { sendPush, buildInitialMessage, buildDoneMessage } = require('../notifications');

const router = express.Router();
const PARENT_SECRET = process.env.PARENT_SECRET || '';

// Rate limiting — prevent push-token spam
const limiter = rateLimit({ windowMs: 60_000, max: 30 });
router.use(limiter);

function requireParent(req, res, next) {
  if (req.headers['x-parent-secret'] !== PARENT_SECRET || !PARENT_SECRET) {
    return res.status(403).json({ error: 'Forbidden — invalid parent secret' });
  }
  next();
}

// ─── Public ───────────────────────────────────────────────────────────────────

/**
 * Register or update a push token for a named family member.
 * Body: { name: "Emma", pushToken: "ExponentPushToken[...]" }
 */
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

/**
 * Get current rotation status.
 * Returns: activeCycle (if any) + ordered list of kids + their push token registration status.
 */
router.get('/status', (req, res) => {
  const active = getActiveCycle();
  const kids   = getKids();

  res.json({
    activeCycle: active ? {
      id:          active.id,
      assignee:    active.assignee_name,
      triggeredAt: active.triggered_at,
      shamesSent:  !!active.shame_sent,
      lockSent:    !!active.lock_sent,
    } : null,
    kids: kids.map(k => ({
      name:        k.name,
      order:       k.rotation_order,
      hasToken:    !!k.push_token,
    })),
  });
});

/**
 * Mark the active chore as done.
 * Body: { name: "Emma", cycleId: 5 }
 */
router.post('/complete', async (req, res) => {
  const { name, cycleId } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const completed = markDone(cycleId || null);
  if (!completed) {
    return res.status(409).json({ error: 'No active cycle to complete' });
  }

  // Notify all family members that the chore is done
  const allMembers = getAllMembers();
  const allTokens  = allMembers.map(m => m.push_token).filter(Boolean);
  const msg = buildDoneMessage(name);
  await sendPush(allTokens, msg.title, msg.body, { type: 'done' });

  res.json({ ok: true, message: `${name} marked the chore as done!` });
});

/**
 * Get recent cycle history (last 20 cycles).
 */
router.get('/history', (req, res) => {
  const cycles = getRecentCycles(20);
  res.json({ cycles });
});

// ─── Parent-only ──────────────────────────────────────────────────────────────

/**
 * Manually trigger a new chore cycle (same as if the dishwasher just finished).
 */
router.post('/trigger', requireParent, async (req, res) => {
  const result = assignNextCycle();

  if (result.skipped) {
    return res.json({
      ok: false,
      message: `Skipped — there's already an active cycle for ${result.activeCycle.assignee_name}`,
    });
  }

  const { kid, cycleId } = result;
  if (kid.push_token) {
    const msg = buildInitialMessage(kid.name);
    await sendPush(kid.push_token, msg.title, msg.body, { type: 'assigned', cycleId }, 'max');
  }

  res.json({ ok: true, assignedTo: kid.name, cycleId });
});

/**
 * Skip the current kid (e.g. they're sick) and assign to the next one.
 */
router.post('/skip', requireParent, async (req, res) => {
  const active = getActiveCycle();
  if (!active) return res.status(409).json({ error: 'No active cycle to skip' });

  // Complete current cycle without notifying done
  const { completeCycle } = require('../db');
  completeCycle(active.id);

  // Assign to next kid
  const result = assignNextCycle();
  if (result.skipped) {
    return res.json({ ok: false, message: 'Could not assign next kid' });
  }

  const { kid, cycleId } = result;
  if (kid.push_token) {
    const msg = buildInitialMessage(kid.name);
    await sendPush(
      kid.push_token,
      msg.title,
      `${active.assignee_name} was skipped, so now it's YOUR turn!`,
      { type: 'assigned', cycleId },
      'max',
    );
  }

  res.json({ ok: true, skipped: active.assignee_name, assignedTo: kid.name, cycleId });
});

/**
 * Reset (dismiss) the active cycle without marking it as done.
 * Use when you want to clear a stale cycle.
 */
router.post('/reset', requireParent, (req, res) => {
  const active = getActiveCycle();
  if (!active) return res.status(409).json({ error: 'No active cycle' });

  const { completeCycle } = require('../db');
  completeCycle(active.id);

  res.json({ ok: true, message: `Cycle for ${active.assignee_name} has been reset` });
});

module.exports = router;
