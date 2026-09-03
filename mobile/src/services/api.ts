import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_KEY = 'api_base_url';
const DEFAULT_API_BASE = 'http://192.168.1.100:3000/api';

function normalizeApiBase(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) return DEFAULT_API_BASE;
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

const api = axios.create({
  baseURL: DEFAULT_API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

export async function loadApiBase(): Promise<string> {
  const stored = await AsyncStorage.getItem(API_BASE_KEY);
  const base = normalizeApiBase(stored || DEFAULT_API_BASE);
  api.defaults.baseURL = base;
  return base;
}

export async function setApiBase(url: string): Promise<string> {
  const base = normalizeApiBase(url);
  await AsyncStorage.setItem(API_BASE_KEY, base);
  api.defaults.baseURL = base;
  return base;
}

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      AsyncStorage.removeItem('token');
      AsyncStorage.removeItem('user');
    }
    return Promise.reject(error);
  }
);

export default api;
