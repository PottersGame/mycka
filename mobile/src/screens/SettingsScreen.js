'use strict';

import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  ScrollView, Alert, Switch, ActivityIndicator,
} from 'react-native';
import {
  getBaseUrl, saveBaseUrl,
  getUserName, saveUserName,
  getParentSecret, saveParentSecret,
} from '../services/api';
import { isDeviceAdminActive, showDeviceAdminSetupGuide } from '../services/deviceAdmin';
import { triggerManually, skipKid, resetCycle } from '../services/api';

const CHORE_TYPES = [
  { key: 'dishwasher', label: 'Dishwasher',       emoji: '🍽️' },
  { key: 'cleaning',   label: 'Cleaning',          emoji: '🧹' },
  { key: 'trash',      label: 'Trash / Recycling', emoji: '🗑️' },
  { key: 'meals',      label: 'Meals & Kitchen',   emoji: '🍳' },
  { key: 'laundry',    label: 'Laundry',           emoji: '👕' },
];

export default function SettingsScreen() {
  const [baseUrl, setBaseUrl]           = useState('');
  const [name, setName]                 = useState('');
  const [parentSecret, setParentSecret] = useState('');
  const [isParent, setIsParent]         = useState(false);
  const [adminActive, setAdminActive]   = useState(false);
  const [saving, setSaving]             = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedChore, setSelectedChore] = useState('dishwasher');

  useEffect(() => {
    (async () => {
      const [url, n, secret] = await Promise.all([
        getBaseUrl(), getUserName(), getParentSecret(),
      ]);
      setBaseUrl(url);
      setName(n);
      setParentSecret(secret);
      setIsParent(!!secret);

      const active = await isDeviceAdminActive();
      setAdminActive(active);
    })();
  }, []);

  async function handleSave() {
    if (!baseUrl.trim()) return Alert.alert('Error', 'Server URL is required');
    if (!name.trim())    return Alert.alert('Error', 'Your name is required');

    setSaving(true);
    try {
      await saveBaseUrl(baseUrl.trim());
      await saveUserName(name.trim());
      if (isParent && parentSecret.trim()) {
        await saveParentSecret(parentSecret.trim());
      } else if (!isParent) {
        await saveParentSecret('');
      }
      Alert.alert('✅ Saved', 'Settings saved successfully!');
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function parentAction(label, fn) {
    if (!parentSecret) return Alert.alert('Error', 'Enter parent secret first');
    setActionLoading(true);
    try {
      const result = await fn(parentSecret);
      Alert.alert('Done', result.message || JSON.stringify(result));
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container}>
      {/* ── Identity ── */}
      <Text style={styles.section}>Your Identity</Text>

      <Text style={styles.label}>Your name (must match the name on the server)</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Emma"
        autoCapitalize="words"
      />

      <Text style={styles.label}>Backend server URL</Text>
      <TextInput
        style={styles.input}
        value={baseUrl}
        onChangeText={setBaseUrl}
        placeholder="https://your-app.railway.app"
        autoCapitalize="none"
        keyboardType="url"
      />

      {/* ── Parent mode ── */}
      <View style={styles.row}>
        <Text style={styles.label}>I'm a parent (admin mode)</Text>
        <Switch value={isParent} onValueChange={setIsParent} />
      </View>

      {isParent && (
        <>
          <Text style={styles.label}>Parent secret (from server .env)</Text>
          <TextInput
            style={styles.input}
            value={parentSecret}
            onChangeText={setParentSecret}
            placeholder="Your PARENT_SECRET value"
            secureTextEntry
          />
        </>
      )}

      <TouchableOpacity style={[styles.saveButton, saving && styles.disabled]} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save Settings</Text>}
      </TouchableOpacity>

      {/* ── Device Admin ── */}
      <Text style={styles.section}>Phone Lock (Device Admin)</Text>
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          Status: {adminActive ? '✅ Active — this phone can be locked remotely' : '⚠️ Not active'}
        </Text>
        {!adminActive && (
          <TouchableOpacity style={styles.adminButton} onPress={showDeviceAdminSetupGuide}>
            <Text style={styles.adminButtonText}>🔒 Activate Phone Lock</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.hint}>
        Each kid needs to activate this once. When they ignore chores for 3 hours,
        the app locks their phone screen until they press "I'm Done."
      </Text>

      {/* ── Parent admin controls ── */}
      {isParent && (
        <>
          <Text style={styles.section}>Parent Controls</Text>
          {actionLoading && <ActivityIndicator color="#1a73e8" style={{ marginBottom: 8 }} />}

          {/* Chore type picker */}
          <Text style={styles.label}>Chore type to trigger</Text>
          <View style={styles.choresGrid}>
            {CHORE_TYPES.map(ct => (
              <TouchableOpacity
                key={ct.key}
                style={[styles.choreChip, selectedChore === ct.key && styles.choreChipActive]}
                onPress={() => setSelectedChore(ct.key)}
              >
                <Text style={styles.choreChipEmoji}>{ct.emoji}</Text>
                <Text style={[styles.choreChipLabel, selectedChore === ct.key && styles.choreChipLabelActive]}>
                  {ct.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => parentAction('Trigger', (secret) => triggerManually(secret, selectedChore))}
            disabled={actionLoading}
          >
            <Text style={styles.actionText}>
              {CHORE_TYPES.find(c => c.key === selectedChore)?.emoji}  Trigger {CHORE_TYPES.find(c => c.key === selectedChore)?.label} chore
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#ff9800' }]}
            onPress={() => parentAction('Skip', skipKid)}
            disabled={actionLoading}
          >
            <Text style={styles.actionText}>⏭️  Skip current kid</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#f44336' }]}
            onPress={() => {
              Alert.alert('Reset cycle?', 'This will clear the active cycle without marking it done.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reset', style: 'destructive', onPress: () => parentAction('Reset', resetCycle) },
              ]);
            }}
            disabled={actionLoading}
          >
            <Text style={styles.actionText}>🗑️  Reset active cycle</Text>
          </TouchableOpacity>
        </>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#f8f9fa', padding: 16 },
  section:    { fontSize: 13, fontWeight: '700', color: '#1a73e8', textTransform: 'uppercase', letterSpacing: 1, marginTop: 24, marginBottom: 8 },
  label:      { fontSize: 14, color: '#444', marginBottom: 4, marginTop: 8 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 4,
  },
  row:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 8 },
  saveButton: { backgroundColor: '#1a73e8', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 16 },
  disabled:   { backgroundColor: '#aaa' },
  saveText:   { color: '#fff', fontSize: 16, fontWeight: '700' },
  infoBox:    { backgroundColor: '#fff', borderRadius: 12, padding: 14, elevation: 1 },
  infoText:   { fontSize: 14, color: '#333', marginBottom: 8 },
  adminButton:     { backgroundColor: '#b71c1c', borderRadius: 10, padding: 12, alignItems: 'center' },
  adminButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  hint:       { fontSize: 12, color: '#888', marginTop: 8, lineHeight: 18 },

  choresGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  choreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  choreChipActive: { borderColor: '#1a73e8', backgroundColor: '#e8f0fe' },
  choreChipEmoji: { fontSize: 16, marginRight: 4 },
  choreChipLabel: { fontSize: 13, color: '#555', fontWeight: '600' },
  choreChipLabelActive: { color: '#1a73e8' },

  actionButton:    { backgroundColor: '#4caf50', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 8 },
  actionText:      { color: '#fff', fontSize: 15, fontWeight: '600' },
});
