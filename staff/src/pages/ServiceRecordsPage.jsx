import React, { useEffect, useState, useCallback } from 'react'
import { staffAPI } from '../api'
import { useToast, useStaff } from '../App'

const TYPE_LABEL = { medical_escort:'就医协助', psychology:'心理咨询', rehab:'运动复健', tcm:'中医评估', specialist:'专科会诊' }
const TYPE_COLOR = { medical_escort:'#0077B6', psychology:'#8e44ad', rehab:'#27ae60', tcm:'#e67e22', specialist:'#e74c3c' }
const ESCORT_TYPE = { proxy_register:'代办挂号', proxy_visit:'代诊', accompany:'陪诊' }

// 根据角色显示不同的默认类型
const ROLE_DEFAULT_TYPE = { medicalAssistant:'medical_escort', psychologist:'psychology', rehabSpecialist:'rehab', tcmDoctor:'tcm', specialist:'specialist' }

export default function ServiceRecordsPage() {
  const { staff } = useStaff()
  const toast = useToast()
  const defaultType = ROLE_DEFAULT_TYPE[staff?.role] || ''
  const [records, setRecords] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState(defaultType)
  const [page, setPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [patients, setPatients] = useState([])
  const limit = 20

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await staffAPI.getServiceRecords({ type: typeFilter, page, limit })
      setRecords(res.data.records); setTotal(res.data.total)
    } finally { setLoading(false) }
  }, [typeFilter, page])

  useEffect(() => { load() }, [load])
  useEffect(() => { staffAPI.getPatients({ limit: 200 }).then(r => setPatients(r.data.patients)).catch(() => {}) }, [])

  const handleDelete = async (id) => {
    if (!window.confirm('确定删除？')) return
    try { await staffAPI.deleteServiceRecord(id); toast('已删除'); load() }
    catch (err) { toast(err.message) }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">服务记录</h1>
          <p className="page-subtitle">共 {total} 条记录</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>＋ 新增记录</button>
      </div>

      {/* 类型筛选 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button className={`btn btn-sm ${typeFilter === '' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTypeFilter('')}>全部</button>
        {Object.entries(TYPE_LABEL).map(([v, l]) => (
          <button key={v} className={`btn btn-sm ${typeFilter === v ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTypeFilter(v)}>{l}</button>
        ))}
      </div>

      <div className="card">
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>加载中...</div>
        : records.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无记录</div>
        : <table className="table">
            <thead><tr><th>类型</th><th>患者</th><th>日期</th><th>主题</th><th>内容摘要</th><th>下次时间</th><th>操作</th></tr></thead>
            <tbody>
              {records.map(r => (
                <tr key={r._id}>
                  <td><span style={{ padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: (TYPE_COLOR[r.type] || '#666') + '20', color: TYPE_COLOR[r.type] || '#666' }}>{TYPE_LABEL[r.type]}</span></td>
                  <td>{r.patientId?.name} <div style={{ fontSize: 11, color: '#aaa' }}>{r.patientId?.phone}</div></td>
                  <td style={{ fontSize: 13, color: '#4A6558' }}>{new Date(r.date).toLocaleDateString('zh-CN')}</td>
                  <td style={{ fontWeight: 500 }}>{r.title || '-'}</td>
                  <td style={{ maxWidth: 200, fontSize: 13, color: '#4A6558' }}>{r.content ? (r.content.length > 40 ? r.content.slice(0, 40) + '...' : r.content) : '-'}</td>
                  <td style={{ fontSize: 13, color: '#8AA89C' }}>{r.nextDate ? new Date(r.nextDate).toLocaleDateString('zh-CN') : '-'}</td>
                  <td><button className="btn btn-danger btn-sm" onClick={() => handleDelete(r._id)}>删除</button></td>
                </tr>
              ))}
            </tbody>
          </table>}
      </div>

      {total > limit && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
          <span style={{ lineHeight: '32px', fontSize: 14, color: '#666' }}>第 {page} / {Math.ceil(total / limit)} 页</span>
          <button className="btn btn-secondary btn-sm" disabled={page >= Math.ceil(total / limit)} onClick={() => setPage(p => p + 1)}>下一页</button>
        </div>
      )}

      {showModal && <ServiceRecordModal patients={patients} defaultType={defaultType} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); toast('记录已保存'); load() }} />}
    </div>
  )
}

function ServiceRecordModal({ patients, defaultType, onClose, onSaved }) {
  const [form, setForm] = useState({ patientId: '', type: defaultType || 'medical_escort', date: new Date().toISOString().slice(0, 10), title: '', content: '', result: '', nextDate: '', medicalEscort: { serviceType: '', hospital: '', department: '', doctor: '', companion: '' }, tcmRecord: { constitution: '', tcmAdvice: '', prescription: '' }, specialistRecord: { specialty: '', consultType: '' } })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const setNested = (parent, k) => e => setForm(f => ({ ...f, [parent]: { ...f[parent], [k]: e.target.value } }))

  const handleSubmit = async () => {
    if (!form.patientId || !form.type) { setError('患者和类型不能为空'); return }
    setSaving(true); setError('')
    try { await staffAPI.createServiceRecord(form); onSaved() }
    catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3 className="modal-title">新增服务记录</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {error && <div className="login-err" style={{ margin: '0 20px 8px' }}>⚠️ {error}</div>}
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
              <label className="form-label">选择患者 *</label>
              <select className="form-input" value={form.patientId} onChange={set('patientId')}>
                <option value="">-- 请选择患者 --</option>
                {patients.map(p => <option key={p._id} value={p._id}>{p.name} · {p.phone}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">服务类型 *</label>
              <select className="form-input" value={form.type} onChange={set('type')}>
                {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">服务日期</label>
              <input className="form-input" type="date" value={form.date} onChange={set('date')} />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">主题/标题</label>
            <input className="form-input" placeholder="简短描述" value={form.title} onChange={set('title')} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">服务内容</label>
            <textarea className="form-input" rows={3} value={form.content} onChange={set('content')} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">评估/结果/建议</label>
            <textarea className="form-input" rows={2} value={form.result} onChange={set('result')} />
          </div>

          {/* 就医协助专属字段 */}
          {form.type === 'medical_escort' && (
            <div style={{ background: '#f9f7f3', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#4A6558', marginBottom: 8 }}>就医协助信息</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label:'协助类型', key:'serviceType', type:'select', options: Object.entries(ESCORT_TYPE).map(([v,l])=>({v,l})) },
                  { label:'医院', key:'hospital' },
                  { label:'科室', key:'department' },
                  { label:'医生', key:'doctor' },
                  { label:'陪诊人员', key:'companion' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="form-label" style={{ fontSize: 11 }}>{f.label}</label>
                    {f.type === 'select'
                      ? <select className="form-input" value={form.medicalEscort[f.key]} onChange={setNested('medicalEscort', f.key)}>
                          <option value="">请选择</option>
                          {f.options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                        </select>
                      : <input className="form-input" value={form.medicalEscort[f.key]} onChange={setNested('medicalEscort', f.key)} />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 中医专属字段 */}
          {form.type === 'tcm' && (
            <div style={{ background: '#f9f7f3', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#4A6558', marginBottom: 8 }}>中医评估信息</div>
              {[
                { label:'体质辨识结果', key:'constitution' },
                { label:'中医建议', key:'tcmAdvice' },
                { label:'中药/针灸方案', key:'prescription' },
              ].map(f => (
                <div className="form-group" key={f.key} style={{ marginBottom: 8 }}>
                  <label className="form-label" style={{ fontSize: 11 }}>{f.label}</label>
                  <input className="form-input" value={form.tcmRecord[f.key]} onChange={setNested('tcmRecord', f.key)} />
                </div>
              ))}
            </div>
          )}

          {/* 专科会诊专属 */}
          {form.type === 'specialist' && (
            <div style={{ background: '#f9f7f3', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#4A6558', marginBottom: 8 }}>会诊信息</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[{ label:'专科领域', key:'specialty' }, { label:'会诊类型', key:'consultType' }].map(f => (
                  <div key={f.key}>
                    <label className="form-label" style={{ fontSize: 11 }}>{f.label}</label>
                    <input className="form-input" value={form.specialistRecord[f.key]} onChange={setNested('specialistRecord', f.key)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">下次计划时间</label>
            <input className="form-input" type="date" value={form.nextDate} onChange={set('nextDate')} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving ? '保存中...' : '保存'}</button>
        </div>
      </div>
    </div>
  )
}
