import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from '../i18n/context';

export default function ProfileScreen() {
  const { t, lang, setLang } = useTranslation();
  const [user, setUser] = useState<any>(null);

  React.useEffect(() => {
    AsyncStorage.getItem('user').then(data => {
      if (data) setUser(JSON.parse(data));
    });
  }, []);

  const handleLogout = async () => {
    await AsyncStorage.multiRemove(['token', 'user']);
    Alert.alert(t('profile.logged_out'));
  };

  if (!user) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('profile.title')}</Text>
        <Text style={styles.errorText}>{t('profile.login_required')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user.full_name?.charAt(0) || 'U'}</Text>
        </View>
        <Text style={styles.name}>{user.full_name}</Text>
        <Text style={styles.role}>
          {user.role === 'admin' ? t('profile.role_admin') : user.role === 'sales_rep' ? t('profile.role_sales_rep') : t('profile.role_employee')}
        </Text>
      </View>

      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('profile.username')}</Text>
          <Text style={styles.infoValue}>{user.username}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('profile.email')}</Text>
          <Text style={styles.infoValue}>{user.email || '-'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('profile.phone')}</Text>
          <Text style={styles.infoValue}>{user.phone || '-'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('profile.department')}</Text>
          <Text style={styles.infoValue}>{user.department || '-'}</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.langBtn} onPress={() => setLang(lang === 'ar' ? 'en' : 'ar')}>
        <Text style={styles.langText}>{t('profile.switch_language')}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>{t('profile.logout')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f8fafc' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16, textAlign: 'right' },
  errorText: { textAlign: 'center', color: '#94a3b8', marginTop: 40 },
  profileHeader: { alignItems: 'center', paddingVertical: 24 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarText: { fontSize: 32, color: '#fff', fontWeight: 'bold' },
  name: { fontSize: 20, fontWeight: 'bold' },
  role: { fontSize: 14, color: '#64748b', marginTop: 4 },
  infoCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 16 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  infoLabel: { fontSize: 14, color: '#64748b' },
  infoValue: { fontSize: 14, fontWeight: '500' },
  langBtn: { backgroundColor: '#10b981', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24 },
  langText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  logoutBtn: { backgroundColor: '#ef4444', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 12 },
  logoutText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
