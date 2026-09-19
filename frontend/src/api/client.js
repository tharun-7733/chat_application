// API Layer — Axios instance with JWT interceptors
// Centralizes all HTTP configuration, token refresh, and error handling.
// All requests go to the Go service on port 8081.

import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8081';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
});

// Request interceptor: attach the JWT access token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: on 401, attempt token refresh then retry once
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${API_BASE_URL}/api/auth/refresh`, { refreshToken });
          const newToken = data.data.accessToken;
          localStorage.setItem('accessToken', newToken);
          original.headers.Authorization = `Bearer ${newToken}`;
          return api(original);
        } catch {
          localStorage.clear();
          window.location.href = '/login';
        }
      } else {
        localStorage.clear();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ── Auth endpoints ──────────────────────────────────────────────────────────
export const authApi = {
  register:  (data)         => api.post('/api/auth/register', data),
  login:     (data)         => api.post('/api/auth/login', data),
  refresh:   (refreshToken) => api.post('/api/auth/refresh', { refreshToken }),
  logout:    (refreshToken) => api.post('/api/auth/logout', { refreshToken }),
};

// ── User endpoints ──────────────────────────────────────────────────────────
export const userApi = {
  me:      ()     => api.get('/api/users/me'),
  getById: (id)   => api.get(`/api/users/${id}`),
  search:  (q='') => api.get('/api/users/search', { params: { q } }),
};

// ── Friends endpoints ───────────────────────────────────────────────────────
export const friendsApi = {
  list:          ()         => api.get('/api/friends'),
  pending:       ()         => api.get('/api/friends/pending'),
  sendRequest:   (addresseeId) => api.post('/api/friends/requests', { addresseeId }),
  acceptRequest: (id)       => api.put(`/api/friends/requests/${id}/accept`),
  rejectRequest: (id)       => api.delete(`/api/friends/requests/${id}/reject`),
};

// ── Messages endpoints ──────────────────────────────────────────────────────
export const messagesApi = {
  // Fetch conversation history with a contact (newest 50 by default).
  history: (contactId, limit = 50) =>
    api.get(`/api/messages/${contactId}`, { params: { limit } }),
};

export default api;
