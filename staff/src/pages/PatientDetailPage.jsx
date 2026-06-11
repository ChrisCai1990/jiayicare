import React, { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { staffAPI, API_ORIGIN } from '../api'
import { useToast, useStaff } from '../App'
import FollowUpModal from '../components/FollowUpModal'

// ── 生活方式表单子组件（定义在组件外，引用稳定，避免每次渲染重新挂载）─────
const LS_LABEL_STYLE = { fontSize: 12, color: '#8AA89C', marginBottom: 4, display: 'block' }

function LsRadio({ label, value, editing, options, onChange }) {
  return (
    <div>
      {label && <span style={LS_LABEL_STYLE}>{label}</span>}
      {editing ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px' }}>
          {options.map(o => (
            <label key={o} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="radio" checked={value === o} onChange={() => onChange(o)} />
              {o}
            </label>
          ))}
        </div>
      ) : (
        <span style={{ fontSize: 13, color: '#1A2B24' }}>{value || '-'}</span>
      )}
    </div>
  )
}

function LsCheckbox({ label, value = [], editing, options, onChange }) {
  return (
    <div>
      {label && <span style={LS_LABEL_STYLE}>{label}</span>}
      {editing ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px' }}>
          {options.map(o => (
            <label key={o} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="checkbox" checked={value.includes(o)}
                onChange={e => onChange(e.target.checked ? [...value, o] : value.filter(x => x !== o))} />
              {o}
            </label>
          ))}
        </div>
      ) : (
        <span style={{ fontSize: 13, color: '#1A2B24' }}>{value.length ? value.join('、') : '-'}</span>
      )}
    </div>
  )
}

// 稳定的体检指标输入组件（定义在组件外避免焦点丢失）
function LabField({ label, unit, value, onChange, placeholder, type }) {
  return (
    <div>
      <span style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 3 }}>{label}{unit ? ` (${unit})` : ''}</span>
      <input className="form-control" type={type || 'text'} value={value} placeholder={placeholder || ''} onChange={onChange} style={{ fontSize: 13 }} />
    </div>
  )
}
function LabTextarea({ label, unit, value, onChange, placeholder }) {
  return (
    <div>
      <span style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 3 }}>{label}{unit ? ` (${unit})` : ''}</span>
      <textarea className="form-control" rows={2} value={value} placeholder={placeholder || ''} onChange={onChange} style={{ fontSize: 13 }} />
    </div>
  )
}

function LsText({ label, value = '', editing, placeholder, multiline, onChange }) {
  return (
    <div>
      {label && <span style={LS_LABEL_STYLE}>{label}</span>}
      {editing ? (
        multiline
          ? <textarea className="form-control" rows={3} value={value} placeholder={placeholder || ''}
              onChange={e => onChange(e.target.value)} style={{ resize: 'vertical' }} />
          : <input className="form-control" value={value} placeholder={placeholder || ''}
              onChange={e => onChange(e.target.value)} />
      ) : (
        <span style={{ fontSize: 13, color: value ? '#1A2B24' : '#ccc' }}>{value || '-'}</span>
      )}
    </div>
  )
}

// ── 简易 SVG 折线趋势图 ───────────────────────────────────────────
function MiniTrendChart({ data, color = '#1E6B50', label }) {
  if (!data || data.length < 2) return null;
  const W = 260, H = 80, PAD = 8;
  const vals = data.map(d => d.y);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const xs = data.map((_, i) => PAD + (i / (data.length - 1)) * (W - PAD * 2));
  const ys = vals.map(v => H - PAD - ((v - min) / range) * (H - PAD * 2));
  const pts = xs.map((x, i) => `${x},${ys[i]}`).join(' ');
  const last = data[data.length - 1];
  return (
    <div style={{ display: 'inline-block', marginRight: 16, marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 4, fontWeight: 600 }}>{label}</div>
      <svg width={W} height={H} style={{ border: '1px solid #f0ece4', borderRadius: 8, background: '#faf9f6' }}>
        <polyline fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" points={pts} />
        {xs.map((x, i) => <circle key={i} cx={x} cy={ys[i]} r="3" fill={color} />)}
        <text x={xs[xs.length-1]} y={ys[ys.length-1] - 6} textAnchor="middle" fontSize="10" fill={color}>{last.y}</text>
        <text x={PAD} y={H - 2} fontSize="9" fill="#aaa">{data[0].x}</text>
        <text x={W - PAD} y={H - 2} textAnchor="end" fontSize="9" fill="#aaa">{last.x}</text>
      </svg>
    </div>
  );
}

const TYPE_MAP = { phone: '电话', wechat: '微信', visit: '上门', video: '视频', other: '其他' }
const SERVICE_PACKAGE_LABELS = {
  health_prevention: '健康预防计划', chronic_stable: '慢病维稳计划',
  young_state: '健康年轻态计划', health_reshape: '健康重塑计划',
  pkg_1y: '年度服务包', pkg_6m: '半年服务包', pkg_3m: '季度服务包',
}
const getServicePackageLabel = (pkg) => SERVICE_PACKAGE_LABELS[pkg] || pkg || '-'
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
  const [tab, setTab] = useState('info')  // info | records | reports | medications | requisitions | plans | followups | serviceRecords | consumption | family | membership
  const [followUps, setFollowUps] = useState([])
  const [plans, setPlans] = useState([])
  const [reports, setReports] = useState([])
  const [serviceRecords, setServiceRecords] = useState([])
  const [patientOrders, setPatientOrders] = useState([])
  const [requisitions, setRequisitions] = useState([])
  const [showReqModal, setShowReqModal] = useState(false)
  const [showReferralModal, setShowReferralModal] = useState(false)
  const [showReportDetail, setShowReportDetail] = useState(null)
  const [showSRDetail, setShowSRDetail] = useState(null)
  const [staffList, setStaffList] = useState([])
  const [showFollowUpModal, setShowFollowUpModal] = useState(false)
  const [followUpDetail, setFollowUpDetail] = useState(null)
  const [showUploadReport, setShowUploadReport] = useState(false)
  const [showMessageModal, setShowMessageModal] = useState(false)
  const [auditLoading, setAuditLoading] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [editingBasicInfo, setEditingBasicInfo] = useState(false)
  const [basicInfoForm, setBasicInfoForm] = useState({})
  const [editingHealthNeeds, setEditingHealthNeeds] = useState(false)
  const [healthNeedsForm, setHealthNeedsForm] = useState({})
  const [editingTitleReportId, setEditingTitleReportId] = useState(null)
  const [editingTitleValue, setEditingTitleValue] = useState('')
  const [editingHealth, setEditingHealth] = useState(false)
  const [editingLifestyle, setEditingLifestyle] = useState(false)
  const [editingInsurance, setEditingInsurance] = useState(false)
  const [healthForm, setHealthForm] = useState({})
  const [lifestyleForm, setLifestyleForm] = useState({})
  const [insuranceForm, setInsuranceForm] = useState({})
  // 药物 & 营养素
  const [medications, setMedications] = useState([])
  const [supplements, setSupplements] = useState([])
  const [medSubTab, setMedSubTab] = useState('med') // 'med' | 'sup'
  const [showMedModal, setShowMedModal] = useState(false)
  const [showSupModal, setShowSupModal] = useState(false)
  const [editingMed, setEditingMed] = useState(null)
  const [editingSup, setEditingSup] = useState(null)
  const [medForm, setMedForm] = useState({})
  const [supForm, setSupForm] = useState({})
  const [medSaving, setMedSaving] = useState(false)
  // 专项筛查 & 打卡记录
  const [screeningItems, setScreeningItems] = useState([])
  const [screeningReports, setScreeningReports] = useState([])
  const [showScreeningForm, setShowScreeningForm] = useState(false)
  const [screeningForm, setScreeningForm] = useState({ title: '', screeningCategory: 'tumor', checkDate: '', hospital: '', note: '', reportItems: [] })
  const [screeningFile, setScreeningFile] = useState(null)
  const [screeningSaving, setScreeningSaving] = useState(false)
  const [screeningSearchQ, setScreeningSearchQ] = useState('')
  const [screeningSearchResults, setScreeningSearchResults] = useState([])
  const [screeningSearching, setScreeningSearching] = useState(false)
  const [expandedRecord, setExpandedRecord] = useState(null) // 展开详情的记录 _id
  const [previewImageUrl, setPreviewImageUrl] = useState(null) // 灯箱预览
  const screeningSearchTimer = useRef(null)
  const [healthRecords, setHealthRecords] = useState([])
  // 健康评分
  const [scoreLoading, setScoreLoading] = useState(false)
  const [editingLabValues, setEditingLabValues] = useState(false)
  const [labNewRecord, setLabNewRecord] = useState(false) // true=新增记录 false=编辑当前
  const [labForm, setLabForm] = useState({})
  const [editingDiseaseSeverity, setEditingDiseaseSeverity] = useState(false)
  const [severityForm, setSeverityForm] = useState({})
  // 4.2 身体成分
  const [editingBodyComp, setEditingBodyComp] = useState(false)
  const [bodyCompNewRecord, setBodyCompNewRecord] = useState(false)
  const [bodyCompForm, setBodyCompForm] = useState({})
  // 4.4 AI健康汇总
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false)
  const [editingAISummary, setEditingAISummary] = useState(false)
  const [aiSummaryForm, setAiSummaryForm] = useState({})

  const load = async () => {
    try {
      const res = await staffAPI.getPatient(id)
      setData(res.data)
      setEditForm(buildEditForm(res.data.user))
      setBasicInfoForm(buildBasicInfoForm(res.data.user))
      setHealthNeedsForm(buildHealthNeedsForm(res.data.user))
      setHealthForm(buildHealthForm(res.data.user))
      setLifestyleForm(buildLifestyleForm(res.data.user))
      setInsuranceForm(buildInsuranceForm(res.data.user))
      setLabForm(res.data.user.labValues || {})
      setSeverityForm(res.data.user.chronicDiseaseSeverity || {})
      setBodyCompForm(res.data.user.bodyComposition || {})
      setAiSummaryForm(res.data.user.aiHealthSummary || {})
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
  const loadMedications = async () => {
    try { const r = await staffAPI.getPatientMedications(id); setMedications(r.data || []) } catch {}
  }
  const loadSupplements = async () => {
    try { const r = await staffAPI.getPatientSupplements(id); setSupplements(r.data || []) } catch {}
  }
  const loadScreening = async () => {
    try {
      const [sr, hr, scr] = await Promise.allSettled([
        staffAPI.getPatientScreening(id),
        staffAPI.getPatientHealthRecords(id, { limit: 30 }),
        staffAPI.getScreeningReports(id),
      ])
      if (sr.status === 'fulfilled') setScreeningItems(sr.value.data || [])
      if (hr.status === 'fulfilled') setHealthRecords(hr.value.data || [])
      if (scr.status === 'fulfilled') setScreeningReports(scr.value.data || [])
    } catch {}
  }

  const openReportDetail = async (r) => {
    setShowReportDetail(r)
    try {
      const res = await staffAPI.getReport(r._id)
      setShowReportDetail(res.data)
    } catch { /* keep partial */ }
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
    else if (tab === 'medications') { loadMedications(); loadSupplements() }
    else if (tab === 'records') loadScreening()
    else if (tab === 'consumption') staffAPI.getPatientOrders(id).then(r => setPatientOrders(r.data || [])).catch(() => {})
  }, [tab])

  const buildEditForm = (u) => ({
    chronicDiseases: u.chronicDiseases || [],
    memberType: u.memberType || '',
    patientType: u.patientType || '',
    source: u.source || '',
    remark: u.remark || '',
    contactPhone2: u.contactPhone2 || '',
    contactName: u.contactName || '',
    deliveryAddress: u.deliveryAddress || '',
    assignedHealthManager: u.assignedHealthManager?._id || '',
    assignedFamilyDoctor:  u.assignedFamilyDoctor?._id  || '',
    assignedNutritionist:  u.assignedNutritionist?._id  || '',
    servicePackage: u.servicePackage || '',
    serviceExpiry: u.serviceExpiry || '',
    serviceStartDate: u.serviceStartDate || '',
  })

  const buildBasicInfoForm = (u) => ({
    name: u.name || '',
    gender: u.gender || '未知',
    birthDate: u.birthDate || '',
    idNumber: u.idNumber || '',
    maritalStatus: u.maritalStatus || '',
    ethnicity: u.ethnicity || '',
    workplace: u.workplace || '',
    occupation: u.occupation || '',
    education: u.education || '',
    hasAnnualCheckup: u.hasAnnualCheckup || '',
    height: u.height || '',
    weight: u.weight || '',
    address: u.address || '',
    contactPhone: u.contactPhone || '',
  })

  const handleSaveBasicInfo = async () => {
    try {
      await staffAPI.updatePatient(id, basicInfoForm)
      toast('基本信息已保存')
      setEditingBasicInfo(false)
      load()
    } catch (err) { toast(err.message || '保存失败') }
  }

  const handleSaveHealthNeeds = async () => {
    try {
      await staffAPI.updatePatient(id, healthNeedsForm)
      toast('健康需求已保存')
      setEditingHealthNeeds(false)
      load()
    } catch (err) { toast(err.message || '保存失败') }
  }

  const buildHealthForm = (u) => ({
    bloodTypeABO: u.bloodTypeABO || '',
    bloodTypeRH: u.bloodTypeRH || '',
    traumaHistory: u.traumaHistory || '',
    transfusionHistory: u.transfusionHistory || '',
    poisoningHistory: u.poisoningHistory || '',
    infectiousHistory: u.infectiousHistory || '',
    vaccinationHistory: u.vaccinationHistory || '',
    otherDiseaseHistory: u.otherDiseaseHistory || '',
    healthProfile: {
      drugAllergy: u.healthProfile?.drugAllergy || '',
      foodAllergy: u.healthProfile?.foodAllergy || '',
      pastHistory: u.healthProfile?.pastHistory || '',
      medicHistory: u.healthProfile?.medicHistory || '',
      surgeryHistory: u.healthProfile?.surgeryHistory || '',
      menstrualHistory: u.healthProfile?.menstrualHistory || '',
      maritalHistory: u.healthProfile?.maritalHistory || '',
      sexualHistory: u.healthProfile?.sexualHistory || '',
      familyHistoryNote: u.healthProfile?.familyHistoryNote || '',
      supplementHistory: u.healthProfile?.supplementHistory || '',
      recentSymptoms: u.healthProfile?.recentSymptoms || [],
      recentMedication: u.healthProfile?.recentMedication || '',
      recentSupplement: u.healthProfile?.recentSupplement || '',
    },
  })

  const buildHealthNeedsForm = (u) => ({
    healthConcern: u.healthConcern || '',
    healthConcernFor: u.healthConcernFor || '',
    expectedService: u.expectedService || '',
    hasHomeMonitor: u.hasHomeMonitor || '',
    hasMedicineCabinet: u.hasMedicineCabinet || '',
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
    lifestyle_data: u.lifestyle_data || {},
  })

  // 生活方式：自动生成综合概述
  const buildLifestyleSummary = (d) => {
    const flags = []
    // 三餐：少吃或不吃
    const meals = ['breakfast', 'lunch', 'dinner']
    const missedMeals = meals.filter(m => d[`${m}Detail`] === '少吃' || d[`${m}Detail`] === '不吃')
    if (missedMeals.length > 0) flags.push('三餐不规律或经常少吃/不吃某一餐')
    // 能量摄入不足/节食：有2餐及以上少吃或不吃
    const severelyMissed = meals.filter(m => d[`${m}Detail`] === '不吃')
    const lightMissed = meals.filter(m => d[`${m}Detail`] === '少吃')
    if (severelyMissed.length >= 1 || lightMissed.length >= 2) flags.push('每日摄入能量不足/节食')
    // 外卖/外食频率高：应酬≥3次/周，或三餐中≥2餐为外卖/饭店
    const eatOutMeals = meals.filter(m => d[`${m}Detail`] === '外卖' || d[`${m}Detail`] === '饭店或外卖')
    const highEntertainment = d.entertainment === '3-5次/周' || d.entertainment === '6-7次/周'
    if (eatOutMeals.length >= 2 || highEntertainment) flags.push('外卖/外食频率高（每周≥5次）')
    // 饮水不足
    if (d.dailyWater === '1500毫升内') flags.push('饮水量不足（＜1500毫升/天）')
    // 蔬菜摄入不足
    if (d.dailyVegetables && (d.dailyVegetables === '300克以内' || d.dailyVegetables === '几乎不吃')) {
      flags.push('蔬菜、水果、粗杂粮、奶制品摄入不足')
    }
    // 主食过多
    if (d.dailyStaple === '400克以上') flags.push('精制主食摄入过多')
    // 不良饮食习惯
    const badHabits = d.badDietHabits || []
    if (badHabits.length > 0) flags.push('存在不良饮食习惯（油炸、甜品、腌制、重油、偏咸、夜宵等）')
    // 作息/运动
    if (d.scheduleRegularity === '不规律' || d.exerciseFrequency === '无') flags.push('作息不规律或运动不足')
    // 过敏/忌口
    const hasAllergy = (d.foodAllergens || []).some(a => a !== '无') || d.dietaryRestrictions === '有'
    if (hasAllergy) flags.push('有食物过敏、忌口或营养干预史')
    if (d.nutritionHistory && d.nutritionHistory.trim()) flags.push('有食物过敏、忌口或营养干预史')
    // 排便
    if (d.bowelRegularity === '便秘/腹泻') flags.push('排便不规律或便秘')
    else if (d.bowelRegularity === '偶尔不规律') flags.push('排便偶有不规律')
    // 心理压力
    if (d.psychStress && d.psychStress !== '正常') flags.push('存在心理压力或情绪问题')
    return [...new Set(flags)]
  }

  // 生活方式：活动标签页
  const [lifestyleTab, setLifestyleTab] = useState('diet')

  const buildInsuranceForm = (u) => ({
    basic_insurance: u.basic_insurance || '',
    commercial_medical: u.commercial_medical || '',
    critical_illness: u.critical_illness || '',
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

  const handleSaveInsurance = async () => {
    try {
      await staffAPI.updatePatient(id, {
        basic_insurance: insuranceForm.basic_insurance,
        commercial_medical: insuranceForm.commercial_medical,
        critical_illness: insuranceForm.critical_illness,
      })
      toast('医疗保障信息已保存')
      setEditingInsurance(false)
      load()
    } catch (err) { toast(err.message || '保存失败') }
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
      const d = lifestyleForm.lifestyle_data || {}
      if (!d.summaryOverride) {
        const flags = buildLifestyleSummary(d)
        lifestyleForm.lifestyle_data = { ...d, autoSummaryFlags: flags }
      }
      await staffAPI.updatePatient(id, lifestyleForm)
      await staffAPI.recalculateScore(id)
      toast('生活方式已保存，评分已更新')
      setEditingLifestyle(false)
      load()
    } catch (err) { toast(err.message || '保存失败') }
  }

  const handleSaveLabValues = async () => {
    try {
      const payload = { labValues: labForm }
      if (labNewRecord) payload._addLabHistory = true
      await staffAPI.updatePatient(id, payload)
      await staffAPI.recalculateScore(id)
      toast(labNewRecord ? '新增体检记录已保存，评分已更新' : '体检指标已保存，评分已更新')
      setEditingLabValues(false)
      setLabNewRecord(false)
      load()
    } catch (err) { toast(err.message || '保存失败') }
  }

  const handleSaveDiseaseSeverity = async () => {
    try {
      await staffAPI.updatePatient(id, { chronicDiseaseSeverity: severityForm })
      await staffAPI.recalculateScore(id)
      toast('慢病分级已保存，评分已更新')
      setEditingDiseaseSeverity(false)
      load()
    } catch (err) { toast(err.message || '保存失败') }
  }

  // 3.1 档案审核
  const handleArchiveReview = async () => {
    try {
      await staffAPI.archiveReview(id, 'approve')
      toast('档案已审核确认')
      load()
    } catch (err) { toast(err.message || '审核失败') }
  }

  // 4.2 身体成分
  const handleSaveBodyComp = async () => {
    try {
      const payload = { bodyComposition: bodyCompForm }
      if (bodyCompNewRecord) payload._addBodyCompHistory = true
      await staffAPI.updatePatient(id, payload)
      toast(bodyCompNewRecord ? '新增身体成分记录已保存' : '身体成分数据已保存')
      setEditingBodyComp(false)
      setBodyCompNewRecord(false)
      load()
    } catch (err) { toast(err.message || '保存失败') }
  }

  // 4.4 AI汇总
  const handleGenerateAISummary = async () => {
    try {
      setAiSummaryLoading(true)
      const res = await staffAPI.generateAIHealthSummary(id)
      setAiSummaryForm(res.data)
      toast('AI分析已生成')
      load()
    } catch (err) { toast(err.message || 'AI生成失败，请确认 ANTHROPIC_API_KEY 已配置') }
    finally { setAiSummaryLoading(false) }
  }

  const handleSaveAISummary = async (approve = false) => {
    try {
      const payload = { ...aiSummaryForm, ...(approve ? { action: 'approve' } : {}) }
      await staffAPI.updateAIHealthSummary(id, payload)
      toast(approve ? '分析报告已审核确认' : '分析报告已保存')
      setEditingAISummary(false)
      load()
    } catch (err) { toast(err.message || '保存失败') }
  }

  // 4.3 录入筛查结果
  const handleSaveScreeningRecord = async () => {
    if (!screeningForm.title) return toast('请从项目库中选择检查项目')
    if (!screeningForm.screeningCategory) return toast('请选择筛查分类')
    try {
      setScreeningSaving(true)
      await staffAPI.createScreeningRecord(id, screeningForm, screeningFile)
      toast('筛查结果已录入')
      setShowScreeningForm(false)
      setScreeningForm({ title: '', screeningCategory: 'tumor', checkDate: '', hospital: '', note: '', reportItems: [] })
      setScreeningFile(null)
      setScreeningSearchQ(''); setScreeningSearchResults([])
      loadScreening()
    } catch (err) { toast(err.message || '录入失败') }
    finally { setScreeningSaving(false) }
  }

  const handleRecalculateScore = async () => {
    try {
      setScoreLoading(true)
      await staffAPI.recalculateScore(id)
      toast('健康评分已重新计算')
      load()
    } catch (err) {
      toast(err.message || '计算失败')
    } finally {
      setScoreLoading(false)
    }
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
                {getServicePackageLabel(user.servicePackage)} · 到期：{new Date(user.serviceExpiry).toLocaleDateString('zh-CN')}
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
          { key: 'ai',            label: 'AI分析及方案' },
          { key: 'medications',   label: '药物及营养素' },
          { key: 'requisitions',  label: '检查开单' },
          { key: 'plans',         label: '管理方案' },
          { key: 'followups',     label: '随访记录' },
          { key: 'serviceRecords', label: '服务记录' },
          { key: 'consumption',   label: '消费记录' },
          { key: 'family',        label: '家庭信息' },
          { key: 'membership',    label: '会员信息' },
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
              {!editingBasicInfo
                ? <button className="btn btn-secondary btn-sm" onClick={() => { setEditingBasicInfo(true); setBasicInfoForm(buildBasicInfoForm(user)) }}>编辑</button>
                : <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={handleSaveBasicInfo}>保存</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setEditingBasicInfo(false); setBasicInfoForm(buildBasicInfoForm(user)) }}>取消</button>
                  </div>
              }
            </div>
            <div className="card-body">
              {editingBasicInfo ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { key: 'name', label: '姓名' },
                    { key: 'idNumber', label: '身份证号' },
                    { key: 'birthDate', label: '出生日期', type: 'date' },
                    { key: 'height', label: '身高(cm)', type: 'number' },
                    { key: 'weight', label: '体重(kg)', type: 'number' },
                    { key: 'address', label: '联系地址' },
                    { key: 'contactPhone', label: '联系电话' },
                    { key: 'workplace', label: '所在企业' },
                    { key: 'occupation', label: '所在行业' },
                  ].map(({ key, label, type }) => (
                    <div key={key} className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: 12, color: '#8AA89C' }}>{label}</label>
                      <input className="form-input" type={type || 'text'} value={basicInfoForm[key] || ''}
                        onChange={e => setBasicInfoForm(f => ({ ...f, [key]: e.target.value }))} />
                    </div>
                  ))}
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>性别</label>
                    <select className="form-input" value={basicInfoForm.gender || '未知'} onChange={e => setBasicInfoForm(f => ({ ...f, gender: e.target.value }))}>
                      <option value="未知">未知</option><option value="男">男</option><option value="女">女</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>婚姻状况</label>
                    <select className="form-input" value={basicInfoForm.maritalStatus || ''} onChange={e => setBasicInfoForm(f => ({ ...f, maritalStatus: e.target.value }))}>
                      <option value="">未填写</option><option>未婚</option><option>已婚</option><option>离异</option><option>丧偶</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>民族</label>
                    <input className="form-input" value={basicInfoForm.ethnicity || ''} onChange={e => setBasicInfoForm(f => ({ ...f, ethnicity: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>学历</label>
                    <select className="form-input" value={basicInfoForm.education || ''} onChange={e => setBasicInfoForm(f => ({ ...f, education: e.target.value }))}>
                      <option value="">未填写</option>
                      {['小学','初中','高中','大专','本科','硕士','博士'].map(v => <option key={v}>{v}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>是否每年健康体检</label>
                    <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                      {['是','否'].map(v => (
                        <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                          <input type="radio" checked={basicInfoForm.hasAnnualCheckup === v} onChange={() => setBasicInfoForm(f => ({ ...f, hasAnnualCheckup: v }))} />{v}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <>
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
                  <InfoRow label="学历" value={user.education || '-'} />
                  <InfoRow label="所在企业" value={user.workplace || '-'} />
                  <InfoRow label="所在行业" value={user.occupation || '-'} />
                  <InfoRow label="每年体检" value={user.hasAnnualCheckup || '-'} />
                </>
              )}
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
                    <label className="form-label">紧急联系电话</label>
                    <input className="form-input" value={editForm.contactPhone2}
                      onChange={e => setEditForm(f => ({ ...f, contactPhone2: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">紧急联系人</label>
                    <input className="form-input" value={editForm.contactName}
                      onChange={e => setEditForm(f => ({ ...f, contactName: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">配送地址</label>
                    <input className="form-input" value={editForm.deliveryAddress}
                      onChange={e => setEditForm(f => ({ ...f, deliveryAddress: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">会员类型</label>
                    <select className="form-input" value={editForm.memberType || ''}
                      onChange={e => setEditForm(f => ({ ...f, memberType: e.target.value }))}>
                      <option value="">-- 未设置 --</option>
                      <option value="优享">优享</option>
                      <option value="悦享">悦享</option>
                      <option value="尊享">尊享</option>
                      <option value="卓越">卓越</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">家庭医师</label>
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
                  <InfoRow label="紧急联系电话" value={user.contactPhone2 || '-'} />
                  <InfoRow label="紧急联系人" value={user.contactName || '-'} />
                  <InfoRow label="配送地址" value={user.deliveryAddress || '-'} />
                  <InfoRow label="会员类型" value={user.memberType || '-'} />
                  <InfoRow label="家庭医师" value={user.assignedFamilyDoctor?.name || '-'} />
                  <InfoRow label="营养师" value={user.assignedNutritionist?.name || '-'} />
                  <InfoRow label="健管专员" value={user.assignedHealthManager?.name || '-'} />
                  <InfoRow label="正式客户" value={
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: user.isRegisteredClient ? '#22A06B' : '#aaa', fontWeight: 600 }}>
                        {user.isRegisteredClient ? '✓ 是（隐藏365入口）' : '否'}
                      </span>
                      <button className="btn btn-secondary btn-sm" onClick={async () => {
                        try {
                          await staffAPI.updatePatient(user._id, { isRegisteredClient: !user.isRegisteredClient })
                          toast(`已${!user.isRegisteredClient ? '标记为正式客户' : '取消正式客户标记'}`)
                          load()
                        } catch (e) { toast(e.message) }
                      }}>切换</button>
                    </span>
                  } />
                  <InfoRow label="会员来源" value={user.source || '-'} />
                  <InfoRow label="服务包" value={getServicePackageLabel(user.servicePackage)} />
                  <InfoRow label="服务开始" value={user.serviceStartDate || '-'} />
                  <InfoRow label="服务到期" value={user.serviceExpiry || '-'} />
                  <InfoRow label="健康评分" value={(() => {
                    const s = user.healthScore
                    const g = user.healthScoreDetail?.grade
                    if (!s) return '-'
                    const c = { '优': '#22A06B', '良': '#1E6B50', '中': '#D97706', '差': '#DC3545' }[g] || '#8AA89C'
                    return <span>{s}分 {g && <span style={{ marginLeft: 6, padding: '1px 8px', borderRadius: 10, background: c + '20', color: c, fontSize: 12, fontWeight: 600 }}>{g}</span>}</span>
                  })()} />
                  {user.remark && (
                    <div style={{ marginTop: 8, padding: '8px 12px', background: '#f9f7f3', borderRadius: 8, fontSize: 13, color: '#4A6558' }}>
                      📝 {user.remark}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 医疗保障信息 */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">医疗保障信息</div>
              {!editingInsurance
                ? <button className="btn btn-secondary btn-sm" onClick={() => { setEditingInsurance(true); setInsuranceForm(buildInsuranceForm(user)) }}>编辑</button>
                : <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={handleSaveInsurance}>保存</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setEditingInsurance(false); setInsuranceForm(buildInsuranceForm(user)) }}>取消</button>
                  </div>
              }
            </div>
            <div className="card-body">
              {editingInsurance ? (
                <div style={{ display: 'grid', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 6 }}>基础医疗保障（三选一）</label>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      {['城镇医疗保险', '居民医疗保险', '自费'].map(opt => (
                        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14, color: '#1A2B24' }}>
                          <input type="radio" name="ins_basic" value={opt}
                            checked={insuranceForm.basic_insurance === opt}
                            onChange={() => setInsuranceForm(p => ({ ...p, basic_insurance: opt }))} />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 6 }}>商业医疗险（四选一）</label>
                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                      {['百万医疗险', '高端医疗险（亚洲版）', '高端医疗险（全球版）', '未购买'].map(opt => (
                        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14, color: '#1A2B24' }}>
                          <input type="radio" name="ins_commercial" value={opt}
                            checked={insuranceForm.commercial_medical === opt}
                            onChange={() => setInsuranceForm(p => ({ ...p, commercial_medical: opt }))} />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 6 }}>重疾险（三选一）</label>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      {['大陆险', '港险', '未购买'].map(opt => (
                        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14, color: '#1A2B24' }}>
                          <input type="radio" name="ins_critical" value={opt}
                            checked={insuranceForm.critical_illness === opt}
                            onChange={() => setInsuranceForm(p => ({ ...p, critical_illness: opt }))} />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#8AA89C', minWidth: 80 }}>基础医疗保障：</span>
                    <span style={{ fontSize: 13, color: '#1A2B24' }}>{user.basic_insurance || '-'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#8AA89C', minWidth: 80 }}>医疗险：</span>
                    <span style={{ fontSize: 13, color: '#1A2B24' }}>{user.commercial_medical || '-'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#8AA89C', minWidth: 80 }}>重疾险：</span>
                    <span style={{ fontSize: 13, color: '#1A2B24' }}>{user.critical_illness || '-'}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 健康需求 */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">健康需求</div>
              {!editingHealthNeeds
                ? <button className="btn btn-secondary btn-sm" onClick={() => { setEditingHealthNeeds(true); setHealthNeedsForm(buildHealthNeedsForm(user)) }}>编辑</button>
                : <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={handleSaveHealthNeeds}>保存</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditingHealthNeeds(false)}>取消</button>
                  </div>
              }
            </div>
            <div className="card-body">
              {editingHealthNeeds ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { key: 'healthConcern', label: '关注的健康问题', rows: 2 },
                    { key: 'healthConcernFor', label: '更关注谁的健康', rows: 1 },
                    { key: 'expectedService', label: '期望家庭医生服务', rows: 2 },
                    { key: 'hasHomeMonitor', label: '居家检测设备', rows: 2 },
                  ].map(({ key, label, rows }) => (
                    <div key={key}>
                      <label style={{ fontSize: 12, color: '#8AA89C' }}>{label}</label>
                      {rows > 1
                        ? <textarea className="form-input" rows={rows} value={healthNeedsForm[key] || ''} onChange={e => setHealthNeedsForm(f => ({ ...f, [key]: e.target.value }))} />
                        : <input className="form-input" value={healthNeedsForm[key] || ''} onChange={e => setHealthNeedsForm(f => ({ ...f, [key]: e.target.value }))} />
                      }
                    </div>
                  ))}
                  <div>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>居家小药箱</label>
                    <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                      {['是','否'].map(v => (
                        <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                          <input type="radio" checked={healthNeedsForm.hasMedicineCabinet === v} onChange={() => setHealthNeedsForm(f => ({ ...f, hasMedicineCabinet: v }))} />{v}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {[
                    ['关注的健康问题', user.healthConcern],
                    ['更关注谁的健康', user.healthConcernFor],
                    ['期望服务', user.expectedService],
                    ['居家检测设备', user.hasHomeMonitor],
                    ['居家小药箱', user.hasMedicineCabinet],
                  ].map(([label, val]) => val ? (
                    <div key={label} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid #f5f2ec' }}>
                      <span style={{ fontSize: 12, color: '#8AA89C', minWidth: 90 }}>{label}：</span>
                      <span style={{ fontSize: 13, color: '#1A2B24', flex: 1 }}>{val}</span>
                    </div>
                  ) : null)}
                  {!user.healthConcern && !user.expectedService && (
                    <div style={{ color: '#ccc', fontSize: 13 }}>暂未填写</div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 最近随访 */}
          <div className="card" style={{ gridColumn: 'span 2' }}>
            <div className="card-header">
              <div className="card-title">最近随访</div>
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
                  暂无随访记录
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Records Tab ── */}
      {tab === 'records' && (
        <>
        {/* ── 整体档案审核状态（顶部） ── */}
        <div style={{ marginBottom: 16, padding: '10px 16px', background: user.archiveReviewStatus === 'reviewed' ? '#F0FDF4' : '#FFFBEB', borderRadius: 8, border: `1px solid ${user.archiveReviewStatus === 'reviewed' ? '#BBF7D0' : '#FDE68A'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, color: '#4A6558' }}>
            健康档案整体审核状态：
            <span style={{ marginLeft: 6, fontWeight: 600, color: user.archiveReviewStatus === 'reviewed' ? '#22A06B' : '#D97706' }}>
              {user.archiveReviewStatus === 'reviewed' ? '✓ 已审核' : '待审核'}
            </span>
            {user.archiveReviewedAt && (
              <span style={{ marginLeft: 8, fontSize: 12, color: '#aaa' }}>
                审核时间：{new Date(user.archiveReviewedAt).toLocaleDateString('zh-CN')}
              </span>
            )}
            <span style={{ marginLeft: 12, fontSize: 12, color: '#8AA89C' }}>（对基础资料、健康档案、管理信息、医疗保障、生活方式、健康需求等全部内容进行整体审核）</span>
          </div>
          {user.archiveReviewStatus !== 'reviewed' ? (
            <button className="btn btn-primary btn-sm" onClick={handleArchiveReview}>审核确认</button>
          ) : (
            <button className="btn btn-secondary btn-sm" onClick={async () => { await staffAPI.archiveReview(id, 'reset'); toast('已重置为待审核'); load() }}>重置审核</button>
          )}
        </div>

        {/* ── 初始健康数据录入 ── */}
        <InitialHealthRecordForm patientId={user._id} onSaved={() => load()} toast={toast} />

        {/* ── 健康评分卡片 ── */}
        {(() => {
          const detail = user.healthScoreDetail || {}
          const score = user.healthScore || 0
          const grade = detail.grade || (score >= 90 ? '优' : score >= 75 ? '良' : score >= 60 ? '中' : score > 0 ? '差' : '-')
          const gradeColor = { '优': '#22A06B', '良': '#1E6B50', '中': '#D97706', '差': '#DC3545' }[grade] || '#8AA89C'
          return (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <div className="card-title">健康评分</div>
                <button className="btn btn-primary btn-sm" onClick={handleRecalculateScore} disabled={scoreLoading}>
                  {scoreLoading ? '计算中...' : '重新计算'}
                </button>
              </div>
              <div style={{ padding: '16px 20px' }}>
                {score > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 32, flexWrap: 'wrap' }}>
                    {/* 总分 */}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 48, fontWeight: 700, color: gradeColor, lineHeight: 1 }}>{score}</div>
                      <div style={{ fontSize: 13, color: '#8AA89C', marginTop: 4 }}>满分100</div>
                      <div style={{ marginTop: 8, padding: '3px 12px', background: gradeColor + '20', borderRadius: 12, color: gradeColor, fontWeight: 600, fontSize: 15, display: 'inline-block' }}>
                        {grade}
                      </div>
                    </div>
                    {/* 分项明细 */}
                    {detail.deductions && (
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 8 }}>评分构成</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px' }}>
                          {[
                            ['基础健康分（初始60）', `${60 + (detail.deductions?.chronic || 0) + (detail.deductions?.lab || 0)}`],
                            ['生活方式分（初始40）', `${40 + (detail.deductions?.lifestyle || 0)}`],
                            ['慢性病扣分', `${detail.deductions?.chronic || 0}`],
                            ['体检指标扣分', `${detail.deductions?.lab || 0}`],
                            ['生活方式扣分', `${detail.deductions?.lifestyle || 0}`],
                            ['年龄性别调整', `${detail.ageGenderAdj >= 0 ? '+' : ''}${detail.ageGenderAdj || 0}`],
                          ].map(([label, val]) => (
                            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0', borderBottom: '1px solid #f0ede6' }}>
                              <span style={{ color: '#4A6558' }}>{label}</span>
                              <span style={{ fontWeight: 600, color: String(val).startsWith('-') ? '#DC3545' : '#1A2B24' }}>{val}</span>
                            </div>
                          ))}
                        </div>
                        {detail.calculatedAt && (
                          <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>
                            计算时间：{new Date(detail.calculatedAt).toLocaleString('zh-CN')}
                          </div>
                        )}
                      </div>
                    )}
                    {/* 趋势 */}
                    {user.scoreHistory?.length >= 2 && (
                      <div>
                        <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 8 }}>评分趋势</div>
                        {(() => {
                          const hist = [...(user.scoreHistory || [])].slice(-8).reverse()
                          const W = 180, H = 60, PAD = 6
                          const vals = hist.map(h => h.score)
                          const min = Math.min(...vals, 0), max = Math.max(...vals, 100)
                          const range = max - min || 1
                          const xs = hist.map((_, i) => PAD + (i / Math.max(hist.length - 1, 1)) * (W - PAD * 2))
                          const ys = vals.map(v => H - PAD - ((v - min) / range) * (H - PAD * 2))
                          const pts = xs.map((x, i) => `${x},${ys[i]}`).join(' ')
                          return (
                            <svg width={W} height={H} style={{ display: 'block' }}>
                              <polyline fill="none" stroke="#1E6B50" strokeWidth="2" points={pts} />
                              {hist.map((h, i) => (
                                <circle key={i} cx={xs[i]} cy={ys[i]} r={3} fill="#1E6B50" />
                              ))}
                            </svg>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', padding: '12px 0' }}>
                    暂无评分，请先录入体检指标和生活方式数据，然后点击「重新计算」
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {/* ── 基本档案 ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title">基本档案</div>
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
                  { key: 'medicHistory', label: '是否长期服用中药或西药', nested: true },
                  { key: 'supplementHistory', label: '是否有长期服用营养补剂', nested: true },
                  { key: 'surgeryHistory', label: '手术史', nested: true },
                  { key: 'traumaHistory', label: '外伤史', nested: false },
                  { key: 'transfusionHistory', label: '输血史', nested: false },
                  { key: 'poisoningHistory', label: '中毒史', nested: false },
                  { key: 'infectiousHistory', label: '传染病史', nested: false },
                  { key: 'vaccinationHistory', label: '预防接种史', nested: false },
                  { key: 'otherDiseaseHistory', label: '其他特殊疾病史', nested: false },
                  { key: 'familyHistoryNote', label: '家族史', nested: true },
                  ...(user.gender === '女' ? [
                    { key: 'sexualHistory', label: '是否有性生活史', nested: true },
                    { key: 'menstrualHistory', label: '月经史', nested: true },
                    { key: 'maritalHistory', label: '生育史', nested: true },
                  ] : []),
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
                <div style={{ fontWeight: 600, fontSize: 13, color: '#1E6B50', marginTop: 8, marginBottom: 4 }}>近期健康状态</div>
                <div>
                  <label style={{ fontSize: 12, color: '#8AA89C' }}>最近3个月躯体症状</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {(() => {
                      const symptoms = healthForm.healthProfile?.recentSymptoms || []
                      const noSymptom = symptoms.includes('无躯体症状')
                      const otherEntry = symptoms.find(s => s.startsWith('其他'))
                      const otherText = otherEntry ? otherEntry.replace(/^其他[:：]?/, '') : ''
                      const OPTS = ['头痛','头晕','胸闷','乏力','失眠','焦虑/抑郁','消化不良','关节疼痛','皮肤问题']
                      const updateSymptoms = (next) => setHealthForm(p => ({ ...p, healthProfile: { ...p.healthProfile, recentSymptoms: next } }))
                      return (
                        <>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 12, padding: '3px 8px', borderRadius: 20, border: `1px solid ${noSymptom ? '#1E6B50' : '#E0D9CE'}`, background: noSymptom ? '#E8F5EF' : '#fff', color: noSymptom ? '#1E6B50' : '#4A6558' }}>
                            <input type="checkbox" style={{ display: 'none' }} checked={noSymptom}
                              onChange={e => updateSymptoms(e.target.checked ? ['无躯体症状'] : [])} />
                            无躯体症状
                          </label>
                          {OPTS.map(s => {
                            const checked = !noSymptom && symptoms.includes(s)
                            return (
                              <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 12, padding: '3px 8px', borderRadius: 20, border: `1px solid ${checked ? '#1E6B50' : '#E0D9CE'}`, background: checked ? '#E8F5EF' : '#fff', color: checked ? '#1E6B50' : '#4A6558' }}>
                                <input type="checkbox" style={{ display: 'none' }} checked={checked}
                                  onChange={e => {
                                    const cur = symptoms.filter(x => x !== '无躯体症状')
                                    updateSymptoms(e.target.checked ? [...cur, s] : cur.filter(x => x !== s))
                                  }} />{s}
                              </label>
                            )
                          })}
                          {(() => {
                            const otherChecked = !noSymptom && symptoms.some(s => s.startsWith('其他'))
                            return (
                              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 12, padding: '3px 8px', borderRadius: 20, border: `1px solid ${otherChecked ? '#1E6B50' : '#E0D9CE'}`, background: otherChecked ? '#E8F5EF' : '#fff', color: otherChecked ? '#1E6B50' : '#4A6558' }}>
                                <input type="checkbox" style={{ display: 'none' }} checked={otherChecked}
                                  onChange={e => {
                                    const cur = symptoms.filter(x => x !== '无躯体症状' && !x.startsWith('其他'))
                                    updateSymptoms(e.target.checked ? [...cur, '其他'] : cur)
                                  }} />
                                其他
                                {otherChecked && (
                                  <input
                                    type="text"
                                    placeholder="请说明"
                                    value={otherText}
                                    onClick={e => e.preventDefault()}
                                    onChange={e => {
                                      const cur = symptoms.filter(x => x !== '无躯体症状' && !x.startsWith('其他'))
                                      const text = e.target.value
                                      updateSymptoms([...cur, text ? `其他：${text}` : '其他'])
                                    }}
                                    style={{ marginLeft: 4, border: 'none', outline: 'none', background: 'transparent', fontSize: 12, width: 100, color: '#1A2B24' }}
                                  />
                                )}
                              </label>
                            )
                          })()}
                        </>
                      )
                    })()}
                  </div>
                </div>
                {[
                  { key: 'recentMedication', label: '最近1个月是否服用中药或西药' },
                  { key: 'recentSupplement', label: '最近1个月是否服用营养补剂' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>{label}</label>
                    <textarea className="form-control" rows={2} value={healthForm.healthProfile?.[key] || ''}
                      onChange={e => setHealthForm(p => ({ ...p, healthProfile: { ...p.healthProfile, [key]: e.target.value } }))} />
                  </div>
                ))}
              </div>
            ) : (() => {
              const Field = ({ label, val, full }) => !val ? null : (
                <div style={{ gridColumn: full ? '1 / -1' : undefined, display: 'flex', gap: 0, flexDirection: 'column', padding: '4px 0' }}>
                  <span style={{ fontSize: 11, color: '#8AA89C', marginBottom: 1 }}>{label}</span>
                  <span style={{ fontSize: 13, color: '#1A2B24', lineHeight: 1.4 }}>{val}</span>
                </div>
              )
              const SecTitle = ({ title }) => (
                <div style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 600, color: '#1E6B50', borderBottom: '1px solid #f0ece4', paddingBottom: 4, marginTop: 6 }}>{title}</div>
              )
              const bloodType = [user.bloodTypeABO, user.bloodTypeRH].filter(Boolean).join(' ')
              const symptoms = (user.healthProfile?.recentSymptoms || []).join('、')
              return (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 24px' }}>
                  <SecTitle title="基础信息" />
                  <Field label="血型" val={bloodType || '-'} />
                  <Field label="药物过敏" val={user.healthProfile?.drugAllergy} />
                  <Field label="食物过敏" val={user.healthProfile?.foodAllergy} />

                  <SecTitle title="病史" />
                  <Field label="既往史" val={user.healthProfile?.pastHistory} full />
                  <Field label="手术史" val={user.healthProfile?.surgeryHistory} />
                  <Field label="外伤史" val={user.traumaHistory} />
                  <Field label="输血史" val={user.transfusionHistory} />
                  <Field label="中毒史" val={user.poisoningHistory} />
                  <Field label="传染病史" val={user.infectiousHistory} />
                  <Field label="预防接种史" val={user.vaccinationHistory} />
                  <Field label="其他特殊疾病史" val={user.otherDiseaseHistory} full />
                  <Field label="家族史" val={user.healthProfile?.familyHistoryNote} full />

                  <SecTitle title="用药及补剂" />
                  <Field label="长期用药（中/西药）" val={user.healthProfile?.medicHistory} />
                  <Field label="长期服用营养补剂" val={user.healthProfile?.supplementHistory} />

                  {user.gender === '女' && <>
                    <SecTitle title="女性专项" />
                    <Field label="性生活史" val={user.healthProfile?.sexualHistory} />
                    <Field label="月经史" val={user.healthProfile?.menstrualHistory} />
                    <Field label="生育史" val={user.healthProfile?.maritalHistory} />
                  </>}

                  <SecTitle title="近期健康状态" />
                  <Field label="躯体症状" val={symptoms} full />
                  <Field label="近期用药（中/西药）" val={user.healthProfile?.recentMedication} />
                  <Field label="近期营养补剂" val={user.healthProfile?.recentSupplement} />
                </div>
              )
            })()}
          </div>
        </div>

        {/* ── 生活方式（膳食调查基础资料）── 位于健康档案顶部，打卡数据在下方 */}
        {(() => {
          const ld = editingLifestyle ? (lifestyleForm.lifestyle_data || {}) : (user.lifestyle_data || {})
          const setLd = (patch) => setLifestyleForm(p => ({ ...p, lifestyle_data: { ...(p.lifestyle_data || {}), ...patch } }))
          const row2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', marginBottom: 12 }
          const row3 = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 20px', marginBottom: 12 }
          const secTitle = { fontWeight: 600, fontSize: 13, color: '#1E6B50', margin: '12px 0 8px' }
          const tabBtnStyle = (k) => ({
            padding: '6px 14px', fontSize: 13, cursor: 'pointer',
            color: lifestyleTab === k ? '#1E6B50' : '#8AA89C',
            fontWeight: lifestyleTab === k ? 600 : 400,
            background: 'none', border: 'none',
            borderBottom: lifestyleTab === k ? '2px solid #1E6B50' : '2px solid transparent',
          })
          return (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <div className="card-title">生活方式（膳食调查）</div>
                {!editingLifestyle
                  ? <button className="btn btn-secondary btn-sm" onClick={() => { setLifestyleTab('diet'); setEditingLifestyle(true) }}>编辑</button>
                  : <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary btn-sm" onClick={handleSaveLifestyle}>保存</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setEditingLifestyle(false); setLifestyleForm(buildLifestyleForm(user)) }}>取消</button>
                    </div>
                }
              </div>
              <div className="card-body">
                {/* 子板块 Tab 导航 */}
                <div style={{ display: 'flex', borderBottom: '1px solid #e0d9ce', marginBottom: 16, overflowX: 'auto' }}>
                  {[
                    { key: 'diet', label: '膳食调查' },
                    { key: 'exercise', label: '运动与作息' },
                    { key: 'alcohol', label: '烟酒与应酬' },
                    { key: 'nutrition', label: '营养素与过敏' },
                    { key: 'summary', label: '综合概述' },
                  ].map(t => (
                    <button key={t.key} style={tabBtnStyle(t.key)} onClick={() => setLifestyleTab(t.key)}>{t.label}</button>
                  ))}
                </div>

                {/* ── 膳食调查 ── */}
                {lifestyleTab === 'diet' && (
                  <div>
                    <div style={secTitle}>三餐与加餐</div>
                    <div style={row2}>
                      <LsText label="早餐时间" value={ld.breakfastTime} editing={editingLifestyle} placeholder="如 07:30" onChange={v => setLd({ breakfastTime: v })} />
                      <LsRadio label="早餐就餐方式" value={ld.breakfastDetail} editing={editingLifestyle} options={['居家', '外卖', '少吃', '不吃']} onChange={v => setLd({ breakfastDetail: v })} />
                      <LsText label="早餐品类描述" value={ld.breakfastDesc} editing={editingLifestyle} placeholder="如 粥、鸡蛋、包子" onChange={v => setLd({ breakfastDesc: v })} />
                      <div>
                        <LsRadio label="上午加餐" value={ld.morningSnack} editing={editingLifestyle} options={['是', '否']} onChange={v => setLd({ morningSnack: v })} />
                        {(ld.morningSnack === '是' || !editingLifestyle) && (
                          <LsText label="上午加餐品类" value={ld.morningSnackDesc} editing={editingLifestyle} placeholder="如 坚果、水果" onChange={v => setLd({ morningSnackDesc: v })} />
                        )}
                      </div>
                    </div>
                    <div style={row2}>
                      <LsText label="午餐时间" value={ld.lunchTime} editing={editingLifestyle} placeholder="如 12:00" onChange={v => setLd({ lunchTime: v })} />
                      <LsRadio label="午餐就餐方式" value={ld.lunchDetail} editing={editingLifestyle} options={['居家', '饭店或外卖', '少吃', '不吃']} onChange={v => setLd({ lunchDetail: v })} />
                      <LsText label="午餐品类描述" value={ld.lunchDesc} editing={editingLifestyle} placeholder="如 米饭、炒菜、汤" onChange={v => setLd({ lunchDesc: v })} />
                      <div>
                        <LsRadio label="下午加餐" value={ld.afternoonSnack} editing={editingLifestyle} options={['是', '否']} onChange={v => setLd({ afternoonSnack: v })} />
                        {(ld.afternoonSnack === '是' || !editingLifestyle) && (
                          <LsText label="下午加餐品类" value={ld.afternoonSnackDesc} editing={editingLifestyle} placeholder="如 酸奶、饼干" onChange={v => setLd({ afternoonSnackDesc: v })} />
                        )}
                      </div>
                    </div>
                    <div style={row2}>
                      <LsText label="晚餐时间" value={ld.dinnerTime} editing={editingLifestyle} placeholder="如 18:30" onChange={v => setLd({ dinnerTime: v })} />
                      <LsRadio label="晚餐就餐方式" value={ld.dinnerDetail} editing={editingLifestyle} options={['居家', '饭店或外卖', '少吃', '不吃']} onChange={v => setLd({ dinnerDetail: v })} />
                      <LsText label="晚餐品类描述" value={ld.dinnerDesc} editing={editingLifestyle} placeholder="如 蔬菜、豆腐、汤" onChange={v => setLd({ dinnerDesc: v })} />
                      <div>
                        <LsRadio label="晚间加餐" value={ld.eveningSnack} editing={editingLifestyle} options={['是', '否']} onChange={v => setLd({ eveningSnack: v })} />
                        {(ld.eveningSnack === '是' || !editingLifestyle) && (
                          <LsText label="晚间加餐品类" value={ld.eveningSnackDesc} editing={editingLifestyle} placeholder="如 牛奶、坚果" onChange={v => setLd({ eveningSnackDesc: v })} />
                        )}
                      </div>
                    </div>

                    <div style={secTitle}>食物摄入量</div>
                    <div style={row3}>
                      <LsRadio label="每日主食摄入量" value={ld.dailyStaple} editing={editingLifestyle} options={['250克以内', '250-400克', '400克以上', '几乎不吃']} onChange={v => setLd({ dailyStaple: v })} />
                      <LsRadio label="每日蔬菜摄入量" value={ld.dailyVegetables} editing={editingLifestyle} options={['500克及以上', '300-500克', '300克以内', '几乎不吃']} onChange={v => setLd({ dailyVegetables: v })} />
                      <LsRadio label="每日荤菜摄入量" value={ld.dailyMeat} editing={editingLifestyle} options={['80克以内', '80-150克', '150克及以上', '几乎不吃']} onChange={v => setLd({ dailyMeat: v })} />
                    </div>
                    <div style={row2}>
                      <LsRadio label="吃水果频次" value={ld.fruitFrequency} editing={editingLifestyle} options={['3天/周及以上', '每天吃', '几乎不吃']} onChange={v => setLd({ fruitFrequency: v })} />
                      <LsRadio label="水果摄入量" value={ld.fruitAmount} editing={editingLifestyle} options={['200克以内', '200-350克', '350克以上']} onChange={v => setLd({ fruitAmount: v })} />
                      <LsRadio label="鸡蛋摄入频次" value={ld.eggFrequency} editing={editingLifestyle} options={['1-3天/周', '3-5天/周', '每天都吃']} onChange={v => setLd({ eggFrequency: v })} />
                      <LsRadio label="鸡蛋摄入量" value={ld.eggAmount} editing={editingLifestyle} options={['1个', '2-3个', '4个以上']} onChange={v => setLd({ eggAmount: v })} />
                      <LsRadio label="奶制品摄入量" value={ld.dairyAmount} editing={editingLifestyle} options={['＜300毫升/天', '300-500毫升/天', '＞500毫升', '几乎不喝']} onChange={v => setLd({ dairyAmount: v })} />
                    </div>
                    <div style={row2}>
                      <LsRadio label="坚果摄入频次" value={ld.nutFrequency} editing={editingLifestyle} options={['一周2-3天', '每天吃', '几乎不吃']} onChange={v => setLd({ nutFrequency: v })} />
                      <LsRadio label="坚果摄入量" value={ld.nutAmount} editing={editingLifestyle} options={['10克', '20-30克', '50克以上']} onChange={v => setLd({ nutAmount: v })} />
                      <LsRadio label="粗杂粮摄入频次" value={ld.grainFrequency} editing={editingLifestyle} options={['每天吃', '1-2天/周', '3天/周及以上', '几乎不吃']} onChange={v => setLd({ grainFrequency: v })} />
                      <LsRadio label="粗杂粮摄入量" value={ld.grainAmount} editing={editingLifestyle} options={['50-100克', '100-200克', '200-250克', '300克以上']} onChange={v => setLd({ grainAmount: v })} />
                    </div>

                    <div style={secTitle}>饮食习惯</div>
                    <div style={row2}>
                      <LsRadio label="忌口" value={ld.dietaryRestrictions} editing={editingLifestyle} options={['无', '有']} onChange={v => setLd({ dietaryRestrictions: v })} />
                      <LsText label="忌口具体说明" value={ld.dietaryRestrictionsDesc} editing={editingLifestyle} placeholder="如 不吃海鲜、不吃辣" onChange={v => setLd({ dietaryRestrictionsDesc: v })} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <LsCheckbox label="不良饮食习惯（可多选）" value={ld.badDietHabits || []} editing={editingLifestyle}
                        options={['三餐不规律', '常吃夜宵', '常吃外卖', '进餐速度过快', '常吃油炸食品', '常吃甜品及含糖饮料', '常吃腌制食品', '常吃动物内脏', '饮食重油', '口味偏咸']}
                        onChange={v => setLd({ badDietHabits: v })} />
                    </div>
                    <LsRadio label="应酬频率" value={ld.entertainment} editing={editingLifestyle} options={['1-2次/周', '3-5次/周', '6-7次/周', '无或偶尔']} onChange={v => setLd({ entertainment: v })} />
                  </div>
                )}

                {/* ── 运动与作息 ── */}
                {lifestyleTab === 'exercise' && (
                  <div>
                    <div style={secTitle}>运动</div>
                    <div style={row3}>
                      <LsText label="运动类型" value={ld.exerciseType} editing={editingLifestyle} placeholder="如 跑步、瑜伽、游泳" onChange={v => setLd({ exerciseType: v })} />
                      <LsRadio label="运动频率" value={ld.exerciseFrequency} editing={editingLifestyle} options={['1-2天/周', '3-5天/周', '6-7天/周', '无']} onChange={v => setLd({ exerciseFrequency: v })} />
                      <LsText label="每次时长（分钟）" value={ld.exerciseDuration} editing={editingLifestyle} placeholder="如 30" onChange={v => setLd({ exerciseDuration: v })} />
                    </div>
                    <div style={secTitle}>作息</div>
                    <div style={row3}>
                      <LsText label="起床时间" value={ld.wakeTime} editing={editingLifestyle} placeholder="如 07:00" onChange={v => setLd({ wakeTime: v })} />
                      <LsText label="入睡时间" value={ld.sleepTime} editing={editingLifestyle} placeholder="如 23:00" onChange={v => setLd({ sleepTime: v })} />
                      <LsRadio label="作息规律性" value={ld.scheduleRegularity} editing={editingLifestyle} options={['规律', '不规律']} onChange={v => setLd({ scheduleRegularity: v })} />
                    </div>
                  </div>
                )}

                {/* ── 烟酒与应酬 ── */}
                {lifestyleTab === 'alcohol' && (
                  <div>
                    <div style={{ marginBottom: 12 }}>
                      <LsRadio label="吸烟情况" value={ld.smokingStatus} editing={editingLifestyle}
                        options={['＜10支/日', '10-20支/日', '20-30支/日', '30支以上/日', '不吸烟', '戒烟']}
                        onChange={v => setLd({ smokingStatus: v })} />
                    </div>
                    <div style={row2}>
                      <LsRadio label="饮酒频率" value={ld.drinkingFrequency} editing={editingLifestyle}
                        options={['＜1天/周', '1-3天/周', '3天/周及以上', '每天喝', '不喝酒']}
                        onChange={v => setLd({ drinkingFrequency: v })} />
                      <LsCheckbox label="饮酒类型" value={ld.drinkingType || []} editing={editingLifestyle}
                        options={['红酒', '白酒', '啤酒', '其它']}
                        onChange={v => setLd({ drinkingType: v })} />
                    </div>
                    <LsRadio label="应酬频率" value={ld.entertainmentFreq} editing={editingLifestyle}
                      options={['1-2次/周', '3-5次/周', '6-7次/周', '无或偶尔']}
                      onChange={v => setLd({ entertainmentFreq: v })} />
                  </div>
                )}

                {/* ── 营养素与过敏 ── */}
                {lifestyleTab === 'nutrition' && (
                  <div>
                    <div style={row3}>
                      <LsText label="营养干预史" value={ld.nutritionHistory} editing={editingLifestyle} placeholder="描述既往营养干预情况" multiline onChange={v => setLd({ nutritionHistory: v })} />
                      <LsText label="每日膳食摄入量评估" value={ld.dailyDietAssessment} editing={editingLifestyle} placeholder="描述" multiline onChange={v => setLd({ dailyDietAssessment: v })} />
                      <LsText label="营养素摄入概况" value={ld.nutrientOverview} editing={editingLifestyle} placeholder="描述" multiline onChange={v => setLd({ nutrientOverview: v })} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <LsCheckbox label="食物过敏源（可多选）" value={ld.foodAllergens || []} editing={editingLifestyle}
                        options={['无', '海鲜', '坚果', '奶制品', '蛋类', '芒果', '其它']}
                        onChange={v => setLd({ foodAllergens: v })} />
                    </div>
                    <div style={row2}>
                      <LsRadio label="麸质过敏" value={ld.glutenAllergy} editing={editingLifestyle} options={['是', '否', '不详']} onChange={v => setLd({ glutenAllergy: v })} />
                      <LsRadio label="每日饮水量" value={ld.dailyWater} editing={editingLifestyle}
                        options={['1500毫升内', '1500-1700毫升', '1800-2000毫升', '2500毫升', '3000毫升以上']}
                        onChange={v => setLd({ dailyWater: v })} />
                    </div>
                    <div style={row2}>
                      <LsRadio label="心理压力" value={ld.psychStress} editing={editingLifestyle}
                        options={['正常', '中等压力/焦虑', '严重抑郁/焦虑']}
                        onChange={v => setLd({ psychStress: v })} />
                      <LsRadio label="排便规律性" value={ld.bowelRegularity} editing={editingLifestyle}
                        options={['规律（1-2次/日）', '偶尔不规律', '便秘/腹泻']}
                        onChange={v => setLd({ bowelRegularity: v })} />
                    </div>
                  </div>
                )}

                {/* ── 综合概述 ── */}
                {lifestyleTab === 'summary' && (
                  <div>
                    <div style={{ fontSize: 13, color: '#4A6558', marginBottom: 10 }}>
                      系统根据填写内容自动生成，医护可手动覆盖编辑。
                    </div>
                    {editingLifestyle ? (
                      <div>
                        <div style={{ marginBottom: 10 }}>
                          <LsText label="手动概述（填写后覆盖自动生成，留空则用自动结果）"
                            value={ld.summaryOverride || ''} editing multiline
                            placeholder="留空则使用自动生成概述"
                            onChange={v => setLd({ summaryOverride: v })} />
                        </div>
                        <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 8 }}>预览（自动生成）：</div>
                        <div style={{ marginTop: 6 }}>
                          {buildLifestyleSummary(ld).length > 0
                            ? buildLifestyleSummary(ld).map((f, i) => (
                                <div key={i} style={{ fontSize: 13, color: '#4A6558', padding: '3px 0' }}>☑ {f}</div>
                              ))
                            : <div style={{ fontSize: 13, color: '#aaa' }}>暂无自动生成内容。</div>
                          }
                        </div>
                      </div>
                    ) : (
                      <div>
                        {ld.summaryOverride ? (
                          <div style={{ fontSize: 13, color: '#1A2B24', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{ld.summaryOverride}</div>
                        ) : (
                          (ld.autoSummaryFlags || buildLifestyleSummary(ld)).length > 0
                            ? (ld.autoSummaryFlags || buildLifestyleSummary(ld)).map((f, i) => (
                                <div key={i} style={{ fontSize: 13, color: '#4A6558', padding: '3px 0' }}>☑ {f}</div>
                              ))
                            : <div style={{ fontSize: 13, color: '#aaa' }}>暂无概述，请先填写各板块信息。</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })()}


        {/* ── 4.3 专项筛查结果（时间轴，按分类） ── */}
        {(() => {
          const CAT_MAP = {
            tumor:          { label: '肿瘤筛查',    color: '#7C3AED' },
            cardiovascular: { label: '心脑血管筛查', color: '#DC3545' },
            brain_vessel:   { label: '心脑血管筛查', color: '#DC3545' },
            chronic:        { label: '慢性病筛查',   color: '#D97706' },
            other_routine:  { label: '其他筛查',    color: '#0077B6' },
            health_promote: { label: '其他筛查',    color: '#0077B6' },
          }
          const CATS = [
            { key: 'tumor',          label: '肿瘤筛查',      color: '#7C3AED' },
            { key: 'cardiovascular', label: '心脑血管筛查',   color: '#DC3545' },
            { key: 'chronic',        label: '慢性病筛查',     color: '#D97706' },
            { key: 'functional',     label: '功能医学检测',   color: '#0891B2' },
            { key: 'other',          label: '其他筛查',      color: '#0077B6' },
          ]
          const grouped = { tumor: [], cardiovascular: [], chronic: [], functional: [], other: [] }
          screeningReports.forEach(r => {
            const cat = r.screeningCategory
            if (cat === 'tumor') grouped.tumor.push(r)
            else if (cat === 'cardiovascular' || cat === 'brain_vessel') grouped.cardiovascular.push(r)
            else if (cat === 'chronic') grouped.chronic.push(r)
            else if (cat === 'functional') grouped.functional.push(r)
            else grouped.other.push(r)
          })
          const hasAny = screeningReports.length > 0
          return (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <div className="card-title">专项筛查结果</div>
                <button className="btn btn-primary btn-sm" onClick={() => setShowScreeningForm(true)}>+ 录入筛查结果</button>
              </div>
              {!hasAny ? (
                <div style={{ padding: 30, textAlign: 'center', color: '#aaa', fontSize: 14 }}>暂无专项筛查记录，点击「录入筛查结果」添加</div>
              ) : (
                <div>
                  {CATS.map(({ key, label, color }) => {
                    const catRecords = grouped[key]
                    if (!catRecords.length) return null
                    // 按 title 分组，每个项目内按时间倒序
                    const byTitle = {}
                    catRecords.forEach(r => {
                      const t = r.title || '未命名'
                      if (!byTitle[t]) byTitle[t] = []
                      byTitle[t].push(r)
                    })
                    Object.values(byTitle).forEach(arr => arr.sort((a, b) => {
                      const da = a.checkDate || a.createdAt || 0
                      const db = b.checkDate || b.createdAt || 0
                      return da < db ? 1 : -1
                    }))
                    return (
                      <div key={key} style={{ marginBottom: 8 }}>
                        <div style={{ padding: '8px 20px', background: '#f5f2ec', fontWeight: 600, fontSize: 13, color, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
                          {label}
                        </div>
                        <div style={{ padding: '0 20px' }}>
                          {Object.entries(byTitle).map(([title, records]) => (
                            <div key={title} style={{ paddingTop: 12, paddingBottom: 4, borderBottom: '1px solid #f0ece4' }}>
                              {/* 项目标题行 */}
                              <div style={{ fontWeight: 600, fontSize: 14, color: '#1A2B24', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ width: 3, height: 14, borderRadius: 2, background: color, display: 'inline-block', flexShrink: 0 }} />
                                {title}
                                <span style={{ fontSize: 11, color: '#8AA89C', fontWeight: 400 }}>（{records.length} 次记录）</span>
                              </div>
                              {/* 时间轴：每次检查结果 */}
                              {records.map((r, i) => {
                                const isExpanded = expandedRecord === r._id
                                const fullUrl = r.fileUrl ? (r.fileUrl.startsWith('/') ? API_ORIGIN + r.fileUrl : r.fileUrl) : null
                                const STATUS_TEXT = { normal: '正常', abnormal: '异常', attention: '注意', unknown: '' }
                                const STATUS_COLOR_MAP = { normal: '#22A06B', abnormal: '#DC3545', attention: '#D97706', unknown: '#8AA89C' }
                                return (
                                  <div key={r._id} style={{ padding: '8px 0 8px 12px', borderLeft: `2px solid ${i === 0 ? color : '#E0D9CE'}`, marginBottom: 4 }}>
                                    {/* 摘要行，可点击展开 */}
                                    <div
                                      onClick={() => setExpandedRecord(isExpanded ? null : r._id)}
                                      style={{ display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
                                    >
                                      <span style={{ fontSize: 12, color: '#aaa', whiteSpace: 'nowrap' }}>{r.checkDate || (r.createdAt && new Date(r.createdAt).toLocaleDateString('zh-CN'))}</span>
                                      {r.hospital && <span style={{ fontSize: 12, color: '#8AA89C' }}>📍 {r.hospital}</span>}
                                      {r.note && <span style={{ fontSize: 13, color: '#4A6558', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.note}</span>}
                                      {r.reportItems?.length > 0 && (
                                        <span style={{ fontSize: 11, color: '#8AA89C', flexShrink: 0 }}>{r.reportItems.length} 项</span>
                                      )}
                                      <span style={{ fontSize: 12, color: '#8AA89C', flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
                                    </div>
                                    {/* 展开详情 */}
                                    {isExpanded && (
                                      <div style={{ marginTop: 10 }}>
                                        {r.note && <div style={{ fontSize: 13, color: '#4A6558', marginBottom: 8 }}>结论：{r.note}</div>}
                                        {r.reportItems?.length > 0 && (
                                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 8 }}>
                                            <thead>
                                              <tr style={{ background: '#f5f2ec' }}>
                                                <th style={{ padding: '5px 10px', textAlign: 'left', fontWeight: 600, color: '#4A6558', borderBottom: '1px solid #E0D9CE' }}>项目</th>
                                                <th style={{ padding: '5px 10px', textAlign: 'left', fontWeight: 600, color: '#4A6558', borderBottom: '1px solid #E0D9CE' }}>结果</th>
                                                <th style={{ padding: '5px 10px', textAlign: 'left', fontWeight: 600, color: '#4A6558', borderBottom: '1px solid #E0D9CE' }}>参考范围</th>
                                                <th style={{ padding: '5px 10px', textAlign: 'left', fontWeight: 600, color: '#4A6558', borderBottom: '1px solid #E0D9CE' }}>状态</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {r.reportItems.map((item, j) => (
                                                <tr key={j} style={{ background: item.status === 'abnormal' ? '#FFF5F5' : 'transparent', borderBottom: '1px solid #f0ece4' }}>
                                                  <td style={{ padding: '5px 10px', color: '#1A2B24' }}>{item.name}</td>
                                                  <td style={{ padding: '5px 10px', fontWeight: 600, color: STATUS_COLOR_MAP[item.status] || '#1A2B24' }}>
                                                    {item.value}{item.unit && <span style={{ fontWeight: 400, color: '#8AA89C', marginLeft: 2 }}>{item.unit}</span>}
                                                  </td>
                                                  <td style={{ padding: '5px 10px', color: '#8AA89C' }}>{item.referenceRange || '-'}</td>
                                                  <td style={{ padding: '5px 10px', color: STATUS_COLOR_MAP[item.status] || '#8AA89C' }}>{STATUS_TEXT[item.status] || '-'}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        )}
                                        {fullUrl && (
                                          <div style={{ marginTop: 8 }}>
                                            {r.mimeType === 'application/pdf' ? (
                                              <a href={fullUrl} target="_blank" rel="noopener noreferrer"
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 20, border: '1px solid #BBF7D0', background: '#F0FDF4', fontSize: 12, color: '#1E6B50', textDecoration: 'none', cursor: 'pointer' }}>
                                                📄 查看报告 PDF
                                              </a>
                                            ) : (
                                              <button onClick={() => setPreviewImageUrl(fullUrl)}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 20, border: '1px solid #BBF7D0', background: '#F0FDF4', fontSize: 12, color: '#1E6B50', cursor: 'pointer' }}>
                                                🖼 查看报告图片
                                              </button>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()}

        {/* 录入筛查结果 Modal */}
        {showScreeningForm && (
          <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowScreeningForm(false) }}>
            <div className="modal" style={{ maxWidth: 560 }}>
              <div className="modal-header">
                <h3 className="modal-title">录入筛查结果</h3>
                <button className="modal-close" onClick={() => setShowScreeningForm(false)}>✕</button>
              </div>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">从检验/检查项目库选择 *</label>
                  <div style={{ position: 'relative' }}>
                    {screeningForm.title ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#E8F5EF', borderRadius: 6, border: '1px solid #BBF7D0' }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: '#1E6B50', flex: 1 }}>{screeningForm.title}</span>
                        <button type="button" style={{ background: 'none', border: 'none', color: '#8AA89C', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
                          onClick={() => { setScreeningForm(f => ({ ...f, title: '' })); setScreeningSearchQ('') }}>✕</button>
                      </div>
                    ) : (
                      <>
                        <input className="form-input" placeholder="输入名称或助记码搜索项目库..." value={screeningSearchQ}
                          onChange={e => {
                            const q = e.target.value; setScreeningSearchQ(q)
                            clearTimeout(screeningSearchTimer.current)
                            if (!q.trim()) { setScreeningSearchResults([]); return }
                            screeningSearchTimer.current = setTimeout(async () => {
                              setScreeningSearching(true)
                              try { const r = await staffAPI.getRequisitionItems(q); setScreeningSearchResults(r.data || []) }
                              catch { setScreeningSearchResults([]) }
                              finally { setScreeningSearching(false) }
                            }, 300)
                          }} />
                        {screeningSearching && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#aaa' }}>搜索中...</span>}
                        {screeningSearchResults.length > 0 && (
                          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999, background: '#fff', border: '1px solid #E0D9CE', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', maxHeight: 180, overflowY: 'auto', marginTop: 4 }}>
                            {screeningSearchResults.map(item => (
                              <div key={item._id} onMouseDown={async () => {
                                setScreeningForm(f => ({ ...f, title: item.name }))
                                setScreeningSearchQ(''); setScreeningSearchResults([])
                                // 自动带出子项目
                                if (item.type === 'labTestPackage' || item.type === 'labTestOrder') {
                                  try {
                                    const r = await staffAPI.getProjectSubItems(item.type, item._id)
                                    if (r.data?.length) setScreeningForm(f => ({ ...f, title: item.name, reportItems: r.data }))
                                  } catch {}
                                }
                              }} style={{ padding: '8px 14px', cursor: 'pointer', fontSize: 13, display: 'flex', gap: 8, borderBottom: '1px solid #f5f5f5' }}
                                onMouseEnter={e => e.currentTarget.style.background = '#f9f7f3'}
                                onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: item.type === 'labTestOrder' ? '#EEF2FF' : '#F0FDF4', color: item.type === 'labTestOrder' ? '#4338CA' : '#166534', fontWeight: 600 }}>{item.typeName}</span>
                                <span style={{ fontWeight: 500 }}>{item.name}</span>
                                {item.mnemonic && <span style={{ color: '#8AA89C', fontSize: 12 }}>{item.mnemonic}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#8AA89C', marginTop: 4 }}>从管理后台检验/检查项目库选择，确保数据统一可追踪</div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">筛查分类 *</label>
                  <select className="form-input" value={screeningForm.screeningCategory}
                    onChange={e => setScreeningForm(f => ({ ...f, screeningCategory: e.target.value }))}>
                    <option value="tumor">肿瘤筛查</option>
                    <option value="cardiovascular">心脑血管筛查</option>
                    <option value="chronic">慢性病筛查</option>
                    <option value="functional">功能医学检测</option>
                    <option value="other_routine">其他筛查</option>
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">检查日期</label>
                    <input className="form-input" type="date" value={screeningForm.checkDate}
                      onChange={e => setScreeningForm(f => ({ ...f, checkDate: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">检查机构</label>
                    <input className="form-input" placeholder="如：北京协和医院" value={screeningForm.hospital}
                      onChange={e => setScreeningForm(f => ({ ...f, hospital: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">主要结论/备注</label>
                  <textarea className="form-input" rows={2} placeholder="如：未见明显异常；左叶结节3mm，建议随访" value={screeningForm.note}
                    onChange={e => setScreeningForm(f => ({ ...f, note: e.target.value }))} />
                </div>
                {/* 具体检验项目 */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>具体检验项目（可选）</label>
                    <button type="button" className="btn btn-secondary btn-sm"
                      onClick={() => setScreeningForm(f => ({ ...f, reportItems: [...f.reportItems, { name: '', value: '', unit: '', referenceRange: '', status: 'normal' }] }))}>
                      + 添加项目
                    </button>
                  </div>
                  {screeningForm.reportItems.length > 0 && (
                    <div style={{ border: '1px solid #E0D9CE', borderRadius: 8, overflow: 'hidden' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr 1fr auto', gap: 0, background: '#f5f2ec', padding: '4px 8px', fontSize: 11, color: '#8AA89C', fontWeight: 600 }}>
                        <span>项目名称</span><span>结果</span><span>单位</span><span>参考范围</span><span>状态</span><span />
                      </div>
                      {screeningForm.reportItems.map((item, idx) => (
                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr 1fr auto', gap: 4, padding: '4px 8px', borderTop: '1px solid #f0ece4', alignItems: 'center' }}>
                          <input className="form-input" style={{ padding: '3px 6px', fontSize: 12 }} placeholder="如 TSH" value={item.name}
                            onChange={e => setScreeningForm(f => { const a = [...f.reportItems]; a[idx] = { ...a[idx], name: e.target.value }; return { ...f, reportItems: a } })} />
                          <input className="form-input" style={{ padding: '3px 6px', fontSize: 12 }} placeholder="如 2.5" value={item.value}
                            onChange={e => setScreeningForm(f => { const a = [...f.reportItems]; a[idx] = { ...a[idx], value: e.target.value }; return { ...f, reportItems: a } })} />
                          <input className="form-input" style={{ padding: '3px 6px', fontSize: 12 }} placeholder="mIU/L" value={item.unit}
                            onChange={e => setScreeningForm(f => { const a = [...f.reportItems]; a[idx] = { ...a[idx], unit: e.target.value }; return { ...f, reportItems: a } })} />
                          <input className="form-input" style={{ padding: '3px 6px', fontSize: 12 }} placeholder="0.27-4.20" value={item.referenceRange}
                            onChange={e => setScreeningForm(f => { const a = [...f.reportItems]; a[idx] = { ...a[idx], referenceRange: e.target.value }; return { ...f, reportItems: a } })} />
                          <select className="form-input" style={{ padding: '3px 4px', fontSize: 12 }} value={item.status}
                            onChange={e => setScreeningForm(f => { const a = [...f.reportItems]; a[idx] = { ...a[idx], status: e.target.value }; return { ...f, reportItems: a } })}>
                            <option value="normal">正常</option>
                            <option value="abnormal">异常</option>
                            <option value="attention">注意</option>
                          </select>
                          <button type="button" style={{ background: 'none', border: 'none', color: '#DC3545', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}
                            onClick={() => setScreeningForm(f => ({ ...f, reportItems: f.reportItems.filter((_, i) => i !== idx) }))}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">上传报告（图片或 PDF，可选）</label>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                    style={{ display: 'none' }}
                    id="screening-file-input"
                    onChange={e => setScreeningFile(e.target.files[0] || null)}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                    <label htmlFor="screening-file-input" style={{ cursor: 'pointer', padding: '6px 14px', borderRadius: 8, border: '1px solid #E0D9CE', background: '#fff', fontSize: 13, color: '#4A6558' }}>
                      选择文件
                    </label>
                    {screeningFile ? (
                      <span style={{ fontSize: 13, color: '#1E6B50' }}>
                        {screeningFile.name}
                        <button onClick={() => setScreeningFile(null)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#DC3545', fontSize: 12 }}>✕</button>
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: '#8AA89C' }}>未选择文件</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={() => setShowScreeningForm(false)}>取消</button>
                <button className="btn btn-primary" onClick={handleSaveScreeningRecord} disabled={screeningSaving}>
                  {screeningSaving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── 体检关键指标 ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title">体检关键指标</div>
            {!editingLabValues ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => { setLabNewRecord(false); setLabForm(user.labValues || {}); setEditingLabValues(true) }}>编辑当前</button>
                <button className="btn btn-primary btn-sm" onClick={() => { setLabNewRecord(true); setLabForm({}); setEditingLabValues(true) }}>+ 新增记录</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {labNewRecord && <span style={{ fontSize: 12, color: '#1E6B50', fontWeight: 600 }}>新增复查记录</span>}
                <button className="btn btn-primary btn-sm" onClick={handleSaveLabValues}>保存</button>
                <button className="btn btn-secondary btn-sm" onClick={() => { setEditingLabValues(false); setLabNewRecord(false); setLabForm(user.labValues || {}) }}>取消</button>
              </div>
            )}
          </div>
          <div style={{ padding: '12px 20px' }}>
            {editingLabValues ? (
              <div>
                <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 12 }}>填写最近一次体检结果（用于健康评分，留空表示正常）</div>
                <div>
                  <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 8, fontWeight: 600 }}>血糖 / 血脂 / 血压</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 20px', marginBottom: 16 }}>
                    <LabField label="空腹血糖 FPG" unit="mmol/L" placeholder="如 5.6" value={labForm.fpg || ''} onChange={e => setLabForm(f => ({ ...f, fpg: e.target.value }))} />
                    <LabField label="糖化血红蛋白 HbA1c" unit="%" placeholder="如 5.4" value={labForm.hba1c || ''} onChange={e => setLabForm(f => ({ ...f, hba1c: e.target.value }))} />
                    <LabField label="总胆固醇 TC" unit="mmol/L" placeholder="如 4.8" value={labForm.tc || ''} onChange={e => setLabForm(f => ({ ...f, tc: e.target.value }))} />
                    <LabField label="低密度脂蛋白 LDL-C" unit="mmol/L" placeholder="如 2.8" value={labForm.ldl || ''} onChange={e => setLabForm(f => ({ ...f, ldl: e.target.value }))} />
                    <LabField label="高密度脂蛋白 HDL-C" unit="mmol/L" placeholder="如 1.3" value={labForm.hdl || ''} onChange={e => setLabForm(f => ({ ...f, hdl: e.target.value }))} />
                    <LabField label="甘油三酯 TG" unit="mmol/L" placeholder="如 1.2" value={labForm.tg || ''} onChange={e => setLabForm(f => ({ ...f, tg: e.target.value }))} />
                    <LabField label="收缩压 SBP" unit="mmHg" placeholder="如 120" value={labForm.sbp || ''} onChange={e => setLabForm(f => ({ ...f, sbp: e.target.value }))} />
                    <LabField label="舒张压 DBP" unit="mmHg" placeholder="如 80" value={labForm.dbp || ''} onChange={e => setLabForm(f => ({ ...f, dbp: e.target.value }))} />
                    <LabField label="腰围" unit="cm" placeholder="如 80" value={labForm.waist || ''} onChange={e => setLabForm(f => ({ ...f, waist: e.target.value }))} />
                  </div>
                  <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 8, fontWeight: 600 }}>肝肾 / 代谢</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 20px', marginBottom: 16 }}>
                    <LabField label="谷丙转氨酶 ALT" unit="U/L" placeholder="如 25" value={labForm.alt || ''} onChange={e => setLabForm(f => ({ ...f, alt: e.target.value }))} />
                    <LabField label="谷草转氨酶 AST" unit="U/L" placeholder="如 22" value={labForm.ast || ''} onChange={e => setLabForm(f => ({ ...f, ast: e.target.value }))} />
                    <LabField label="γ-谷氨酰转肽酶 GGT" unit="U/L" placeholder="如 30" value={labForm.ggt || ''} onChange={e => setLabForm(f => ({ ...f, ggt: e.target.value }))} />
                    <LabField label="尿酸 UA" unit="μmol/L" placeholder="如 350" value={labForm.ua || ''} onChange={e => setLabForm(f => ({ ...f, ua: e.target.value }))} />
                    <LabField label="同型半胱氨酸 Hcy" unit="μmol/L" placeholder="如 10" value={labForm.hcy || ''} onChange={e => setLabForm(f => ({ ...f, hcy: e.target.value }))} />
                    <LabField label="脂蛋白磷脂酶A2 Lp-PLA2" unit="U/L" placeholder="如 180" value={labForm.lpla2 || ''} onChange={e => setLabForm(f => ({ ...f, lpla2: e.target.value }))} />
                    <div>
                      <span style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 3 }}>肾功能（CKD分期）</span>
                      <select className="form-control" value={labForm.ckdStage || ''}
                        onChange={e => setLabForm(f => ({ ...f, ckdStage: e.target.value }))} style={{ fontSize: 13 }}>
                        <option value="">正常/未查</option>
                        <option value="1">1期（轻度）</option>
                        <option value="2">2期（轻中度）</option>
                        <option value="3">3期（中度）</option>
                        <option value="4">4期（重度）</option>
                        <option value="5">5期（终末期）</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 8, fontWeight: 600 }}>超声</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', marginBottom: 16 }}>
                    <LabTextarea label="肝脏超声" placeholder="如：脂肪肝（轻度）" value={labForm.liverUs || ''} onChange={e => setLabForm(f => ({ ...f, liverUs: e.target.value }))} />
                    <LabTextarea label="颈动脉超声" placeholder="如：内膜增厚，IMT 0.9mm" value={labForm.carotiUs || ''} onChange={e => setLabForm(f => ({ ...f, carotiUs: e.target.value }))} />
                  </div>
                  <div>
                    <span style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 3 }}>检测日期</span>
                    <input className="form-control" type="date" value={labForm.labDate || ''}
                      onChange={e => setLabForm(f => ({ ...f, labDate: e.target.value }))} style={{ fontSize: 13, width: 200 }} />
                  </div>
                </div>
              </div>
            ) : (
              <div>
                {user.labValues && Object.keys(user.labValues).some(k => user.labValues[k] && k !== 'labDate') ? (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px 16px' }}>
                      {[
                        ['空腹血糖', user.labValues.fpg, 'mmol/L', 6.1],
                        ['HbA1c', user.labValues.hba1c, '%', 6.5],
                        ['总胆固醇', user.labValues.tc, 'mmol/L', 5.2],
                        ['LDL-C', user.labValues.ldl, 'mmol/L', 3.4],
                        ['HDL-C', user.labValues.hdl, 'mmol/L', null],
                        ['甘油三酯', user.labValues.tg, 'mmol/L', 1.7],
                        ['收缩压', user.labValues.sbp, 'mmHg', 120],
                        ['舒张压', user.labValues.dbp, 'mmHg', 80],
                        ['腰围', user.labValues.waist, 'cm', null],
                        ['ALT', user.labValues.alt, 'U/L', 40],
                        ['AST', user.labValues.ast, 'U/L', 40],
                        ['GGT', user.labValues.ggt, 'U/L', 50],
                        ['尿酸', user.labValues.ua, 'μmol/L', user.gender === '女' ? 360 : 420],
                        ['Hcy', user.labValues.hcy, 'μmol/L', 15],
                        ['Lp-PLA2', user.labValues.lpla2, 'U/L', 200],
                      ].filter(([,v]) => v != null && v !== '').map(([label, val, unit, normal]) => {
                        const isHigh = normal != null && parseFloat(val) > normal
                        return (
                          <div key={label} style={{ padding: '6px 10px', background: isHigh ? '#FEF2F2' : '#f9f7f3', borderRadius: 8, borderLeft: `3px solid ${isHigh ? '#DC3545' : '#22A06B'}` }}>
                            <div style={{ fontSize: 11, color: '#8AA89C' }}>{label}</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: isHigh ? '#DC3545' : '#1A2B24' }}>{val} <span style={{ fontSize: 11, fontWeight: 400 }}>{unit}</span></div>
                          </div>
                        )
                      })}
                    </div>
                    {(user.labValues.liverUs || user.labValues.carotiUs) && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                        {user.labValues.liverUs && <div style={{ padding: '6px 10px', background: '#f9f7f3', borderRadius: 8 }}><span style={{ fontSize: 11, color: '#8AA89C', display: 'block' }}>肝脏超声</span><span style={{ fontSize: 13 }}>{user.labValues.liverUs}</span></div>}
                        {user.labValues.carotiUs && <div style={{ padding: '6px 10px', background: '#f9f7f3', borderRadius: 8 }}><span style={{ fontSize: 11, color: '#8AA89C', display: 'block' }}>颈动脉超声</span><span style={{ fontSize: 13 }}>{user.labValues.carotiUs}</span></div>}
                      </div>
                    )}
                    {user.labValues.labDate && (
                      <div style={{ fontSize: 12, color: '#aaa', marginTop: 8 }}>检测日期：{user.labValues.labDate}</div>
                    )}
                  </div>
                ) : (
                  <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', padding: '12px 0' }}>
                    暂无体检指标记录，点击「+ 新增记录」录入
                  </div>
                )}
                {/* 历史复查记录 */}
                {!editingLabValues && (user.labHistory || []).length > 0 && (
                  <div style={{ marginTop: 12, borderTop: '1px solid #f0ece4', paddingTop: 10 }}>
                    <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 8 }}>历史复查记录（{(user.labHistory || []).length} 条）</div>
                    {[...(user.labHistory || [])].reverse().map((h, i) => (
                      <div key={i} style={{ fontSize: 12, padding: '6px 0', borderBottom: '1px solid #f9f7f3', display: 'flex', flexWrap: 'wrap', gap: '4px 16px', color: '#4A6558' }}>
                        <span style={{ color: '#aaa', minWidth: 90 }}>{h.recordedAt ? new Date(h.recordedAt).toLocaleDateString('zh-CN') : h.labDate || '-'}</span>
                        {h.fpg && <span>血糖:{h.fpg}</span>}
                        {h.tc && <span>TC:{h.tc}</span>}
                        {h.ldl && <span>LDL:{h.ldl}</span>}
                        {h.sbp && <span>血压:{h.sbp}/{h.dbp}</span>}
                        {h.ua && <span>尿酸:{h.ua}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── 4.2 身体成分指标 ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title">身体成分指标</div>
            {!editingBodyComp ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => { setBodyCompNewRecord(false); setBodyCompForm(user.bodyComposition || {}); setEditingBodyComp(true) }}>编辑当前</button>
                <button className="btn btn-primary btn-sm" onClick={() => { setBodyCompNewRecord(true); setBodyCompForm({}); setEditingBodyComp(true) }}>+ 新增记录</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {bodyCompNewRecord && <span style={{ fontSize: 12, color: '#1E6B50', fontWeight: 600 }}>新增测量记录</span>}
                <button className="btn btn-primary btn-sm" onClick={handleSaveBodyComp}>保存</button>
                <button className="btn btn-secondary btn-sm" onClick={() => { setEditingBodyComp(false); setBodyCompNewRecord(false); setBodyCompForm(user.bodyComposition || {}) }}>取消</button>
              </div>
            )}
          </div>
          <div style={{ padding: '12px 20px' }}>
            {editingBodyComp ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 20px' }}>
                {[
                  { label: '骨骼肌量', field: 'skelMuscle', unit: 'kg', placeholder: '如 28.5' },
                  { label: '内脏脂肪等级/指数', field: 'visceralFat', unit: '', placeholder: '如 9级 或 指数110' },
                  { label: '体脂率', field: 'bodyFatRate', unit: '%', placeholder: '如 25.3' },
                ].map(({ label, field, unit, placeholder }) => (
                  <div key={field}>
                    <span style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 3 }}>{label}{unit ? ` (${unit})` : ''}</span>
                    <input className="form-control" value={bodyCompForm[field] || ''} placeholder={placeholder}
                      onChange={e => setBodyCompForm(f => ({ ...f, [field]: e.target.value }))} style={{ fontSize: 13 }} />
                  </div>
                ))}
                <div>
                  <span style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 3 }}>测量日期</span>
                  <input className="form-control" type="date" value={bodyCompForm.measuredAt || ''}
                    onChange={e => setBodyCompForm(f => ({ ...f, measuredAt: e.target.value }))} style={{ fontSize: 13 }} />
                </div>
              </div>
            ) : (
              <div>
                {user.bodyComposition && (user.bodyComposition.skelMuscle || user.bodyComposition.visceralFat || user.bodyComposition.bodyFatRate) ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px 16px' }}>
                    {[
                      ['骨骼肌量', user.bodyComposition.skelMuscle, 'kg'],
                      ['内脏脂肪', user.bodyComposition.visceralFat, ''],
                      ['体脂率', user.bodyComposition.bodyFatRate, '%'],
                    ].filter(([,v]) => v != null && v !== '').map(([label, val, unit]) => (
                      <div key={label} style={{ padding: '6px 10px', background: '#f9f7f3', borderRadius: 8, borderLeft: '3px solid #1E6B50' }}>
                        <div style={{ fontSize: 11, color: '#8AA89C' }}>{label}</div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{val}{unit && <span style={{ fontSize: 11, fontWeight: 400 }}> {unit}</span>}</div>
                      </div>
                    ))}
                    {user.bodyComposition.measuredAt && (
                      <div style={{ fontSize: 12, color: '#aaa', gridColumn: 'span 3', marginTop: 4 }}>测量日期：{user.bodyComposition.measuredAt}</div>
                    )}
                  </div>
                ) : (
                  <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', padding: '12px 0' }}>暂无身体成分数据，点击「编辑」录入</div>
                )}
                {/* 历史记录 */}
                {!editingBodyComp && (user.bodyCompHistory || []).length > 0 && (
                  <div style={{ marginTop: 12, borderTop: '1px solid #f0ece4', paddingTop: 10 }}>
                    <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 8 }}>历史记录（{(user.bodyCompHistory || []).length} 条）</div>
                    {[...(user.bodyCompHistory || [])].reverse().map((h, i) => (
                      <div key={i} style={{ fontSize: 12, color: '#4A6558', padding: '4px 0', borderBottom: '1px solid #f9f7f3', display: 'flex', gap: 16 }}>
                        <span style={{ color: '#aaa', minWidth: 90 }}>{h.recordedAt ? new Date(h.recordedAt).toLocaleDateString('zh-CN') : '-'}</span>
                        {h.skelMuscle && <span>骨骼肌: {h.skelMuscle}kg</span>}
                        {h.visceralFat && <span>内脏脂肪: {h.visceralFat}</span>}
                        {h.bodyFatRate && <span>体脂率: {h.bodyFatRate}%</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── 慢病分级 ── */}
        {user.chronicDiseases?.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <div className="card-title">慢病分级（用于评分）</div>
              {!editingDiseaseSeverity
                ? <button className="btn btn-secondary btn-sm" onClick={() => setEditingDiseaseSeverity(true)}>编辑</button>
                : <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={handleSaveDiseaseSeverity}>保存</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setEditingDiseaseSeverity(false); setSeverityForm(user.chronicDiseaseSeverity || {}) }}>取消</button>
                  </div>
              }
            </div>
            <div style={{ padding: '12px 20px' }}>
              <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 10 }}>设置每种慢性病的严重程度，影响基础健康分扣分幅度</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 20px' }}>
                {user.chronicDiseases.map(disease => (
                  <div key={disease}>
                    <div style={{ fontSize: 13, color: '#1A2B24', fontWeight: 500, marginBottom: 4 }}>{disease}</div>
                    {editingDiseaseSeverity ? (
                      <select className="form-control" style={{ fontSize: 13 }}
                        value={severityForm[disease] || 1}
                        onChange={e => setSeverityForm(f => ({ ...f, [disease]: parseInt(e.target.value) }))}>
                        <option value={1}>一级（早/轻症，无并发症）</option>
                        <option value={2}>二级（中症，有并发症风险）</option>
                        <option value={3}>三级（重症/终末期）</option>
                      </select>
                    ) : (
                      <span style={{ fontSize: 13, color: '#4A6558' }}>
                        {['一级（轻症）','二级（中症）','三级（重症）'][(user.chronicDiseaseSeverity?.[disease] || 1) - 1]}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 健康趋势图 */}
        {recentRecords?.length >= 2 && (() => {
          const byType = {};
          recentRecords.forEach(r => {
            if (!byType[r.type]) byType[r.type] = [];
            const dateStr = new Date(r.recordedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
            let y;
            if (r.type === 'bloodPressure') y = r.extra?.sys || 0;
            else y = parseFloat(r.value) || 0;
            if (y > 0) byType[r.type].push({ x: dateStr, y });
          });
          const TYPE_COLORS = { bloodPressure: '#DC3545', bloodSugar: '#D97706', weight: '#0077B6', heartRate: '#7C3AED', sleep: '#059669', mood: '#B45309' };
          const charts = Object.entries(byType).filter(([, arr]) => arr.length >= 2).reverse();
          if (!charts.length) return null;
          return (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-header"><div className="card-title">健康数据趋势</div></div>
              <div style={{ padding: '12px 16px', overflowX: 'auto' }}>
                {charts.map(([type, arr]) => (
                  <MiniTrendChart key={type} data={[...arr].reverse()} color={TYPE_COLORS[type] || '#1E6B50'} label={RECORD_TYPE_LABEL[type] || type} />
                ))}
              </div>
            </div>
          );
        })()}

        {/* 日常健康打卡数据 */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header"><div className="card-title">日常健康打卡数据（最近30条）</div></div>
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
            <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无健康打卡记录</div>
          )}
        </div>
        </>
      )}

      {/* ── AI Tab ── */}
      {tab === 'ai' && (() => {
        const ais = user.aiHealthSummary || {}
        const hasData = ais.trend || ais.risks || ais.plan
        return (
          <div>
            {/* AI汇总分析 */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <div className="card-title">AI汇总分析</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {!editingAISummary && hasData && (
                    <button className="btn btn-secondary btn-sm" onClick={() => { setAiSummaryForm({ ...ais }); setEditingAISummary(true) }}>编辑</button>
                  )}
                  {editingAISummary && (
                    <>
                      <button className="btn btn-secondary btn-sm" onClick={() => setEditingAISummary(false)}>取消</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleSaveAISummary(false)}>保存草稿</button>
                      <button className="btn btn-primary btn-sm" onClick={() => handleSaveAISummary(true)}>审核确认</button>
                    </>
                  )}
                  <button className="btn btn-primary btn-sm" disabled={aiSummaryLoading} onClick={handleGenerateAISummary}>
                    {aiSummaryLoading ? '生成中...' : (hasData ? '重新生成' : '生成AI分析')}
                  </button>
                </div>
              </div>
              <div style={{ padding: '12px 20px' }}>
                {hasData ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {ais.approvedAt && (
                      <div style={{ fontSize: 12, color: '#22A06B', background: '#E8F5EF', borderRadius: 6, padding: '4px 10px' }}>
                        ✓ 已审核确认 {ais.approvedBy && `by ${ais.approvedBy}`} · {new Date(ais.approvedAt).toLocaleDateString('zh-CN')}
                      </div>
                    )}
                    {[
                      { key: 'trend', label: 'AI汇总分析：健康趋势', color: '#0077B6' },
                      { key: 'risks', label: 'AI汇总分析：风险提示', color: '#DC3545' },
                    ].map(({ key, label, color }) => (
                      <div key={key}>
                        <div style={{ fontSize: 12, color, fontWeight: 600, marginBottom: 4 }}>{label}</div>
                        {editingAISummary ? (
                          <textarea className="form-control" rows={4} value={aiSummaryForm[key] || ''}
                            onChange={e => setAiSummaryForm(f => ({ ...f, [key]: e.target.value }))}
                            style={{ fontSize: 13 }} />
                        ) : (
                          <div style={{ fontSize: 13, color: '#1A2B24', lineHeight: 1.7, background: '#f9f7f3', borderRadius: 8, padding: '8px 12px', whiteSpace: 'pre-wrap', borderLeft: `3px solid ${color}` }}>
                            {ais[key]}
                          </div>
                        )}
                      </div>
                    ))}
                    {ais.generatedAt && (
                      <div style={{ fontSize: 12, color: '#aaa' }}>生成时间：{new Date(ais.generatedAt).toLocaleString('zh-CN')}</div>
                    )}
                  </div>
                ) : (
                  <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', padding: 20 }}>
                    点击「生成AI分析」，自动读取体检指标和健康档案，生成健康趋势分析和风险提示
                  </div>
                )}
              </div>
            </div>

            {/* AI管理方案 */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">AI管理方案</div>
                {!editingAISummary && hasData && ais.plan && (
                  <button className="btn btn-secondary btn-sm" onClick={() => { setAiSummaryForm({ ...ais }); setEditingAISummary(true) }}>编辑方案</button>
                )}
              </div>
              <div style={{ padding: '12px 20px' }}>
                {ais.plan ? (
                  <div>
                    {editingAISummary ? (
                      <textarea className="form-control" rows={8} value={aiSummaryForm.plan || ''}
                        onChange={e => setAiSummaryForm(f => ({ ...f, plan: e.target.value }))}
                        style={{ fontSize: 13 }} />
                    ) : (
                      <div style={{ fontSize: 13, color: '#1A2B24', lineHeight: 1.8, background: '#f9f7f3', borderRadius: 8, padding: '12px 16px', whiteSpace: 'pre-wrap', borderLeft: '3px solid #1E6B50' }}>
                        {ais.plan}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 10 }}>
                      家庭医生/营养师审核确认后方案生效，供客户查阅。
                    </div>
                    {editingAISummary && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditingAISummary(false)}>取消</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleSaveAISummary(false)}>保存草稿</button>
                        <button className="btn btn-primary btn-sm" onClick={() => handleSaveAISummary(true)}>审核确认</button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', padding: 20 }}>
                    请先在「AI汇总分析」中点击「生成AI分析」，系统同步生成管理方案初稿，家庭医生/营养师审核确认后生效。
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Medications Tab ── */}
      {tab === 'medications' && (
        <div>
          {/* 子 tab 切换 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {[{ key: 'med', label: '💊 药物管理' }, { key: 'sup', label: '🥗 营养素管理' }].map(t => (
              <button key={t.key}
                className={`btn btn-sm ${medSubTab === t.key ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setMedSubTab(t.key)}>{t.label}</button>
            ))}
            <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }}
              onClick={() => { if (medSubTab === 'med') { setMedForm({ name:'', brandName:'', dosage:'', method:'口服', frequency:'每日1次', timing:'', startDate:'', endDate:'', purpose:'', note:'' }); setEditingMed(null); setShowMedModal(true) } else { setSupForm({ name:'', brand:'', dosage:'', method:'随餐', frequency:'每日1次', startDate:'', endDate:'', purpose:'', note:'' }); setEditingSup(null); setShowSupModal(true) } }}>
              ＋ 新增{medSubTab === 'med' ? '药物' : '营养素'}
            </button>
          </div>

          {medSubTab === 'med' && (
            <div className="card" style={{ padding: 0 }}>
              {medications.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无用药记录</div>
              ) : (
                <table className="table">
                  <thead><tr><th>药品名称（化学名）</th><th>商品名</th><th>剂量</th><th>用法/频次</th><th>服用目的</th><th>开始日期</th><th>状态</th><th>操作</th></tr></thead>
                  <tbody>
                    {medications.map(m => (
                      <tr key={m._id}>
                        <td style={{ fontWeight: 600 }}>{m.name}</td>
                        <td style={{ color: '#666' }}>{m.brandName || '-'}</td>
                        <td>{m.dosage}</td>
                        <td style={{ fontSize: 12 }}>{m.method} · {m.frequency}{m.timing ? ` · ${m.timing}` : ''}</td>
                        <td style={{ fontSize: 12, color: '#4A6558' }}>{m.purpose || m.note || '-'}</td>
                        <td style={{ fontSize: 12, color: '#8AA89C' }}>{m.startDate || '-'}{m.endDate ? ` → ${m.endDate}` : ''}</td>
                        <td>
                          <span style={{ fontSize: 12, fontWeight: 600, color: m.stopped ? '#aaa' : '#22A06B' }}>
                            {m.stopped ? '已停用' : '服用中'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => {
                              setMedForm({ name: m.name, brandName: m.brandName || '', dosage: m.dosage, method: m.method || '口服', frequency: m.frequency, timing: m.timing || '', startDate: m.startDate || '', endDate: m.endDate || '', purpose: m.purpose || '', note: m.note || '' })
                              setEditingMed(m._id); setShowMedModal(true)
                            }}>编辑</button>
                            {!m.stopped && (
                              <button className="btn btn-sm" style={{ background: '#fff8e1', color: '#D97706', border: '1px solid #D97706' }}
                                onClick={async () => { if (window.confirm('确认停用此药物？')) { await staffAPI.updatePatientMedication(id, m._id, { stopped: true }); loadMedications() } }}>
                                停用
                              </button>
                            )}
                            <button className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc' }}
                              onClick={async () => { if (window.confirm('确认删除？')) { await staffAPI.deletePatientMedication(id, m._id); loadMedications() } }}>
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {medSubTab === 'sup' && (
            <div className="card" style={{ padding: 0 }}>
              {supplements.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无营养素记录</div>
              ) : (
                <table className="table">
                  <thead><tr><th>营养素名称</th><th>品牌</th><th>剂量</th><th>用法/频次</th><th>补充目的</th><th>开始日期</th><th>状态</th><th>操作</th></tr></thead>
                  <tbody>
                    {supplements.map(s => (
                      <tr key={s._id}>
                        <td style={{ fontWeight: 600 }}>{s.name}</td>
                        <td style={{ color: '#666' }}>{s.brand || '-'}</td>
                        <td>{s.dosage}</td>
                        <td style={{ fontSize: 12 }}>{s.method} · {s.frequency}</td>
                        <td style={{ fontSize: 12, color: '#4A6558' }}>{s.purpose || s.note || '-'}</td>
                        <td style={{ fontSize: 12, color: '#8AA89C' }}>{s.startDate || '-'}{s.endDate ? ` → ${s.endDate}` : ''}</td>
                        <td>
                          <span style={{ fontSize: 12, fontWeight: 600, color: s.stopped ? '#aaa' : '#22A06B' }}>
                            {s.stopped ? '已停用' : '补充中'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => {
                              setSupForm({ name: s.name, brand: s.brand || '', dosage: s.dosage, method: s.method || '随餐', frequency: s.frequency, startDate: s.startDate || '', endDate: s.endDate || '', purpose: s.purpose || '', note: s.note || '' })
                              setEditingSup(s._id); setShowSupModal(true)
                            }}>编辑</button>
                            {!s.stopped && (
                              <button className="btn btn-sm" style={{ background: '#fff8e1', color: '#D97706', border: '1px solid #D97706' }}
                                onClick={async () => { if (window.confirm('确认停用？')) { await staffAPI.updatePatientSupplement(id, s._id, { stopped: true }); loadSupplements() } }}>
                                停用
                              </button>
                            )}
                            <button className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc' }}
                              onClick={async () => { if (window.confirm('确认删除？')) { await staffAPI.deletePatientSupplement(id, s._id); loadSupplements() } }}>
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* 新增/编辑药物弹窗 */}
          {showMedModal && (
            <div className="modal-overlay" onClick={() => setShowMedModal(false)}>
              <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h3 className="modal-title">{editingMed ? '编辑药物' : '新增药物'}</h3>
                  <button className="modal-close" onClick={() => setShowMedModal(false)}>✕</button>
                </div>
                <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[
                    { k: 'name', label: '药品化学名 *', full: false, placeholder: '如：苯磺酸氨氯地平' },
                    { k: 'brandName', label: '商品名', full: false, placeholder: '如：络活喜' },
                    { k: 'dosage', label: '剂量 *', full: false, placeholder: '如：5mg' },
                    { k: 'method', label: '用药方式', full: false, placeholder: '如：口服' },
                    { k: 'frequency', label: '频次 *', full: false, placeholder: '如：每日1次' },
                    { k: 'timing', label: '服药时机', full: false, placeholder: '如：早饭后' },
                    { k: 'startDate', label: '开始日期', full: false, type: 'date' },
                    { k: 'endDate', label: '计划结束日期', full: false, type: 'date' },
                    { k: 'purpose', label: '用药目的', full: true, placeholder: '如：控制血压' },
                    { k: 'note', label: '备注', full: true, placeholder: '注意事项' },
                  ].map(({ k, label, full, placeholder, type }) => (
                    <div key={k} className="form-group" style={{ gridColumn: full ? '1/-1' : 'auto', marginBottom: 0 }}>
                      <label className="form-label">{label}</label>
                      <input className="form-input" type={type || 'text'} placeholder={placeholder} value={medForm[k] || ''}
                        onChange={e => setMedForm(f => ({ ...f, [k]: e.target.value }))} />
                    </div>
                  ))}
                </div>
                <div className="modal-footer">
                  <button className="btn btn-ghost" onClick={() => setShowMedModal(false)}>取消</button>
                  <button className="btn btn-primary" disabled={medSaving} onClick={async () => {
                    if (!medForm.name || !medForm.dosage || !medForm.frequency) { toast('请填写必填项'); return }
                    setMedSaving(true)
                    try {
                      if (editingMed) await staffAPI.updatePatientMedication(id, editingMed, medForm)
                      else await staffAPI.createPatientMedication(id, medForm)
                      setShowMedModal(false); loadMedications()
                    } catch (err) { toast(err.message) }
                    finally { setMedSaving(false) }
                  }}>{medSaving ? '保存中...' : '保存'}</button>
                </div>
              </div>
            </div>
          )}

          {/* 新增/编辑营养素弹窗 */}
          {showSupModal && (
            <div className="modal-overlay" onClick={() => setShowSupModal(false)}>
              <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h3 className="modal-title">{editingSup ? '编辑营养素' : '新增营养素'}</h3>
                  <button className="modal-close" onClick={() => setShowSupModal(false)}>✕</button>
                </div>
                <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[
                    { k: 'name', label: '营养素名称 *', full: false, placeholder: '如：维生素C' },
                    { k: 'brand', label: '品牌', full: false, placeholder: '如：汤臣倍健' },
                    { k: 'dosage', label: '剂量 *', full: false, placeholder: '如：500mg' },
                    { k: 'method', label: '使用方式', full: false, placeholder: '如：随餐' },
                    { k: 'frequency', label: '频次 *', full: false, placeholder: '如：每日1次' },
                    { k: 'startDate', label: '开始日期', full: false, type: 'date' },
                    { k: 'endDate', label: '计划结束日期', full: false, type: 'date' },
                    { k: 'purpose', label: '补充目的', full: true, placeholder: '如：提高免疫力' },
                    { k: 'note', label: '备注', full: true, placeholder: '注意事项' },
                  ].map(({ k, label, full, placeholder, type }) => (
                    <div key={k} className="form-group" style={{ gridColumn: full ? '1/-1' : 'auto', marginBottom: 0 }}>
                      <label className="form-label">{label}</label>
                      <input className="form-input" type={type || 'text'} placeholder={placeholder} value={supForm[k] || ''}
                        onChange={e => setSupForm(f => ({ ...f, [k]: e.target.value }))} />
                    </div>
                  ))}
                </div>
                <div className="modal-footer">
                  <button className="btn btn-ghost" onClick={() => setShowSupModal(false)}>取消</button>
                  <button className="btn btn-primary" disabled={medSaving} onClick={async () => {
                    if (!supForm.name || !supForm.dosage || !supForm.frequency) { toast('请填写必填项'); return }
                    setMedSaving(true)
                    try {
                      if (editingSup) await staffAPI.updatePatientSupplement(id, editingSup, supForm)
                      else await staffAPI.createPatientSupplement(id, supForm)
                      setShowSupModal(false); loadSupplements()
                    } catch (err) { toast(err.message) }
                    finally { setMedSaving(false) }
                  }}>{medSaving ? '保存中...' : '保存'}</button>
                </div>
              </div>
            </div>
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
              <thead><tr><th>方案名称</th><th>类型</th><th>状态</th><th>已阅</th><th>已确认</th><th>项目数</th><th>完成</th><th>负责人</th><th>创建时间</th></tr></thead>
              <tbody>
                {plans.map(p => {
                  const done = p.items?.filter(i => i.status === 'completed').length || 0
                  const total = p.items?.length || 0
                  return (
                    <tr key={p._id} style={{ cursor: 'pointer' }}
                      onClick={() => p.isAnnualPlan ? nav(`/patients/${id}/annual-health`) : nav(`/plans/${p._id}`)}>
                      <td style={{ fontWeight: 500, color: '#1E6B50' }}>
                        {p.title}
                        {p.isAnnualPlan && <span style={{ marginLeft: 6, fontSize: 11, color: '#1E6B50', background: '#E8F5EF', padding: '1px 6px', borderRadius: 4 }}>年度</span>}
                      </td>
                      <td><span className="badge badge-info">{PLAN_TYPE_LABEL[p.type] || p.type}</span></td>
                      <td><span style={{ color: PLAN_STATUS_COLOR[p.status], fontWeight: 500, fontSize: 13 }}>{PLAN_STATUS_LABEL[p.status]}</span></td>
                      <td>
                        {p.isAnnualPlan
                          ? <span style={{ fontSize: 12, color: '#8AA89C' }}>-</span>
                          : p.viewedAt
                            ? <span style={{ fontSize: 12, color: '#22A06B', fontWeight: 500 }}>✓ 已阅<br/><span style={{ color: '#aaa', fontWeight: 400 }}>{new Date(p.viewedAt).toLocaleDateString('zh-CN')}</span></span>
                            : <span style={{ fontSize: 12, color: '#D97706' }}>未查阅</span>
                        }
                      </td>
                      <td>
                        {p.confirmedAt
                          ? <span style={{ fontSize: 12, color: '#22A06B', fontWeight: 500 }}>✓ 已确认<br/><span style={{ color: '#aaa', fontWeight: 400 }}>{new Date(p.confirmedAt).toLocaleDateString('zh-CN')}</span></span>
                          : <span style={{ fontSize: 12, color: '#D97706' }}>待确认</span>
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
          </div>
          {followUps.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无随访记录</div>
          ) : (
            <table className="table">
              <thead>
                <tr><th>日期</th><th>方式</th><th>状态</th><th>随访人</th><th>随访内容</th><th>下次随访</th><th>操作</th></tr>
              </thead>
              <tbody>
                {followUps.map(f => (
                  <tr key={f._id} style={{ cursor: 'pointer' }} onClick={() => setFollowUpDetail(f)}>
                    <td style={{ fontSize: 13, color: '#666' }}>{new Date(f.date).toLocaleDateString('zh-CN')}</td>
                    <td><span className="badge badge-info">{TYPE_MAP[f.type] || f.type}</span></td>
                    <td>
                      <span style={{ fontSize: 13, fontWeight: 500, color: STATUS_COLOR[f.status] || '#666' }}>
                        {STATUS_MAP[f.status] || f.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, color: '#666' }}>{f.staffId?.name || '-'}</td>
                    <td style={{ fontSize: 13, color: '#1A2B24', maxWidth: 200 }}>
                      {f.content ? (f.content.length > 60 ? f.content.slice(0, 60) + '…' : f.content) : '-'}
                    </td>
                    <td style={{ fontSize: 12, color: '#8AA89C' }}>
                      {f.nextFollowUpDate ? new Date(f.nextFollowUpDate).toLocaleDateString('zh-CN') : '-'}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setFollowUpDetail(f)}>查看详情</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* 报告图片灯箱 */}
      {previewImageUrl && (
        <div onClick={() => setPreviewImageUrl(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
          <img src={previewImageUrl} alt="报告" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }} onClick={e => e.stopPropagation()} />
          <button onClick={() => setPreviewImageUrl(null)}
            style={{ position: 'absolute', top: 20, right: 24, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ✕
          </button>
        </div>
      )}

      {/* ── Reports Tab ── */}
      {tab === 'reports' && (() => {
        const CAT_LABEL = { tumor: '常见肿瘤筛查', cardiovascular: '心血管筛查', brain_vessel: '脑血管病筛查', chronic: '慢性病筛查', other_routine: '其他常规筛查', health_promote: '健康促进筛查' }
        const CAT_ORDER = ['tumor','cardiovascular','brain_vessel','chronic','other_routine','health_promote']
        const AI_COLOR = { none:'#ccc', pending:'#D97706', reviewed:'#22A06B', rejected:'#DC3545' }
        const AI_LABEL = { none:'未解析', pending:'待审核', reviewed:'已审核', rejected:'已驳回' }
        // 按年份分组
        const yearMap = {}
        reports.forEach(r => {
          const yr = r.reportYear || (r.date ? new Date(r.date).getFullYear() : new Date(r.createdAt).getFullYear()) || '未知'
          if (!yearMap[yr]) yearMap[yr] = {}
          const cat = r.screeningCategory || 'other_routine'
          if (!yearMap[yr][cat]) yearMap[yr][cat] = []
          yearMap[yr][cat].push(r)
        })
        const years = Object.keys(yearMap).sort((a, b) => b - a)
        return (
          <div>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="card-title">体检报告</div>
              <button className="btn btn-primary btn-sm" onClick={() => setShowUploadReport(true)}>＋ 上传报告</button>
            </div>
            {reports.length === 0 ? (
              <div className="card" style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无体检报告</div>
            ) : years.map(yr => (
              <div key={yr} style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#1A2B24', padding: '8px 0', borderBottom: '2px solid #1E6B50', marginBottom: 12 }}>
                  📅 {yr} 年
                </div>
                {CAT_ORDER.filter(cat => yearMap[yr][cat]?.length > 0).map(cat => (
                  <div key={cat} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1E6B50', marginBottom: 8, paddingLeft: 4 }}>▸ {CAT_LABEL[cat] || cat}</div>
                    <table className="table" style={{ marginBottom: 0 }}>
                      <thead><tr><th>报告标题</th><th>机构</th><th>检查日期</th><th>审核状态</th><th>AI解析</th><th>操作</th></tr></thead>
                      <tbody>
                        {yearMap[yr][cat].map(r => (
                          <tr key={r._id}>
                            <td style={{ fontWeight: 500, color: '#1E6B50', cursor: 'pointer' }} onClick={() => openReportDetail(r)}>{r.title}</td>
                            <td style={{ fontSize: 12, color: '#666' }}>{r.institution || r.hospital || '-'}</td>
                            <td style={{ fontSize: 12, color: '#8AA89C' }}>{r.checkDate || r.date || '-'}</td>
                            <td>
                              <span style={{ fontSize: 12, fontWeight: 500, color: r.audit_status === 'audited' ? '#22A06B' : r.audit_status === 'rejected' ? '#DC3545' : '#D97706' }}>
                                {r.audit_status === 'audited' ? '已审核' : r.audit_status === 'rejected' ? '已驳回' : '待审核'}
                              </span>
                            </td>
                            <td>
                              <span style={{ fontSize: 12, fontWeight: 600, color: AI_COLOR[r.aiStatus] || '#ccc' }}>
                                {AI_LABEL[r.aiStatus] || '—'}
                              </span>
                              {r.aiSummary && r.aiStatus === 'pending' && (
                                <div style={{ fontSize: 11, color: '#8AA89C', maxWidth: 180, marginTop: 2 }}>{r.aiSummary.slice(0, 60)}…</div>
                              )}
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {r.audit_status !== 'audited' && (
                                editingTitleReportId === r._id ? (
                                  <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                                    <input style={{ fontSize: 12, padding: '2px 6px', border: '1px solid #E0D9CE', borderRadius: 4, width: 140 }}
                                      value={editingTitleValue}
                                      onChange={e => setEditingTitleValue(e.target.value)}
                                      onKeyDown={async e => {
                                        if (e.key === 'Enter') {
                                          try { await staffAPI.updateReport(r._id, { title: editingTitleValue }); setEditingTitleReportId(null); loadReports() } catch (err) { toast(err.message) }
                                        } else if (e.key === 'Escape') { setEditingTitleReportId(null) }
                                      }} autoFocus />
                                    <button className="btn btn-primary btn-sm"
                                      onClick={async () => { try { await staffAPI.updateReport(r._id, { title: editingTitleValue }); setEditingTitleReportId(null); loadReports() } catch (err) { toast(err.message) } }}>✓</button>
                                    <button className="btn btn-secondary btn-sm" onClick={() => setEditingTitleReportId(null)}>✕</button>
                                  </span>
                                ) : (
                                  <button className="btn btn-secondary btn-sm" style={{ marginRight: 4 }}
                                    onClick={() => { setEditingTitleReportId(r._id); setEditingTitleValue(r.title) }}>改标题</button>
                                )
                              )}
                              {r.aiStatus === 'pending' && (
                                <>
                                  <button className="btn btn-primary btn-sm" style={{ marginRight: 4 }}
                                    onClick={async () => { try { await staffAPI.updateReport(r._id, { aiStatus: 'reviewed' }); loadReports() } catch (e) { toast(e.message) } }}>批准AI</button>
                                  <button className="btn btn-sm" style={{ background:'#fee', color:'#c00', border:'1px solid #fcc', marginRight: 4 }}
                                    onClick={async () => { try { await staffAPI.updateReport(r._id, { aiStatus: 'rejected' }); loadReports() } catch (e) { toast(e.message) } }}>驳回</button>
                                </>
                              )}
                              <button className="btn btn-secondary btn-sm" onClick={() => openReportDetail(r)}>查看</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )
      })()}

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

      {/* ── Orders Tab ── */}
      {/* ── 消费记录 Tab（需求17：合并服务订单+收费管理）── */}
      {tab === 'consumption' && (() => {
        const ORDER_STATUS = { pending:'待安排', scheduled:'已安排', completed:'已完成', cancelled:'已取消' }
        const ORDER_STATUS_COLOR = { pending:'#D97706', scheduled:'#0077B6', completed:'#22A06B', cancelled:'#DC3545' }
        const thisYear = new Date().getFullYear()
        const yearOrders = patientOrders.filter(o => new Date(o.createdAt).getFullYear() === thisYear)
        const yearTotal  = yearOrders.reduce((s, o) => s + (o.servicePrice || 0), 0)
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 账户概览 */}
            <div className="card">
              <div className="card-header"><div className="card-title">账户概览</div></div>
              <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                {[
                  { label: '健康基金余额', value: `¥${(user.healthFundBalance || 0).toFixed(2)}`, color: '#1E6B50' },
                  { label: `${thisYear}年消费总额`, value: `¥${yearTotal.toFixed(2)}`, color: '#DC3545' },
                  { label: '服务包', value: getServicePackageLabel(user.servicePackage) || '未购买', color: '#0077B6' },
                  { label: '服务到期', value: user.serviceExpiry ? new Date(user.serviceExpiry).toLocaleDateString('zh-CN') : '-', color: '#D97706' },
                ].map(item => (
                  <div key={item.label} style={{ padding: 14, background: '#f9f7f3', borderRadius: 10, textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 服务购买记录 */}
            <div className="card">
              <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="card-title">服务购买记录</div>
                <span style={{ fontSize: 12, color: '#8AA89C' }}>待安排 {patientOrders.filter(o => o.status === 'pending').length} 条</span>
              </div>
              {patientOrders.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#aaa' }}>暂无购买记录</div>
              ) : (
                <table className="table">
                  <thead><tr><th>产品名称</th><th>金额</th><th>下单时间</th><th>状态</th><th>操作</th></tr></thead>
                  <tbody>
                    {patientOrders.map(order => (
                      <tr key={order._id}>
                        <td style={{ fontWeight: 500 }}>{order.serviceName || order.serviceId}</td>
                        <td style={{ color: '#D97706', fontWeight: 600 }}>
                          {order.servicePrice != null ? `¥${order.servicePrice}` : '-'}
                        </td>
                        <td style={{ fontSize: 13, color: '#8AA89C' }}>{new Date(order.createdAt).toLocaleDateString('zh-CN')}</td>
                        <td>
                          <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 99, fontWeight: 600,
                            background: (ORDER_STATUS_COLOR[order.status] || '#aaa') + '20',
                            color: ORDER_STATUS_COLOR[order.status] || '#aaa' }}>
                            {ORDER_STATUS[order.status] || order.status}
                          </span>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {order.status === 'pending' && (
                            <button className="btn btn-primary btn-sm" onClick={async () => {
                              try {
                                await staffAPI.startOrder(order._id, { action: 'schedule' })
                                setPatientOrders(prev => prev.map(o => o._id === order._id ? { ...o, status: 'scheduled', scheduledAt: new Date().toISOString() } : o))
                                toast('已安排服务')
                              } catch (err) { toast(err.message || '操作失败') }
                            }}>启动服务</button>
                          )}
                          {order.status === 'scheduled' && (
                            <button className="btn btn-sm" style={{ background: '#22A06B', color: '#fff', border: 'none' }} onClick={async () => {
                              try {
                                await staffAPI.startOrder(order._id, { action: 'complete' })
                                setPatientOrders(prev => prev.map(o => o._id === order._id ? { ...o, status: 'completed' } : o))
                                toast('服务已完成')
                              } catch (err) { toast(err.message || '操作失败') }
                            }}>标记完成</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* 健康基金收支 */}
            <div className="card">
              <div className="card-header"><div className="card-title">健康基金</div></div>
              <div className="card-body">
                <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                  <div style={{ flex: 1, padding: 14, background: '#E8F5EF', borderRadius: 10, textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: '#1E6B50', marginBottom: 4 }}>当前余额</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#1E6B50' }}>¥{(user.healthFundBalance || 0).toFixed(2)}</div>
                  </div>
                  <div style={{ flex: 1, padding: 14, background: '#FEF3E2', borderRadius: 10, textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: '#D97706', marginBottom: 4 }}>充值余额</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#D97706' }}>¥{(user.rechargeBalance || 0).toFixed(2)}</div>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: '#8AA89C', textAlign: 'center' }}>健康基金收支明细请在财务模块管理</div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Family Tab ── */}
      {tab === 'family' && (
        <FamilyTab patientId={id} user={user} onRefresh={load} />
      )}

      {/* ── Membership Tab ── */}
      {tab === 'membership' && (
        <MembershipPanel user={user} patientId={id} onRefresh={load} />
      )}

      {/* 随访详情弹窗 */}
      {followUpDetail && (
        <div className="modal-overlay" onClick={() => setFollowUpDetail(null)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">随访详情</h3>
              <button className="modal-close" onClick={() => setFollowUpDetail(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* 基本信息 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { label: '随访日期', value: new Date(followUpDetail.date).toLocaleDateString('zh-CN') },
                  { label: '随访方式', value: TYPE_MAP[followUpDetail.type] || followUpDetail.type || '-' },
                  { label: '随访状态', value: STATUS_MAP[followUpDetail.status] || followUpDetail.status || '-' },
                  { label: '随访人员', value: followUpDetail.staffId?.name || '-' },
                  { label: '参与人员', value: followUpDetail.participants || '-' },
                  { label: '随访主题', value: followUpDetail.theme || followUpDetail.planName || '-' },
                  { label: '下次随访', value: followUpDetail.nextFollowUpDate ? new Date(followUpDetail.nextFollowUpDate).toLocaleDateString('zh-CN') : '-' },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 14, color: '#1A2B24', fontWeight: 500 }}>{value}</div>
                  </div>
                ))}
              </div>
              {/* 随访内容 */}
              {followUpDetail.content && (
                <div>
                  <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 6 }}>随访内容</div>
                  <div style={{ background: '#f9f7f3', borderRadius: 8, padding: '10px 14px', fontSize: 14, color: '#1A2B24', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    {followUpDetail.content}
                  </div>
                </div>
              )}
              {/* 面谈纪要（上门/面谈时显示） */}
              {followUpDetail.interviewMinutes && (
                <div>
                  <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 6 }}>面谈纪要</div>
                  <div style={{ background: '#f0f8f4', borderRadius: 8, padding: '10px 14px', fontSize: 14, color: '#1A2B24', lineHeight: 1.7, whiteSpace: 'pre-wrap', borderLeft: '3px solid #1E6B50' }}>
                    {followUpDetail.interviewMinutes}
                  </div>
                </div>
              )}
              {/* 打卡项目 */}
              {followUpDetail.checkInItems?.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 6 }}>打卡项目</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {followUpDetail.checkInItems.map((item, i) => (
                      <span key={i} style={{ padding: '2px 10px', borderRadius: 99, background: '#E8F5EF', color: '#1E6B50', fontSize: 12, fontWeight: 500 }}>{item}</span>
                    ))}
                  </div>
                </div>
              )}
              {/* 表单内容（formData） */}
              {followUpDetail.formData && Object.keys(followUpDetail.formData).length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 6 }}>表单内容</div>
                  <div style={{ background: '#f9f7f3', borderRadius: 8, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {Object.entries(followUpDetail.formData).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', gap: 8 }}>
                        <span style={{ fontSize: 12, color: '#8AA89C', minWidth: 80 }}>{k}</span>
                        <span style={{ fontSize: 13, color: '#1A2B24', flex: 1 }}>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* 备注 */}
              {followUpDetail.notes && (
                <div>
                  <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 6 }}>备注</div>
                  <div style={{ fontSize: 13, color: '#4A6558' }}>{followUpDetail.notes}</div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setFollowUpDetail(null)}>关闭</button>
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
          <div className="modal" style={{ maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ flexShrink: 0 }}>
              <h3 className="modal-title">{showReportDetail.title}</h3>
              <button className="modal-close" onClick={() => setShowReportDetail(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ overflowY: 'auto', flex: 1 }}>
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
                    <img src={showReportDetail.content || showReportDetail.fileUrl} alt="报告" style={{ maxWidth: '100%', maxHeight: '55vh', objectFit: 'contain', borderRadius: 8, border: '1px solid #f0ece4', display: 'block' }} />
                  ) : showReportDetail.mimeType === 'application/pdf' || showReportDetail.fileUrl?.endsWith('.pdf') ? (
                    <iframe src={showReportDetail.content || showReportDetail.fileUrl} title="PDF报告" style={{ width: '100%', height: 400, border: '1px solid #f0ece4', borderRadius: 8 }} />
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
          onSaved={() => {
            setShowReqModal(false)
            toast('开单已创建，请上传对应报告')
            loadRequisitions()
            setTab('requisitions')
          }}
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
          <InfoRow label="服务包" value={getServicePackageLabel(user.servicePackage)} />
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
  diet: '饮食', exercise: '运动', water: '饮水',
  alcohol: '饮酒', bowel: '排便', smoking: '吸烟',
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
// 中文展示名 → 后端 enum 值
const REPORT_TYPE_MAP = {
  '血常规': 'blood', '尿常规': 'other', '生化全套': 'blood',
  '血脂': 'blood', '血糖': 'blood', '肝功能': 'blood', '肾功能': 'blood',
  '心电图': 'ecg', '胸片': 'radiology', '腹部B超': 'ultrasound',
  '甲状腺B超': 'ultrasound', 'CT': 'radiology', 'MRI': 'mri',
  '功能医学检测': 'functional', '基因检测': 'genetic', '其他': 'other',
}

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

// ── 家庭成员 Tab ────────────────────────────────────────────────────
function FamilyTab({ patientId, user, onRefresh }) {
  const toast = useToast()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [addResults, setAddResults] = useState([])
  const [addRelation, setAddRelation] = useState('')
  const [addTarget, setAddTarget] = useState(null)
  const [saving, setSaving] = useState(false)
  const searchTimer = useRef(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await staffAPI.getPatientFamilyLinks(patientId)
      setMembers(res.data || [])
    } catch { setMembers([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [patientId])

  const handleSearch = (kw) => {
    setAddSearch(kw)
    setAddTarget(null)
    clearTimeout(searchTimer.current)
    if (!kw.trim()) { setAddResults([]); return }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await staffAPI.getPatients({ search: kw, limit: 20 })
        setAddResults((res.data.patients || []).filter(p => p._id !== patientId))
      } catch { setAddResults([]) }
    }, 300)
  }

  const handleAdd = async () => {
    if (!addTarget) { toast('请先搜索并选择会员'); return }
    if (!addRelation.trim()) { toast('请填写关系'); return }
    setSaving(true)
    try {
      await staffAPI.addFamilyLink(patientId, { linkedUserId: addTarget._id, relation: addRelation })
      toast('已添加家庭成员')
      setShowAdd(false); setAddSearch(''); setAddResults([]); setAddTarget(null); setAddRelation('')
      load()
    } catch (err) { toast(err.message || '添加失败') }
    finally { setSaving(false) }
  }

  const handleRemove = async (linkId) => {
    if (!window.confirm('确定移除此家庭成员关联？')) return
    try {
      await staffAPI.removeFamilyLink(patientId, linkId)
      toast('已移除')
      load()
    } catch (err) { toast(err.message || '移除失败') }
  }

  const calcAge = (birthDate) => {
    if (!birthDate) return '-'
    const birth = new Date(birthDate)
    if (isNaN(birth)) return '-'
    const today = new Date()
    let age = today.getFullYear() - birth.getFullYear()
    if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--
    return age >= 0 ? `${age}岁` : '-'
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      {/* 家庭联系人 */}
      <div className="card">
        <div className="card-header"><div className="card-title">紧急联系人</div></div>
        <div className="card-body">
          <InfoRow label="联系人" value={user.contactName || '-'} />
          <InfoRow label="联系电话" value={user.contactPhone2 || user.contactPhone3 || '-'} />
          <InfoRow label="家庭医师" value={user.assignedFamilyDoctor?.name || '-'} />
          <InfoRow label="家庭医师职称" value={user.assignedFamilyDoctor?.title || '-'} />
        </div>
      </div>

      {/* 系统内家庭成员 */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">家庭成员（系统内客户）</div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(v => !v)}>＋ 添加成员</button>
        </div>
        <div className="card-body">
          {showAdd && (
            <div style={{ background: '#f9f7f3', borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <div className="form-group">
                <label className="form-label">搜索会员（姓名/手机号）</label>
                <input className="form-input" value={addSearch} onChange={e => handleSearch(e.target.value)} placeholder="输入姓名或手机号..." autoComplete="off" />
                {addResults.length > 0 && !addTarget && (
                  <div style={{ border: '1px solid #E0D9CE', borderRadius: 8, marginTop: 4, maxHeight: 160, overflowY: 'auto', background: '#fff' }}>
                    {addResults.map(p => (
                      <div key={p._id} onClick={() => { setAddTarget(p); setAddSearch(`${p.name}  ${p.phone}`) }}
                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f5f2ec' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f9f7f3'}
                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                        <strong>{p.name}</strong><span style={{ color: '#8AA89C', marginLeft: 8 }}>{p.phone}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">关系</label>
                <input className="form-input" value={addRelation} onChange={e => setAddRelation(e.target.value)} placeholder="如：配偶、父亲、母亲、子女..." />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => { setShowAdd(false); setAddSearch(''); setAddResults([]); setAddTarget(null); setAddRelation('') }}>取消</button>
                <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={saving}>{saving ? '添加中...' : '确认添加'}</button>
              </div>
            </div>
          )}

          {loading ? <div style={{ color: '#aaa', padding: '12px 0', fontSize: 13 }}>加载中...</div>
          : members.length === 0 ? <div style={{ color: '#aaa', fontSize: 13, padding: '8px 0' }}>暂无关联家庭成员</div>
          : members.map(m => {
            const linked = m.linkedUser
            return (
              <div key={m._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f5f2ec' }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{linked?.name || '-'}</span>
                  <span style={{ color: '#8AA89C', fontSize: 12, marginLeft: 8 }}>{m.relation}</span>
                  <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>
                    {linked?.gender || ''}{linked?.gender ? ' · ' : ''}{linked?.birthDate ? calcAge(linked.birthDate) : ''}{linked?.phone ? ' · ' + linked.phone : ''}
                  </div>
                </div>
                <button className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc', fontSize: 12 }}
                  onClick={() => handleRemove(m._id)}>移除</button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}


// -- InitialHealthRecordForm component
function InitialHealthRecordForm({ patientId, onSaved, toast: toastFn }) {
  const [open, setOpen] = React.useState(false)
  const [type, setType] = React.useState('bloodPressure')
  const [saving, setSaving] = React.useState(false)

  const TYPES = [
    { key: 'bloodPressure', label: '血压',  unit: 'mmHg',   kind: 'bp' },
    { key: 'bloodSugar',    label: '血糖',  unit: 'mmol/L', kind: 'num', placeholder: '如 5.8' },
    { key: 'heartRate',     label: '心率',  unit: '次/分',  kind: 'num', placeholder: '如 72' },
    { key: 'weight',        label: '体重',  unit: 'kg',     kind: 'num', placeholder: '如 65.0' },
    { key: 'sleep',         label: '睡眠',  unit: '小时',   kind: 'sleep' },
    { key: 'diet',          label: '饮食',  unit: '',       kind: 'text', placeholder: '如：三餐规律，以主食蔬菜为主，少油少盐' },
    { key: 'exercise',      label: '运动',  unit: '',       kind: 'text', placeholder: '如：跑步，每周3次，每次30分钟' },
    { key: 'water',         label: '饮水',  unit: '',       kind: 'text', placeholder: '如：白水为主，每日约2000毫升' },
    { key: 'bowel',         label: '排便',  unit: '',       kind: 'text', placeholder: '如：1次/日，成形，无特殊' },
    { key: 'smoking',       label: '吸烟',  unit: '',       kind: 'text', placeholder: '如：不吸烟 / 每日10支，2010年起' },
    { key: 'alcohol',       label: '饮酒',  unit: '',       kind: 'text', placeholder: '如：红酒，每次100ml，每周1次' },
  ]

  const initVals = () => Object.fromEntries(TYPES.map(t =>
    [t.key, t.kind === 'bp' ? { sys: '', dia: '' } : t.kind === 'sleep' ? { sleepTime: '', wakeTime: '' } : { val: '' }]
  ))

  const [vals, setVals] = React.useState(initVals)
  const setField = (field, v) => setVals(p => ({ ...p, [type]: { ...p[type], [field]: v } }))
  const reset = () => setVals(initVals())

  const curType = TYPES.find(t => t.key === type)

  const handleSave = async () => {
    let value, extra = {}
    const cur = vals[type]
    if (curType.kind === 'bp') {
      if (!cur.sys || !cur.dia) { toastFn('请填写收缩压和舒张压'); return }
      value = cur.sys + '/' + cur.dia
      extra = { sys: Number(cur.sys), dia: Number(cur.dia) }
    } else if (curType.kind === 'sleep') {
      if (!cur.sleepTime || !cur.wakeTime) { toastFn('请填写入睡和起床时间'); return }
      const [sh, sm] = cur.sleepTime.split(':').map(Number)
      const [wh, wm] = cur.wakeTime.split(':').map(Number)
      const dur = ((wh * 60 + wm) - (sh * 60 + sm) + 1440) % 1440 / 60
      value = dur.toFixed(1)
      extra = { sleepTime: cur.sleepTime, wakeTime: cur.wakeTime }
    } else {
      if (!cur.val) { toastFn('请填写内容'); return }
      value = cur.val
    }
    setSaving(true)
    try {
      await staffAPI.createPatientHealthRecord(patientId, { type, value, extra })
      toastFn('健康数据已录入，已同步到用户端')
      reset(); setOpen(false); onSaved()
    } catch (e) { toastFn(e.message || '录入失败') }
    finally { setSaving(false) }
  }

  if (!open) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>初始健康数据录入</div>
            <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 2 }}>录入后直接同步到用户端，格式与用户打卡完全一致</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>+ 录入数据</button>
        </div>
      </div>
    )
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header">
        <div className="card-title">初始健康数据录入</div>
        <button className="btn btn-secondary btn-sm" onClick={() => { setOpen(false); reset() }}>取消</button>
      </div>
      <div className="card-body">
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 6 }}>数据类型</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TYPES.map(t => (
              <button key={t.key}
                className={'btn btn-sm ' + (type === t.key ? 'btn-primary' : 'btn-secondary')}
                onClick={() => setType(t.key)}>{t.label}</button>
            ))}
          </div>
        </div>

        {curType.kind === 'bp' && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>收缩压（高压）</label>
              <input className="form-control" type="number" placeholder="如 120" value={vals.bloodPressure.sys}
                onChange={e => setField('sys', e.target.value)} style={{ width: 120 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>舒张压（低压）</label>
              <input className="form-control" type="number" placeholder="如 80" value={vals.bloodPressure.dia}
                onChange={e => setField('dia', e.target.value)} style={{ width: 120 }} />
            </div>
            <span style={{ color: '#8AA89C', fontSize: 13, marginBottom: 8 }}>mmHg</span>
          </div>
        )}

        {curType.kind === 'sleep' && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>入睡时间</label>
              <input className="form-control" type="time" value={vals.sleep.sleepTime}
                onChange={e => setField('sleepTime', e.target.value)} style={{ width: 130 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>起床时间</label>
              <input className="form-control" type="time" value={vals.sleep.wakeTime}
                onChange={e => setField('wakeTime', e.target.value)} style={{ width: 130 }} />
            </div>
          </div>
        )}

        {curType.kind === 'num' && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>{curType.label}</label>
              <input className="form-control" type="number" step="0.1" value={vals[type].val}
                onChange={e => setField('val', e.target.value)} style={{ width: 150 }}
                placeholder={curType.placeholder} />
            </div>
            <span style={{ color: '#8AA89C', fontSize: 13, marginBottom: 8 }}>{curType.unit}</span>
          </div>
        )}

        {curType.kind === 'text' && (
          <div>
            <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>{curType.label}</label>
            <textarea className="form-control" rows={2} value={vals[type].val}
              onChange={e => setField('val', e.target.value)}
              placeholder={curType.placeholder}
              style={{ width: '100%' }} />
          </div>
        )}

        <button className="btn btn-primary" style={{ marginTop: 12 }}
          onClick={handleSave} disabled={saving}>
          {saving ? '录入中...' : '确认录入'}
        </button>
      </div>
    </div>
  )
}
