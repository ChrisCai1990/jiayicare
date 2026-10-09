import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { ibdAPI } from '../../services/api';
import { colors, spacing, radius } from '../../theme';

const W = Math.max(260, Dimensions.get('window').width - 64);
const H = 108;
const BLOOD = ['无', '手纸带血', '便表面带血', '明显血便'];
const MEDICATION = [['on_time', '按时'], ['missed', '漏服'], ['changed', '自行调整'], ['not_recorded', '未记录']];
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const freshDiary = () => ({ date: today(), bowelCount: '', looseCount: '', blood: 0, pain: 0, urgency: '', fatigue: '', nightBowel: false, temperature: '', weight: '', medication: 'not_recorded', note: '' });
const ms = date => Date.parse(`${date}T12:00:00+08:00`);

function Choice({ label, active, onPress }) {
  return <TouchableOpacity onPress={onPress} style={[styles.choice, active && styles.choiceActive]}><Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text></TouchableOpacity>;
}

function Field({ label, value, onChange, placeholder }) {
  return <View style={{ marginBottom: 10 }}><Text style={styles.fieldLabel}>{label}</Text><TextInput style={styles.input} keyboardType="decimal-pad" placeholder={placeholder || ''} value={String(value ?? '')} onChangeText={onChange} /></View>;
}

function SeriesChart({ title, rows, maxY, color, start, end, unit = '分', breakDays = 30 }) {
  const points = rows.filter(row => Number.isFinite(Number(row.value)) && Number.isFinite(ms(row.date))).sort((a, b) => a.date.localeCompare(b.date));
  const span = Math.max(1, end - start);
  const yMax = maxY || Math.max(1, ...points.map(row => Number(row.value))) * 1.1;
  const xy = row => ({ x: 10 + ((ms(row.date) - start) / span) * (W - 20), y: 86 - Number(row.value) / yMax * 70 });
  return <View style={styles.chartBox}><View style={styles.chartHeading}><Text style={styles.chartTitle}>{title}</Text><Text style={styles.chartUnit}>{unit}</Text></View>
    {!points.length ? <Text style={styles.empty}>暂无记录</Text> : <><Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Line x1="10" y1="86" x2={W - 10} y2="86" stroke="#DDE9E3" />
      {points.slice(1).map((row, index) => {
        const prev = points[index];
        if ((ms(row.date) - ms(prev.date)) / 86400000 > breakDays) return null;
        const a = xy(prev), b = xy(row);
        return <Line key={`line-${index}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth="2.5" />;
      })}
      {points.map((row, index) => { const p = xy(row); return <Circle key={`${row.id || row.date}-${index}`} cx={p.x} cy={p.y} r="4" fill={color} />; })}
    </Svg><View style={styles.axis}><Text style={styles.axisText}>{new Date(start).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Shanghai' })}</Text><Text style={styles.axisText}>{new Date(end).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Shanghai' })}</Text></View>
    <Text style={styles.chartLatest}>最近：{points[points.length - 1].date} · {points[points.length - 1].value}{unit}</Text></>}
  </View>;
}

export default function IbdInsightsScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [scales, setScales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState(90);
  const [mode, setMode] = useState('trends');
  const [diary, setDiary] = useState(freshDiary);
  const [fc, setFc] = useState({ date: today(), value: '', institution: '' });
  const [scaleType, setScaleType] = useState('phq9');
  const [answers, setAnswers] = useState([]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await ibdAPI.overview(365);
      setData(result.data);
      if (result.data?.enabled) setScales((await ibdAPI.scales()).data || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const saveDiary = async () => {
    setSaving(true); setError('');
    try { await ibdAPI.saveDiary(diary); setDiary(freshDiary()); await load(); setMode('trends'); }
    catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };
  const saveFc = async () => {
    setSaving(true); setError('');
    try { await ibdAPI.addFc(fc); setFc({ date: today(), value: '', institution: '' }); await load(); setMode('trends'); }
    catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };
  const deleteFc = row => Alert.alert('撤回自录结果', `撤回 ${row.date} 的 FC 记录？`, [
    { text: '取消', style: 'cancel' },
    { text: '撤回', style: 'destructive', onPress: async () => { try { await ibdAPI.deleteFc(row.id); await load(); } catch (e) { setError(e.message); } } },
  ]);
  const saveScale = async () => {
    setSaving(true); setError('');
    try {
      const result = await ibdAPI.submitScale(scaleType, answers);
      setAnswers([]); await load(); setMode('trends');
      if (result.data?.safetyConcern) Alert.alert('请及时寻求帮助', `如果此刻有伤害自己的危险，请立即联系身边可信任的人并拨打当地急救电话，或前往急诊。${result.data.safetyHandoffRecorded ? '记录已提交管理团队核实。' : '管理团队通知未能确认，请主动联系健康顾问。'}`);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const selectedScale = scales.find(scale => scale.type === scaleType);
  const end = ms(today()), start = end - period * 86400000;
  const within = rows => (rows || []).filter(row => ms(row.date) >= start && ms(row.date) <= end);
  const diaryRows = within(data?.diary);
  const fcRows = within(data?.fc);
  const scaleRows = within(data?.scales);
  const lines = [
    { title: 'PHQ-9（0–27）', rows: scaleRows.filter(row => row.type === 'phq9').map(row => ({ ...row, value: row.score })), maxY: 27, color: '#7C3AED' },
    { title: 'GAD-7（0–21）', rows: scaleRows.filter(row => row.type === 'gad7').map(row => ({ ...row, value: row.score })), maxY: 21, color: '#A855F7' },
    { title: '每日排便次数', rows: diaryRows.map(row => ({ ...row, value: row.bowelCount })), color: '#1E6B50', unit: '次', breakDays: 3 },
    { title: '腹痛评分', rows: diaryRows.map(row => ({ ...row, value: row.pain })), maxY: 10, color: '#D97706', breakDays: 3 },
  ];

  return <View style={styles.page}><View style={styles.header}><TouchableOpacity onPress={() => navigation.goBack()}><Ionicons name="arrow-back" size={24} color={colors.textPrimary} /></TouchableOpacity><Text style={styles.title}>IBD 病情记录</Text><TouchableOpacity onPress={load}><Ionicons name="refresh" size={22} color={colors.primary} /></TouchableOpacity></View>
    {loading && !data ? <ActivityIndicator style={{ marginTop: 50 }} color={colors.primary} /> : !data?.enabled ? <View style={styles.card}><Text style={styles.paragraph}>{error || '开通 IBD 专病管理服务后，可在这里记录病情并查看趋势。'}</Text></View> :
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.hint}>数据按实际记录日期展示。量表、症状和 FC 的变化仅供就诊沟通，不代表彼此存在因果关系；诊疗方案由专科医师决定。</Text>
        <View style={styles.row}>{[['trends', '趋势'], ['diary', '症状日记'], ['fc', 'FC 结果'], ['scale', '情绪量表']].map(([key, label]) => <Choice key={key} label={label} active={mode === key} onPress={() => { setMode(key); setError(''); }} />)}</View>
        {!!error && <Text style={styles.error}>{error}</Text>}
        {mode === 'trends' && <>
          <View style={styles.row}>{[[90, '近90天'], [365, '近1年']].map(([days, label]) => <Choice key={days} label={label} active={period === days} onPress={() => setPeriod(days)} />)}</View>
          <Text style={styles.sectionTitle}>情绪—症状对照图</Text><Text style={styles.hint}>四条曲线共用日期范围，分别使用各自量程；仅在实际记录日显示数据点。</Text>
          {lines.map(line => <SeriesChart key={line.title} {...line} start={start} end={end} />)}
          <Text style={styles.sectionTitle}>粪便钙卫蛋白（FC）</Text><SeriesChart title="FC 检测趋势" rows={fcRows} color="#0E7490" unit="μg/g" start={start} end={end} breakDays={120} />
          {fcRows.slice().reverse().map(row => <View key={row.id} style={styles.resultRow}><Text style={styles.paragraph}>{row.date}　{row.value} μg/g</Text><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={styles.meta}>{row.source}{row.institution ? ` · ${row.institution}` : ''}{!row.verified ? ' · 待核验' : ''}</Text>{!row.verified && <TouchableOpacity onPress={() => deleteFc(row)}><Text style={styles.error}>撤回</Text></TouchableOpacity>}</View></View>)}
        </>}
        {mode === 'diary' && <View style={styles.card}><Text style={styles.sectionTitle}>每日症状日记</Text><Text style={styles.hint}>同一天再次保存会更新该日记录。请按实际情况填写。</Text>
          <View style={{ marginTop: 12 }}><Text style={styles.fieldLabel}>记录日期</Text><TextInput style={styles.input} value={diary.date} onChangeText={value => setDiary({ ...diary, date: value })} placeholder="YYYY-MM-DD" /></View>
          <Field label="排便总次数 *" value={diary.bowelCount} onChange={value => setDiary({ ...diary, bowelCount: value })} />
          <Field label="稀便或水样便次数 *" value={diary.looseCount} onChange={value => setDiary({ ...diary, looseCount: value })} />
          <Text style={styles.fieldLabel}>便血程度 *</Text><View style={styles.row}>{BLOOD.map((label, index) => <Choice key={label} label={label} active={diary.blood === index} onPress={() => setDiary({ ...diary, blood: index })} />)}</View>
          <Text style={styles.fieldLabel}>腹痛评分（0–10） *</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>{Array.from({ length: 11 }, (_, score) => <Choice key={score} label={String(score)} active={diary.pain === score} onPress={() => setDiary({ ...diary, pain: score })} />)}</ScrollView>
          <Field label="便急评分（0–10）" value={diary.urgency} onChange={value => setDiary({ ...diary, urgency: value })} />
          <Field label="疲劳评分（0–10）" value={diary.fatigue} onChange={value => setDiary({ ...diary, fatigue: value })} />
          <Choice label={diary.nightBowel ? '夜间排便：有' : '夜间排便：无'} active={diary.nightBowel} onPress={() => setDiary({ ...diary, nightBowel: !diary.nightBowel })} />
          <Field label="体温（℃，选填）" value={diary.temperature} onChange={value => setDiary({ ...diary, temperature: value })} />
          <Field label="体重（kg，选填）" value={diary.weight} onChange={value => setDiary({ ...diary, weight: value })} />
          <Text style={styles.fieldLabel}>用药执行</Text><View style={styles.row}>{MEDICATION.map(([key, label]) => <Choice key={key} label={label} active={diary.medication === key} onPress={() => setDiary({ ...diary, medication: key })} />)}</View>
          <TextInput style={[styles.input, { minHeight: 72, textAlignVertical: 'top' }]} multiline placeholder="其他症状、特殊情况（选填）" value={diary.note} onChangeText={value => setDiary({ ...diary, note: value })} />
          <TouchableOpacity disabled={saving || !data.canRecord} style={styles.button} onPress={saveDiary}><Text style={styles.buttonText}>{saving ? '保存中…' : '保存日记'}</Text></TouchableOpacity>
        </View>}
        {mode === 'fc' && <View style={styles.card}><Text style={styles.sectionTitle}>录入 FC 检测结果</Text><Text style={styles.hint}>请按检验报告填写采样日期和 μg/g 数值。客户录入会标记“待核验”；已审核报告中的 FC 会自动纳入曲线。</Text>
          <Text style={styles.fieldLabel}>采样日期</Text><TextInput style={styles.input} value={fc.date} onChangeText={value => setFc({ ...fc, date: value })} placeholder="YYYY-MM-DD" />
          <Field label="FC 数值（μg/g）" value={fc.value} onChange={value => setFc({ ...fc, value })} />
          <Text style={styles.fieldLabel}>检测机构（选填）</Text><TextInput style={styles.input} value={fc.institution} onChangeText={value => setFc({ ...fc, institution: value })} />
          <TouchableOpacity disabled={saving || !data.canRecord} style={styles.button} onPress={saveFc}><Text style={styles.buttonText}>{saving ? '保存中…' : '保存 FC 结果'}</Text></TouchableOpacity>
        </View>}
        {mode === 'scale' && <View style={styles.card}><Text style={styles.sectionTitle}>情绪量表</Text><View style={styles.row}>{[['phq9', 'PHQ-9'], ['gad7', 'GAD-7']].map(([key, label]) => <Choice key={key} label={label} active={scaleType === key} onPress={() => { setScaleType(key); setAnswers([]); }} />)}</View>
          <Text style={styles.hint}>{selectedScale?.intro || ''}请独立完成每道题；结果供健康顾问与您讨论，不能代替诊断。</Text>
          {(selectedScale?.questions || []).map((question, index) => <View key={index} style={styles.question}><Text style={styles.paragraph}>{index + 1}. {question}</Text>{scaleType === 'phq9' && index === 8 && <Text style={styles.error}>如果此刻有伤害自己的危险，请立即联系身边可信任的人并拨打当地急救电话，或前往急诊。</Text>}<View style={styles.row}>{(selectedScale?.options || []).map(option => <Choice key={option.score} label={option.label} active={answers[index] === option.score} onPress={() => setAnswers(current => { const next = [...current]; next[index] = option.score; return next; })} />)}</View></View>)}
          <TouchableOpacity disabled={saving || !data.canRecord || !(selectedScale?.questions || []).every((_, index) => Number.isInteger(answers[index]))} style={styles.button} onPress={saveScale}><Text style={styles.buttonText}>{saving ? '提交中…' : '提交量表'}</Text></TouchableOpacity>
        </View>}
      </ScrollView>}
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background }, header: { backgroundColor: colors.white, paddingTop: 48, paddingBottom: 14, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary }, body: { padding: 16, paddingBottom: 40 },
  hint: { color: colors.textSecondary, fontSize: 12, lineHeight: 19, marginBottom: 10 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  choice: { borderWidth: 1, borderColor: colors.border, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: colors.white, marginRight: 3, marginBottom: 3 },
  choiceActive: { borderColor: colors.primary, backgroundColor: '#E7F4EE' }, choiceText: { fontSize: 12, color: colors.textSecondary }, choiceTextActive: { fontWeight: '700', color: colors.primary },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginTop: 12, marginBottom: 7 }, card: { margin: 16, padding: 14, borderRadius: radius.md, backgroundColor: colors.white },
  paragraph: { fontSize: 13, color: colors.textPrimary, lineHeight: 20 }, fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, marginBottom: 5 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9, marginBottom: 10, color: colors.textPrimary, backgroundColor: colors.white },
  chartBox: { borderRadius: 12, backgroundColor: colors.white, padding: 11, marginBottom: 9 }, chartHeading: { flexDirection: 'row', justifyContent: 'space-between' }, chartTitle: { fontSize: 13, fontWeight: '700', color: colors.textPrimary }, chartUnit: { fontSize: 11, color: colors.textMuted },
  empty: { textAlign: 'center', padding: 24, color: colors.textMuted, fontSize: 12 }, axis: { flexDirection: 'row', justifyContent: 'space-between' }, axisText: { fontSize: 10, color: colors.textMuted }, chartLatest: { marginTop: 5, fontSize: 11, color: colors.textSecondary },
  resultRow: { padding: 11, borderBottomWidth: 1, borderColor: colors.border }, meta: { fontSize: 11, color: colors.textMuted, marginTop: 3 }, error: { color: colors.danger, fontSize: 13, marginVertical: 8 },
  question: { paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border }, button: { backgroundColor: colors.primary, borderRadius: 10, padding: 13, alignItems: 'center', marginTop: 15 }, buttonText: { color: colors.white, fontWeight: '700' },
});
