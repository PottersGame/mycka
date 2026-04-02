'use strict';

require('dotenv').config();

const express = require('express');
const cors    = require('cors');

const { upsertMember } = require('./db');
const { connectSSE, setDishwasherDoneCallback } = require('./homeconnect');
const { assignNextCycle }  = require('./rotation');
const { sendPush, buildInitialMessage } = require('./notifications');
const { startEscalationCron } = require('./escalation');
const authRoutes = require('./routes/auth');
const apiRoutes  = require('./routes/api');

const PORT = parseInt(process.env.PORT || '3000', 10);

// ─── Seed family members from .env ───────────────────────────────────────────
// Expected: FAMILY_KIDS=Emma,Liam,Sophia,Noah
// Expected: PARENT_NAME=Mom
function seedFamilyMembers() {
  const kidsEnv = process.env.FAMILY_KIDS || '';
  const kids = kidsEnv.split(',').map(s => s.trim()).filter(Boolean);
  kids.forEach((name, idx) => {
    upsertMember({ name, rotation_order: idx, is_parent: false });
  });

  const parentNamesEnv = process.env.PARENT_NAMES || process.env.PARENT_NAME || 'Rodič';
  const parents = parentNamesEnv.split(',').map(s => s.trim()).filter(Boolean);
  parents.forEach((name, idx) => {
    upsertMember({ name, rotation_order: 999 + idx, is_parent: true });
  });

  console.log(`[Setup] Family configured: kids=[${kids.join(', ')}], parents=[${parents.join(', ')}]`);
}

// ─── Dishwasher done callback ─────────────────────────────────────────────────
async function onDishwasherDone() {
  console.log('[App] Dishwasher done event received — assigning chore…');

  const result = assignNextCycle();
  if (result.skipped) {
    console.log(`[App] Chore already active for ${result.activeCycle.assignee_name} — skipping`);
    return;
  }

  const { kid, cycleId } = result;
  if (kid.push_token) {
    const msg = buildInitialMessage(kid.name);
    await sendPush(kid.push_token, msg.title, msg.body, { type: 'assigned', cycleId }, 'max');
    console.log(`[App] Initial notification sent to ${kid.name}`);
  } else {
    console.warn(`[App] ${kid.name} has no registered push token — cannot notify`);
  }
}

// ─── Express app ──────────────────────────────────────────────────────────────
const app = express();

app.use(cors());
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/api',  apiRoutes);

// Simple health check / home page with setup instructions
app.get('/', (req, res) => {
  const { getTokens } = require('./db');
  const { isConnected } = require('./homeconnect');
  const tokens = getTokens();

  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>DishwasherDuty Backend</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body { font-family: system-ui; max-width: 600px; margin: 40px auto; padding: 0 20px; }
      .ok   { color: green; }
      .warn { color: orange; }
      .step { background: #f5f5f5; padding: 12px; border-radius: 8px; margin: 8px 0; }
      code  { background: #eee; padding: 2px 6px; border-radius: 4px; }
    </style>
    </head>
    <body>
    <h1>🍽️ DishwasherDuty Backend</h1>
    <p>Status:</p>
    <ul>
      <li>Home Connect: ${tokens ? '<span class="ok">✅ Authenticated</span>' : '<span class="warn">⚠️ Not linked yet</span>'}</li>
      <li>SSE connection: ${isConnected() ? '<span class="ok">✅ Live</span>' : '<span class="warn">⚠️ Disconnected</span>'}</li>
    </ul>

    ${!tokens ? `
    <div class="step">
      <strong>Step 1 — Link your Bosch dishwasher:</strong><br>
      <a href="/auth/start">👉 Click here to connect Home Connect</a>
    </div>
    ` : ''}

    <div class="step">
      <strong>API:</strong><br>
      <code>GET /api/status</code> — current rotation<br>
      <code>POST /api/complete</code> — mark done (from app)<br>
      <code>POST /api/trigger</code> — manual trigger (parent)<br>
    </div>

    <div class="step">
      <strong>Test a manual trigger (parent only):</strong><br>
      <code>curl -X POST ${req.protocol}://${req.get('host')}/api/trigger \\<br>
        &nbsp;&nbsp;-H "X-Parent-Secret: YOUR_SECRET"</code>
    </div>
    </body>
    </html>
  `);
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function main() {
  seedFamilyMembers();

  setDishwasherDoneCallback(onDishwasherDone);

  // Try to restore SSE connection on startup (if we already have tokens)
  const { getTokens } = require('./db');
  if (getTokens()) {
    console.log('[App] Tokens found — reconnecting SSE…');
    connectSSE().catch(err => {
      console.warn('[App] SSE reconnect failed on startup:', err.message);
    });
  } else {
    console.log('[App] No tokens yet — visit /auth/start to link Home Connect');
  }

  startEscalationCron();

  app.listen(PORT, () => {
    console.log(`[App] Server running on http://localhost:${PORT}`);
  });
}

main().catch(err => {
  console.error('[App] Fatal startup error:', err);
  process.exit(1);
});
