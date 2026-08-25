import React, { createContext, useContext, useState, useEffect } from 'react';
import Taro from '@tarojs/taro';
import { loadToken, saveToken, clearToken, setUnauthorizedHandler, userAPI, authAPI } from '../services/api';

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

  useEffect(() => {
    if (loading || token) return;
    let route = '';
    try {
      const pages = Taro.getCurrentPages?.() || [];
      route = pages[pages.length - 1]?.route || '';
    } catch {}
    // 审核和普通访客应当可以先体验公开内容，只有进入个人健康数据等
    // 受保护页面时才要求登录。首页也是小程序默认启动页，不能在这里
    // 主动索取手机号授权。
    const publicRoutes = new Set([
      'pages/home/index',
      'pages/auth/login/index',
      'pages/legal/index',
    ]);
    if (publicRoutes.has(route)) return;
    Taro.reLaunch({ url: '/pages/auth/login/index' }).catch(() => {});
  }, [loading, token]);

  const login = async (userData, tok) => {
    saveToken(tok);
    setToken(tok);
    setUser(userData);
    try { Taro.setStorageSync('jy_user', JSON.stringify(userData)); } catch {}
  };

  const logout = async (notifyServer = true) => {
    if (notifyServer) { try { await authAPI.sessionActivity('logout'); } catch {} }
    clearToken();
    setToken(null);
    setUser(null);
  };

  useEffect(() => {
    if (!token) return undefined;
    authAPI.sessionActivity('foreground').catch(() => {});
    const timer = setInterval(() => authAPI.sessionActivity('heartbeat').catch(() => {}), 60000);
    return () => clearInterval(timer);
  }, [token]);

  useEffect(() => {
    setUnauthorizedHandler(() => logout(false));
    return () => setUnauthorizedHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateUser = (updates) => {
    const updated = { ...user, ...updates };
    setUser(updated);
    try { Taro.setStorageSync('jy_user', JSON.stringify(updated)); } catch {}
  };

  // 演示账号（13800138000）才展示 mock 数据
  const isDemo = false;

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, updateUser, isDemo }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
