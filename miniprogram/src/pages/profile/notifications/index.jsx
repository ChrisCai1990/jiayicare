import React, { useState, useEffect } from 'react';
import { View, Text, Switch } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../../theme';
import useNavBar from '../../../hooks/useNavBar';
import Icon from '../../../components/Icon';

// 通知设置为本地开关（与 app 端一致，存 storage，不是服务端配置项）
const DEFAULT_SETTINGS = {
  followup: true, medication: true, report: true, service: true, system: true,
};
const LABELS = { followup: '随访提醒', medication: '用药提醒', report: '报告解读通知', service: '服务动态', system: '系统通知' };

export default function NotificationSettingsPage() {
  const { statusBarHeight } = useNavBar();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  useEffect(() => {
    try {
      const raw = Taro.getStorageSync('jy_notif_settings');
      if (raw) setSettings(JSON.parse(raw));
    } catch {}
  }, []);

  const toggle = (key) => {
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    try { Taro.setStorageSync('jy_notif_settings', JSON.stringify(next)); } catch {}
  };

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background }}>
      <View style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `${statusBarHeight + 8}px ${spacing.lg}px ${spacing.md}px`,
        backgroundColor: '#fff', borderBottom: `1px solid ${colors.border}`,
      }}>
        <View onClick={() => Taro.navigateBack()} style={{ padding: '4px' }}>
          <Icon name="chevron-left" size={20} color={colors.textPrimary} />
        </View>
        <Text style={{ fontSize: '18px', fontWeight: 700, color: colors.textPrimary }}>消息通知设置</Text>
        <View style={{ width: '28px' }} />
      </View>

      <View style={{ padding: `${spacing.lg}px` }}>
      <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, boxShadow: shadow.card, overflow: 'hidden' }}>
        {Object.keys(DEFAULT_SETTINGS).map((k, i, arr) => (
          <View key={k} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px',
            borderBottom: i < arr.length - 1 ? `1px solid ${colors.borderLight}` : 'none',
          }}>
            <Text style={{ fontSize: '14px', color: colors.textPrimary }}>{LABELS[k]}</Text>
            <Switch checked={settings[k]} onChange={() => toggle(k)} color={colors.primary} />
          </View>
        ))}
      </View>
      </View>
    </View>
  );
}
