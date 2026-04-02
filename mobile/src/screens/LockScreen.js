'use strict';

/**
 * LockScreen — full-screen blocking overlay shown when the lock command is received.
 *
 * This screen appears over everything (via React Navigation's modal presentation)
 * and cannot be easily dismissed. The kid must press "I'm Done" which calls the
 * backend to complete the cycle, then this screen dismisses.
 *
 * On Android, the native DeviceAdminModule.lockNow() is called first to black
 * out the screen. When the kid unlocks with their PIN, the app comes back to
 * foreground and shows this screen.
 */

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Vibration, Alert, ActivityIndicator,
} from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';

import { completeChore, getUserName } from '../services/api';
import { cancelAllLocalNotifications } from '../services/notifications';

const VIBRATION_PATTERN = [0, 500, 500, 500, 500, 500];

export default function LockScreen({ navigation, route }) {
  useKeepAwake(); // Keep the screen on

  const cycleId  = route?.params?.cycleId;
  const assignee = route?.params?.assignee || 'YOU';

  const [completing, setCompleting]   = useState(false);
  const [myName, setMyName]           = useState('');
  const [countdown, setCountdown]     = useState(null);

  useEffect(() => {
    getUserName().then(setMyName);

    // Vibrate aggressively when the lock screen appears
    Vibration.vibrate(VIBRATION_PATTERN, true);

    // Stop vibration after 10 seconds to avoid battery drain
    const stopVib = setTimeout(() => Vibration.cancel(), 10_000);
    return () => {
      clearTimeout(stopVib);
      Vibration.cancel();
    };
  }, []);

  async function handleDone() {
    setCompleting(true);
    try {
      const name = myName || assignee;
      await completeChore(name, cycleId);
      await cancelAllLocalNotifications();
      Vibration.cancel();

      Alert.alert('🎉 Great!', 'Chore marked as done. Phone unlocked!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert('Error', `Could not mark as done: ${err.message}\n\nMake sure you have internet connection.`);
      setCompleting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🔒</Text>

      <Text style={styles.title}>PHONE LOCKED</Text>

      <Text style={styles.subtitle}>
        {assignee.toUpperCase()} — YOU HAVEN'T{'\n'}DONE THE DISHES YET!
      </Text>

      <View style={styles.divider} />

      <Text style={styles.body}>
        The dishwasher has been sitting there for hours.{'\n'}
        Unload it, then tap the button below.
      </Text>

      <TouchableOpacity
        style={[styles.doneButton, completing && styles.doneButtonDisabled]}
        onPress={handleDone}
        disabled={completing}
      >
        {completing
          ? <ActivityIndicator color="#fff" size="large" />
          : <Text style={styles.doneButtonText}>✅  I DID THE DISHES</Text>
        }
      </TouchableOpacity>

      <Text style={styles.fine}>
        This button only works after the dishes are actually done.{'\n'}
        Your parents will know if you're lying.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#b71c1c',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  icon:     { fontSize: 72, marginBottom: 16 },
  title: {
    fontSize: 40,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffcdd2',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 30,
  },
  divider: {
    width: '80%',
    height: 2,
    backgroundColor: '#ef9a9a',
    marginVertical: 24,
  },
  body: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  doneButton: {
    backgroundColor: '#4caf50',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  doneButtonDisabled: { backgroundColor: '#388e3c' },
  doneButtonText: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  fine: {
    fontSize: 12,
    color: '#ef9a9a',
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 18,
  },
});
