import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'

export default function CheckupPreparationAddons({ plan, staff, onSaved }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState([])
  const taskId = plan.preparationTaskId
  const receive = value => {
    setData(value)
    setSelected(value.run?.result?.chosen?.map(item => item.index) || [])
  }
  useEffect(() => {
    let active = true
    setData(null); setError('')
    staffAPI.getCheckupPreparationAddons(taskId).then(res => { if (active) receive(res.data) })
      .catch(err => { if (active) setError(err.message) })
    return () => { active = false }
  }, [taskId, plan.updatedAt])
  const run = data?.run
  const editable = plan.status === 'draft' && !plan.pushedAt && plan.content?.aiStatus === 'pending' && !data?.review
  async function perform(action) {
    setBusy(true); setError('')
    try {
      await action()
      receive((await staffAPI.getCheckupPreparationAddons(taskId)).data)
    } catch (err) { setError(err.message || '操作失败，请刷新核对') } finally { setBusy(false) }
  }
  return <section className="card" style={{ padding: 16, marginBottom: 16 }}>
    <b>体检准备 · AI 个性化加项</b>
    <p>只建议模板内加项，不改标准套餐。请核对下方资料依据；保存所选加项后，仍需原方案审核发布，不启动服务或收费。</p>
    {error && <p role="alert" style={{ color: '#DC3545' }}>{error}</p>}
    {data?.review && <p>本次加项已审核保存，不重复生成。后续调整请编辑方案项目。</p>}
    {run?.status === 'running' && <p>正在生成，重复点击不会再次调用。若长时间未完成，请管理员确认旧请求已停止后恢复。</p>}
    {run?.status === 'failed' && <p>{run.message}</p>}
    {run?.result?.note && <p>{run.result.note}</p>}
    {(run?.result?.chosen || []).map(item => <div key={item.index} style={{ marginBottom: 12 }}>
      <label><input type="checkbox" checked={selected.includes(item.index)} disabled={busy || !editable}
        onChange={e => setSelected(previous => e.target.checked ? [...previous, item.index] : previous.filter(index => index !== item.index))} /> {item.name}</label>
      <div>{item.reason}</div>
      {item.sourceKeys.map(key => {
        const source = run.input.sources.find(row => row.key === key)
        return <details key={key}><summary>查看依据：{source?.title || key}</summary>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(source, null, 2)}</pre>
        </details>
      })}
    </div>)}
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => perform(async () => {})}>刷新生成状态</button>
      {editable && data && run?.status !== 'running' && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => perform(() =>
        staffAPI.generateCheckupPreparationAddons(taskId, { updatedAt: plan.updatedAt, token: run?.token }))}>{busy ? '处理中…' : run ? '更新建议（资料未变则复用）' : '生成加项建议'}</button>}
      {editable && ['ready', 'skipped'].includes(run?.status) && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => perform(async () => {
        await staffAPI.reviewCheckupPreparationAddons(taskId, { token: run.token, indexes: selected })
        await onSaved()
      })}>审核并保存所选加项{selected.length === 0 ? '（不增加项目）' : ''}</button>}
      {staff?.role === 'superadmin' && run?.status === 'running' && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => {
        if (!window.confirm('请先核实旧生成请求/进程确实已停止。确认恢复？')) return
        const reason = window.prompt('填写核实结果和恢复原因')
        if (!reason?.trim()) return
        perform(() => staffAPI.recoverCheckupPreparationAddons(taskId, { token: run.token, processStopped: true, reason }))
      }}>管理员恢复中断记录</button>}
    </div>
  </section>
}
