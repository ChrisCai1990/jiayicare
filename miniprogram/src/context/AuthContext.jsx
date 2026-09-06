import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import Taro from '@tarojs/taro';
import { loadToken, saveToken, clearToken, setUnauthorizedHandler, userAPI, authAPI } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const renewalRef = useRef(null);

  useEffect(() => {
    let active = true;

    const syncAutoLogin = (userData) => {
      try {
        if (userData?.wechatMpOpenid) Taro.setStorageSync('jy_auto_login', true);
        else Taro.removeStorageSync('jy_auto_login');
      } catch {}
    };

    const persistSession = (userData, tok) => {
      saveToken(tok);
      if (active) {
        setToken(tok);
        setUser(userData);
      }
      try { Taro.setStorageSync('jy_user', JSON.stringify(userData)); } catch {}
      syncAutoLogin(userData);
      return tok;
    };

    const clearReactSession = () => {
      if (active) {
        setToken(null);
        setUser(null);
      }
    };

    const renewWithWechat = () => {
      let shouldRenew = false;
      try { shouldRenew = Taro.getStorageSync('jy_auto_login') === true; } catch {}
      if (!shouldRenew) {
        clearReactSession();
        return Promise.resolve(null);
      }
      if (!renewalRef.current) {
        renewalRef.current = authAPI.wechatLogin()
          .then((res) => (res?.success && res.data?.token
            ? persistSession(res.data.user, res.data.token)
            : null))
          .then((tok) => {
            if (!tok) clearReactSession();
            return tok;
          })
          .catch(() => {
            clearReactSession();
            return null;
          })
          .finally(() => { renewalRef.current = null; });
      }
      return renewalRef.current;
    };

    // 已登录用户遇到 401 时用绑定的微信身份静默续签；主动退出才关闭该能力。
    setUnauthorizedHandler(renewWithWechat);

    (async () => {
      try {
        const t = loadToken();
        if (t) {
          if (active) setToken(t);
          let cached = null;
          try { cached = Taro.getStorageSync('jy_user'); } catch {}
          if (cached) {
            try {
              const cachedUser = JSON.parse(cached);
              if (active) setUser(cachedUser);
              // 兼容升级前已登录且已经绑定微信的用户。
              syncAutoLogin(cachedUser);
            } catch {}
          }
          try {
            const res = await userAPI.getMe();
            if (res?.success && res.data) {
              if (active) setUser(res.data);
              try { Taro.setStorageSync('jy_user', JSON.stringify(res.data)); } catch {}
              syncAutoLogin(res.data);
            }
          } catch {}
        } else {
          await renewWithWechat();
        }
      } catch {}
      if (active) setLoading(false);
    })();

    return () => {
      active = false;
      setUnauthorizedHandler(null);
    };
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
    try {
      Taro.setStorageSync('jy_user', JSON.stringify(userData));
      if (userData?.wechatMpOpenid) Taro.setStorageSync('jy_auto_login', true);
      else Taro.removeStorageSync('jy_auto_login');
    } catch {}
  };

  const logout = async (notifyServer = true) => {
    if (notifyServer) { try { await authAPI.sessionActivity('logout'); } catch {} }
    clearToken();
    try { Taro.removeStorageSync('jy_auto_login'); } catch {}
    setToken(null);
    setUser(null);
  };

  useEffect(() => {
    if (!token) return undefined;
    authAPI.sessionActivity('foreground').catch(() => {});
    const timer = setInterval(() => authAPI.sessionActivity('heartbeat').catch(() => {}), 60000);
    return () => clearInterval(timer);
  }, [token]);

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
