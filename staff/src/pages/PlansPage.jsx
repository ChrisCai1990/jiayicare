import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'
import { useToast } from '../App'

const TYPE_LABEL = {
  annual_checkup:  '年度体检方案',
  annual_mgmt:     '年度管理方案',
  nutrition:       '营养干预方案',
  medical_assist:  '就医协助方案',
  tcm:             '中医调理方案',
  rehab:           '运动复健方案',
  psychology:      '心理咨询方案',
  // 旧类型兼容展示
  checkup:'体检方案', health:'健康管理方案', followup:'随访计划',
}
const STATUS_LABEL = { draft:'草稿', active:'已推送', completed:'已完成', cancelled:'已取消' }
const STATUS_COLOR = { draft:'#8AA89C', active:'#1E6B50', completed:'#22A06B', cancelled:'#DC3545' }

export default function PlansPage() {
  const nav = useNavigate()
  const toast = useToast()
  const [plans, setPlans] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [typeFilter, setTypeFilter] = useState('')
  const [patients, setPatients] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await staffAPI.getPlans({ type: typeFilter, limit: 50 })
      setPlans(res.data.plans)
      setTotal(res.data.total)
    } finally { setLoading(false) }
  }, [typeFilter])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    staffAPI.getPatients({ limit: 200 }).then(r => setPatients(r.data.patients)).catch(() => {})
  }, [])

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">健康方案</h1>
          <p className="page-subtitle">共 {total} 个方案</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>＋ 新建方案</button>
      </div>

      {/* 类型筛选 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { v: '', l: '全部' },
          { v: 'annual_checkup', l: '年度体检方案' },
          { v: 'annual_mgmt',    l: '年度管理方案' },
          { v: 'nutrition',      l: '营养干预方案' },
          { v: 'medical_assist', l: '就医协助方案' },
          { v: 'tcm',            l: '中医调理方案' },
          { v: 'rehab',          l: '运动复健方案' },
          { v: 'psychology',     l: '心理咨询方案' },
        ].map(opt => (
          <button key={opt.v}
            className={`btn btn-sm ${typeFilter === opt.v ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTypeFilter(opt.v)}>{opt.l}</button>
        ))}
      </div>

      <div className="card">
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>加载中...</div>
        : plans.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无方案</div>
        : <table className="table">
            <thead><tr>
              <th>方案名称</th><th>类型</th><th>患者</th><th>状态</th><th>项目数</th><th>创建时间</th><th>操作</th>
            </tr></thead>
            <tbody>
              {plans.map(p => (
                <tr key={p._id} onClick={() => nav(`/plans/${p._id}`)} style={{ cursor: 'pointer' }}>
                  <td><strong>{p.title}</strong></td>
                  <td><span className="badge badge-info">{TYPE_LABEL[p.type]}</span></td>
                  <td>{p.patientId?.name || '-'} <span style={{ color: '#aaa', fontSize: 12 }}>{p.patientId?.phone}</span></td>
                  <td><span style={{ color: STATUS_COLOR[p.status], fontWeight: 500 }}>{STATUS_LABEL[p.status]}</span></td>
                  <td>{p.items?.length || 0} 项</td>
                  <td style={{ color: '#8AA89C', fontSize: 12 }}>{new Date(p.createdAt).toLocaleDateString('zh-CN')}</td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); nav(`/plans/${p._id}`) }}>查看</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>}
      </div>

      {showModal && <NewPlanModal patients={patients} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); toast('方案已创建') }} />}
    </div>
  )
}

function NewPlanModal({ patients, onClose, onSaved }) {
  const [form, setForm] = useState({ patientId: '', type: 'annual_checkup', title: '', description: '', year: new Date().getFullYear() })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async e => {
    e.preventDefault()
    if (!form.patientId || !form.title) { setError('患者和方案名称不能为空'); return }
    setSaving(true); setError('')
    try { await staffAPI.createPlan(form); onSaved() }
    catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">新建健康方案</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {error && <div className="login-err" style={{ margin: '0 20px 8px' }}>⚠️ {error}</div>}
        <form onSubmit={handleSubmit} className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">选择患者 *</label>
            <select className="form-input" value={form.patientId} onChange={set('patientId')} required>
              <option value="">-- 请选择患者 --</option>
              {patients.map(p => <option key={p._id} value={p._id}>{p.name} · {p.phone}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">方案类型 *</label>
            <select className="form-input" value={form.type} onChange={set('type')}>
              <option value="annual_checkup">年度体检方案</option>
              <option value="annual_mgmt">年度管理方案</option>
              <option value="nutrition">营养干预方案</option>
              <option value="medical_assist">就医协助方案</option>
              <option value="tcm">中医调理方案</option>
              <option value="rehab">运动复健方案</option>
              <option value="psychology">心理咨询方案</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">方案名称 *</label>
            <input className="form-input" placeholder="如：2025年度体检方案" value={form.title} onChange={set('title')} required />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">方案年度</label>
            <input className="form-input" type="number" value={form.year} onChange={set('year')} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">方案说明</label>
            <textarea className="form-input" rows={3} placeholder="简要说明方案目标" value={form.description} onChange={set('description')} />
          </div>
        </form>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving ? '创建中...' : '创建方案'}</button>
        </div>
      </div>
    </div>
  )
}
