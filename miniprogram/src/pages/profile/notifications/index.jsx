import React, { useState, useEffect } from 'react';
import { View, Text, Switch, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../../theme';
import useNavBar from '../../../hooks/useNavBar';
import Icon from '../../../components/Icon';

// 通知设置为本地开关（与 app 端一致，存 storage，不是服务端配置项）
const SETTINGS = [
  { group: '健康提醒', items: [
    { key: 'medication', label: '用药提醒', desc: '服药时间到时推送通知' },
    { key: 'measurement', label: '测量提醒', desc: '血压、血糖等检测提醒' },
    { key: 'exercise', label: '运动提醒', desc: '每日运动计划推送' },
  ] },
  { group: '服务消息', items: [
    { key: 'doctor', label: '健康顾问消息', desc: '健康顾问回复及随访通知' },
    { key: 'manager', label: '健管专员消息', desc: '健管专员消息提醒' },
    { key: 'nutritionist', label: '营养师消息', desc: '营养师回复及营养指导通知' },
    { key: 'report', label: '报告解读', desc: '检查报告完成通知' },
  ] },
  { group: '系统通知', items: [
    { key: 'system', label: '系统推送通知', desc: '服务更新、重要公告及系统消息推送' },
    { key: 'service_exp', label: '服务到期提醒', desc: '服务包即将到期提醒' },
  ] },
];
const DEFAULT_SETTINGS = Object.fromEntries(SETTINGS.flatMap(group => group.items).map(item => [item.key, true]));

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
    <View style={{ height: '100vh', backgroundColor: colors.background, display: 'flex', flexDirection: 'column' }}>
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

      <ScrollView scrollY style={{ flex: 1, height: 0 }}>
      <View style={{ padding: `${spacing.lg}px`, paddingBottom: '96px' }}>
      {SETTINGS.map((group) => (
        <View key={group.group} style={{ marginBottom: `${spacing.lg}px` }}>
          <Text style={{ fontSize: '11px', fontWeight: 700, color: colors.textMuted, letterSpacing: '1px', display: 'block', marginBottom: `${spacing.sm}px` }}>{group.group}</Text>
          <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, boxShadow: shadow.card, overflow: 'hidden' }}>
            {group.items.map((item, i) => (
              <View key={item.key} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: `${spacing.sm}px`, padding: '14px 16px',
                borderBottom: i < group.items.length - 1 ? `1px solid ${colors.borderLight}` : 'none',
              }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: '14px', fontWeight: 600, color: colors.textPrimary, display: 'block' }}>{item.label}</Text>
                  <Text style={{ fontSize: '11px', color: colors.textMuted, display: 'block', marginTop: '2px' }}>{item.desc}</Text>
                </View>
                <Switch checked={settings[item.key]} onChange={() => toggle(item.key)} color={colors.primary} />
              </View>
            ))}
          </View>
        </View>
      ))}
      <Text style={{ fontSize: '11px', color: colors.textMuted, textAlign: 'center', display: 'block' }}>关闭后仍可在“消息”页查看历史通知，仅停止新消息推送。</Text>
      </View>
      </ScrollView>
    </View>
  );
}
