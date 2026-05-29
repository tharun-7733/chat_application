// AuthContext — Global authentication state
// Provides: { user, isAuthenticated, isLoading, login, logout, register }

import { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { authApi, userApi } from '../api/client';

const AuthContext = createContext(null);

const initialState = { user: null, isAuthenticated: false, isLoading: true };

function authReducer(state, action) {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: action.payload, isAuthenticated: !!action.payload, isLoading: false };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'LOGOUT':
      return { ...initialState, isLoading: false };
    default:
      return state;
  }
}

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // On mount: rehydrate auth state from localStorage
  useEffect(() => {
    const rehydrate = async () => {
      const token = localStorage.getItem('accessToken');
      if (!token) { dispatch({ type: 'SET_LOADING', payload: false }); return; }
      try {
        const { data } = await userApi.me();
        dispatch({ type: 'SET_USER', payload: data.data });
      } catch {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        dispatch({ type: 'LOGOUT' });
      }
    };
    rehydrate();
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await authApi.login({ email, password });
    const { accessToken, refreshToken, user } = data.data;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    dispatch({ type: 'SET_USER', payload: user });
    return user;
  }, []);

  const register = useCallback(async (username, email, password) => {
    const { data } = await authApi.register({ username, email, password });
    const { accessToken, refreshToken, user } = data.data;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    dispatch({ type: 'SET_USER', payload: user });
    return user;
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    try { await authApi.logout(refreshToken); } catch { /* ignore */ }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    dispatch({ type: 'LOGOUT' });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
