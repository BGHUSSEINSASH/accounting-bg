import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { setApiBase, loadApiBase } from '../services/api';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [showServer, setShowServer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    loadApiBase().then(u => setServerUrl(u));
  }, []);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) { setError('أدخل اسم المستخدم وكلمة المرور'); return; }
    setLoading(true); setError('');
    try {
      if (serverUrl.trim()) await setApiBase(serverUrl.trim());
      const res = await api.post('/auth/login', { username: username.trim(), password });
      const { login } = useAuth();
      await login(res.data.user, res.data.token);
      onLogin?.(res.data.user);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'فشل تسجيل الدخول';
      setError(msg.includes('Network') ? 'تعذر الاتصال بالخادم — تحقق من العنوان' : msg);
    } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.container}>
      <View style={s.logoBox}><Text style={s.logoText}>ح</Text></View>
      <Text style={s.title}>النظام المحاسبي</Text>
      <Text style={s.subtitle}>سجّل الدخول للمتابعة</Text>

      {error ? <Text style={s.error}>{error}</Text> : null}

      <TextInput style={s.input} placeholder="اسم المستخدم" placeholderTextColor="#9ca3af"
        value={username} onChangeText={setUsername} autoCapitalize="none" />
      <TextInput style={s.input} placeholder="كلمة المرور" placeholderTextColor="#9ca3af"
        value={password} onChangeText={setPassword} secureTextEntry />

      <TouchableOpacity onPress={() => setShowServer(!showServer)}>
        <Text style={s.serverToggle}>إعدادات الخادم {showServer ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {showServer && (
        <TextInput style={[s.input, { fontSize: 12 }]} placeholder="http://192.168.1.x:3000/api"
          placeholderTextColor="#9ca3af" value={serverUrl} onChangeText={setServerUrl}
          autoCapitalize="none" keyboardType="url" />
      )}

      <TouchableOpacity style={[s.btn, loading && { opacity: 0.6 }]} onPress={handleLogin} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>تسجيل الدخول</Text>}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', justifyContent: 'center', padding: 24 },
  logoBox: { width: 72, height: 72, borderRadius: 18, backgroundColor: '#4f46e5', alignSelf: 'center', justifyContent: 'center', marginBottom: 16 },
  logoText: { color: '#fff', fontSize: 32, fontWeight: 'bold', textAlign: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 24 },
  error: { backgroundColor: '#fee2e2', color: '#dc2626', padding: 10, borderRadius: 10, fontSize: 13, marginBottom: 12, textAlign: 'center' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, marginBottom: 12, textAlign: 'right' },
  serverToggle: { fontSize: 12, color: '#6b7280', textAlign: 'center', marginBottom: 10 },
  btn: { backgroundColor: '#4f46e5', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
