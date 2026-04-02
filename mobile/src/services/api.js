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

// ─── Chores ───────────────────────────────────────────────────────────────────

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

// ─── Points ───────────────────────────────────────────────────────────────────

export async function fetchLeaderboard() {
  return apiFetch('/api/points');
}

export async function fetchMemberPoints(name) {
  return apiFetch(`/api/points/${encodeURIComponent(name)}`);
}

// ─── Shopping list ────────────────────────────────────────────────────────────

export async function fetchShopping() {
  return apiFetch('/api/shopping');
}

export async function addShoppingItem(text, addedBy) {
  return apiFetch('/api/shopping', {
    method: 'POST',
    body: JSON.stringify({ text, addedBy }),
  });
}

export async function toggleShoppingItem(id, done) {
  return apiFetch(`/api/shopping/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ done }),
  });
}

export async function deleteShoppingItem(id) {
  return apiFetch(`/api/shopping/${id}`, { method: 'DELETE' });
}

export async function clearDoneShopping() {
  return apiFetch('/api/shopping/done', { method: 'DELETE' });
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

export async function fetchCalendar() {
  return apiFetch('/api/calendar');
}

export async function addCalendarEvent(title, dateStr, timeStr, description, parentSecret) {
  return apiFetch('/api/calendar', {
    method: 'POST',
    headers: { 'X-Parent-Secret': parentSecret },
    body: JSON.stringify({ title, dateStr, timeStr, description }),
  });
}

export async function deleteCalendarEvent(id, parentSecret) {
  return apiFetch(`/api/calendar/${id}`, {
    method: 'DELETE',
    headers: { 'X-Parent-Secret': parentSecret },
  });
}

// ─── Noticeboard ──────────────────────────────────────────────────────────────

export async function fetchNoticeboard() {
  return apiFetch('/api/noticeboard');
}

export async function addNoticeboardPost(title, body, parentSecret) {
  return apiFetch('/api/noticeboard', {
    method: 'POST',
    headers: { 'X-Parent-Secret': parentSecret },
    body: JSON.stringify({ title, body }),
  });
}

export async function deleteNoticeboardPost(id, parentSecret) {
  return apiFetch(`/api/noticeboard/${id}`, {
    method: 'DELETE',
    headers: { 'X-Parent-Secret': parentSecret },
  });
}

// ─── Parent chore controls ────────────────────────────────────────────────────

export async function triggerManually(parentSecret, choreType = 'dishwasher') {
  return apiFetch('/api/trigger', {
    method: 'POST',
    headers: { 'X-Parent-Secret': parentSecret },
    body: JSON.stringify({ choreType }),
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
