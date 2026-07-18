import React, { useState, useEffect } from 'react';
import { View, Text, Input, Textarea, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../theme';
import { questionnaireAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

// 对齐 app/src/screens/questionnaire/QuestionnaireScreen.js（1001行，动态表单引擎）
// 简化点：DropdownQuestion 用原生 Picker 代替 app 端的自绘下拉列表（交互等价，视觉不同）
const QUESTIONS = [
  { id: 'q1', type: 'radio', text: '您是否有吸烟习惯？', options: ['从不吸烟', '已戒烟', '偶尔吸烟', '每天吸烟'], required: true },
  { id: 'q2', type: 'multi', text: '请选择您确诊的慢性病（可多选）：', options: ['高血压', '糖尿病', '冠心病', '高脂血症', '慢性肾病', '其他', '无'], required: true },
  { id: 'q3', type: 'scale', text: '请评估您近两周的睡眠质量（1-10分）：', min: 1, max: 10, minLabel: '非常差', maxLabel: '非常好', required: true },
  { id: 'q4', type: 'radio', text: '您每周运动频率是？', options: ['几乎不运动', '1-2次/周', '3-4次/周', '5次以上/周'], required: true },
  { id: 'q5', type: 'matrix', text: '请评估近两周以下状况：', rows: ['入睡困难', '感觉紧张或焦虑', '情绪低落', '食欲减退'], cols: ['无', '轻度', '中度', '重度'], required: true },
  { id: 'q6', type: 'text', text: '您目前正在服用哪些药物？（可选）', placeholder: '如：苯磺酸氨氯地平片5mg，每日一次...', required: false },
  { id: 'q7', type: 'radio', text: '您家族中是否有以下遗传病史？', options: ['无', '高血压', '糖尿病', '心脏病', '肿瘤', '其他'], required: true },
];

const getOptLabel = (opt) => (typeof opt === 'string' ? opt : (opt?.label || ''));
const isOptAllowInput = (opt) => typeof opt === 'object' && !!opt?.allowInput;
const isOptExclusive = (opt) => typeof opt === 'object' && !!opt?.exclusive;

const REC_META = { warning: { icon: '⚠️', color: '#F59E0B', bg: '#FEF3C7' }, tip: { icon: 'ℹ️', color: '#3B82F6', bg: '#EFF6FF' }, good: { icon: '✅', color: '#10B981', bg: '#ECFDF5' } };

function ProgressBar({ current, total }) {
  const pct = (current / total) * 100;
  return (
    <View style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, padding: `${spacing.sm}px ${spacing.lg}px` }}>
      <View style={{ flex: 1, height: '6px', borderRadius: '3px', backgroundColor: colors.border, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: colors.primary, borderRadius: '3px' }} />
      </View>
      <Text style={{ fontSize: '12px', color: colors.textMuted }}>{current}/{total}</Text>
    </View>
  );
}

function RadioQuestion({ q, answer, onAnswer, inputTexts, onInputText }) {
  const selectedLabel = typeof answer === 'object' ? answer?.value : answer;
  return (
    <View>
      {(q.options || []).map((opt, i) => {
        const label = getOptLabel(opt);
        const allowInput = isOptAllowInput(opt);
        const isSelected = selectedLabel === label;
        return (
          <View key={i} style={{ marginBottom: `${spacing.sm}px` }}>
            <View onClick={() => onAnswer(label)} style={{
              display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, padding: `${spacing.md}px`, borderRadius: `${radius.sm}px`,
              border: `1.5px solid ${isSelected ? colors.primary : colors.border}`, backgroundColor: isSelected ? colors.primary10 : '#fff',
            }}>
              <View style={{ width: '18px', height: '18px', borderRadius: '9px', border: `2px solid ${isSelected ? colors.primary : colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {isSelected && <View style={{ width: '9px', height: '9px', borderRadius: '5px', backgroundColor: colors.primary }} />}
              </View>
              <Text style={{ fontSize: '14px', color: isSelected ? colors.primary : colors.textPrimary, fontWeight: isSelected ? 700 : 400 }}>{label}</Text>
            </View>
            {isSelected && allowInput && (
              <Textarea
                style={{ marginTop: '6px', minHeight: '40px', width: '100%', boxSizing: 'border-box', border: `1.5px solid ${colors.border}`, borderRadius: `${radius.sm}px`, padding: `${spacing.sm}px`, fontSize: '14px' }}
                placeholder="请在此填写补充说明..."
                value={inputTexts?.[label] || ''}
                onInput={(e) => onInputText(label, e.detail.value)}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

function MultiQuestion({ q, answer = [], onAnswer, inputTexts, onInputText }) {
  const selectedLabels = Array.isArray(answer) ? answer : (answer?.values || []);
  const toggle = (opt) => {
    const label = getOptLabel(opt);
    const isExcl = isOptExclusive(opt);
    const isOldExclusive = label === '无';
    if (isExcl || isOldExclusive) {
      onAnswer(selectedLabels.includes(label) ? [] : [label]);
    } else {
      const exclusiveLabels = (q.options || []).filter((o) => isOptExclusive(o) || getOptLabel(o) === '无').map(getOptLabel);
      const filtered = selectedLabels.filter((v) => !exclusiveLabels.includes(v));
      onAnswer(filtered.includes(label) ? filtered.filter((v) => v !== label) : [...filtered, label]);
    }
  };
  return (
    <View>
      {(q.options || []).map((opt, i) => {
        const label = getOptLabel(opt);
        const allowInput = isOptAllowInput(opt);
        const isSelected = selectedLabels.includes(label);
        return (
          <View key={i} style={{ marginBottom: `${spacing.sm}px` }}>
            <View onClick={() => toggle(opt)} style={{
              display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, padding: `${spacing.md}px`, borderRadius: `${radius.sm}px`,
              border: `1.5px solid ${isSelected ? colors.primary : colors.border}`, backgroundColor: isSelected ? colors.primary10 : '#fff',
            }}>
              <View style={{ width: '18px', height: '18px', borderRadius: '4px', border: `2px solid ${isSelected ? colors.primary : colors.border}`, backgroundColor: isSelected ? colors.primary : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {isSelected && <Text style={{ color: '#fff', fontSize: '11px' }}>✓</Text>}
              </View>
              <Text style={{ fontSize: '14px', color: isSelected ? colors.primary : colors.textPrimary, fontWeight: isSelected ? 700 : 400 }}>{label}</Text>
            </View>
            {isSelected && allowInput && (
              <Textarea
                style={{ marginTop: '4px', minHeight: '40px', width: '100%', boxSizing: 'border-box', border: `1.5px solid ${colors.border}`, borderRadius: `${radius.sm}px`, padding: `${spacing.sm}px`, fontSize: '14px' }}
                placeholder="请在此填写补充说明..."
                value={inputTexts?.[label] || ''}
                onInput={(e) => onInputText(label, e.detail.value)}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

function ScaleQuestion({ q, answer, onAnswer }) {
  const nums = Array.from({ length: q.max - q.min + 1 }, (_, i) => i + q.min);
  return (
    <View>
      <View style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: `${spacing.sm}px` }}>
        {nums.map((n) => (
          <View key={n} onClick={() => onAnswer(n)} style={{
            width: '38px', height: '38px', borderRadius: '19px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1.5px solid ${answer === n ? colors.primary : colors.border}`, backgroundColor: answer === n ? colors.primary : '#fff',
          }}>
            <Text style={{ fontSize: '14px', color: answer === n ? '#fff' : colors.textPrimary, fontWeight: answer === n ? 700 : 400 }}>{n}</Text>
          </View>
        ))}
      </View>
      <View style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: '11px', color: colors.textMuted }}>{q.minLabel}</Text>
        <Text style={{ fontSize: '11px', color: colors.textMuted }}>{q.maxLabel}</Text>
      </View>
    </View>
  );
}

function MatrixQuestion({ q, answer = {}, onAnswer }) {
  const select = (row, col) => onAnswer({ ...answer, [row]: col });
  return (
    <View>
      <View style={{ display: 'flex' }}>
        <View style={{ flex: 2 }} />
        {q.cols.map((col) => (
          <Text key={col} style={{ flex: 1, textAlign: 'center', fontSize: '11px', color: colors.textMuted }}>{col}</Text>
        ))}
      </View>
      {q.rows.map((row) => (
        <View key={row} style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${colors.borderLight}` }}>
          <Text style={{ flex: 2, fontSize: '13px', color: colors.textPrimary }}>{row}</Text>
          {q.cols.map((col) => (
            <View key={col} onClick={() => select(row, col)} style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
              <View style={{
                width: '18px', height: '18px', borderRadius: '9px', border: `2px solid ${answer[row] === col ? colors.primary : colors.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {answer[row] === col && <View style={{ width: '9px', height: '9px', borderRadius: '5px', backgroundColor: colors.primary }} />}
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function TextQuestion({ q, answer, onAnswer }) {
  return (
    <Textarea
      style={{ width: '100%', boxSizing: 'border-box', border: `1.5px solid ${colors.border}`, borderRadius: `${radius.sm}px`, padding: `${spacing.md}px`, fontSize: '14px', minHeight: '90px' }}
      placeholder={q.placeholder || '请输入'}
      value={answer || ''}
      onInput={(e) => onAnswer(e.detail.value)}
    />
  );
}

function NumberQuestion({ q, answer, onAnswer }) {
  return (
    <Input
      type="digit"
      style={{ width: '100%', boxSizing: 'border-box', border: `1.5px solid ${colors.border}`, borderRadius: `${radius.sm}px`, padding: `${spacing.md}px`, fontSize: '14px' }}
      placeholder={q.placeholder || '请输入数字'}
      value={answer !== undefined && answer !== null ? String(answer) : ''}
      onInput={(e) => { const num = parseFloat(e.detail.value); onAnswer(isNaN(num) ? e.detail.value : num); }}
    />
  );
}

export default function QuestionnairePage() {
  const { updateUser } = useAuth();
  const [mode, setMode] = useState('select');
  const [pendingQs, setPendingQs] = useState([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [selectedDynamic, setSelectedDynamic] = useState(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [history, setHistory] = useState([]);
  const [answers, setAnswers] = useState({});
  const [inputTexts, setInputTexts] = useState({});
  const [showSummary, setShowSummary] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    questionnaireAPI.pending().then((res) => setPendingQs(res.data || [])).catch(() => {}).finally(() => setLoadingPending(false));
  }, []);

  const activeQuestions = mode === 'dynamic' ? (selectedDynamic?.questions || []) : QUESTIONS;
  const q = activeQuestions[currentQ] || activeQuestions[0];
  const answer = q ? answers[q.id] : undefined;

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
      ? (Array.isArray(answer) ? answer.length > 0 : Array.isArray(rawAnswer) ? rawAnswer.length > 0 : false)
      : (Array.isArray(rawAnswer) ? rawAnswer.length > 0
        : (typeof rawAnswer === 'object' && rawAnswer !== null ? Object.keys(rawAnswer).length > 0
          : (rawAnswer !== undefined && rawAnswer !== null && rawAnswer !== '')));

  const setAnswer = (val) => setAnswers((prev) => ({ ...prev, [q.id]: val }));
  const setInputText = (optLabel, text) => setInputTexts((prev) => ({ ...prev, [q.id]: { ...(prev[q.id] || {}), [optLabel]: text } }));

  const getNextIndex = (fromIndex, qs, ans) => {
    const question = qs[fromIndex];
    if (!question || !question.jumpLogic || question.jumpLogic.length === 0) return fromIndex + 1;
    const currentAnswer = ans[question.id];
    const answerLabel = typeof currentAnswer === 'string' ? currentAnswer : Array.isArray(currentAnswer) ? currentAnswer : currentAnswer?.value || null;
    for (const rule of question.jumpLogic) {
      const matched = Array.isArray(answerLabel) ? answerLabel.includes(rule.condition) : answerLabel === rule.condition;
      if (matched && rule.jumpTo) {
        const targetIdx = qs.findIndex((qq) => qq.id === rule.jumpTo);
        if (targetIdx !== -1) return targetIdx;
      }
    }
    return fromIndex + 1;
  };

  const next = () => {
    if (q.required && !hasAnswer) { setErrorMsg('此题为必填项，请作答后继续'); return; }
    setErrorMsg('');
    const nextIdx = getNextIndex(currentQ, activeQuestions, answers);
    if (nextIdx < activeQuestions.length) { setHistory((prev) => [...prev, currentQ]); setCurrentQ(nextIdx); }
    else setShowSummary(true);
  };

  const prev = () => {
    setErrorMsg('');
    if (history.length > 0) { const prevIdx = history[history.length - 1]; setHistory((h) => h.slice(0, -1)); setCurrentQ(prevIdx); }
    else if (currentQ > 0) setCurrentQ((i) => i - 1);
  };
  const hasPrev = history.length > 0 || currentQ > 0;

  useEffect(() => {
    if (!q && !showSummary && !submitResult && mode !== 'select') setShowSummary(true);
  }, [q, showSummary, submitResult, mode]);

  const resetQuiz = () => {
    setCurrentQ(0); setHistory([]); setAnswers({}); setInputTexts({}); setShowSummary(false); setSubmitResult(null); setErrorMsg('');
  };

  const buildFinalAnswers = () => {
    const final = {};
    for (const qId of Object.keys(answers)) {
      const ans = answers[qId];
      const inputs = inputTexts[qId];
      if (!inputs || Object.keys(inputs).length === 0) final[qId] = ans;
      else if (Array.isArray(ans)) final[qId] = { values: ans, inputs };
      else final[qId] = { value: ans, inputs };
    }
    return final;
  };

  const submit = async () => {
    setSubmitting(true); setErrorMsg('');
    const finalAnswers = buildFinalAnswers();
    try {
      if (mode === 'dynamic' && selectedDynamic) {
        const res = await questionnaireAPI.submitDynamic(selectedDynamic._id, finalAnswers);
        if (res.success) {
          setSubmitResult({ dynamic: true, message: res.message, totalScore: res.totalScore, scoreRange: res.scoreRange || null });
          setPendingQs((prev) => prev.filter((dq) => dq._id !== selectedDynamic._id));
        } else setErrorMsg(res.message || '提交失败，请重试');
      } else {
        const res = await questionnaireAPI.submit(finalAnswers);
        if (res.success) {
          if (res.data?.healthScore != null) updateUser({ healthScore: res.data.healthScore });
          setSubmitResult({ score: res.data?.healthScore, bonusScore: res.data?.bonusScore, recommendations: res.data?.recommendations || [] });
        } else setErrorMsg(res.message || '提交失败，请重试');
      }
    } catch (err) {
      setErrorMsg(err.message || '网络错误，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  // ── 着陆页 ──
  if (mode === 'select') {
    return (
      <View style={{ minHeight: '100vh', backgroundColor: colors.background, paddingBottom: `${spacing.xxl}px` }}>
        <View style={{ padding: `${spacing.lg}px` }}>
          <Text style={{ fontSize: '13px', color: colors.textMuted, display: 'block', marginBottom: `${spacing.md}px` }}>完成问卷可帮助您的健管师更好地了解您的健康状况</Text>
          {loadingPending && <Text style={{ fontSize: '13px', color: colors.textMuted }}>检查待填问卷...</Text>}
          {!loadingPending && pendingQs.length === 0 && (
            <View style={{ textAlign: 'center', padding: `${spacing.xl}px 0` }}>
              <Text style={{ fontSize: '40px', display: 'block', marginBottom: `${spacing.sm}px` }}>✅</Text>
              <Text style={{ fontSize: '15px', color: colors.textSecondary, fontWeight: 600, display: 'block' }}>暂无待填问卷</Text>
              <Text style={{ fontSize: '13px', color: colors.textMuted }}>您的健管师会在需要时向您推送问卷，届时将在此显示</Text>
            </View>
          )}
          {!loadingPending && pendingQs.length > 0 && (
            <>
              <Text style={{ fontSize: '12px', color: colors.primary, fontWeight: 700, display: 'block', marginBottom: `${spacing.sm}px` }}>🔔 待填问卷 ({pendingQs.length})</Text>
              {pendingQs.map((dq) => (
                <View key={dq._id} onClick={() => { resetQuiz(); setSelectedDynamic(dq); setMode('dynamic'); }} style={{
                  display: 'flex', alignItems: 'center', gap: `${spacing.md}px`, backgroundColor: '#fff', borderRadius: `${radius.md}px`,
                  border: `1.5px solid ${colors.warning}60`, padding: `${spacing.md}px`, marginBottom: `${spacing.sm}px`, boxShadow: shadow.sm,
                }}>
                  <View style={{ width: '48px', height: '48px', borderRadius: `${radius.sm}px`, backgroundColor: colors.warning10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Text style={{ fontSize: '22px' }}>📝</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary, display: 'block' }}>{dq.title}</Text>
                    {!!dq.description && <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block' }}>{dq.description}</Text>}
                    <Text style={{ fontSize: '11px', color: colors.textMuted }}>{dq.questions?.length || 0} 道题{dq.deadline ? ` · 截止 ${dq.deadline}` : ''}</Text>
                  </View>
                  <Text style={{ fontSize: '14px', color: colors.textMuted }}>›</Text>
                </View>
              ))}
            </>
          )}
        </View>
      </View>
    );
  }

  // ── 提交成功页 ──
  if (submitResult) {
    if (submitResult.dynamic) {
      return (
        <View style={{ minHeight: '100vh', backgroundColor: colors.background, textAlign: 'center', padding: `${spacing.xl}px` }}>
          <Text style={{ fontSize: '56px', display: 'block', margin: '20px 0' }}>✅</Text>
          <Text style={{ fontSize: '20px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: '8px' }}>问卷提交成功！</Text>
          <Text style={{ fontSize: '14px', color: colors.textSecondary, display: 'block', marginBottom: `${spacing.lg}px` }}>{submitResult.message || '感谢您认真填写本次问卷。'}</Text>
          {submitResult.totalScore != null && submitResult.totalScore > 0 && (
            <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.lg}px`, marginBottom: `${spacing.lg}px`, boxShadow: shadow.sm }}>
              <Text style={{ fontSize: '13px', color: colors.textMuted, display: 'block' }}>问卷得分</Text>
              <Text style={{ fontSize: '32px', fontWeight: 800, color: colors.primary, display: 'block' }}>{submitResult.totalScore}</Text>
              {submitResult.scoreRange && (
                <View style={{ marginTop: '8px', backgroundColor: '#E8F5EF', borderRadius: '8px', padding: '10px' }}>
                  <Text style={{ fontSize: '15px', fontWeight: 700, color: colors.primary, display: 'block' }}>{submitResult.scoreRange.label}</Text>
                  {!!submitResult.scoreRange.description && <Text style={{ fontSize: '13px', color: colors.textSecondary }}>{submitResult.scoreRange.description}</Text>}
                </View>
              )}
            </View>
          )}
          <View onClick={() => { setMode('select'); setSubmitResult(null); }} style={{ display: 'inline-block', padding: '14px 40px', backgroundColor: colors.primary, borderRadius: `${radius.md}px` }}>
            <Text style={{ fontSize: '16px', color: '#fff', fontWeight: 700 }}>返回问卷列表</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={{ minHeight: '100vh', backgroundColor: colors.background, textAlign: 'center', padding: `${spacing.xl}px` }}>
        <Text style={{ fontSize: '56px', display: 'block', margin: '20px 0' }}>✅</Text>
        <Text style={{ fontSize: '20px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: '8px' }}>问卷提交成功！</Text>
        <Text style={{ fontSize: '14px', color: colors.textSecondary, display: 'block', marginBottom: `${spacing.lg}px` }}>感谢您完成健康初评问卷，您的回答已保存至健康档案。</Text>
        {submitResult.score != null && (
          <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.lg}px`, marginBottom: `${spacing.lg}px`, boxShadow: shadow.sm }}>
            <Text style={{ fontSize: '13px', color: colors.textMuted, display: 'block' }}>本次评估健康得分</Text>
            <Text style={{ fontSize: '32px', fontWeight: 800, color: colors.primary, display: 'block' }}>{submitResult.score}</Text>
            {submitResult.bonusScore > 0 && <Text style={{ fontSize: '13px', color: colors.success }}>+{submitResult.bonusScore} 分（问卷奖励）</Text>}
          </View>
        )}
        {submitResult.recommendations?.length > 0 && (
          <View style={{ textAlign: 'left', marginBottom: `${spacing.lg}px` }}>
            <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: `${spacing.sm}px` }}>✨ 个性化健康建议</Text>
            {submitResult.recommendations.map((rec, i) => {
              const meta = REC_META[rec.type] || REC_META.tip;
              return (
                <View key={i} style={{ display: 'flex', gap: '8px', backgroundColor: meta.bg, border: `1px solid ${meta.color}40`, borderRadius: `${radius.sm}px`, padding: `${spacing.sm}px`, marginBottom: '8px' }}>
                  <Text style={{ fontSize: '15px' }}>{meta.icon}</Text>
                  <Text style={{ fontSize: '13px', color: rec.type === 'warning' ? '#92400E' : rec.type === 'good' ? '#065F46' : '#1E3A5F', flex: 1, lineHeight: '19px' }}>{rec.text}</Text>
                </View>
              );
            })}
          </View>
        )}
        <View onClick={() => Taro.navigateBack()} style={{ display: 'inline-block', padding: '14px 40px', backgroundColor: colors.primary, borderRadius: `${radius.md}px` }}>
          <Text style={{ fontSize: '16px', color: '#fff', fontWeight: 700 }}>完成</Text>
        </View>
      </View>
    );
  }

  const pageTitle = mode === 'dynamic' ? (selectedDynamic?.title || '健康问卷') : '健康初评问卷';

  // ── 汇总确认页 ──
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
    const finalAns = buildFinalAnswers();
    return (
      <View style={{ minHeight: '100vh', backgroundColor: colors.background, display: 'flex', flexDirection: 'column' }}>
        <View style={{ display: 'flex', alignItems: 'center', padding: `${spacing.md}px ${spacing.lg}px`, backgroundColor: '#fff', borderBottom: `1px solid ${colors.border}` }}>
          <Text onClick={() => setShowSummary(false)} style={{ fontSize: '15px', color: colors.textPrimary, marginRight: '12px' }}>‹</Text>
          <Text style={{ flex: 1, fontSize: '16px', fontWeight: 700, color: colors.textPrimary, textAlign: 'center', marginRight: '20px' }}>确认提交</Text>
        </View>
        <ScrollView scrollY style={{ flex: 1, padding: `${spacing.lg}px` }}>
          <View style={{ textAlign: 'center', marginBottom: `${spacing.lg}px` }}>
            <Text style={{ fontSize: '36px', display: 'block' }}>✅</Text>
            <Text style={{ fontSize: '16px', fontWeight: 700, color: colors.textPrimary, display: 'block' }}>所有问题已回答</Text>
            <Text style={{ fontSize: '13px', color: colors.textMuted }}>请确认您的答案无误后提交</Text>
          </View>
          {activeQuestions.map((question, i) => (
            <View key={question.id} style={{ backgroundColor: '#fff', borderRadius: `${radius.sm}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.sm}px`, boxShadow: shadow.xs }}>
              <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textPrimary, display: 'block', marginBottom: '4px' }}>{i + 1}. {question.text}</Text>
              <Text style={{ fontSize: '13px', color: colors.textSecondary }}>{fmtAns(finalAns[question.id])}</Text>
            </View>
          ))}
          {!!errorMsg && <Text style={{ fontSize: '13px', color: colors.danger, display: 'block', marginTop: `${spacing.sm}px` }}>{errorMsg}</Text>}
          <View style={{ height: '100px' }} />
        </ScrollView>
        <View style={{ padding: `${spacing.md}px ${spacing.lg}px`, backgroundColor: '#fff', borderTop: `1px solid ${colors.border}` }}>
          <View onClick={submitting ? undefined : submit} style={{ textAlign: 'center', padding: '14px', borderRadius: `${radius.md}px`, backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }}>
            <Text style={{ fontSize: '16px', color: '#fff', fontWeight: 700 }}>{submitting ? '提交中...' : '📤 提交问卷'}</Text>
          </View>
        </View>
      </View>
    );
  }

  if (!q) {
    return <View style={{ minHeight: '100vh', backgroundColor: colors.background, textAlign: 'center', padding: `${spacing.xl}px` }}><Text style={{ fontSize: '13px', color: colors.textMuted }}>加载问卷...</Text></View>;
  }

  // ── 答题页 ──
  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background, display: 'flex', flexDirection: 'column' }}>
      <View style={{ display: 'flex', alignItems: 'center', padding: `${spacing.md}px ${spacing.lg}px`, backgroundColor: '#fff', borderBottom: `1px solid ${colors.border}` }}>
        <Text onClick={() => (hasPrev ? prev() : setMode('select'))} style={{ fontSize: '15px', color: colors.textPrimary, marginRight: '12px' }}>‹</Text>
        <Text style={{ flex: 1, fontSize: '16px', fontWeight: 700, color: colors.textPrimary, textAlign: 'center' }}>{pageTitle}</Text>
        <Text onClick={() => setMode('select')} style={{ fontSize: '13px', color: colors.textMuted }}>退出</Text>
      </View>
      <ProgressBar current={currentQ + 1} total={activeQuestions.length} />
      <ScrollView scrollY style={{ flex: 1, padding: `${spacing.lg}px` }}>
        <Text style={{ fontSize: '17px', fontWeight: 700, color: colors.textPrimary, lineHeight: '24px', display: 'block', marginBottom: `${spacing.md}px` }}>
          {q.text}{q.required && <Text style={{ color: colors.danger }}> *</Text>}
        </Text>
        {q.type === 'radio' && <RadioQuestion q={q} answer={answer} onAnswer={setAnswer} inputTexts={inputTexts[q.id]} onInputText={setInputText} />}
        {q.type === 'multi' && <MultiQuestion q={q} answer={answer} onAnswer={setAnswer} inputTexts={inputTexts[q.id]} onInputText={setInputText} />}
        {q.type === 'scale' && <ScaleQuestion q={q} answer={answer} onAnswer={setAnswer} />}
        {q.type === 'matrix' && <MatrixQuestion q={q} answer={answer} onAnswer={setAnswer} />}
        {q.type === 'text' && <TextQuestion q={q} answer={answer} onAnswer={setAnswer} />}
        {q.type === 'number' && <NumberQuestion q={q} answer={answer} onAnswer={setAnswer} />}
        {q.type === 'date' && <TextQuestion q={{ ...q, placeholder: q.placeholder || '请输入日期（如：2024-01-01）' }} answer={answer} onAnswer={setAnswer} />}
        {!!errorMsg && <Text style={{ fontSize: '13px', color: colors.danger, display: 'block', marginTop: `${spacing.sm}px` }}>{errorMsg}</Text>}
        <View style={{ height: '80px' }} />
      </ScrollView>
      <View style={{ padding: `${spacing.md}px ${spacing.lg}px`, backgroundColor: '#fff', borderTop: `1px solid ${colors.border}` }}>
        <View onClick={next} style={{ textAlign: 'center', padding: '14px', borderRadius: `${radius.md}px`, backgroundColor: colors.primary }}>
          <Text style={{ fontSize: '16px', color: '#fff', fontWeight: 700 }}>{currentQ === activeQuestions.length - 1 ? '完成' : '下一题'}</Text>
        </View>
      </View>
    </View>
  );
}
