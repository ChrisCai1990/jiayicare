import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'
import { useAdmin } from '../../App'
import './AiUsagePage.css'

const number = value => Number(value || 0).toLocaleString('zh-CN')
const money = value => value == null ? '待核对' : `¥${(value / 1000000).toFixed(4)}`
const time = value => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—'
const labels = { success: '完成', failed: '调用失败', unknown: '用量待核对', reserved: '已预留 / 待结算' }
const stageLabels = { request: '常规调用', recognize: '识别', evidence: '原文校验', supplement: '单页补提' }
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
  const allowed = admin?.role === 'platformSuper' || (admin?.role === 'superadmin' && !admin?.tenantId)
  const [snapshot, setSnapshot] = useState(null)
  const [policy, setPolicy] = useState(null)
  const [tab, setTab] = useState('overview')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [usage, setUsage] = useState({ rows: [], page: 1 })
  const [report, setReport] = useState('')
  const [business, setBusiness] = useState('')
  const [allowance, setAllowance] = useState({ tokens: 100000, calls: 3, page: '' })
  const refresh = async () => {
    const response = await adminAPI.getAiControl()
    setSnapshot(response.data); setPolicy(response.data.policy)
  }
  const loadUsage = async (page = 1) => {
    const response = await adminAPI.getAiUsage({ page, ...(report.trim() ? { reportId: report.trim() } : {}), ...(business ? { business } : {}) })
    setUsage(response.data)
  }
  const action = async fn => {
    setBusy(true); setError(''); setMessage('')
    try { await fn() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  useEffect(() => { if (allowed) action(async () => { await refresh(); await loadUsage() }) }, [allowed])
  if (!allowed) return <div className="page"><h1 className="page-title">AI 用量管理</h1><p>仅平台管理员可查看和调整 AI 总预算。</p></div>
  const save = async next => {
    const response = await adminAPI.saveAiPolicy(next, snapshot.policy.revision || 0)
    setPolicy(response.data); setSnapshot(previous => ({ ...previous, policy: response.data }))
    setMessage('设置已生效，新调用将使用更新后的限额。')
  }
  const counter = id => snapshot?.counters.find(row => row._id === id) || {}
  const card = (title, id, limit, hint) => {
    const row = counter(id), percent = Math.min(100, Math.round((row.tokens || 0) / limit * 100)) || 0
    return <article className="aiu-card" key={id}><div className="aiu-muted">{title}</div><strong className="aiu-number">{number(row.tokens)}</strong><div className="aiu-meter"><i style={{ width: `${percent}%`, background: percent >= snapshot.policy.warningPercent ? '#c07018' : '#318269' }} /></div><div className="aiu-split aiu-muted"><span>额度 {number(limit)}</span><span>{percent}%</span></div><p className="aiu-muted">{hint} · {number(row.calls)} 次调用</p></article>
  }
  return <div className="page aiu-page">
    <div className="page-header"><div><h1 className="page-title">AI 用量管理</h1><p className="page-subtitle">查看消耗、控制预算，在异常调用扩大前暂停。</p></div><button className="btn" disabled={busy} onClick={() => action(async () => { await refresh(); await loadUsage(usage.page); setMessage('已刷新') })}>刷新数据</button></div>
    {error && <div className="aiu-alert aiu-error" role="alert">{error}</div>}
    {message && <div className="aiu-alert" role="status">{message}</div>}
    {!snapshot ? <p>{busy ? '正在读取用量…' : '用量未加载，请点击刷新重试。'}</p> : <>
      <div className="aiu-toolbar"><div><span className={`aiu-dot ${snapshot.policy.paused || snapshot.policy.ocrPaused ? 'paused' : ''}`} /><b>{snapshot.policy.paused ? '全部 AI 已暂停' : snapshot.policy.ocrPaused ? 'OCR 已暂停' : '预算保护运行中'}</b><span className="aiu-muted"> 北京时间 · {snapshot.day}</span></div><div className="aiu-actions"><button className="btn" disabled={busy} onClick={() => action(() => save({ ...snapshot.policy, ocrPaused: !snapshot.policy.ocrPaused }))}>{snapshot.policy.ocrPaused ? '解除 OCR 暂停' : '暂停 OCR'}</button><button className="btn" disabled={busy} onClick={() => action(() => save({ ...snapshot.policy, paused: !snapshot.policy.paused }))}>{snapshot.policy.paused ? '解除全部暂停' : '暂停全部 AI'}</button></div></div>
      <div className="aiu-tabs" role="tablist">{[['overview', '用量总览'], ['usage', '调用明细'], ['policy', '额度设置']].map(([key, label]) => <button role="tab" aria-selected={tab === key} key={key} onClick={() => setTab(key)}>{label}</button>)}</div>
      {tab === 'overview' && <>
        <div className="aiu-grid">{card('今日 Token 占用', `day:${snapshot.day}`, snapshot.policy.dailyTokens, '包含未结算预留')}{card('本月 Token 占用', `month:${snapshot.month}`, snapshot.policy.monthlyTokens, '跨服务重启累计')}{card('OCR 今日占用', `business:ocr:${snapshot.day}`, snapshot.policy.ocrDailyTokens, '识别、校验和补提合计')}{card('其他 AI 今日占用', `business:other:${snapshot.day}`, snapshot.policy.otherDailyTokens, '问答与文本分析等')}</div>
        <div className="aiu-note">用量从功能启用后开始记录。Token 占用包含实际用量和未结算预留；未知用量不会自动归零。费用按调用时配置的单价估算，未定价调用不计入金额统计，最终以供应商账单为准。</div>
        <section className="aiu-card"><h2>费用与异常</h2><p>今日已定价费用及预留：<b>{money(counter(`day:${snapshot.day}`).micros || 0)}</b>　 本月：<b>{money(counter(`month:${snapshot.month}`).micros || 0)}</b></p>{snapshot.circuits.length ? snapshot.circuits.map(row => <div className="aiu-row" key={row._id}><div><b>{row._id}</b><p className="aiu-muted">连续异常 {row.failures} 次 · {row.paused ? '已自动暂停' : '可调用'}</p></div>{row.paused && <button className="btn" disabled={busy} onClick={() => action(async () => { await adminAPI.resetAiCircuit(row._id); await refresh(); setMessage('模型已解除暂停，报告任务需单独恢复。') })}>解除模型暂停</button>}</div>) : <p className="aiu-muted">暂未记录模型调用。</p>}</section>
        <section className="aiu-card"><h2>已暂停的报告</h2><p className="aiu-muted">恢复会继续识别并产生费用，已有结果仍需人工审核。累计额度不会重置。</p>{snapshot.pausedReports.length ? snapshot.pausedReports.map(row => <div className="aiu-row" key={row._id}><div><code>{row._id}</code><p>{row.parseJob.message}</p><small className="aiu-muted">{time(row.parseJob.pausedAt)}</small></div><div className="aiu-actions"><button className="btn" disabled={busy} onClick={() => action(async () => { setReport(row._id); setTab('usage'); const response = await adminAPI.getAiUsage({ reportId: row._id }); setUsage(response.data) })}>查看 / 追加额度</button><button className="btn btn-primary" disabled={busy} onClick={() => action(async () => { await adminAPI.resumeAiReport(row._id); await refresh(); setMessage('任务已恢复排队') })}>恢复识别</button></div></div>) : <p className="aiu-muted">当前没有因预算或异常保护而暂停的报告。</p>}</section>
      </>}
      {tab === 'usage' && <section className="aiu-card"><h2>调用明细</h2><div className="aiu-filter"><input aria-label="报告 ID" placeholder="报告 ID（可选）" value={report} onChange={e => setReport(e.target.value)} /><select aria-label="业务类型" value={business} onChange={e => setBusiness(e.target.value)}><option value="">全部业务</option><option value="ocr">OCR</option><option value="other">其他 AI</option></select><button className="btn btn-primary" disabled={busy} onClick={() => action(() => loadUsage())}>查询</button></div>
        <div className="aiu-table-wrap"><table><thead><tr>{['时间 / 报告', '页码 / 环节', '模型', '实际 Token', '费用', '状态 / 耗时'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{usage.rows.map(row => <tr key={row._id}><td>{time(row.createdAt)}<small>{row.reportId || '其他 AI 调用'}</small></td><td>{row.page ? `P${row.page}` : '—'}<small>{stageLabels[row.stage] || row.stage}</small></td><td>{row.model}</td><td>{row.actualTokens == null ? '待核对' : number(row.actualTokens)}<small>{row.actualTokens == null ? `预留 ${number(row.reservedTokens)}` : `输入 ${number(row.inputTokens)} / 输出 ${number(row.outputTokens)}`}</small></td><td>{money(row.costMicros)}</td><td>{labels[row.status] || row.status}<small>{row.durationMs == null ? '—' : `${(row.durationMs / 1000).toFixed(1)} 秒`}</small></td></tr>)}</tbody></table>{!usage.rows.length && <p className="aiu-empty">没有符合条件的调用记录。</p>}</div>
        <div className="aiu-actions aiu-pagination"><button className="btn" disabled={busy || usage.page <= 1} onClick={() => action(() => loadUsage(usage.page - 1))}>上一页</button><span>第 {usage.page} 页</span><button className="btn" disabled={busy || !usage.hasMore} onClick={() => action(() => loadUsage(usage.page + 1))}>下一页</button></div>
        {report.trim() && <div className="aiu-allowance"><h3>追加指定报告 / 页面的额度</h3><p className="aiu-muted">只增加上限，不删除历史消耗。报告、页面和每日总预算需要同时满足。</p>{usage.reportCounters?.map(row => <p key={row._id} className="aiu-muted">{row._id.startsWith('page:') ? `P${row._id.split(':')[2]}` : '整份报告'}：已占用 {number(row.tokens)} Token / {row.calls} 次；已追加 {number(row.extraTokens)} Token / {row.extraCalls} 次</p>)}<div className="aiu-filter"><label>追加 Token<input type="number" min="1" value={allowance.tokens} onChange={e => setAllowance({ ...allowance, tokens: Number(e.target.value) })} /></label><label>追加调用次数<input type="number" min="1" value={allowance.calls} onChange={e => setAllowance({ ...allowance, calls: Number(e.target.value) })} /></label><label>指定页码（留空为报告）<input type="number" min="1" value={allowance.page} onChange={e => setAllowance({ ...allowance, page: e.target.value })} /></label><button className="btn" disabled={busy} onClick={() => action(async () => { await adminAPI.addAiAllowance(report.trim(), { tokens: allowance.tokens, calls: allowance.calls, ...(allowance.page ? { page: Number(allowance.page) } : {}) }); await loadUsage(); setMessage('追加额度已生效') })}>追加额度</button></div></div>}
      </section>}
      {tab === 'policy' && <section className="aiu-card"><div className="aiu-split"><h2>额度设置</h2><button className="btn btn-primary" disabled={busy} onClick={() => action(() => save(policy))}>保存并生效</button></div><p className="aiu-muted">Token 和调用次数上限必须为正数。默认值是初始保护额度，可按实际报告用量调整。</p><div className="aiu-fields">{fields.map(([key, label]) => <label key={key}>{label}<input type="number" min={key.endsWith('Yuan') ? 0 : 1} step={key.endsWith('Yuan') ? '0.01' : '1'} value={policy[key]} onChange={e => setPolicy({ ...policy, [key]: Number(e.target.value) })} /></label>)}</div><h3>模型单价 · 元 / 百万 Token</h3><p className="aiu-muted">从供应商账单或合同填入。留空代表未定价；启用金额上限后，未定价模型会被阻止调用。修改单价不追溯重算历史。</p><div className="aiu-table-wrap"><table><thead><tr><th>模型</th><th>输入单价</th><th>输出单价</th></tr></thead><tbody>{models.map(model => <tr key={model}><td>{model}</td>{['input', 'output'].map(key => <td key={key}><input aria-label={`${model} ${key === 'input' ? '输入' : '输出'}单价`} type="number" min="0" step="0.01" placeholder="未定价" value={policy.prices[model]?.[key] ?? ''} onChange={e => { const prices = { ...policy.prices }; if (e.target.value === '') { delete prices[model] } else { prices[model] = { input: '', output: '', ...prices[model], [key]: Number(e.target.value) } } setPolicy({ ...policy, prices }) }} /></td>)}</tr>)}</tbody></table></div></section>}
      <p className="aiu-footer">暂停阻止后续新请求；已经发出的请求可能继续计费。自动暂停不会自动审核或发布报告。</p>
    </>}
  </div>
}
