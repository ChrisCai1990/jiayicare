import React, { createContext, useContext, useState, useEffect } from 'react';
import { loadToken, saveToken, clearToken, setUnauthorizedHandler } from '../services/api';

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
          // Try to load cached user
          const cached = localStorage.getItem('jy_user');
          if (cached) setUser(JSON.parse(cached));
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
