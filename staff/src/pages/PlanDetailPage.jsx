import React, { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'
import { useToast } from '../App'

const TYPE_LABEL = { checkup:'体检方案', health:'健康管理方案', followup:'随访计划', nutrition:'营养干预方案', rehab:'运动康复方案', tcm:'中医方案', annual_checkup:'年度体检方案', annual_mgmt:'年度管理方案', medical_assist:'就医协助方案', psychology:'心理咨询方案' }
const STATUS_LABEL = { draft:'草稿', active:'推送中', completed:'已完成', cancelled:'已取消' }
const ITEM_STATUS = { pending:'待完成', completed:'已完成', skipped:'已跳过' }
const ITEM_STATUS_COLOR = { pending:'#D97706', completed:'#22A06B', skipped:'#aaa' }

const ITEM_CATEGORIES = ['检验检查', '影像检查', '体格检查', '问诊咨询', '营养干预', '运动康复', '心理评估', '中医调理', '生活方式', '其他']

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
      category: item.type === 'lab' ? '检验检查' : '影像检查',
    }))
    setShowDropdown(false)
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleAdd = async () => {
    if (!form.name) { toast('项目名称不能为空'); return }
    setSaving(true)
    try {
      const newItem = {
        name:          form.name,
        category:      form.category,
        scheduledDate: form.scheduledDate || null,
        notes:         form.notes,
        itemId:        selected?.id || null,
        itemType:      selected ? (selected.type === 'lab' ? 'labTest' : 'specialExam') : '',
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
                    {item.type === 'lab' ? '检验' : '检查'}
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
          ✓ 已关联检验库：{selected.name}（{selected.type === 'lab' ? '检验' : '检查'}）
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
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAddItem, setShowAddItem] = useState(false)

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

  const handleItemStatus = async (itemId, status) => {
    try { await staffAPI.updatePlanItem(id, itemId, { status }); load() }
    catch (err) { toast(err.message) }
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

  if (loading) return <div className="page-loading">加载中...</div>
  if (!plan) return <div className="page">方案不存在</div>

  const completedCount = plan.items?.filter(i => i.status === 'completed').length || 0
  const progress = plan.items?.length ? Math.round((completedCount / plan.items.length) * 100) : 0

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
          <button className="btn btn-secondary btn-sm" onClick={() => nav('/plans')}>← 返回</button>
          <div>
            <h1 className="page-title">{plan.title}</h1>
            <p className="page-subtitle">{TYPE_LABEL[plan.type]} · {plan.patientId?.name} · {plan.year}年</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {plan.status === 'draft' && (
            <button className="btn btn-primary" onClick={handlePush}>📤 推送给会员</button>
          )}
          {plan.status === 'active' && (
            <button className="btn btn-secondary" onClick={handleResetToDraft}>✏️ 重新编辑</button>
          )}
          {plan.status === 'active' && (
            <button className="btn btn-primary" onClick={handlePush}>📤 重新推送</button>
          )}
          <button className="btn btn-secondary" onClick={handleDelete}>删除</button>
        </div>
      </div>

      {/* 基本信息 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div className="card">
          <div className="card-header"><div className="card-title">方案信息</div></div>
          <div className="card-body">
            {[
              ['会员', plan.patientId?.name + ' · ' + plan.patientId?.phone],
              ['类型', TYPE_LABEL[plan.type]],
              ['状态', STATUS_LABEL[plan.status]],
              ['年度', plan.year + ' 年'],
              ['制定人', plan.staffId?.name],
              ['推送时间', plan.pushedAt ? new Date(plan.pushedAt).toLocaleDateString('zh-CN') : '未推送'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f5f2ec', fontSize: 14 }}>
                <span style={{ color: '#8AA89C' }}>{k}</span>
                <span style={{ fontWeight: 500 }}>{v}</span>
              </div>
            ))}
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
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddItem(!showAddItem)}>＋ 添加项目</button>
        </div>

        {showAddItem && (
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
                          {item.itemType && <span style={{ marginLeft: 6, fontSize: 11, color: '#8AA89C', background: '#f0ece4', padding: '1px 5px', borderRadius: 3 }}>已关联库</span>}
                        </td>
                        <td style={{ fontSize: 13, color: '#666' }}>{item.scheduledDate ? new Date(item.scheduledDate).toLocaleDateString('zh-CN') : '-'}</td>
                        <td style={{ maxWidth: 180, fontSize: 12, color: '#8AA89C' }}>{item.notes || '-'}</td>
                        <td>
                          <span style={{ color: ITEM_STATUS_COLOR[item.status], fontWeight: 500, fontSize: 13 }}>
                            {ITEM_STATUS[item.status]}
                          </span>
                          {item.completedAt && <div style={{ fontSize: 11, color: '#aaa' }}>{new Date(item.completedAt).toLocaleDateString('zh-CN')}</div>}
                        </td>
                        <td>
                          {item.status === 'pending' && (
                            <button className="btn btn-secondary btn-sm" onClick={() => handleItemStatus(item._id, 'completed')}>✓ 完成</button>
                          )}
                          {item.status === 'completed' && (
                            <button className="btn btn-secondary btn-sm" onClick={() => handleItemStatus(item._id, 'pending')}>撤销</button>
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
    </div>
  )
}
