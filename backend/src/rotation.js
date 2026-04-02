'use strict';

/**
 * Manages the round-robin chore rotation among kids.
 * State is persisted in SQLite so restarts don't reset the rotation.
 */

const {
  getKids, createCycle, getActiveCycle, completeCycle,
} = require('./db');

/**
 * Returns the kid whose turn it is next, advancing from the last completed cycle.
 * If there is already an active (incomplete) cycle, returns null.
 */
function getNextKid() {
  const active = getActiveCycle();
  if (active) return null;

  const kids = getKids();
  if (kids.length === 0) throw new Error('No kids configured');

  const { db } = require('./db');
  const lastCompleted = db.prepare(`
    SELECT assigned_to FROM cycles
    WHERE completed_at IS NOT NULL
    ORDER BY completed_at DESC
    LIMIT 1
  `).get();

  if (!lastCompleted) return kids[0];

  const lastIdx = kids.findIndex(k => k.id === lastCompleted.assigned_to);
  const nextIdx = (lastIdx + 1) % kids.length;
  return kids[nextIdx];
}

/**
 * Called when a chore needs assigning.
 * @param {string} [choreType='dishwasher']  One of: dishwasher, cleaning, trash, meals, laundry
 */
function assignNextCycle(choreType = 'dishwasher') {
  const kid = getNextKid();
  if (!kid) {
    const active = getActiveCycle();
    console.log(`[Rotation] Skipping — cycle already active for ${active.assignee_name}`);
    return { skipped: true, activeCycle: active };
  }

  const cycleId = createCycle(kid.id, choreType);
  console.log(`[Rotation] Assigned ${choreType} cycle #${cycleId} to ${kid.name}`);
  return { skipped: false, kid, cycleId };
}

/**
 * Mark the active cycle as done.
 * Returns the completed cycle object, or null if nothing was active.
 */
function markDone(cycleId) {
  const active = getActiveCycle();
  if (!active) return null;
  if (cycleId && active.id !== cycleId) return null;

  completeCycle(active.id);
  console.log(`[Rotation] Cycle #${active.id} (${active.chore_type}) marked done by ${active.assignee_name}`);
  return active;
}

module.exports = { assignNextCycle, getNextKid, markDone };
