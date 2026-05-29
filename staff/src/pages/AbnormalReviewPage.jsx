import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import { useToast } from '../App'

const STATUS_LABEL = { pending: '待处理', scheduled: '已预约', completed: '已完成', cancelled: '已取消' }
const STATUS_COLOR = { pending: '#D97706', scheduled: '#0077B6', completed: '#22A06B', cancelled: '#aaa' }
const SEVERITY_LABEL = { mild: '轻度', moderate: '中度', severe: '重度' }
const SEVERITY_COLOR = { mild: '#D97706', moderate: '#DC3545', severe: '#7c0a02' }

const EMPTY_FORM = {
  patientId: '', title: '', reviewDate: '', notes: '',
  abnormalItems: [{ name: '', value: '', reference: '', severity: 'mild' }],
}

function CreateModal({ patients, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setItem = (idx, k, v) => setForm(f => {
    const items = [...f.abnormalItems]
    items[idx] = { ...items[idx], [k]: v }
    return { ...f, abnormalItems: items }
  })
  const addItem = () => setForm(f => ({ ...f, abnormalItems: [...f.abnormalItems, { name: '', value: '', reference: '', severity: 'mild' }] }))
  const removeItem = (idx) => setForm(f => ({ ...f, abnormalItems: f.abnormalItems.filter((_, i) => i !== idx) }))

  const save = async () => {
    if (!form.patientId) { toast('请选择患者'); return }
    if (!form.abnormalItems[0]?.name) { toast('请至少填写一个异常项目'); return }
    setSaving(true)
    try {
      const payload = {
        ...form,
        abnormalItems: form.abnormalItems.filter(i => i.name),
        reviewDate: form.reviewDate || null,
      }
      await staffAPI.createAbnormalReview(payload)
      toast('已创建复查任务')
      onSaved()
      onClose()
    } catch (err) { toast(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640, width: '96%' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">➕ 创建异常复查任务</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">患者 *</label>
              <select className="form-input" value={form.patientId} onChange={e => setField('patientId', e.target.value)}>
                <option value="">请选择患者</option>
                {patients.map(p => <option key={p._id} value={p._id}>{p.name} · {p.phone}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">计划复查日期</label>
              <input className="form-input" type="date" value={form.reviewDate} onChange={e => setField('reviewDate', e.target.value)} />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">任务标题</label>
              <input className="form-input" placeholder="如：血糖异常复查" value={form.title} onChange={e => setField('title', e.target.value)} />
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label className="form-label" style={{ margin: 0 }}>异常项目 *</label>
              <button className="btn btn-ghost btn-sm" onClick={addItem}>＋ 添加项目</button>
            </div>
            {form.abnormalItems.map((item, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'flex-end' }}>
                <div>
                  {idx === 0 && <label className="form-label" style={{ fontSize: 11 }}>项目名称</label>}
                  <input className="form-input" placeholder="如：空腹血糖" value={item.name} onChange={e => setItem(idx, 'name', e.target.value)} />
                </div>
                <div>
                  {idx === 0 && <label className="form-label" style={{ fontSize: 11 }}>检测值</label>}
                  <input className="form-input" placeholder="如：8.5 mmol/L" value={item.value} onChange={e => setItem(idx, 'value', e.target.value)} />
                </div>
                <div>
                  {idx === 0 && <label className="form-label" style={{ fontSize: 11 }}>参考范围</label>}
                  <input className="form-input" placeholder="如：3.9-6.1" value={item.reference} onChange={e => setItem(idx, 'reference', e.target.value)} />
                </div>
                <div>
                  {idx === 0 && <label className="form-label" style={{ fontSize: 11 }}>严重程度</label>}
                  <select className="form-input" value={item.severity} onChange={e => setItem(idx, 'severity', e.target.value)}>
                    <option value="mild">轻度</option>
                    <option value="moderate">中度</option>
                    <option value="severe">重度</option>
                  </select>
                </div>
                {form.abnormalItems.length > 1 && (
                  <button className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc', height: 38 }} onClick={() => removeItem(idx)}>×</button>
                )}
              </div>
            ))}
          </div>

          <div className="form-group" style={{ marginTop: 12 }}>
            <label className="form-label">备注</label>
            <textarea className="form-input" rows={2} placeholder="诊疗建议或注意事项" value={form.notes} onChange={e => setField('notes', e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? '保存中...' : '创建任务'}</button>
        </div>
      </div>
    </div>
  )
}

function DetailPanel({ review, onClose, onUpdated }) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [resolvedNote, setResolvedNote] = useState(review.resolvedNote || '')
  const [reviewDate, setReviewDate] = useState(review.reviewDate ? review.reviewDate.slice(0, 10) : '')

  const update = async (fields) => {
    setSaving(true)
    try {
      await staffAPI.updateAbnormalReview(review._id, fields)
      toast('已更新')
      onUpdated()
    } catch (err) { toast(err.message) }
    finally { setSaving(false) }
  }

  const statusActions = {
    pending:   ['scheduled', '安排复查'],
    scheduled: ['completed', '标记完成'],
    completed: null,
    cancelled: null,
  }
  const nextAction = statusActions[review.status]

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 540, width: '95%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{review.title || '异常复查'}</h3>
            <div style={{ fontSize: 13, color: '#8AA89C', marginTop: 3 }}>
              {review.patientId?.name} · {review.patientId?.phone} · {new Date(review.createdAt).toLocaleDateString('zh-CN')}
            </div>
          </div>
          <span style={{ color: STATUS_COLOR[review.status], fontWeight: 600, fontSize: 13 }}>{STATUS_LABEL[review.status]}</span>
        </div>

        {/* 异常项目表 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#4A6558', marginBottom: 8 }}>异常指标</div>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#f9f7f3' }}>
              {['项目', '检测值', '参考范围', '程度'].map(h => <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 500, color: '#8AA89C', borderBottom: '1px solid #f0ece4' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {(review.abnormalItems || []).map((item, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f5f2ec' }}>
                  <td style={{ padding: '7px 10px', fontWeight: 500 }}>{item.name}</td>
                  <td style={{ padding: '7px 10px', color: '#DC3545', fontWeight: 600 }}>{item.value || '-'}</td>
                  <td style={{ padding: '7px 10px', color: '#888' }}>{item.reference || '-'}</td>
                  <td style={{ padding: '7px 10px' }}>
                    <span style={{ color: SEVERITY_COLOR[item.severity], fontSize: 12, fontWeight: 600 }}>{SEVERITY_LABEL[item.severity] || '-'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 计划复查日期 */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: '#8AA89C', fontWeight: 600, display: 'block', marginBottom: 4 }}>复查日期</label>
            <input className="form-input" type="date" value={reviewDate} onChange={e => setReviewDate(e.target.value)} style={{ fontSize: 13 }} />
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => update({ reviewDate })} disabled={saving}>保存日期</button>
        </div>

        {/* 备注 */}
        {review.notes && <div style={{ marginBottom: 16, padding: 12, background: '#f9f7f3', borderRadius: 8, fontSize: 13, color: '#4A6558' }}>{review.notes}</div>}

        {/* 完成备注 */}
        {review.status !== 'completed' && review.status !== 'cancelled' && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: '#8AA89C', fontWeight: 600, display: 'block', marginBottom: 4 }}>完成备注</label>
            <textarea className="form-input" rows={2} value={resolvedNote} onChange={e => setResolvedNote(e.target.value)} placeholder="复查结果或处理说明" style={{ fontSize: 13 }} />
          </div>
        )}
        {review.resolvedNote && review.status === 'completed' && (
          <div style={{ marginBottom: 16, padding: 12, background: '#f0faf5', borderRadius: 8, fontSize: 13, color: '#1E6B50' }}>✓ {review.resolvedNote}</div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>关闭</button>
          {nextAction && (
            <button className="btn btn-primary btn-sm" disabled={saving}
              onClick={() => update({ status: nextAction[0], resolvedNote })}>
              {nextAction[1]}
            </button>
          )}
          {review.status !== 'cancelled' && review.status !== 'completed' && (
            <button className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc' }}
              onClick={() => { if(window.confirm('确定取消此复查任务？')) update({ status: 'cancelled' }) }}>
              取消任务
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AbnormalReviewPage() {
  const toast = useToast()
  const [reviews, setReviews]     = useState([])
  const [patients, setPatients]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPatient, setFilterPatient] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected]   = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const params = {}
      if (filterStatus) params.status = filterStatus
      if (filterPatient) params.patientId = filterPatient
      const [r, p] = await Promise.all([
        staffAPI.getAbnormalReviews(params),
        staffAPI.getPatients({ limit: 200 }),
      ])
      setReviews(r.data || [])
      setPatients(p.data?.patients || p.data || [])
    } catch (err) { toast(err.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [filterStatus, filterPatient])

  const pendingCount = reviews.filter(r => r.status === 'pending').length
  const scheduledCount = reviews.filter(r => r.status === 'scheduled').length

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">⚠️ 异常复查</div>
          <div className="page-subtitle">
            跟踪患者报告中的异常指标，安排复查和处理
            {pendingCount > 0 && <span style={{ marginLeft: 8, background: '#DC3545', color: '#fff', fontSize: 11, padding: '2px 7px', borderRadius: 10 }}>{pendingCount} 待处理</span>}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>➕ 新建复查任务</button>
      </div>

      {/* 筛选栏 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="form-input" style={{ width: 140 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">全部状态</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="form-input" style={{ width: 200 }} value={filterPatient} onChange={e => setFilterPatient(e.target.value)}>
          <option value="">全部患者</option>
          {patients.map(p => <option key={p._id} value={p._id}>{p.name} · {p.phone}</option>)}
        </select>
      </div>

      {/* 统计 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: '待处理', count: pendingCount, color: '#D97706' },
          { label: '已预约', count: scheduledCount, color: '#0077B6' },
          { label: '已完成', count: reviews.filter(r => r.status === 'completed').length, color: '#22A06B' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', borderRadius: 10, padding: '12px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', minWidth: 100 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.count}</div>
            <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>加载中...</div>
        ) : !reviews.length ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无复查任务</div>
        ) : (
          <table className="table">
            <thead><tr>
              <th>患者</th><th>任务标题</th><th>异常项目</th><th>计划复查</th><th>状态</th><th>创建时间</th><th>操作</th>
            </tr></thead>
            <tbody>
              {reviews.map(r => (
                <tr key={r._id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.patientId?.name}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>{r.patientId?.phone}</div>
                  </td>
                  <td style={{ fontWeight: 500 }}>{r.title || '异常复查'}</td>
                  <td>
                    {(r.abnormalItems || []).slice(0, 2).map((item, i) => (
                      <span key={i} style={{ display: 'inline-block', marginRight: 4, marginBottom: 2, background: SEVERITY_COLOR[item.severity] + '15', color: SEVERITY_COLOR[item.severity], fontSize: 11, padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                        {item.name}
                      </span>
                    ))}
                    {r.abnormalItems?.length > 2 && <span style={{ fontSize: 11, color: '#aaa' }}>+{r.abnormalItems.length - 2}</span>}
                  </td>
                  <td style={{ fontSize: 13, color: '#666' }}>{r.reviewDate ? new Date(r.reviewDate).toLocaleDateString('zh-CN') : '-'}</td>
                  <td>
                    <span style={{ color: STATUS_COLOR[r.status], fontWeight: 600, fontSize: 13 }}>{STATUS_LABEL[r.status]}</span>
                  </td>
                  <td style={{ fontSize: 12, color: '#888' }}>{new Date(r.createdAt).toLocaleDateString('zh-CN')}</td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => setSelected(r)}>详情</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <CreateModal patients={patients} onClose={() => setShowCreate(false)} onSaved={load} />
      )}
      {selected && (
        <DetailPanel review={selected} onClose={() => setSelected(null)} onUpdated={() => { setSelected(null); load() }} />
      )}
    </div>
  )
}
