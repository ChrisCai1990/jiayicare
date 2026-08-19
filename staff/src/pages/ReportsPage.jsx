import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI, API_ORIGIN } from '../api'
import { useToast, usePermission } from '../App'
import Pagination from '../components/Pagination'

const REPORT_TYPE = { annual:'年度体检', blood:'血液检查', ultrasound:'超声检查', radiology:'放射检查', mri:'磁共振', ecg:'心电图', endoscopy:'内镜', pathology:'病理', other:'其他' }
const AUDIT_STATUS = { unaudited:'待审核', audited:'已审核', rejected:'已驳回' }
const AUDIT_COLOR = { unaudited:'#D97706', audited:'#22A06B', rejected:'#DC3545' }

export default function ReportsPage() {
  const toast = useToast()
  const can = usePermission()
  const navigate = useNavigate()
  const [reports, setReports] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [showUpload, setShowUpload] = useState(false)
  const [showDetail, setShowDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [rejectModal, setRejectModal] = useState(null) // report object pending rejection
  const [rejectReason, setRejectReason] = useState('')
  const [editModal, setEditModal] = useState(null) // report object being edited
  const [editForm, setEditForm] = useState({ title: '', type: 'annual', hospital: '', date: '', note: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [auditBusyId, setAuditBusyId] = useState('')
  const auditRequestIdsRef = useRef(new Map())
  const [patients, setPatients] = useState([])
  const limit = 20

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await staffAPI.getReports({ status: statusFilter, search, page, limit })
      setReports(res.data.reports); setTotal(res.data.total)
    } finally { setLoading(false) }
  }, [statusFilter, search, page])

  useEffect(() => { load() }, [load])
  useEffect(() => { staffAPI.getPatients({ limit: 200 }).then(r => setPatients(r.data.patients)).catch(() => {}) }, [])

  // 搜索防抖：停止输入 400ms 后再请求，避免每敲一个字就打后端
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [searchInput])

  const openDetail = async (r) => {
    setDetailLoading(true)
    setShowDetail(r)
    try {
      const res = await staffAPI.getReport(r._id)
      setShowDetail(res.data)
    } catch { /* keep partial data */ }
    finally { setDetailLoading(false) }
  }

  const handleAudit = async (report, action, rejectReason = '') => {
    if (auditBusyId) return
    const id = report._id
    const requestKey = `${id}:${action}`
    const requestId = auditRequestIdsRef.current.get(requestKey)
      || globalThis.crypto?.randomUUID?.()
      || `report-review-${Date.now()}-${Math.random().toString(36).slice(2)}`
    auditRequestIdsRef.current.set(requestKey, requestId)
    setAuditBusyId(id)
    try {
      await staffAPI.auditReport(id, { action, rejectReason, reviewRequestId: requestId, reviewBaseRevisionId: report.currentRevisionId || null })
      auditRequestIdsRef.current.delete(requestKey)
      toast(action === 'approve' ? '审核通过' : '已驳回'); load()
    } catch (err) { toast(err.message) }
    finally { setAuditBusyId('') }
  }

  const handleEditSave = async () => {
    if (!editForm.title.trim()) { toast('标题不能为空'); return }
    setEditSaving(true)
    try {
      await staffAPI.updateReport(editModal._id, editForm)
      toast('修改成功'); setEditModal(null); load()
    } catch (err) { toast(err.message) }
    finally { setEditSaving(false) }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">报告管理</h1>
          <p className="page-subtitle">共 {total} 份报告</p>
        </div>
        {(can('reports', 'create') || can('reports', 'audit')) && <button className="btn btn-primary" onClick={() => setShowUpload(true)}>＋ 上传报告</button>}
      </div>

      {/* 状态筛选 + 搜索 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {[{ v: '', l: '全部' }, { v: 'unaudited', l: '待审核' }, { v: 'audited', l: '已审核' }, { v: 'rejected', l: '已驳回' }].map(opt => (
            <button key={opt.v} className={`btn btn-sm ${statusFilter === opt.v ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setStatusFilter(opt.v); setPage(1) }}>{opt.l}</button>
          ))}
        </div>
        <input
          className="form-input"
          style={{ width: 240 }}
          placeholder="🔍 搜索会员姓名/手机号/报告标题"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
        />
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
                      {can('reports', 'audit') && r.audit_status !== 'audited' && (
                        <button className="btn btn-secondary btn-sm" onClick={() => { setEditModal(r); setEditForm({ title: r.title || '', type: r.type || 'annual', hospital: r.hospital || '', date: r.date || '', note: r.note || '' }) }}>✏️ 修改</button>
                      )}
                      {can('reports', 'audit') && r.audit_status === 'unaudited' && (!r.aiStatus || r.aiStatus === 'none') && (
                        <button className="btn btn-primary btn-sm" onClick={() => handleAudit(r, 'approve')}>✓ 通过</button>
                      )}
                      {can('reports', 'audit') && r.audit_status === 'unaudited' && r.aiStatus && r.aiStatus !== 'none' && (
                        <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/patients/${r.user?._id}?tab=reports`)}>前往核对 OCR</button>
                      )}
                      {can('reports', 'audit') && (r.audit_status === 'unaudited' || r.audit_status === 'audited') && (
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
        <Pagination page={page} totalPages={Math.ceil(total / limit)} onChange={setPage} />
      )}

      {/* 上传弹窗 */}
      {showUpload && <SelectUploadPatientModal
        patients={patients}
        onClose={() => setShowUpload(false)}
        onSelect={(patientId) => {
          setShowUpload(false)
          navigate(`/patients/${patientId}?tab=reports&upload=1`)
        }}
      />}

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
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 8 }}>报告文件</div>
                {(() => {
                  // fileUrl 是后端相对路径（如 /api/uploads/reports/xxx.pdf），必须拼上 API_ORIGIN
                  // 才是完整地址——之前直接把相对路径丢给 <img>/<iframe src>，浏览器会基于当前页面
                  // 域名(staff.jiaycare.com)解析，而文件实际只在API域名(jiaycare.com)下可访问，
                  // 导致请求404，AI解析后完全打不开原件（2026-07-13 反馈）
                  const rawSrc = showDetail.content || showDetail.previewUrl || showDetail.fileUrl;
                  const src = rawSrc && rawSrc.startsWith('/') ? API_ORIGIN + rawSrc : rawSrc;
                  if (!src) {
                    return (
                      <div style={{ padding: '12px 14px', background: '#f9f7f3', borderRadius: 8, fontSize: 13, color: '#8AA89C' }}>
                        <span style={{ fontSize: 16, marginRight: 6 }}>⚠️</span>
                        原始文件未存储（可能因文件过大被跳过）。
                        {showDetail.mimeType && <span style={{ marginLeft: 4 }}>格式：{showDetail.mimeType}，大小：{showDetail.fileSize || '-'}</span>}
                        <span style={{ display: 'block', marginTop: 4 }}>如需查看，请要求会员重新上传较小的文件（≤7MB）。</span>
                      </div>
                    );
                  }
                  const url = showDetail.fileUrl || '';
                  const isImage = showDetail.mimeType?.startsWith('image/') || src.startsWith('data:image') || /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(url);
                  const isPdf = showDetail.mimeType === 'application/pdf' || url.endsWith('.pdf') || src.startsWith('data:application/pdf');
                  if (isImage) return (
                    <>
                      <img src={src} alt="报告" style={{ maxWidth: '100%', maxHeight: '55vh', objectFit: 'contain', borderRadius: 8, border: '1px solid #f0ece4', display: 'block' }}
                        onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }} />
                      <div style={{ display: 'none', padding: '12px 14px', background: '#f9f7f3', borderRadius: 8, fontSize: 13, color: '#8AA89C' }}>
                        图片加载失败。<a href={src} target="_blank" rel="noreferrer" style={{ color: '#1E6B50', marginLeft: 4 }}>点击直接打开 →</a>
                      </div>
                      <a href={src} target="_blank" rel="noreferrer" download className="btn btn-secondary btn-sm" style={{ marginTop: 8, display: 'inline-block' }}>⬇️ 下载图片</a>
                    </>
                  );
                  if (isPdf) return (
                    <>
                      <iframe src={src} title="PDF报告" style={{ width: '100%', height: 420, border: '1px solid #f0ece4', borderRadius: 8 }} />
                      <a href={src} target="_blank" rel="noreferrer" download className="btn btn-secondary btn-sm" style={{ marginTop: 8, display: 'inline-block' }}>⬇️ 下载 PDF</a>
                    </>
                  );
                  return <a href={src} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">📎 查看/下载文件</a>;
                })()}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowDetail(null)}>关闭</button>
              {can('reports', 'audit') && (showDetail.audit_status === 'unaudited' || showDetail.audit_status === 'audited') && (
                <button className="btn btn-danger" onClick={() => { setShowDetail(null); setRejectModal(showDetail); setRejectReason('') }}>✗ 驳回</button>
              )}
              {can('reports', 'audit') && showDetail.audit_status === 'unaudited' && (!showDetail.aiStatus || showDetail.aiStatus === 'none') && (
                <button className="btn btn-primary" onClick={() => { handleAudit(showDetail, 'approve'); setShowDetail(null) }}>✓ 审核通过</button>
              )}
              {can('reports', 'audit') && showDetail.audit_status === 'unaudited' && showDetail.aiStatus && showDetail.aiStatus !== 'none' && (
                <button className="btn btn-primary" onClick={() => navigate(`/patients/${showDetail.user?._id}?tab=reports`)}>前往核对 OCR</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 修改报告弹窗 */}
      {editModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setEditModal(null) }}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3 className="modal-title">修改报告信息</h3>
              <button className="modal-close" onClick={() => setEditModal(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">报告标题 *</label>
                <input className="form-input" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">报告类型</label>
                  <select className="form-input" value={editForm.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))}>
                    {Object.entries(REPORT_TYPE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">报告日期</label>
                  <input className="form-input" type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">医院</label>
                <input className="form-input" value={editForm.hospital} onChange={e => setEditForm(f => ({ ...f, hospital: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">备注</label>
                <textarea className="form-input" rows={2} value={editForm.note} onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditModal(null)}>取消</button>
              <button className="btn btn-primary" onClick={handleEditSave} disabled={editSaving}>{editSaving ? '保存中...' : '保存修改'}</button>
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
              <button className="btn btn-danger" onClick={() => { handleAudit(rejectModal, 'reject', rejectReason); setRejectModal(null) }}>确认驳回</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SelectUploadPatientModal({ patients, onClose, onSelect }) {
  const [patientId, setPatientId] = useState('')
  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <h3 className="modal-title">选择报告所属会员</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: '#60756B', background: '#F4F8F6', borderRadius: 8, padding: '9px 11px' }}>
            选择会员后进入其报告页上传。图片、多页报告和 PDF 都会使用统一的原件留证、安全清理与 OCR 审核流程。
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">选择会员 *</label>
            <select className="form-input" value={patientId} onChange={event => setPatientId(event.target.value)} autoFocus>
              <option value="">-- 请选择会员 --</option>
              {patients.map(p => <option key={p._id} value={p._id}>{p.name} · {p.phone}</option>)}
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={() => patientId && onSelect(patientId)} disabled={!patientId}>进入安全上传</button>
        </div>
      </div>
    </div>
  )
}
