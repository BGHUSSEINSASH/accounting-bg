import axios, { AxiosResponse } from 'axios';
import { enqueueRequest, isOfflineMutationError } from './syncQueue';
import { getApiBaseUrl } from '../utils/apiUrl';

const API_BASE = getApiBaseUrl();

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const method = error?.config?.method;
    if (isOfflineMutationError(error) && method && ['post', 'put', 'patch', 'delete'].includes(method)) {
      enqueueRequest(error.config);
      return Promise.resolve({
        data: { queued: true },
        status: 202,
        statusText: 'Accepted for offline sync',
        headers: {},
        config: error.config,
      } as AxiosResponse);
    }
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
