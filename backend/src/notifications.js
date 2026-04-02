'use strict';

/**
 * Push notifications via Expo's push service.
 */

const axios = require('axios');
const { getChoreMeta } = require('./db');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

async function sendPush(tokens, title, body, data = {}, priority = 'default') {
  const tokenList = Array.isArray(tokens) ? tokens : [tokens];
  const validTokens = tokenList.filter(Boolean);

  if (validTokens.length === 0) {
    console.warn('[Notifications] No valid push tokens — skipping push');
    return;
  }

  const messages = validTokens.map(to => ({
    to,
    title,
    body,
    data,
    priority,
    sound: 'default',
    channelId: 'chores',
    androidMode: 'default',
  }));

  try {
    const resp = await axios.post(EXPO_PUSH_URL, messages, {
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
    });

    const results = resp.data?.data || [];
    results.forEach((result, i) => {
      if (result.status === 'error') {
        console.error(`[Notifications] Push failed for ${validTokens[i]}:`, result.message);
      }
    });

    console.log(`[Notifications] Sent ${validTokens.length} push notification(s): "${title}"`);
  } catch (err) {
    console.error('[Notifications] Expo push API error:', err.response?.data || err.message);
  }
}

// ─── Message builders ─────────────────────────────────────────────────────────

function buildInitialMessage(kidName, choreType = 'dishwasher') {
  const { label, emoji } = getChoreMeta(choreType);
  return {
    title: `${emoji} Hey ${kidName}! ${label} duty!`,
    body: choreType === 'dishwasher'
      ? "The dishwasher is done. It's YOUR turn to unload it. Do it now!"
      : `It's your turn to handle ${label.toLowerCase()}. Do it now!`,
  };
}

function buildReminderMessage(kidName, reminderNumber, choreType = 'dishwasher') {
  const { label } = getChoreMeta(choreType);
  const prefixes = ['Still waiting…', 'Hey! HELLO?', 'Are you ignoring this?', 'LAST WARNING!'];
  const prefix = prefixes[Math.min(reminderNumber - 1, prefixes.length - 1)];
  return {
    title: `⚠️ ${prefix} ${kidName}, ${label.toLowerCase()} is still waiting`,
    body: `You've had ${reminderNumber * 30} minutes. Do it NOW or this gets worse.`,
  };
}

function buildShameMessage(kidName, allKidNames, choreType = 'dishwasher') {
  const { label } = getChoreMeta(choreType);
  const others = allKidNames.filter(n => n !== kidName).join(', ');
  return {
    title: `😤 ${kidName} still hasn't done ${label.toLowerCase()}!`,
    body: `${kidName} has been ignoring it for 2 hours. Everybody knows now${others ? `, ${others}` : ''}! 📢`,
  };
}

function buildLockWarningMessage(kidName) {
  return {
    title: `🔒 ${kidName} — your phone is about to be locked`,
    body: 'You have 5 minutes to open the app and mark the chore as done, or your phone gets locked.',
  };
}

function buildLockMessage(kidName) {
  return {
    title: `🔒 Phone locked — do your chore ${kidName}`,
    body: "Open the app and press \"I'm Done\" to unlock your phone.",
  };
}

function buildDoneMessage(kidName, choreType = 'dishwasher', points = 0) {
  const { label, emoji } = getChoreMeta(choreType);
  const pointsText = points > 0 ? ` +${points} points!` : '';
  return {
    title: `✅ ${kidName} did ${label.toLowerCase()}!${pointsText}`,
    body: `Nice work ${kidName}! 🎉${points > 0 ? ` You earned ${points} points.` : ''}`,
  };
}

module.exports = {
  sendPush,
  buildInitialMessage,
  buildReminderMessage,
  buildShameMessage,
  buildLockWarningMessage,
  buildLockMessage,
  buildDoneMessage,
};
