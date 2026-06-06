import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, Modal, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { familyLinksAPI } from '../../services/api';

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
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>确认添加</Text>}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
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
          {link.relation ? (
            <Text style={styles.memberRelation}>{link.relation}</Text>
          ) : null}
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
  const [links, setLinks]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await familyLinksAPI.list();
      setLinks(res.data || []);
    } catch {}
    finally { setLoading(false); }
  }, []);

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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>家庭成员</Text>
        <TouchableOpacity onPress={() => setShowAdd(true)} style={styles.addBtn}>
          <Ionicons name="add" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg }}>
        <Text style={styles.subtext}>只能关联系统内已注册的客户，双向建立家庭成员关系，方便后续健康基金和就医协助服务共享。</Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : links.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>暂未关联家庭成员</Text>
            <Text style={styles.emptyDesc}>点击右上角「+」搜索并关联家庭成员</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowAdd(true)}>
              <Text style={styles.emptyBtnText}>立即添加</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.sectionLabel}>共 {links.length} 位家庭成员</Text>
            {links.map(link => (
              <LinkCard key={link._id} link={link} onDelete={() => handleDelete(link)} />
            ))}
          </>
        )}
      </ScrollView>

      {showAdd && <AddLinkModal onClose={() => setShowAdd(false)} onSaved={load} />}
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
