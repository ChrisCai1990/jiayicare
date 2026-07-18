import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Input, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../../theme';
import { familyLinksAPI } from '../../../services/api';

// 对齐 app/src/screens/profile/FamilyMembersScreen.js
const RELATIONS = ['配偶', '父亲', '母亲', '子女', '兄弟', '姐妹', '祖父', '祖母', '其他'];
const REL_ICON = { 配偶: '💑', 父亲: '👨', 母亲: '👩', 子女: '🧒', 兄弟: '👬', 姐妹: '👭' };

function AddLinkModal({ onClose, onSaved }) {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [relation, setRelation] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
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
    <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
      <View style={{ backgroundColor: '#fff', borderRadius: '24px 24px 0 0', padding: `0 ${spacing.lg}px ${spacing.xl + 16}px`, width: '100%', maxHeight: '90%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
        <View style={{ width: '36px', height: '4px', borderRadius: '2px', backgroundColor: colors.border, margin: '12px auto', flexShrink: 0 }} />
        <Text style={{ fontSize: '17px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: '4px' }}>添加家庭成员</Text>
        <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block', marginBottom: `${spacing.md}px` }}>只能添加系统内已注册的客户，搜索手机号或姓名</Text>

        {!selected ? (
          <>
            <View style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, backgroundColor: colors.background, borderRadius: `${radius.sm}px`, border: `1px solid ${colors.border}`, padding: `0 ${spacing.md}px`, marginBottom: `${spacing.sm}px`, height: '44px', boxSizing: 'border-box' }}>
              <Text style={{ fontSize: '14px' }}>🔍</Text>
              <Input
                style={{ flex: 1, fontSize: '14px', color: colors.textPrimary }}
                value={keyword}
                onInput={(e) => search(e.detail.value)}
                placeholder="输入手机号或姓名搜索..."
              />
              {searching && <Text style={{ fontSize: '11px', color: colors.textMuted }}>...</Text>}
            </View>
            <ScrollView scrollY style={{ maxHeight: '280px' }}>
              {results.length === 0 && keyword.trim().length > 0 && !searching ? (
                <Text style={{ fontSize: '13px', color: colors.textMuted, textAlign: 'center', display: 'block', padding: `${spacing.lg}px` }}>未找到匹配的已注册用户</Text>
              ) : null}
              {results.map((u) => (
                <View key={u._id} onClick={() => !u.alreadyLinked && setSelected(u)} style={{
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
          <View onClick={onClose} style={{ flex: 1, textAlign: 'center', padding: '14px', borderRadius: `${radius.md}px`, border: `1.5px solid ${colors.border}` }}>
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

function LinkCard({ link, onDelete }) {
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
      <Text onClick={onDelete} style={{ fontSize: '16px', color: colors.danger, padding: '8px' }}>🗑</Text>
    </View>
  );
}

export default function FamilyMembersPage() {
  const [links, setLinks] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [handlingInvite, setHandlingInvite] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [linkRes, invRes] = await Promise.allSettled([familyLinksAPI.list(), familyLinksAPI.pendingInvites()]);
      if (linkRes.status === 'fulfilled') setLinks(linkRes.value.data || []);
      if (invRes.status === 'fulfilled') setPendingInvites(invRes.value.data || []);
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

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background }}>
      <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${spacing.md}px ${spacing.lg}px`, backgroundColor: '#fff', borderBottom: `1px solid ${colors.border}` }}>
        <Text style={{ fontSize: '17px', fontWeight: 700, color: colors.textPrimary }}>家庭成员</Text>
        <Text onClick={() => setShowAdd(true)} style={{ fontSize: '22px', color: colors.primary }}>+</Text>
      </View>

      <View style={{ padding: `${spacing.lg}px` }}>
        <Text style={{ fontSize: '13px', color: colors.textMuted, lineHeight: '20px', display: 'block', marginBottom: `${spacing.lg}px` }}>
          只能关联系统内已注册的客户，双向建立家庭成员关系，方便后续健康基金和就医协助服务共享。
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
        ) : links.length === 0 && pendingInvites.length === 0 ? (
          <View style={{ textAlign: 'center', paddingTop: '60px' }}>
            <Text style={{ fontSize: '40px', display: 'block', marginBottom: `${spacing.sm}px` }}>👨‍👩‍👧</Text>
            <Text style={{ fontSize: '16px', fontWeight: 600, color: colors.textPrimary, display: 'block' }}>暂未关联家庭成员</Text>
            <Text style={{ fontSize: '13px', color: colors.textMuted, display: 'block', marginBottom: `${spacing.md}px` }}>点击右上角「+」搜索并关联家庭成员</Text>
            <View onClick={() => setShowAdd(true)} style={{ display: 'inline-block', backgroundColor: colors.primary, padding: '12px 32px', borderRadius: `${radius.full}px` }}>
              <Text style={{ color: '#fff', fontWeight: 700, fontSize: '14px' }}>立即添加</Text>
            </View>
          </View>
        ) : links.length > 0 ? (
          <>
            <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block', marginBottom: `${spacing.sm}px` }}>共 {links.length} 位家庭成员</Text>
            {links.map((link) => (
              <LinkCard key={link._id} link={link} onDelete={() => handleDelete(link)} />
            ))}
          </>
        ) : null}
      </View>

      {showAdd && <AddLinkModal onClose={() => setShowAdd(false)} onSaved={load} />}
    </View>
  );
}
