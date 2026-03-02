// src/lib/axios.ts
import axios from 'axios';
import { useAuthStore } from '../hooks/use-auth-store';
import { getCookie } from '@/utils/get-cookie';

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE! || `http://localhost:3001`,
  withCredentials: true, // ensures cookies (refresh/access tokens) are sent
});

// Automatically inject CSRF token into every request
api.interceptors.request.use( async (config) => {
  // const csrf = useAuthStore.getState().csrfToken;
  const csrf = await getCookie();
  if (csrf) {
    config.headers['X-CSRF-Token'] = csrf;
  }
  return config;
});
