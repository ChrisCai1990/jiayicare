import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Input } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { colors, spacing, radius } from '../../../theme';
import { useAuth } from '../../../context/AuthContext';
import { userAPI, checkupAPI } from '../../../services/api';
import useNavBar from '../../../hooks/useNavBar';
import Icon from '../../../components/Icon';

// 对齐 app/src/screens/records/ProfileArchiveScreen.js（2026-07-18 健康档案页瘦身后拆出的独立页）
const PROFILE_FIELDS = [
  { key: 'bloodTypeABO',  label: 'ABO 血型',  icon: '🩸' },
  { key: 'bloodTypeRH',   label: 'RH 血型',   icon: '🩸' },
  { key: 'drugAllergy',   label: '药物过敏史', icon: '💊' },
  { key: 'foodAllergy',   label: '食物过敏史', icon: '🍽️' },
  { key: 'pastHistory',   label: '既往史',    icon: '🕐' },
  { key: 'medicHistory',  label: '用药史',    icon: '💊' },
  { key: 'familyHistory', label: '家族史',    icon: '👨‍👩‍👧' },
  { key: 'surgeryHistory',     label: '手术史',    icon: '✂️' },
  { key: 'infectiousHistory',  label: '传染病史',  icon: '⚠️' },
  { key: 'maritalHistory',     label: '婚育史',    icon: '👨‍👩‍👧' },
];

const LIFESTYLE_FIELDS = [
  { key: 'diet',     label: '饮食', icon: '🥗', placeholder: '如：三餐规律，以主食蔬菜为主，少油少盐' },
  { key: 'exercise', label: '运动', icon: '🏃', placeholder: '如：跑步，每周3次，每次30分钟' },
  { key: 'sleep',    label: '睡眠', icon: '🌙', placeholder: '如：7小时，质量良好，早晨清醒' },
  { key: 'water',    label: '饮水', icon: '💧', placeholder: '如：白水为主，每日约2000毫升' },
  { key: 'alcohol',  label: '饮酒', icon: '🍷', placeholder: '如：红酒，每次100ml，每周1次，未曾醉酒' },
  { key: 'smoking',  label: '吸烟', icon: '🚬', placeholder: '如：不吸烟 / 卷烟，每日10支，2010年起' },
  { key: 'bowel',    label: '排便', icon: '💩', placeholder: '如：1次/日，成形，无特殊' },
];

function Row({ icon, label, value, isLast }) {
  return (
    <View style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: `10px ${spacing.md}px`, borderBottom: isLast ? 'none' : `1px solid ${colors.borderLight}`,
    }}>
      <View style={{ display: 'flex', alignItems: 'center' }}>
        <Text style={{ fontSize: '13px', marginRight: '6px' }}>{icon}</Text>
        <Text style={{ fontSize: '13px', color: colors.textSecondary, fontWeight: 500 }}>{label}</Text>
      </View>
      <Text style={{ fontSize: '13px', color: value ? colors.textPrimary : colors.textMuted, fontWeight: 600, maxWidth: '55%', textAlign: 'right' }}>
        {value || '未填写'}
      </Text>
    </View>
  );
}

function SectionHeader({ icon, title, onEdit }) {
  return (
    <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: `${spacing.sm}px` }}>
      <View style={{ display: 'flex', alignItems: 'center' }}>
        <Text style={{ fontSize: '15px', marginRight: '6px' }}>{icon}</Text>
        <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary }}>{title}</Text>
      </View>
      {onEdit && (
        <View onClick={onEdit} style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '4px 8px', borderRadius: `${radius.full}px`, backgroundColor: colors.primary10 }}>
          <Text style={{ fontSize: '12px', color: colors.primary, fontWeight: 600 }}>编辑</Text>
        </View>
      )}
    </View>
  );
}

export default function ProfileArchivePage() {
  const { statusBarHeight } = useNavBar();
  const { user, updateUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [checkupPlan, setCheckupPlan] = useState(null);
  const [medInsurance, setMedInsurance] = useState({ basic_insurance: '', commercial_medical: '', critical_illness: '' });

  const [lifestyle, setLifestyle] = useState({});
  const [lifestyleData, setLifestyleData] = useState({});
  const [editingLifestyle, setEditingLifestyle] = useState(false);
  const [lifestyleDraft, setLifestyleDraft] = useState({});

  const loadArchive = useCallback(async () => {
    const [meRes, checkupRes] = await Promise.allSettled([userAPI.getMe(), checkupAPI.get()]);
    if (meRes.status === 'fulfilled' && meRes.value?.data) {
      const data = meRes.value.data;
      updateUser(data);
      if (data.lifestyle) setLifestyle(data.lifestyle);
      if (data.lifestyle_data) setLifestyleData(data.lifestyle_data);
      setMedInsurance({
        basic_insurance: data.basic_insurance || '',
        commercial_medical: data.commercial_medical || '',
        critical_illness: data.critical_illness || '',
      });
    }
    if (checkupRes.status === 'fulfilled' && checkupRes.value?.data) setCheckupPlan(checkupRes.value.data);
  }, [updateUser]);

  useDidShow(() => { loadArchive().finally(() => setLoading(false)); });

  const hp = user?.healthProfile || {};
  const profile = {
    bloodTypeABO: user?.bloodTypeABO || '',
    bloodTypeRH: user?.bloodTypeRH || '',
    drugAllergy: hp.drugAllergy || '',
    foodAllergy: hp.foodAllergy || '',
    pastHistory: hp.pastHistory || '',
    medicHistory: hp.medicHistory || '',
    familyHistory: hp.familyHistoryNote || (Array.isArray(hp.familyHistory) ? hp.familyHistory.join('、') : hp.familyHistory) || '',
    surgeryHistory: hp.surgeryHistory || '',
    infectiousHistory: user?.infectiousHistory || hp.infectiousHistory || '',
    maritalHistory: hp.maritalHistory || hp.reproductiveHistory || '',
  };

  const saveLifestyle = async () => {
    setLifestyle(lifestyleDraft);
    setEditingLifestyle(false);
    try { await userAPI.updateMe({ lifestyle: lifestyleDraft }); } catch {}
  };

  const dietParts = [];
  const mealMap = { 居家: '居家', 外卖: '外卖', '饭店或外卖': '外食', 少吃: '少吃', 不吃: '不吃' };
  if (lifestyleData.breakfastDetail) dietParts.push(`早${mealMap[lifestyleData.breakfastDetail] || lifestyleData.breakfastDetail}`);
  if (lifestyleData.lunchDetail) dietParts.push(`午${mealMap[lifestyleData.lunchDetail] || lifestyleData.lunchDetail}`);
  if (lifestyleData.dinnerDetail) dietParts.push(`晚${mealMap[lifestyleData.dinnerDetail] || lifestyleData.dinnerDetail}`);
  const dietVal = dietParts.length ? dietParts.join('、') : lifestyle.diet;

  const exParts = [];
  if (lifestyleData.exerciseType) exParts.push(lifestyleData.exerciseType);
  if (lifestyleData.exerciseFrequency && lifestyleData.exerciseFrequency !== '无') exParts.push(lifestyleData.exerciseFrequency);
  if (lifestyleData.exerciseDuration) exParts.push(`${lifestyleData.exerciseDuration}分钟/次`);
  const exVal = exParts.length ? exParts.join('，') : lifestyle.exercise;

  const sleepParts = [];
  if (lifestyleData.sleepTime) sleepParts.push(`入睡${lifestyleData.sleepTime}`);
  if (lifestyleData.wakeTime) sleepParts.push(`起床${lifestyleData.wakeTime}`);
  if (lifestyleData.scheduleRegularity) sleepParts.push(lifestyleData.scheduleRegularity);
  const sleepVal = sleepParts.length ? sleepParts.join('，') : lifestyle.sleep;

  const waterVal = lifestyleData.dailyWater || lifestyle.water;

  const smokeParts = [];
  if (lifestyleData.smokingStatus) smokeParts.push(`吸烟：${lifestyleData.smokingStatus}`);
  if (lifestyleData.drinkingFrequency) smokeParts.push(`饮酒：${lifestyleData.drinkingFrequency}`);
  const smokeVal = smokeParts.length ? smokeParts.join('；') : (lifestyle.alcohol || lifestyle.smoking);

  const allergenList = (lifestyleData.foodAllergens || []).filter((a) => a !== '无');
  const allergyVal = allergenList.length ? allergenList.join('、') : '无';

  const lifestyleItems = [
    { label: '饮食', icon: '🥗', val: dietVal },
    { label: '运动', icon: '🏃', val: exVal },
    { label: '睡眠', icon: '🌙', val: sleepVal },
    { label: '饮水', icon: '💧', val: waterVal },
    { label: '排便', icon: '💩', val: lifestyle.bowel },
    { label: '烟酒', icon: '🍷', val: smokeVal },
    { label: '过敏史', icon: '⚠️', val: allergyVal },
  ];

  const Header = () => (
    <View style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: `${statusBarHeight + 8}px ${spacing.lg}px ${spacing.md}px`,
      backgroundColor: '#fff', borderBottom: `1px solid ${colors.border}`,
    }}>
      <View onClick={() => Taro.navigateBack()} style={{ padding: '4px' }}>
        <Icon name="chevron-left" size={20} color={colors.textPrimary} />
      </View>
      <Text style={{ fontSize: '18px', fontWeight: 700, color: colors.textPrimary }}>个人资料</Text>
      <View style={{ width: '28px' }} />
    </View>
  );

  if (loading) {
    return (
      <View style={{ minHeight: '100vh', backgroundColor: colors.background }}>
        <Header />
        <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
          <Text style={{ fontSize: '13px', color: colors.textMuted }}>加载中…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background }}>
      <Header />
      <View style={{ padding: `${spacing.md}px`, boxSizing: 'border-box' }}>
      {/* 基本信息 */}
      <View style={{ marginBottom: `${spacing.md}px` }}>
        <SectionHeader icon="👤" title="基本信息" onEdit={() => Taro.navigateTo({ url: '/pages/profile/edit/index' })} />
        <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
          <Row icon="👤" label="姓名" value={user?.name} />
          <Row icon="⚧" label="性别" value={user?.gender} />
          <Row icon="🎂" label="年龄" value={user?.age ? `${user.age} 岁` : ''} />
          <Row icon="📏" label="身高" value={user?.height ? `${user.height} cm` : ''} />
          <Row icon="⚖️" label="体重" value={user?.weight ? `${user.weight} kg` : ''} isLast={user?.gender !== '女'} />
          {user?.gender === '女' && <Row icon="🩺" label="月经史" value={profile.menstrualHistory} isLast />}
        </View>
      </View>

      {/* 基础健康档案 */}
      <View style={{ marginBottom: `${spacing.md}px` }}>
        <SectionHeader icon="🗂️" title="基础健康档案" onEdit={() => Taro.navigateTo({ url: '/pages/profile/edit/index' })} />
        <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
          {PROFILE_FIELDS.map((field, i) => (
            <Row key={field.key} icon={field.icon} label={field.label} value={profile[field.key]} isLast={i === PROFILE_FIELDS.length - 1} />
          ))}
        </View>
      </View>

      {/* 医疗保障信息（只读） */}
      {(medInsurance.basic_insurance || medInsurance.commercial_medical || medInsurance.critical_illness) && (
        <View style={{ marginBottom: `${spacing.md}px` }}>
          <SectionHeader icon="🛡️" title="医疗保障信息" />
          <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
            {[
              { label: '基础医疗保障', value: medInsurance.basic_insurance },
              { label: '商业医疗险', value: medInsurance.commercial_medical },
              { label: '重疾险', value: medInsurance.critical_illness },
            ].filter((r) => r.value).map((row, i, arr) => (
              <Row key={row.label} icon="✅" label={row.label} value={row.value} isLast={i === arr.length - 1} />
            ))}
          </View>
        </View>
      )}

      {/* 生活方式 */}
      <View style={{ marginBottom: `${spacing.md}px` }}>
        <SectionHeader icon="☀️" title="生活方式" onEdit={() => { setLifestyleDraft(lifestyle); setEditingLifestyle(true); }} />
        <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
          {lifestyleItems.map((item, i) => (
            <Row key={item.label} icon={item.icon} label={item.label} value={item.val} isLast={i === lifestyleItems.length - 1} />
          ))}
        </View>
      </View>

      {/* 年度复查计划 */}
      {checkupPlan && checkupPlan.items?.length > 0 && (
        <View style={{ marginBottom: `${spacing.md}px` }}>
          <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: `${spacing.sm}px` }}>
            <View style={{ display: 'flex', alignItems: 'center' }}>
              <Text style={{ fontSize: '15px', marginRight: '6px' }}>📅</Text>
              <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary }}>{checkupPlan.title || '年度复查计划'}</Text>
            </View>
            <Text style={{ fontSize: '12px', color: colors.textMuted }}>
              {checkupPlan.items.filter((it) => it.status === 'done').length}/{checkupPlan.items.length} 已完成
            </Text>
          </View>
          {checkupPlan.note && (
            <Text style={{ fontSize: '12px', color: colors.textSecondary, display: 'block', marginBottom: `${spacing.sm}px` }}>{checkupPlan.note}</Text>
          )}
          <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
            {checkupPlan.items.map((item, i, arr) => {
              const isDone = item.status === 'done';
              const isOverdue = item.status === 'overdue';
              return (
                <View key={item._id || i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: `10px ${spacing.md}px`, borderBottom: i < arr.length - 1 ? `1px solid ${colors.borderLight}` : 'none',
                }}>
                  <View style={{ display: 'flex', alignItems: 'center' }}>
                    <Text style={{ fontSize: '13px', marginRight: '6px' }}>{isDone ? '✅' : isOverdue ? '⚠️' : '⭕'}</Text>
                    <Text style={{ fontSize: '13px', color: isDone ? colors.textMuted : colors.textPrimary, textDecoration: isDone ? 'line-through' : 'none' }}>{item.name}</Text>
                  </View>
                  <Text style={{ fontSize: '12px', color: isDone ? colors.success : isOverdue ? colors.danger : colors.textMuted }}>
                    {isDone ? '已完成' : isOverdue ? '已逾期' : (item.targetDate || '待安排')}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      <View style={{ height: '20px' }} />
      </View>

      {/* 编辑生活方式弹窗 */}
      {editingLifestyle && (
        <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: '20px 20px 0 0', padding: `${spacing.lg}px`, width: '100%', boxSizing: 'border-box', maxHeight: '85vh', overflowY: 'auto' }}>
            <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <Text style={{ fontSize: '17px', fontWeight: 700, color: colors.textPrimary }}>编辑生活方式</Text>
              <View onClick={() => setEditingLifestyle(false)}><Text style={{ fontSize: '20px', color: colors.textMuted }}>×</Text></View>
            </View>
            {LIFESTYLE_FIELDS.map((field) => (
              <View key={field.key} style={{ marginBottom: `${spacing.md}px` }}>
                <View style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                  <Text style={{ fontSize: '14px', marginRight: '6px' }}>{field.icon}</Text>
                  <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textSecondary }}>{field.label}</Text>
                </View>
                <Input
                  style={{ backgroundColor: colors.background, border: `1.5px solid ${colors.border}`, borderRadius: `${radius.sm}px`, padding: '10px 12px', fontSize: '14px', boxSizing: 'border-box', width: '100%' }}
                  placeholder={field.placeholder}
                  value={lifestyleDraft[field.key] || ''}
                  onInput={(e) => setLifestyleDraft((p) => ({ ...p, [field.key]: e.detail.value }))}
                />
              </View>
            ))}
            <View style={{ marginBottom: `${spacing.md}px` }}>
              <View style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                <Text style={{ fontSize: '14px', marginRight: '6px' }}>😊</Text>
                <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textSecondary }}>情绪</Text>
                <Text style={{ fontSize: '10px', color: '#F59E0B', fontWeight: 600, backgroundColor: '#FEF3E2', borderRadius: `${radius.full}px`, padding: '1px 6px', marginLeft: '6px' }}>初始记录</Text>
              </View>
              <View style={{ backgroundColor: colors.background, border: `1.5px dashed ${colors.border}`, borderRadius: `${radius.sm}px`, padding: '10px 12px' }}>
                <Text style={{ fontSize: '14px', color: lifestyleDraft.mood ? colors.textPrimary : colors.textMuted }}>
                  {lifestyleDraft.mood || '来自健康初评，如需修改请联系健康管理师'}
                </Text>
              </View>
            </View>
            <View onClick={saveLifestyle} style={{ textAlign: 'center', padding: '14px 0', borderRadius: `${radius.md}px`, backgroundColor: colors.primary, marginTop: `${spacing.sm}px` }}>
              <Text style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>保存生活方式</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
