'use strict';

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Vibration, Alert, ActivityIndicator,
} from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';

import { completeChore, getUserName } from '../services/api';
import { cancelAllLocalNotifications } from '../services/notifications';

const VIBRATION_PATTERN = [0, 500, 500, 500, 500, 500];

const CHORE_LOCK_TEXT = {
  dishwasher: {
    subtitle: 'NEVYLOŽIL/A SI UMÝVAČKU RIADU!',
    body:     'Umývačka čaká hodiny.\nVyložiť riad, potom stlač tlačidlo.',
    button:   '✅  UMÝVAČKA VYLOŽENÁ',
  },
  cleaning: {
    subtitle: 'NEUPRATAL/A SI!',
    body:     'Upratovanie čaká hodiny.\nUpratať, potom stlač tlačidlo.',
    button:   '✅  UPRATANÉ',
  },
  trash: {
    subtitle: 'NEVYHADZOVAL/A SI SMETI!',
    body:     'Smeti čakajú hodiny.\nVyhodiť smeti, potom stlač tlačidlo.',
    button:   '✅  SMETI VYHODENÉ',
  },
  meals: {
    subtitle: 'NEPOSTARAL/A SI SA O JEDLO!',
    body:     'Jedlo čaká hodiny.\nPostarať sa o jedlo, potom stlač tlačidlo.',
    button:   '✅  JEDLO HOTOVÉ',
  },
  laundry: {
    subtitle: 'NEDAL/A SI PRANIE!',
    body:     'Pranie čaká hodiny.\nDať pranie, potom stlač tlačidlo.',
    button:   '✅  PRANIE DANÉ',
  },
};

export default function LockScreen({ navigation, route }) {
  useKeepAwake();

  const cycleId   = route?.params?.cycleId;
  const assignee  = route?.params?.assignee || 'TY';
  const choreType = route?.params?.choreType || 'dishwasher';

  const text = CHORE_LOCK_TEXT[choreType] || CHORE_LOCK_TEXT.dishwasher;

  const [completing, setCompleting] = useState(false);
  const [myName, setMyName]         = useState('');

  useEffect(() => {
    getUserName().then(setMyName);
    Vibration.vibrate(VIBRATION_PATTERN, true);
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

      Alert.alert('🎉 Výborne!', 'Povinnosť splnená. Telefón odomknutý!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert('Chyba', `Nepodarilo sa označiť ako hotové: ${err.message}\n\nSkontroluj internetové pripojenie.`);
      setCompleting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🔒</Text>

      <Text style={styles.title}>TELEFÓN ZAMKNUTÝ</Text>

      <Text style={styles.subtitle}>
        {assignee.toUpperCase()} —{'\n'}{text.subtitle}
      </Text>

      <View style={styles.divider} />

      <Text style={styles.body}>{text.body}</Text>

      <TouchableOpacity
        style={[styles.doneButton, completing && styles.doneButtonDisabled]}
        onPress={handleDone}
        disabled={completing}
      >
        {completing
          ? <ActivityIndicator color="#fff" size="large" />
          : <Text style={styles.doneButtonText}>{text.button}</Text>
        }
      </TouchableOpacity>

      <Text style={styles.fine}>
        Toto tlačidlo funguje len keď je povinnosť skutočne splnená.{'\n'}
        Rodičia budú vedieť, ak klamete.
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
    fontSize: 20,
    fontWeight: '700',
    color: '#ffcdd2',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 28,
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
  doneButtonText: { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  fine: {
    fontSize: 12,
    color: '#ef9a9a',
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 18,
  },
});
