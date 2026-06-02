import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'
import { useToast, useStaff } from '../App'
import FollowUpModal from '../components/FollowUpModal'

const TYPE_MAP = { phone: '电话', wechat: '微信', visit: '上门', video: '视频', other: '其他' }
const STATUS_MAP = { completed: '已完成', missed: '未接通', planned: '计划中' }
const STATUS_COLOR = { completed: '#22A06B', missed: '#DC3545', planned: '#D97706' }
const PLAN_TYPE_LABEL = {
  annual_checkup:'年度体检方案', annual_mgmt:'年度管理方案',
  nutrition:'营养干预方案', medical_assist:'就医协助方案',
  tcm:'中医调理方案', rehab:'运动复健方案', psychology:'心理咨询方案',
  checkup:'体检方案', health:'健康管理方案', followup:'随访计划',
}
const PLAN_STATUS_COLOR = { draft:'#aaa', active:'#22A06B', completed:'#0077B6' }
const PLAN_STATUS_LABEL = { draft:'草稿', active:'进行中', completed:'已完成' }
const SR_TYPE_LABEL = {
  nutrition:'营养干预', disease_mgmt:'专病管理', medical_visit:'医院就医', routine:'日常随访',
  medical_escort:'就医协助', psychology:'心理咨询', rehab:'运动复健', tcm:'中医评估', specialist:'专科会诊',
}
const SR_CATEGORY = {
  nutrition:     '营养干预',
  disease_mgmt:  '专病管理', specialist: '专病管理', psychology: '专病管理', rehab: '专病管理', tcm: '专病管理',
  medical_visit: '医院就医', medical_escort: '医院就医',
  routine:       '日常随访',
}
const SR_CATEGORY_COLOR = { '营养干预':'#22A06B', '专病管理':'#0077B6', '医院就医':'#D97706', '日常随访':'#8A4AC7' }

// ── 开单弹窗 ─────────────────────────────────────────────
function RequisitionModal({ patientId, onClose, onSaved }) {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const timerRef = React.useRef()

  const doSearch = async (q) => {
    if (!q.trim()) { setSearchResults([]); return }
    setSearching(true)
    try {
      const res = await staffAPI.getRequisitionItems(q)
      setSearchResults(res.data || [])
    } catch { setSearchResults([]) }
    finally { setSearching(false) }
  }

  const handleSearchInput = e => {
    const q = e.target.value; setSearchQ(q)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => doSearch(q), 300)
  }

  const addItem = (item) => {
    if (items.find(i => i.itemId === item._id)) return
    setItems(prev => [...prev, { itemType: item.type, itemId: item._id, itemName: item.name, notes: '' }])
    setSearchQ(''); setSearchResults([])
  }

  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx))
  const updateItemNotes = (idx, v) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, notes: v } : it))

  const handleSave = async () => {
    if (!items.length) { setError('请至少添加一个检查项目'); return }
    setSaving(true); setError('')
    try {
      await staffAPI.createRequisition({ patientId, title: title || '检查开单', notes, items, dueDate: dueDate || null })
      onSaved()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 600, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h3 className="modal-title">新建检查开单</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {error && <div className="login-err" style={{ margin: '0 20px 8px' }}>⚠️ {error}</div>}
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
              <label className="form-label">开单标题</label>
              <input className="form-input" placeholder="如：2026年5月体检开单" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">要求完成日期（可选）</label>
              <input className="form-input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">整体备注（可选）</label>
              <input className="form-input" placeholder="整体注意事项..." value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>

          {/* 搜索添加项目 */}
          <div>
            <label className="form-label">搜索并添加检查项目</label>
            <div style={{ position: 'relative' }}>
              <input className="form-input" placeholder="输入名称或助记码搜索..." value={searchQ} onChange={handleSearchInput} />
              {searching && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#aaa' }}>搜索中...</span>}
              {searchResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999, background: '#fff', border: '1px solid #E0D9CE', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', maxHeight: 200, overflowY: 'auto', marginTop: 4 }}>
                  {searchResults.map(item => (
                    <div key={item._id} onMouseDown={() => addItem(item)} style={{ padding: '8px 14px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #f5f5f5' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f9f7f3'}
                      onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                      <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: item.type === 'labTestOrder' ? '#EEF2FF' : '#F0FDF4', color: item.type === 'labTestOrder' ? '#4338CA' : '#166534', fontWeight: 600 }}>{item.typeName}</span>
                      <span style={{ fontWeight: 500 }}>{item.name}</span>
                      {item.mnemonic && <span style={{ color: '#8AA89C', fontSize: 12 }}>{item.mnemonic}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 已选项目列表 */}
          {items.length > 0 ? (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1A2B24', marginBottom: 8 }}>已添加 {items.length} 个项目</div>
              {items.map((item, idx) => (
                <div key={idx} style={{ background: '#f9f7f3', borderRadius: 8, padding: '10px 12px', marginBottom: 8, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: item.itemType === 'labTestOrder' ? '#EEF2FF' : '#F0FDF4', color: item.itemType === 'labTestOrder' ? '#4338CA' : '#166534', fontWeight: 600 }}>{item.itemType === 'labTestOrder' ? '检验' : '检查'}</span>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{item.itemName}</span>
                    </div>
                    <input className="form-input" style={{ fontSize: 12 }} placeholder="注意事项（可选，如：空腹抽血）" value={item.notes} onChange={e => updateItemNotes(idx, e.target.value)} />
                  </div>
                  <button type="button" onClick={() => removeItem(idx)} style={{ background: 'none', border: 'none', color: '#DC3545', fontSize: 18, cursor: 'pointer', lineHeight: 1, flexShrink: 0, marginTop: 2 }}>✕</button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '20px', textAlign: 'center', color: '#aaa', fontSize: 13, background: '#f9f7f3', borderRadius: 8 }}>
              请搜索并添加需要检查的项目
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !items.length}>
            {saving ? '创建中...' : `创建开单（${items.length} 项）`}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PatientDetailPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { staff } = useStaff()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('info')  // info | records | reports | plans | serviceRecords | family | membership | billing
  const [followUps, setFollowUps] = useState([])
  const [plans, setPlans] = useState([])
  const [reports, setReports] = useState([])
  const [serviceRecords, setServiceRecords] = useState([])
  const [requisitions, setRequisitions] = useState([])
  const [showReqModal, setShowReqModal] = useState(false)
  const [showReferralModal, setShowReferralModal] = useState(false)
  const [showReportDetail, setShowReportDetail] = useState(null)
  const [showSRDetail, setShowSRDetail] = useState(null)
  const [staffList, setStaffList] = useState([])
  const [showFollowUpModal, setShowFollowUpModal] = useState(false)
  const [showUploadReport, setShowUploadReport] = useState(false)
  const [showMessageModal, setShowMessageModal] = useState(false)
  const [auditLoading, setAuditLoading] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [editingHealth, setEditingHealth] = useState(false)
  const [editingLifestyle, setEditingLifestyle] = useState(false)
  const [healthForm, setHealthForm] = useState({})
  const [lifestyleForm, setLifestyleForm] = useState({})

  const load = async () => {
    try {
      const res = await staffAPI.getPatient(id)
      setData(res.data)
      setEditForm(buildEditForm(res.data.user))
      setHealthForm(buildHealthForm(res.data.user))
      setLifestyleForm(buildLifestyleForm(res.data.user))
    } catch (err) {
      toast(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  const loadFollowUps = async () => {
    try {
      const res = await staffAPI.getPatientFollowUps(id)
      setFollowUps(res.data.followUps)
    } catch {}
  }

  const loadPlans = async () => {
    try { const res = await staffAPI.getPatientPlans(id); setPlans(res.data) } catch {}
  }
  const loadReports = async () => {
    try { const res = await staffAPI.getPatientReports(id); setReports(res.data) } catch {}
  }
  const loadServiceRecords = async () => {
    try { const res = await staffAPI.getPatientServiceRecords(id); setServiceRecords(res.data) } catch {}
  }
  const loadRequisitions = async () => {
    try { const res = await staffAPI.getPatientRequisitions(id); setRequisitions(res.data) } catch {}
  }
  useEffect(() => { load() }, [id])
  useEffect(() => {
    staffAPI.getStaffList().then(r => setStaffList(r.data)).catch(() => {})
  }, [])
  useEffect(() => {
    if (tab === 'followups') loadFollowUps()
    else if (tab === 'plans') loadPlans()
    else if (tab === 'reports') loadReports()
    else if (tab === 'serviceRecords') loadServiceRecords()
    else if (tab === 'requisitions') loadRequisitions()
  }, [tab])

  const buildEditForm = (u) => ({
    chronicDiseases: u.chronicDiseases || [],
    patientType: u.patientType || '',
    source: u.source || '',
    remark: u.remark || '',
    contactPhone: u.contactPhone || '',
    contactPhone2: u.contactPhone2 || '',
    deliveryAddress: u.deliveryAddress || '',
    assignedHealthManager: u.assignedHealthManager?._id || '',
    assignedFamilyDoctor:  u.assignedFamilyDoctor?._id  || '',
    assignedNutritionist:  u.assignedNutritionist?._id  || '',
    servicePackage: u.servicePackage || '',
    serviceExpiry: u.serviceExpiry || '',
    serviceStartDate: u.serviceStartDate || '',
  })

  const buildHealthForm = (u) => ({
    bloodTypeABO: u.bloodTypeABO || '',
    bloodTypeRH: u.bloodTypeRH || '',
    traumaHistory: u.traumaHistory || '',
    transfusionHistory: u.transfusionHistory || '',
    infectiousHistory: u.infectiousHistory || '',
    vaccinationHistory: u.vaccinationHistory || '',
    healthProfile: {
      drugAllergy: u.healthProfile?.drugAllergy || '',
      foodAllergy: u.healthProfile?.foodAllergy || '',
      pastHistory: u.healthProfile?.pastHistory || '',
      medicHistory: u.healthProfile?.medicHistory || '',
      surgeryHistory: u.healthProfile?.surgeryHistory || '',
    },
  })

  const buildLifestyleForm = (u) => ({
    lifestyle: {
      diet: u.lifestyle?.diet || '',
      exercise: u.lifestyle?.exercise || '',
      sleep: u.lifestyle?.sleep || '',
      water: u.lifestyle?.water || '',
      alcohol: u.lifestyle?.alcohol || '',
      smoking: u.lifestyle?.smoking || '',
      bowel: u.lifestyle?.bowel || '',
      mood: u.lifestyle?.mood || '',
    },
  })

  const handleSave = async () => {
    try {
      await staffAPI.updatePatient(id, editForm)
      toast('保存成功')
      setEditing(false)
      load()
    } catch (err) {
      toast(err.message || '保存失败')
    }
  }

  const handleSaveHealth = async () => {
    try {
      await staffAPI.updatePatient(id, healthForm)
      toast('健康档案已保存')
      setEditingHealth(false)
      load()
    } catch (err) { toast(err.message || '保存失败') }
  }

  const handleSaveLifestyle = async () => {
    try {
      await staffAPI.updatePatient(id, lifestyleForm)
      toast('生活方式已保存')
      setEditingLifestyle(false)
      load()
    } catch (err) { toast(err.message || '保存失败') }
  }

  const handleFollowUpCreated = () => {
    setShowFollowUpModal(false)
    toast('随访记录已保存')
    loadFollowUps()
    load()
  }

  const handleAudit = async (action) => {
    try {
      setAuditLoading(true)
      await staffAPI.auditReport(showReportDetail._id, { action, rejectReason })
      toast(action === 'approve' ? '已审核通过' : '已驳回')
      setShowReportDetail(null)
      setRejectReason('')
      setShowRejectInput(false)
      loadReports()
    } catch (err) {
      toast(err.message || '操作失败')
    } finally {
      setAuditLoading(false)
    }
  }

  if (loading) return <div className="page-loading">加载中...</div>
  if (!data) return <div className="page">会员不存在</div>

  const { user, recentFollowUps, recentRecords } = data
  const age = user.age ? `${user.age}岁` : '-'
  const bmi = user.height && user.weight
    ? (user.weight / Math.pow(user.height / 100, 2)).toFixed(1)
    : null

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => nav('/patients')}>← 返回</button>
          <div>
            <h1 className="page-title" style={{ marginBottom: 2 }}>
              {user.name}
              {user.patientType === 'vip' && <span className="badge badge-warning" style={{ marginLeft: 8 }}>VIP</span>}
            </h1>
            <p className="page-subtitle">{user.phone} · {user.gender} · {age}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowReferralModal(true)}>🔀 转介</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowMessageModal(true)}>💬 发消息</button>
          <button className="btn btn-primary" onClick={() => setShowFollowUpModal(true)}>＋ 记录随访</button>
        </div>
      </div>

      {/* 慢病标签 */}
      {user.chronicDiseases?.length > 0 && (
        <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {user.chronicDiseases.map(d => (
            <span key={d} className="badge badge-danger">{d}</span>
          ))}
        </div>
      )}

      {/* 服务效期提示 */}
      {user.serviceExpiry && (() => {
        const left = Math.ceil((new Date(user.serviceExpiry) - new Date()) / (1000 * 60 * 60 * 24))
        if (left > 30) return null
        const color = left <= 0 ? '#DC3545' : left <= 7 ? '#DC3545' : '#D97706'
        const bg = left <= 0 ? '#FEF2F2' : left <= 7 ? '#FEF2F2' : '#FFFBEB'
        return (
          <div style={{ marginBottom: 12, padding: '10px 16px', background: bg, borderRadius: 8, border: `1px solid ${color}20`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>{left <= 0 ? '🔴' : '⏰'}</span>
            <div>
              <span style={{ color, fontWeight: 600, fontSize: 14 }}>
                {left <= 0 ? '会员服务已到期' : `会员服务还剩 ${left} 天到期`}
              </span>
              <span style={{ color: '#666', fontSize: 13, marginLeft: 10 }}>
                {user.servicePackage} · 到期：{new Date(user.serviceExpiry).toLocaleDateString('zh-CN')}
              </span>
            </div>
          </div>
        )
      })()}

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 20 }}>
        {[
          { key: 'info',          label: '基本信息' },
          { key: 'records',       label: '健康档案' },
          { key: 'reports',       label: '体检报告' },
          { key: 'requisitions',  label: '检查开单' },
          { key: 'plans',         label: '管理方案' },
          { key: 'followups',     label: '随访记录' },
          { key: 'serviceRecords',label: '服务记录' },
          { key: 'family',        label: '家庭信息' },
          { key: 'membership',    label: '会员信息' },
          { key: 'billing',       label: '收费管理' },
        ].map(t => (
          <button
            key={t.key}
            className={`tab-btn ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Info Tab ── */}
      {tab === 'info' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* 基本资料 */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">基本资料</div>
            </div>
            <div className="card-body">
              <InfoRow label="姓名" value={user.name} />
              <InfoRow label="手机号" value={user.phone} />
              <InfoRow label="性别" value={user.gender} />
              <InfoRow label="年龄" value={age} />
              <InfoRow label="身高" value={user.height ? `${user.height} cm` : '-'} />
              <InfoRow label="体重" value={user.weight ? `${user.weight} kg` : '-'} />
              {bmi && <InfoRow label="BMI" value={bmi} />}
              <InfoRow label="身份证" value={user.idNumber || '-'} />
              <InfoRow label="婚姻状况" value={user.maritalStatus || '-'} />
              <InfoRow label="民族" value={user.ethnicity || '-'} />
              <InfoRow label="工作单位" value={user.workplace || '-'} />
              <InfoRow label="职业" value={user.occupation || '-'} />
            </div>
          </div>

          {/* 管理信息（可编辑） */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">管理信息</div>
              {!editing
                ? <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>编辑</button>
                : <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(false); setEditForm(buildEditForm(user)) }}>取消</button>
                    <button className="btn btn-primary btn-sm" onClick={handleSave}>保存</button>
                  </div>
              }
            </div>
            <div className="card-body">
              {editing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">联系电话</label>
                    <input className="form-input" value={editForm.contactPhone}
                      onChange={e => setEditForm(f => ({ ...f, contactPhone: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">紧急联系电话</label>
                    <input className="form-input" value={editForm.contactPhone2}
                      onChange={e => setEditForm(f => ({ ...f, contactPhone2: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">配送地址</label>
                    <input className="form-input" value={editForm.deliveryAddress}
                      onChange={e => setEditForm(f => ({ ...f, deliveryAddress: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">健管专员</label>
                    <select className="form-input" value={editForm.assignedHealthManager}
                      onChange={e => setEditForm(f => ({ ...f, assignedHealthManager: e.target.value }))}>
                      <option value="">-- 未分配 --</option>
                      {staffList.filter(s => s.role === 'healthManager').map(s => (
                        <option key={s._id} value={s._id}>{s.name}{s.title ? ` · ${s.title}` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">家庭医生</label>
                    <select className="form-input" value={editForm.assignedFamilyDoctor}
                      onChange={e => setEditForm(f => ({ ...f, assignedFamilyDoctor: e.target.value }))}>
                      <option value="">-- 未分配 --</option>
                      {staffList.filter(s => s.role === 'familyDoctor').map(s => (
                        <option key={s._id} value={s._id}>{s.name}{s.title ? ` · ${s.title}` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">营养师</label>
                    <select className="form-input" value={editForm.assignedNutritionist}
                      onChange={e => setEditForm(f => ({ ...f, assignedNutritionist: e.target.value }))}>
                      <option value="">-- 未分配 --</option>
                      {staffList.filter(s => s.role === 'nutritionist').map(s => (
                        <option key={s._id} value={s._id}>{s.name}{s.title ? ` · ${s.title}` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">服务包</label>
                    <input className="form-input" placeholder="如：年度服务包" value={editForm.servicePackage}
                      onChange={e => setEditForm(f => ({ ...f, servicePackage: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">服务开始时间</label>
                    <input className="form-input" type="date" value={editForm.serviceStartDate}
                      onChange={e => setEditForm(f => ({ ...f, serviceStartDate: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">服务到期时间</label>
                    <input className="form-input" type="date" value={editForm.serviceExpiry}
                      onChange={e => setEditForm(f => ({ ...f, serviceExpiry: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">会员类型</label>
                    <select className="form-input" value={editForm.patientType}
                      onChange={e => setEditForm(f => ({ ...f, patientType: e.target.value }))}>
                      <option value="">普通</option>
                      <option value="vip">VIP</option>
                      <option value="trial">试用</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">会员来源</label>
                    <input className="form-input" value={editForm.source}
                      onChange={e => setEditForm(f => ({ ...f, source: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">备注</label>
                    <textarea className="form-input" rows={3} value={editForm.remark}
                      onChange={e => setEditForm(f => ({ ...f, remark: e.target.value }))} />
                  </div>
                </div>
              ) : (
                <>
                  <InfoRow label="联系电话" value={user.contactPhone || '-'} />
                  <InfoRow label="紧急联系" value={user.contactPhone2 || '-'} />
                  <InfoRow label="配送地址" value={user.deliveryAddress || '-'} />
                  <InfoRow label="健管专员" value={user.assignedHealthManager?.name || '-'} />
                  <InfoRow label="家庭医生" value={user.assignedFamilyDoctor?.name || '-'} />
                  <InfoRow label="营养师" value={user.assignedNutritionist?.name || '-'} />
                  <InfoRow label="会员来源" value={user.source || '-'} />
                  <InfoRow label="服务包" value={user.servicePackage || '-'} />
                  <InfoRow label="服务开始" value={user.serviceStartDate || '-'} />
                  <InfoRow label="服务到期" value={user.serviceExpiry || '-'} />
                  <InfoRow label="健康评分" value={user.healthScore || '-'} />
                  {user.remark && (
                    <div style={{ marginTop: 8, padding: '8px 12px', background: '#f9f7f3', borderRadius: 8, fontSize: 13, color: '#4A6558' }}>
                      📝 {user.remark}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 健康档案 */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">健康档案</div>
              {!editingHealth
                ? <button className="btn btn-secondary btn-sm" onClick={() => setEditingHealth(true)}>编辑</button>
                : <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={handleSaveHealth}>保存</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setEditingHealth(false); setHealthForm(buildHealthForm(user)) }}>取消</button>
                  </div>
              }
            </div>
            <div className="card-body">
              {editingHealth ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 12, color: '#8AA89C' }}>血型 ABO</label>
                      <select className="form-control" value={healthForm.bloodTypeABO || ''} onChange={e => setHealthForm(p => ({ ...p, bloodTypeABO: e.target.value }))}>
                        <option value="">未知</option>
                        {['A','B','O','AB'].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 12, color: '#8AA89C' }}>RH 血型</label>
                      <select className="form-control" value={healthForm.bloodTypeRH || ''} onChange={e => setHealthForm(p => ({ ...p, bloodTypeRH: e.target.value }))}>
                        <option value="">未知</option>
                        <option value="阳性">阳性</option>
                        <option value="阴性">阴性</option>
                      </select>
                    </div>
                  </div>
                  {[
                    { key: 'drugAllergy', label: '药物过敏', nested: true },
                    { key: 'foodAllergy', label: '食物过敏', nested: true },
                    { key: 'pastHistory', label: '既往史', nested: true },
                    { key: 'medicHistory', label: '用药史', nested: true },
                    { key: 'surgeryHistory', label: '手术史', nested: true },
                    { key: 'traumaHistory', label: '外伤史', nested: false },
                    { key: 'transfusionHistory', label: '输血史', nested: false },
                    { key: 'infectiousHistory', label: '传染病史', nested: false },
                    { key: 'vaccinationHistory', label: '预防接种史', nested: false },
                  ].map(({ key, label, nested }) => (
                    <div key={key}>
                      <label style={{ fontSize: 12, color: '#8AA89C' }}>{label}</label>
                      <textarea className="form-control" rows={2} value={nested ? (healthForm.healthProfile?.[key] || '') : (healthForm[key] || '')}
                        onChange={e => {
                          if (nested) setHealthForm(p => ({ ...p, healthProfile: { ...p.healthProfile, [key]: e.target.value } }))
                          else setHealthForm(p => ({ ...p, [key]: e.target.value }))
                        }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <span style={{ fontSize: 13, color: '#8AA89C' }}>血型：</span>
                    <span style={{ fontSize: 13 }}>{[user.bloodTypeABO, user.bloodTypeRH].filter(Boolean).join(' ') || '-'}</span>
                  </div>
                  {[
                    { label: '药物过敏', val: user.healthProfile?.drugAllergy },
                    { label: '食物过敏', val: user.healthProfile?.foodAllergy },
                    { label: '既往史', val: user.healthProfile?.pastHistory },
                    { label: '用药史', val: user.healthProfile?.medicHistory },
                    { label: '手术史', val: user.healthProfile?.surgeryHistory },
                    { label: '外伤史', val: user.traumaHistory },
                    { label: '输血史', val: user.transfusionHistory },
                    { label: '传染病史', val: user.infectiousHistory },
                    { label: '预防接种史', val: user.vaccinationHistory },
                  ].map(({ label, val }) => val ? (
                    <div key={label} style={{ display: 'flex', gap: 8 }}>
                      <span style={{ fontSize: 12, color: '#8AA89C', minWidth: 70 }}>{label}：</span>
                      <span style={{ fontSize: 13, color: '#1A2B24' }}>{val}</span>
                    </div>
                  ) : null)}
                </div>
              )}
            </div>
          </div>

          {/* 生活方式 */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">生活方式</div>
              {!editingLifestyle
                ? <button className="btn btn-secondary btn-sm" onClick={() => setEditingLifestyle(true)}>编辑</button>
                : <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={handleSaveLifestyle}>保存</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setEditingLifestyle(false); setLifestyleForm(buildLifestyleForm(user)) }}>取消</button>
                  </div>
              }
            </div>
            <div className="card-body">
              {editingLifestyle ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {[
                    { key: 'diet', label: '饮食习惯' },
                    { key: 'exercise', label: '运动习惯' },
                    { key: 'sleep', label: '睡眠习惯' },
                    { key: 'water', label: '饮水习惯' },
                    { key: 'alcohol', label: '饮酒情况' },
                    { key: 'smoking', label: '吸烟情况' },
                    { key: 'bowel', label: '排便情况' },
                    { key: 'mood', label: '情绪状态' },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label style={{ fontSize: 12, color: '#8AA89C' }}>{label}</label>
                      <input className="form-control" value={lifestyleForm.lifestyle?.[key] || ''}
                        onChange={e => setLifestyleForm(p => ({ ...p, lifestyle: { ...p.lifestyle, [key]: e.target.value } }))}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 6 }}>
                  {[
                    { label: '饮食', val: user.lifestyle?.diet },
                    { label: '运动', val: user.lifestyle?.exercise },
                    { label: '睡眠', val: user.lifestyle?.sleep },
                    { label: '饮水', val: user.lifestyle?.water },
                    { label: '饮酒', val: user.lifestyle?.alcohol },
                    { label: '吸烟', val: user.lifestyle?.smoking },
                    { label: '排便', val: user.lifestyle?.bowel },
                    { label: '情绪', val: user.lifestyle?.mood },
                  ].map(({ label, val }) => (
                    <div key={label} style={{ display: 'flex', gap: 8 }}>
                      <span style={{ fontSize: 12, color: '#8AA89C', minWidth: 40 }}>{label}：</span>
                      <span style={{ fontSize: 13, color: '#1A2B24' }}>{val || '-'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 最近随访 */}
          <div className="card" style={{ gridColumn: 'span 2' }}>
            <div className="card-header">
              <div className="card-title">最近随访</div>
              <button className="btn btn-primary btn-sm" onClick={() => setShowFollowUpModal(true)}>＋ 新增随访</button>
            </div>
            <div className="card-body">
              {recentFollowUps?.length > 0 ? (
                recentFollowUps.map(f => (
                  <div key={f._id} style={{
                    padding: '12px 0', borderBottom: '1px solid #f0ece4',
                    display: 'flex', gap: 16, alignItems: 'flex-start'
                  }}>
                    <span style={{ color: STATUS_COLOR[f.status] || '#666', fontSize: 12, minWidth: 50 }}>
                      {STATUS_MAP[f.status]}
                    </span>
                    <span style={{ fontSize: 12, color: '#8AA89C', minWidth: 80 }}>
                      {new Date(f.date).toLocaleDateString('zh-CN')}
                    </span>
                    <span style={{ fontSize: 12, color: '#4A6558' }}>[{TYPE_MAP[f.type]}]</span>
                    <span style={{ fontSize: 13, color: '#1A2B24', flex: 1 }}>{f.content || '无内容'}</span>
                    <span style={{ fontSize: 12, color: '#8AA89C' }}>{f.staffId?.name}</span>
                  </div>
                ))
              ) : (
                <div style={{ color: '#aaa', textAlign: 'center', padding: '16px 0', fontSize: 14 }}>
                  暂无随访记录，<span style={{ color: '#1E6B50', cursor: 'pointer' }} onClick={() => setShowFollowUpModal(true)}>立即记录</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Records Tab ── */}
      {tab === 'records' && (
        <div className="card">
          <div className="card-header"><div className="card-title">健康档案（最近10条）</div></div>
          {recentRecords?.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>类型</th>
                  <th>数值</th>
                  <th>记录时间</th>
                </tr>
              </thead>
              <tbody>
                {recentRecords.map(r => (
                  <tr key={r._id}>
                    <td><span className="badge badge-info">{RECORD_TYPE_LABEL[r.type] || r.type}</span></td>
                    <td>{formatRecordValue(r)}</td>
                    <td style={{ color: '#8AA89C', fontSize: 13 }}>
                      {new Date(r.recordedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无健康记录</div>
          )}
        </div>
      )}

      {/* ── Plans Tab ── */}
      {tab === 'plans' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">管理方案</div>
          </div>
          {plans.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无管理方案</div>
          ) : (
            <table className="table">
              <thead><tr><th>方案名称</th><th>类型</th><th>状态</th><th>已阅</th><th>项目数</th><th>完成</th><th>负责人</th><th>创建时间</th></tr></thead>
              <tbody>
                {plans.map(p => {
                  const done = p.items?.filter(i => i.status === 'completed').length || 0
                  const total = p.items?.length || 0
                  return (
                    <tr key={p._id} style={{ cursor: 'pointer' }} onClick={() => nav(`/plans/${p._id}`)}>
                      <td style={{ fontWeight: 500, color: '#1E6B50' }}>{p.title}</td>
                      <td><span className="badge badge-info">{PLAN_TYPE_LABEL[p.type] || p.type}</span></td>
                      <td><span style={{ color: PLAN_STATUS_COLOR[p.status], fontWeight: 500, fontSize: 13 }}>{PLAN_STATUS_LABEL[p.status]}</span></td>
                      <td>
                        {p.viewedAt
                          ? <span style={{ fontSize: 12, color: '#22A06B', fontWeight: 500 }}>✓ 已阅<br/><span style={{ color: '#aaa', fontWeight: 400 }}>{new Date(p.viewedAt).toLocaleDateString('zh-CN')}</span></span>
                          : <span style={{ fontSize: 12, color: '#D97706' }}>未查阅</span>
                        }
                      </td>
                      <td style={{ textAlign: 'center' }}>{total}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 60, height: 6, background: '#f0f0f0', borderRadius: 3 }}>
                            <div style={{ width: total ? `${(done/total)*100}%` : '0%', height: '100%', background: '#22A06B', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 12, color: '#666' }}>{done}/{total}</span>
                        </div>
                      </td>
                      <td style={{ fontSize: 13, color: '#666' }}>{p.staffId?.name || '-'}</td>
                      <td style={{ fontSize: 12, color: '#aaa' }}>{new Date(p.createdAt).toLocaleDateString('zh-CN')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Follow-ups Tab ── */}
      {tab === 'followups' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">随访记录</div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowFollowUpModal(true)}>＋ 新增随访</button>
          </div>
          {followUps.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>
              暂无随访记录，<span style={{ color: '#1E6B50', cursor: 'pointer' }} onClick={() => setShowFollowUpModal(true)}>立即记录</span>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr><th>日期</th><th>方式</th><th>状态</th><th>随访人</th><th>随访内容</th><th>下次随访</th></tr>
              </thead>
              <tbody>
                {followUps.map(f => (
                  <tr key={f._id}>
                    <td style={{ fontSize: 13, color: '#666' }}>{new Date(f.date).toLocaleDateString('zh-CN')}</td>
                    <td><span className="badge badge-info">{TYPE_MAP[f.type] || f.type}</span></td>
                    <td>
                      <span style={{ fontSize: 13, fontWeight: 500, color: STATUS_COLOR[f.status] || '#666' }}>
                        {STATUS_MAP[f.status] || f.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, color: '#666' }}>{f.staffId?.name || '-'}</td>
                    <td style={{ fontSize: 13, color: '#1A2B24', maxWidth: 240 }}>
                      {f.content ? (f.content.length > 80 ? f.content.slice(0, 80) + '…' : f.content) : '-'}
                    </td>
                    <td style={{ fontSize: 12, color: '#8AA89C' }}>
                      {f.nextFollowUpDate ? new Date(f.nextFollowUpDate).toLocaleDateString('zh-CN') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Reports Tab ── */}
      {tab === 'reports' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">体检报告</div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowUploadReport(true)}>＋ 上传报告</button>
          </div>
          {reports.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无体检报告</div>
          ) : (
            <table className="table">
              <thead><tr><th>报告标题</th><th>类型</th><th>医院</th><th>日期</th><th>审核状态</th><th>上传人</th></tr></thead>
              <tbody>
                {reports.map(r => (
                  <tr key={r._id} style={{ cursor: 'pointer' }} onClick={() => setShowReportDetail(r)}>
                    <td style={{ fontWeight: 500, color: '#1E6B50' }}>{r.title}</td>
                    <td><span className="badge badge-info">{r.type}</span></td>
                    <td style={{ fontSize: 13, color: '#666' }}>{r.hospital || '-'}</td>
                    <td style={{ fontSize: 13, color: '#666' }}>{r.date || '-'}</td>
                    <td>
                      <span style={{ fontSize: 13, fontWeight: 500, color: r.audit_status === 'audited' ? '#22A06B' : r.audit_status === 'rejected' ? '#DC3545' : '#D97706' }}>
                        {r.audit_status === 'audited' ? '已审核' : r.audit_status === 'rejected' ? '已驳回' : '待审核'}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, color: '#666' }}>{r.uploadedBy?.name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Service Records Tab ── */}
      {tab === 'serviceRecords' && (() => {
        const CATS = ['营养干预', '专病管理', '医院就医', '日常随访']
        const grouped = {}
        CATS.forEach(c => { grouped[c] = [] })
        serviceRecords.forEach(r => {
          const cat = SR_CATEGORY[r.type] || '日常随访'
          grouped[cat].push(r)
        })
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {CATS.map(cat => (
              <div className="card" key={cat}>
                <div className="card-header">
                  <div className="card-title" style={{ color: SR_CATEGORY_COLOR[cat] }}>{cat}</div>
                  <span style={{ fontSize: 13, color: '#aaa' }}>{grouped[cat].length} 条</span>
                </div>
                {grouped[cat].length === 0 ? (
                  <div style={{ padding: '16px 20px', color: '#aaa', fontSize: 13 }}>暂无{cat}记录</div>
                ) : (
                  <table className="table">
                    <thead><tr><th>类型</th><th>标题</th><th>内容摘要</th><th>负责人</th><th>日期</th></tr></thead>
                    <tbody>
                      {grouped[cat].map(r => (
                        <tr key={r._id} style={{ cursor: 'pointer' }} onClick={() => setShowSRDetail(r)}>
                          <td><span className="badge badge-success" style={{ background: SR_CATEGORY_COLOR[cat] + '20', color: SR_CATEGORY_COLOR[cat] }}>{SR_TYPE_LABEL[r.type] || r.type}</span></td>
                          <td style={{ fontWeight: 500, color: '#1E6B50' }}>{r.title || '-'}</td>
                          <td style={{ fontSize: 13, color: '#666', maxWidth: 200 }}>{r.content ? (r.content.length > 60 ? r.content.slice(0, 60) + '...' : r.content) : '-'}</td>
                          <td style={{ fontSize: 13, color: '#666' }}>{r.staffId?.name || '-'}</td>
                          <td style={{ fontSize: 12, color: '#aaa' }}>{new Date(r.date).toLocaleDateString('zh-CN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        )
      })()}

      {/* ── Requisitions Tab ── */}
      {tab === 'requisitions' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="card-title">检查开单</div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowReqModal(true)}>＋ 新建开单</button>
          </div>
          {requisitions.length === 0 ? (
            <div style={{ padding: '40px 16px', textAlign: 'center', color: '#aaa' }}>暂无开单记录</div>
          ) : (
            <div style={{ padding: '0 16px 16px' }}>
              {requisitions.map(r => {
                const statusMap = { open: { label: '待上传', color: '#D97706' }, partial: { label: '部分上传', color: '#0077B6' }, completed: { label: '已完成', color: '#22A06B' }, cancelled: { label: '已取消', color: '#aaa' } }
                const sm = statusMap[r.status] || { label: r.status, color: '#aaa' }
                return (
                  <div key={r._id} style={{ marginBottom: 16, border: '1px solid #E0D9CE', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ background: '#f5f0e8', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{r.title || '检查开单'}</span>
                        <span style={{ fontSize: 12, marginLeft: 10, color: '#8AA89C' }}>
                          {new Date(r.createdAt).toLocaleDateString('zh-CN')} · {r.staffId?.name || '-'}开单
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, color: sm.color, fontWeight: 600 }}>{sm.label}</span>
                        {r.status === 'open' && (
                          <button className="btn btn-secondary btn-sm" onClick={async () => {
                            if (!window.confirm('确定取消此开单？')) return
                            try { await staffAPI.cancelRequisition(r._id); toast('已取消'); loadRequisitions() }
                            catch (e) { toast(e.message) }
                          }}>取消</button>
                        )}
                      </div>
                    </div>
                    <div style={{ padding: '10px 14px' }}>
                      {r.notes && <div style={{ fontSize: 13, color: '#4A6558', marginBottom: 8 }}>备注：{r.notes}</div>}
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: '#f8fafc' }}>
                            {['检查项目', '类型', '注意事项', '状态'].map(h => (
                              <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 12, fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(r.items || []).map((item, idx) => {
                            const iStatusMap = { pending: '待上传', uploaded: '已上传', reviewed: '已审核' }
                            const iStatusColor = { pending: '#D97706', uploaded: '#0077B6', reviewed: '#22A06B' }
                            return (
                              <tr key={idx} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                <td style={{ padding: '6px 10px', fontWeight: 500 }}>{item.itemName}</td>
                                <td style={{ padding: '6px 10px', color: '#8AA89C', fontSize: 12 }}>{item.itemType === 'labTestOrder' ? '检验医嘱' : '检查医嘱'}</td>
                                <td style={{ padding: '6px 10px', color: '#4A6558' }}>{item.notes || '-'}</td>
                                <td style={{ padding: '6px 10px', color: iStatusColor[item.status], fontWeight: 500 }}>{iStatusMap[item.status] || item.status}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Family Tab ── */}
      {tab === 'family' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="card">
            <div className="card-header"><div className="card-title">家庭联系人</div></div>
            <div className="card-body">
              <InfoRow label="联系人" value={user.contactName || '-'} />
              <InfoRow label="联系电话" value={user.contactPhone3 || user.contactPhone2 || '-'} />
              <InfoRow label="家庭医生" value={user.assignedFamilyDoctor?.name || '-'} />
              <InfoRow label="家庭医生职称" value={user.assignedFamilyDoctor?.title || '-'} />
            </div>
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title">家族疾病史</div></div>
            <div className="card-body">
              {user.healthProfile?.familyHistory?.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {user.healthProfile.familyHistory.map((h, i) => (
                    <div key={i} style={{ padding: '8px 12px', background: '#f9f7f3', borderRadius: 8, fontSize: 13 }}>
                      <span style={{ fontWeight: 500 }}>{h.disease || h}</span>
                      {h.relative && <span style={{ color: '#8AA89C', marginLeft: 8 }}>{h.relative}</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#aaa', fontSize: 13, padding: '8px 0' }}>暂无家族疾病史记录</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Membership Tab ── */}
      {tab === 'membership' && (
        <MembershipPanel user={user} patientId={id} onRefresh={load} />
      )}

      {/* ── Billing Tab ── */}
      {tab === 'billing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-header"><div className="card-title">账户概览</div></div>
            <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                { label: '健康基金余额', value: `¥${(user.healthFundBalance || 0).toFixed(2)}`, color: '#1E6B50' },
                { label: '服务包', value: user.servicePackage || '未购买', color: '#0077B6' },
                { label: '服务到期', value: user.serviceExpiry ? new Date(user.serviceExpiry).toLocaleDateString('zh-CN') : '-', color: '#D97706' },
              ].map(item => (
                <div key={item.label} style={{ padding: 16, background: '#f9f7f3', borderRadius: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: '#8AA89C', marginBottom: 6 }}>{item.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title">收费记录</div></div>
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#aaa' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🧾</div>
              <div style={{ fontSize: 14, marginBottom: 8 }}>营养素、检测及各类服务收费记录</div>
              <div style={{ fontSize: 13 }}>详细收费模块正在开发中，请在会员营销-次卡套餐处管理</div>
            </div>
          </div>
        </div>
      )}

      {/* 随访记录弹窗 */}
      {showFollowUpModal && (
        <FollowUpModal
          patientId={id}
          patientName={user.name}
          onClose={() => setShowFollowUpModal(false)}
          onSaved={handleFollowUpCreated}
        />
      )}

      {/* 体检报告详情弹窗 */}
      {showReportDetail && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowReportDetail(null) }}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3 className="modal-title">{showReportDetail.title}</h3>
              <button className="modal-close" onClick={() => setShowReportDetail(null)}>✕</button>
            </div>
            <div className="modal-body">
              {[
                ['类型', showReportDetail.type],
                ['医院', showReportDetail.hospital || '-'],
                ['报告日期', showReportDetail.date || '-'],
                ['审核状态', showReportDetail.audit_status === 'audited' ? '已审核' : showReportDetail.audit_status === 'rejected' ? '已驳回' : '待审核'],
                ['审核人', showReportDetail.audited_by || '-'],
                ['驳回原因', showReportDetail.reject_reason || '-'],
                ['上传人', showReportDetail.uploadedBy?.name || '-'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', padding: '8px 0', borderBottom: '1px solid #f5f2ec' }}>
                  <span style={{ width: 80, color: '#8AA89C', fontSize: 13 }}>{k}</span>
                  <span style={{ flex: 1, fontSize: 13 }}>{v}</span>
                </div>
              ))}
              {showReportDetail.note && (
                <div style={{ marginTop: 12, padding: 12, background: '#f9f7f3', borderRadius: 8, fontSize: 13 }}>{showReportDetail.note}</div>
              )}
              {(showReportDetail.content || showReportDetail.fileUrl) && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 13, color: '#8AA89C', marginBottom: 8 }}>报告文件</div>
                  {showReportDetail.mimeType?.startsWith('image/') || showReportDetail.content?.startsWith('data:image') ? (
                    <img src={showReportDetail.content || showReportDetail.fileUrl} alt="报告" style={{ maxWidth: '100%', borderRadius: 8 }} />
                  ) : (
                    <a href={showReportDetail.content || showReportDetail.fileUrl} target="_blank" rel="noreferrer"
                      className="btn btn-secondary btn-sm">📎 查看文件</a>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
              {/* 审核操作区：仅当报告待审核时展示 */}
              {showReportDetail.audit_status !== 'audited' && showReportDetail.audit_status !== 'rejected' && (
                <>
                  {showRejectInput ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <textarea
                        className="form-input"
                        rows={2}
                        placeholder="请填写驳回原因"
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        style={{ fontSize: 13 }}
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-danger btn-sm" style={{ flex: 1 }}
                          disabled={auditLoading || !rejectReason.trim()}
                          onClick={() => handleAudit('reject')}>
                          确认驳回
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => { setShowRejectInput(false); setRejectReason('') }}>取消</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary btn-sm" style={{ flex: 1 }}
                        disabled={auditLoading}
                        onClick={() => handleAudit('approve')}>
                        ✓ 审核通过
                      </button>
                      <button className="btn btn-secondary btn-sm" style={{ flex: 1 }}
                        onClick={() => setShowRejectInput(true)}>
                        ✕ 驳回
                      </button>
                    </div>
                  )}
                </>
              )}
              <button className="btn btn-secondary" onClick={() => { setShowReportDetail(null); setShowRejectInput(false); setRejectReason('') }}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* 服务记录详情弹窗 */}
      {showSRDetail && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowSRDetail(null) }}>
          <div className="modal" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3 className="modal-title">{showSRDetail.title || '服务记录详情'}</h3>
              <button className="modal-close" onClick={() => setShowSRDetail(null)}>✕</button>
            </div>
            <div className="modal-body">
              {[
                ['服务类型', SR_TYPE_LABEL[showSRDetail.type] || showSRDetail.type],
                ['负责人', showSRDetail.staffId?.name || '-'],
                ['服务日期', showSRDetail.date ? new Date(showSRDetail.date).toLocaleDateString('zh-CN') : '-'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', padding: '8px 0', borderBottom: '1px solid #f5f2ec' }}>
                  <span style={{ width: 80, color: '#8AA89C', fontSize: 13 }}>{k}</span>
                  <span style={{ flex: 1, fontSize: 13 }}>{v}</span>
                </div>
              ))}
              {showSRDetail.content && (
                <div style={{ marginTop: 12, padding: 12, background: '#f9f7f3', borderRadius: 8, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {showSRDetail.content}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowSRDetail(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* 转介弹窗 */}
      {showReferralModal && (
        <ReferralModal
          patientId={id}
          patientName={user.name}
          staffList={staffList}
          onClose={() => setShowReferralModal(false)}
          onSaved={() => { setShowReferralModal(false); toast('转介已发送') }}
        />
      )}

      {/* 发消息弹窗 */}
      {showMessageModal && (
        <SendMessageModal
          patientId={id}
          patientName={user.name}
          onClose={() => setShowMessageModal(false)}
          onSaved={() => { setShowMessageModal(false); toast('消息已发送，会员将在消息中心收到') }}
        />
      )}

      {/* 上传体检报告弹窗 */}
      {showUploadReport && (
        <UploadReportModal
          patientId={id}
          onClose={() => setShowUploadReport(false)}
          onSaved={() => { setShowUploadReport(false); toast('报告已上传'); loadReports() }}
        />
      )}

      {/* 新建开单弹窗 */}
      {showReqModal && (
        <RequisitionModal
          patientId={id}
          onClose={() => setShowReqModal(false)}
          onSaved={() => { setShowReqModal(false); toast('开单已创建，会员端将显示待上传提示'); loadRequisitions() }}
        />
      )}
    </div>
  )
}

function MembershipPanel({ user, patientId, onRefresh }) {
  const toast = useToast()
  const [cardNumber, setCardNumber] = useState(user.cardNumber || '')
  const [pointsDelta, setPointsDelta] = useState('')
  const [rechargeDelta, setRechargeDelta] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const payload = { cardNumber }
      if (pointsDelta) payload.pointsDelta = parseInt(pointsDelta)
      if (rechargeDelta) payload.rechargeDelta = parseFloat(rechargeDelta)
      await staffAPI.updatePatientMembership(patientId, payload)
      toast('已更新')
      setPointsDelta(''); setRechargeDelta('')
      onRefresh()
    } catch (err) { toast(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      {/* 会员基本信息 */}
      <div className="card">
        <div className="card-header"><div className="card-title">会员基本信息</div></div>
        <div className="card-body">
          <InfoRow label="手机号" value={user.phone} />
          <InfoRow label="会员类型" value={user.memberType || (user.patientType === 'vip' ? 'VIP会员' : user.patientType === 'trial' ? '试用会员' : '普通会员')} />
          <InfoRow label="服务包" value={user.servicePackage || '-'} />
          <InfoRow label="服务开始" value={user.serviceStartDate ? new Date(user.serviceStartDate).toLocaleDateString('zh-CN') : '-'} />
          <InfoRow label="服务到期" value={user.serviceExpiry ? new Date(user.serviceExpiry).toLocaleDateString('zh-CN') : '-'} />
          <InfoRow label="会员来源" value={user.source || '-'} />
        </div>
      </div>

      {/* 会员卡 & 积分管理 */}
      <div className="card">
        <div className="card-header"><div className="card-title">卡号 & 积分 & 余额</div></div>
        <div className="card-body">
          {/* 当前状态 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            {[
              { label: '健康基金', value: `¥${(user.healthFundBalance || 0).toFixed(2)}`, color: '#1E6B50' },
              { label: '充值余额', value: `¥${(user.rechargeBalance || 0).toFixed(2)}`, color: '#0077B6' },
              { label: '积分', value: (user.points || 0).toString(), color: '#D97706' },
            ].map(s => (
              <div key={s.label} style={{ background: '#f9f7f3', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* 编辑区 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label className="form-label" style={{ fontSize: 12 }}>会员卡号</label>
              <input className="form-input" value={cardNumber} onChange={e => setCardNumber(e.target.value)} placeholder="如：JY-2025-001" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label className="form-label" style={{ fontSize: 12 }}>积分变动（+/-）</label>
                <input className="form-input" type="number" value={pointsDelta} onChange={e => setPointsDelta(e.target.value)} placeholder="如：100 或 -50" />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: 12 }}>充值余额变动（元）</label>
                <input className="form-input" type="number" value={rechargeDelta} onChange={e => setRechargeDelta(e.target.value)} placeholder="如：500 或 -100" />
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>{saving ? '保存中...' : '保存更新'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f5f2ec', fontSize: 14 }}>
      <span style={{ color: '#8AA89C' }}>{label}</span>
      <span style={{ color: '#1A2B24', fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>{value}</span>
    </div>
  )
}

const RECORD_TYPE_LABEL = {
  bloodPressure: '血压', bloodSugar: '血糖', heartRate: '心率',
  weight: '体重', sleep: '睡眠', mood: '情绪',
}

function formatRecordValue(r) {
  if (r.type === 'bloodPressure' && r.extra) {
    return `${r.extra.sys}/${r.extra.dia} mmHg`
  }
  if (r.type === 'bloodSugar') return `${r.value} mmol/L`
  if (r.type === 'heartRate') return `${r.value} 次/分`
  if (r.type === 'weight') return `${r.value} kg`
  if (r.type === 'sleep') return `${r.value} h`
  if (r.type === 'mood') return `${r.value} / 10`
  return r.value ?? '-'
}

// ── 发消息弹窗 ──────────────────────────────────────────────
function SendMessageModal({ patientId, patientName, onClose, onSaved }) {
  const toast = useToast()
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!content.trim()) { setError('请输入消息内容'); return }
    try {
      setSaving(true); setError('')
      await staffAPI.sendMessageToPatient(patientId, { content: content.trim() })
      onSaved()
    } catch (err) {
      setError(err.message || '发送失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <h3 className="modal-title">发消息给 {patientName}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">消息内容</label>
            <textarea
              className="form-input" rows={5}
              placeholder="输入要发给会员的消息，将显示在会员端消息中心…"
              value={content}
              onChange={e => { setContent(e.target.value); setError('') }}
              style={{ resize: 'vertical' }}
            />
            <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 4, textAlign: 'right' }}>
              {content.length}/500
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving || !content.trim()}>
            {saving ? '发送中...' : '发送'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 上传体检报告弹窗 ───────────────────────────────────────
const REPORT_TYPE_OPTIONS = [
  '血常规', '尿常规', '生化全套', '血脂', '血糖', '肝功能', '肾功能',
  '心电图', '胸片', '腹部B超', '甲状腺B超', 'CT', 'MRI',
  '功能医学检测', '基因检测', '其他',
]

function UploadReportModal({ patientId, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState({ title: '', type: '', hospital: '', date: '', note: '' })
  const [fileData, setFileData] = useState(null) // { content, mimeType, fileSize, name }
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { setError('文件不能超过 10MB'); return }
    const reader = new FileReader()
    reader.onload = (ev) => {
      setFileData({ content: ev.target.result, mimeType: file.type, fileSize: file.size, name: file.name })
      if (!form.title) setForm(f => ({ ...f, title: file.name.replace(/\.[^.]+$/, '') }))
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async () => {
    if (!form.title) { setError('请填写报告标题'); return }
    try {
      setSaving(true); setError('')
      await staffAPI.uploadReport({
        patientId,
        title: form.title,
        type: form.type || '其他',
        hospital: form.hospital,
        date: form.date,
        note: form.note,
        content: fileData?.content,
        mimeType: fileData?.mimeType,
        fileSize: fileData?.fileSize,
      })
      onSaved()
    } catch (err) {
      setError(err.message || '上传失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h3 className="modal-title">上传体检报告</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">报告标题 *</label>
            <input className="form-input" value={form.title} onChange={set('title')} placeholder="如：2024年年度体检报告" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">报告类型</label>
            <select className="form-input" value={form.type} onChange={set('type')}>
              <option value="">-- 请选择 --</option>
              {REPORT_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
              <label className="form-label">医院 / 机构</label>
              <input className="form-input" value={form.hospital} onChange={set('hospital')} placeholder="如：协和医院" />
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
              <label className="form-label">报告日期</label>
              <input className="form-input" type="date" value={form.date} onChange={set('date')} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">报告文件（图片/PDF，≤10MB）</label>
            <input type="file" accept="image/*,.pdf" onChange={handleFile}
              style={{ fontSize: 13, padding: '6px 0' }} />
            {fileData && <div style={{ fontSize: 12, color: '#22A06B', marginTop: 4 }}>✓ {fileData.name}</div>}
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">备注</label>
            <textarea className="form-input" rows={2} value={form.note} onChange={set('note')} placeholder="补充说明（可选）" />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? '上传中...' : '确认上传'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 赠送权益弹窗（供 MarketingPage 导出使用）───────────────────────
const SERVICE_OPTIONS = ['就医协助服务', '居家监测套餐', '专家咨询', '陪诊服务', '上门采血', '营养咨询', '其他服务']

export function GiftModal({ patientId, patientName, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState({ giftType: 'service', serviceName: '', serviceCount: 1, fundAmount: 0, fundType: 'enterprise', validFrom: '', validTo: '', remark: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async () => {
    if (form.giftType === 'service' && !form.serviceName) { setError('请选择赠送服务'); return }
    if (form.giftType === 'fund' && (!form.fundAmount || Number(form.fundAmount) <= 0)) { setError('请输入有效金额'); return }
    setSaving(true); setError('')
    try {
      await staffAPI.giftToPatient(patientId, { ...form, serviceCount: Number(form.serviceCount), fundAmount: Number(form.fundAmount) })
      onSaved()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <h3 className="modal-title">赠送权益 — {patientName}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {error && <div className="login-err" style={{ margin: '0 20px 8px' }}>⚠️ {error}</div>}
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">赠送类型</label>
            <div style={{ display: 'flex', gap: 12 }}>
              {[['service', '🎁 赠送服务'], ['fund', '💰 健康基金']].map(([v, l]) => (
                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: form.giftType === v ? 700 : 400, color: form.giftType === v ? '#1E6B50' : '#666' }}>
                  <input type="radio" value={v} checked={form.giftType === v} onChange={set('giftType')} /> {l}
                </label>
              ))}
            </div>
          </div>

          {form.giftType === 'service' ? (
            <>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">服务类型 *</label>
                <select className="form-input" value={form.serviceName} onChange={set('serviceName')}>
                  <option value="">-- 请选择 --</option>
                  {SERVICE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">赠送次数</label>
                <input className="form-input" type="number" min={1} max={99} value={form.serviceCount} onChange={set('serviceCount')} />
              </div>
            </>
          ) : (
            <>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">金额（元）*</label>
                <input className="form-input" type="number" min={1} placeholder="如：500" value={form.fundAmount || ''} onChange={set('fundAmount')} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">基金类型</label>
                <select className="form-input" value={form.fundType} onChange={set('fundType')}>
                  <option value="enterprise">企业派送</option>
                  <option value="promotion">促销赠送</option>
                  <option value="other">其他</option>
                </select>
              </div>
            </>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">有效期开始</label>
              <input className="form-input" type="date" value={form.validFrom} onChange={set('validFrom')} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">有效期结束</label>
              <input className="form-input" type="date" value={form.validTo} onChange={set('validTo')} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">备注</label>
            <input className="form-input" placeholder="赠送原因或说明..." value={form.remark} onChange={set('remark')} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving ? '赠送中...' : '确认赠送'}</button>
        </div>
      </div>
    </div>
  )
}

// ── 转介弹窗 ───────────────────────────────────────────────
const ROLE_LABEL_MAP = {
  familyDoctor:'家庭医生', nutritionist:'营养师', healthManager:'健管专员',
  medicalAssistant:'就医专员', psychologist:'心理咨询师', rehabSpecialist:'运动复健师',
  tcmDoctor:'中医师', specialist:'专科医师', healthPlanner:'健康规划师', superadmin:'超级管理员',
}

function ReferralModal({ patientId, patientName, staffList, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState({ toStaffId: '', reason: '', content: '', urgency: 'normal' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const REASON_PRESETS = ['需要就医协助', '营养干预评估', '心理咨询介入', '运动康复指导', '中医体质评估', '专科会诊', '健康方案制定', '体检报告解读']

  const handleSubmit = async () => {
    if (!form.toStaffId || !form.reason) { setError('接收人和转介原因不能为空'); return }
    setSaving(true); setError('')
    try {
      await staffAPI.createReferral({ patientId, ...form })
      onSaved()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <h3 className="modal-title">🔀 转介 — {patientName}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {error && <div className="login-err" style={{ margin: '0 20px 8px' }}>⚠️ {error}</div>}
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">接收人 *</label>
            <select className="form-input" value={form.toStaffId} onChange={set('toStaffId')}>
              <option value="">-- 请选择接收医护人员 --</option>
              {staffList.map(s => (
                <option key={s._id} value={s._id}>
                  {s.name} · {ROLE_LABEL_MAP[s.role] || s.role}{s.title ? ` (${s.title})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">转介原因 *</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {REASON_PRESETS.map(r => (
                <button key={r} type="button" className="btn btn-secondary btn-sm"
                  style={{ fontSize: 12, padding: '3px 10px', background: form.reason === r ? '#E8F5EF' : '', border: form.reason === r ? '1px solid #1E6B50' : '' }}
                  onClick={() => setForm(f => ({ ...f, reason: r }))}>{r}</button>
              ))}
            </div>
            <input className="form-input" placeholder="或手动输入原因..." value={form.reason} onChange={set('reason')} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">详细说明</label>
            <textarea className="form-input" rows={3} placeholder="病情描述、需要协助的具体内容..." value={form.content} onChange={set('content')} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">紧急程度</label>
            <div style={{ display: 'flex', gap: 16 }}>
              {[['normal', '普通'], ['urgent', '🚨 紧急']].map(([v, l]) => (
                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: form.urgency === v && v === 'urgent' ? '#DC3545' : form.urgency === v ? '#1E6B50' : '#666', fontWeight: form.urgency === v ? 700 : 400 }}>
                  <input type="radio" value={v} checked={form.urgency === v} onChange={set('urgency')} /> {l}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving ? '发送中...' : '发送转介'}</button>
        </div>
      </div>
    </div>
  )
}
