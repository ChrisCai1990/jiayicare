import React, { useState, useEffect } from 'react';
import { View, Text, Switch, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../../theme';
import useNavBar from '../../../hooks/useNavBar';
import Icon from '../../../components/Icon';
import { isNativeApp } from '../../../utils/appBridge';
import { enableSystemPush, disableSystemPush, hasSystemPushOptIn } from '../../../utils/pushSession';
import { pushDevicesAPI } from '../../../services/api';

// App 开关由服务端保存并在发送时执行；小程序仍使用本机设置。
const SETTINGS = [
  { group: '健康提醒', items: [
    { key: 'medication', label: '用药提醒', desc: '服药时间到时推送通知' },
    { key: 'measurement', label: '测量提醒', desc: '已设置的血压、血糖等测量提醒' },
    { key: 'exercise', label: '运动提醒', desc: '已设置的运动提醒到点推送' },
  ] },
  { group: '服务消息', items: [
    { key: 'doctor', label: '健康顾问消息', desc: '健康顾问回复及随访通知' },
    { key: 'manager', label: '健管专员消息', desc: '健管专员消息提醒' },
    { key: 'nutritionist', label: '营养师消息', desc: '营养师回复及营养指导通知' },
    { key: 'report', label: '报告整理', desc: '检查报告整理完成通知' },
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
  const [pushBusy, setPushBusy] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(hasSystemPushOptIn);
  const [pushMessage, setPushMessage] = useState(() => hasSystemPushOptIn()
    ? '此设备已绑定。新消息和到点提醒将发送系统通知。' : '开启后将申请 iPhone 系统通知权限。');

  const changePush = async enable => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      if (enable) {
        if (!await enableSystemPush()) throw new Error('设备绑定未完成，请重试');
        setPushEnabled(true);
        setPushMessage('设备已绑定。新消息和到点提醒将发送系统通知。');
      } else {
        await disableSystemPush();
        setPushEnabled(false);
        setPushMessage('已关闭此设备的系统通知。');
      }
    } catch (error) { setPushMessage(error.message || '设置失败，请重试'); }
    finally { setPushBusy(false); }
  };

  useEffect(() => {
    if (isNativeApp()) {
      pushDevicesAPI.settings().then(res => {
        if (res.success && res.data) setSettings({ ...DEFAULT_SETTINGS, ...res.data });
      }).catch(() => {});
      return;
    }
    try {
      const raw = Taro.getStorageSync('jy_notif_settings');
      if (raw) setSettings(JSON.parse(raw));
    } catch {}
  }, []);

  const toggle = async (key) => {
    const next = { ...settings, [key]: !settings[key] };
    if (isNativeApp()) {
      if (!pushEnabled) return Taro.showToast({ title: '请先开启 App 系统消息通知', icon: 'none' });
      try { await pushDevicesAPI.setSetting(key, next[key]); setSettings(next); }
      catch (error) { Taro.showToast({ title: error.message || '保存失败，请重试', icon: 'none' }); }
      return;
    }
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
      {isNativeApp() && <View style={{ backgroundColor: '#fff', padding: '16px', marginBottom: '20px', borderRadius: '12px' }}>
        <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontWeight: 700 }}>App 系统消息通知</Text>
          <Switch checked={pushEnabled} disabled={pushBusy} onChange={event => changePush(event.detail.value)} color={colors.primary} />
        </View>
        <Text style={{ display: 'block', fontSize: '12px', margin: '12px 0', color: colors.textMuted }}>{pushBusy ? '正在处理…' : pushMessage}</Text>
        {pushEnabled && <Text onClick={() => changePush(true)} style={{ color: colors.primary }}>重新绑定设备</Text>}
      </View>}
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
                <Switch checked={isNativeApp() ? pushEnabled && settings[item.key] : settings[item.key]} disabled={isNativeApp() && (!pushEnabled || pushBusy)} onChange={() => toggle(item.key)} color={colors.primary} />
              </View>
            ))}
          </View>
        </View>
      ))}
      <Text style={{ fontSize: '11px', color: colors.textMuted, textAlign: 'center', display: 'block' }}>{isNativeApp() ? '分类设置保存在服务端；新消息按设置发送至本设备。' : '分类开关目前仅保存在本机，尚未连接微信订阅通知。'}</Text>
      </View>
      </ScrollView>
    </View>
  );
}
