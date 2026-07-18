import React, { useState } from 'react';
import { View, Text, Input, Picker, Button, Textarea } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { colors, spacing, radius } from '../../../theme';
import { userAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';

// 完整对齐 app/src/screens/profile/EditProfileScreen.js 的健康档案字段结构。
const GENDER_OPTIONS = ['男', '女', '未知'];
const ABO_OPTIONS = ['', 'A', 'B', 'O', 'AB'];
const RH_OPTIONS = ['', '阳性', '阴性'];

const ALLERGY_FIELDS = [
  { key: 'substance', label: '过敏原', placeholder: '如：青霉素、花生' },
  { key: 'type', label: '类型', placeholder: '如：药物、食物、环境' },
  { key: 'reaction', label: '反应', placeholder: '如：荨麻疹、喉咙肿胀' },
];
const HISTORY_FIELDS = [
  { key: 'disease', label: '疾病名称', placeholder: '如：高血压、糖尿病' },
  { key: 'onsetDate', label: '起病时间', placeholder: '如：2020年' },
  { key: 'hospital', label: '就诊医院', placeholder: '如：XX医院（可选）' },
  { key: 'treatment', label: '治疗情况', placeholder: '如：服药控制、手术治疗' },
];
const MEDICATION_FIELDS = [
  { key: 'chemicalName', label: '通用名', placeholder: '如：氨氯地平' },
  { key: 'brandName', label: '商品名', placeholder: '如：络活喜（可选）' },
  { key: 'dose', label: '剂量', placeholder: '如：5mg' },
  { key: 'route', label: '给药途径', placeholder: '如：口服、注射' },
  { key: 'frequency', label: '用药频率', placeholder: '如：每日一次' },
  { key: 'duration', label: '用药时长', placeholder: '如：长期、3个月' },
];
const SURGERY_FIELDS = [
  { key: 'name', label: '手术名称', placeholder: '如：阑尾切除术' },
  { key: 'date', label: '手术时间', placeholder: '如：2018年' },
  { key: 'hospital', label: '手术医院', placeholder: '如：XX医院（可选）' },
  { key: 'outcome', label: '预后情况', placeholder: '如：良好' },
];

const boxStyle = { border: `1.5px solid ${colors.border}`, borderRadius: `${radius.sm}px`, padding: '10px 12px', backgroundColor: '#fff', boxSizing: 'border-box' };

function Field({ label, value, onInput, placeholder, type, unit }) {
  return (
    <View style={{ marginBottom: `${spacing.md}px` }}>
      <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textSecondary, display: 'block', marginBottom: '8px' }}>{label}</Text>
      <View style={{ ...boxStyle, display: 'flex', alignItems: 'center' }}>
        <Input
          style={{ flex: 1 }}
          type={type || 'text'}
          value={value}
          onInput={(e) => onInput(e.detail.value)}
          placeholder={placeholder || `请输入${label}`}
        />
        {!!unit && <Text style={{ fontSize: '12px', color: colors.textMuted, marginLeft: '6px' }}>{unit}</Text>}
      </View>
    </View>
  );
}

function ChipRow({ options, value, onChange, labelFn }) {
  return (
    <View style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
      {options.map((v) => (
        <View
          key={v}
          onClick={() => onChange(v)}
          style={{
            padding: '7px 16px', borderRadius: `${radius.full}px`,
            border: `1.5px solid ${value === v ? colors.primary : colors.border}`,
            backgroundColor: value === v ? colors.primary10 : colors.background,
          }}
        >
          <Text style={{ fontSize: '13px', color: value === v ? colors.primary : colors.textSecondary, fontWeight: value === v ? 700 : 500 }}>
            {labelFn ? labelFn(v) : (v || '未知')}
          </Text>
        </View>
      ))}
    </View>
  );
}

// 结构化数组区块：列表 + 内联新增/编辑表单
function ArraySection({ title, icon, color, bg, items, fields, displayFn, onChange }) {
  const [editing, setEditing] = useState(null); // index | 'new' | null
  const [form, setForm] = useState({});

  const openNew = () => {
    const empty = {};
    fields.forEach((f) => { empty[f.key] = ''; });
    setForm(empty);
    setEditing('new');
  };
  const openEdit = (idx) => { setForm({ ...items[idx] }); setEditing(idx); };
  const cancel = () => { setEditing(null); setForm({}); };
  const confirm = () => {
    const hasData = fields.some((f) => (form[f.key] || '').trim());
    if (!hasData) { cancel(); return; }
    if (editing === 'new') onChange([...items, form]);
    else {
      const next = [...items];
      next[editing] = form;
      onChange(next);
    }
    cancel();
  };
  const remove = (idx) => onChange(items.filter((_, i) => i !== idx));
  const setFormField = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  return (
    <View style={{ padding: `${spacing.md}px` }}>
      <View style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, marginBottom: `${spacing.sm}px` }}>
        <View style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: '14px' }}>{icon}</Text>
        </View>
        <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary, flex: 1 }}>{title}</Text>
        <View onClick={openNew} style={{ padding: '5px 10px', borderRadius: `${radius.full}px`, border: `1.5px solid ${color}` }}>
          <Text style={{ fontSize: '12px', fontWeight: 600, color }}>+ 添加</Text>
        </View>
      </View>

      {items.length === 0 && editing !== 'new' ? (
        <View onClick={openNew} style={{ padding: '14px', borderRadius: `${radius.sm}px`, border: `1px dashed ${colors.borderLight}`, textAlign: 'center', backgroundColor: colors.background }}>
          <Text style={{ fontSize: '13px', color: colors.textMuted }}>暂无记录，点击添加</Text>
        </View>
      ) : (
        items.map((item, idx) => (
          <View key={idx}>
            <View style={{ display: 'flex', alignItems: 'center', padding: '10px 4px', borderTop: `1px solid ${colors.borderLight}` }}>
              <View onClick={() => openEdit(idx)} style={{ flex: 1 }}>
                <Text style={{ fontSize: '14px', color: colors.textPrimary, fontWeight: 500 }} numberOfLines={1}>{displayFn(item)}</Text>
              </View>
              <View onClick={() => remove(idx)} style={{ padding: '6px', marginLeft: `${spacing.sm}px` }}>
                <Text style={{ fontSize: '13px', color: colors.danger }}>删除</Text>
              </View>
            </View>
            {editing === idx && (
              <InlineForm fields={fields} form={form} setFormField={setFormField} onCancel={cancel} onConfirm={confirm} color={color} confirmLabel="保存" />
            )}
          </View>
        ))
      )}

      {editing === 'new' && (
        <InlineForm fields={fields} form={form} setFormField={setFormField} onCancel={cancel} onConfirm={confirm} color={color} confirmLabel="添加" />
      )}
    </View>
  );
}

function InlineForm({ fields, form, setFormField, onCancel, onConfirm, color, confirmLabel }) {
  return (
    <View style={{ backgroundColor: colors.background, borderRadius: `${radius.sm}px`, border: `1px solid ${colors.border}`, padding: `${spacing.sm}px`, marginBottom: `${spacing.xs}px` }}>
      {fields.map((f) => (
        <View key={f.key} style={{ marginBottom: `${spacing.sm}px` }}>
          <Text style={{ fontSize: '11px', color: colors.textMuted, fontWeight: 600, display: 'block', marginBottom: '4px' }}>{f.label}</Text>
          <Input
            style={{ fontSize: '14px', color: colors.textPrimary, borderBottom: `1px solid ${colors.border}`, padding: '6px 0' }}
            value={form[f.key] || ''}
            onInput={(e) => setFormField(f.key, e.detail.value)}
            placeholder={f.placeholder || f.label}
          />
        </View>
      ))}
      <View style={{ display: 'flex', gap: `${spacing.sm}px`, marginTop: `${spacing.sm}px`, justifyContent: 'flex-end' }}>
        <View onClick={onCancel} style={{ padding: '8px 16px', borderRadius: `${radius.full}px`, border: `1px solid ${colors.border}` }}>
          <Text style={{ fontSize: '13px', color: colors.textSecondary }}>取消</Text>
        </View>
        <View onClick={onConfirm} style={{ padding: '8px 20px', borderRadius: `${radius.full}px`, backgroundColor: color }}>
          <Text style={{ fontSize: '13px', color: '#fff', fontWeight: 700 }}>{confirmLabel}</Text>
        </View>
      </View>
    </View>
  );
}

function SectionLabel({ children }) {
  return <Text style={{ fontSize: '11px', fontWeight: 700, color: colors.textMuted, letterSpacing: '1px', display: 'block', marginTop: `${spacing.lg}px`, marginBottom: `${spacing.sm}px` }}>{children}</Text>;
}

export default function EditProfilePage() {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [gender, setGender] = useState(user?.gender || '未知');
  const [age, setAge] = useState(user?.age ? String(user.age) : '');
  const [height, setHeight] = useState(user?.height ? String(user.height) : '');
  const [weight, setWeight] = useState(user?.weight ? String(user.weight) : '');
  const [contactPhone, setContactPhone] = useState(user?.contactPhone || '');
  const [deliveryAddress, setDeliveryAddress] = useState(user?.deliveryAddress || '');

  const hp = user?.healthProfile || {};
  const [bloodTypeABO, setBloodTypeABO] = useState(user?.bloodTypeABO || '');
  const [bloodTypeRH, setBloodTypeRH] = useState(user?.bloodTypeRH || '');
  const [bloodType] = useState(hp.bloodType || '');
  const [allergies, setAllergies] = useState(Array.isArray(hp.allergies) ? hp.allergies : []);
  const [medicalHistory, setMedicalHistory] = useState(Array.isArray(hp.medicalHistory) ? hp.medicalHistory : []);
  const [medications, setMedications] = useState(Array.isArray(hp.medications) ? hp.medications : []);
  const [familyHistoryNote, setFamilyHistoryNote] = useState(hp.familyHistoryNote || '');
  const [surgeries, setSurgeries] = useState(Array.isArray(hp.surgeries) ? hp.surgeries : []);
  const [drugAllergy, setDrugAllergy] = useState(hp.drugAllergy || '');
  const [foodAllergy, setFoodAllergy] = useState(hp.foodAllergy || '');
  const [pastHistory, setPastHistory] = useState(hp.pastHistory || '');
  const [medicHistory, setMedicHistory] = useState(hp.medicHistory || '');
  const [surgeryHistory, setSurgeryHistory] = useState(hp.surgeryHistory || '');
  const [infectiousHistory] = useState(hp.infectiousHistory || '');
  const [menstrualHistory, setMenstrualHistory] = useState(hp.menstrualHistory || '');
  const [maritalHistory, setMaritalHistory] = useState(hp.maritalHistory || hp.reproductiveHistory || '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!name.trim()) { setError('请输入姓名'); return; }
    setError('');
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        gender,
        age: age ? Number(age) : undefined,
        height: height ? Number(height) : undefined,
        weight: weight ? Number(weight) : undefined,
        contactPhone: contactPhone.trim() || undefined,
        deliveryAddress: deliveryAddress.trim() || undefined,
        bloodTypeABO,
        bloodTypeRH,
        healthProfile: {
          bloodType: bloodTypeABO && bloodTypeRH ? `${bloodTypeABO}型 Rh${bloodTypeRH === '阳性' ? '+' : '-'}` : bloodType,
          allergies,
          medicalHistory,
          medications,
          familyHistory: hp.familyHistory || [],
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
        Taro.showToast({ title: '保存成功', icon: 'success' });
        setTimeout(() => Taro.navigateBack(), 800);
      } else {
        setError(res.message || '保存失败');
      }
    } catch (err) {
      setError(err.message || '网络错误');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background, padding: `${spacing.lg}px`, paddingBottom: `${spacing.xxl}px`, boxSizing: 'border-box' }}>
      <SectionLabel>基本信息</SectionLabel>
      <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, padding: `${spacing.md}px` }}>
        <Field label="姓名" value={name} onInput={setName} placeholder="请输入姓名" />
        <View style={{ marginBottom: `${spacing.md}px` }}>
          <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textSecondary, display: 'block', marginBottom: '8px' }}>性别</Text>
          <ChipRow options={GENDER_OPTIONS} value={gender} onChange={setGender} />
        </View>
        <Field label="年龄" value={age} onInput={setAge} type="number" unit="岁" />
        <Field label="联系电话" value={contactPhone} onInput={setContactPhone} placeholder="用于快递联系（与登录手机号独立）" type="number" />
        <View style={{ marginBottom: 0 }}>
          <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textSecondary, display: 'block', marginBottom: '8px' }}>配送地址（快递）</Text>
          <Textarea
            style={{ ...boxStyle, width: '100%', minHeight: '60px' }}
            value={deliveryAddress}
            onInput={(e) => setDeliveryAddress(e.detail.value)}
            placeholder="省市区 + 详细地址 + 收件人姓名"
          />
        </View>
      </View>

      <SectionLabel>身体数据</SectionLabel>
      <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, padding: `${spacing.md}px` }}>
        <Field label="身高" value={height} onInput={setHeight} type="digit" unit="cm" />
        <Field label="体重" value={weight} onInput={setWeight} type="digit" unit="kg" />
      </View>

      <SectionLabel>健康档案</SectionLabel>
      <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, padding: `${spacing.md}px` }}>
        <View style={{ marginBottom: `${spacing.md}px` }}>
          <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textSecondary, display: 'block', marginBottom: '8px' }}>ABO 血型</Text>
          <ChipRow options={ABO_OPTIONS} value={bloodTypeABO} onChange={setBloodTypeABO} />
        </View>
        <View>
          <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textSecondary, display: 'block', marginBottom: '8px' }}>RH 血型</Text>
          <ChipRow options={RH_OPTIONS} value={bloodTypeRH} onChange={setBloodTypeRH} />
        </View>
      </View>

      <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, marginTop: `${spacing.sm}px` }}>
        <ArraySection title="过敏史" icon="⚠️" color="#DC3545" bg="#FDEEEC" items={allergies} fields={ALLERGY_FIELDS}
          displayFn={(r) => [r.substance, r.type && `(${r.type})`, r.reaction && `→${r.reaction}`].filter(Boolean).join(' ')}
          onChange={setAllergies} />
      </View>

      <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, marginTop: `${spacing.sm}px` }}>
        <ArraySection title="既往病史" icon="❤️" color="#0077B6" bg="#EBF5FB" items={medicalHistory} fields={HISTORY_FIELDS}
          displayFn={(r) => [r.disease, r.onsetDate, r.treatment].filter(Boolean).join(' · ')}
          onChange={setMedicalHistory} />
      </View>

      <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, marginTop: `${spacing.sm}px` }}>
        <ArraySection title="用药记录" icon="💊" color="#7C3AED" bg="#F2EEFF" items={medications} fields={MEDICATION_FIELDS}
          displayFn={(r) => [r.chemicalName || r.brandName, r.dose, r.frequency].filter(Boolean).join(' · ')}
          onChange={setMedications} />
      </View>

      <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, marginTop: `${spacing.sm}px`, padding: `${spacing.md}px` }}>
        <View style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, marginBottom: `${spacing.sm}px` }}>
          <View style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: '#FEF3E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: '14px' }}>👪</Text>
          </View>
          <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary }}>家族史</Text>
        </View>
        <Field label="家族史详情" value={familyHistoryNote} onInput={setFamilyHistoryNote} placeholder="如：父亲患高血压，母亲患糖尿病" />
      </View>

      <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, marginTop: `${spacing.sm}px` }}>
        <ArraySection title="手术史" icon="🩹" color="#059669" bg="#D1FAE5" items={surgeries} fields={SURGERY_FIELDS}
          displayFn={(r) => [r.name, r.date, r.outcome].filter(Boolean).join(' · ')}
          onChange={setSurgeries} />
      </View>

      {gender === '女' && (
        <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, marginTop: `${spacing.sm}px`, padding: `${spacing.md}px` }}>
          <View style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, marginBottom: `${spacing.sm}px` }}>
            <View style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: '#FDECEA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: '14px' }}>🌹</Text>
            </View>
            <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary }}>月经史</Text>
          </View>
          <Field label="月经史详情" value={menstrualHistory} onInput={setMenstrualHistory} placeholder="如：初潮14岁，周期28天，规律，无痛经" />
        </View>
      )}

      <SectionLabel>健康摘要</SectionLabel>
      <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, padding: `${spacing.md}px` }}>
        <Field label="药物过敏史" value={drugAllergy} onInput={setDrugAllergy} placeholder="如：青霉素类、无" />
        <Field label="食物过敏史" value={foodAllergy} onInput={setFoodAllergy} placeholder="如：海鲜、无" />
        <Field label="既往史" value={pastHistory} onInput={setPastHistory} placeholder="如：高血压（2020年）" />
        <Field label="用药史" value={medicHistory} onInput={setMedicHistory} placeholder="如：氨氯地平" />
        <Field label="手术史" value={surgeryHistory} onInput={setSurgeryHistory} placeholder="如：无" />
        {!!infectiousHistory && (
          <View style={{ marginBottom: `${spacing.md}px` }}>
            <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textSecondary, display: 'block', marginBottom: '8px' }}>传染病史</Text>
            <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: '14px', color: colors.textSecondary }}>{infectiousHistory}</Text>
              <Text style={{ fontSize: '11px', color: colors.textMuted, backgroundColor: colors.border, padding: '3px 8px', borderRadius: `${radius.full}px` }}>医护录入</Text>
            </View>
          </View>
        )}
        <Field label="婚育史" value={maritalHistory} onInput={setMaritalHistory} placeholder="如：已婚，育有1子；未婚" />
      </View>

      {(user?.basic_insurance || user?.commercial_medical || user?.critical_illness) && (
        <>
          <SectionLabel>医疗保障信息</SectionLabel>
          <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, padding: `${spacing.md}px` }}>
            {!!user.basic_insurance && (
              <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: `${spacing.sm}px` }}>
                <Text style={{ fontSize: '13px', color: colors.textSecondary }}>基础医疗保障：{user.basic_insurance}</Text>
                <Text style={{ fontSize: '11px', color: colors.textMuted, backgroundColor: colors.border, padding: '3px 8px', borderRadius: `${radius.full}px` }}>医护录入</Text>
              </View>
            )}
            {!!user.commercial_medical && (
              <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: `${spacing.sm}px` }}>
                <Text style={{ fontSize: '13px', color: colors.textSecondary }}>医疗险：{user.commercial_medical}</Text>
                <Text style={{ fontSize: '11px', color: colors.textMuted, backgroundColor: colors.border, padding: '3px 8px', borderRadius: `${radius.full}px` }}>医护录入</Text>
              </View>
            )}
            {!!user.critical_illness && (
              <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: '13px', color: colors.textSecondary }}>重疾险：{user.critical_illness}</Text>
                <Text style={{ fontSize: '11px', color: colors.textMuted, backgroundColor: colors.border, padding: '3px 8px', borderRadius: `${radius.full}px` }}>医护录入</Text>
              </View>
            )}
          </View>
        </>
      )}

      <SectionLabel>账号信息</SectionLabel>
      <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, padding: `${spacing.md}px` }}>
        <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: '13px', color: colors.textSecondary }}>手机号：{user?.phone || '--'}</Text>
          <Text style={{ fontSize: '11px', color: colors.textMuted, backgroundColor: colors.border, padding: '3px 8px', borderRadius: `${radius.full}px` }}>不可修改</Text>
        </View>
      </View>

      {!!error && (
        <View style={{ marginTop: `${spacing.md}px`, backgroundColor: colors.danger10, padding: `${spacing.sm}px`, borderRadius: `${radius.sm}px` }}>
          <Text style={{ fontSize: '13px', color: colors.danger }}>{error}</Text>
        </View>
      )}

      <Button
        style={{ backgroundColor: colors.primary, color: '#fff', borderRadius: `${radius.md}px`, height: '50px', lineHeight: '50px', fontSize: '16px', fontWeight: 700, marginTop: `${spacing.xl}px` }}
        loading={saving}
        onClick={save}
      >
        保存修改
      </Button>
    </View>
  );
}
