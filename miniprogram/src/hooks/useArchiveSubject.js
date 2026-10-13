import { useCallback, useState } from 'react';
import Taro, { useDidShow } from '@tarojs/taro';
import { guardianChildrenAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

export const archiveStorageKey = userId => `jy_active_archive_${userId}`;

export function storedArchiveId(userId) {
  if (!userId) return '';
  try { return String(Taro.getStorageSync(archiveStorageKey(userId)) || ''); }
  catch { return ''; }
}

export default function useArchiveSubject() {
  const { user } = useAuth();
  const [children, setChildren] = useState([]);
  const [subject, setSubject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!user?._id) { setLoading(true); return; }
    setLoading(true);
    try {
      const result = await guardianChildrenAPI.list();
      if (!result?.success || !Array.isArray(result.data)) throw new Error(result?.message || '档案列表加载失败');
      const allowed = result.data;
      const selected = allowed.find(child => String(child.id) === storedArchiveId(user._id)) || null;
      setChildren(allowed);
      setSubject(selected);
      if (!selected) Taro.removeStorageSync(archiveStorageKey(user._id));
      setError('');
    } catch (err) {
      setChildren([]);
      setSubject(null);
      setError(err.message || '档案列表加载失败，请重试');
    } finally { setLoading(false); }
  }, [user?._id]);

  useDidShow(() => { refresh(); });

  const select = index => {
    const child = index > 0 ? children[index - 1] : null;
    if (child) Taro.setStorageSync(archiveStorageKey(user._id), String(child.id));
    else Taro.removeStorageSync(archiveStorageKey(user._id));
    setSubject(child);
  };

  return { user, children, subject, loading, error, refresh, select };
}
