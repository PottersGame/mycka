'use strict';

/**
 * Escalation engine — runs on a cron tick and punishes procrastination.
 *
 * Timeline after dishwasher finishes (configurable via .env):
 *   T+0m   → initial notification sent by rotation.js
 *   T+30m  → first reminder (repeats every 30m)
 *   T+60m  → second reminder
 *   T+90m  → third reminder
 *   T+120m → SHAME notification sent to ALL family members
 *   T+175m → LOCK WARNING sent to the kid
 *   T+180m → LOCK command sent to the kid's phone
 */

const cron = require('node-cron');
const {
  getActiveCycle, getKids, getParents,
  markShame, markLock, recordReminder, getReminderCount,
} = require('./db');

const {
  sendPush,
  buildReminderMessage, buildShameMessage,
  buildLockWarningMessage, buildLockMessage,
} = require('./notifications');

const REMINDER_MINUTES = parseInt(process.env.ESCALATION_REMINDER_MINUTES || '30', 10);
const SHAME_MINUTES    = parseInt(process.env.ESCALATION_SHAME_MINUTES    || '120', 10);
const LOCK_MINUTES     = parseInt(process.env.ESCALATION_LOCK_MINUTES     || '180', 10);

const REMINDER_SECONDS = REMINDER_MINUTES * 60;
const SHAME_SECONDS    = SHAME_MINUTES    * 60;
const LOCK_SECONDS     = LOCK_MINUTES     * 60;
const LOCK_WARN_SECONDS = LOCK_SECONDS - 5 * 60; // 5 minutes before lock

async function runEscalation() {
  const cycle = getActiveCycle();
  if (!cycle) return; // Nothing pending

  const now = Math.floor(Date.now() / 1000);
  const elapsed = now - cycle.triggered_at;

  const kidName   = cycle.assignee_name;
  const kidToken  = cycle.assignee_token;
  const kids      = getKids();
  const parents   = getParents();

  // ── 1. Escalating reminders (every REMINDER_MINUTES) ──────────────────────
  const { count: remindersSent } = getReminderCount(cycle.id);
  const expectedReminders = Math.floor(elapsed / REMINDER_SECONDS);

  if (expectedReminders > remindersSent && elapsed < SHAME_SECONDS) {
    const nextLevel = remindersSent + 1;
    const msg = buildReminderMessage(kidName, nextLevel, cycle.chore_type);
    await sendPush(kidToken, msg.title, msg.body, { type: 'reminder', cycleId: cycle.id }, 'max');

    // Also ping the parent after the 3rd reminder
    if (nextLevel >= 3) {
      const parentTokens = parents.map(p => p.push_token).filter(Boolean);
      await sendPush(
        parentTokens,
        `⚠️ FYI: ${kidName} is ignoring the dishes`,
        `This is reminder #${nextLevel}. You may want to intervene.`,
        { type: 'parent_alert', cycleId: cycle.id },
      );
    }

    recordReminder(cycle.id, 'reminder');
    console.log(`[Escalation] Sent reminder #${nextLevel} to ${kidName}`);
  }

  // ── 2. Shame notification to ALL family ───────────────────────────────────
  if (elapsed >= SHAME_SECONDS && !cycle.shame_sent) {
    const allKidNames = kids.map(k => k.name);
    const msg = buildShameMessage(kidName, allKidNames, cycle.chore_type);

    const allTokens = [
      ...kids.map(k => k.push_token),
      ...parents.map(p => p.push_token),
    ].filter(Boolean);

    await sendPush(allTokens, msg.title, msg.body, { type: 'shame', cycleId: cycle.id }, 'max');
    markShame(cycle.id);
    recordReminder(cycle.id, 'shame');
    console.log(`[Escalation] Shame notification sent — ${kidName} has not done the dishes`);
  }

  // ── 3. Lock warning (5 minutes before lock) ───────────────────────────────
  if (elapsed >= LOCK_WARN_SECONDS && elapsed < LOCK_SECONDS && !cycle.lock_sent) {
    const msg = buildLockWarningMessage(kidName);
    await sendPush(kidToken, msg.title, msg.body, { type: 'lock_warning', cycleId: cycle.id }, 'max');
    console.log(`[Escalation] Lock warning sent to ${kidName}`);
  }

  // ── 4. Phone lock ─────────────────────────────────────────────────────────
  if (elapsed >= LOCK_SECONDS && !cycle.lock_sent) {
    const msg = buildLockMessage(kidName);
    await sendPush(
      kidToken,
      msg.title,
      msg.body,
      { type: 'lock', cycleId: cycle.id },  // App reacts to this by calling lockScreen()
      'max',
    );
    markLock(cycle.id);
    recordReminder(cycle.id, 'lock');
    console.log(`[Escalation] Lock command sent to ${kidName}'s phone`);
  }
}

function startEscalationCron() {
  // Check every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    runEscalation().catch(err => {
      console.error('[Escalation] Cron error:', err.message);
    });
  });
  console.log('[Escalation] Cron started — checking every 5 minutes');
}

module.exports = { startEscalationCron, runEscalation };
