'use strict';

import * as SecureStore from 'expo-secure-store';

const BASE_URL_KEY  = 'api_base_url';
const USER_NAME_KEY = 'user_name';
const PARENT_SECRET_KEY = 'parent_secret';

export async function getBaseUrl() {
  return await SecureStore.getItemAsync(BASE_URL_KEY) || '';
}

export async function saveBaseUrl(url) {
  await SecureStore.setItemAsync(BASE_URL_KEY, url.replace(/\/$/, ''));
}

export async function getUserName() {
  return await SecureStore.getItemAsync(USER_NAME_KEY) || '';
}

export async function saveUserName(name) {
  await SecureStore.setItemAsync(USER_NAME_KEY, name);
}

export async function getParentSecret() {
  return await SecureStore.getItemAsync(PARENT_SECRET_KEY) || '';
}

export async function saveParentSecret(secret) {
  await SecureStore.setItemAsync(PARENT_SECRET_KEY, secret);
}

async function apiFetch(path, options = {}) {
  const baseUrl = await getBaseUrl();
  if (!baseUrl) throw new Error('Server URL not configured. Go to Settings.');

  const response = await fetch(`${baseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  return response.json();
}

export async function fetchStatus() {
  return apiFetch('/api/status');
}

export async function registerToken(name, pushToken) {
  return apiFetch('/api/register-token', {
    method: 'POST',
    body: JSON.stringify({ name, pushToken }),
  });
}

export async function completeChore(name, cycleId) {
  return apiFetch('/api/complete', {
    method: 'POST',
    body: JSON.stringify({ name, cycleId }),
  });
}

export async function fetchHistory() {
  return apiFetch('/api/history');
}

export async function triggerManually(parentSecret) {
  return apiFetch('/api/trigger', {
    method: 'POST',
    headers: { 'X-Parent-Secret': parentSecret },
  });
}

export async function skipKid(parentSecret) {
  return apiFetch('/api/skip', {
    method: 'POST',
    headers: { 'X-Parent-Secret': parentSecret },
  });
}

export async function resetCycle(parentSecret) {
  return apiFetch('/api/reset', {
    method: 'POST',
    headers: { 'X-Parent-Secret': parentSecret },
  });
}
