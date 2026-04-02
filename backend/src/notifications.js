'use strict';

/**
 * Push notifications via Expo's push service.
 *
 * Expo abstracts FCM (Android) so we don't need a Firebase service account key.
 * Each device registers an Expo Push Token that looks like:
 *   ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]
 *
 * Docs: https://docs.expo.dev/push-notifications/sending-notifications/
 */

const axios = require('axios');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Send a push notification to one or more Expo push tokens.
 * @param {string|string[]} tokens  - Expo push token(s)
 * @param {string} title
 * @param {string} body
 * @param {object} [data]           - Custom data payload delivered to the app
 * @param {'default'|'max'} [priority]
 */
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
    channelId: 'chores',  // Android notification channel (defined in the app)
    // Show as heads-up notification on Android
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

function buildInitialMessage(kidName) {
  return {
    title: `🍽️ Hey ${kidName}! Dishwasher duty!`,
    body: 'The dishwasher is done. It\'s YOUR turn to unload it. Do it now!',
  };
}

function buildReminderMessage(kidName, reminderNumber) {
  const prefixes = ['Still waiting…', 'Hey! HELLO?', 'Are you ignoring this?', 'LAST WARNING!'];
  const prefix = prefixes[Math.min(reminderNumber - 1, prefixes.length - 1)];
  return {
    title: `⚠️ ${prefix} ${kidName}, dishes are still waiting`,
    body: `You've had ${reminderNumber * 30} minutes. Unload the dishwasher NOW or this gets worse.`,
  };
}

function buildShameMessage(kidName, allKidNames) {
  const others = allKidNames.filter(n => n !== kidName).join(', ');
  return {
    title: `😤 ${kidName} still hasn't done the dishes!`,
    body: `${kidName} has been ignoring the dishwasher for 2 hours. Everybody knows now, ${others}! 📢`,
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
    title: `🔒 Phone locked — do the dishes ${kidName}`,
    body: 'Open the DishwasherDuty app and press "I\'m Done" to unlock your phone.',
  };
}

function buildDoneMessage(kidName) {
  return {
    title: `✅ ${kidName} did the dishes!`,
    body: 'The dishwasher has been unloaded. Nice work! 🎉',
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
