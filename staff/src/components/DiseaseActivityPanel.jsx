import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'
import { useStaff } from '../App'

const statusLabels = { draft: '方案草稿', active: '方案进行中', completed: '已完成', cancelled: '已取消', planned: '待执行', in_progress: '执行中', missed: '未完成', recorded: '已有服务记录（整体进度未关联）', tasks: '按下方任务状态跟进' }
const dateLabel = value => value ? new Date(value).toLocaleString('zh-CN') : '时间未记录'
function Paged({ items, render }) {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(items.length / 5)), current = Math.min(page, pages - 1)
  return <>{items.slice(current * 5, current * 5 + 5).map(render)}{pages > 1 && <div style={{ display:'flex', gap:12, alignItems:'center', marginTop:10 }}><button className="btn btn-secondary btn-sm" disabled={!current} onClick={() => setPage(current - 1)}>上一页</button><span>{current + 1} / {pages} 页 · 共 {items.length} 项</span><button className="btn btn-secondary btn-sm" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>下一页</button></div>}</>
}
export default function DiseaseActivityPanel({ patientId, dossier, mode = 'services', onLinked, onChooseDaily, onOpenTask, onOpenRecord }) {
  const nav = useNavigate(), { staff } = useStaff()
  const canConfirm = ['familyDoctor','superadmin'].includes(staff?.role)
  const [data, setData] = useState(null), [error, setError] = useState(''), [working, setWorking] = useState(''), [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true; setData(null); setError('')
    staffAPI.getDiseaseActivity(patientId).then(r => { if (active) setData(r.data) }).catch(e => { if (active) setError(e.message || '加载失败') })
    return () => { active = false }
  }, [patientId, revision])
  async function action(key, run) {
    setWorking(key); setError('')
    try { await run() } catch (e) { setError(e.message || '操作失败') } finally { setWorking('') }
  }
  if (!data) return <div role={error ? 'alert' : 'status'}>{error || '正在汇总原始记录…'}{error && <button onClick={() => setRevision(v => v + 1)}>重试</button>}</div>
  if (mode === 'daily') {
    const archived = new Set((dossier.courseEntries || []).map(e => String(e.sourceHealthRecordId || '')))
    return <details style={{ padding:12, marginBottom:14, background:'#F5F8F7' }}><summary style={{ cursor:'pointer' }}>从日常反馈选择重要变化归档</summary><p style={{ fontSize:12, color:'#65776F' }}>展示近期不适反馈和被标记异常的监测数据。由顾问核对与本专病的关系、实际发生日期后归档；不会自动录入全部打卡，也不会关闭原反馈处理任务。</p>{!data.daily.length && <p>暂无符合条件的日常反馈，可使用“记录健康变化”补充。</p>}<Paged items={data.daily} render={item => <div key={item._id} style={{ padding:'10px 0', borderBottom:'1px solid #E0D9CE' }}><b>{item.label}：{item.value} {item.unit}</b><div style={{ fontSize:12 }}>来源记录时间：{dateLabel(item.recordedAt)}</div>{item.note && <div>{item.note}</div>}<button className="btn btn-secondary btn-sm" disabled={!canConfirm || archived.has(String(item._id))} onClick={() => onChooseDaily(item)}>{archived.has(String(item._id)) ? '已归档到本专病' : '核对并归档'}</button></div>} />{data.dailyHasMore && <p>这里只显示最近 50 条候选，更早记录请到日常健康数据查看。</p>}</details>
  }
  const linked = data.activities.filter(a => a.diseaseIds.includes(String(dossier._id)) || ((!dossier._id || dossier._id === 'legacy') && a.records.some(r => r.diseaseName === dossier.name)))
  const unlinked = data.activities.filter(a => !a.diseaseIds.length && !linked.includes(a))
  const render = (item, allowLink) => <div key={item.key} style={{ padding:'12px 0', borderBottom:'1px solid #E0D9CE' }}>
    <div style={{ display:'flex', gap:10, flexWrap:'wrap', justifyContent:'space-between' }}><b>{item.title}</b><span>{item.planId ? '方案状态：' : ''}{statusLabels[item.status] || '状态待核对'}</span></div>
    <div style={{ fontSize:12, color:'#65776F', margin:'5px 0' }}>计划/记录日期：{dateLabel(item.date)} · 原服务记录 {item.records.length} 条 · 执行/跟进任务 {item.tasks.length} 项</div>
    <details><summary style={{ cursor:'pointer', color:'#1E6B50' }}>查看进度与原记录</summary>
      {item.planId && <button className="btn btn-secondary btn-sm" onClick={() => nav(`/plans/${item.planId}`)}>打开就医协助方案</button>}
      {item.tasks.map(task => <div key={task._id} style={{ marginTop:8 }}>{task.theme || '执行任务'} · {statusLabels[task.status] || task.status} · {task.assignedTo?.name || '负责人待确认'} <button className="btn btn-secondary btn-sm" disabled={!!working} onClick={() => action(task._id, () => onOpenTask(task._id))}>查看原任务</button></div>)}
      {item.records.map(record => <div key={record._id} style={{ marginTop:8 }}><b>{record.title || '服务记录'}</b> · {record.staffId?.name || '人员未记录'}{record.aiStatus === 'pending' && <span> · AI草稿待审核</span>}<div style={{ whiteSpace:'pre-wrap' }}>{record.result || record.content || '暂无文字记录'}</div><button className="btn btn-secondary btn-sm" onClick={() => onOpenRecord(record._id)}>查看原服务记录</button></div>)}
    </details>
    {allowLink && <button className="btn btn-primary btn-sm" style={{ marginTop:8 }} disabled={!!working || !canConfirm || !dossier._id || dossier._id === 'legacy'} onClick={() => action(item.key, async () => { await staffAPI.linkDiseaseService(patientId, dossier._id, item.key); await onLinked(); setRevision(v => v + 1) })}>{working === item.key ? '关联中…' : '确认关联当前专病'}</button>}
    {!allowLink && canConfirm && !!item.manualLinkKeys?.[String(dossier._id)]?.length && <button className="btn btn-secondary btn-sm" style={{ marginTop:8 }} disabled={!!working} onClick={() => action(item.key, async () => { await staffAPI.linkDiseaseService(patientId, dossier._id, item.key, 'unlink'); await onLinked(); setRevision(v => v + 1) })}>撤销本次人工关联</button>}
  </div>
  return <div><p style={{ fontSize:12, color:'#65776F' }}>汇总医护发起的就医协助方案、服务记录及随访任务，与是否单独付款无关。同一服务的方案、执行任务和结果合并展示；办理仍在原流程完成。</p>{error && <div role="alert" style={{ color:'#B42318' }}>{error}</div>}<b>当前专病已关联 {linked.length} 项服务与跟进</b>{!linked.length && <p>暂未关联服务，请核对下方待关联记录；这不表示未提供服务。</p>}<Paged key={dossier._id} items={linked} render={item => render(item, false)} /><details style={{ marginTop:16 }}><summary style={{ cursor:'pointer' }}>待确认专病关联（{unlinked.length}）</summary><p style={{ fontSize:12 }}>仅关联确实与当前专病有关的服务，不按标题猜测，也不自动关联全部服务。</p><Paged items={unlinked} render={item => render(item, true)} /></details></div>
}
