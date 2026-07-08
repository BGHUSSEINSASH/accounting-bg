import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Image, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import * as Camera from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from '../i18n/context';
import api from '../services/api';

export default function AttendanceScreen() {
  const { t } = useTranslation();
  const [location, setLocation] = useState<any>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [placePhoto, setPlacePhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'in' | 'out'>('in');

  const getLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('common.error'), t('attendance.location_permission'));
      return;
    }
    const loc = await Location.getCurrentPositionAsync({});
    setLocation(loc.coords);
  };

  const takePhoto = async (type: 'selfie' | 'place') => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('common.error'), t('attendance.camera_permission'));
      return;
    }
    Alert.alert(t('common.alert'), type === 'selfie' ? t('attendance.take_photo_employee') : t('attendance.take_photo_place'));
  };

  const handleSubmit = async () => {
    if (!location) {
      Alert.alert(t('common.error'), t('attendance.location_required'));
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('latitude', location.latitude.toString());
      formData.append('longitude', location.longitude.toString());

      const endpoint = mode === 'in' ? '/attendance/check-in' : '/attendance/check-out';
      const res = await api.post(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      Alert.alert(t('common.success'), mode === 'in' ? t('attendance.checked_in') : t('attendance.checked_out'));
    } catch (err: any) {
      Alert.alert(t('common.error'), err.response?.data?.error || t('common.error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, mode === 'in' && styles.toggleActive]}
          onPress={() => setMode('in')}
        >
          <Text style={[styles.toggleText, mode === 'in' && styles.toggleTextActive]}>{t('attendance.check_in')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, mode === 'out' && styles.toggleActive]}
          onPress={() => setMode('out')}
        >
          <Text style={[styles.toggleText, mode === 'out' && styles.toggleTextActive]}>{t('attendance.check_out')}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.locationBtn} onPress={getLocation}>
        <Text style={styles.locationIcon}>📍</Text>
        <Text style={styles.locationText}>
          {location ? `${t('attendance.location_set')}: ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : t('attendance.get_location')}
        </Text>
      </TouchableOpacity>

      <View style={styles.photoRow}>
        <TouchableOpacity style={styles.photoBtn} onPress={() => takePhoto('selfie')}>
          <Text style={styles.photoIcon}>📷</Text>
          <Text style={styles.photoLabel}>{t('attendance.employee_photo')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.photoBtn} onPress={() => takePhoto('place')}>
          <Text style={styles.photoIcon}>🏢</Text>
          <Text style={styles.photoLabel}>{t('attendance.place_photo')}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitText}>
            {mode === 'in' ? t('attendance.check_in') : t('attendance.check_out')}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f8fafc' },
  toggleRow: { flexDirection: 'row', backgroundColor: '#e2e8f0', borderRadius: 12, padding: 4, marginBottom: 24 },
  toggleBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  toggleActive: { backgroundColor: '#3b82f6' },
  toggleText: { fontSize: 16, fontWeight: '600', color: '#64748b' },
  toggleTextActive: { color: '#fff' },
  locationBtn: { backgroundColor: '#fff', borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 20, borderWidth: 2, borderColor: '#e2e8f0', borderStyle: 'dashed' },
  locationIcon: { fontSize: 32, marginBottom: 8 },
  locationText: { fontSize: 14, color: '#64748b', textAlign: 'center' },
  photoRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  photoBtn: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  photoIcon: { fontSize: 32, marginBottom: 8 },
  photoLabel: { fontSize: 12, color: '#64748b' },
  submitBtn: { backgroundColor: '#3b82f6', borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
