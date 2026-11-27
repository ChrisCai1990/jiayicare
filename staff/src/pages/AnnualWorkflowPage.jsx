import { returnToEntry } from '../../../shared/returnNavigation.mjs'
import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { staffAPI } from '../api'

const labels = { active: '当前步骤', pending: '待办理', complete: '已完成', waiting: '等待资料或上一步', available: '可查看' }

export default function AnnualWorkflowPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const [state, setState] = useState({ loading: true, error: '', data: null })
  const refresh = () => {
    setState(old => ({ ...old, loading: true, error: '' }))
    staffAPI.getAnnualWorkflow(id).then(result => setState({ loading: false, error: '', data: result.data }))
      .catch(error => setState({ loading: false, error: error.message || '读取流程失败', data: null }))
  }
  useEffect(refresh, [id])
  const flow = state.data
  return <div style={{ maxWidth: 1100, margin: '0 auto', padding: '18px 20px' }}>
    <button className="btn btn-secondary btn-sm" onClick={() => returnToEntry(nav, `/patients/${id}`)}>返回</button>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginTop: 16 }}>
      <div><h1 style={{ margin: 0, fontSize: 24 }}>年度健康管理流程</h1>{flow && <p style={{ color: '#52675D' }}>{flow.patientName} · {flow.year}年度 · 当前：{flow.label}</p>}</div>
      <button className="btn btn-secondary btn-sm" disabled={state.loading} onClick={refresh}>刷新进度</button>
    </div>
    {state.loading && <p>正在读取当前步骤…</p>}
    {state.error && <p role="alert" style={{ color: '#B42318' }}>{state.error}</p>}
    {flow && <>
      <p style={{ padding: 12, background: '#EFF8F3', borderRadius: 8 }}>{flow.summary}。点击任一步骤可直达办理位置；前序资料和已确认方案保留原记录。</p>
      <div style={{ display: 'grid', gap: 10 }}>
        {flow.steps.map((step, index) => <section key={step.key} style={{ border: `1px solid ${step.key === flow.step ? '#1E6B50' : '#DCE7E0'}`, background: step.key === flow.step ? '#F2FAF5' : '#fff', borderRadius: 10, padding: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', borderRadius: 20, background: '#E6F2EB', color: '#1E6B50', fontWeight: 700 }}>{index + 1}</span>
          <div style={{ flex: 1, minWidth: 180 }}><strong>{step.label}</strong><div style={{ fontSize: 12, color: '#607469', marginTop: 3 }}>{labels[step.status] || '可查看'}</div></div>
          <button className={step.key === flow.step ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'} onClick={() => nav(step.link)}>进入{step.label}</button>
        </section>)}
      </div>
      {flow.step === 'execution' && <p style={{ fontSize: 12, color: '#607469', marginTop: 12 }}>具体就医、营养、运动和随访任务由原负责岗位办理；阶段性评估在客户档案中核对结果。</p>}
    </>}
  </div>
}
