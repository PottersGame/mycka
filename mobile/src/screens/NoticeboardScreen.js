'use strict';

/**
 * NoticeboardScreen — family announcements and pinned notes.
 * Everyone can view. Parents can post and delete.
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, Alert, ActivityIndicator, RefreshControl,
  Modal, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchNoticeboard, addNoticeboardPost, deleteNoticeboardPost, getParentSecret } from '../services/api';

function formatDate(unixTs) {
  const d = new Date(unixTs * 1000);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    + ' at ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

const POST_COLORS = ['#e3f2fd', '#f3e5f5', '#e8f5e9', '#fff8e1', '#fce4ec'];

export default function NoticeboardScreen() {
  const [posts, setPosts]           = useState([]);
  const [parentSecret, setPs]       = useState('');
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal]   = useState(false);
  const [error, setError]           = useState(null);

  // Form state
  const [title, setTitle] = useState('');
  const [body, setBody]   = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      setError(null);
      const [data, secret] = await Promise.all([fetchNoticeboard(), getParentSecret()]);
      setPosts(data.posts || []);
      setPs(secret || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  async function handlePost() {
    if (!title.trim()) return Alert.alert('Error', 'Title is required');
    if (!parentSecret) return Alert.alert('Parents only', 'Only parents can post notices. Set your parent secret in Settings.');
    setSaving(true);
    try {
      await addNoticeboardPost(title.trim(), body.trim(), parentSecret);
      setTitle('');
      setBody('');
      setShowModal(false);
      await load();
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(post) {
    if (!parentSecret) return Alert.alert('Parents only', 'Only parents can delete notices.');
    Alert.alert(
      'Remove notice?',
      `Remove "${post.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteNoticeboardPost(post.id, parentSecret);
              setPosts(prev => prev.filter(p => p.id !== post.id));
            } catch (err) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ],
    );
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#1a73e8" /></View>;
  }

  return (
    <View style={styles.container}>
      {error && <Text style={styles.errorText}>⚠️ {error}</Text>}

      <FlatList
        data={posts}
        keyExtractor={item => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>📌 No notices yet</Text>
            {!!parentSecret && <Text style={styles.emptySubText}>Tap + to post an announcement</Text>}
          </View>
        }
        renderItem={({ item, index }) => {
          const bgColor = POST_COLORS[index % POST_COLORS.length];
          return (
            <View style={[styles.postCard, { backgroundColor: bgColor }]}>
              <View style={styles.postHeader}>
                <Text style={styles.postTitle}>{item.title}</Text>
                {!!parentSecret && (
                  <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.deleteBtn}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
              {item.body ? <Text style={styles.postBody}>{item.body}</Text> : null}
              <Text style={styles.postMeta}>
                {item.created_by ? `Posted by ${item.created_by} · ` : ''}{formatDate(item.created_at)}
              </Text>
            </View>
          );
        }}
      />

      {/* FAB — parents only */}
      {!!parentSecret && (
        <TouchableOpacity style={styles.fab} onPress={() => setShowModal(true)}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}

      {/* Post modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Notice</Text>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <Text style={styles.fieldLabel}>Title *</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. No screens until chores done!"
            />

            <Text style={styles.fieldLabel}>Message (optional)</Text>
            <TextInput
              style={[styles.input, { height: 120, textAlignVertical: 'top' }]}
              value={body}
              onChangeText={setBody}
              placeholder="Extra details…"
              multiline
            />

            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handlePost}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Post Notice</Text>}
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

  emptyBox:        { alignItems: 'center', marginTop: 40 },
  emptyText:       { fontSize: 18, color: '#888' },
  emptySubText:    { fontSize: 13, color: '#aaa', marginTop: 6 },

  postCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    elevation: 1,
  },
  postHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  postTitle:       { flex: 1, fontSize: 17, fontWeight: '800', color: '#333', marginBottom: 6 },
  deleteBtn:       { fontSize: 16, color: '#bbb', paddingLeft: 8, paddingTop: 2 },
  postBody:        { fontSize: 14, color: '#555', lineHeight: 20, marginBottom: 8 },
  postMeta:        { fontSize: 11, color: '#888' },

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
