import React, { useState, useCallback } from 'react';
import { View, Text, Switch, Input, Picker, Button } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../theme';
import { remindersAPI } from '../../services/api';
import useNavBar from '../../hooks/useNavBar';
import Icon from '../../components/Icon';

const CATEGORIES = [
  ['followup_abnormal', '异常复查', 'once'], ['medication', '用药提醒', 'recurring'],
  ['supplement', '营养素补充', 'recurring'], ['monitoring', '日常监测', 'recurring'],
  ['screening_annual', '年度筛查', 'once'], ['vaccination', '疫苗接种', 'once'],
  ['diet_checkin', '饮食打卡', 'recurring'], ['exercise_checkin', '运动打卡', 'recurring'],
  ['weight_checkin', '体重打卡', 'recurring'], ['sleep', '入睡提醒', 'recurring'],
  ['substance', '烟酒提醒', 'recurring'],
];

export default function RemindersPage() {
  const { statusBarHeight } = useNavBar();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState('全部');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ category: 'medication', title: '', description: '', reminderTime: '08:00', targetDate: '' });

  const load = useCallback(() => {
    setLoading(true);
    remindersAPI.list().then((res) => { if (res.success) setList(res.data || []); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  useDidShow(() => { load(); });

  const toggle = async (id) => {
    try { await remindersAPI.toggle(id); load(); } catch {}
  };

  const remove = async (item) => {
    const res = await Taro.showModal({ title: '删除提醒', content: `确定删除“${item.title}”吗？` });
    if (!res.confirm) return;
    try { await remindersAPI.delete(item._id); load(); } catch (err) { Taro.showToast({ title: err.message || '删除失败', icon: 'none' }); }
  };

  const create = async () => {
    if (!form.title.trim()) { Taro.showToast({ title: '请输入提醒标题', icon: 'none' }); return; }
    const category = CATEGORIES.find(c => c[0] === form.category) || CATEGORIES[1];
    const payload = { category: category[0], title: form.title.trim(), description: form.description.trim(), scheduleType: category[2], enabled: true };
    if (category[2] === 'once') {
      if (!form.targetDate) { Taro.showToast({ title: '请选择提醒日期', icon: 'none' }); return; }
      payload.targetDate = new Date(form.targetDate).toISOString();
    } else {
      payload.reminderTime = form.reminderTime || '08:00'; payload.daysOfWeek = [];
    }
    setSaving(true);
    try { await remindersAPI.create(payload); setShowAdd(false); setForm({ category: 'medication', title: '', description: '', reminderTime: '08:00', targetDate: '' }); load(); Taro.showToast({ title: '提醒已创建', icon: 'success' }); }
    catch (err) { Taro.showToast({ title: err.message || '创建失败', icon: 'none' }); }
    finally { setSaving(false); }
  };

  const displayed = filterCat === '全部' ? list : list.filter(item => item.category === filterCat);

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
        <Text style={{ fontSize: '18px', fontWeight: 700, color: colors.textPrimary }}>提醒管理</Text>
        <View onClick={() => setShowAdd(true)} style={{ width: '28px', textAlign: 'center' }}><Text style={{ fontSize: '24px', color: colors.primary }}>＋</Text></View>
      </View>

      <View style={{ padding: `${spacing.lg}px` }}>
      <View style={{ whiteSpace: 'nowrap', overflowX: 'auto', marginBottom: `${spacing.md}px` }}>
        {['全部', ...CATEGORIES.map(c => c[0])].map(key => {
          const label = key === '全部' ? '全部' : CATEGORIES.find(c => c[0] === key)?.[1];
          return <Text key={key} onClick={() => setFilterCat(key)} style={{ display: 'inline-block', padding: '6px 11px', marginRight: '6px', borderRadius: `${radius.full}px`, backgroundColor: filterCat === key ? colors.primary : '#fff', color: filterCat === key ? '#fff' : colors.textMuted, fontSize: '12px' }}>{label}</Text>;
        })}
      </View>
      {loading ? (
        <Text style={{ fontSize: '13px', color: colors.textMuted }}>加载中...</Text>
      ) : displayed.length === 0 ? (
        <View style={{ textAlign: 'center', padding: `${spacing.xxl}px 0` }}>
          <Text style={{ fontSize: '13px', color: colors.textMuted }}>暂无提醒</Text>
        </View>
      ) : (
        displayed.map((r) => (
          <View key={r._id} onLongPress={() => remove(r)} style={{
            display: 'flex', alignItems: 'center', backgroundColor: '#fff', borderRadius: `${radius.md}px`,
            padding: `${spacing.md}px`, marginBottom: '10px', boxShadow: shadow.card,
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: '14px', fontWeight: 600, color: colors.textPrimary, display: 'block' }}>{r.title}</Text>
              <Text style={{ fontSize: '12px', color: colors.textMuted }}>{CATEGORIES.find(c => c[0] === r.category)?.[1] || ''} · {r.reminderTime || (r.targetDate ? new Date(r.targetDate).toLocaleDateString('zh-CN') : '')}</Text>
            </View>
            <Switch checked={r.enabled} onChange={() => toggle(r._id)} color={colors.primary} />
          </View>
        ))
      )}
      </View>
      {showAdd && <View style={{ position: 'fixed', inset: 0, zIndex: 20, backgroundColor: 'rgba(0,0,0,.42)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <View style={{ width: '100%', backgroundColor: '#fff', borderRadius: `${radius.xl}px ${radius.xl}px 0 0`, padding: `${spacing.lg}px` }}>
          <View style={{ display: 'flex', justifyContent: 'space-between', marginBottom: `${spacing.md}px` }}><Text style={{ fontSize: '17px', fontWeight: 700 }}>新建提醒</Text><Text onClick={() => setShowAdd(false)} style={{ fontSize: '22px' }}>×</Text></View>
          <Picker mode="selector" range={CATEGORIES.map(c => c[1])} value={Math.max(0, CATEGORIES.findIndex(c => c[0] === form.category))} onChange={e => setForm(p => ({ ...p, category: CATEGORIES[e.detail.value][0] }))}><View style={{ padding: '10px', border: `1px solid ${colors.border}`, borderRadius: `${radius.sm}px`, marginBottom: '10px' }}>{CATEGORIES.find(c => c[0] === form.category)?.[1]} ›</View></Picker>
          <Input value={form.title} placeholder="提醒标题" onInput={e => setForm(p => ({ ...p, title: e.detail.value }))} style={{ padding: '10px', border: `1px solid ${colors.border}`, borderRadius: `${radius.sm}px`, marginBottom: '10px' }} />
          <Input value={form.description} placeholder="备注（可选）" onInput={e => setForm(p => ({ ...p, description: e.detail.value }))} style={{ padding: '10px', border: `1px solid ${colors.border}`, borderRadius: `${radius.sm}px`, marginBottom: '10px' }} />
          {(CATEGORIES.find(c => c[0] === form.category)?.[2] === 'once') ? <Picker mode="date" value={form.targetDate} onChange={e => setForm(p => ({ ...p, targetDate: e.detail.value }))}><View style={{ padding: '10px', border: `1px solid ${colors.border}`, borderRadius: `${radius.sm}px`, marginBottom: '12px' }}>{form.targetDate || '选择提醒日期'} ›</View></Picker> : <Picker mode="time" value={form.reminderTime} onChange={e => setForm(p => ({ ...p, reminderTime: e.detail.value }))}><View style={{ padding: '10px', border: `1px solid ${colors.border}`, borderRadius: `${radius.sm}px`, marginBottom: '12px' }}>{form.reminderTime || '08:00'} ›</View></Picker>}
          <Button loading={saving} onClick={create} style={{ backgroundColor: colors.primary, color: '#fff', borderRadius: `${radius.md}px` }}>创建提醒</Button>
          <Text style={{ fontSize: '11px', color: colors.textMuted, display: 'block', textAlign: 'center', marginTop: '8px' }}>长按提醒卡片可删除</Text>
        </View>
      </View>}
    </View>
  );
}
