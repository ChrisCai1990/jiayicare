import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Input, ScrollView, Picker } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../../theme';
import { familyLinksAPI, guardianChildrenAPI } from '../../../services/api';
import useNavBar from '../../../hooks/useNavBar';
import Icon from '../../../components/Icon';

// 对齐 app/src/screens/profile/FamilyMembersScreen.js
const RELATIONS = ['配偶', '父亲', '母亲', '子女', '兄弟', '姐妹', '祖父', '祖母', '其他'];
const REL_ICON = { 配偶: '💑', 父亲: '👨', 母亲: '👩', 子女: '🧒', 兄弟: '👬', 姐妹: '👭' };

function AddLinkModal({ onClose, onSaved, onInviteNew }) {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [relation, setRelation] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const timer = useRef(null);

  const search = (kw) => {
    setKeyword(kw);
    clearTimeout(timer.current);
    if (!kw.trim()) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await familyLinksAPI.search(kw);
        setResults(res.data || []);
      } catch { setResults([]); } finally { setSearching(false); }
    }, 400);
  };

  const confirm = async () => {
    if (!selected) { setErr('请先选择一位家庭成员'); return; }
    setSaving(true); setErr('');
    try {
      await familyLinksAPI.add(selected._id, relation);
      onSaved();
      onClose();
    } catch (e) {
      setErr(e.message || '添加失败');
    } finally { setSaving(false); }
  };

  return (
    <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: `${keyboardHeight}px`, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
      <View style={{ backgroundColor: '#fff', borderRadius: '24px 24px 0 0', padding: `0 ${spacing.lg}px ${keyboardHeight ? spacing.md : spacing.xl + 16}px`, width: '100%', maxHeight: keyboardHeight ? `calc(100vh - ${keyboardHeight}px - 8px)` : '90vh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
        <View style={{ width: '36px', height: '4px', borderRadius: '2px', backgroundColor: colors.border, margin: '12px auto', flexShrink: 0 }} />
        <Text style={{ fontSize: '17px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: '4px' }}>添加家庭成员</Text>
        <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block', marginBottom: `${spacing.md}px` }}>只能添加系统内已注册的客户，搜索手机号或姓名</Text>

        {!selected ? (
          <>
            <View style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, backgroundColor: colors.background, borderRadius: `${radius.sm}px`, border: `1px solid ${colors.border}`, padding: `0 ${spacing.md}px`, marginBottom: `${spacing.sm}px`, height: '44px', boxSizing: 'border-box' }}>
              <Text style={{ fontSize: '14px' }}>🔍</Text>
              <Input
                style={{ flex: 1, height: '44px', lineHeight: '44px', fontSize: '16px', color: colors.textPrimary }}
                value={keyword}
                onInput={(e) => search(e.detail.value)}
                adjustPosition={false}
                onKeyboardHeightChange={(e) => setKeyboardHeight(Math.max(0, e.detail.height || 0))}
                placeholder="输入手机号或姓名搜索..."
              />
              {searching && <Text style={{ fontSize: '11px', color: colors.textMuted }}>...</Text>}
            </View>
            <ScrollView scrollY style={{ maxHeight: keyboardHeight ? '140px' : '280px', flexShrink: 1 }}>
              {results.length === 0 && keyword.trim().length > 0 && !searching ? (
                <Text style={{ fontSize: '13px', color: colors.textMuted, textAlign: 'center', display: 'block', padding: `${spacing.lg}px` }}>未找到匹配的已注册用户</Text>
              ) : null}
              {results.map((u) => (
                <View key={u._id} onClick={() => { if (!u.alreadyLinked) { Taro.hideKeyboard().catch(() => {}); setSelected(u); } }} style={{
                  display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, padding: '12px 0',
                  borderBottom: `1px solid ${colors.borderLight}`, opacity: u.alreadyLinked ? 0.4 : 1,
                }}>
                  <View style={{ width: '40px', height: '40px', borderRadius: '20px', backgroundColor: colors.primary10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Text style={{ fontSize: '18px' }}>👤</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: '14px', fontWeight: 600, color: colors.textPrimary, display: 'block' }}>{u.name}</Text>
                    <Text style={{ fontSize: '12px', color: colors.textMuted }}>{u.phone}{u.age ? `  ${u.age}岁` : ''}{u.gender ? `  ${u.gender}` : ''}</Text>
                  </View>
                  <Text style={{ fontSize: '12px', color: u.alreadyLinked ? colors.textMuted : colors.primary }}>{u.alreadyLinked ? '已关联' : '›'}</Text>
                </View>
              ))}
            </ScrollView>
            <View onClick={onInviteNew} style={{ padding: '10px 0', flexShrink: 0 }}>
              <Text style={{ fontSize: '13px', color: colors.primary }}>对方还未注册？邀请本人建档 ›</Text>
            </View>
          </>
        ) : (
          <>
            <View style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, backgroundColor: '#E8F5EF', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.md}px` }}>
              <View style={{ width: '40px', height: '40px', borderRadius: '20px', backgroundColor: colors.primary10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Text style={{ fontSize: '20px' }}>👤</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: '14px', fontWeight: 600, color: colors.textPrimary, display: 'block' }}>{selected.name}</Text>
                <Text style={{ fontSize: '12px', color: colors.textMuted }}>{selected.phone}</Text>
              </View>
              <Text onClick={() => { setSelected(null); setRelation(''); }} style={{ fontSize: '16px', color: colors.textMuted }}>✕</Text>
            </View>
            <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textSecondary, display: 'block', marginBottom: '8px' }}>与您的关系</Text>
            <ScrollView scrollX style={{ whiteSpace: 'nowrap', marginBottom: `${spacing.lg}px` }}>
              {RELATIONS.map((r) => (
                <View key={r} onClick={() => setRelation(r)} style={{
                  display: 'inline-block', padding: '8px 14px', borderRadius: `${radius.full}px`, marginRight: '8px',
                  border: `1.5px solid ${relation === r ? colors.primary : colors.border}`, backgroundColor: relation === r ? colors.primary : '#fff',
                }}>
                  <Text style={{ fontSize: '13px', color: relation === r ? '#fff' : colors.textSecondary, fontWeight: relation === r ? 700 : 400 }}>{r}</Text>
                </View>
              ))}
            </ScrollView>
            {!!err && <Text style={{ fontSize: '13px', color: colors.danger, textAlign: 'center', display: 'block', marginBottom: `${spacing.sm}px` }}>{err}</Text>}
          </>
        )}

        <View style={{ display: 'flex', gap: `${spacing.sm}px`, paddingTop: `${spacing.md}px` }}>
          <View onClick={() => { Taro.hideKeyboard().catch(() => {}); onClose(); }} style={{ flex: 1, textAlign: 'center', padding: '14px', borderRadius: `${radius.md}px`, border: `1.5px solid ${colors.border}` }}>
            <Text style={{ fontSize: '15px', color: colors.textSecondary, fontWeight: 600 }}>取消</Text>
          </View>
          {selected && (
            <View onClick={saving ? undefined : confirm} style={{ flex: 2, textAlign: 'center', padding: '14px', borderRadius: `${radius.md}px`, backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }}>
              <Text style={{ fontSize: '15px', color: '#fff', fontWeight: 700 }}>{saving ? '提交中...' : '发送邀请'}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

function AddChildModal({ onClose, onSaved, onQuestionnaire }) {
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState('未知');
  const [relation, setRelation] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inputStyle = { display: 'block', width: '100%', height: '52px', boxSizing: 'border-box',
    border: `1px solid ${colors.border}`, borderRadius: '8px', padding: '0 14px',
    fontSize: '16px', lineHeight: '52px', color: colors.textPrimary, marginBottom: '12px' };
  const save = async () => {
    if (!name.trim() || !birthDate || !relation || !consent) { setError('请填写基础信息并确认监护关系'); return; }
    const birthday = new Date(`${birthDate}T00:00:00`);
    const eighteenthBirthday = new Date(birthday.getFullYear() + 18, birthday.getMonth(), birthday.getDate());
    if (Number.isNaN(birthday.getTime()) || eighteenthBirthday <= new Date()) {
      setError('该入口仅支持未满18周岁的孩子，请核对出生日期；成年人需由本人建档'); return;
    }
    setSaving(true); setError('');
    try {
      const result = await guardianChildrenAPI.create({ name: name.trim(), birthDate, gender, relation,
        idNumber: idNumber.trim(), guardianConsent: true });
      onSaved(); onClose();
      Taro.showModal({ title: '孩子档案已建立', content: '现在填写儿童健康问卷吗？也可以稍后从孩子的档案卡片进入。',
        confirmText: '现在填写', cancelText: '稍后填写',
        success: ({ confirm }) => { if (confirm) onQuestionnaire(result.data.id); } });
    } catch (e) { setError(e.message || '建档失败'); }
    finally { setSaving(false); }
  };
  return <View style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,.4)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
    <ScrollView scrollY style={{ backgroundColor: '#fff', borderRadius: '24px 24px 0 0', padding: `${spacing.lg}px`, width: '100%', maxHeight: '86vh', boxSizing: 'border-box' }}>
      <Text style={{ fontSize: '18px', fontWeight: 700, display: 'block', marginBottom: '8px' }}>为未成年人建档</Text>
      <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block', marginBottom: '16px' }}>仅建立孩子的基础档案，健康问卷可以稍后填写。若孩子已有档案，请联系医护人员核实关联。</Text>
      <Text style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>孩子姓名</Text>
      <Input placeholder="请输入孩子姓名" value={name} onInput={e => { setName(e.detail.value); setError(''); }} style={inputStyle} />
      <Text style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>出生日期</Text>
      <Picker mode="date" end={new Date().toISOString().slice(0, 10)} onChange={e => { setBirthDate(e.detail.value); setError(''); }}><View style={{ border: `1px solid ${colors.border}`, padding: '12px', marginBottom: '10px', borderRadius: '8px', color: birthDate ? colors.textPrimary : colors.textMuted }}>{birthDate || '选择出生日期'}</View></Picker>
      <Text style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>性别</Text>
      <View style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>{['男', '女', '未知'].map(item => <View key={item} onClick={() => setGender(item)} style={{ padding: '8px 16px', border: `1px solid ${gender === item ? colors.primary : colors.border}`, borderRadius: '8px', color: gender === item ? colors.primary : colors.textMuted }}>{item}</View>)}</View>
      <Text style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>与孩子的关系</Text>
      <View style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>{['父亲', '母亲', '其他监护人'].map(item => <View key={item} onClick={() => setRelation(item)} style={{ padding: '8px 12px', border: `1px solid ${relation === item ? colors.primary : colors.border}`, borderRadius: '8px', color: relation === item ? colors.primary : colors.textMuted }}>{item}</View>)}</View>
      <Text style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>孩子身份证号（选填）</Text>
      <Input placeholder="请输入孩子身份证号" value={idNumber} onInput={e => { setIdNumber(e.detail.value); setError(''); }} style={inputStyle} />
      <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block', marginBottom: '12px' }}>已有档案请联系医护人员核实关联</Text>
      <View onClick={() => setConsent(!consent)} style={{ padding: '8px 0', marginBottom: '12px' }}><Text style={{ color: consent ? colors.primary : colors.textMuted }}>{consent ? '☑' : '□'} 我是孩子的监护人，同意为其建立健康档案并录入健康信息</Text></View>
      {!!error && <Text style={{ color: colors.danger, display: 'block', marginBottom: '8px' }}>{error}</Text>}
      <View style={{ display: 'flex', gap: '10px', paddingBottom: '20px' }}><View onClick={onClose} style={{ flex: 1, padding: '13px', textAlign: 'center', border: `1px solid ${colors.border}`, borderRadius: '8px' }}>取消</View><View onClick={saving ? undefined : save} style={{ flex: 2, padding: '13px', textAlign: 'center', borderRadius: '8px', backgroundColor: colors.primary, color: '#fff' }}>{saving ? '保存中…' : '建立孩子档案'}</View></View>
    </ScrollView>
  </View>;
}

function FamilyServiceModal({ data, onClose }) {
  const appointments = data?.appointments || [];
  const dateText = (value) => value ? new Date(value).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' }) : '待安排';
  return (
    <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
      <ScrollView scrollY style={{ backgroundColor: '#fff', borderRadius: '24px 24px 0 0', padding: `${spacing.lg}px ${spacing.lg}px ${spacing.xl + 12}px`, width: '100%', maxHeight: '80vh', boxSizing: 'border-box' }}>
        <Text style={{ fontSize: '17px', fontWeight: 700, color: colors.textPrimary, display: 'block' }}>{data.member.name}的服务安排</Text>
        <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block', marginTop: '4px' }}>仅展示服务进度与预约安排，不展示健康档案和医疗资料</Text>
        <View style={{ backgroundColor: colors.primary10, borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginTop: `${spacing.lg}px` }}>
          <Text style={{ fontSize: '13px', color: colors.textSecondary, display: 'block' }}>进行中的服务</Text>
          <Text style={{ fontSize: '22px', fontWeight: 700, color: colors.primary, marginTop: '2px' }}>{data.service.activeCount} 项</Text>
          {!!data.service.latestServiceName && <Text style={{ fontSize: '12px', color: colors.textSecondary, display: 'block', marginTop: '4px' }}>{data.service.latestServiceName}{data.service.latestStatus ? ` · ${data.service.latestStatus}` : ''}</Text>}
        </View>
        <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginTop: `${spacing.lg}px`, marginBottom: `${spacing.sm}px` }}>服务时间安排（最近5项）</Text>
        {appointments.length ? appointments.map((item, index) => (
          <View key={`${item.serviceName}-${index}`} style={{ display: 'flex', alignItems: 'center', padding: '11px 0', borderBottom: index === appointments.length - 1 ? 'none' : `1px solid ${colors.borderLight}` }}>
            <View style={{ flex: 1 }}><Text style={{ fontSize: '14px', color: colors.textPrimary, display: 'block' }}>{item.serviceName}</Text><Text style={{ fontSize: '12px', color: colors.textMuted }}>{item.status || '等待安排'}</Text></View>
            <View><Text style={{ fontSize: '13px', color: colors.primary, fontWeight: 600 }}>{dateText(item.scheduledAt || item.desiredServiceDate)}</Text><Text style={{display:'block',fontSize:'11px',color:colors.textMuted}}>{item.dateLabel || '待确认'}</Text></View>
          </View>
        )) : <Text style={{ fontSize: '13px', color: colors.textMuted, display: 'block', padding: '12px 0' }}>暂无预约安排</Text>}
        <View onClick={onClose} style={{ textAlign: 'center', padding: '14px', borderRadius: `${radius.md}px`, backgroundColor: colors.primary, marginTop: `${spacing.md}px` }}><Text style={{ color: '#fff', fontSize: '15px', fontWeight: 700 }}>知道了</Text></View>
      </ScrollView>
    </View>
  );
}

function LinkCard({ link, onDelete, onView }) {
  const u = link.user;
  const icon = REL_ICON[link.relation] || '👤';
  return (
    <View style={{ display: 'flex', alignItems: 'center', gap: `${spacing.md}px`, backgroundColor: '#fff', borderRadius: `${radius.lg}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.sm}px`, boxShadow: shadow.xs }}>
      <View style={{ width: '48px', height: '48px', borderRadius: `${radius.md}px`, backgroundColor: colors.primary10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Text style={{ fontSize: '22px' }}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Text style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary }}>{u.name}</Text>
          <Text style={{ fontSize: '11px', color: colors.primary, backgroundColor: colors.primary10, padding: '2px 7px', borderRadius: `${radius.full}px` }}>{link.relation || '家人'}</Text>
          {!!u.gender && <Text style={{ fontSize: '12px', color: colors.textMuted }}>{u.gender}</Text>}
        </View>
        <Text style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginTop: '2px' }}>{u.phone}</Text>
        {!!u.age && <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block' }}>{u.age} 岁</Text>}
        <Text style={{ fontSize: '11px', color: colors.success }}>已注册用户</Text>
      </View>
      <View style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
        <Text onClick={onView} style={{ fontSize: '12px', color: colors.primary, padding: '6px' }}>查看服务</Text>
        <Text onClick={onDelete} style={{ fontSize: '15px', color: colors.danger, padding: '6px' }}>🗑</Text>
      </View>
    </View>
  );
}

export default function FamilyMembersPage() {
  const { statusBarHeight } = useNavBar();
  const [links, setLinks] = useState([]);
  const [children, setChildren] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState('');
  const [handlingInvite, setHandlingInvite] = useState(null);
  const [serviceOverview, setServiceOverview] = useState(null);
  const [childArchive, setChildArchive] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [linkRes, invRes, childRes] = await Promise.allSettled([familyLinksAPI.list(), familyLinksAPI.pendingInvites(), guardianChildrenAPI.list()]);
      if (linkRes.status === 'fulfilled') setLinks(linkRes.value.data || []);
      if (invRes.status === 'fulfilled') setPendingInvites(invRes.value.data || []);
      if (childRes.status === 'fulfilled') setChildren(childRes.value.data || []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAcceptInvite = async (inviteId) => {
    setHandlingInvite(inviteId);
    try { await familyLinksAPI.acceptInvite(inviteId); load(); }
    catch (e) { Taro.showToast({ title: e.message || '操作失败', icon: 'none' }); }
    finally { setHandlingInvite(null); }
  };

  const handleRejectInvite = (inviteId) => {
    Taro.showModal({
      title: '拒绝邀请', content: '确定拒绝此家庭成员邀请？',
      success: async (res) => {
        if (!res.confirm) return;
        setHandlingInvite(inviteId);
        try { await familyLinksAPI.rejectInvite(inviteId); load(); }
        catch (e) { Taro.showToast({ title: e.message || '操作失败', icon: 'none' }); }
        finally { setHandlingInvite(null); }
      },
    });
  };

  const handleDelete = (link) => {
    Taro.showModal({
      title: '解除关联', content: `确定解除与「${link.user.name}」的家庭成员关系？`,
      success: async (res) => {
        if (!res.confirm) return;
        try { await familyLinksAPI.remove(link._id); load(); }
        catch (e) { Taro.showToast({ title: e.message || '操作失败', icon: 'none' }); }
      },
    });
  };

  const handleViewService = async (link) => {
    try {
      const res = await familyLinksAPI.serviceOverview(link.user._id);
      if (res.success) setServiceOverview(res.data);
    } catch (e) {
      Taro.showToast({ title: e.message || '服务信息加载失败', icon: 'none' });
    }
  };

  const openChildQuestionnaire = async (childId) => {
    try {
      const result = await guardianChildrenAPI.startQuestionnaire(childId);
      if (result.data?.pushStatus === 'answered_stage') { Taro.showToast({ title: '当前年龄段问卷已填写', icon: 'none' }); return; }
      Taro.navigateTo({ url: `/pages/questionnaire/index?childId=${encodeURIComponent(childId)}` });
    } catch (e) { Taro.showToast({ title: e.message || '儿童问卷暂不可用', icon: 'none' }); }
  };
  const openChildArchive = async (childId) => {
    try { const result = await guardianChildrenAPI.archive(childId); setChildArchive(result.data); }
    catch (e) { Taro.showToast({ title: e.message || '档案加载失败', icon: 'none' }); }
  };

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background }}>
      <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${statusBarHeight + 8}px ${spacing.lg}px ${spacing.md}px`, backgroundColor: '#fff', borderBottom: `1px solid ${colors.border}` }}>
        <View onClick={() => Taro.navigateBack()} style={{ padding: '4px' }}>
          <Icon name="chevron-left" size={20} color={colors.textPrimary} />
        </View>
        <Text style={{ fontSize: '17px', fontWeight: 700, color: colors.textPrimary }}>家庭成员</Text>
        <Text onClick={() => setShowAdd('choice')} style={{ fontSize: '22px', color: colors.primary, padding: '4px' }}>+</Text>
      </View>

      <View style={{ padding: `${spacing.lg}px` }}>
        <Text style={{ fontSize: '13px', color: colors.textMuted, lineHeight: '20px', display: 'block', marginBottom: `${spacing.lg}px` }}>
          可为未成年孩子建立独立健康档案；添加成年家人需由本人接受邀请。健康问卷可以稍后填写。
        </Text>

        {pendingInvites.length > 0 && (
          <View style={{ marginBottom: `${spacing.lg}px` }}>
            <Text style={{ fontSize: '12px', color: colors.warning, fontWeight: 700, display: 'block', marginBottom: `${spacing.sm}px` }}>待确认邀请（{pendingInvites.length}）</Text>
            {pendingInvites.map((inv) => (
              <View key={inv._id} style={{ display: 'flex', alignItems: 'center', gap: `${spacing.md}px`, backgroundColor: '#fff', borderRadius: `${radius.lg}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.sm}px`, borderLeft: `3px solid ${colors.warning}`, boxShadow: shadow.xs }}>
                <View style={{ width: '44px', height: '44px', borderRadius: `${radius.md}px`, backgroundColor: colors.warning10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Text style={{ fontSize: '20px' }}>✉️</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary, display: 'block' }}>{inv.fromName}</Text>
                  {!!inv.relation && <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block' }}>邀请关系：{inv.relation}</Text>}
                  <Text style={{ fontSize: '11px', color: colors.warning }}>待您确认</Text>
                </View>
                <View style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <View onClick={() => handleAcceptInvite(inv._id)} style={{ backgroundColor: colors.success, borderRadius: `${radius.xs}px`, padding: '6px 12px', textAlign: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: 700, fontSize: '12px' }}>{handlingInvite === inv._id ? '...' : '接受'}</Text>
                  </View>
                  <View onClick={() => handleRejectInvite(inv._id)} style={{ border: `1px solid ${colors.danger}`, borderRadius: `${radius.xs}px`, padding: '6px 12px', textAlign: 'center' }}>
                    <Text style={{ color: colors.danger, fontWeight: 600, fontSize: '12px' }}>拒绝</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {loading ? (
          <Text style={{ fontSize: '13px', color: colors.textMuted }}>加载中...</Text>
        ) : links.length === 0 && children.length === 0 && pendingInvites.length === 0 ? (
          <View style={{ textAlign: 'center', paddingTop: '60px' }}>
            <Text style={{ fontSize: '40px', display: 'block', marginBottom: `${spacing.sm}px` }}>👨‍👩‍👧</Text>
            <Text style={{ fontSize: '16px', fontWeight: 600, color: colors.textPrimary, display: 'block' }}>暂未关联家庭成员</Text>
            <Text style={{ fontSize: '13px', color: colors.textMuted, display: 'block', marginBottom: `${spacing.md}px` }}>添加孩子档案，或邀请成年家人本人建档后关联</Text>
            <View onClick={() => setShowAdd('choice')} style={{ display: 'inline-block', backgroundColor: colors.primary, padding: '12px 32px', borderRadius: `${radius.full}px` }}>
              <Text style={{ color: '#fff', fontWeight: 700, fontSize: '14px' }}>立即添加</Text>
            </View>
          </View>
        ) : children.length > 0 || links.length > 0 ? (
          <>
            {!!children.length && <><Text style={{ fontSize: '12px', color: colors.primary, fontWeight: 700, display: 'block', marginBottom: `${spacing.sm}px` }}>我的孩子（{children.length}）</Text>{children.map(child => <View key={child.id} style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.sm}px` }}><Text style={{ fontSize: '15px', fontWeight: 700, display: 'block' }}>{child.name} · {child.relation}</Text><Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block', marginTop: '4px' }}>{child.birthDate} · {child.ageStage?.label || '年龄待核实'}</Text><View style={{ display: 'flex', gap: '12px', marginTop: '10px' }}><View onClick={() => openChildArchive(child.id)} style={{ padding: '9px 12px', borderRadius: '8px', backgroundColor: colors.primary10 }}><Text style={{ color: colors.primary, fontSize: '13px' }}>查看孩子档案</Text></View><View onClick={() => openChildQuestionnaire(child.id)} style={{ padding: '9px 12px', borderRadius: '8px', backgroundColor: colors.primary10 }}><Text style={{ color: colors.primary, fontSize: '13px' }}>填写问卷</Text></View></View></View>)}</>}
            {!!links.length && <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block', marginBottom: `${spacing.sm}px` }}>已关联家人（{links.length}）</Text>}
            {links.map((link) => (
              <LinkCard key={link._id} link={link} onDelete={() => handleDelete(link)} onView={() => handleViewService(link)} />
            ))}
          </>
        ) : null}
      </View>

      {showAdd === 'choice' && <View style={{ position: 'fixed', inset: 0, zIndex: 100, backgroundColor: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'flex-end' }}><View style={{ width: '100%', backgroundColor: '#fff', borderRadius: '24px 24px 0 0', padding: `${spacing.lg}px`, boxSizing: 'border-box' }}><Text style={{ fontSize: '18px', fontWeight: 700, display: 'block', marginBottom: '12px' }}>添加家庭成员</Text><View onClick={() => setShowAdd('child')} style={{ padding: '15px', borderRadius: '8px', backgroundColor: colors.primary10, marginBottom: '10px' }}>为未成年孩子建档</View><View onClick={() => setShowAdd('adult')} style={{ padding: '15px', borderRadius: '8px', backgroundColor: colors.background, marginBottom: '10px' }}>邀请成年家人（需本人确认）</View><View onClick={() => setShowAdd('')} style={{ padding: '13px', textAlign: 'center' }}>取消</View></View></View>}
      {showAdd === 'adult' && <AddLinkModal onClose={() => setShowAdd('')} onSaved={load} onInviteNew={() => { Taro.hideKeyboard().catch(() => {}); setShowAdd(''); Taro.navigateTo({ url: '/pages/profile/invite/index?from=family' }); }} />}
      {showAdd === 'child' && <AddChildModal onClose={() => setShowAdd('')} onSaved={load} onQuestionnaire={openChildQuestionnaire} />}
      {!!childArchive && <View style={{ position: 'fixed', inset: 0, zIndex: 110, backgroundColor: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'flex-end' }}><ScrollView scrollY style={{ backgroundColor: '#fff', borderRadius: '24px 24px 0 0', padding: `${spacing.lg}px`, width: '100%', maxHeight: '82vh', boxSizing: 'border-box' }}><Text style={{ fontSize: '18px', fontWeight: 700, display: 'block' }}>{childArchive.name}的健康档案</Text><Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block', margin: '6px 0 12px' }}>{childArchive.birthDate} · {childArchive.ageStage?.label || '年龄待核实'} · 监护人自报资料须经医护核实</Text>{childArchive.pendingReviewCount > 0 && <Text style={{ color: colors.warning, display: 'block', marginBottom: '10px' }}>{childArchive.pendingReviewCount} 份问卷待医护核实</Text>}{[['birthWeight','出生体重（克）'],['birthLength','出生身长（厘米）'],['reportedHeightCm','最近身高/身长（厘米）'],['reportedWeightKg','最近体重（千克）'],['reportedMeasuredAt','测量日期'],['feeding','喂养与饮食'],['sleep','睡眠'],['development','生长发育与行为'],['caregiverConcerns','监护人关注问题']].map(([key,label]) => <View key={key} style={{ borderBottom: `1px solid ${colors.borderLight}`, padding: '9px 0' }}><Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block' }}>{label}{childArchive.pendingPaths?.includes(`childProfile.${key}`) ? ' · 待核实' : ''}</Text><Text style={{ fontSize: '14px', display: 'block', marginTop: '3px' }}>{childArchive.childProfile?.[key] ?? '未记录'}</Text></View>)}<View onClick={() => setChildArchive(null)} style={{ textAlign: 'center', padding: '14px', backgroundColor: colors.primary, color: '#fff', borderRadius: '8px', margin: '16px 0' }}>关闭</View></ScrollView></View>}
      {serviceOverview && <FamilyServiceModal data={serviceOverview} onClose={() => setServiceOverview(null)} />}
    </View>
  );
}
