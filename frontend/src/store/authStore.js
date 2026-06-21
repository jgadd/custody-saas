import { create } from 'zustand';
import api from '../lib/api';

const useAuthStore = create((set, get) => ({
  user: JSON.parse(localStorage.getItem('custody_user') || 'null'),
  token: localStorage.getItem('custody_token'),
  loading: false,
  error: null,

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post('/auth/login', { email, password });
      const { token, user } = res.data;
      localStorage.setItem('custody_token', token);
      localStorage.setItem('custody_user', JSON.stringify(user));
      set({ token, user, loading: false });
      return user;
    } catch (e) {
      set({ error: e.response?.data?.error || 'Login failed', loading: false });
      throw e;
    }
  },

  logout: () => {
    localStorage.removeItem('custody_token');
    localStorage.removeItem('custody_user');
    set({ user: null, token: null });
  },

  isAdmin: () => ['SUPER_ADMIN', 'STATION_ADMIN'].includes(get().user?.role),
  isSuperAdmin: () => get().user?.role === 'SUPER_ADMIN',
}));

export default useAuthStore;
