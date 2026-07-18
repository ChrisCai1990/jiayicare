import React, { useState, useCallback } from 'react';
import { View, Text, Input, Textarea } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../theme';
import { supplementsAPI } from '../../services/api';

// 对齐 app/src/screens/nutrition/NutritionScreen.js
const FREQ_OPTIONS = ['每日1次', '每日2次', '每日3次', '隔日1次', '每周3次', '按需服用'];
const METHOD_OPTIONS = ['随餐', '空腹', '冲服', '睡前', '饭后', '其他'];
const EMPTY_FORM = { name: '', brand: '', dosage: '', method: '随餐', frequency: '每日1次', startDate: '', note: '' };

function SupCard({ item, stopped, onCheckin, onStop }) {
  const itemId = item._id || item.id;
  const today = new Date().toISOString().split('T')[0];
  const takenToday = item.lastCheckinDate === today;
  return (
    <View style={{
      backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.sm}px`,
      boxShadow: shadow.sm, borderLeft: `3px solid ${stopped ? colors.textMuted : '#22A06B'}`, opacity: stopped ? 0.75 : 1,
    }}>
      <View style={{ display: 'flex', alignItems: 'flex-start', gap: `${spacing.sm}px` }}>
        <View style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: stopped ? '#F5F5F5' : '#E8F5EF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Text style={{ fontSize: '18px' }}>🌿</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
            <Text style={{ fontSize: '15px', fontWeight: 700, color: stopped ? colors.textMuted : colors.textPrimary }}>{item.name}</Text>
            {!!item.brand && <Text style={{ fontSize: '10px', color: '#22A06B', backgroundColor: '#E8F5EF', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>{item.brand}</Text>}
            {stopped && <Text style={{ fontSize: '10px', color: colors.textMuted, backgroundColor: '#F5F5F5', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>已停用</Text>}
            {!stopped && takenToday && <Text style={{ fontSize: '10px', color: '#059669', backgroundColor: '#D1FAE5', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>今日已服</Text>}
          </View>
          <Text style={{ fontSize: '12px', color: colors.textSecondary, display: 'block' }}>{item.dosage} · {item.method || '随餐'} · {item.frequency}</Text>
          {!!item.startDate && <Text style={{ fontSize: '11px', color: colors.textMuted, display: 'block' }}>开始：{item.startDate}</Text>}
          {stopped && !!item.stopDate && <Text style={{ fontSize: '11px', color: colors.warning, display: 'block' }}>停用：{item.stopDate}</Text>}
          {!!item.note && <Text style={{ fontSize: '11px', color: '#22A06B', display: 'block', marginTop: '2px' }}>{item.note}</Text>}
        </View>
      </View>
      {!stopped && (
        <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: `${spacing.sm}px`, paddingTop: `${spacing.sm}px`, borderTop: `1px solid ${colors.borderLight}` }}>
          <View onClick={() => onStop(itemId, item.name)} style={{ padding: '5px 10px', borderRadius: `${radius.full}px`, border: `1.5px solid ${colors.warning}` }}>
            <Text style={{ fontSize: '12px', color: colors.warning, fontWeight: 600 }}>标记停用</Text>
          </View>
          <View onClick={() => !takenToday && onCheckin(itemId, item.name)} style={{ padding: '5px 10px', borderRadius: `${radius.full}px`, border: `1.5px solid ${takenToday ? '#059669' : '#22A06B'}`, backgroundColor: takenToday ? '#D1FAE5' : '#E8F5EF' }}>
            <Text style={{ fontSize: '12px', color: takenToday ? '#059669' : '#22A06B', fontWeight: 600 }}>{takenToday ? '今日已服 ✓' : '今日已服'}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

export default function NutritionPage() {
  const [tab, setTab] = useState('active');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const loadItems = useCallback(() => {
    setLoading(true);
    supplementsAPI.list().then((res) => { if (res.success) setItems(res.data || []); })
      .catch(() => setItems([])).finally(() => setLoading(false));
  }, []);

  useDidShow(() => { loadItems(); });

  const activeItems = items.filter((i) => !i.stopped);
  const stoppedItems = items.filter((i) => i.stopped);
  const displayed = tab === 'active' ? activeItems : stoppedItems;

  const handleCheckin = async (id, name) => {
    const today = new Date().toISOString().split('T')[0];
    setItems((prev) => prev.map((i) => (i._id || i.id) === id ? { ...i, lastCheckinDate: today } : i));
    Taro.showToast({ title: `「${name}」已记录今日服用`, icon: 'success' });
    try { await supplementsAPI.checkin(id); } catch {}
  };

  const handleStop = async (id, name) => {
    const today = new Date().toISOString().split('T')[0];
    setItems((prev) => prev.map((i) => (i._id || i.id) === id ? { ...i, stopped: true, stopDate: today } : i));
    Taro.showToast({ title: `「${name}」已标记停用`, icon: 'none' });
    try { await supplementsAPI.stop(id, { stopDate: today }); } catch {}
  };

  const handleAdd = async () => {
    if (!form.name || !form.dosage || !form.frequency) {
      Taro.showToast({ title: '请填写营养素名称、剂量和使用频次', icon: 'none' });
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, startDate: form.startDate || new Date().toISOString().slice(0, 10) };
      const res = await supplementsAPI.create(payload);
      if (res.success && res.data) setItems((prev) => [res.data, ...prev]);
      setForm(EMPTY_FORM);
      setShowAdd(false);
      Taro.showToast({ title: '营养素记录已添加', icon: 'success' });
    } catch {
      Taro.showToast({ title: '添加失败，请稍后重试', icon: 'none' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background, paddingBottom: `${spacing.xxl}px` }}>
      <View style={{ backgroundColor: '#22A06B', padding: `${spacing.lg}px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text style={{ fontSize: '18px', fontWeight: 700, color: '#fff', display: 'block' }}>营养素管理</Text>
          <Text style={{ fontSize: '11px', color: 'rgba(255,255,255,0.65)' }}>全生命周期营养补充记录</Text>
        </View>
        <View onClick={() => setShowAdd(true)} style={{ width: '36px', height: '36px', borderRadius: '18px', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: '20px' }}>+</Text>
        </View>
      </View>

      <View style={{ display: 'flex', backgroundColor: '#fff', margin: `-10px ${spacing.lg}px 0`, borderRadius: `${radius.lg}px`, padding: `${spacing.md}px`, boxShadow: shadow.md }}>
        <View style={{ flex: 1, textAlign: 'center' }}>
          <Text style={{ fontSize: '22px', fontWeight: 800, color: '#22A06B', display: 'block' }}>{activeItems.length}</Text>
          <Text style={{ fontSize: '11px', color: colors.textMuted }}>进行中</Text>
        </View>
        <View style={{ width: '1px', backgroundColor: colors.borderLight }} />
        <View style={{ flex: 1, textAlign: 'center' }}>
          <Text style={{ fontSize: '22px', fontWeight: 800, color: '#22A06B', display: 'block' }}>{stoppedItems.length}</Text>
          <Text style={{ fontSize: '11px', color: colors.textMuted }}>已停用</Text>
        </View>
        <View style={{ width: '1px', backgroundColor: colors.borderLight }} />
        <View style={{ flex: 1, textAlign: 'center' }}>
          <Text style={{ fontSize: '22px', fontWeight: 800, color: '#22A06B', display: 'block' }}>{items.length}</Text>
          <Text style={{ fontSize: '11px', color: colors.textMuted }}>总记录</Text>
        </View>
      </View>

      <View style={{ display: 'flex', margin: `${spacing.md}px ${spacing.lg}px 0`, backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
        {[{ key: 'active', label: `进行中 (${activeItems.length})` }, { key: 'stopped', label: `已停用 (${stoppedItems.length})` }].map((t) => (
          <View key={t.key} onClick={() => setTab(t.key)} style={{ flex: 1, textAlign: 'center', padding: '10px 0', backgroundColor: tab === t.key ? '#22A06B' : 'transparent' }}>
            <Text style={{ fontSize: '13px', fontWeight: 600, color: tab === t.key ? '#fff' : colors.textSecondary }}>{t.label}</Text>
          </View>
        ))}
      </View>

      <View style={{ padding: `${spacing.sm}px ${spacing.lg}px 0` }}>
        {loading ? (
          <Text style={{ fontSize: '13px', color: colors.textMuted }}>加载中...</Text>
        ) : displayed.length === 0 ? (
          <View style={{ textAlign: 'center', padding: '60px 0' }}>
            <Text style={{ fontSize: '15px', fontWeight: 600, color: colors.textSecondary, display: 'block' }}>{tab === 'active' ? '暂无进行中的营养素方案' : '暂无已停用的营养素记录'}</Text>
            {tab === 'active' && <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block', marginTop: '4px' }}>营养素方案将由医护团队为您配置并推送，您也可点击右上角 + 自行记录</Text>}
          </View>
        ) : (
          displayed.map((item) => (
            <SupCard key={item._id || item.id} item={item} stopped={tab === 'stopped'} onCheckin={handleCheckin} onStop={handleStop} />
          ))
        )}
      </View>

      {showAdd && (
        <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: '28px 28px 0 0', padding: `${spacing.lg}px`, width: '100%', maxHeight: '85%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
            <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: `${spacing.lg}px` }}>
              <Text style={{ fontSize: '18px', fontWeight: 700, color: colors.textPrimary }}>添加营养素记录</Text>
              <Text onClick={() => setShowAdd(false)} style={{ fontSize: '18px', color: colors.textSecondary }}>✕</Text>
            </View>
            {[
              { label: '营养素名称 *', key: 'name', placeholder: '如：维生素C、钙、蛋白粉' },
              { label: '品牌（可选）', key: 'brand', placeholder: '如：Swisse、汤臣倍健' },
              { label: '剂量 *', key: 'dosage', placeholder: '如：500mg、1粒' },
            ].map((f) => (
              <View key={f.key} style={{ marginBottom: `${spacing.md}px` }}>
                <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>{f.label}</Text>
                <Input
                  style={{ backgroundColor: colors.background, borderRadius: `${radius.sm}px`, padding: '10px', fontSize: '15px', border: `1.5px solid ${colors.border}`, boxSizing: 'border-box', width: '100%' }}
                  placeholder={f.placeholder}
                  value={form[f.key]}
                  onInput={(e) => setForm((p) => ({ ...p, [f.key]: e.detail.value }))}
                />
              </View>
            ))}
            <View style={{ marginBottom: `${spacing.md}px` }}>
              <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>备注</Text>
              <Textarea
                style={{ backgroundColor: colors.background, borderRadius: `${radius.sm}px`, padding: '10px', fontSize: '15px', border: `1.5px solid ${colors.border}`, boxSizing: 'border-box', width: '100%', minHeight: '50px' }}
                placeholder="如：补充维骨力"
                value={form.note}
                onInput={(e) => setForm((p) => ({ ...p, note: e.detail.value }))}
              />
            </View>
            <View style={{ marginBottom: `${spacing.md}px` }}>
              <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>开始补充日期</Text>
              <Input
                style={{ backgroundColor: colors.background, borderRadius: `${radius.sm}px`, padding: '10px', fontSize: '15px', border: `1.5px solid ${colors.border}`, boxSizing: 'border-box', width: '100%' }}
                placeholder="YYYY-MM-DD"
                value={form.startDate}
                onInput={(e) => setForm((p) => ({ ...p, startDate: e.detail.value }))}
              />
            </View>
            <View style={{ marginBottom: `${spacing.md}px` }}>
              <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>使用方法</Text>
              <View style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {METHOD_OPTIONS.map((opt) => (
                  <View key={opt} onClick={() => setForm((p) => ({ ...p, method: opt }))} style={{ padding: '6px 12px', borderRadius: `${radius.full}px`, border: `1.5px solid ${form.method === opt ? '#22A06B' : colors.border}`, backgroundColor: form.method === opt ? '#E8F5EF' : 'transparent' }}>
                    <Text style={{ fontSize: '12px', color: form.method === opt ? '#22A06B' : colors.textSecondary, fontWeight: form.method === opt ? 600 : 400 }}>{opt}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View style={{ marginBottom: `${spacing.md}px` }}>
              <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>使用频次 *</Text>
              <View style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {FREQ_OPTIONS.map((opt) => (
                  <View key={opt} onClick={() => setForm((p) => ({ ...p, frequency: opt }))} style={{ padding: '6px 12px', borderRadius: `${radius.full}px`, border: `1.5px solid ${form.frequency === opt ? '#22A06B' : colors.border}`, backgroundColor: form.frequency === opt ? '#E8F5EF' : 'transparent' }}>
                    <Text style={{ fontSize: '12px', color: form.frequency === opt ? '#22A06B' : colors.textSecondary, fontWeight: form.frequency === opt ? 600 : 400 }}>{opt}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View onClick={saving ? undefined : handleAdd} style={{ backgroundColor: '#22A06B', borderRadius: `${radius.md}px`, padding: '14px', textAlign: 'center', marginTop: `${spacing.md}px`, marginBottom: `${spacing.lg}px`, opacity: saving ? 0.6 : 1 }}>
              <Text style={{ color: '#fff', fontSize: '16px', fontWeight: 700 }}>{saving ? '提交中...' : '添加营养素记录'}</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
