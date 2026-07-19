import React, { createContext, useContext, useState, useEffect } from 'react';
import { loadToken, saveToken, clearToken, setUnauthorizedHandler, userAPI } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // On mount, try to restore session
    (async () => {
      try {
        const t = await loadToken();
        if (t) {
          setToken(t);
          // 先用本地缓存快速展示，避免白屏；缓存可能是很久以前登录时的旧快照
          // （如careTeam这类后续新增的字段，老账号本地缓存里根本没有），必须紧接着用
          // /user/me 的最新响应覆盖一次，不能只依赖本地缓存
          const cached = localStorage.getItem('jy_user');
          if (cached) { try { setUser(JSON.parse(cached)); } catch {} }
          try {
            const res = await userAPI.getMe();
            if (res?.success && res.data) {
              setUser(res.data);
              localStorage.setItem('jy_user', JSON.stringify(res.data));
            }
          } catch {}
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const login = async (userData, tok) => {
    await saveToken(tok);
    setToken(tok);
    setUser(userData);
    try { localStorage.setItem('jy_user', JSON.stringify(userData)); } catch {}
  };

  const logout = async () => {
    await clearToken();
    setToken(null);
    setUser(null);
  };

  // 注册 401 处理器：token 失效时自动退出登录
  useEffect(() => {
    setUnauthorizedHandler(() => logout());
    return () => setUnauthorizedHandler(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateUser = (updates) => {
    const updated = { ...user, ...updates };
    setUser(updated);
    try { localStorage.setItem('jy_user', JSON.stringify(updated)); } catch {}
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
