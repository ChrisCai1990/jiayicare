import React, { useState, useCallback } from 'react';
import { View, Text, Input, Picker, Button } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../theme';
import { medicationsAPI } from '../../services/api';
import useNavBar from '../../hooks/useNavBar';
import Icon from '../../components/Icon';

const EMPTY_FORM = { name: '', brandName: '', dosage: '', method: '口服', frequency: '每日1次', timing: '餐后', note: '' };
const METHODS = ['口服', '外用', '吸入', '注射', '其他'];
const FREQUENCIES = ['每日1次', '每日2次', '每日3次', '按需使用', '其他'];
const TIMINGS = ['餐前', '餐后', '晨起', '睡前', '其他'];

export default function MedicationPage() {
  const { statusBarHeight } = useNavBar();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('active');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(() => {
    setLoading(true);
    medicationsAPI.list().then((res) => { if (res.success) setList(res.data || []); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  useDidShow(() => { load(); });

  const checkin = async (id) => {
    try {
      await medicationsAPI.checkin(id);
      Taro.showToast({ title: '打卡成功', icon: 'success' });
      load();
    } catch (err) {
      Taro.showToast({ title: err.message || '打卡失败', icon: 'none' });
    }
  };

  const stop = async (med) => {
    const result = await Taro.showModal({ title: '确认停用', content: `仅记录“${med.name || med.chemicalName}”已停止使用，不代表平台建议停药。是否继续？` });
    if (!result.confirm) return;
    try {
      await medicationsAPI.stop(med._id, { stopDate: new Date().toISOString().slice(0, 10) });
      Taro.showToast({ title: '已记录停用', icon: 'success' });
      load();
    } catch (err) { Taro.showToast({ title: err.message || '操作失败', icon: 'none' }); }
  };

  const add = async () => {
    if (!form.name.trim() || !form.dosage.trim() || !form.frequency) {
      Taro.showToast({ title: '请填写通用名、剂量和使用频次', icon: 'none' }); return;
    }
    setSaving(true);
    try {
      const res = await medicationsAPI.create({ ...form, startDate: new Date().toISOString().slice(0, 10) });
      if (!res.success) throw new Error(res.message || '添加失败');
      setForm(EMPTY_FORM); setShowAdd(false); load();
      Taro.showToast({ title: '用药记录已添加', icon: 'success' });
    } catch (err) { Taro.showToast({ title: err.message || '添加失败', icon: 'none' }); }
    finally { setSaving(false); }
  };

  const activeList = list.filter(m => !m.stopped && m.active !== false);
  const stoppedList = list.filter(m => m.stopped || m.active === false);
  const displayed = tab === 'active' ? activeList : stoppedList;

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
        <Text style={{ fontSize: '18px', fontWeight: 700, color: colors.textPrimary }}>用药管理</Text>
        <View onClick={() => setShowAdd(true)} style={{ width: '28px', textAlign: 'center' }}><Text style={{ fontSize: '24px', color: colors.primary }}>＋</Text></View>
      </View>

      <View style={{ padding: `${spacing.lg}px` }}>
      <View style={{ display: 'flex', marginBottom: `${spacing.md}px`, backgroundColor: '#fff', borderRadius: `${radius.full}px`, padding: '4px' }}>
        {[['active', `进行中 (${activeList.length})`], ['stopped', `已停用 (${stoppedList.length})`]].map(([key, label]) => (
          <View key={key} onClick={() => setTab(key)} style={{ flex: 1, textAlign: 'center', padding: '8px', borderRadius: `${radius.full}px`, backgroundColor: tab === key ? colors.primary : 'transparent' }}>
            <Text style={{ fontSize: '13px', fontWeight: 700, color: tab === key ? '#fff' : colors.textMuted }}>{label}</Text>
          </View>
        ))}
      </View>
      {loading ? (
        <Text style={{ fontSize: '13px', color: colors.textMuted }}>加载中...</Text>
      ) : displayed.length === 0 ? (
        <View style={{ textAlign: 'center', padding: `${spacing.xxl}px 0` }}>
          <Text style={{ fontSize: '13px', color: colors.textMuted }}>暂无用药记录</Text>
        </View>
      ) : (
        displayed.map((med) => (
          <View key={med._id} style={{
            backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: '10px', boxShadow: shadow.card,
          }}>
            <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary, display: 'block' }}>{med.name || med.chemicalName}</Text>
                <Text style={{ fontSize: '12px', color: colors.textMuted }}>{med.dosage || med.dose} · {med.frequency}</Text>
              </View>
              {tab === 'active' && <View style={{ display: 'flex', gap: '6px' }}>
                <View onClick={() => checkin(med._id)} style={{ padding: '8px 12px', backgroundColor: colors.primary10, borderRadius: `${radius.full}px` }}><Text style={{ fontSize: '12px', color: colors.primary, fontWeight: 700 }}>标记服药</Text></View>
                <View onClick={() => stop(med)} style={{ padding: '8px 12px', backgroundColor: '#FEF2F2', borderRadius: `${radius.full}px` }}><Text style={{ fontSize: '12px', color: colors.danger, fontWeight: 700 }}>停用</Text></View>
              </View>}
            </View>
          </View>
        ))
      )}
      </View>

      {showAdd && <View style={{ position: 'fixed', inset: 0, zIndex: 20, backgroundColor: 'rgba(0,0,0,.42)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <View style={{ width: '100%', maxHeight: '86vh', overflowY: 'auto', backgroundColor: '#fff', borderRadius: `${radius.xl}px ${radius.xl}px 0 0`, padding: `${spacing.lg}px` }}>
          <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: `${spacing.md}px` }}><Text style={{ fontSize: '17px', fontWeight: 700 }}>添加用药记录</Text><Text onClick={() => setShowAdd(false)} style={{ fontSize: '22px', color: colors.textMuted }}>×</Text></View>
          {[['name','化学名/通用名 *','如：苯磺酸氨氯地平'],['brandName','商品名（可选）','如：络活喜'],['dosage','剂量 *','如：5mg、1片'],['note','备注','仅记录已有医嘱或本人陈述']].map(([key,label,placeholder]) => <View key={key} style={{ marginBottom: '12px' }}><Text style={{ fontSize: '12px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>{label}</Text><Input value={form[key]} placeholder={placeholder} onInput={e => setForm(p => ({ ...p, [key]: e.detail.value }))} style={{ padding: '10px 12px', border: `1px solid ${colors.border}`, borderRadius: `${radius.sm}px` }} /></View>)}
          {[[METHODS,'method','使用方法'],[FREQUENCIES,'frequency','使用频次 *'],[TIMINGS,'timing','使用时间']].map(([options,key,label]) => <View key={key} style={{ marginBottom: '12px' }}><Text style={{ fontSize: '12px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>{label}</Text><Picker mode="selector" range={options} value={Math.max(0, options.indexOf(form[key]))} onChange={e => setForm(p => ({ ...p, [key]: options[e.detail.value] }))}><View style={{ padding: '10px 12px', border: `1px solid ${colors.border}`, borderRadius: `${radius.sm}px` }}>{form[key]} ›</View></Picker></View>)}
          <Text style={{ fontSize: '11px', color: colors.textMuted, lineHeight: '17px', display: 'block', marginBottom: '12px' }}>本功能仅记录您依据处方、医嘱、产品标签或本人陈述提供的信息，不代表平台开药或调整用药。</Text>
          <Button loading={saving} onClick={add} style={{ backgroundColor: colors.primary, color: '#fff', borderRadius: `${radius.md}px` }}>保存记录</Button>
        </View>
      </View>}
    </View>
  );
}
