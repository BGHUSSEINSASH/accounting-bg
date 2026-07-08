import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, TouchableOpacity, Alert, TextInput, ScrollView } from 'react-native';
import { useTranslation } from '../i18n/context';
import api from '../services/api';

export default function ClientsScreen() {
  const { t } = useTranslation();
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', city: '', address: '' });

  useEffect(() => { fetchClients(); }, []);

  const fetchClients = async () => {
    setLoading(true);
    try {
      const res = await api.get('/clients?limit=100');
      setClients(res.data.clients);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const submitClient = async () => {
    if (!form.name) { Alert.alert(t('common.error'), t('clients.name_required')); return; }
    try {
      await api.post('/clients', form);
      Alert.alert(t('common.success'), t('clients.client_added'));
      setShowForm(false);
      setForm({ name: '', phone: '', city: '', address: '' });
      fetchClients();
    } catch (err: any) {
      Alert.alert(t('common.error'), err.response?.data?.error || t('common.error_occurred'));
    }
  };

  if (showForm) {
    return (
      <ScrollView style={styles.container}>
        <Text style={styles.title}>{t('clients.new_client')}</Text>
        <TextInput style={styles.input} value={form.name} onChangeText={v => setForm({ ...form, name: v })} placeholder={`${t('clients.name')} *`} placeholderTextColor="#94a3b8" />
        <TextInput style={styles.input} value={form.phone} onChangeText={v => setForm({ ...form, phone: v })} placeholder={t('clients.phone')} placeholderTextColor="#94a3b8" keyboardType="phone-pad" />
        <TextInput style={styles.input} value={form.city} onChangeText={v => setForm({ ...form, city: v })} placeholder={t('clients.city')} placeholderTextColor="#94a3b8" />
        <TextInput style={styles.input} value={form.address} onChangeText={v => setForm({ ...form, address: v })} placeholder={t('clients.address')} placeholderTextColor="#94a3b8" />
        <TouchableOpacity style={styles.submitBtn} onPress={submitClient}><Text style={styles.submitText}>{t('clients.add_btn')}</Text></TouchableOpacity>
        <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowForm(false)}><Text style={styles.cancelText}>{t('common.cancel')}</Text></TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(true)}>
        <Text style={styles.addBtnText}>+ {t('clients.add')}</Text>
      </TouchableOpacity>

      <FlatList
        data={clients}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchClients} />}
        renderItem={({ item }) => (
          <View style={styles.clientCard}>
            <View style={styles.clientInfo}>
              <Text style={styles.clientName}>{item.name}</Text>
              <Text style={styles.clientPhone}>{item.phone || '-'}</Text>
              <Text style={styles.clientCity}>{item.city || '-'}</Text>
            </View>
            <Text style={styles.clientBalance}>{item.current_balance?.toFixed(2)} ر.س</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>{t('clients.no_clients')}</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f8fafc' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16, textAlign: 'right' },
  addBtn: { backgroundColor: '#3b82f6', padding: 14, borderRadius: 12, alignItems: 'center', marginBottom: 16 },
  addBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  clientCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  clientInfo: { flex: 1 },
  clientName: { fontSize: 15, fontWeight: '600' },
  clientPhone: { fontSize: 13, color: '#64748b', marginTop: 2 },
  clientCity: { fontSize: 12, color: '#94a3b8' },
  clientBalance: { fontSize: 16, fontWeight: 'bold', color: '#3b82f6' },
  emptyText: { textAlign: 'center', color: '#94a3b8', marginTop: 40 },
  input: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0', fontSize: 15, textAlign: 'right' },
  submitBtn: { backgroundColor: '#3b82f6', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  cancelBtn: { padding: 12, alignItems: 'center', marginTop: 8 },
  cancelText: { color: '#64748b' },
});
