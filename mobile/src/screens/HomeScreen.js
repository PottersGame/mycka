'use strict';

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  RefreshControl, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { fetchStatus, completeChore, getUserName } from '../services/api';
import { cancelAllLocalNotifications } from '../services/notifications';

const CHORE_LABELS = {
  dishwasher: { label: 'Dishwasher', emoji: '🍽️' },
  cleaning:   { label: 'Cleaning',   emoji: '🧹' },
  trash:      { label: 'Trash',      emoji: '🗑️' },
  meals:      { label: 'Meals',      emoji: '🍳' },
  laundry:    { label: 'Laundry',    emoji: '👕' },
};

function formatElapsed(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

function getUrgencyColor(seconds) {
  if (seconds < 30 * 60)  return '#4caf50';
  if (seconds < 60 * 60)  return '#ff9800';
  if (seconds < 120 * 60) return '#f44336';
  return '#9c27b0';
}

function getPointsPreview(seconds, choreType) {
  const BASE = { dishwasher: 10, cleaning: 15, trash: 10, meals: 10, laundry: 15 };
  const base = BASE[choreType] || 10;
  if (seconds < 30 * 60)  return base + 5;
  if (seconds < 60 * 60)  return base;
  if (seconds < 120 * 60) return Math.max(1, base - 5);
  return 0;
}

export default function HomeScreen({ navigation }) {
  const [status, setStatus]         = useState(null);
  const [myName, setMyName]         = useState('');
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [elapsed, setElapsed]       = useState(0);
  const [error, setError]           = useState(null);

  async function loadStatus() {
    try {
      setError(null);
      const [data, name] = await Promise.all([fetchStatus(), getUserName()]);
      setStatus(data);
      setMyName(name);

      if (data.activeCycle) {
        const secs = Math.floor(Date.now() / 1000) - data.activeCycle.triggeredAt;
        setElapsed(secs);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { loadStatus(); }, []));

  useEffect(() => {
    if (!status?.activeCycle) return;
    const interval = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(interval);
  }, [status?.activeCycle]);

  async function handleMarkDone() {
    if (!status?.activeCycle) return;

    const cycle = status.activeCycle;
    const isMyTurn = myName && myName.toLowerCase() === cycle.assignee.toLowerCase();

    if (!isMyTurn && myName) {
      Alert.alert(
        'Hold on!',
        `It's ${cycle.assignee}'s turn, not yours.`,
      );
      return;
    }

    const pts = getPointsPreview(elapsed, cycle.choreType);
    const pointsMsg = pts > 0 ? `\n\nYou'll earn ${pts} points! ⭐` : '';

    Alert.alert(
      '✅ All done?',
      `Make sure everything is actually done before confirming!${pointsMsg}`,
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: "Yes, I'm done!",
          onPress: async () => {
            setCompleting(true);
            try {
              const result = await completeChore(myName || cycle.assignee, cycle.id);
              await cancelAllLocalNotifications();
              await loadStatus();
              const earned = result.pointsAwarded || 0;
              Alert.alert(
                '🎉 Awesome!',
                earned > 0
                  ? `Great job! You earned ${earned} points! Check the Rewards tab.`
                  : 'Great job! The next person will be notified next time.',
              );
            } catch (err) {
              Alert.alert('Error', err.message);
            } finally {
              setCompleting(false);
            }
          },
        },
      ],
    );
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#1a73e8" /></View>;
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>⚠️ {error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadStatus}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: '#666', marginTop: 8 }]}
          onPress={() => navigation.navigate('Settings')}
        >
          <Text style={styles.retryText}>Go to Settings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const active        = status?.activeCycle;
  const urgencyColor  = active ? getUrgencyColor(elapsed) : '#4caf50';
  const isMyTurn      = active && myName && myName.toLowerCase() === active.assignee.toLowerCase();
  const choreMeta     = active ? (CHORE_LABELS[active.choreType] || CHORE_LABELS.dishwasher) : null;
  const pointsPreview = active ? getPointsPreview(elapsed, active.choreType) : 0;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadStatus(); }} />}
    >
      {active ? (
        <View style={[styles.card, { borderColor: urgencyColor, borderWidth: 3 }]}>
          {/* Chore type badge */}
          <View style={styles.choreBadge}>
            <Text style={styles.choreEmoji}>{choreMeta.emoji}</Text>
            <Text style={styles.choreLabel}>{choreMeta.label.toUpperCase()}</Text>
          </View>

          <Text style={styles.waitingLabel}>Waiting since…</Text>
          <Text style={[styles.elapsedText, { color: urgencyColor }]}>
            {formatElapsed(elapsed)}
          </Text>

          <View style={[styles.assigneeBadge, { backgroundColor: urgencyColor }]}>
            <Text style={styles.assigneeLabel}>IT'S {active.assignee.toUpperCase()}'S TURN</Text>
          </View>

          {/* Points preview */}
          {pointsPreview > 0 && (
            <Text style={styles.pointsPreview}>
              ⭐ Do it now = {pointsPreview} points
            </Text>
          )}

          {active.shamesSent && <Text style={styles.shameTag}>😤 Family has been notified</Text>}
          {active.lockSent   && <Text style={styles.lockTag}>🔒 Phone lock sent</Text>}

          {isMyTurn ? (
            <TouchableOpacity
              style={[styles.doneButton, completing && styles.doneButtonDisabled]}
              onPress={handleMarkDone}
              disabled={completing}
            >
              {completing
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.doneButtonText}>✅  I'M DONE!</Text>
              }
            </TouchableOpacity>
          ) : (
            <Text style={styles.notYourTurnText}>
              {myName ? `It's not your turn, ${myName}.` : 'Set your name in Settings.'}
            </Text>
          )}
        </View>
      ) : (
        <View style={[styles.card, { borderColor: '#4caf50', borderWidth: 3 }]}>
          <Text style={styles.allClearText}>✅ All clear!</Text>
          <Text style={styles.allClearSub}>No chores waiting right now.</Text>
          <Text style={styles.allClearSub}>You'll be notified when something needs doing.</Text>
        </View>
      )}

      {/* Rotation order */}
      <View style={styles.rotationCard}>
        <Text style={styles.rotationTitle}>📋 Rotation order</Text>
        {status?.kids?.map((kid, i) => (
          <View key={kid.name} style={styles.kidRow}>
            <Text style={styles.kidIndex}>{i + 1}.</Text>
            <Text style={[styles.kidName, kid.name === active?.assignee && styles.activeKid]}>
              {kid.name}
              {kid.name === active?.assignee ? ' 👈' : ''}
              {!kid.hasToken ? ' (no phone)' : ''}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#f8f9fa', padding: 16 },
  centered:    { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    alignItems: 'center',
  },
  choreBadge:      { flexDirection: 'row', alignItems: 'center', marginBottom: 8, backgroundColor: '#f0f4ff', borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14 },
  choreEmoji:      { fontSize: 20, marginRight: 6 },
  choreLabel:      { fontSize: 13, fontWeight: '800', color: '#1a73e8', letterSpacing: 1 },
  waitingLabel:    { fontSize: 14, color: '#666', marginBottom: 4 },
  elapsedText:     { fontSize: 48, fontWeight: '900', letterSpacing: -1 },
  assigneeBadge:   { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 20, marginTop: 16, marginBottom: 8 },
  assigneeLabel:   { color: '#fff', fontWeight: '800', fontSize: 18, textAlign: 'center' },
  pointsPreview:   { color: '#f9a825', fontWeight: '700', fontSize: 15, marginTop: 4 },
  shameTag:        { color: '#9c27b0', fontWeight: '600', marginTop: 4 },
  lockTag:         { color: '#f44336', fontWeight: '600', marginTop: 4 },
  doneButton: {
    backgroundColor: '#4caf50',
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 40,
    marginTop: 20,
    width: '100%',
    alignItems: 'center',
  },
  doneButtonDisabled: { backgroundColor: '#aaa' },
  doneButtonText:     { color: '#fff', fontSize: 20, fontWeight: '800' },
  notYourTurnText:    { color: '#888', marginTop: 16, textAlign: 'center', fontStyle: 'italic' },
  allClearText:       { fontSize: 36, fontWeight: '800', color: '#4caf50' },
  allClearSub:        { fontSize: 14, color: '#666', marginTop: 4, textAlign: 'center' },
  rotationCard:       { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, elevation: 2 },
  rotationTitle:      { fontSize: 16, fontWeight: '700', marginBottom: 12, color: '#333' },
  kidRow:             { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  kidIndex:           { fontSize: 16, color: '#888', width: 24 },
  kidName:            { fontSize: 16, color: '#333' },
  activeKid:          { fontWeight: '700', color: '#f44336' },
  errorText:          { fontSize: 16, color: '#f44336', textAlign: 'center', marginBottom: 16 },
  retryButton:        { backgroundColor: '#1a73e8', padding: 12, borderRadius: 8 },
  retryText:          { color: '#fff', fontWeight: '600' },
});
