import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, Modal, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { familyLinksAPI, guardianChildrenAPI } from '../../services/api';

const RELATIONS = ['配偶', '父亲', '母亲', '子女', '兄弟', '姐妹', '祖父', '祖母', '其他'];

function AddLinkModal({ onClose, onSaved }) {
  const [keyword, setKeyword]     = useState('');
  const [results, setResults]     = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected]   = useState(null);
  const [relation, setRelation]   = useState('');
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState('');
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
      } catch { setResults([]); }
      finally { setSearching(false); }
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
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>添加家庭成员</Text>
          <Text style={styles.sheetDesc}>只能添加系统内已注册的客户，搜索手机号或姓名</Text>

          {!selected ? (
            <>
              <View style={styles.searchBox}>
                <Ionicons name="search-outline" size={16} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  value={keyword}
                  onChangeText={search}
                  placeholder="输入手机号或姓名搜索..."
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                />
                {searching && <ActivityIndicator size="small" color={colors.primary} />}
              </View>
              <ScrollView style={{ maxHeight: 280 }}>
                {results.length === 0 && keyword.trim().length > 0 && !searching ? (
                  <Text style={styles.emptySearch}>未找到匹配的已注册用户</Text>
                ) : null}
                {results.map(u => (
                  <TouchableOpacity
                    key={u._id}
                    style={[styles.resultRow, u.alreadyLinked && { opacity: 0.4 }]}
                    onPress={() => !u.alreadyLinked && setSelected(u)}
                    disabled={u.alreadyLinked}
                  >
                    <View style={styles.resultAvatar}>
                      <Ionicons name="person" size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultName}>{u.name}</Text>
                      <Text style={styles.resultMeta}>{u.phone}{u.age ? `  ${u.age}岁` : ''}{u.gender ? `  ${u.gender}` : ''}</Text>
                    </View>
                    {u.alreadyLinked
                      ? <Text style={{ fontSize: 12, color: colors.textMuted }}>已关联</Text>
                      : <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                    }
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          ) : (
            <>
              <View style={styles.selectedBox}>
                <View style={styles.resultAvatar}>
                  <Ionicons name="person-circle" size={28} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultName}>{selected.name}</Text>
                  <Text style={styles.resultMeta}>{selected.phone}</Text>
                </View>
                <TouchableOpacity onPress={() => { setSelected(null); setRelation(''); }}>
                  <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>与您的关系</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.lg }}>
                {RELATIONS.map(r => (
                  <TouchableOpacity key={r} onPress={() => setRelation(r)}
                    style={[styles.relChip, relation === r && styles.relChipActive]}>
                    <Text style={[styles.relChipText, relation === r && styles.relChipTextActive]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {!!err && <Text style={styles.errText}>{err}</Text>}
            </>
          )}

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>取消</Text>
            </TouchableOpacity>
            {selected && (
              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={confirm} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>发送邀请</Text>}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
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
  const save = async () => {
    if (!name.trim() || !birthDate || !relation || !consent) { setError('请填写基础信息并确认监护关系'); return; }
    setSaving(true); setError('');
    try {
      const result = await guardianChildrenAPI.create({ name: name.trim(), birthDate, gender, relation,
        idNumber: idNumber.trim(), guardianConsent: true });
      onSaved(); onClose();
      Alert.alert('孩子档案已建立', '现在填写儿童健康问卷吗？也可以稍后从孩子的档案卡片进入。', [
        { text: '稍后填写', style: 'cancel' },
        { text: '现在填写', onPress: () => onQuestionnaire(result.data.id) },
      ]);
    } catch (e) { setError(e.message || '建档失败'); }
    finally { setSaving(false); }
  };
  return <Modal visible animationType="slide" transparent onRequestClose={onClose}><View style={styles.overlay}><ScrollView style={[styles.sheet, { maxHeight: '85%' }]}>
    <Text style={styles.sheetTitle}>为未成年孩子建档</Text>
    <Text style={styles.sheetDesc}>只建立基础档案。问卷可稍后填写；已有档案请联系医护核实关联。</Text>
    <TextInput style={styles.searchBox} placeholder="孩子姓名" value={name} onChangeText={setName} />
    <TextInput style={styles.searchBox} placeholder="出生日期 YYYY-MM-DD" value={birthDate} onChangeText={setBirthDate} keyboardType="numbers-and-punctuation" />
    <Text style={styles.fieldLabel}>性别</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>{['男', '女', '未知'].map(item => <TouchableOpacity key={item} onPress={() => setGender(item)} style={[styles.relChip, gender === item && styles.relChipActive]}><Text style={gender === item ? styles.relChipTextActive : styles.relChipText}>{item}</Text></TouchableOpacity>)}</View>
    <Text style={styles.fieldLabel}>与孩子的关系</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>{['父亲', '母亲', '其他监护人'].map(item => <TouchableOpacity key={item} onPress={() => setRelation(item)} style={[styles.relChip, relation === item && styles.relChipActive]}><Text style={relation === item ? styles.relChipTextActive : styles.relChipText}>{item}</Text></TouchableOpacity>)}</View>
    <TextInput style={styles.searchBox} placeholder="孩子身份证号（选填）" value={idNumber} onChangeText={setIdNumber} />
    <TouchableOpacity onPress={() => setConsent(!consent)} style={{ paddingVertical: 12 }}><Text style={{ color: consent ? colors.primary : colors.textMuted }}>{consent ? '☑' : '□'} 我是孩子的监护人，同意为其建立健康档案并录入健康信息</Text></TouchableOpacity>
    {!!error && <Text style={styles.errText}>{error}</Text>}
    <View style={styles.btnRow}><TouchableOpacity style={styles.cancelBtn} onPress={onClose}><Text style={styles.cancelBtnText}>取消</Text></TouchableOpacity><TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}><Text style={styles.saveBtnText}>{saving ? '保存中…' : '建立孩子档案'}</Text></TouchableOpacity></View>
  </ScrollView></View></Modal>;
}

function LinkCard({ link, onDelete }) {
  const u = link.user;
  const icon = { '配偶': 'heart', '父亲': 'man', '母亲': 'woman', '子女': 'happy', '兄弟': 'people', '姐妹': 'people' }[link.relation] || 'person';
  return (
    <View style={styles.memberCard}>
      <View style={styles.memberIcon}>
        <Ionicons name={icon} size={24} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Text style={styles.memberName}>{u.name}</Text>
          <Text style={styles.memberRelation}>{link.relation || '家人'}</Text>
          {u.gender ? <Text style={styles.memberGender}>{u.gender}</Text> : null}
        </View>
        <Text style={styles.memberPhone}>{u.phone}</Text>
        {u.age ? <Text style={styles.memberMeta}>{u.age} 岁</Text> : null}
        <Text style={styles.memberLinked}>已注册用户</Text>
      </View>
      <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
        <Ionicons name="trash-outline" size={18} color={colors.danger} />
      </TouchableOpacity>
    </View>
  );
}

export default function FamilyMembersScreen({ navigation }) {
  const [links, setLinks]           = useState([]);
  const [children, setChildren] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showAdd, setShowAdd]       = useState('');
  const [handlingInvite, setHandlingInvite] = useState(null);
  const [childArchive, setChildArchive] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [linkRes, invRes, childRes] = await Promise.allSettled([
        familyLinksAPI.list(),
        familyLinksAPI.pendingInvites(),
        guardianChildrenAPI.list(),
      ]);
      if (linkRes.status === 'fulfilled') setLinks(linkRes.value.data || []);
      if (invRes.status === 'fulfilled') setPendingInvites(invRes.value.data || []);
      if (childRes.status === 'fulfilled') setChildren(childRes.value.data || []);
    } catch {}
    finally { setLoading(false); }
  }, []);

  const handleAcceptInvite = async (inviteId) => {
    setHandlingInvite(inviteId);
    try {
      await familyLinksAPI.acceptInvite(inviteId);
      load();
    } catch (e) {
      Alert.alert('操作失败', e.message);
    } finally { setHandlingInvite(null); }
  };

  const handleRejectInvite = async (inviteId) => {
    Alert.alert('拒绝邀请', '确定拒绝此家庭成员邀请？', [
      { text: '取消', style: 'cancel' },
      { text: '拒绝', style: 'destructive', onPress: async () => {
        setHandlingInvite(inviteId);
        try {
          await familyLinksAPI.rejectInvite(inviteId);
          load();
        } catch (e) { Alert.alert('操作失败', e.message); }
        finally { setHandlingInvite(null); }
      }},
    ]);
  };

  useEffect(() => { load(); }, [load]);

  const handleDelete = (link) => {
    Alert.alert('解除关联', `确定解除与「${link.user.name}」的家庭成员关系？`, [
      { text: '取消', style: 'cancel' },
      { text: '解除', style: 'destructive', onPress: async () => {
        try {
          await familyLinksAPI.remove(link._id);
          load();
        } catch (e) {
          Alert.alert('操作失败', e.message);
        }
      }},
    ]);
  };

  const openChildQuestionnaire = async (childId) => {
    try {
      const result = await guardianChildrenAPI.startQuestionnaire(childId);
      if (result.data?.pushStatus === 'answered_stage') { Alert.alert('已填写', '当前年龄段问卷已提交'); return; }
      navigation.navigate('Questionnaire', { childId });
    } catch (e) { Alert.alert('打开失败', e.message || '儿童问卷暂不可用'); }
  };
  const openChildArchive = async (childId) => {
    try { const result = await guardianChildrenAPI.archive(childId); setChildArchive(result.data); }
    catch (e) { Alert.alert('加载失败', e.message || '无法获取孩子档案'); }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>家庭成员</Text>
        <TouchableOpacity onPress={() => setShowAdd('choice')} style={styles.addBtn}>
          <Ionicons name="add" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg }}>
        <Text style={styles.subtext}>可为未成年孩子建立独立健康档案；添加成年家人需由本人接受邀请。健康问卷可稍后填写。</Text>

        {/* 待确认邀请 */}
        {pendingInvites.length > 0 && (
          <View style={{ marginBottom: spacing.lg }}>
            <Text style={[styles.sectionLabel, { color: colors.warning, fontWeight: '700' }]}>
              待确认邀请（{pendingInvites.length}）
            </Text>
            {pendingInvites.map(inv => (
              <View key={inv._id} style={[styles.memberCard, { borderLeftWidth: 3, borderLeftColor: colors.warning }]}>
                <View style={[styles.memberIcon, { backgroundColor: colors.warning + '15' }]}>
                  <Ionicons name="mail-outline" size={22} color={colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{inv.fromName}</Text>
                  {inv.relation ? <Text style={styles.memberMeta}>邀请关系：{inv.relation}</Text> : null}
                  <Text style={[styles.memberLinked, { color: colors.warning }]}>待您确认</Text>
                </View>
                <View style={{ gap: spacing.xs }}>
                  <TouchableOpacity
                    style={{ backgroundColor: colors.success, borderRadius: radius.xs, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center' }}
                    onPress={() => handleAcceptInvite(inv._id)}
                    disabled={handlingInvite === inv._id}
                  >
                    {handlingInvite === inv._id
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>接受</Text>
                    }
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: radius.xs, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center' }}
                    onPress={() => handleRejectInvite(inv._id)}
                    disabled={!!handlingInvite}
                  >
                    <Text style={{ color: colors.danger, fontWeight: '600', fontSize: 12 }}>拒绝</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : links.length === 0 && children.length === 0 && pendingInvites.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>暂未关联家庭成员</Text>
            <Text style={styles.emptyDesc}>添加孩子档案，或邀请已注册的成年家人</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowAdd('choice')}>
              <Text style={styles.emptyBtnText}>立即添加</Text>
            </TouchableOpacity>
          </View>
        ) : children.length > 0 || links.length > 0 ? (
          <>
            {!!children.length && <><Text style={styles.sectionLabel}>我的孩子（{children.length}）</Text>{children.map(child => <View key={child.id} style={styles.memberCard}><View style={styles.memberIcon}><Ionicons name="happy-outline" size={24} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={styles.memberName}>{child.name} · {child.relation}</Text><Text style={styles.memberMeta}>{child.birthDate} · {child.ageStage?.label || '年龄待核实'}</Text><View style={{ flexDirection: 'row', gap: 16, paddingTop: 8 }}><TouchableOpacity onPress={() => openChildArchive(child.id)}><Text style={{ color: colors.primary, fontWeight: '600' }}>查看孩子档案</Text></TouchableOpacity><TouchableOpacity onPress={() => openChildQuestionnaire(child.id)}><Text style={{ color: colors.primary, fontWeight: '600' }}>填写问卷</Text></TouchableOpacity></View></View></View>)}</>}
            {!!links.length && <Text style={styles.sectionLabel}>已关联家人（{links.length}）</Text>}
            {links.map(link => (
              <LinkCard key={link._id} link={link} onDelete={() => handleDelete(link)} />
            ))}
          </>
        ) : null}
      </ScrollView>

      <Modal visible={showAdd === 'choice'} transparent animationType="slide" onRequestClose={() => setShowAdd('')}><View style={styles.overlay}><View style={styles.sheet}><Text style={styles.sheetTitle}>添加家庭成员</Text><TouchableOpacity onPress={() => setShowAdd('child')} style={[styles.selectedBox, { marginBottom: 12 }]}><Text>为未成年孩子建档</Text></TouchableOpacity><TouchableOpacity onPress={() => setShowAdd('adult')} style={[styles.selectedBox, { marginBottom: 12 }]}><Text>邀请成年家人（需本人确认）</Text></TouchableOpacity><TouchableOpacity onPress={() => setShowAdd('')} style={styles.cancelBtn}><Text style={styles.cancelBtnText}>取消</Text></TouchableOpacity></View></View></Modal>
      {showAdd === 'adult' && <AddLinkModal onClose={() => setShowAdd('')} onSaved={load} />}
      {showAdd === 'child' && <AddChildModal onClose={() => setShowAdd('')} onSaved={load} onQuestionnaire={openChildQuestionnaire} />}
      <Modal visible={!!childArchive} transparent animationType="slide" onRequestClose={() => setChildArchive(null)}><View style={styles.overlay}><ScrollView style={[styles.sheet, { maxHeight: '82%' }]}><Text style={styles.sheetTitle}>{childArchive?.name}的健康档案</Text><Text style={styles.sheetDesc}>{childArchive?.birthDate} · {childArchive?.ageStage?.label || '年龄待核实'} · 监护人自报资料须经医护核实</Text>{childArchive?.pendingReviewCount > 0 && <Text style={{ color: colors.warning, marginBottom: 10 }}>{childArchive.pendingReviewCount} 份问卷待医护核实</Text>}{[['birthWeight','出生体重（克）'],['birthLength','出生身长（厘米）'],['reportedHeightCm','最近身高/身长（厘米）'],['reportedWeightKg','最近体重（千克）'],['reportedMeasuredAt','测量日期'],['feeding','喂养与饮食'],['sleep','睡眠'],['development','生长发育与行为'],['caregiverConcerns','监护人关注问题']].map(([key,label]) => <View key={key} style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border }}><Text style={styles.memberMeta}>{label}{childArchive?.pendingPaths?.includes(`childProfile.${key}`) ? ' · 待核实' : ''}</Text><Text style={styles.memberName}>{childArchive?.childProfile?.[key] ?? '未记录'}</Text></View>)}<TouchableOpacity onPress={() => setChildArchive(null)} style={[styles.saveBtn, { marginTop: 16 }]}><Text style={styles.saveBtnText}>关闭</Text></TouchableOpacity></ScrollView></View></Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  addBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  subtext: { fontSize: 13, color: colors.textMuted, lineHeight: 20, marginBottom: spacing.lg },
  sectionLabel: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm },

  memberCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md,
    marginBottom: spacing.sm, ...shadow.xs,
  },
  memberIcon: {
    width: 48, height: 48, borderRadius: radius.md,
    backgroundColor: colors.primary + '12',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  memberName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  memberRelation: {
    fontSize: 11, color: colors.primary, backgroundColor: colors.primary + '12',
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full,
  },
  memberGender: { fontSize: 12, color: colors.textMuted },
  memberPhone: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  memberMeta: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  memberLinked: { fontSize: 11, color: colors.success, marginTop: 2 },
  deleteBtn: { padding: spacing.xs },

  emptyState: { alignItems: 'center', paddingTop: 60, gap: spacing.sm },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  emptyDesc: { fontSize: 13, color: colors.textMuted },
  emptyBtn: {
    marginTop: spacing.md, backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl, paddingVertical: 12, borderRadius: radius.full,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.xl + 16, maxHeight: '90%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 12, marginBottom: spacing.md },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  sheetDesc: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.md },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.background, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, marginBottom: spacing.sm, height: 44,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.textPrimary },
  emptySearch: { fontSize: 13, color: colors.textMuted, textAlign: 'center', padding: spacing.lg },

  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  resultAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary + '12', alignItems: 'center', justifyContent: 'center',
  },
  resultName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  resultMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  selectedBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: '#E8F5EF', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs },
  relChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full,
    borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white, marginRight: spacing.xs,
  },
  relChipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  relChipText: { fontSize: 13, color: colors.textSecondary },
  relChipTextActive: { color: '#fff', fontWeight: '700' },

  errText: { fontSize: 13, color: colors.danger, textAlign: 'center', marginBottom: spacing.sm },
  btnRow: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.md },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center' },
  cancelBtnText: { fontSize: 15, color: colors.textSecondary, fontWeight: '600' },
  saveBtn: { flex: 2, paddingVertical: 14, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
  saveBtnText: { fontSize: 15, color: '#fff', fontWeight: '700' },
});
