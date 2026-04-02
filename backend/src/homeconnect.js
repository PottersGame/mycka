'use strict';

/**
 * Bosch Home Connect integration.
 *
 * Flow:
 *  1. Parent visits /auth/start → redirected to Home Connect login
 *  2. Home Connect redirects back to /auth/callback with ?code=…
 *  3. We exchange the code for tokens and store them
 *  4. connectSSE() opens a persistent SSE connection to listen for events
 *  5. When BSH.Common.Event.ProgramFinished fires, onDishwasherDone() is called
 */

const axios = require('axios');
const EventSource = require('eventsource');
const { saveTokens, getTokens } = require('./db');

const BASE_URL = 'https://api.home-connect.com';
const TOKEN_URL = `${BASE_URL}/security/oauth/token`;
const AUTH_URL  = `${BASE_URL}/security/oauth/authorize`;

const CLIENT_ID     = process.env.HOMECONNECT_CLIENT_ID;
const CLIENT_SECRET = process.env.HOMECONNECT_CLIENT_SECRET;
const REDIRECT_URI  = process.env.HOMECONNECT_REDIRECT_URI;
const DISHWASHER_ID = process.env.HOMECONNECT_DISHWASHER_HAIM;

// Callback registered by the application when the dishwasher finishes
let _onDishwasherDone = null;

function setDishwasherDoneCallback(fn) {
  _onDishwasherDone = fn;
}

// ─── OAuth helpers ────────────────────────────────────────────────────────────

function getAuthUrl() {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     CLIENT_ID,
    scope:         'Monitor',
    redirect_uri:  REDIRECT_URI,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function exchangeCode(code) {
  const resp = await axios.post(TOKEN_URL, new URLSearchParams({
    grant_type:    'authorization_code',
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri:  REDIRECT_URI,
    code,
  }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

  saveTokens(resp.data);
  return resp.data;
}

async function refreshAccessToken() {
  const stored = getTokens();
  if (!stored) throw new Error('No tokens stored — please complete OAuth first via /auth/start');

  const resp = await axios.post(TOKEN_URL, new URLSearchParams({
    grant_type:    'refresh_token',
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: stored.refresh_token,
  }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

  saveTokens(resp.data);
  return resp.data.access_token;
}

async function getValidAccessToken() {
  const stored = getTokens();
  if (!stored) throw new Error('Not authenticated — visit /auth/start first');

  const now = Math.floor(Date.now() / 1000);
  if (stored.expires_at > now) {
    return stored.access_token;
  }

  return refreshAccessToken();
}

// ─── SSE connection ───────────────────────────────────────────────────────────

let _es = null;
let _reconnectTimeout = null;

async function connectSSE() {
  if (!DISHWASHER_ID) {
    console.warn('[HomeConnect] HOMECONNECT_DISHWASHER_HAIM not set — SSE disabled');
    return;
  }

  try {
    const token = await getValidAccessToken();
    const url = `${BASE_URL}/api/homeappliances/${DISHWASHER_ID}/events`;

    console.log('[HomeConnect] Opening SSE connection to:', url);

    _es = new EventSource(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    _es.addEventListener('PROGRAM_FINISHED', handleProgramFinished);
    // Some firmware versions use this alternative key
    _es.addEventListener('BSH.Common.Event.ProgramFinished', handleProgramFinished);

    _es.onopen = () => {
      console.log('[HomeConnect] SSE connected');
      if (_reconnectTimeout) clearTimeout(_reconnectTimeout);
    };

    _es.onerror = async (err) => {
      console.error('[HomeConnect] SSE error — will reconnect in 30s:', err?.message);
      _es.close();
      _es = null;
      // Wait 30 seconds then try again (token may have expired)
      _reconnectTimeout = setTimeout(connectSSE, 30_000);
    };

  } catch (err) {
    console.error('[HomeConnect] connectSSE failed:', err.message);
    // Retry after 60 seconds if auth/network error
    _reconnectTimeout = setTimeout(connectSSE, 60_000);
  }
}

function handleProgramFinished(event) {
  console.log('[HomeConnect] Dishwasher program finished!', event.data);
  if (_onDishwasherDone) {
    _onDishwasherDone().catch(err => {
      console.error('[HomeConnect] onDishwasherDone callback error:', err.message);
    });
  }
}

function isConnected() {
  return _es !== null && _es.readyState === EventSource.OPEN;
}

module.exports = {
  getAuthUrl,
  exchangeCode,
  getValidAccessToken,
  connectSSE,
  setDishwasherDoneCallback,
  isConnected,
};
