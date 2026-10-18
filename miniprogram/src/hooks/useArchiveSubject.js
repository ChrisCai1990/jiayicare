import { useCallback, useState } from 'react';
import Taro, { useDidShow } from '@tarojs/taro';
import { guardianChildrenAPI, familyLinksAPI } from '../services/api';
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
  const [subjects, setSubjects] = useState([]);
  const [subject, setSubject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!user?._id) {
      setChildren([]); setSubjects([]); setSubject(null); setError(''); setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [childResult, familyResult] = await Promise.all([guardianChildrenAPI.list(), familyLinksAPI.list()]);
      if (!childResult?.success || !Array.isArray(childResult.data) || !familyResult?.success || !Array.isArray(familyResult.data)) {
        throw new Error('档案列表加载失败');
      }
      const childSubjects = childResult.data.map(child => ({ ...child, kind: 'child' }));
      const childIds = new Set(childSubjects.map(child => String(child.id)));
      const adultSubjects = familyResult.data.filter(link => link.user?._id && !childIds.has(String(link.user._id)))
        .map(link => ({ id: link.user._id, name: link.user.name, kind: 'adult', relation: link.relation }));
      const allowed = [...childSubjects, ...adultSubjects];
      const selected = allowed.find(member => String(member.id) === storedArchiveId(user._id)) || null;
      setChildren(childSubjects);
      setSubjects(allowed);
      setSubject(selected);
      if (!selected) Taro.removeStorageSync(archiveStorageKey(user._id));
      setError('');
    } catch (err) {
      setChildren([]);
      setSubjects([]);
      setSubject(null);
      setError(err.message || '档案列表加载失败，请重试');
    } finally { setLoading(false); }
  }, [user?._id]);

  useDidShow(() => { refresh(); });

  const select = index => {
    const member = index > 0 ? subjects[index - 1] : null;
    if (member) Taro.setStorageSync(archiveStorageKey(user._id), String(member.id));
    else Taro.removeStorageSync(archiveStorageKey(user._id));
    setSubject(member);
  };

  return { user, children, subjects, subject, loading, error, refresh, select };
}
