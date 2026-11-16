import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { colors, radius } from '../theme';
import { useLanguage } from '../i18n';

// Presentation preferences only: never filter record requests, tasks or completion counts.
export default function CheckinFavorites({ userId, items, renderItem, onBatch, children }) {
  const { t } = useLanguage();
  const storageKey = userId ? `jy_checkin_favorites_v1:${userId}` : '';
  const [preference, setPreference] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const validKeys = (keys) => Array.isArray(keys) ? items.map(item => item.key).filter(key => keys.includes(key)) : null;
  useEffect(() => {
    let keys = null;
    try { if (storageKey) keys = validKeys(Taro.getStorageSync(storageKey)); } catch {}
    setPreference({ storageKey, keys });
    setShowAll(false);
    setDraft(null);
    setError('');
  }, [storageKey]);
  // Never show the previous account's preferences while identity is changing.
  const selected = preference?.storageKey === storageKey ? preference.keys : null;
  const customized = Array.isArray(selected) && selected.length > 0;
  const favorites = customized ? items.filter(item => selected.includes(item.key)) : [];
  const save = (keys) => {
    if (!storageKey) { setError('请登录后设置常用项目'); return; }
    try {
      const normalized = validKeys(keys);
      if (!normalized?.length) Taro.removeStorageSync(storageKey);
      else Taro.setStorageSync(storageKey, normalized);
      setPreference({ storageKey, keys: normalized?.length ? normalized : null });
      setShowAll(false);
      setDraft(null);
      setError('');
    } catch { setError('设置未保存，请重试'); }
  };
  const actionStyle = { padding: '12px 8px', fontSize: '15px', color: colors.primary };
  return (
    <>
      <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <View style={{ display: 'flex', gap: '12px' }}>
          {customized && <>
            <Text onClick={() => setShowAll(false)} style={{ ...actionStyle, fontWeight: !showAll ? 700 : 400 }}>{t('常用项目')}</Text>
            <Text onClick={() => setShowAll(true)} style={{ ...actionStyle, fontWeight: showAll ? 700 : 400 }}>{t('全部项目')}</Text>
          </>}
        </View>
        <Text onClick={() => { setDraft(selected || items.map(item => item.key)); setError(''); }} style={actionStyle}>{t('管理常用')}</Text>
      </View>
      {customized && !showAll ? <>
        <Text onClick={onBatch} style={{ ...actionStyle, display: 'block', textAlign: 'right' }}>{t('多日快速补录')}</Text>
        <View style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>{favorites.map(renderItem)}</View>
      </> : children}
      {draft !== null && <View style={{ position: 'fixed', inset: 0, zIndex: 1200, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end' }} onClick={() => setDraft(null)}>
        <View onClick={event => event.stopPropagation()} style={{ width: '100%', maxHeight: '78vh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', backgroundColor: '#fff', borderRadius: '20px 20px 0 0', padding: '20px 20px calc(16px + env(safe-area-inset-bottom))' }}>
          <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: '20px', fontWeight: 700, color: colors.textPrimary }}>{t('管理常用项目')}</Text>
            <Text onClick={() => setDraft(null)} style={actionStyle}>{t('取消')}</Text>
          </View>
          <Text style={{ fontSize: '14px', color: colors.textSecondary, marginBottom: '12px' }}>{t('未选项目仍可在“全部项目”中记录。不选择时展示全部。设置仅保存在当前设备。')}</Text>
          <ScrollView scrollY style={{ height: '40vh', minHeight: 0 }}>
            {items.map(item => <View key={item.key} onClick={() => setDraft(keys => keys.includes(item.key) ? keys.filter(key => key !== item.key) : [...keys, item.key])} style={{ minHeight: '48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${colors.border}`, color: colors.textPrimary }}>
              <Text style={{ fontSize: '17px' }}>{t(item.label)}</Text>
              <Text style={{ fontSize: '22px', color: colors.primary }}>{draft.includes(item.key) ? '✓' : '○'}</Text>
            </View>)}
          </ScrollView>
          {error && <Text style={{ color: colors.danger, fontSize: '14px', marginTop: '8px' }}>{t(error)}</Text>}
          <View onClick={() => save(draft)} style={{ padding: '14px', marginTop: '14px', textAlign: 'center', backgroundColor: colors.primary, borderRadius: `${radius.md}px` }}><Text style={{ color: '#fff', fontSize: '17px', fontWeight: 700 }}>{t('保存设置')}</Text></View>
          <Text onClick={() => save(null)} style={{ ...actionStyle, textAlign: 'center' }}>{t('恢复全部展示')}</Text>
        </View>
      </View>}
    </>
  );
}
