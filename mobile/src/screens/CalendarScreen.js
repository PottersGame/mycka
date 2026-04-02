'use strict';

/**
 * CalendarScreen — family events calendar.
 * Everyone can view. Parents can add and delete events.
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, Alert, ActivityIndicator, RefreshControl,
  Modal, ScrollView, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchCalendar, addCalendarEvent, deleteCalendarEvent, getParentSecret } from '../services/api';

function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function getTodayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isUpcoming(dateStr) {
  return dateStr >= getTodayStr();
}

export default function CalendarScreen() {
  const [events, setEvents]         = useState([]);
  const [parentSecret, setPs]       = useState('');
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal]   = useState(false);
  const [error, setError]           = useState(null);

  // Form state
  const [title, setTitle]       = useState('');
  const [dateStr, setDateStr]   = useState(getTodayStr());
  const [timeStr, setTimeStr]   = useState('');
  const [description, setDesc]  = useState('');
  const [saving, setSaving]     = useState(false);

  async function load() {
    try {
      setError(null);
      const [data, secret] = await Promise.all([fetchCalendar(), getParentSecret()]);
      setEvents(data.events || []);
      setPs(secret || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  async function handleAdd() {
    if (!title.trim()) return Alert.alert('Chyba', 'Názov je povinný');
    if (!dateStr.trim()) return Alert.alert('Chyba', 'Dátum je povinný');
    if (!parentSecret) return Alert.alert('Len pre rodičov', 'Len rodičia môžu pridávať udalosti.');

    setSaving(true);
    try {
      await addCalendarEvent(title.trim(), dateStr.trim(), timeStr.trim(), description.trim(), parentSecret);
      setTitle('');
      setTimeStr('');
      setDesc('');
      setDateStr(getTodayStr());
      setShowModal(false);
      await load();
    } catch (err) {
      Alert.alert('Chyba', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(event) {
    if (!parentSecret) return Alert.alert('Len pre rodičov', 'Len rodičia môžu vymazávať udalosti.');
    Alert.alert(
      'Vymazať udalosť?',
      `Odstrániť "${event.title}"?`,
      [
        { text: 'Zrušiť', style: 'cancel' },
        {
          text: 'Vymazať',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCalendarEvent(event.id, parentSecret);
              setEvents(prev => prev.filter(e => e.id !== event.id));
            } catch (err) {
              Alert.alert('Chyba', err.message);
            }
          },
        },
      ],
    );
  }

  const upcoming = events.filter(e => isUpcoming(e.date_str));
  const past     = events.filter(e => !isUpcoming(e.date_str));

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#1a73e8" /></View>;
  }

  return (
    <View style={styles.container}>
      {error && <Text style={styles.errorText}>⚠️ {error}</Text>}

      <FlatList
        data={upcoming}
        keyExtractor={item => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        ListHeaderComponent={
          <Text style={styles.sectionTitle}>Nadchádzajúce udalosti</Text>
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>📅 Žiadne nadchádzajúce udalosti</Text>
            {!!parentSecret && (
              <Text style={styles.emptySubText}>Stlač + pre pridanie</Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.eventCard}>
            <View style={styles.dateBadge}>
              <Text style={styles.dateMonth}>
                {new Date(item.date_str + 'T00:00:00').toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}
              </Text>
              <Text style={styles.dateDay}>
                {new Date(item.date_str + 'T00:00:00').getDate()}
              </Text>
            </View>
            <View style={styles.eventInfo}>
              <Text style={styles.eventTitle}>{item.title}</Text>
              {item.time_str ? <Text style={styles.eventTime}>🕐 {item.time_str}</Text> : null}
              {item.description ? <Text style={styles.eventDesc}>{item.description}</Text> : null}
              {item.created_by ? <Text style={styles.eventBy}>Pridal(a) {item.created_by}</Text> : null}
            </View>
            {!!parentSecret && (
              <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.deleteBtn}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        ListFooterComponent={
          past.length > 0 ? (
            <View style={{ marginTop: 24 }}>
              <Text style={[styles.sectionTitle, { color: '#aaa' }]}>Minulé udalosti</Text>
              {past.map(item => (
                <View key={item.id} style={[styles.eventCard, styles.eventCardPast]}>
                  <Text style={styles.pastDate}>{formatDisplayDate(item.date_str)}</Text>
                  <Text style={styles.pastTitle}>{item.title}</Text>
                </View>
              ))}
            </View>
          ) : null
        }
      />

      {/* Add button — only shown to parents */}
      {!!parentSecret && (
        <TouchableOpacity style={styles.fab} onPress={() => setShowModal(true)}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}

      {/* Add event modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Nová udalosť</Text>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <Text style={styles.fieldLabel}>Názov *</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="napr. Lekár" />

            <Text style={styles.fieldLabel}>Dátum (RRRR-MM-DD) *</Text>
            <TextInput
              style={styles.input}
              value={dateStr}
              onChangeText={setDateStr}
              placeholder="2026-04-15"
              keyboardType="numbers-and-punctuation"
            />

            <Text style={styles.fieldLabel}>Čas (nepovinné)</Text>
            <TextInput style={styles.input} value={timeStr} onChangeText={setTimeStr} placeholder="14:30" keyboardType="numbers-and-punctuation" />

            <Text style={styles.fieldLabel}>Poznámka (nepovinné)</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              value={description}
              onChangeText={setDesc}
              placeholder="Ďalšie detaily…"
              multiline
            />

            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleAdd}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Pridať udalosť</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#f8f9fa' },
  centered:        { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText:       { color: '#f44336', padding: 12, textAlign: 'center' },
  sectionTitle:    { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },

  emptyBox:        { alignItems: 'center', marginTop: 20 },
  emptyText:       { fontSize: 18, color: '#888' },
  emptySubText:    { fontSize: 13, color: '#aaa', marginTop: 6 },

  eventCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    elevation: 2,
  },
  eventCardPast:   { opacity: 0.6 },
  dateBadge:       { backgroundColor: '#1a73e8', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, alignItems: 'center', marginRight: 14 },
  dateMonth:       { color: '#fff', fontSize: 10, fontWeight: '700' },
  dateDay:         { color: '#fff', fontSize: 22, fontWeight: '900' },
  eventInfo:       { flex: 1 },
  eventTitle:      { fontSize: 16, fontWeight: '700', color: '#333' },
  eventTime:       { fontSize: 13, color: '#666', marginTop: 3 },
  eventDesc:       { fontSize: 13, color: '#777', marginTop: 3 },
  eventBy:         { fontSize: 11, color: '#aaa', marginTop: 4 },
  deleteBtn:       { fontSize: 16, color: '#ccc', padding: 4 },

  pastDate:        { fontSize: 12, color: '#aaa' },
  pastTitle:       { fontSize: 14, color: '#888', fontWeight: '600' },

  fab:             { position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#1a73e8', alignItems: 'center', justifyContent: 'center', elevation: 6 },
  fabText:         { color: '#fff', fontSize: 30, lineHeight: 34 },

  modal:           { flex: 1, backgroundColor: '#f8f9fa' },
  modalHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#eee', backgroundColor: '#fff' },
  modalTitle:      { fontSize: 18, fontWeight: '800', color: '#333' },
  modalClose:      { fontSize: 20, color: '#888', padding: 4 },
  modalBody:       { padding: 20 },
  fieldLabel:      { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 4, marginTop: 14 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  saveBtn:          { backgroundColor: '#1a73e8', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24, marginBottom: 40 },
  saveBtnDisabled:  { backgroundColor: '#aaa' },
  saveBtnText:      { color: '#fff', fontWeight: '700', fontSize: 16 },
});
