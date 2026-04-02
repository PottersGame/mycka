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
 * If there is already an active (incomplete) cycle, returns null (already pending).
 */
function getNextKid() {
  const active = getActiveCycle();
  if (active) {
    // There is already an unfinished cycle — don't assign again
    return null;
  }

  const kids = getKids();
  if (kids.length === 0) throw new Error('No kids configured');

  // Find the most recently completed cycle to determine who's next
  const { db } = require('./db');
  const lastCompleted = db.prepare(`
    SELECT assigned_to FROM cycles
    WHERE completed_at IS NOT NULL
    ORDER BY completed_at DESC
    LIMIT 1
  `).get();

  if (!lastCompleted) {
    // First ever cycle — start with index 0
    return kids[0];
  }

  // Find the current kid's position in the rotation and pick the next one
  const lastIdx = kids.findIndex(k => k.id === lastCompleted.assigned_to);
  const nextIdx = (lastIdx + 1) % kids.length;
  return kids[nextIdx];
}

/**
 * Called when the dishwasher finishes.
 * Creates a new cycle and returns the assigned kid + cycle id.
 */
function assignNextCycle() {
  const kid = getNextKid();
  if (!kid) {
    const active = getActiveCycle();
    console.log(`[Rotation] Skipping — cycle already active for ${active.assignee_name}`);
    return { skipped: true, activeCycle: active };
  }

  const cycleId = createCycle(kid.id);
  console.log(`[Rotation] Assigned cycle #${cycleId} to ${kid.name}`);
  return { skipped: false, kid, cycleId };
}

/**
 * Mark the active cycle as done.
 * Returns true if a cycle was completed, false if there was nothing active.
 */
function markDone(cycleId) {
  const active = getActiveCycle();
  if (!active) return false;
  if (cycleId && active.id !== cycleId) return false;

  completeCycle(active.id);
  console.log(`[Rotation] Cycle #${active.id} marked as completed by ${active.assignee_name}`);
  return true;
}

module.exports = { assignNextCycle, getNextKid, markDone };
