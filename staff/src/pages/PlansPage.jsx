import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
  const [searchParams, setSearchParams] = useSearchParams()
  const [plans, setPlans] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [typeFilter, setTypeFilter] = useState(searchParams.get('type') || '')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await staffAPI.getPlans({ type: typeFilter, limit: 50 })
      setPlans(res.data.plans)
      setTotal(res.data.total)
    } finally { setLoading(false) }
  }, [typeFilter])

  useEffect(() => { load() }, [load])

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">健康方案</h1>
          <p className="page-subtitle">共 {total} 个方案</p>
        </div>
      </div>

      {/* 类型筛选 + 新建按钮同行 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
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
            onClick={() => { setTypeFilter(opt.v); setSearchParams(opt.v ? { type: opt.v } : {}) }}>{opt.l}</button>
        ))}

        {/* 新建按钮跟随当前 Tab */}
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
            ＋ {TYPE_LABEL[typeFilter] ? `新建${TYPE_LABEL[typeFilter]}` : '新建方案'}
          </button>
        </div>
      </div>

      <div className="card">
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>加载中...</div>
        : plans.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无方案</div>
        : <table className="table">
            <thead><tr>
              <th>方案名称</th><th>类型</th><th>会员</th><th>状态</th><th>项目数</th><th>创建时间</th><th>操作</th>
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

      {showModal && <NewPlanModal type={typeFilter || 'annual_checkup'} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); toast('方案已创建') }} />}
    </div>
  )
}

// ── 会员搜索组件（按姓名或手机号实时搜索） ────────────────────────────
function PatientSearchInput({ value, onChange }) {
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const [selectedName, setSelectedName] = useState('')
  const timerRef = useRef(null)
  const wrapRef = useRef(null)

  // 点击外部关闭下拉
  useEffect(() => {
    const handler = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // 防抖搜索
  const handleInput = e => {
    const kw = e.target.value
    setKeyword(kw)
    setOpen(true)
    if (!kw.trim()) { setResults([]); return }
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await staffAPI.getPatients({ search: kw, limit: 20 })
        setResults(res.data.patients || [])
      } catch { setResults([]) }
      finally { setSearching(false) }
    }, 300)
  }

  const handleSelect = patient => {
    onChange(patient._id)
    setSelectedName(`${patient.name}  ${patient.phone}`)
    setKeyword('')
    setResults([])
    setOpen(false)
  }

  const handleClear = () => {
    onChange('')
    setSelectedName('')
    setKeyword('')
    setResults([])
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {value && selectedName ? (
        // 已选中态
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', border: '1px solid #1E6B50', borderRadius: 8,
          background: '#E8F5EF', fontSize: 14,
        }}>
          <span>
            <span style={{ fontWeight: 600, color: '#1A2B24' }}>{selectedName.split('  ')[0]}</span>
            <span style={{ color: '#8AA89C', marginLeft: 8, fontSize: 13 }}>{selectedName.split('  ')[1]}</span>
          </span>
          <button
            type="button"
            onClick={handleClear}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 16, lineHeight: 1, padding: 0 }}
          >✕</button>
        </div>
      ) : (
        // 搜索输入态
        <div style={{ position: 'relative' }}>
          <input
            className="form-input"
            type="text"
            value={keyword}
            onChange={handleInput}
            onFocus={() => keyword && setOpen(true)}
            placeholder="输入姓名或手机号搜索会员..."
            autoComplete="off"
          />
          {searching && (
            <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#aaa' }}>搜索中...</span>
          )}
        </div>
      )}

      {/* 搜索结果下拉 */}
      {open && !value && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
          background: '#fff', border: '1px solid #E0D9CE', borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto',
          marginTop: 4,
        }}>
          {results.length === 0 && keyword && !searching && (
            <div style={{ padding: '12px 16px', color: '#aaa', fontSize: 13 }}>未找到匹配会员</div>
          )}
          {results.length === 0 && !keyword && (
            <div style={{ padding: '12px 16px', color: '#aaa', fontSize: 13 }}>请输入姓名或手机号</div>
          )}
          {results.map(p => (
            <div
              key={p._id}
              onMouseDown={() => handleSelect(p)}
              style={{
                padding: '10px 16px', cursor: 'pointer', fontSize: 14,
                display: 'flex', alignItems: 'center', gap: 10,
                borderBottom: '1px solid #F5F2EC',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#F9F6F0'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
            >
              <div style={{
                width: 32, height: 32, borderRadius: '50%', background: '#1E6B50',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 600, flexShrink: 0,
              }}>{p.name?.[0] || '?'}</div>
              <div>
                <div style={{ fontWeight: 600, color: '#1A2B24' }}>{p.name}</div>
                <div style={{ fontSize: 12, color: '#8AA89C' }}>{p.phone}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 弹窗标题 & 模板类型映射 ────────────────────────────────────────────
const MODAL_TITLE = {
  annual_checkup: '新建体检方案',
  annual_mgmt:    '新建管理方案',
  nutrition:      '新建营养干预方案',
  medical_assist: '新建就医协助方案',
  tcm:            '新建中医调理方案',
  rehab:          '新建运动复健方案',
  psychology:     '新建心理咨询方案',
}

// plan type → admin 后台模板 type
const TEMPLATE_TYPE_MAP = {
  annual_checkup: 'annual_checkup',
  annual_mgmt:    'health_management',
  nutrition:      'nutrition',
  medical_assist: 'medical_assist',
  tcm:            'tcm',
  rehab:          'rehab',
  psychology:     'psychology',
}

// 从选中的模板推导方案名称
function getTemplateTitle(tpl) {
  if (!tpl) return ''
  const c = tpl.content || {}
  return c.packageName || c.planName || tpl.name || ''
}

// 从选中的模板生成方案 items
function templateToItems(tpl) {
  if (!tpl) return []
  const c = tpl.content || {}
  if (tpl.type === 'annual_checkup') {
    return (c.checkItems || []).map(ci => ({
      name:     ci.name,
      category: ci.type === 'lab' ? '检验检查' : '影像检查',
      itemId:   ci.id || null,
      itemType: ci.type === 'lab' ? 'labTest' : 'specialExam',
    }))
  }
  if (tpl.type === 'health_management') {
    return (c.followUpPlans || []).map(fp => ({
      name:     fp.name,
      category: '随访方案',
    }))
  }
  return []
}

function NewPlanModal({ onClose, onSaved, type }) {
  const [patientId, setPatientId]     = useState('')
  const [templateId, setTemplateId]   = useState('')
  const [year, setYear]               = useState(new Date().getFullYear())
  const [description, setDescription] = useState('')
  const [items, setItems]             = useState([])
  const [templates, setTemplates]     = useState([])
  const [loadingTpls, setLoadingTpls] = useState(false)
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')

  // 搜索添加项目（仅 annual_checkup 用）
  const [showSearch, setShowSearch]       = useState(false)
  const [searchQ, setSearchQ]             = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching]         = useState(false)
  const searchTimer = useRef(null)

  const tplType    = TEMPLATE_TYPE_MAP[type] || type
  const modalTitle = MODAL_TITLE[type] || '新建方案'

  // 加载模板列表
  useEffect(() => {
    setLoadingTpls(true)
    staffAPI.getPlanTemplates(tplType)
      .then(res => setTemplates(res.data || []))
      .catch(() => {})
      .finally(() => setLoadingTpls(false))
  }, [tplType])

  // 切换模板时重置 items
  useEffect(() => {
    const tpl = templates.find(t => t._id === templateId) || null
    setItems(templateToItems(tpl))
    setShowSearch(false)
    setSearchQ('')
    setSearchResults([])
  }, [templateId, templates])

  const selectedTpl = templates.find(t => t._id === templateId) || null
  const desc = selectedTpl?.content?.planDesc || selectedTpl?.content?.packageDesc || ''

  // 删除单个项目
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx))

  // 搜索检验/检查项目
  const handleSearch = (q) => {
    setSearchQ(q)
    clearTimeout(searchTimer.current)
    if (!q.trim()) { setSearchResults([]); return }
    searchTimer.current = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await staffAPI.getRequisitionItems(q)
        setSearchResults(r.data || [])
      } catch {}
      finally { setSearching(false) }
    }, 300)
  }

  // 从库里添加项目
  const addFromLibrary = (item) => {
    setItems(prev => [...prev, {
      name:     item.name,
      category: item.type === 'lab' ? '检验检查' : '影像检查',
      itemId:   item._id || null,
      itemType: item.type === 'lab' ? 'labTest' : 'specialExam',
    }])
    setSearchQ('')
    setSearchResults([])
    setShowSearch(false)
  }

  const handleSubmit = async () => {
    if (!patientId)  { setError('请搜索并选择会员'); return }
    if (!templateId) { setError('请选择方案套餐'); return }
    const title = getTemplateTitle(selectedTpl)
    if (!title) { setError('所选模板没有名称，请联系管理员'); return }
    setError('')
    setSaving(true)
    try {
      await staffAPI.createPlan({ patientId, type, title, description, year, items })
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // item 的类型标签
  const itemTag = (item) => {
    const isLab = item.itemType === 'labTest' || item.category === '检验检查'
    const isFollowUp = item.category === '随访方案'
    if (isFollowUp) return { label: '随访', color: '#7C3AED', bg: '#F3E8FF' }
    if (isLab)      return { label: '检验', color: '#0077B6', bg: '#E8F4FD' }
    return           { label: '检查', color: '#1E6B50', bg: '#E8F5EF' }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h3 className="modal-title">{modalTitle}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {error && <div className="login-err" style={{ margin: '0 20px 8px' }}>⚠️ {error}</div>}
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* 搜索会员 */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">搜索会员 *</label>
            <PatientSearchInput value={patientId} onChange={setPatientId} />
          </div>

          {/* 方案类型（从模板库选）*/}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">方案类型 *</label>
            {loadingTpls ? (
              <div style={{ color: '#aaa', fontSize: 13, padding: '8px 0' }}>加载模板中...</div>
            ) : templates.length === 0 ? (
              <div style={{ color: '#D97706', fontSize: 13, padding: '8px 12px', background: '#FEF9EC', borderRadius: 8 }}>
                暂无可用模板，请先在超管后台创建方案模板
              </div>
            ) : (
              <select className="form-input" value={templateId} onChange={e => setTemplateId(e.target.value)}>
                <option value="">请选择方案套餐</option>
                {templates.map(t => (
                  <option key={t._id} value={t._id}>
                    {t.content?.packageName || t.content?.planName || t.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* 模板描述 */}
          {desc && (
            <div style={{ background: '#E8F5EF', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#1E6B50' }}>
              {desc}
            </div>
          )}

          {/* ── 可编辑项目列表（选中模板后显示）── */}
          {templateId && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>
                  {type === 'annual_checkup' ? '检查项目' : type === 'annual_mgmt' ? '随访方案节点' : '方案项目'}
                </span>
                <span style={{ fontWeight: 400, color: '#8AA89C', fontSize: 12 }}>
                  共 {items.length} 项，可删减或增加
                </span>
              </label>
              <div style={{ border: '1px solid #E0D9CE', borderRadius: 8, overflow: 'hidden', background: '#faf8f5' }}>

                {/* 项目滚动列表 */}
                {items.length === 0 && (
                  <div style={{ padding: '12px 14px', color: '#aaa', fontSize: 12, textAlign: 'center' }}>
                    暂无项目，{type === 'annual_checkup' ? '可点击下方"添加项目"从检验/检查库添加' : '可在创建后的方案详情中添加'}
                  </div>
                )}
                <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                  {items.map((item, idx) => {
                    const tag = itemTag(item)
                    return (
                      <div key={idx} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 12px', borderBottom: '1px solid #F0EDE7', fontSize: 13,
                      }}>
                        <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 3, flexShrink: 0, fontWeight: 600, color: tag.color, background: tag.bg }}>
                          {tag.label}
                        </span>
                        <span style={{ flex: 1, color: '#1A2B24' }}>{item.name}</span>
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 17, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
                          onMouseEnter={e => e.currentTarget.style.color = '#DC3545'}
                          onMouseLeave={e => e.currentTarget.style.color = '#ccc'}
                          title="删除此项"
                        >×</button>
                      </div>
                    )
                  })}
                </div>

                {/* 添加项目区（仅 annual_checkup） */}
                {type === 'annual_checkup' && (
                  <div style={{ padding: '8px 12px', borderTop: items.length > 0 ? '1px solid #F0EDE7' : 'none', background: '#fff' }}>
                    {!showSearch ? (
                      <button type="button" onClick={() => setShowSearch(true)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1E6B50', fontSize: 12, padding: 0, fontWeight: 500 }}>
                        ＋ 添加项目
                      </button>
                    ) : (
                      <div>
                        <div style={{ position: 'relative' }}>
                          <input
                            className="form-input"
                            autoFocus
                            value={searchQ}
                            onChange={e => handleSearch(e.target.value)}
                            placeholder="搜索检验/检查项目名称..."
                            style={{ fontSize: 12, paddingRight: 44 }}
                          />
                          <button type="button" onClick={() => { setShowSearch(false); setSearchQ(''); setSearchResults([]) }}
                            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 12 }}>
                            取消
                          </button>
                        </div>
                        {(searching || searchResults.length > 0 || (searchQ && !searching)) && (
                          <div style={{ border: '1px solid #E0D9CE', borderRadius: 6, background: '#fff', maxHeight: 180, overflowY: 'auto', marginTop: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                            {searching && <div style={{ padding: '10px 14px', color: '#aaa', fontSize: 12 }}>搜索中...</div>}
                            {!searching && searchResults.length === 0 && searchQ && (
                              <div style={{ padding: '10px 14px', color: '#aaa', fontSize: 12 }}>无匹配结果</div>
                            )}
                            {searchResults.map((r, i) => (
                              <div key={i} onMouseDown={() => addFromLibrary(r)}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #F8F6F2' }}
                                onMouseEnter={e => e.currentTarget.style.background = '#F0F9F4'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              >
                                <span style={{ fontSize: 11, padding: '1px 5px', borderRadius: 3, fontWeight: 600, color: r.type === 'lab' ? '#0077B6' : '#1E6B50', background: r.type === 'lab' ? '#E8F4FD' : '#E8F5EF' }}>
                                  {r.type === 'lab' ? '检验' : '检查'}
                                </span>
                                <span style={{ flex: 1 }}>{r.name}</span>
                                <span style={{ fontSize: 11, color: '#1E6B50' }}>＋ 添加</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 方案年度 */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">方案年度</label>
            <input className="form-input" type="number" value={year} onChange={e => setYear(Number(e.target.value))} />
          </div>

          {/* 方案说明 */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">方案说明</label>
            <textarea className="form-input" rows={3} placeholder="简要说明方案目标" value={description} onChange={e => setDescription(e.target.value)} />
          </div>

        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? '创建中...' : '创建方案'}
          </button>
        </div>
      </div>
    </div>
  )
}
