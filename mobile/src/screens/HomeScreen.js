'use strict';

/**
 * HomeScreen — shown to all family members.
 * Displays whose turn it is, a countdown since the cycle started, and a
 * big "MARK AS DONE" button (only usable by the assigned kid or a parent).
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  RefreshControl, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { fetchStatus, completeChore, getUserName } from '../services/api';
import { cancelAllLocalNotifications } from '../services/notifications';

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
  if (seconds < 30 * 60)   return '#4caf50'; // green  — under 30min
  if (seconds < 60 * 60)   return '#ff9800'; // orange — under 1hr
  if (seconds < 120 * 60)  return '#f44336'; // red    — under 2hr
  return '#9c27b0';                            // purple — nuclear zone
}

export default function HomeScreen({ navigation }) {
  const [status, setStatus]       = useState(null);
  const [myName, setMyName]       = useState('');
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [elapsed, setElapsed]     = useState(0);
  const [error, setError]         = useState(null);

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

  useFocusEffect(useCallback(() => {
    loadStatus();
  }, []));

  // Tick the elapsed counter every second while cycle is active
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
        'Hold on! 🤔',
        `It's ${cycle.assignee}'s turn, not yours. Only ${cycle.assignee} can mark this as done.`,
      );
      return;
    }

    Alert.alert(
      '✅ Done with dishes?',
      'Make sure everything is actually put away before confirming!',
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: "Yes, I'm done!",
          onPress: async () => {
            setCompleting(true);
            try {
              await completeChore(myName || cycle.assignee, cycle.id);
              await cancelAllLocalNotifications();
              await loadStatus();
              Alert.alert('🎉 Awesome!', 'Great job! The next person in rotation will be notified next time.');
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
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a73e8" />
      </View>
    );
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

  const active = status?.activeCycle;
  const urgencyColor = active ? getUrgencyColor(elapsed) : '#4caf50';
  const isMyTurn = active && myName && myName.toLowerCase() === active.assignee.toLowerCase();

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadStatus(); }} />}
    >
      {/* ── Current status card ── */}
      {active ? (
        <View style={[styles.card, { borderColor: urgencyColor, borderWidth: 3 }]}>
          <Text style={styles.waitingLabel}>🍽️ Dishes waiting since…</Text>
          <Text style={[styles.elapsedText, { color: urgencyColor }]}>
            {formatElapsed(elapsed)}
          </Text>

          <View style={[styles.assigneeBadge, { backgroundColor: urgencyColor }]}>
            <Text style={styles.assigneeLabel}>IT'S {active.assignee.toUpperCase()}'S TURN</Text>
          </View>

          {active.shamesSent && (
            <Text style={styles.shameTag}>😤 Family has been notified</Text>
          )}
          {active.lockSent && (
            <Text style={styles.lockTag}>🔒 Phone lock sent</Text>
          )}

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
          <Text style={styles.allClearSub}>No dishes waiting right now.</Text>
          <Text style={styles.allClearSub}>You'll be notified when the dishwasher finishes.</Text>
        </View>
      )}

      {/* ── Rotation order ── */}
      <View style={styles.rotationCard}>
        <Text style={styles.rotationTitle}>📋 Rotation order</Text>
        {status?.kids?.map((kid, i) => (
          <View key={kid.name} style={styles.kidRow}>
            <Text style={styles.kidIndex}>{i + 1}.</Text>
            <Text style={[styles.kidName, kid.name === active?.assignee && styles.activeKid]}>
              {kid.name}
              {kid.name === active?.assignee ? ' 👈' : ''}
              {!kid.hasToken ? ' (no phone registered)' : ''}
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
  waitingLabel:   { fontSize: 14, color: '#666', marginBottom: 4 },
  elapsedText:    { fontSize: 48, fontWeight: '900', letterSpacing: -1 },
  assigneeBadge:  { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 20, marginTop: 16, marginBottom: 8 },
  assigneeLabel:  { color: '#fff', fontWeight: '800', fontSize: 18, textAlign: 'center' },
  shameTag:       { color: '#9c27b0', fontWeight: '600', marginTop: 4 },
  lockTag:        { color: '#f44336', fontWeight: '600', marginTop: 4 },
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
  doneButtonText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  notYourTurnText: { color: '#888', marginTop: 16, textAlign: 'center', fontStyle: 'italic' },
  allClearText:  { fontSize: 36, fontWeight: '800', color: '#4caf50' },
  allClearSub:   { fontSize: 14, color: '#666', marginTop: 4, textAlign: 'center' },
  rotationCard:  { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, elevation: 2 },
  rotationTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12, color: '#333' },
  kidRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  kidIndex:      { fontSize: 16, color: '#888', width: 24 },
  kidName:       { fontSize: 16, color: '#333' },
  activeKid:     { fontWeight: '700', color: '#f44336' },
  errorText:     { fontSize: 16, color: '#f44336', textAlign: 'center', marginBottom: 16 },
  retryButton:   { backgroundColor: '#1a73e8', padding: 12, borderRadius: 8 },
  retryText:     { color: '#fff', fontWeight: '600' },
});
