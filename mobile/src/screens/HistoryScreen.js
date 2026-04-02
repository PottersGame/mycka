'use strict';

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchHistory } from '../services/api';

function formatDate(unixTs) {
  const d = new Date(unixTs * 1000);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(startTs, endTs) {
  if (!endTs) return 'Still pending…';
  const secs = endTs - startTs;
  const m = Math.floor(secs / 60);
  if (m < 60) return `Done in ${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `Done in ${h}h ${rm}m`;
}

export default function HistoryScreen() {
  const [cycles, setCycles]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]       = useState(null);

  async function load() {
    try {
      setError(null);
      const data = await fetchHistory();
      setCycles(data.cycles || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  function renderItem({ item }) {
    const done     = !!item.completed_at;
    const duration = formatDuration(item.triggered_at, item.completed_at);
    const slow     = !done || (item.completed_at - item.triggered_at) > 120 * 60;

    return (
      <View style={[styles.row, !done && styles.rowPending]}>
        <View style={styles.rowLeft}>
          <Text style={styles.rowName}>{item.assignee_name}</Text>
          <Text style={styles.rowDate}>{formatDate(item.triggered_at)}</Text>
        </View>
        <View style={styles.rowRight}>
          <Text style={[styles.rowStatus, done ? (slow ? styles.statusSlow : styles.statusOk) : styles.statusPending]}>
            {done ? (slow ? '🐌 Slow' : '✅ Done') : '⏳ Pending'}
          </Text>
          <Text style={styles.rowDuration}>{duration}</Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#1a73e8" /></View>;
  }

  return (
    <FlatList
      style={styles.container}
      data={cycles}
      keyExtractor={item => String(item.id)}
      renderItem={renderItem}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      ListEmptyComponent={
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No history yet. Waiting for the dishwasher to finish! 🍽️</Text>
        </View>
      }
      ListHeaderComponent={
        error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null
      }
    />
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#f8f9fa' },
  centered:     { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, marginTop: 40 },
  emptyText:    { fontSize: 16, color: '#888', textAlign: 'center', lineHeight: 24 },
  errorText:    { fontSize: 14, color: '#f44336', padding: 16, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 12,
    elevation: 2,
  },
  rowPending:   { borderLeftWidth: 4, borderLeftColor: '#ff9800' },
  rowLeft:      { flex: 1 },
  rowRight:     { alignItems: 'flex-end' },
  rowName:      { fontSize: 16, fontWeight: '700', color: '#333' },
  rowDate:      { fontSize: 12, color: '#888', marginTop: 2 },
  rowStatus:    { fontSize: 14, fontWeight: '700' },
  rowDuration:  { fontSize: 12, color: '#666', marginTop: 2 },
  statusOk:     { color: '#4caf50' },
  statusSlow:   { color: '#ff9800' },
  statusPending: { color: '#ff9800' },
});
