'use strict';

/**
 * ShoppingScreen — shared family shopping list.
 * Anyone can add items; parents and kids can tick items off.
 * Parents can delete items.
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, Alert, ActivityIndicator, RefreshControl,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  fetchShopping, addShoppingItem, toggleShoppingItem,
  deleteShoppingItem, clearDoneShopping, getUserName,
} from '../services/api';

export default function ShoppingScreen() {
  const [items, setItems]           = useState([]);
  const [myName, setMyName]         = useState('');
  const [newText, setNewText]       = useState('');
  const [adding, setAdding]         = useState(false);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState(null);

  async function load() {
    try {
      setError(null);
      const [data, name] = await Promise.all([fetchShopping(), getUserName()]);
      setItems(data.items || []);
      setMyName(name);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  async function handleAdd() {
    const text = newText.trim();
    if (!text) return;
    setAdding(true);
    try {
      await addShoppingItem(text, myName);
      setNewText('');
      await load();
    } catch (err) {
      Alert.alert('Chyba', err.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleToggle(item) {
    try {
      await toggleShoppingItem(item.id, !item.done);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, done: item.done ? 0 : 1 } : i));
    } catch (err) {
      Alert.alert('Chyba', err.message);
    }
  }

  async function handleDelete(item) {
    try {
      await deleteShoppingItem(item.id);
      setItems(prev => prev.filter(i => i.id !== item.id));
    } catch (err) {
      Alert.alert('Chyba', err.message);
    }
  }

  async function handleClearDone() {
    Alert.alert(
      'Vymazať hotové položky?',
      'Odstránia sa všetky zaškrtnuté položky zo zoznamu.',
      [
        { text: 'Zrušiť', style: 'cancel' },
        {
          text: 'Vymazať',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearDoneShopping();
              await load();
            } catch (err) {
              Alert.alert('Chyba', err.message);
            }
          },
        },
      ],
    );
  }

  const doneCount = items.filter(i => i.done).length;

  function renderItem({ item }) {
    return (
      <View style={[styles.row, item.done && styles.rowDone]}>
        <TouchableOpacity style={styles.checkbox} onPress={() => handleToggle(item)}>
          <Text style={styles.checkboxText}>{item.done ? '✅' : '⬜'}</Text>
        </TouchableOpacity>
        <View style={styles.rowContent}>
          <Text style={[styles.itemText, item.done && styles.itemTextDone]}>{item.text}</Text>
          {item.added_by ? <Text style={styles.addedBy}>Pridal(a) {item.added_by}</Text> : null}
        </View>
        <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.deleteBtn}>✕</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#1a73e8" /></View>;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {error && <Text style={styles.errorText}>⚠️ {error}</Text>}

      <FlatList
        data={items}
        keyExtractor={item => String(item.id)}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        ListHeaderComponent={
          doneCount > 0 ? (
            <TouchableOpacity style={styles.clearDoneBtn} onPress={handleClearDone}>
              <Text style={styles.clearDoneText}>Vymazať {doneCount} hotové položky</Text>
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyText}>🛒 Nákupný zoznam je prázdny!</Text>
            <Text style={styles.emptySubText}>Pridaj položky pomocou poľa nižšie.</Text>
          </View>
        }
      />

      {/* Add item bar */}
      <View style={styles.addBar}>
        <TextInput
          style={styles.addInput}
          value={newText}
          onChangeText={setNewText}
          placeholder="Pridaj položku…"
          returnKeyType="done"
          onSubmitEditing={handleAdd}
        />
        <TouchableOpacity
          style={[styles.addButton, (!newText.trim() || adding) && styles.addButtonDisabled]}
          onPress={handleAdd}
          disabled={!newText.trim() || adding}
        >
          {adding ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.addButtonText}>Pridať</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#f8f9fa' },
  centered:        { justifyContent: 'center', alignItems: 'center', padding: 24, marginTop: 20 },
  errorText:       { color: '#f44336', padding: 12, textAlign: 'center' },
  emptyText:       { fontSize: 18, color: '#888', textAlign: 'center' },
  emptySubText:    { fontSize: 13, color: '#aaa', marginTop: 6 },

  clearDoneBtn:    { backgroundColor: '#ffebee', borderRadius: 8, padding: 10, marginBottom: 12, alignItems: 'center' },
  clearDoneText:   { color: '#f44336', fontWeight: '600', fontSize: 14 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    elevation: 1,
  },
  rowDone:         { opacity: 0.6 },
  checkbox:        { marginRight: 12 },
  checkboxText:    { fontSize: 22 },
  rowContent:      { flex: 1 },
  itemText:        { fontSize: 16, color: '#333' },
  itemTextDone:    { textDecorationLine: 'line-through', color: '#888' },
  addedBy:         { fontSize: 11, color: '#aaa', marginTop: 2 },
  deleteBtn:       { fontSize: 16, color: '#ccc', paddingLeft: 8 },

  addBar: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    elevation: 8,
  },
  addInput: {
    flex: 1,
    backgroundColor: '#f0f4ff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    marginRight: 8,
  },
  addButton:         { backgroundColor: '#1a73e8', borderRadius: 10, paddingHorizontal: 18, justifyContent: 'center' },
  addButtonDisabled: { backgroundColor: '#aaa' },
  addButtonText:     { color: '#fff', fontWeight: '700', fontSize: 15 },
});
