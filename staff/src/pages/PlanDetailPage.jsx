import React, { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { staffAPI, API_ORIGIN } from '../api'
import { useToast, useStaff } from '../App'
import AiRuleHint from '../components/AiRuleHint'

// 方案类型 → AI 规则说明场景
const PLAN_AI_SCENE = {
  nutrition: 'nutrition_plan',
  checkup: 'checkup_plan', annual_checkup: 'checkup_plan',
  annual_mgmt: 'annual_plan', health: 'annual_plan',
}

// 部分方案类型只归特定角色编辑（跟后端 PLAN_TYPE_OWNER_ROLE 对齐）：
// 年度体检/年度管理方案只有家庭医生，营养干预方案只有营养师
const PLAN_TYPE_OWNER_ROLE = { annual_checkup: 'familyDoctor', annual_mgmt: 'familyDoctor', nutrition: 'nutritionist' }
function canEditPlanType(planType, staffRole) {
  const requiredRole = PLAN_TYPE_OWNER_ROLE[planType]
  if (!requiredRole) return true
  return staffRole === 'superadmin' || staffRole === requiredRole
}

const TYPE_LABEL = { checkup:'体检方案', health:'健康管理方案', followup:'随访计划', nutrition:'营养干预方案', rehab:'运动康复方案', tcm:'中医方案', annual_checkup:'年度体检方案', annual_mgmt:'年度管理方案', medical_assist:'就医协助方案', psychology:'心理咨询方案' }
const STATUS_LABEL = { draft:'草稿', active:'已推送', completed:'已完成', cancelled:'已取消' }

// 就医协助模板 → 图标/颜色，用于详情页顶部醒目展示"当前是哪种标准化服务"
// （跟年度管理方案顶部 activePlanType 徽章同一视觉语言，2026-07-13反馈"模版就是为了标准化"，
// 只用小字提示不够，专员和客户都要能一眼看出这是哪个模板/SOP）
const MEDICAL_ASSIST_TEMPLATE_META = [
  { match: /代配药|代取药/,       icon: '💊', color: '#0077B6', bg: '#E3F2FB' },
  { match: /代约检/,             icon: '📋', color: '#0077B6', bg: '#E3F2FB' },
  { match: /医疗代诊/,           icon: '🩺', color: '#7C3AED', bg: '#F2EEFF' },
  { match: /陪同就医|陪同治疗/,   icon: '🤝', color: '#1E6B50', bg: '#E8F5EF' },
  { match: /陪同检查|陪同体检/,   icon: '🔬', color: '#1E6B50', bg: '#E8F5EF' },
  { match: /健康体检/,           icon: '📅', color: '#0077B6', bg: '#E3F2FB' },
  { match: /一站式|住院/,        icon: '⭐', color: '#D97706', bg: '#FEF3E2' },
  { match: /咨询/,               icon: '💬', color: '#9D174D', bg: '#FCE7F3' },
]
const DEFAULT_ASSIST_META = { icon: '🏥', color: '#7C3AED', bg: '#F2EEFF' }
function getAssistTemplateMeta(templateName) {
  if (!templateName) return DEFAULT_ASSIST_META
  return MEDICAL_ASSIST_TEMPLATE_META.find(m => m.match.test(templateName)) || DEFAULT_ASSIST_META
}
const ITEM_STATUS = { pending:'待完成', completed:'已完成', skipped:'已跳过' }
const ITEM_STATUS_COLOR = { pending:'#D97706', completed:'#22A06B', skipped:'#aaa' }

const ITEM_CATEGORIES = ['检验检查', '影像检查', '功能医学检测', '体格检查', '问诊咨询', '营养干预', '运动康复', '心理评估', '中医调理', '生活方式', '其他']

// getRequisitionItems 返回的 item.type 取值(labTestOrder/specialExam/functionalTest/labTestPackage) → 分类名+itemType映射
const REQUISITION_TYPE_META = {
  labTestOrder:    { label: '检验', category: '检验检查', itemType: 'labTest' },
  specialExam:     { label: '检查', category: '影像检查', itemType: 'specialExam' },
  functionalTest:  { label: '功能医学', category: '功能医学检测', itemType: 'functionalTest' },
  labTestPackage:  { label: '套餐', category: '检验检查', itemType: 'labTest' },
}
function requisitionTypeMeta(t) { return REQUISITION_TYPE_META[t] || REQUISITION_TYPE_META.specialExam }

function AddItemPanel({ plan, onAdded, onCancel }) {
  const toast = useToast()
  const [searchQ, setSearchQ]     = useState('')
  const [results, setResults]     = useState([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected]   = useState(null)  // { name, itemId, itemType, category }
  const [showDropdown, setShowDropdown] = useState(false)
  const [form, setForm] = useState({ name: '', category: '', scheduledDate: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const searchTimer = useRef(null)
  const dropRef = useRef(null)

  // 点击外部关闭下拉
  useEffect(() => {
    const handler = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setShowDropdown(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // 搜索检验库
  const handleSearch = (q) => {
    setSearchQ(q)
    setSelected(null)
    setForm(f => ({ ...f, name: q }))
    clearTimeout(searchTimer.current)
    if (!q.trim()) { setResults([]); setShowDropdown(false); return }
    searchTimer.current = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await staffAPI.getRequisitionItems(q)
        setResults(r.data || [])
        setShowDropdown(true)
      } catch { }
      finally { setSearching(false) }
    }, 300)
  }

  const selectItem = (item) => {
    setSelected(item)
    setSearchQ(item.name)
    setForm(f => ({
      ...f,
      name:     item.name,
      category: requisitionTypeMeta(item.type).category,
    }))
    setShowDropdown(false)
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleAdd = async () => {
    if (!form.name) { toast('项目名称不能为空'); return }
    const dup = (plan.items || []).some(it => it.name.trim() === form.name.trim())
    if (dup && !window.confirm(`「${form.name}」已在方案中，确认仍要重复添加？`)) return
    setSaving(true)
    try {
      const newItem = {
        name:          form.name,
        category:      form.category,
        scheduledDate: form.scheduledDate || null,
        notes:         form.notes,
        itemId:        selected?.id || null,
        itemType:      selected ? requisitionTypeMeta(selected.type).itemType : '',
      }
      await staffAPI.updatePlan(plan._id, { items: [...(plan.items || []), newItem] })
      toast('已添加')
      onAdded()
    } catch (err) { toast(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0ece4', background: '#f9f7f3' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1.2fr auto', gap: 10, alignItems: 'flex-end' }}>

        {/* 项目名称（搜索+手填） */}
        <div ref={dropRef} style={{ position: 'relative' }}>
          <label className="form-label" style={{ fontSize: 11 }}>项目名称 *</label>
          <input
            className="form-input"
            placeholder="搜索检验/检查库或手动填写"
            value={searchQ}
            onChange={e => handleSearch(e.target.value)}
            onFocus={() => results.length && setShowDropdown(true)}
            autoComplete="off"
          />
          {searching && <div style={{ position: 'absolute', right: 8, top: 32, fontSize: 11, color: '#aaa' }}>搜索中...</div>}
          {showDropdown && results.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
              background: '#fff', border: '1px solid #e0d9ce', borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,0.12)', maxHeight: 200, overflowY: 'auto',
            }}>
              {results.map(item => (
                <div key={item.id} onMouseDown={() => selectItem(item)}
                  style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f5f2ec' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f5f2ec'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <span style={{ fontWeight: 500 }}>{item.name}</span>
                  <span style={{ marginLeft: 8, fontSize: 11, color: '#8AA89C', background: '#f0ece4', padding: '1px 5px', borderRadius: 3 }}>
                    {requisitionTypeMeta(item.type).label}
                  </span>
                  {item.category && <span style={{ marginLeft: 4, fontSize: 11, color: '#aaa' }}>{item.category}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 分类 */}
        <div>
          <label className="form-label" style={{ fontSize: 11 }}>任务分类</label>
          <select className="form-input" value={form.category} onChange={e => set('category', e.target.value)}>
            <option value="">请选择</option>
            {ITEM_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* 计划日期 */}
        <div>
          <label className="form-label" style={{ fontSize: 11 }}>计划日期</label>
          <input className="form-input" type="date" value={form.scheduledDate} onChange={e => set('scheduledDate', e.target.value)} />
        </div>

        {/* 注意事项 */}
        <div>
          <label className="form-label" style={{ fontSize: 11 }}>注意事项</label>
          <input className="form-input" placeholder="可选" value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>

        <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={saving} style={{ height: 38 }}>
          {saving ? '...' : '添加'}
        </button>
      </div>

      {selected && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#1E6B50' }}>
          ✓ 已关联检验库：{selected.name}（{requisitionTypeMeta(selected.type).label}）
        </div>
      )}

      <div style={{ marginTop: 8, textAlign: 'right' }}>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>取消</button>
      </div>
    </div>
  )
}

export default function PlanDetailPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { staff } = useStaff()
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAddItem, setShowAddItem] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [planDrafting, setPlanDrafting] = useState(false)  // 场景七：AI润色方案描述
  const [editingItemId, setEditingItemId] = useState(null)
  const [editingItemForm, setEditingItemForm] = useState({})

  const load = async () => {
    try { const r = await staffAPI.getPlan(id); setPlan(r.data) }
    catch { toast('加载失败') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [id])

  const handlePush = async () => {
    if (!window.confirm('确认推送此方案给会员？')) return
    try { await staffAPI.pushPlan(id); toast('方案已推送'); load() }
    catch (err) { toast(err.message) }
  }

  const handleAdoptAI = async () => {
    try {
      await staffAPI.updatePlan(id, { content: { ...plan.content, aiStatus: 'adopted' } })
      toast('已采纳，方案保留为草稿，确认无误后可推送给会员')
      load()
    } catch (err) { toast(err.message) }
  }

  const handleRejectAI = async () => {
    if (!window.confirm('确认拒绝并删除此AI方案？')) return
    try { await staffAPI.deletePlan(id); toast('已删除'); nav(-1) }
    catch (err) { toast(err.message) }
  }

  const handleItemStatus = async (itemId, status) => {
    try { await staffAPI.updatePlanItem(id, itemId, { status }); load() }
    catch (err) { toast(err.message) }
  }

  const handleDeleteItem = async (itemId, name) => {
    if (!window.confirm(`确认删除方案项目「${name}」？`)) return
    try {
      const items = (plan.items || []).filter(it => it._id !== itemId)
      await staffAPI.updatePlan(id, { items })
      toast('已删除')
      load()
    } catch (err) { toast(err.message) }
  }

  const startEditItem = (item) => {
    setEditingItemId(item._id)
    setEditingItemForm({
      name: item.name || '',
      category: item.category || '',
      scheduledDate: item.scheduledDate ? new Date(item.scheduledDate).toISOString().slice(0, 10) : '',
      notes: item.notes || '',
    })
  }

  const saveEditItem = async () => {
    if (!editingItemForm.name) { toast('项目名称不能为空'); return }
    try {
      const items = (plan.items || []).map(it => it._id === editingItemId
        ? { ...it, ...editingItemForm, scheduledDate: editingItemForm.scheduledDate || null }
        : it)
      await staffAPI.updatePlan(id, { items })
      toast('已保存')
      setEditingItemId(null)
      load()
    } catch (err) { toast(err.message) }
  }

  const handleDelete = async () => {
    if (!window.confirm('确定删除此方案？')) return
    try { await staffAPI.deletePlan(id); toast('已删除'); nav('/plans') }
    catch (err) { toast(err.message) }
  }

  const handleResetToDraft = async () => {
    if (!window.confirm('将方案重置为草稿状态，修改后可重新推送给会员。确认？')) return
    try {
      await staffAPI.updatePlan(id, { status: 'draft' })
      toast('已重置为草稿，可修改后重新推送')
      load()
    } catch (err) { toast(err.message) }
  }

  const handleComplete = async () => {
    if (!window.confirm('确认此方案已服务完毕？标记完成后会从会员端"进行中"列表移除，不可再推送。')) return
    try {
      await staffAPI.updatePlan(id, { status: 'completed' })
      toast('已标记完成')
      load()
    } catch (err) { toast(err.message) }
  }

  const startEdit = () => {
    const base = { title: plan.title, description: plan.description || '', notes: plan.notes || '' }
    if (plan.type === 'medical_assist') {
      const c = plan.content || {}
      Object.assign(base, {
        hospital: c.hospital || '', department: c.department || '', expert: c.expert || '',
        hotel: c.hotel || '', transport: c.transport || '', tasks: c.tasks || '',
      })
    }
    setEditForm(base)
    setEditMode(true)
  }

  // 场景七：AI 润色方案描述
  const handleAIDraftDesc = async () => {
    const pid = plan?.patientId?._id || plan?.patientId
    if (!pid) { toast('缺少会员信息'); return }
    const keypoints = [
      editForm.title && `方案标题：${editForm.title}`,
      editForm.description && `现有描述：${editForm.description}`,
      (plan.items || []).length && `方案项目：${(plan.items || []).map(i => i.name).filter(Boolean).join('、')}`,
      editForm.notes && `备注：${editForm.notes}`,
    ].filter(Boolean).join('；') || (editForm.title || '健康管理方案')
    setPlanDrafting(true)
    try {
      const r = await staffAPI.generateAIDraft(pid, 'plan_desc', { keypoints })
      setEditForm(f => ({ ...f, description: r.data.draft }))
      toast('AI草稿已生成，请审核修改')
    } catch (err) { toast(err.message || 'AI生成失败') }
    finally { setPlanDrafting(false) }
  }

  const saveEdit = async () => {
    if (!editForm.title?.trim()) { toast('方案标题不能为空'); return }
    setSaving(true)
    try {
      const { hospital, department, expert, hotel, transport, tasks, ...rest } = editForm
      const payload = { ...rest }
      if (plan.type === 'medical_assist') {
        payload.content = { ...(plan.content || {}), hospital, department, expert, hotel, transport, tasks }
      }
      await staffAPI.updatePlan(id, payload)
      toast('已保存')
      setEditMode(false)
      load()
    } catch (err) { toast(err.message) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="page-loading">加载中...</div>
  if (!plan) return <div className="page">方案不存在</div>

  const canEdit = canEditPlanType(plan.type, staff?.role)
  const completedCount = plan.items?.filter(i => i.status === 'completed').length || 0
  const progress = plan.items?.length ? Math.round((completedCount / plan.items.length) * 100) : 0
  const assistMeta = plan.type === 'medical_assist' ? getAssistTemplateMeta(plan.content?.templateName) : null

  // 按分类分组显示
  const groupedItems = {}
  ;(plan.items || []).forEach((item, idx) => {
    const cat = item.category || '未分类'
    if (!groupedItems[cat]) groupedItems[cat] = []
    groupedItems[cat].push({ ...item, _idx: idx })
  })

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => nav('/plans')}>← 返回方案列表</button>
          {plan.patientId?._id && (
            <button className="btn btn-secondary btn-sm" onClick={() => nav(`/patients/${plan.patientId._id}`)}>↩ 返回会员详情</button>
          )}
          <div>
            <h1 className="page-title">{plan.title}</h1>
            <p className="page-subtitle">{TYPE_LABEL[plan.type]} · {plan.patientId?.name} · {plan.year}年</p>
          </div>
          {assistMeta && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 20, fontSize: 14, fontWeight: 700,
              color: assistMeta.color, background: assistMeta.bg, border: `1.5px solid ${assistMeta.color}`,
            }}>
              {assistMeta.icon} {plan.content?.templateName || '就医协助（无匹配模板）'}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!canEdit && (
            <span style={{ fontSize: 12, color: '#8AA89C', alignSelf: 'center' }}>
              {TYPE_LABEL[plan.type]}仅{plan.type === 'nutrition' ? '营养师' : '家庭医生'}可编辑，你当前只能查看
            </span>
          )}
          {canEdit && plan.content?.aiStatus === 'pending' && (
            <>
              <span style={{ fontSize: 12, color: '#D97706', alignSelf: 'center', background: '#FFF8F0', border: '1px solid #D97706', padding: '3px 10px', borderRadius: 6 }}>✨ AI生成草稿，待审核</span>
              <button className="btn btn-primary btn-sm" onClick={handleAdoptAI}>✅ 采纳方案</button>
              <button className="btn btn-secondary btn-sm" style={{ color: '#DC3545', borderColor: '#DC3545' }} onClick={handleRejectAI}>❌ 拒绝删除</button>
            </>
          )}
          {canEdit && plan.status === 'draft' && !editMode && (
            <button className="btn btn-secondary" onClick={startEdit}>✏️ 编辑信息</button>
          )}
          {canEdit && plan.status === 'draft' && (
            <button className="btn btn-primary" onClick={handlePush}>📤 推送给会员</button>
          )}
          {canEdit && plan.status === 'active' && (
            <button className="btn btn-secondary" onClick={handleResetToDraft}>✏️ 重新编辑</button>
          )}
          {canEdit && plan.status === 'active' && (
            <button className="btn btn-primary" onClick={handlePush}>📤 重新推送</button>
          )}
          {canEdit && plan.status === 'active' && (
            <button className="btn btn-primary" style={{ background: '#22A06B', borderColor: '#22A06B' }} onClick={handleComplete}>✔️ 标记完成</button>
          )}
          {plan.status === 'completed' && (
            <span style={{ fontSize: 12, color: '#22A06B', alignSelf: 'center', background: '#E8F5EF', border: '1px solid #22A06B', padding: '3px 10px', borderRadius: 6 }}>✔️ 服务已完成</span>
          )}
          {canEdit && <button className="btn btn-secondary" onClick={handleDelete}>删除</button>}
        </div>
      </div>

      {PLAN_AI_SCENE[plan.type] && <AiRuleHint scene={PLAN_AI_SCENE[plan.type]} />}

      {/* 标准动作（模板SOP，只读）——直接来自模板原始骨架，不经AI改写，跟下方"本次个性化安排"分开陈列，
          避免模板标准动作和AI针对该患者的个性化内容混在一起分不清（2026-07-13反馈"模版就是为了标准化"） */}
      {plan.type === 'medical_assist' && plan.content?.templateSnapshot && (
        <div className="card" style={{ marginBottom: 20, borderColor: assistMeta?.color, borderWidth: 1.5 }}>
          <div className="card-header" style={{ background: assistMeta?.bg }}>
            <div className="card-title" style={{ color: assistMeta?.color }}>
              {assistMeta?.icon} 标准动作 · {plan.content.templateName}
            </div>
            <span style={{ fontSize: 11, color: '#8AA89C' }}>模板固定内容，仅供参考</span>
          </div>
          <div className="card-body" style={{ display: 'grid', gap: 10 }}>
            {[
              ['服务步骤', plan.content.templateSnapshot.tasks],
              ['住宿安排', plan.content.templateSnapshot.hotel],
              ['交通安排', plan.content.templateSnapshot.transport],
              ['注意事项模板', plan.content.templateSnapshot.notes],
            ].filter(([, v]) => !!v).map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 3 }}>{k}</div>
                <div style={{ fontSize: 13, color: '#4A6558', whiteSpace: 'pre-wrap', lineHeight: 1.6, background: '#FAFAF8', borderRadius: 6, padding: '8px 10px' }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 基本信息 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div className="card">
          <div className="card-header"><div className="card-title">方案信息</div></div>
          <div className="card-body">
            {editMode ? (
              <>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label">方案标题 *</label>
                  <input className="form-input" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />
                </div>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <label className="form-label" style={{ margin: 0 }}>方案描述</label>
                    <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: 12, padding: '2px 10px' }}
                      onClick={handleAIDraftDesc} disabled={planDrafting}>
                      {planDrafting ? '生成中...' : '✨ AI生成草稿'}
                    </button>
                  </div>
                  <textarea className="form-input" rows={3} placeholder="方案整体说明..." value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                {plan.type === 'medical_assist' && (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1A2B24', marginBottom: 10, paddingTop: 4, borderTop: '1px dashed #E0D9CE' }}>
                      ✏️ 本次个性化安排
                      <span style={{ fontSize: 11, fontWeight: 400, color: '#8AA89C', marginLeft: 8 }}>针对该患者的具体内容，可按需调整</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div className="form-group" style={{ marginBottom: 12, flex: 1 }}>
                        <label className="form-label">就诊医院</label>
                        <input className="form-input" value={editForm.hospital} onChange={e => setEditForm(f => ({ ...f, hospital: e.target.value }))} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 12, flex: 1 }}>
                        <label className="form-label">科室</label>
                        <input className="form-input" value={editForm.department} onChange={e => setEditForm(f => ({ ...f, department: e.target.value }))} />
                      </div>
                    </div>
                    <div className="form-group" style={{ marginBottom: 12 }}>
                      <label className="form-label">专家</label>
                      <input className="form-input" value={editForm.expert} onChange={e => setEditForm(f => ({ ...f, expert: e.target.value }))} />
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div className="form-group" style={{ marginBottom: 12, flex: 1 }}>
                        <label className="form-label">住宿安排</label>
                        <textarea className="form-input" rows={2} value={editForm.hotel} onChange={e => setEditForm(f => ({ ...f, hotel: e.target.value }))} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 12, flex: 1 }}>
                        <label className="form-label">交通安排</label>
                        <textarea className="form-input" rows={2} value={editForm.transport} onChange={e => setEditForm(f => ({ ...f, transport: e.target.value }))} />
                      </div>
                    </div>
                    <div className="form-group" style={{ marginBottom: 12 }}>
                      <label className="form-label">服务事项（每行一项）</label>
                      <textarea className="form-input" rows={4} value={editForm.tasks} onChange={e => setEditForm(f => ({ ...f, tasks: e.target.value }))} />
                    </div>
                  </>
                )}
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label className="form-label">备注</label>
                  <textarea className="form-input" rows={2} placeholder="补充备注..." value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditMode(false)} disabled={saving}>取消</button>
                  <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={saving}>{saving ? '保存中...' : '保存'}</button>
                </div>
              </>
            ) : (
              <>
                {[
                  ['会员', plan.patientId?.name + ' · ' + plan.patientId?.phone],
                  ['类型', TYPE_LABEL[plan.type]],
                  ['状态', plan.confirmedAt ? '已确认' : STATUS_LABEL[plan.status]],
                  ['年度', plan.year + ' 年'],
                  ['制定人', plan.staffId?.name],
                  ['推送时间', plan.pushedAt ? new Date(plan.pushedAt).toLocaleDateString('zh-CN') : '未推送'],
                  ...(plan.confirmedAt ? [['会员确认时间', new Date(plan.confirmedAt).toLocaleDateString('zh-CN')]] : []),
                  ...(plan.description ? [['描述', plan.description]] : []),
                  ...(plan.notes ? [['备注', plan.notes]] : []),
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f5f2ec', fontSize: 14 }}>
                    <span style={{ color: '#8AA89C' }}>{k}</span>
                    <span style={{ fontWeight: 500, maxWidth: '65%', textAlign: 'right', whiteSpace: 'pre-wrap' }}>{v}</span>
                  </div>
                ))}
                {plan.type === 'medical_assist' && (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1A2B24', marginTop: 14, marginBottom: 4, paddingTop: 10, borderTop: '1px dashed #E0D9CE' }}>
                      ✏️ 本次个性化安排
                    </div>
                    {[
                      ['就诊医院', plan.content?.hospital],
                      ['科室', plan.content?.department],
                      ['专家', plan.content?.expert],
                      ['住宿安排', plan.content?.hotel],
                      ['交通安排', plan.content?.transport],
                      ['服务事项', plan.content?.tasks],
                    ].filter(([, v]) => !!v).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f5f2ec', fontSize: 14 }}>
                        <span style={{ color: '#8AA89C' }}>{k}</span>
                        <span style={{ fontWeight: 500, maxWidth: '65%', textAlign: 'right', whiteSpace: 'pre-wrap' }}>{v}</span>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">执行进度</div></div>
          <div className="card-body">
            <div style={{ fontSize: 36, fontWeight: 800, color: '#1E6B50', marginBottom: 8 }}>{progress}%</div>
            <div style={{ height: 8, background: '#f0f0f0', borderRadius: 4, marginBottom: 12 }}>
              <div style={{ width: `${progress}%`, height: '100%', background: '#1E6B50', borderRadius: 4, transition: 'width 0.3s' }} />
            </div>
            <div style={{ fontSize: 14, color: '#666' }}>{completedCount} / {plan.items?.length || 0} 项已完成</div>
            {plan.description && <p style={{ marginTop: 12, fontSize: 13, color: '#4A6558', lineHeight: 1.6 }}>{plan.description}</p>}
          </div>
        </div>
      </div>

      {/* 方案项目列表 */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">方案项目</div>
          {canEdit && <button className="btn btn-primary btn-sm" onClick={() => setShowAddItem(!showAddItem)}>＋ 添加项目</button>}
        </div>

        {canEdit && showAddItem && (
          <AddItemPanel plan={plan} onAdded={() => { setShowAddItem(false); load() }} onCancel={() => setShowAddItem(false)} />
        )}

        {!plan.items?.length ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#aaa', fontSize: 14 }}>暂无项目，点击"添加项目"开始</div>
        ) : (
          <>
            {Object.entries(groupedItems).map(([cat, items]) => (
              <div key={cat}>
                <div style={{ padding: '8px 20px', background: '#f9f7f3', borderBottom: '1px solid #f0ece4', fontSize: 12, fontWeight: 600, color: '#4A6558' }}>
                  {cat} <span style={{ fontWeight: 400, color: '#aaa' }}>（{items.length} 项）</span>
                </div>
                <table className="table">
                  <thead><tr>
                    <th>#</th><th>项目名称</th><th>计划日期</th><th>注意事项</th><th>状态</th><th>操作</th>
                  </tr></thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={item._id}>
                        <td style={{ color: '#aaa' }}>{item._idx + 1}</td>
                        <td>
                          <strong>{item.name}</strong>
                          {/* 套餐基础项/AI加项明确区分，加项的"检查意义"在下方"注意事项"列展示（2026-07-17需求） */}
                          {item.itemGroup === 'base' && (
                            <span style={{ marginLeft: 6, fontSize: 11, color: '#4A6558', background: '#EFEBE3', padding: '1px 5px', borderRadius: 3 }}>基础项</span>
                          )}
                          {item.itemGroup === 'addon' && (
                            <span style={{ marginLeft: 6, fontSize: 11, color: '#7C3AED', background: '#F3EEFF', padding: '1px 5px', borderRadius: 3 }}>✨ 加项</span>
                          )}
                          {/* 2026-07-07修复：此前只判断itemType非空就显示"已关联库"，但历史数据/生成失败场景
                              可能itemType有值而itemId是null(其实没有真正关联到具体医嘱库条目)，
                              导致展示"假关联"。改成itemId和itemType都存在才算真正关联；未关联的（AI生成的
                              项目名在admin医嘱库里找不到匹配）不自动新建库条目（避免污染正式库），
                              标"待人工关联"提示健管/医生手动去库里核对或新建 */}
                          {item.itemId && item.itemType && (
                            <span style={{ marginLeft: 6, fontSize: 11, color: '#8AA89C', background: '#f0ece4', padding: '1px 5px', borderRadius: 3 }}>已关联库</span>
                          )}
                          {/* 待人工关联标签只在体检方案(涉及医嘱库匹配)展示，营养方案等类型的items本来
                              就不走医嘱库关联逻辑，itemId天然为空，不应误标"待关联" */}
                          {!item.itemId && plan.type === 'annual_checkup' && (
                            <span style={{ marginLeft: 6, fontSize: 11, color: '#D97706', background: '#FEF3E2', padding: '1px 5px', borderRadius: 3 }}>待人工关联</span>
                          )}
                        </td>
                        <td style={{ fontSize: 13, color: '#666' }}>{item.scheduledDate ? new Date(item.scheduledDate).toLocaleDateString('zh-CN') : '-'}</td>
                        <td style={{ maxWidth: 220, fontSize: 12, color: '#8AA89C', whiteSpace: 'pre-wrap' }}>{item.notes || '-'}</td>
                        <td>
                          <span style={{ color: ITEM_STATUS_COLOR[item.status], fontWeight: 500, fontSize: 13 }}>
                            {ITEM_STATUS[item.status]}
                          </span>
                          {item.completedAt && <div style={{ fontSize: 11, color: '#aaa' }}>{new Date(item.completedAt).toLocaleDateString('zh-CN')}</div>}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {item.status === 'pending' && (
                            <button className="btn btn-secondary btn-sm" style={{ marginRight: 4 }} onClick={() => handleItemStatus(item._id, 'completed')}>✓ 完成</button>
                          )}
                          {item.status === 'completed' && (
                            <button className="btn btn-secondary btn-sm" style={{ marginRight: 4 }} onClick={() => handleItemStatus(item._id, 'pending')}>撤销</button>
                          )}
                          {canEdit && <button className="btn btn-secondary btn-sm" style={{ marginRight: 4 }} onClick={() => startEditItem(item)}>编辑</button>}
                          {canEdit && (
                            <button className="btn btn-sm" style={{ color: '#DC3545', background: 'none', border: 'none', cursor: 'pointer' }}
                              onClick={() => handleDeleteItem(item._id, item.name)}>删除</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </>
        )}
      </div>

      {/* AI体检方案讨论区：家庭医生对加项/未加项有疑问可留言，AI结合本次方案内容回应
          （2026-07-17需求：如新增了更年期相关检查需求但方案未调整，医生可在此提出疑问并让AI解释/修正）*/}
      {plan.type === 'annual_checkup' && (
        <PlanDiscussionPanel planId={plan._id} discussions={plan.content?.discussions || []} staff={staff} onRefresh={load} />
      )}

      {/* 方案项目编辑弹窗——注意事项是可能写详细建议的长文本(如营养方案早餐建议)，
          之前用行内单行input，2026-07-07反馈"编辑框太小"，改成弹窗+textarea */}
      {editingItemId && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setEditingItemId(null) }}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">编辑方案项目</h3>
              <button className="modal-close" onClick={() => setEditingItemId(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: 14 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">项目名称 *</label>
                <input className="form-input" value={editingItemForm.name}
                  onChange={e => setEditingItemForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">计划日期</label>
                <input className="form-input" type="date" value={editingItemForm.scheduledDate}
                  onChange={e => setEditingItemForm(f => ({ ...f, scheduledDate: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">注意事项 / 具体建议</label>
                <textarea className="form-input" rows={6} placeholder="具体可执行的建议内容..."
                  style={{ resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit' }}
                  value={editingItemForm.notes}
                  onChange={e => setEditingItemForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setEditingItemId(null)}>取消</button>
              <button className="btn btn-primary" onClick={saveEditItem}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// AI体检方案讨论区：家庭医生对加项/未加项有疑问可留言，AI结合方案内容回应，支持发图（截图说明）
function PlanDiscussionPanel({ planId, discussions, staff, onRefresh }) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [images, setImages] = useState([])
  const [uploadingImg, setUploadingImg] = useState(false)
  const [posting, setPosting] = useState(false)
  const [aiReplying, setAiReplying] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)
  const list = Array.isArray(discussions) ? discussions : []

  const handlePickImage = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingImg(true)
    try {
      const data = await staffAPI.uploadReportFile(file, () => {})
      setImages(prev => [...prev, data.url])
    } catch (err) { toast(err.message || '图片上传失败') }
    finally { setUploadingImg(false) }
  }

  const handlePost = async () => {
    if (!text.trim() && images.length === 0) return
    setPosting(true)
    try {
      await staffAPI.addPlanDiscussion(planId, text.trim(), images)
      setText(''); setImages([])
      onRefresh()
    } catch (err) { toast(err.message || '发布失败'); setPosting(false); return }
    setAiReplying(true)
    try {
      await staffAPI.generatePlanDiscussionReply(planId)
      onRefresh()
    } catch (err) { toast(err.message || 'AI回应失败') }
    finally { setPosting(false); setAiReplying(false) }
  }

  const handleDelete = async (idx) => {
    if (!window.confirm('确认删除这条留言？')) return
    try { await staffAPI.deletePlanDiscussion(planId, idx); toast('已删除'); onRefresh() }
    catch (err) { toast(err.message || '删除失败') }
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px 10px', borderBottom: '1px solid #F0EDE7' }}>
        <span style={{ fontSize: 17 }}>💬</span>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#1A2B24', flex: 1 }}>方案讨论</span>
        <span style={{ fontSize: 12, color: '#8AA89C' }}>{list.length} 条留言</span>
      </div>
      <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.length === 0 ? (
          <div style={{ fontSize: 13, color: '#8AA89C' }}>对方案的加项/未加项有疑问，或有新的检查需求觉得方案没跟上，可在此留言，AI会结合本次方案内容解释或给出修正建议</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {list.map((d, i) => {
              const isOwner = staff?._id && d.staffId && String(d.staffId) === String(staff._id)
              return (
                <div key={i} style={{
                  background: d.isAI ? '#EFF8FF' : '#F9F6F0',
                  borderLeft: d.isAI ? '3px solid #0077B6' : 'none',
                  borderRadius: 8, padding: '10px 14px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: d.isAI ? '#0077B6' : '#4A6558' }}>
                      {d.isAI ? '✨ ' : ''}{d.staffName}{d.staffRole ? ` · ${d.staffRole}` : ''}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: '#8AA89C' }}>{d.createdAt ? new Date(d.createdAt).toLocaleString('zh-CN') : ''}</span>
                      {(isOwner || staff?.role === 'superadmin') && (
                        <span onClick={() => handleDelete(i)} style={{ fontSize: 11, color: '#DC3545', cursor: 'pointer' }}>删除</span>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: '#1A2B24', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{d.content}</div>
                  {Array.isArray(d.images) && d.images.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      {d.images.map((img, ii) => {
                        const src = img.startsWith('/') ? API_ORIGIN + img : img
                        return (
                          <img key={ii} src={src} alt="留言图片" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, cursor: 'zoom-in', border: '1px solid #E0D9CE' }}
                            onClick={() => setPreviewUrl(src)} />
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {aiReplying && (
          <div style={{ fontSize: 12, color: '#0077B6', display: 'flex', alignItems: 'center', gap: 6 }}>✨ AI思考中...</div>
        )}
        {images.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {images.map((img, ii) => {
              const src = img.startsWith('/') ? API_ORIGIN + img : img
              return (
                <div key={ii} style={{ position: 'relative' }}>
                  <img src={src} alt="待发送图片" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid #E0D9CE' }} />
                  <span onClick={() => setImages(prev => prev.filter((_, x) => x !== ii))}
                    style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: '#DC3545', color: '#fff', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>✕</span>
                </div>
              )
            })}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <textarea className="form-input" rows={2} style={{ flex: 1, resize: 'vertical' }}
            placeholder="对方案有疑问、觉得漏了什么检查需求，AI会自动回复...（可截图说明）" value={text} onChange={e => setText(e.target.value)} />
          <label className="btn btn-secondary btn-sm" style={{ cursor: uploadingImg ? 'not-allowed' : 'pointer', opacity: uploadingImg ? 0.6 : 1 }}>
            {uploadingImg ? '上传中...' : '📷 图片'}
            <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploadingImg} onChange={handlePickImage} />
          </label>
          <button className="btn btn-primary btn-sm" disabled={posting || (!text.trim() && images.length === 0)} onClick={handlePost}>
            {posting ? (aiReplying ? 'AI回复中...' : '发布中...') : '发布'}
          </button>
        </div>
      </div>
      {previewUrl && (
        <div onClick={() => setPreviewUrl(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
          <img src={previewUrl} alt="留言图片" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8 }} onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
