import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, Modal, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { familyAPI } from '../../services/api';

const RELATIONS = ['配偶', '父亲', '母亲', '子女', '兄弟', '姐妹', '祖父', '祖母', '其他'];

const EMPTY_FORM = { name: '', relation: '', phone: '', birthday: '', gender: '', notes: '' };

function AddMemberModal({ onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) { setErr('请填写姓名'); return; }
    setSaving(true); setErr('');
    try {
      await familyAPI.add(form);
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

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.fieldLabel}>姓名 *</Text>
            <TextInput style={styles.input} value={form.name} onChangeText={v => set('name', v)} placeholder="请输入姓名" placeholderTextColor={colors.textMuted} />

            <Text style={styles.fieldLabel}>与您的关系</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
              {RELATIONS.map(r => (
                <TouchableOpacity key={r} onPress={() => set('relation', r)}
                  style={[styles.relChip, form.relation === r && styles.relChipActive]}>
                  <Text style={[styles.relChipText, form.relation === r && styles.relChipTextActive]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>性别</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
              {['男', '女'].map(g => (
                <TouchableOpacity key={g} onPress={() => set('gender', g)}
                  style={[styles.genderBtn, form.gender === g && styles.genderBtnActive]}>
                  <Text style={[styles.genderBtnText, form.gender === g && styles.genderBtnTextActive]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>手机号</Text>
            <TextInput style={styles.input} value={form.phone} onChangeText={v => set('phone', v)} placeholder="选填" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" />

            <Text style={styles.fieldLabel}>出生日期</Text>
            <TextInput style={styles.input} value={form.birthday} onChangeText={v => set('birthday', v)} placeholder="如：1985-06-15" placeholderTextColor={colors.textMuted} />

            <Text style={styles.fieldLabel}>备注</Text>
            <TextInput style={[styles.input, { height: 72, textAlignVertical: 'top' }]} value={form.notes} onChangeText={v => set('notes', v)} placeholder="如：有高血压病史" placeholderTextColor={colors.textMuted} multiline />

            {!!err && <Text style={styles.errText}>{err}</Text>}
          </ScrollView>

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>添加</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function MemberCard({ member, index, onDelete }) {
  const icon = { '配偶': 'heart', '父亲': 'man', '母亲': 'woman', '子女': 'happy', '兄弟': 'people', '姐妹': 'people' }[member.relation] || 'person';
  return (
    <View style={styles.memberCard}>
      <View style={styles.memberIcon}>
        <Ionicons name={icon} size={24} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Text style={styles.memberName}>{member.name}</Text>
          {member.relation ? <Text style={styles.memberRelation}>{member.relation}</Text> : null}
          {member.gender ? <Text style={styles.memberGender}>{member.gender}</Text> : null}
        </View>
        {member.phone ? <Text style={styles.memberPhone}>{member.phone}</Text> : null}
        {member.birthday ? <Text style={styles.memberMeta}>生日：{member.birthday}</Text> : null}
        {member.notes ? <Text style={styles.memberNotes} numberOfLines={1}>{member.notes}</Text> : null}
      </View>
      <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
        <Ionicons name="trash-outline" size={18} color={colors.danger} />
      </TouchableOpacity>
    </View>
  );
}

export default function FamilyMembersScreen({ navigation }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await familyAPI.list();
      setMembers(res.data || []);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = (idx, name) => {
    Alert.alert('确认删除', `确定删除「${name}」的信息？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => {
        try {
          const res = await familyAPI.remove(idx);
          setMembers(res.data || []);
        } catch (e) {
          Alert.alert('删除失败', e.message);
        }
      }},
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
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
        <Text style={styles.subtext}>添加家庭成员，为他们记录健康信息，方便统一管理。</Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : members.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>暂未添加家庭成员</Text>
            <Text style={styles.emptyDesc}>点击右上角「+」添加家人健康档案</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowAdd(true)}>
              <Text style={styles.emptyBtnText}>立即添加</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.sectionLabel}>共 {members.length} 位成员</Text>
            {members.map((m, idx) => (
              <MemberCard key={idx} member={m} index={idx} onDelete={() => handleDelete(idx, m.name)} />
            ))}
          </>
        )}
      </ScrollView>

      {showAdd && (
        <AddMemberModal onClose={() => setShowAdd(false)} onSaved={load} />
      )}
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
  memberNotes: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  deleteBtn: { padding: spacing.xs },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: spacing.sm },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  emptyDesc: { fontSize: 13, color: colors.textMuted },
  emptyBtn: {
    marginTop: spacing.md, backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl, paddingVertical: 12, borderRadius: radius.full,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.xl + 16, maxHeight: '90%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 12, marginBottom: spacing.md },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.background, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, fontSize: 14, color: colors.textPrimary, marginBottom: spacing.md,
  },
  relChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full,
    borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white, marginRight: spacing.xs,
  },
  relChipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  relChipText: { fontSize: 13, color: colors.textSecondary },
  relChipTextActive: { color: '#fff', fontWeight: '700' },
  genderBtn: {
    flex: 1, paddingVertical: 10, borderRadius: radius.sm,
    borderWidth: 1.5, borderColor: colors.border, alignItems: 'center',
  },
  genderBtnActive: { borderColor: colors.primary, backgroundColor: colors.primary + '12' },
  genderBtnText: { fontSize: 14, color: colors.textSecondary },
  genderBtnTextActive: { color: colors.primary, fontWeight: '700' },
  errText: { fontSize: 13, color: colors.danger, textAlign: 'center', marginBottom: spacing.sm },
  btnRow: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.md },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center' },
  cancelBtnText: { fontSize: 15, color: colors.textSecondary, fontWeight: '600' },
  saveBtn: { flex: 2, paddingVertical: 14, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
  saveBtnText: { fontSize: 15, color: '#fff', fontWeight: '700' },
});
