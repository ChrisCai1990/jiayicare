import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, TextInput, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { questionnaireAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const QUESTIONS = [
  { id: 'q1', type: 'radio', text: '您是否有吸烟习惯？', options: ['从不吸烟', '已戒烟', '偶尔吸烟', '每天吸烟'], required: true },
  { id: 'q2', type: 'multi', text: '请选择您确诊的慢性病（可多选）：', options: ['高血压', '糖尿病', '冠心病', '高脂血症', '慢性肾病', '其他', '无'], required: true },
  { id: 'q3', type: 'scale', text: '请评估您近两周的睡眠质量（1-10分）：', min: 1, max: 10, minLabel: '非常差', maxLabel: '非常好', required: true },
  { id: 'q4', type: 'radio', text: '您每周运动频率是？', options: ['几乎不运动', '1-2次/周', '3-4次/周', '5次以上/周'], required: true },
  { id: 'q5', type: 'matrix', text: '请评估近两周以下状况：',
    rows: ['入睡困难', '感觉紧张或焦虑', '情绪低落', '食欲减退'],
    cols: ['无', '轻度', '中度', '重度'], required: true },
  { id: 'q6', type: 'text', text: '您目前正在服用哪些药物？（可选）', placeholder: '如：苯磺酸氨氯地平片5mg，每日一次...', required: false },
  { id: 'q7', type: 'radio', text: '您家族中是否有以下遗传病史？', options: ['无', '高血压', '糖尿病', '心脏病', '肿瘤', '其他'], required: true },
];

// ── 选项格式规范化（兼容对象格式与字符串格式）─────────────────────
const getOptLabel = (opt) => typeof opt === 'string' ? opt : (opt?.label || '')
const isOptAllowInput = (opt) => typeof opt === 'object' && !!opt?.allowInput
const isOptExclusive = (opt) => typeof opt === 'object' && !!opt?.exclusive

// ── 进度条 ────────────────────────────────────────────────────────
function ProgressBar({ current, total }) {
  const pct = (current / total) * 100;
  return (
    <View style={styles.progressWrap}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.progressText}>{current}/{total}</Text>
    </View>
  );
}

// ── 单选题（支持 allowInput）────────────────────────────────────
function RadioQuestion({ q, answer, onAnswer, inputTexts, onInputText }) {
  const selectedLabel = typeof answer === 'object' ? answer?.value : answer;
  return (
    <View style={styles.optionList}>
      {(q.options || []).map((opt, i) => {
        const label = getOptLabel(opt);
        const allowInput = isOptAllowInput(opt);
        const isSelected = selectedLabel === label;
        return (
          <View key={i}>
            <TouchableOpacity
              style={[styles.optionRow, isSelected && styles.optionRowActive]}
              onPress={() => onAnswer(label)}
            >
              <View style={[styles.radio, isSelected && styles.radioActive]}>
                {isSelected && <View style={styles.radioInner} />}
              </View>
              <Text style={[styles.optionText, isSelected && styles.optionTextActive]}>{label}</Text>
            </TouchableOpacity>
            {isSelected && allowInput && (
              <TextInput
                style={[styles.textAnswer, { marginTop: 6, minHeight: 40 }]}
                placeholder="请在此填写补充说明..."
                value={inputTexts?.[label] || ''}
                onChangeText={v => onInputText(label, v)}
                placeholderTextColor={colors.textMuted}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

// ── 多选题（支持 exclusive + allowInput）────────────────────────
function MultiQuestion({ q, answer = [], onAnswer, inputTexts, onInputText }) {
  const selectedLabels = Array.isArray(answer) ? answer : (answer?.values || []);

  const toggle = (opt) => {
    const label = getOptLabel(opt);
    const isExcl = isOptExclusive(opt);
    // 旧版"无"互斥逻辑 + 新版 exclusive 字段
    const isOldExclusive = label === '无';

    if (isExcl || isOldExclusive) {
      // 选互斥选项：清空其他
      if (selectedLabels.includes(label)) {
        onAnswer([]);
      } else {
        onAnswer([label]);
      }
    } else {
      // 选普通选项：移除所有互斥选项
      const exclusiveLabels = (q.options || [])
        .filter(o => isOptExclusive(o) || getOptLabel(o) === '无')
        .map(getOptLabel);
      const filtered = selectedLabels.filter(v => !exclusiveLabels.includes(v));
      if (filtered.includes(label)) {
        onAnswer(filtered.filter(v => v !== label));
      } else {
        onAnswer([...filtered, label]);
      }
    }
  };

  return (
    <View style={styles.optionList}>
      {(q.options || []).map((opt, i) => {
        const label = getOptLabel(opt);
        const allowInput = isOptAllowInput(opt);
        const isSelected = selectedLabels.includes(label);
        return (
          <View key={i}>
            <TouchableOpacity
              style={[styles.multiTagRow, isSelected && styles.multiTagRowActive]}
              onPress={() => toggle(opt)}
            >
              <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                {isSelected && <Ionicons name="checkmark" size={12} color={colors.white} />}
              </View>
              <Text style={[styles.optionText, isSelected && styles.optionTextActive]}>{label}</Text>
            </TouchableOpacity>
            {isSelected && allowInput && (
              <TextInput
                style={[styles.textAnswer, { marginTop: 4, minHeight: 40 }]}
                placeholder="请在此填写补充说明..."
                value={inputTexts?.[label] || ''}
                onChangeText={v => onInputText(label, v)}
                placeholderTextColor={colors.textMuted}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

function ScaleQuestion({ q, answer, onAnswer }) {
  return (
    <View>
      <View style={styles.scaleRow}>
        {Array.from({ length: q.max - q.min + 1 }, (_, i) => i + q.min).map(n => (
          <TouchableOpacity
            key={n}
            style={[styles.scaleBtn, answer === n && styles.scaleBtnActive]}
            onPress={() => onAnswer(n)}
          >
            <Text style={[styles.scaleBtnText, answer === n && styles.scaleBtnTextActive]}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.scaleLabels}>
        <Text style={styles.scaleLabel}>{q.minLabel}</Text>
        <Text style={styles.scaleLabel}>{q.maxLabel}</Text>
      </View>
    </View>
  );
}

function MatrixQuestion({ q, answer = {}, onAnswer }) {
  const select = (row, col) => onAnswer({ ...answer, [row]: col });
  return (
    <View style={styles.matrix}>
      <View style={styles.matrixHeader}>
        <View style={{ flex: 2 }} />
        {q.cols.map(col => (
          <Text key={col} style={styles.matrixColLabel}>{col}</Text>
        ))}
      </View>
      {q.rows.map(row => (
        <View key={row} style={styles.matrixRow}>
          <Text style={styles.matrixRowLabel}>{row}</Text>
          {q.cols.map(col => (
            <TouchableOpacity
              key={col}
              style={styles.matrixCell}
              onPress={() => select(row, col)}
            >
              <View style={[styles.matrixRadio, answer[row] === col && styles.matrixRadioActive]}>
                {answer[row] === col && <View style={styles.matrixRadioInner} />}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  );
}

function DropdownQuestion({ q, answer, onAnswer }) {
  const [open, setOpen] = useState(false);
  const selectedLabel = typeof answer === 'object' ? answer?.value : answer;
  return (
    <View>
      <TouchableOpacity
        style={[styles.optionRow, { justifyContent: 'space-between' }, selectedLabel && styles.optionRowActive]}
        onPress={() => setOpen(v => !v)}
        activeOpacity={0.85}
      >
        <Text style={[styles.optionText, selectedLabel && styles.optionTextActive]}>
          {selectedLabel || '请选择...'}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: 8, marginTop: 4, maxHeight: 240, overflow: 'hidden' }}>
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator>
            {(q.options || []).map((opt, i) => {
              const label = getOptLabel(opt);
              const isSelected = selectedLabel === label;
              return (
                <TouchableOpacity
                  key={i}
                  style={{ padding: 12, borderBottomWidth: i < q.options.length - 1 ? 1 : 0, borderBottomColor: colors.border, backgroundColor: isSelected ? colors.primary + '10' : colors.white }}
                  onPress={() => { onAnswer(label); setOpen(false); }}
                >
                  <Text style={{ fontSize: 14, color: isSelected ? colors.primary : colors.textPrimary, fontWeight: isSelected ? '600' : '400' }}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

function NumberQuestion({ q, answer, onAnswer }) {
  return (
    <TextInput
      style={styles.textAnswer}
      placeholder={q.placeholder || '请输入数字'}
      keyboardType="numeric"
      value={answer !== undefined && answer !== null ? String(answer) : ''}
      onChangeText={(v) => {
        const num = parseFloat(v);
        onAnswer(isNaN(num) ? v : num);
      }}
      placeholderTextColor={colors.textMuted}
    />
  );
}

function DateQuestion({ q, answer, onAnswer }) {
  return (
    <TextInput
      style={styles.textAnswer}
      placeholder={q.placeholder || '请输入日期（如：2024-01-01）'}
      value={answer || ''}
      onChangeText={onAnswer}
      placeholderTextColor={colors.textMuted}
    />
  );
}

// ── 建议类型配置 ──────────────────────────────────────────────────
const REC_META = {
  warning: { icon: 'warning-outline',      color: '#F59E0B', bg: '#FEF3C7' },
  tip:     { icon: 'information-circle-outline', color: '#3B82F6', bg: '#EFF6FF' },
  good:    { icon: 'checkmark-circle-outline',   color: '#10B981', bg: '#ECFDF5' },
};

// ── 提交成功页面 ──────────────────────────────────────────────────
function SuccessScreen({ score, bonusScore, recommendations = [], onDone }) {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.successWrap}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.successIconWrap}>
          <Ionicons name="checkmark-circle" size={64} color={colors.success} />
        </View>
        <Text style={styles.successTitle}>问卷提交成功！</Text>
        <Text style={styles.successDesc}>感谢您完成健康初评问卷，您的回答已保存至健康档案。</Text>

        {score != null && (
          <View style={styles.scoreCard}>
            <Text style={styles.scoreLabel}>本次评估健康得分</Text>
            <Text style={styles.scoreNum}>{score}</Text>
            {bonusScore > 0 && (
              <Text style={styles.bonusText}>+{bonusScore} 分（问卷奖励）</Text>
            )}
          </View>
        )}

        {recommendations.length > 0 && (
          <View style={styles.recsWrap}>
            <View style={styles.recsHeader}>
              <Ionicons name="sparkles-outline" size={16} color={colors.primary} />
              <Text style={styles.recsTitle}>个性化健康建议</Text>
            </View>
            {recommendations.map((rec, i) => {
              const meta = REC_META[rec.type] || REC_META.tip;
              return (
                <View key={i} style={[styles.recCard, { backgroundColor: meta.bg, borderColor: meta.color + '40' }]}>
                  <Ionicons name={meta.icon} size={18} color={meta.color} style={styles.recIcon} />
                  <Text style={[styles.recText, { color: rec.type === 'warning' ? '#92400E' : rec.type === 'good' ? '#065F46' : '#1E3A5F' }]}>
                    {rec.text}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        <TouchableOpacity style={styles.doneBtn} onPress={onDone} activeOpacity={0.85}>
          <Text style={styles.doneBtnText}>完成</Text>
        </TouchableOpacity>
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── 问卷选择着陆页 ────────────────────────────────────────────────
function LandingScreen({ navigation, pendingQs, loading, onSelectStatic, onSelectDynamic }) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.pageTitle}>健康问卷</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: spacing.sm }}>
          完成问卷可帮助您的健管师更好地了解您的健康状况
        </Text>

        {/* 动态问卷（由医护端推送）*/}
        {loading && (
          <View style={{ alignItems: 'center', padding: spacing.lg }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 8 }}>检查待填问卷...</Text>
          </View>
        )}

        {!loading && pendingQs.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 48, gap: 12 }}>
            <Ionicons name="checkmark-circle-outline" size={48} color={colors.textMuted} />
            <Text style={{ fontSize: 15, color: colors.textSecondary, fontWeight: '600' }}>暂无待填问卷</Text>
            <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center' }}>
              您的健管师会在需要时向您推送问卷，届时将在此显示
            </Text>
          </View>
        )}

        {!loading && pendingQs.length > 0 && (
          <>
            <View style={styles.sectionLabel}>
              <Ionicons name="notifications-outline" size={14} color={colors.primary} />
              <Text style={styles.sectionLabelText}>待填问卷 ({pendingQs.length})</Text>
            </View>
            {pendingQs.map(dq => (
              <TouchableOpacity
                key={dq._id}
                style={[styles.landingCard, { borderColor: colors.warning + '60' }]}
                onPress={() => onSelectDynamic(dq)}
                activeOpacity={0.85}
              >
                <View style={[styles.landingIcon, { backgroundColor: colors.warning + '15' }]}>
                  <Ionicons name="document-text-outline" size={28} color={colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.landingCardTitle}>{dq.title}</Text>
                  {dq.description ? <Text style={styles.landingCardSub}>{dq.description}</Text> : null}
                  <View style={styles.landingCardMeta}>
                    <Ionicons name="list-outline" size={12} color={colors.textMuted} />
                    <Text style={styles.landingCardMetaText}>{dq.questions?.length || 0} 道题</Text>
                    {dq.deadline ? <>
                      <Text style={[styles.landingCardMetaText, { color: colors.danger }]}>
                        · 截止 {dq.deadline}
                      </Text>
                    </> : null}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── 主屏幕 ────────────────────────────────────────────────────────
export default function QuestionnaireScreen({ navigation }) {
  const { updateUser } = useAuth();

  const [mode, setMode] = useState('select');
  const [pendingQs, setPendingQs] = useState([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [selectedDynamic, setSelectedDynamic] = useState(null);

  const [currentQ, setCurrentQ] = useState(0);
  const [history, setHistory] = useState([]); // 访问路径历史，用于"上一题"
  const [answers, setAnswers] = useState({});
  const [inputTexts, setInputTexts] = useState({}); // 附加文本输入 {qId: {optLabel: text}}
  const [showSummary, setShowSummary] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    questionnaireAPI.pending()
      .then(res => setPendingQs(res.data || []))
      .catch(() => {})
      .finally(() => setLoadingPending(false));
  }, []);

  const activeQuestions = mode === 'dynamic' ? (selectedDynamic?.questions || []) : QUESTIONS;

  const q = activeQuestions[currentQ] || activeQuestions[0];
  const answer = q ? answers[q.id] : undefined;

  // 判断当前题是否已有答案（兼容 allowInput 的对象答案）
  const getAnswerValue = (ans) => {
    if (!ans && ans !== 0) return null;
    if (typeof ans === 'object' && ans !== null) {
      if (ans.value !== undefined) return ans.value;
      if (ans.values !== undefined) return ans.values.length > 0 ? ans.values : null;
    }
    return ans;
  };
  const rawAnswer = getAnswerValue(answer);
  const hasAnswer = !q?.required ? true
    : q?.type === 'multi'
      // 多选题：直接检查 answer 数组长度，避免经过 getAnswerValue 转换后丢失信息
      ? (Array.isArray(answer) ? answer.length > 0 : Array.isArray(rawAnswer) ? rawAnswer.length > 0 : false)
      : (Array.isArray(rawAnswer) ? rawAnswer.length > 0
        : (typeof rawAnswer === 'object' && rawAnswer !== null ? Object.keys(rawAnswer).length > 0
        : (rawAnswer !== undefined && rawAnswer !== null && rawAnswer !== '')));

  const setAnswer = (val) => setAnswers(prev => ({ ...prev, [q.id]: val }));

  const setInputText = (optLabel, text) => {
    setInputTexts(prev => ({
      ...prev,
      [q.id]: { ...(prev[q.id] || {}), [optLabel]: text }
    }));
  };

  // 计算跳题后的下一题索引
  const getNextIndex = (fromIndex, qs, ans) => {
    const question = qs[fromIndex];
    if (!question || !question.jumpLogic || question.jumpLogic.length === 0) {
      return fromIndex + 1;
    }
    const currentAnswer = ans[question.id];
    const answerLabel = typeof currentAnswer === 'string' ? currentAnswer
      : Array.isArray(currentAnswer) ? currentAnswer
      : currentAnswer?.value || null;

    for (const rule of question.jumpLogic) {
      const matched = Array.isArray(answerLabel)
        ? answerLabel.includes(rule.condition)
        : answerLabel === rule.condition;
      if (matched && rule.jumpTo) {
        const targetIdx = qs.findIndex(q => q.id === rule.jumpTo);
        if (targetIdx !== -1) return targetIdx;
      }
    }
    return fromIndex + 1;
  };

  const next = () => {
    if (q.required && !hasAnswer) {
      setErrorMsg('此题为必填项，请作答后继续');
      return;
    }
    setErrorMsg('');
    const nextIdx = getNextIndex(currentQ, activeQuestions, answers);
    if (nextIdx < activeQuestions.length) {
      setHistory(prev => [...prev, currentQ]);
      setCurrentQ(nextIdx);
    } else {
      setShowSummary(true);
    }
  };

  const prev = () => {
    setErrorMsg('');
    if (history.length > 0) {
      const prevIdx = history[history.length - 1];
      setHistory(h => h.slice(0, -1));
      setCurrentQ(prevIdx);
    } else if (currentQ > 0) {
      setCurrentQ(i => i - 1);
    }
  };

  const hasPrev = history.length > 0 || currentQ > 0;

  // 防白屏：问卷无题目时自动进入汇总页（必须在所有条件 return 之前，否则违反 Hooks 规则）
  React.useEffect(() => {
    if (!q && !showSummary && !submitResult && mode !== 'select') {
      setShowSummary(true);
    }
  }, [q, showSummary, submitResult, mode]);

  const resetQuiz = () => {
    setCurrentQ(0);
    setHistory([]);
    setAnswers({});
    setInputTexts({});
    setShowSummary(false);
    setSubmitResult(null);
    setErrorMsg('');
  };

  // 构建最终提交答案（合并 inputTexts）
  const buildFinalAnswers = () => {
    const final = {};
    for (const qId of Object.keys(answers)) {
      const ans = answers[qId];
      const inputs = inputTexts[qId];
      if (!inputs || Object.keys(inputs).length === 0) {
        final[qId] = ans;
      } else if (Array.isArray(ans)) {
        final[qId] = { values: ans, inputs };
      } else {
        final[qId] = { value: ans, inputs };
      }
    }
    return final;
  };

  const submit = async () => {
    setSubmitting(true);
    setErrorMsg('');
    const finalAnswers = buildFinalAnswers();
    try {
      if (mode === 'dynamic' && selectedDynamic) {
        const res = await questionnaireAPI.submitDynamic(selectedDynamic._id, finalAnswers);
        if (res.success) {
          setSubmitResult({ dynamic: true, message: res.message, totalScore: res.totalScore, scoreRange: res.scoreRange || null });
          setPendingQs(prev => prev.filter(dq => dq._id !== selectedDynamic._id));
        } else {
          setErrorMsg(res.message || '提交失败，请重试');
        }
      } else {
        const res = await questionnaireAPI.submit(finalAnswers);
        if (res.success) {
          if (res.data?.healthScore != null) {
            updateUser({ healthScore: res.data.healthScore });
          }
          setSubmitResult({
            score: res.data?.healthScore,
            bonusScore: res.data?.bonusScore,
            recommendations: res.data?.recommendations || [],
          });
        } else {
          setErrorMsg(res.message || '提交失败，请重试');
        }
      }
    } catch (err) {
      setErrorMsg(err.message || '网络错误，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  // ── 着陆页 ──────────────────────────────────────────────────────
  if (mode === 'select') {
    return (
      <LandingScreen
        navigation={navigation}
        pendingQs={pendingQs}
        loading={loadingPending}
        onSelectStatic={() => { resetQuiz(); setMode('static'); }}
        onSelectDynamic={(dq) => { resetQuiz(); setSelectedDynamic(dq); setMode('dynamic'); }}
      />
    );
  }

  // ── 提交成功页 ────────────────────────────────────────────────
  if (submitResult) {
    if (submitResult.dynamic) {
      return (
        <SafeAreaView style={styles.container}>
          <ScrollView contentContainerStyle={styles.successWrap} showsVerticalScrollIndicator={false}>
            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark-circle" size={64} color={colors.success} />
            </View>
            <Text style={styles.successTitle}>问卷提交成功！</Text>
            <Text style={styles.successDesc}>{submitResult.message || '感谢您认真填写本次问卷。'}</Text>
            {submitResult.totalScore != null && submitResult.totalScore > 0 && (
              <View style={styles.scoreCard}>
                <Text style={styles.scoreLabel}>问卷得分</Text>
                <Text style={styles.scoreNum}>{submitResult.totalScore}</Text>
                {submitResult.scoreRange && (
                  <View style={{ marginTop: 8, backgroundColor: '#E8F5EF', borderRadius: 8, padding: 10, alignItems: 'center' }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.primary }}>{submitResult.scoreRange.label}</Text>
                    {!!submitResult.scoreRange.description && (
                      <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 4, textAlign: 'center' }}>{submitResult.scoreRange.description}</Text>
                    )}
                  </View>
                )}
              </View>
            )}
            <TouchableOpacity style={styles.doneBtn} onPress={() => { setMode('select'); setSubmitResult(null); }} activeOpacity={0.85}>
              <Text style={styles.doneBtnText}>返回问卷列表</Text>
            </TouchableOpacity>
            <View style={{ height: 32 }} />
          </ScrollView>
        </SafeAreaView>
      );
    }
    return (
      <SuccessScreen
        score={submitResult.score}
        bonusScore={submitResult.bonusScore}
        recommendations={submitResult.recommendations}
        onDone={() => navigation.goBack()}
      />
    );
  }

  const pageTitle = mode === 'dynamic' ? (selectedDynamic?.title || '健康问卷') : '健康初评问卷';

  // ── 汇总确认页 ────────────────────────────────────────────────
  if (showSummary) {
    const fmtAns = (a) => {
      if (!a && a !== 0) return '未填写';
      if (Array.isArray(a)) return a.join('、');
      if (typeof a === 'object' && a !== null) {
        if (Array.isArray(a.values)) {
          const inputsStr = Object.entries(a.inputs || {}).map(([k, v]) => `${k}: ${v}`).join('，');
          return a.values.join('、') + (inputsStr ? `（${inputsStr}）` : '');
        }
        if (a.value) {
          const inputsStr = Object.entries(a.inputs || {}).map(([k, v]) => `${k}: ${v}`).join('，');
          return a.value + (inputsStr ? `（${inputsStr}）` : '');
        }
        return Object.entries(a).map(([k, v]) => `${k}: ${v}`).join('；');
      }
      return String(a);
    };

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => setShowSummary(false)} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.pageTitle}>确认提交</Text>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView style={styles.summaryList}>
          <View style={styles.summaryHeader}>
            <Ionicons name="checkmark-circle" size={40} color={colors.success} />
            <Text style={styles.summaryTitle}>所有问题已回答</Text>
            <Text style={styles.summaryDesc}>请确认您的答案无误后提交</Text>
          </View>
          {activeQuestions.map((question, i) => {
            const finalAns = buildFinalAnswers();
            return (
              <View key={question.id} style={styles.summaryItem}>
                <Text style={styles.summaryQ}>{i + 1}. {question.text}</Text>
                <Text style={styles.summaryA}>{fmtAns(finalAns[question.id])}</Text>
              </View>
            );
          })}

          {!!errorMsg && (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle-outline" size={15} color={colors.danger} />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          )}

          <TouchableOpacity style={styles.submitBtn} onPress={submit} disabled={submitting} activeOpacity={0.85}>
            {submitting
              ? <ActivityIndicator color={colors.white} />
              : <>
                  <Ionicons name="send" size={18} color={colors.white} />
                  <Text style={styles.submitBtnText}>提交问卷</Text>
                </>
            }
          </TouchableOpacity>
          <View style={{ height: spacing.xl }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!q) {
    // 还没进入 summary，先渲染 loading 占位，下一帧 useEffect 会触发 setShowSummary
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ marginTop: 12, fontSize: 13, color: colors.textMuted }}>加载问卷...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── 答题页 ────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => hasPrev ? prev() : setMode('select')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.pageTitle}>{pageTitle}</Text>
        <TouchableOpacity onPress={() => setMode('select')}>
          <Text style={styles.saveText}>退出</Text>
        </TouchableOpacity>
      </View>

      <ProgressBar current={currentQ + 1} total={activeQuestions.length} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.questionCard}>
          <View style={styles.qNum}>
            <Text style={styles.qNumText}>Q{currentQ + 1}</Text>
          </View>
          <Text style={styles.qText}>
            {q.text}
            {q.required && <Text style={{ color: colors.danger }}> *</Text>}
          </Text>

          <View style={styles.qAnswer}>
            {q.type === 'radio' && (
              <RadioQuestion
                q={q} answer={answer} onAnswer={setAnswer}
                inputTexts={inputTexts[q.id]}
                onInputText={(label, text) => setInputText(label, text)}
              />
            )}
            {q.type === 'multi' && (
              <MultiQuestion
                q={q} answer={answer} onAnswer={setAnswer}
                inputTexts={inputTexts[q.id]}
                onInputText={(label, text) => setInputText(label, text)}
              />
            )}
            {q.type === 'dropdown' && <DropdownQuestion q={q} answer={answer} onAnswer={setAnswer} />}
            {q.type === 'scale'    && <ScaleQuestion    q={q} answer={answer} onAnswer={setAnswer} />}
            {q.type === 'matrix'   && <MatrixQuestion   q={q} answer={answer} onAnswer={setAnswer} />}
            {q.type === 'number'   && <NumberQuestion   q={q} answer={answer} onAnswer={setAnswer} />}
            {q.type === 'date'     && <DateQuestion     q={q} answer={answer} onAnswer={setAnswer} />}
            {q.type === 'text' && (
              <TextInput
                style={styles.textAnswer}
                placeholder={q.placeholder}
                multiline
                numberOfLines={4}
                value={answer || ''}
                onChangeText={setAnswer}
                placeholderTextColor={colors.textMuted}
              />
            )}
          </View>
        </View>

        {!!errorMsg && (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle-outline" size={15} color={colors.danger} />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={styles.footer}>
        {hasPrev && (
          <TouchableOpacity style={styles.prevBtn} onPress={prev}>
            <Ionicons name="arrow-back" size={18} color={colors.primary} />
            <Text style={styles.prevBtnText}>上一题</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.nextBtn, !hasAnswer && q.required && styles.nextBtnDisabled]}
          onPress={next}
        >
          <Text style={styles.nextBtnText}>
            {getNextIndex(currentQ, activeQuestions, answers) >= activeQuestions.length ? '查看汇总' : '下一题'}
          </Text>
          <Ionicons name="arrow-forward" size={18} color={colors.white} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: 4, width: 40 },
  pageTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  saveText: { fontSize: 14, color: colors.textMuted },
  progressWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  progressTrack: { flex: 1, height: 6, backgroundColor: colors.border, borderRadius: 3 },
  progressFill: { height: 6, backgroundColor: colors.primary, borderRadius: 3 },
  progressText: { fontSize: 12, color: colors.textMuted, minWidth: 30, textAlign: 'right' },
  content: { flex: 1 },
  questionCard: {
    margin: spacing.lg, backgroundColor: colors.white,
    borderRadius: radius.lg, padding: spacing.lg, ...shadow.sm,
  },
  qNum: {
    alignSelf: 'flex-start', backgroundColor: colors.primary,
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.full, marginBottom: spacing.md,
  },
  qNumText: { fontSize: 12, color: colors.white, fontWeight: '700' },
  qText: { fontSize: 16, color: colors.textPrimary, fontWeight: '600', lineHeight: 24, marginBottom: spacing.lg },
  qAnswer: {},

  // Radio / options
  optionList: { gap: spacing.sm },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.background,
  },
  optionRowActive: { borderColor: colors.primary, backgroundColor: colors.primary + '08' },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioActive: { borderColor: colors.primary },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  optionText: { fontSize: 14, color: colors.textSecondary, flex: 1 },
  optionTextActive: { color: colors.primary, fontWeight: '600' },

  // Multi select (list style with checkbox)
  multiTagRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.background,
  },
  multiTagRowActive: { borderColor: colors.primary, backgroundColor: colors.primary + '08' },
  checkbox: {
    width: 20, height: 20, borderRadius: 4,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxActive: { borderColor: colors.primary, backgroundColor: colors.primary },

  // Scale
  scaleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, justifyContent: 'space-between' },
  scaleBtn: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background,
  },
  scaleBtnActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  scaleBtnText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  scaleBtnTextActive: { color: colors.white },
  scaleLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  scaleLabel: { fontSize: 11, color: colors.textMuted },

  // Matrix
  matrix: { gap: 2 },
  matrixHeader: { flexDirection: 'row', paddingBottom: spacing.xs },
  matrixColLabel: { flex: 1, fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  matrixRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  matrixRowLabel: { flex: 2, fontSize: 13, color: colors.textPrimary },
  matrixCell: { flex: 1, alignItems: 'center' },
  matrixRadio: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  matrixRadioActive: { borderColor: colors.primary },
  matrixRadioInner: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary },

  // Text input
  textAnswer: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, fontSize: 14, color: colors.textPrimary,
    minHeight: 100, textAlignVertical: 'top', backgroundColor: colors.background,
  },

  // Error
  errorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: spacing.lg, marginBottom: spacing.sm,
    backgroundColor: colors.danger + '10', padding: spacing.sm, borderRadius: radius.sm,
  },
  errorText: { fontSize: 13, color: colors.danger, flex: 1 },

  // Footer nav
  footer: {
    flexDirection: 'row', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border,
  },
  prevBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.lg, paddingVertical: 14,
    borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.primary,
  },
  prevBtnText: { fontSize: 15, color: colors.primary, fontWeight: '600' },
  nextBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    paddingVertical: 14, borderRadius: radius.md, backgroundColor: colors.primary,
  },
  nextBtnDisabled: { backgroundColor: colors.textMuted },
  nextBtnText: { fontSize: 15, color: colors.white, fontWeight: '700' },

  // Summary
  summaryList: { flex: 1, padding: spacing.lg },
  summaryHeader: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
  summaryTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  summaryDesc: { fontSize: 13, color: colors.textMuted },
  summaryItem: {
    backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md,
    marginBottom: spacing.sm, ...shadow.xs,
  },
  summaryQ: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 },
  summaryA: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 15, marginTop: spacing.lg,
  },
  submitBtnText: { fontSize: 16, color: colors.white, fontWeight: '700' },

  // Success screen
  successWrap: {
    alignItems: 'center', padding: spacing.xl, paddingTop: spacing.xl * 2,
  },
  successIconWrap: { marginBottom: spacing.lg },
  successTitle: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm },
  successDesc: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: spacing.xl },
  scoreCard: {
    backgroundColor: colors.primary + '10', borderRadius: radius.lg, padding: spacing.lg,
    alignItems: 'center', marginBottom: spacing.xl, width: '100%',
    borderWidth: 1.5, borderColor: colors.primary + '30',
  },
  scoreLabel: { fontSize: 13, color: colors.primary, fontWeight: '600', marginBottom: 8 },
  scoreNum: { fontSize: 48, fontWeight: '900', color: colors.primary, letterSpacing: -2 },
  bonusText: { fontSize: 13, color: colors.success, marginTop: 6, fontWeight: '600' },
  doneBtn: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: 15, paddingHorizontal: spacing.xl * 2,
    alignItems: 'center',
  },
  doneBtnText: { fontSize: 16, color: colors.white, fontWeight: '700' },

  // Landing screen
  landingCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1.5, borderColor: colors.border, ...shadow.xs,
    marginBottom: spacing.sm,
  },
  landingIcon: {
    width: 52, height: 52, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  landingCardTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 3 },
  landingCardSub: { fontSize: 12, color: colors.textSecondary, lineHeight: 18, marginBottom: 4 },
  landingCardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  landingCardMetaText: { fontSize: 12, color: colors.textMuted },
  sectionLabel: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: spacing.sm, marginBottom: spacing.xs,
  },
  sectionLabelText: { fontSize: 13, fontWeight: '700', color: colors.primary },

  // Recommendations
  recsWrap: { width: '100%', marginBottom: spacing.xl },
  recsHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: spacing.md,
  },
  recsTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  recCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    borderWidth: 1, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  recIcon: { marginTop: 1, flexShrink: 0 },
  recText: { fontSize: 13, lineHeight: 20, flex: 1 },
});
