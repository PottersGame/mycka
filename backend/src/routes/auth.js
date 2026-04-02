'use strict';

/**
 * OAuth routes for Bosch Home Connect authentication.
 * The parent visits /auth/start once to link their Home Connect account.
 */

const express = require('express');
const { getAuthUrl, exchangeCode, connectSSE } = require('../homeconnect');

const router = express.Router();

// Step 1: Redirect the parent to Home Connect login
router.get('/start', (req, res) => {
  const url = getAuthUrl();
  res.redirect(url);
});

// Step 2: Home Connect redirects back here after login
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.status(400).send(`Home Connect error: ${error}`);
  }
  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  try {
    await exchangeCode(code);
    // Immediately start listening for dishwasher events
    await connectSSE();
    res.send(`
      <h1>✅ Connected to Bosch Home Connect!</h1>
      <p>Your dishwasher is now being monitored. When the program finishes,
         the next kid in rotation will receive a notification.</p>
      <p>You can close this tab.</p>
    `);
  } catch (err) {
    console.error('[Auth] Token exchange failed:', err.message);
    res.status(500).send(`Authentication failed: ${err.message}`);
  }
});

// Check auth status
router.get('/status', (req, res) => {
  const { getTokens } = require('../db');
  const { isConnected } = require('../homeconnect');
  const tokens = getTokens();
  res.json({
    authenticated: !!tokens,
    sseConnected: isConnected(),
  });
});

module.exports = router;
