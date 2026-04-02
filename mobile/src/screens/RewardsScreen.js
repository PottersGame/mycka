'use strict';

/**
 * RewardsScreen — points leaderboard + personal history.
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  RefreshControl, ActivityIndicator, TouchableOpacity, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchLeaderboard, fetchMemberPoints, getUserName } from '../services/api';

const CHORE_EMOJI = {
  dishwasher: '🍽️',
  cleaning:   '🧹',
  trash:      '🗑️',
  meals:      '🍳',
  laundry:    '👕',
};

const MEDALS = ['🥇', '🥈', '🥉'];

function formatDate(unixTs) {
  return new Date(unixTs * 1000).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

export default function RewardsScreen() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [history, setHistory]         = useState([]);
  const [myName, setMyName]           = useState('');
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [tab, setTab]                 = useState('leaderboard'); // 'leaderboard' | 'mine'
  const [error, setError]             = useState(null);

  async function load() {
    try {
      setError(null);
      const name = await getUserName();
      setMyName(name);

      const [lbData, histData] = await Promise.all([
        fetchLeaderboard(),
        name ? fetchMemberPoints(name) : Promise.resolve({ history: [] }),
      ]);
      setLeaderboard(lbData.leaderboard || []);
      setHistory(histData.history || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#1a73e8" /></View>;
  }

  const myEntry = leaderboard.find(e => e.name === myName);

  return (
    <View style={styles.container}>
      {/* Tab switcher */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'leaderboard' && styles.tabBtnActive]}
          onPress={() => setTab('leaderboard')}
        >
          <Text style={[styles.tabText, tab === 'leaderboard' && styles.tabTextActive]}>🏆 Leaderboard</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'mine' && styles.tabBtnActive]}
          onPress={() => setTab('mine')}
        >
          <Text style={[styles.tabText, tab === 'mine' && styles.tabTextActive]}>⭐ My Points</Text>
        </TouchableOpacity>
      </View>

      {error && <Text style={styles.errorText}>⚠️ {error}</Text>}

      {tab === 'leaderboard' ? (
        <FlatList
          data={leaderboard}
          keyExtractor={item => item.name}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          contentContainerStyle={{ padding: 16 }}
          ListHeaderComponent={
            <Text style={styles.sectionTitle}>This week's chore champions</Text>
          }
          renderItem={({ item, index }) => {
            const isMe = item.name === myName;
            return (
              <View style={[styles.leaderRow, isMe && styles.leaderRowMe]}>
                <Text style={styles.medal}>{MEDALS[index] || `${index + 1}.`}</Text>
                <View style={styles.leaderInfo}>
                  <Text style={[styles.leaderName, isMe && styles.leaderNameMe]}>
                    {item.name}{isMe ? ' (you)' : ''}
                  </Text>
                  <Text style={styles.leaderSub}>{item.chores_done} chore{item.chores_done !== 1 ? 's' : ''} done</Text>
                </View>
                <View style={styles.pointsBubble}>
                  <Text style={styles.pointsNumber}>{item.total_points}</Text>
                  <Text style={styles.pointsLabel}>pts</Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>No points yet — complete a chore to get started!</Text>
            </View>
          }
        />
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          contentContainerStyle={{ padding: 16 }}
        >
          {/* Personal total */}
          {myEntry && (
            <View style={styles.myTotalCard}>
              <Text style={styles.myTotalLabel}>Your total</Text>
              <Text style={styles.myTotalPoints}>{myEntry.total_points} ⭐</Text>
              <Text style={styles.myTotalSub}>{myEntry.chores_done} chores completed</Text>
            </View>
          )}

          <Text style={styles.sectionTitle}>Recent history</Text>

          {history.length === 0 ? (
            <Text style={styles.emptyText}>No points earned yet — do a chore!</Text>
          ) : (
            history.map(item => (
              <View key={item.earned_at + item.reason} style={styles.historyRow}>
                <Text style={styles.historyEmoji}>
                  {CHORE_EMOJI[item.chore_type] || '✅'}
                </Text>
                <View style={styles.historyInfo}>
                  <Text style={styles.historyReason}>{item.reason}</Text>
                  <Text style={styles.historyDate}>{formatDate(item.earned_at)}</Text>
                </View>
                <Text style={styles.historyPts}>+{item.pts}</Text>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#f8f9fa' },
  centered:       { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, marginTop: 40 },
  tabBar:         { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  tabBtn:         { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabBtnActive:   { borderBottomWidth: 3, borderBottomColor: '#1a73e8' },
  tabText:        { fontSize: 14, color: '#888', fontWeight: '600' },
  tabTextActive:  { color: '#1a73e8' },
  sectionTitle:   { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  errorText:      { color: '#f44336', padding: 12, textAlign: 'center' },
  emptyText:      { color: '#888', textAlign: 'center', fontSize: 15, lineHeight: 22 },

  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    elevation: 2,
  },
  leaderRowMe:    { borderWidth: 2, borderColor: '#1a73e8' },
  medal:          { fontSize: 24, width: 36 },
  leaderInfo:     { flex: 1, marginLeft: 8 },
  leaderName:     { fontSize: 16, fontWeight: '700', color: '#333' },
  leaderNameMe:   { color: '#1a73e8' },
  leaderSub:      { fontSize: 12, color: '#888', marginTop: 2 },
  pointsBubble:   { backgroundColor: '#fff9c4', borderRadius: 12, paddingVertical: 6, paddingHorizontal: 12, alignItems: 'center' },
  pointsNumber:   { fontSize: 20, fontWeight: '900', color: '#f57f17' },
  pointsLabel:    { fontSize: 10, color: '#f57f17', fontWeight: '700' },

  myTotalCard:    { backgroundColor: '#1a73e8', borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 20 },
  myTotalLabel:   { color: '#fff', fontSize: 13, opacity: 0.8, textTransform: 'uppercase', letterSpacing: 1 },
  myTotalPoints:  { color: '#fff', fontSize: 52, fontWeight: '900', marginVertical: 4 },
  myTotalSub:     { color: '#fff', opacity: 0.8, fontSize: 13 },

  historyRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8, elevation: 1 },
  historyEmoji:   { fontSize: 24, width: 36, textAlign: 'center' },
  historyInfo:    { flex: 1, marginLeft: 8 },
  historyReason:  { fontSize: 14, fontWeight: '600', color: '#333' },
  historyDate:    { fontSize: 12, color: '#888', marginTop: 2 },
  historyPts:     { fontSize: 18, fontWeight: '800', color: '#f57f17' },
});
