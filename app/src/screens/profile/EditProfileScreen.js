import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, ScrollView, ActivityIndicator, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { userAPI } from '../../services/api';

const GENDER_OPTIONS = ['男', '女', '未知'];

// ── 简单 Toast ────────────────────────────────────────────────────
function Toast({ msg }) {
  if (!msg) return null;
  return (
    <View style={styles.toast}>
      <Ionicons name="checkmark-circle" size={16} color={colors.white} />
      <Text style={styles.toastText}>{msg}</Text>
    </View>
  );
}

// ── 单行输入 ──────────────────────────────────────────────────────
function Field({ label, value, onChangeText, placeholder, keyboardType, unit }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldRow}>
        <TextInput
          style={styles.fieldInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder || `请输入${label}`}
          placeholderTextColor={colors.textMuted}
          keyboardType={keyboardType || 'default'}
        />
        {unit ? <Text style={styles.fieldUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

// ── 结构化数组区块（通用） ─────────────────────────────────────────
// fields: [{ key, label, placeholder }]
// displayFn: (row) => string — row 摘要显示
function ArraySection({ title, icon, color, bg, items, fields, displayFn, onChange }) {
  const [editing, setEditing]   = useState(null); // index or 'new'
  const [form, setForm]         = useState({});

  const openNew = () => {
    const empty = {};
    fields.forEach(f => { empty[f.key] = ''; });
    setForm(empty);
    setEditing('new');
  };

  const openEdit = (idx) => {
    setForm({ ...items[idx] });
    setEditing(idx);
  };

  const cancel = () => { setEditing(null); setForm({}); };

  const confirm = () => {
    // filter out completely empty rows
    const hasData = fields.some(f => form[f.key]?.trim());
    if (!hasData) { cancel(); return; }

    if (editing === 'new') {
      onChange([...items, form]);
    } else {
      const next = [...items];
      next[editing] = form;
      onChange(next);
    }
    cancel();
  };

  const remove = (idx) => {
    const next = items.filter((_, i) => i !== idx);
    onChange(next);
  };

  const setFormField = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  return (
    <View style={styles.arraySection}>
      <View style={styles.arraySectionHeader}>
        <View style={[styles.arraySectionIcon, { backgroundColor: bg }]}>
          <Ionicons name={icon} size={16} color={color} />
        </View>
        <Text style={styles.arraySectionTitle}>{title}</Text>
        <TouchableOpacity style={[styles.addBtn, { borderColor: color }]} onPress={openNew}>
          <Ionicons name="add" size={14} color={color} />
          <Text style={[styles.addBtnText, { color }]}>添加</Text>
        </TouchableOpacity>
      </View>

      {items.length === 0 && editing !== 'new' ? (
        <TouchableOpacity style={styles.arrayEmpty} onPress={openNew}>
          <Text style={styles.arrayEmptyText}>暂无记录，点击添加</Text>
        </TouchableOpacity>
      ) : (
        items.map((item, idx) => (
          <View key={idx}>
            <TouchableOpacity
              style={styles.arrayRow}
              onPress={() => openEdit(idx)}
              activeOpacity={0.7}
            >
              <View style={styles.arrayRowBody}>
                <Text style={styles.arrayRowText} numberOfLines={1}>{displayFn(item)}</Text>
              </View>
              <TouchableOpacity
                style={styles.arrayRowDelete}
                onPress={() => remove(idx)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="trash-outline" size={15} color={colors.danger} />
              </TouchableOpacity>
            </TouchableOpacity>

            {/* Inline edit form */}
            {editing === idx && (
              <View style={styles.inlineForm}>
                {fields.map(f => (
                  <View key={f.key} style={styles.inlineField}>
                    <Text style={styles.inlineFieldLabel}>{f.label}</Text>
                    <TextInput
                      style={styles.inlineFieldInput}
                      value={form[f.key] || ''}
                      onChangeText={val => setFormField(f.key, val)}
                      placeholder={f.placeholder || f.label}
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                ))}
                <View style={styles.inlineActions}>
                  <TouchableOpacity style={styles.inlineCancelBtn} onPress={cancel}>
                    <Text style={styles.inlineCancelText}>取消</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.inlineConfirmBtn, { backgroundColor: color }]} onPress={confirm}>
                    <Text style={styles.inlineConfirmText}>保存</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        ))
      )}

      {/* New row form */}
      {editing === 'new' && (
        <View style={styles.inlineForm}>
          {fields.map(f => (
            <View key={f.key} style={styles.inlineField}>
              <Text style={styles.inlineFieldLabel}>{f.label}</Text>
              <TextInput
                style={styles.inlineFieldInput}
                value={form[f.key] || ''}
                onChangeText={val => setFormField(f.key, val)}
                placeholder={f.placeholder || f.label}
                placeholderTextColor={colors.textMuted}
              />
            </View>
          ))}
          <View style={styles.inlineActions}>
            <TouchableOpacity style={styles.inlineCancelBtn} onPress={cancel}>
              <Text style={styles.inlineCancelText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.inlineConfirmBtn, { backgroundColor: color }]} onPress={confirm}>
              <Text style={styles.inlineConfirmText}>添加</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// ── 健康档案结构化字段配置 ───────────────────────────────────────
const ALLERGY_FIELDS = [
  { key: 'substance',  label: '过敏原',  placeholder: '如：青霉素、花生' },
  { key: 'type',       label: '类型',   placeholder: '如：药物、食物、环境' },
  { key: 'reaction',   label: '反应',   placeholder: '如：荨麻疹、喉咙肿胀' },
];
const HISTORY_FIELDS = [
  { key: 'disease',   label: '疾病名称', placeholder: '如：高血压、糖尿病' },
  { key: 'onsetDate', label: '起病时间', placeholder: '如：2020年' },
  { key: 'hospital',  label: '就诊医院', placeholder: '如：XX医院（可选）' },
  { key: 'treatment', label: '治疗情况', placeholder: '如：服药控制、手术治疗' },
];
const MEDICATION_FIELDS = [
  { key: 'chemicalName', label: '通用名',   placeholder: '如：氨氯地平' },
  { key: 'brandName',    label: '商品名',   placeholder: '如：络活喜（可选）' },
  { key: 'dose',         label: '剂量',     placeholder: '如：5mg' },
  { key: 'route',        label: '给药途径', placeholder: '如：口服、注射' },
  { key: 'frequency',    label: '用药频率', placeholder: '如：每日一次' },
  { key: 'duration',     label: '用药时长', placeholder: '如：长期、3个月' },
];
const FAMILY_FIELDS = [
  { key: 'disease',       label: '疾病',   placeholder: '如：糖尿病、心脏病' },
  { key: 'relative',      label: '亲属',   placeholder: '如：父亲、母亲' },
  { key: 'diagnosisDate', label: '确诊时间', placeholder: '如：2015年（可选）' },
  { key: 'treatment',     label: '治疗情况', placeholder: '如：胰岛素控制（可选）' },
];
const SURGERY_FIELDS = [
  { key: 'name',     label: '手术名称', placeholder: '如：阑尾切除术' },
  { key: 'date',     label: '手术时间', placeholder: '如：2018年' },
  { key: 'hospital', label: '手术医院', placeholder: '如：XX医院（可选）' },
  { key: 'outcome',  label: '预后情况', placeholder: '如：良好' },
];

// ── 主页面 ────────────────────────────────────────────────────────
export default function EditProfileScreen({ navigation }) {
  const { user, updateUser } = useAuth();

  const [name, setName]     = useState(user?.name || '');
  const [gender, setGender] = useState(user?.gender || '未知');
  const [age, setAge]       = useState(user?.age ? String(user.age) : '');
  const [height, setHeight] = useState(user?.height ? String(user.height) : '');
  const [weight, setWeight] = useState(user?.weight ? String(user.weight) : '');
  // 联系信息（#34）
  const [contactPhone,    setContactPhone]    = useState(user?.contactPhone    || '');
  const [deliveryAddress, setDeliveryAddress] = useState(user?.deliveryAddress || '');

  // 健康档案结构化字段
  const hp = user?.healthProfile || {};
  const [bloodTypeABO,  setBloodTypeABO]  = useState(user?.bloodTypeABO || '');
  const [bloodTypeRH,   setBloodTypeRH]   = useState(user?.bloodTypeRH  || '');
  const [bloodType,     setBloodType]     = useState(hp.bloodType || '');
  const [allergies,     setAllergies]     = useState(Array.isArray(hp.allergies)     ? hp.allergies     : []);
  const [medicalHistory,setMedicalHistory]= useState(Array.isArray(hp.medicalHistory)? hp.medicalHistory: []);
  const [medications,   setMedications]   = useState(Array.isArray(hp.medications)   ? hp.medications   : []);
  const [familyHistory, setFamilyHistory] = useState(Array.isArray(hp.familyHistory) ? hp.familyHistory : []);
  const [familyHistoryNote, setFamilyHistoryNote] = useState(hp.familyHistoryNote || '');
  const [surgeries,     setSurgeries]     = useState(Array.isArray(hp.surgeries)     ? hp.surgeries     : []);
  // 健康档案文字摘要字段（与健康档案页同步显示）
  const [drugAllergy,   setDrugAllergy]   = useState(hp.drugAllergy    || '');
  const [foodAllergy,   setFoodAllergy]   = useState(hp.foodAllergy    || '');
  const [pastHistory,   setPastHistory]   = useState(hp.pastHistory    || '');
  const [medicHistory,  setMedicHistory]  = useState(hp.medicHistory   || '');
  const [surgeryHistory,    setSurgeryHistory]    = useState(hp.surgeryHistory    || '');
  const [infectiousHistory, setInfectiousHistory] = useState(hp.infectiousHistory || '');
  // 女性专属字段（#33）
  const [menstrualHistory, setMenstrualHistory] = useState(hp.menstrualHistory || '');
  // 婚育史：优先读新字段 maritalHistory，兼容旧字段 reproductiveHistory
  const [maritalHistory,   setMaritalHistory]   = useState(hp.maritalHistory || hp.reproductiveHistory || '');

  const [saving, setSaving] = useState(false);
  const [toast, setToast]   = useState('');
  const [error, setError]   = useState('');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('请输入姓名'); return; }
    setError('');
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        gender,
        age:    age    ? Number(age)    : undefined,
        height: height ? Number(height) : undefined,
        weight: weight ? Number(weight) : undefined,
        contactPhone:    contactPhone.trim()    || undefined,
        deliveryAddress: deliveryAddress.trim() || undefined,
        bloodTypeABO,
        bloodTypeRH,
        healthProfile: {
          bloodType: bloodTypeABO && bloodTypeRH ? `${bloodTypeABO}型 Rh${bloodTypeRH === '阳性' ? '+' : '-'}` : bloodType,
          allergies,
          medicalHistory,
          medications,
          familyHistory,
          familyHistoryNote,
          surgeries,
          drugAllergy,
          foodAllergy,
          pastHistory,
          medicHistory,
          surgeryHistory,
          infectiousHistory,
          menstrualHistory,
          maritalHistory,
        },
      };
      const res = await userAPI.updateMe(payload);
      if (res.success) {
        updateUser(res.data);
        showToast('保存成功');
        setTimeout(() => navigation.goBack(), 1200);
      }
    } catch (err) {
      setError(err.message || '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 顶部栏 */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.pageTitle}>编辑资料</Text>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <Text style={styles.saveBtnText}>保存</Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.form}>

          {/* ── 基本信息 ──────────────────────────────────────────── */}
          <Text style={styles.sectionLabel}>基本信息</Text>
          <View style={styles.card}>
            <Field label="姓名" value={name} onChangeText={setName} placeholder="请输入姓名" />
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>性别</Text>
              <View style={styles.genderRow}>
                {GENDER_OPTIONS.map(g => (
                  <TouchableOpacity
                    key={g}
                    style={[styles.genderChip, gender === g && styles.genderChipActive]}
                    onPress={() => setGender(g)}
                  >
                    <Text style={[styles.genderChipText, gender === g && styles.genderChipTextActive]}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <Field label="年龄" value={age} onChangeText={setAge} keyboardType="numeric" unit="岁" />
            <Field label="联系电话" value={contactPhone} onChangeText={setContactPhone}
              placeholder="用于快递联系（与登录手机号独立）" keyboardType="phone-pad" />
            <Field label="配送地址（快递）" value={deliveryAddress} onChangeText={setDeliveryAddress}
              placeholder="省市区 + 详细地址 + 收件人姓名" />
          </View>

          {/* ── 身体数据 ──────────────────────────────────────────── */}
          <Text style={styles.sectionLabel}>身体数据</Text>
          <View style={styles.card}>
            <Field label="身高" value={height} onChangeText={setHeight} keyboardType="numeric" unit="cm" />
            <Field label="体重" value={weight} onChangeText={setWeight} keyboardType="numeric" unit="kg" />
          </View>

          {/* ── 健康档案 ──────────────────────────────────────────── */}
          <Text style={styles.sectionLabel}>健康档案</Text>

          {/* 血型 */}
          <View style={styles.card}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>ABO 血型</Text>
              <View style={styles.genderRow}>
                {['', 'A', 'B', 'O', 'AB'].map(v => (
                  <TouchableOpacity key={v} style={[styles.genderChip, bloodTypeABO === v && styles.genderChipActive]} onPress={() => setBloodTypeABO(v)}>
                    <Text style={[styles.genderChipText, bloodTypeABO === v && styles.genderChipTextActive]}>{v || '未知'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={[styles.field, { borderBottomWidth: 0 }]}>
              <Text style={styles.fieldLabel}>RH 血型</Text>
              <View style={styles.genderRow}>
                {['', '阳性', '阴性'].map(v => (
                  <TouchableOpacity key={v} style={[styles.genderChip, bloodTypeRH === v && styles.genderChipActive]} onPress={() => setBloodTypeRH(v)}>
                    <Text style={[styles.genderChipText, bloodTypeRH === v && styles.genderChipTextActive]}>{v || '未知'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* 过敏史 */}
          <View style={[styles.card, { marginTop: spacing.sm }]}>
            <ArraySection
              title="过敏史"
              icon="alert-circle-outline"
              color="#DC3545"
              bg="#FDEEEC"
              items={allergies}
              fields={ALLERGY_FIELDS}
              displayFn={r => [r.substance, r.type && `(${r.type})`, r.reaction && `→${r.reaction}`].filter(Boolean).join(' ')}
              onChange={setAllergies}
            />
          </View>

          {/* 既往病史 */}
          <View style={[styles.card, { marginTop: spacing.sm }]}>
            <ArraySection
              title="既往病史"
              icon="heart-outline"
              color="#0077B6"
              bg="#EBF5FB"
              items={medicalHistory}
              fields={HISTORY_FIELDS}
              displayFn={r => [r.disease, r.onsetDate, r.treatment].filter(Boolean).join(' · ')}
              onChange={setMedicalHistory}
            />
          </View>

          {/* 用药记录 */}
          <View style={[styles.card, { marginTop: spacing.sm }]}>
            <ArraySection
              title="用药记录"
              icon="medical-outline"
              color="#7C3AED"
              bg="#F2EEFF"
              items={medications}
              fields={MEDICATION_FIELDS}
              displayFn={r => [r.chemicalName || r.brandName, r.dose, r.frequency].filter(Boolean).join(' · ')}
              onChange={setMedications}
            />
          </View>

          {/* 家族史 */}
          <View style={[styles.card, { marginTop: spacing.sm }]}>
            <View style={styles.arraySection}>
              <View style={styles.arraySectionHeader}>
                <View style={[styles.arraySectionIcon, { backgroundColor: '#FEF3E2' }]}>
                  <Ionicons name="people-outline" size={16} color="#D97706" />
                </View>
                <Text style={styles.arraySectionTitle}>家族史</Text>
              </View>
              <Field
                label="家族史详情"
                value={familyHistoryNote}
                onChangeText={setFamilyHistoryNote}
                placeholder="如：父亲患高血压，母亲患糖尿病"
              />
            </View>
          </View>

          {/* 手术史 */}
          <View style={[styles.card, { marginTop: spacing.sm }]}>
            <ArraySection
              title="手术史"
              icon="cut-outline"
              color="#059669"
              bg="#D1FAE5"
              items={surgeries}
              fields={SURGERY_FIELDS}
              displayFn={r => [r.name, r.date, r.outcome].filter(Boolean).join(' · ')}
              onChange={setSurgeries}
            />
          </View>

          {/* 月经史（仅女性） */}
          {gender === '女' && (
            <View style={[styles.card, { marginTop: spacing.sm }]}>
              <View style={styles.arraySection}>
                <View style={styles.arraySectionHeader}>
                  <View style={[styles.arraySectionIcon, { backgroundColor: '#FDECEA' }]}>
                    <Ionicons name="rose-outline" size={16} color="#DC3545" />
                  </View>
                  <Text style={styles.arraySectionTitle}>月经史</Text>
                </View>
                <Field
                  label="月经史详情"
                  value={menstrualHistory}
                  onChangeText={setMenstrualHistory}
                  placeholder="如：初潮14岁，周期28天，规律，无痛经"
                />
              </View>
            </View>
          )}

          {/* ── 健康摘要（文字档案，与健康档案页同步） ────────────── */}
          <Text style={styles.sectionLabel}>健康摘要</Text>
          <View style={styles.card}>
            <Field label="药物过敏史" value={drugAllergy} onChangeText={setDrugAllergy} placeholder="如：青霉素类、无" />
            <Field label="食物过敏史" value={foodAllergy} onChangeText={setFoodAllergy} placeholder="如：海鲜、无" />
            <Field label="既往史" value={pastHistory} onChangeText={setPastHistory} placeholder="如：高血压（2020年）" />
            <Field label="用药史" value={medicHistory} onChangeText={setMedicHistory} placeholder="如：氨氯地平" />
            <Field label="手术史" value={surgeryHistory} onChangeText={setSurgeryHistory} placeholder="如：无" />
            <Field label="传染病史" value={infectiousHistory} onChangeText={setInfectiousHistory} placeholder="如：乙肝（已治愈）、无" />
            <Field label="婚育史" value={maritalHistory} onChangeText={setMaritalHistory} placeholder="如：已婚，育有1子；未婚" />
          </View>

          {/* ── 医疗保障信息（只读，由医护人员录入） ───────────────── */}
          {(user?.basic_insurance || user?.commercial_medical || user?.critical_illness) && (
            <>
              <Text style={styles.sectionLabel}>医疗保障信息</Text>
              <View style={styles.card}>
                {!!user.basic_insurance && (
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>基础医疗保障</Text>
                    <View style={[styles.fieldRow, { justifyContent: 'space-between' }]}>
                      <Text style={styles.readonlyText}>{user.basic_insurance}</Text>
                      <Text style={styles.readonlyHint}>医护录入</Text>
                    </View>
                  </View>
                )}
                {!!user.commercial_medical && (
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>医疗险</Text>
                    <View style={[styles.fieldRow, { justifyContent: 'space-between' }]}>
                      <Text style={styles.readonlyText}>{user.commercial_medical}</Text>
                      <Text style={styles.readonlyHint}>医护录入</Text>
                    </View>
                  </View>
                )}
                {!!user.critical_illness && (
                  <View style={[styles.field, { borderBottomWidth: 0 }]}>
                    <Text style={styles.fieldLabel}>重疾险</Text>
                    <View style={[styles.fieldRow, { justifyContent: 'space-between' }]}>
                      <Text style={styles.readonlyText}>{user.critical_illness}</Text>
                      <Text style={styles.readonlyHint}>医护录入</Text>
                    </View>
                  </View>
                )}
              </View>
            </>
          )}

          {/* ── 账号信息 ──────────────────────────────────────────── */}
          <Text style={styles.sectionLabel}>账号信息</Text>
          <View style={styles.card}>
            <View style={[styles.field, { borderBottomWidth: 0 }]}>
              <Text style={styles.fieldLabel}>手机号</Text>
              <View style={styles.fieldRow}>
                <Text style={styles.readonlyText}>{user?.phone || '--'}</Text>
                <Text style={styles.readonlyHint}>不可修改</Text>
              </View>
            </View>
          </View>

          {/* 错误提示 */}
          {!!error && (
            <View style={styles.errorWrap}>
              <Ionicons name="alert-circle-outline" size={15} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* 保存按钮 */}
          <TouchableOpacity style={styles.saveFullBtn} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
            {saving
              ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.saveFullBtnText}>保存修改</Text>
            }
          </TouchableOpacity>

          <View style={{ height: spacing.xl * 2 }} />
        </View>
      </ScrollView>

      <Toast msg={toast} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: 4, width: 44 },
  pageTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  saveBtn: { padding: 4, width: 44, alignItems: 'flex-end' },
  saveBtnText: { fontSize: 16, color: colors.primary, fontWeight: '700' },

  form: { padding: spacing.lg },
  sectionLabel: {
    fontSize: 10, fontWeight: '700', color: colors.textMuted,
    letterSpacing: 1.2, textTransform: 'uppercase',
    marginTop: spacing.lg, marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
  },

  // Single field
  field: {
    paddingHorizontal: spacing.md, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  fieldLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '500', marginBottom: 6 },
  fieldRow: { flexDirection: 'row', alignItems: 'center' },
  fieldInput: {
    flex: 1, fontSize: 15, color: colors.textPrimary, fontWeight: '500',
    padding: 0, outline: 'none',
  },
  fieldUnit: { fontSize: 13, color: colors.textMuted, marginLeft: spacing.xs },
  readonlyText: { flex: 1, fontSize: 15, color: colors.textSecondary },
  readonlyHint: {
    fontSize: 11, color: colors.textMuted,
    backgroundColor: colors.border, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: radius.full,
  },

  genderRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 2 },
  genderChip: {
    paddingHorizontal: 16, paddingVertical: 7,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.background,
  },
  genderChipActive: { borderColor: colors.primary, backgroundColor: colors.primary + '12' },
  genderChipText: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  genderChipTextActive: { color: colors.primary, fontWeight: '700' },

  // Array section
  arraySection: { padding: spacing.md },
  arraySectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm,
  },
  arraySectionIcon: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  arraySectionTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: radius.full, borderWidth: 1.5,
  },
  addBtnText: { fontSize: 12, fontWeight: '600' },

  arrayEmpty: {
    paddingVertical: 14,
    borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.borderLight, borderStyle: 'dashed',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  arrayEmptyText: { fontSize: 13, color: colors.textMuted },

  arrayRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: spacing.xs,
    borderTopWidth: 1, borderTopColor: colors.borderLight,
  },
  arrayRowBody: { flex: 1 },
  arrayRowText: { fontSize: 14, color: colors.textPrimary, fontWeight: '500' },
  arrayRowDelete: {
    padding: 6, marginLeft: spacing.sm,
  },

  // Inline edit form
  inlineForm: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  inlineField: { marginBottom: spacing.sm },
  inlineFieldLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600', marginBottom: 4 },
  inlineFieldInput: {
    fontSize: 14, color: colors.textPrimary,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    paddingVertical: 6, padding: 0, outline: 'none',
  },
  inlineActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, justifyContent: 'flex-end' },
  inlineCancelBtn: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.border,
  },
  inlineCancelText: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  inlineConfirmBtn: {
    paddingHorizontal: 20, paddingVertical: 8,
    borderRadius: radius.full,
  },
  inlineConfirmText: { fontSize: 13, color: colors.white, fontWeight: '700' },

  // Error + save
  errorWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: spacing.md,
    backgroundColor: colors.danger + '10', padding: spacing.sm,
    borderRadius: radius.sm,
  },
  errorText: { fontSize: 13, color: colors.danger },

  saveFullBtn: {
    marginTop: spacing.xl, backgroundColor: colors.primary,
    borderRadius: radius.md, paddingVertical: 15, alignItems: 'center',
  },
  saveFullBtnText: { fontSize: 16, color: colors.white, fontWeight: '700' },

  toast: {
    position: 'absolute', bottom: 40, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: radius.full,
  },
  toastText: { fontSize: 14, color: colors.white, fontWeight: '500' },
});
