import React, { useEffect, useState, useCallback } from 'react'
import { staffAPI } from '../api'
import { useToast } from '../App'

const REPORT_TYPE = { annual:'年度体检', blood:'血液检查', ultrasound:'超声检查', radiology:'放射检查', mri:'磁共振', ecg:'心电图', endoscopy:'内镜', pathology:'病理', other:'其他' }
const AUDIT_STATUS = { unaudited:'待审核', audited:'已审核', rejected:'已驳回' }
const AUDIT_COLOR = { unaudited:'#D97706', audited:'#22A06B', rejected:'#DC3545' }

export default function ReportsPage() {
  const toast = useToast()
  const [reports, setReports] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [showUpload, setShowUpload] = useState(false)
  const [showDetail, setShowDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [rejectModal, setRejectModal] = useState(null) // report object pending rejection
  const [rejectReason, setRejectReason] = useState('')
  const [abnormalModal, setAbnormalModal] = useState(null) // report object for abnormal approval
  const [abnormalItems, setAbnormalItems] = useState([{ name: '', value: '', reference: '', severity: 'mild' }])
  const [patients, setPatients] = useState([])
  const limit = 20

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await staffAPI.getReports({ status: statusFilter, page, limit })
      setReports(res.data.reports); setTotal(res.data.total)
    } finally { setLoading(false) }
  }, [statusFilter, page])

  useEffect(() => { load() }, [load])
  useEffect(() => { staffAPI.getPatients({ limit: 200 }).then(r => setPatients(r.data.patients)).catch(() => {}) }, [])

  const openDetail = async (r) => {
    setDetailLoading(true)
    setShowDetail(r)
    try {
      const res = await staffAPI.getReport(r._id)
      setShowDetail(res.data)
    } catch { /* keep partial data */ }
    finally { setDetailLoading(false) }
  }

  const handleAudit = async (id, action, rejectReason = '', abnItems = []) => {
    try {
      await staffAPI.auditReport(id, { action, rejectReason, abnormalItems: abnItems })
      toast(action === 'approve' ? (abnItems.length ? '审核通过（已创建复查任务）' : '审核通过') : '已驳回'); load()
    } catch (err) { toast(err.message) }
  }

  const handleApproveWithAbnormal = async () => {
    const items = abnormalItems.filter(i => i.name)
    await handleAudit(abnormalModal._id, 'approve', '', items)
    setAbnormalModal(null)
    setAbnormalItems([{ name: '', value: '', reference: '', severity: 'mild' }])
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">报告管理</h1>
          <p className="page-subtitle">共 {total} 份报告</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowUpload(true)}>＋ 上传报告</button>
      </div>

      {/* 状态筛选 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[{ v: '', l: '全部' }, { v: 'unaudited', l: '待审核' }, { v: 'audited', l: '已审核' }, { v: 'rejected', l: '已驳回' }].map(opt => (
          <button key={opt.v} className={`btn btn-sm ${statusFilter === opt.v ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setStatusFilter(opt.v); setPage(1) }}>{opt.l}</button>
        ))}
      </div>

      <div className="card">
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>加载中...</div>
        : reports.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无报告</div>
        : <table className="table">
            <thead><tr><th>标题</th><th>会员</th><th>类型</th><th>医院</th><th>日期</th><th>审核状态</th><th>上传人</th><th>操作</th></tr></thead>
            <tbody>
              {reports.map(r => (
                <tr key={r._id}>
                  <td><strong style={{ cursor: 'pointer', color: '#1E6B50' }} onClick={() => openDetail(r)}>{r.title}</strong></td>
                  <td>{r.user?.name} <span style={{ color: '#aaa', fontSize: 12 }}>{r.user?.phone}</span></td>
                  <td><span className="badge badge-info">{REPORT_TYPE[r.type] || r.type}</span></td>
                  <td style={{ color: '#666', fontSize: 13 }}>{r.hospital || '-'}</td>
                  <td style={{ color: '#666', fontSize: 13 }}>{r.date || '-'}</td>
                  <td>
                    <span style={{ color: AUDIT_COLOR[r.audit_status], fontWeight: 500, fontSize: 13 }}>
                      {AUDIT_STATUS[r.audit_status]}
                    </span>
                    {r.reject_reason && <div style={{ fontSize: 11, color: '#DC3545' }}>{r.reject_reason}</div>}
                  </td>
                  <td style={{ color: '#666', fontSize: 13 }}>{r.uploadedBy?.name || '-'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openDetail(r)}>查看</button>
                      {r.audit_status === 'unaudited' && (
                        <>
                          <button className="btn btn-primary btn-sm" onClick={() => handleAudit(r._id, 'approve')}>✓ 通过</button>
                          <button className="btn btn-sm" style={{ background: '#fff8e1', color: '#D97706', border: '1px solid #D97706' }}
                            onClick={() => { setAbnormalModal(r); setAbnormalItems([{ name: '', value: '', reference: '', severity: 'mild' }]) }}>⚠️ 含异常</button>
                        </>
                      )}
                      {(r.audit_status === 'unaudited' || r.audit_status === 'audited') && (
                        <button className="btn btn-danger btn-sm" onClick={() => { setRejectModal(r); setRejectReason('') }}>✗ 驳回</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>}
      </div>

      {/* 分页 */}
      {total > limit && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
          <span style={{ lineHeight: '32px', fontSize: 14, color: '#666' }}>第 {page} / {Math.ceil(total / limit)} 页</span>
          <button className="btn btn-secondary btn-sm" disabled={page >= Math.ceil(total / limit)} onClick={() => setPage(p => p + 1)}>下一页</button>
        </div>
      )}

      {/* 上传弹窗 */}
      {showUpload && <UploadModal patients={patients} onClose={() => setShowUpload(false)} onSaved={() => { setShowUpload(false); toast('上传成功'); load() }} />}

      {/* 详情弹窗 */}
      {showDetail && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowDetail(null) }}>
          <div className="modal" style={{ maxWidth: 600, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ flexShrink: 0 }}>
              <h3 className="modal-title">{showDetail.title}{detailLoading && <span style={{ fontSize: 12, color: '#aaa', marginLeft: 8 }}>加载中...</span>}</h3>
              <button className="modal-close" onClick={() => setShowDetail(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ overflowY: 'auto', flex: 1 }}>
              {[
                ['会员', showDetail.user?.name],
                ['类型', REPORT_TYPE[showDetail.type] || showDetail.type],
                ['医院', showDetail.hospital || '-'],
                ['报告日期', showDetail.date || '-'],
                ['审核状态', AUDIT_STATUS[showDetail.audit_status]],
                ['审核人', showDetail.audited_by || '-'],
                ['驳回原因', showDetail.reject_reason || '-'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', padding: '8px 0', borderBottom: '1px solid #f5f2ec' }}>
                  <span style={{ width: 100, color: '#8AA89C', fontSize: 13 }}>{k}</span>
                  <span style={{ flex: 1, fontSize: 13 }}>{v}</span>
                </div>
              ))}
              {showDetail.note && <div style={{ marginTop: 12, padding: 12, background: '#f9f7f3', borderRadius: 8, fontSize: 13 }}>{showDetail.note}</div>}
              {(showDetail.content || showDetail.fileUrl) && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 8 }}>报告文件</div>
                  {showDetail.mimeType?.startsWith('image/') || showDetail.content?.startsWith('data:image') ? (
                    <img src={showDetail.content || showDetail.fileUrl} alt="报告" style={{ maxWidth: '100%', maxHeight: '55vh', objectFit: 'contain', borderRadius: 8, border: '1px solid #f0ece4', display: 'block' }} />
                  ) : showDetail.mimeType === 'application/pdf' || showDetail.fileUrl?.endsWith('.pdf') ? (
                    <iframe src={showDetail.content || showDetail.fileUrl} title="PDF报告" style={{ width: '100%', height: 400, border: '1px solid #f0ece4', borderRadius: 8 }} />
                  ) : (showDetail.content || showDetail.fileUrl) ? (
                    <a href={showDetail.content || showDetail.fileUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">📎 查看文件</a>
                  ) : null}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowDetail(null)}>关闭</button>
              {(showDetail.audit_status === 'unaudited' || showDetail.audit_status === 'audited') && (
                <button className="btn btn-danger" onClick={() => { setShowDetail(null); setRejectModal(showDetail); setRejectReason('') }}>✗ 驳回</button>
              )}
              {showDetail.audit_status === 'unaudited' && (
                <button className="btn btn-primary" onClick={() => { handleAudit(showDetail._id, 'approve'); setShowDetail(null) }}>✓ 审核通过</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 含异常审核通过弹窗 */}
      {abnormalModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setAbnormalModal(null) }}>
          <div className="modal" style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h3 className="modal-title">⚠️ 标记异常并审核通过</h3>
              <button className="modal-close" onClick={() => setAbnormalModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 12, fontSize: 13, color: '#4A6558' }}>报告：{abnormalModal.title}</div>
              <div style={{ marginBottom: 8, fontSize: 12, color: '#8AA89C' }}>填写异常指标后，系统将自动为该患者创建复查任务</div>
              {abnormalItems.map((item, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'flex-end' }}>
                  {idx === 0 && ['项目', '检测值', '参考范围', '严重程度', ''].map((h, i) => (
                    <div key={i} style={{ fontSize: 11, color: '#8AA89C', fontWeight: 600 }}>{h}</div>
                  ))}
                  {idx === 0 && <div/>}
                  <input className="form-input" placeholder="如：空腹血糖" value={item.name}
                    onChange={e => { const items = [...abnormalItems]; items[idx].name = e.target.value; setAbnormalItems(items) }} />
                  <input className="form-input" placeholder="如：8.5" value={item.value}
                    onChange={e => { const items = [...abnormalItems]; items[idx].value = e.target.value; setAbnormalItems(items) }} />
                  <input className="form-input" placeholder="如：3.9-6.1" value={item.reference}
                    onChange={e => { const items = [...abnormalItems]; items[idx].reference = e.target.value; setAbnormalItems(items) }} />
                  <select className="form-input" value={item.severity}
                    onChange={e => { const items = [...abnormalItems]; items[idx].severity = e.target.value; setAbnormalItems(items) }}>
                    <option value="mild">轻度</option>
                    <option value="moderate">中度</option>
                    <option value="severe">重度</option>
                  </select>
                  {abnormalItems.length > 1 && (
                    <button className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc', height: 38 }}
                      onClick={() => setAbnormalItems(items => items.filter((_, i) => i !== idx))}>×</button>
                  )}
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={() => setAbnormalItems(items => [...items, { name: '', value: '', reference: '', severity: 'mild' }])}>＋ 添加项目</button>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setAbnormalModal(null)}>取消</button>
              <button className="btn btn-primary" onClick={() => { handleAudit(abnormalModal._id, 'approve'); setAbnormalModal(null) }}>仅通过（不标记异常）</button>
              <button className="btn btn-warning" style={{ background: '#D97706', color: '#fff' }} onClick={handleApproveWithAbnormal}>通过 + 创建复查任务</button>
            </div>
          </div>
        </div>
      )}

      {/* 驳回原因弹窗 */}
      {rejectModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setRejectModal(null) }}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 className="modal-title">驳回报告</h3>
              <button className="modal-close" onClick={() => setRejectModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 8, fontSize: 13, color: '#4A6558' }}>报告：{rejectModal.title}</div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">驳回原因</label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="请输入驳回原因（可选）"
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setRejectModal(null)}>取消</button>
              <button className="btn btn-danger" onClick={() => { handleAudit(rejectModal._id, 'reject', rejectReason); setRejectModal(null) }}>确认驳回</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const PLAN_TYPE_LABEL = { checkup:'体检方案', health:'健康管理方案', followup:'随访计划', nutrition:'营养干预', rehab:'运动康复', tcm:'中医方案' }

function UploadModal({ patients, onClose, onSaved }) {
  const [form, setForm] = useState({ patientId: '', title: '', type: 'annual', hospital: '', date: '', note: '', planId: '', planItemId: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [planItems, setPlanItems] = useState([])
  const [loadingItems, setLoadingItems] = useState(false)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  // 切换会员时加载该会员的待完成方案项目
  const handlePatientChange = async (e) => {
    const patientId = e.target.value
    setForm(f => ({ ...f, patientId, planId: '', planItemId: '' }))
    if (!patientId) { setPlanItems([]); return }
    setLoadingItems(true)
    try {
      const res = await staffAPI.getActivePlanItems(patientId)
      setPlanItems(res.data)
    } catch { setPlanItems([]) }
    finally { setLoadingItems(false) }
  }

  // 选择关联项目后自动填充标题
  const handleItemChange = (e) => {
    const val = e.target.value
    if (!val) { setForm(f => ({ ...f, planId: '', planItemId: '' })); return }
    const [planId, itemId] = val.split('|')
    const item = planItems.find(i => i.planId.toString() === planId && i.itemId.toString() === itemId)
    setForm(f => ({
      ...f, planId, planItemId: itemId,
      title: f.title || (item ? item.itemName : f.title),
    }))
  }

  const handleSubmit = async () => {
    if (!form.patientId || !form.title) { setError('会员和标题不能为空'); return }
    setSaving(true); setError('')
    try {
      await staffAPI.uploadReport({ ...form, fileUrl: '', content: '', mimeType: '' })
      onSaved()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <h3 className="modal-title">上传报告</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {error && <div className="login-err" style={{ margin: '0 20px 8px' }}>⚠️ {error}</div>}
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">选择会员 *</label>
            <select className="form-input" value={form.patientId} onChange={handlePatientChange}>
              <option value="">-- 请选择会员 --</option>
              {patients.map(p => <option key={p._id} value={p._id}>{p.name} · {p.phone}</option>)}
            </select>
          </div>

          {/* 关联待完成项目 */}
          {form.patientId && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">关联方案项目（可选）
                <span style={{ fontSize: 11, color: '#8AA89C', marginLeft: 6 }}>关联后审核通过自动标记完成</span>
              </label>
              <select className="form-input" value={form.planId && form.planItemId ? `${form.planId}|${form.planItemId}` : ''} onChange={handleItemChange}>
                <option value="">-- 不关联 --</option>
                {loadingItems && <option disabled>加载中...</option>}
                {planItems.map(i => (
                  <option key={`${i.planId}|${i.itemId}`} value={`${i.planId}|${i.itemId}`}>
                    [{PLAN_TYPE_LABEL[i.planType] || i.planType}] {i.planTitle} · {i.itemName}
                    {i.scheduledDate ? ` (${new Date(i.scheduledDate).toLocaleDateString('zh-CN')})` : ''}
                  </option>
                ))}
                {!loadingItems && planItems.length === 0 && <option disabled>暂无待完成项目</option>}
              </select>
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">报告标题 *</label>
            <input className="form-input" placeholder="如：2025年度体检报告" value={form.title} onChange={set('title')} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">报告类型</label>
              <select className="form-input" value={form.type} onChange={set('type')}>
                {Object.entries(REPORT_TYPE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">报告日期</label>
              <input className="form-input" type="date" value={form.date} onChange={set('date')} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">医院</label>
            <input className="form-input" placeholder="医院名称" value={form.hospital} onChange={set('hospital')} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">备注</label>
            <textarea className="form-input" rows={2} value={form.note} onChange={set('note')} />
          </div>
          <div style={{ padding: '10px 12px', background: '#f9f7f3', borderRadius: 8, fontSize: 13, color: '#8AA89C' }}>
            📎 文件上传（PDF/图片）将在后续版本接入云存储后开放
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving ? '上传中...' : '提交'}</button>
        </div>
      </div>
    </div>
  )
}
