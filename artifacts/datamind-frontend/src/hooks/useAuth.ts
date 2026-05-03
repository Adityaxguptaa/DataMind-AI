import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      if (localStorage.getItem('access_token')) {
        const userData = await api.get('/auth/me');
        setUser(userData);
      }
    } catch (e) {
      console.error(e);
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    } finally {
      setLoading(false);
    }
  };

  const login = async (credentials: any) => {
    const data = await api.post<any>('/auth/login', credentials);
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    setUser(data.user);
  };

  const register = async (data: any) => {
    const result = await api.post<any>('/auth/register', data);
    localStorage.setItem('access_token', result.access_token);
    localStorage.setItem('refresh_token', result.refresh_token);
    setUser(result.user);
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout', { refresh_token: localStorage.getItem('refresh_token') });
    } catch(e) {}
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setUser(null);
    window.location.href = '/login';
  };

  return { user, loading, login, logout, checkAuth, register };
}
