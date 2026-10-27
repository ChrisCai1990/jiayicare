import { storageKey } from '../utils/reviewEnvironment';
import React, { createContext, useContext, useState, useEffect } from 'react';
import Taro from '@tarojs/taro';
import { loadToken, saveToken, clearToken, setUnauthorizedHandler, userAPI, authAPI } from '../services/api';
import { resetUnreadBadge, refreshUnreadBadge } from '../utils/unreadBadge';
import { disableSystemPush, forgetRevokedPushSession, restoreSystemPush } from '../utils/pushSession';
import { isNativeApp, callNative } from '../utils/appBridge';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!loading && token) restoreSystemPush();
  }, [loading, token]);
  useEffect(() => {
    if (!token || !isNativeApp()) return undefined;
    let mounted = true;
    const open = async () => {
      try {
        if (await callNative('consume-push-open', {}, 5000) && mounted) {
          await Taro.switchTab({ url: '/pages/chat/index' });
          refreshUnreadBadge();
        }
      } catch {}
    };
    window.addEventListener('jiayicare:push-open', open);
    open();
    return () => { mounted = false; window.removeEventListener('jiayicare:push-open', open); };
  }, [token]);

  useEffect(() => {
    (async () => {
      try {
        const t = loadToken();
        if (t) {
          setToken(t);
          // Cached profile and token can come from different browser tabs.
          // Display personal data only after the current session is verified.
          try {
            const res = await userAPI.getMe();
            if (res?.success && res.data) {
              setToken(loadToken());
              setUser(res.data);
              try { Taro.setStorageSync(storageKey('jy_user'), JSON.stringify(res.data)); } catch {}
            }
          } catch {}
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.addEventListener || !window.location?.reload) return undefined;
    const syncSession = () => {
      if (!loading && loadToken() !== token) window.location.reload();
    };
    window.addEventListener('storage', syncSession);
    window.addEventListener('focus', syncSession);
    return () => {
      window.removeEventListener('storage', syncSession);
      window.removeEventListener('focus', syncSession);
    };
  }, [loading, token]);

  useEffect(() => {
    if (loading || token) return;
    let route = '';
    try {
      const pages = Taro.getCurrentPages?.() || [];
      route = (pages[pages.length - 1]?.route || '').split('?')[0].replace(/^\/+/, '');
    } catch {}
    // 审核和普通访客应当可以先体验公开内容，只有进入个人健康数据等
    // 受保护页面时才要求登录。首页也是小程序默认启动页，不能在这里
    // 主动索取手机号授权。
    const publicRoutes = new Set([
      'pages/home/index',
      'pages/services/mall/index',
      'pages/records/public-report/index',
      'pages/auth/login/index',
      'pages/legal/index',
      'pages/account-deletion/receipt/index',
    ]);
    if (!route || publicRoutes.has(route)) return;
    Taro.reLaunch({ url: '/pages/auth/login/index' }).catch(() => {});
  }, [loading, token]);

  const login = async (userData, tok) => {
    await disableSystemPush();
    saveToken(tok);
    setToken(tok);
    setUser(userData);
    resetUnreadBadge();
    refreshUnreadBadge();
    try { Taro.setStorageSync(storageKey('jy_user'), JSON.stringify(userData)); } catch {}
  };

  const logout = async (notifyServer = true) => {
    if (notifyServer) await disableSystemPush();
    else forgetRevokedPushSession();
    if (notifyServer) { try { await authAPI.sessionActivity('logout'); } catch {} }
    clearToken();
    resetUnreadBadge();
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
    try { Taro.setStorageSync(storageKey('jy_user'), JSON.stringify(updated)); } catch {}
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
