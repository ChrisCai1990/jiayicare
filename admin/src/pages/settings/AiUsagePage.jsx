import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'
import { useAdmin } from '../../App'
import './AiUsagePage.css'

const number = value => Number(value || 0).toLocaleString('zh-CN')
const fields = [
  ['dailyTokens', '每日总 Token'], ['monthlyTokens', '每月总 Token'],
  ['ocrDailyTokens', 'OCR 每日 Token'], ['otherDailyTokens', '其他 AI 每日 Token'],
  ['reportTokens', '每份报告累计 Token'], ['pageTokens', '每页累计 Token'],
  ['dailyCalls', '每日总调用次数'], ['reportCalls', '每份报告累计调用次数'],
  ['pageCalls', '每页累计调用次数'], ['failureThreshold', '模型连续失败暂停阈值'],
  ['warningPercent', '预算预警比例（%）'], ['dailyYuan', '每日费用上限（元，0 表示不启用）'],
  ['monthlyYuan', '每月费用上限（元，0 表示不启用）'],
]
const models = ['qwen-vl-plus', 'qwen-vl-max', 'qwen-plus', 'deepseek-chat']

export default function AiUsagePage() {
  const { admin } = useAdmin()
  const platform = admin?.role === 'platformSuper'
  const allowed = platform || admin?.role === 'superadmin'
  const [snapshot, setSnapshot] = useState(null)
  const [usage, setUsage] = useState(null)
  const [policy, setPolicy] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const action = async fn => {
    setBusy(true); setError(''); setMessage('')
    try { await fn() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const refresh = async () => {
    const [control, institutionUsage] = await Promise.all([platform ? adminAPI.getAiControl() : Promise.resolve(null), adminAPI.getAiTenantUsage()])
    if (control) { setSnapshot(control.data); setPolicy(control.data.policy) }
    setUsage(institutionUsage.data)
  }
  useEffect(() => { if (allowed) action(refresh) }, [allowed])

  if (!allowed) return <div className="page"><h1 className="page-title">AI 用量管理</h1><p>仅机构超管或平台管理员可查看 AI 用量。</p></div>

  const save = async next => {
    const response = await adminAPI.saveAiPolicy(next, snapshot.policy.revision || 0)
    setPolicy(response.data)
    setSnapshot(previous => ({ ...previous, policy: response.data }))
    setMessage('设置已生效，新调用将使用更新后的限额。')
  }
  const counter = id => snapshot?.counters.find(row => row._id === id) || {}
  const card = (title, id, limit) => {
    const row = counter(id)
    const percent = limit > 0 ? Math.min(100, Math.round((row.tokens || 0) / limit * 100)) : 0
    return <article className="aiu-card" key={id}><div className="aiu-muted">{title}</div><strong className="aiu-number">{number(row.tokens)}</strong><div className="aiu-meter"><i style={{ width: `${percent}%`, background: percent >= snapshot.policy.warningPercent ? '#c07018' : '#318269' }} /></div><div className="aiu-split aiu-muted"><span>额度 {number(limit)}</span><span>{percent}%</span></div><p className="aiu-muted">全部机构汇总 · {number(row.calls)} 次调用</p></article>
  }
  const money = micros => `¥${(Number(micros || 0) / 1000000).toFixed(2)}`
  const unattributed = usage?.unattributed
  const hasUnattributed = unattributed && (unattributed.monthCalls > 0 || unattributed.monthTokens > 0)

  return <div className="page aiu-page">
    <div className="page-header"><div><h1 className="page-title">{platform ? '平台 AI 预算' : '本机构 AI 用量'}</h1><p className="page-subtitle">{platform ? '跨机构汇总用量、机构明细和共享模型预算。' : '仅显示本机构的调用量和预估费用。'}</p></div><button className="btn" disabled={busy} onClick={() => action(refresh)}>刷新数据</button></div>
    {error && <div className="aiu-alert aiu-error" role="alert">{error}</div>}
    {message && <div className="aiu-alert" role="status">{message}</div>}
    {!usage || (platform && !snapshot) ? <p>{busy ? '正在读取 AI 用量…' : '数据未加载，请点击刷新重试。'}</p> : <>
      {platform && <div className="aiu-grid">{card('今日 Token 占用', `day:${snapshot.day}`, snapshot.policy.dailyTokens)}{card('本月 Token 占用', `month:${snapshot.month}`, snapshot.policy.monthlyTokens)}{card('OCR 今日占用', `business:ocr:${snapshot.day}`, snapshot.policy.ocrDailyTokens)}{card('其他 AI 今日占用', `business:other:${snapshot.day}`, snapshot.policy.otherDailyTokens)}</div>}
      <section className="aiu-card"><h2>{platform ? '各机构 AI 调用情况' : '本机构 AI 调用情况'}</h2><p className="aiu-muted">按北京时间统计；Token 和费用含尚未确认实际用量的预留值，费用仅计算已配置单价的调用，账单以供应商为准。</p><div className="aiu-table-wrap"><table><thead><tr><th>机构</th><th>今日 Token</th><th>今日调用</th><th>今日 OCR / 其他</th><th>今日已定价费用</th><th>本月 Token</th><th>本月调用</th><th>本月 OCR / 其他</th><th>本月已定价费用</th></tr></thead><tbody>{usage.rows.map(row => <tr key={row.tenantId}><td><strong>{row.name}</strong><small>{row.code}</small></td><td>{number(row.todayTokens)}</td><td>{number(row.todayCalls)}</td><td>{number(row.todayOcrCalls)} / {number(row.todayOtherCalls)}</td><td>{money(row.todayMicros)}</td><td>{number(row.monthTokens)}</td><td>{number(row.monthCalls)}</td><td>{number(row.monthOcrCalls)} / {number(row.monthOtherCalls)}</td><td>{money(row.monthMicros)}</td></tr>)}{platform && hasUnattributed && <tr><td><strong>待核对归属</strong><small>缺少或无法识别机构标识</small></td><td>{number(unattributed.todayTokens)}</td><td>{number(unattributed.todayCalls)}</td><td>{number(unattributed.todayOcrCalls)} / {number(unattributed.todayOtherCalls)}</td><td>{money(unattributed.todayMicros)}</td><td>{number(unattributed.monthTokens)}</td><td>{number(unattributed.monthCalls)}</td><td>{number(unattributed.monthOcrCalls)} / {number(unattributed.monthOtherCalls)}</td><td>{money(unattributed.monthMicros)}</td></tr>}</tbody></table></div>{usage.rows.length === 0 && <p className="aiu-empty">暂无机构记录</p>}</section>
      {platform && <>
      <section className="aiu-card"><h2>共享预算控制</h2><p>已暂停报告：{number(snapshot.pausedReportsTotal)} 份。</p><div className="aiu-actions"><button className="btn" disabled={busy} onClick={() => action(() => save({ ...snapshot.policy, ocrPaused: !snapshot.policy.ocrPaused }))}>{snapshot.policy.ocrPaused ? '解除 OCR 暂停' : '暂停 OCR'}</button><button className="btn" disabled={busy} onClick={() => action(() => save({ ...snapshot.policy, paused: !snapshot.policy.paused }))}>{snapshot.policy.paused ? '解除全部暂停' : '暂停全部 AI'}</button></div></section>
      <section className="aiu-card"><div className="aiu-split"><h2>总额度与模型单价</h2><button className="btn btn-primary" disabled={busy} onClick={() => action(() => save(policy))}>保存并生效</button></div><p className="aiu-muted">费用按实际供应商账单核对。</p><div className="aiu-fields">{fields.map(([key, label]) => <label key={key}>{label}<input type="number" min={key.endsWith('Yuan') ? 0 : 1} step={key.endsWith('Yuan') ? '0.01' : '1'} value={policy[key]} onChange={e => setPolicy({ ...policy, [key]: Number(e.target.value) })} /></label>)}</div><div className="aiu-table-wrap"><table><thead><tr><th>模型</th><th>输入单价（元／百万 Token）</th><th>输出单价（元／百万 Token）</th></tr></thead><tbody>{models.map(model => <tr key={model}><td>{model}</td>{['input', 'output'].map(key => <td key={key}><input aria-label={`${model} ${key === 'input' ? '输入' : '输出'}单价`} type="number" min="0" step="0.01" placeholder="未定价" value={policy.prices[model]?.[key] ?? ''} onChange={e => { const prices = { ...policy.prices }; if (e.target.value === '') { delete prices[model] } else { prices[model] = { input: '', output: '', ...prices[model], [key]: Number(e.target.value) } } setPolicy({ ...policy, prices }) }} /></td>)}</tr>)}</tbody></table></div></section>
      </>}
    </>}
  </div>
}
