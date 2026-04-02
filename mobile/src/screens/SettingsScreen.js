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
  { key: 'dishwasher', label: 'Umývačka',  emoji: '🍽️' },
  { key: 'cleaning',   label: 'Upratovanie', emoji: '🧹' },
  { key: 'trash',      label: 'Smeti',     emoji: '🗑️' },
  { key: 'meals',      label: 'Varenie',   emoji: '🍳' },
  { key: 'laundry',    label: 'Pranie',    emoji: '👕' },
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
    if (!baseUrl.trim()) return Alert.alert('Chyba', 'URL servera je povinné');
    if (!name.trim())    return Alert.alert('Chyba', 'Meno je povinné');

    setSaving(true);
    try {
      await saveBaseUrl(baseUrl.trim());
      await saveUserName(name.trim());
      if (isParent && parentSecret.trim()) {
        await saveParentSecret(parentSecret.trim());
      } else if (!isParent) {
        await saveParentSecret('');
      }
      Alert.alert('✅ Uložené', 'Nastavenia úspešne uložené!');
    } catch (err) {
      Alert.alert('Chyba', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function parentAction(label, fn) {
    if (!parentSecret) return Alert.alert('Chyba', 'Najprv zadaj rodičovské heslo');
    setActionLoading(true);
    try {
      const result = await fn(parentSecret);
      Alert.alert('Done', result.message || JSON.stringify(result));
    } catch (err) {
      Alert.alert('Chyba', err.message);
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container}>
      {/* ── Identity ── */}
      <Text style={styles.section}>Tvoja identita</Text>

      <Text style={styles.label}>Tvoje meno (musí súhlasiť s menom na serveri)</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="napr. Adam"
        autoCapitalize="words"
      />

      <Text style={styles.label}>URL servera</Text>
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
        <Text style={styles.label}>Som rodič (admin)</Text>
        <Switch value={isParent} onValueChange={setIsParent} />
      </View>

      {isParent && (
        <>
          <Text style={styles.label}>Rodičovské heslo (zo servera .env)</Text>
          <TextInput
            style={styles.input}
            value={parentSecret}
            onChangeText={setParentSecret}
            placeholder="Hodnota PARENT_SECRET"
            secureTextEntry
          />
        </>
      )}

      <TouchableOpacity style={[styles.saveButton, saving && styles.disabled]} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Uložiť nastavenia</Text>}
      </TouchableOpacity>

      {/* ── Device Admin ── */}
      <Text style={styles.section}>Zamknutie telefóna</Text>
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          Stav: {adminActive ? '✅ Aktívne — telefón môže byť zamknutý na diaľku' : '⚠️ Neaktívne'}
        </Text>
        {!adminActive && (
          <TouchableOpacity style={styles.adminButton} onPress={showDeviceAdminSetupGuide}>
            <Text style={styles.adminButtonText}>🔒 Aktivovať zamknutie</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.hint}>
        Každé dieťa musí aktivovať raz. Keď ignoruje povinnosti 3 hodiny,
        aplikácia zamkne obrazovku telefónu, kým nestlačí „Hotovo".
      </Text>

      {/* ── Parent admin controls ── */}
      {isParent && (
        <>
          <Text style={styles.section}>Rodičovské ovládanie</Text>
          {actionLoading && <ActivityIndicator color="#1a73e8" style={{ marginBottom: 8 }} />}

          {/* Chore type picker */}
          <Text style={styles.label}>Typ povinnosti</Text>
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
              {CHORE_TYPES.find(c => c.key === selectedChore)?.emoji}  Spustiť: {CHORE_TYPES.find(c => c.key === selectedChore)?.label}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#ff9800' }]}
            onPress={() => parentAction('Skip', skipKid)}
            disabled={actionLoading}
          >
            <Text style={styles.actionText}>⏭️  Preskočiť dieťa</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#f44336' }]}
            onPress={() => {
              Alert.alert('Resetovať cyklus?', 'Tým sa vymaže aktívny cyklus bez označenia ako hotový.', [
                { text: 'Zrušiť', style: 'cancel' },
                { text: 'Resetovať', style: 'destructive', onPress: () => parentAction('Reset', resetCycle) },
              ]);
            }}
            disabled={actionLoading}
          >
            <Text style={styles.actionText}>🗑️  Resetovať cyklus</Text>
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
