import React, { createContext, useContext, useState, useEffect } from 'react';
import Taro from '@tarojs/taro';
import { loadToken, saveToken, clearToken, setUnauthorizedHandler, userAPI } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const t = loadToken();
        if (t) {
          setToken(t);
          let cached = null;
          try { cached = Taro.getStorageSync('jy_user'); } catch {}
          if (cached) { try { setUser(JSON.parse(cached)); } catch {} }
          try {
            const res = await userAPI.getMe();
            if (res?.success && res.data) {
              setUser(res.data);
              try { Taro.setStorageSync('jy_user', JSON.stringify(res.data)); } catch {}
            }
          } catch {}
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const login = async (userData, tok) => {
    saveToken(tok);
    setToken(tok);
    setUser(userData);
    try { Taro.setStorageSync('jy_user', JSON.stringify(userData)); } catch {}
  };

  const logout = async () => {
    clearToken();
    setToken(null);
    setUser(null);
  };

  useEffect(() => {
    setUnauthorizedHandler(() => logout());
    return () => setUnauthorizedHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateUser = (updates) => {
    const updated = { ...user, ...updates };
    setUser(updated);
    try { Taro.setStorageSync('jy_user', JSON.stringify(updated)); } catch {}
  };

  // 演示账号（13800138000）才展示 mock 数据
  const isDemo = user?.phone === '13800138000';

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, updateUser, isDemo }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
