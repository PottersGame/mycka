'use strict';

/**
 * Push notifikácie cez Expo push service.
 */

const axios = require('axios');
const { getChoreMeta } = require('./db');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

async function sendPush(tokens, title, body, data = {}, priority = 'default') {
  const tokenList = Array.isArray(tokens) ? tokens : [tokens];
  const validTokens = tokenList.filter(Boolean);

  if (validTokens.length === 0) {
    console.warn('[Notifications] Žiadne platné push tokeny — preskakujem');
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
        console.error(`[Notifications] Push zlyhal pre ${validTokens[i]}:`, result.message);
      }
    });

    console.log(`[Notifications] Odoslaných ${validTokens.length} notifikácia/í: "${title}"`);
  } catch (err) {
    console.error('[Notifications] Expo push API chyba:', err.response?.data || err.message);
  }
}

// ─── Pomocné funkcie pre správy ───────────────────────────────────────────────

// Akčné sloveso pre daný typ povinnosti
function choreAction(choreType) {
  const actions = {
    dishwasher: 'vyložiť umývačku riadu',
    cleaning:   'upratať',
    trash:      'vyhodiť smeti',
    meals:      'postarať sa o jedlo',
    laundry:    'dať pranie',
  };
  return actions[choreType] || 'splniť povinnosť';
}

// ─── Tvorcovia správ ──────────────────────────────────────────────────────────

function buildInitialMessage(kidName, choreType = 'dishwasher') {
  const { label, emoji } = getChoreMeta(choreType);
  return {
    title: `${emoji} Hej ${kidName}! ${label} – si na rade!`,
    body:  `Je čas ${choreAction(choreType)}. Hneď!`,
  };
}

function buildReminderMessage(kidName, reminderNumber, choreType = 'dishwasher') {
  const prefixes = ['Stále čakáme…', 'Heeej! HALÓ?', 'Ignoruješ to?', 'POSLEDNÉ VAROVANIE!'];
  const prefix = prefixes[Math.min(reminderNumber - 1, prefixes.length - 1)];
  return {
    title: `⚠️ ${prefix} ${kidName}, povinnosť stále čaká`,
    body:  `Máš už ${reminderNumber * 30} minút. Urob to TERAZ alebo to bude horšie.`,
  };
}

function buildShameMessage(kidName, allKidNames, choreType = 'dishwasher') {
  const { label } = getChoreMeta(choreType);
  const others = allKidNames.filter(n => n !== kidName).join(', ');
  return {
    title: `😤 ${kidName} stále nespravil/a: ${label}!`,
    body:  `${kidName} ignoruje povinnosť už 2 hodiny. Teraz to vedia všetci${others ? `, ${others}` : ''}! 📢`,
  };
}

function buildLockWarningMessage(kidName) {
  return {
    title: `🔒 ${kidName} – tvoj telefón sa čoskoro zamkne`,
    body:  'Máš 5 minút na označenie povinnosti ako hotovej, inak sa telefón zamkne.',
  };
}

function buildLockMessage(kidName) {
  return {
    title: `🔒 Telefón zamknutý – splň povinnosť, ${kidName}`,
    body:  'Otvor aplikáciu a stlač „Hotovo" pre odomknutie.',
  };
}

function buildDoneMessage(kidName, choreType = 'dishwasher', points = 0) {
  const { label, emoji } = getChoreMeta(choreType);
  const pointsText = points > 0 ? ` +${points} bodov!` : '';
  return {
    title: `✅ ${kidName} splnil/a: ${label}!${pointsText}`,
    body:  `Výborne ${kidName}! 🎉${points > 0 ? ` Zarobil/a si ${points} bodov.` : ''}`,
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
