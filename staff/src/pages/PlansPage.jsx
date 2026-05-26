import React, { useEffect, useState, useCallback, useRef } from 'react'
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

const TABS = [
  { v: '',               l: '全部',      icon: '📋' },
  { v: 'annual_checkup', l: '年度体检',  icon: '🔬' },
  { v: 'annual_mgmt',    l: '年度管理',  icon: '📊' },
  { v: 'nutrition',      l: '营养干预',  icon: '🥗' },
  { v: 'medical_assist', l: '就医协助',  icon: '🏥' },
  { v: 'tcm',            l: '中医调理',  icon: '🌿' },
  { v: 'rehab',          l: '运动复健',  icon: '💪' },
  { v: 'psychology',     l: '心理咨询',  icon: '🧠' },
]

const EMPTY_DESC = {
  '':               '从右上角新建方案，为会员制定个性化健康管理计划',
  annual_checkup:   '为会员安排年度体检，追踪体检结果与健康趋势',
  annual_mgmt:      '为会员制定年度健康管理方案，涵盖6大模块全面管理',
  nutrition:        '制定营养干预计划，改善饮食结构与代谢健康',
  medical_assist:   '协助会员就医，提供全程就医陪同与协调',
  tcm:              '中医体质评估与调理方案，调和脏腑平衡',
  rehab:            '运动康复计划，改善运动功能与体能',
  psychology:       '心理健康评估与咨询，疏导情绪问题',
}

export default function PlansPage() {
  const nav = useNavigate()
  const toast = useToast()
  const [plans, setPlans] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [typeFilter, setTypeFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await staffAPI.getPlans({ type: typeFilter, limit: 50 })
      setPlans(res.data.plans)
      setTotal(res.data.total)
    } finally { setLoading(false) }
  }, [typeFilter])

  useEffect(() => { load() }, [load])

  const handleNew = () => setShowModal(true)

  const currentTab = TABS.find(t => t.v === typeFilter) || TABS[0]

  return (
    <div className="page">
      {/* ── 页头 ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">健康方案</h1>
          <p className="page-subtitle">共 {total} 个方案</p>
        </div>
        <button className="btn btn-primary" onClick={handleNew}>
          ＋ {typeFilter && TYPE_LABEL[typeFilter] ? `新建${TYPE_LABEL[typeFilter]}` : '新建方案'}
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="tabs" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t.v}
            className={`tab-btn ${typeFilter === t.v ? 'active' : ''}`}
            onClick={() => setTypeFilter(t.v)}
          >
            {t.icon} {t.l}
          </button>
        ))}
      </div>

      {/* ── 列表 ── */}
      <div className="card">
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#aaa' }}>加载中...</div>
        ) : plans.length === 0 ? (
          /* 空状态 */
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>{currentTab.icon}</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1A2B24', marginBottom: 8 }}>
              暂无{currentTab.l === '全部' ? '' : currentTab.l}方案
            </div>
            <div style={{ fontSize: 13, color: '#8AA89C', marginBottom: 24, maxWidth: 300, margin: '0 auto 24px' }}>
              {EMPTY_DESC[typeFilter]}
            </div>
            <button className="btn btn-primary" onClick={handleNew}>
              ＋ {typeFilter && TYPE_LABEL[typeFilter] ? `新建${TYPE_LABEL[typeFilter]}` : '新建方案'}
            </button>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>方案名称</th>
                <th>会员</th>
                {!typeFilter && <th>类型</th>}
                <th>状态</th>
                <th>执行进度</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {plans.map(p => {
                const total_items = p.items?.length || 0
                const done_items = p.items?.filter(i => i.status === 'completed').length || 0
                const pct = total_items > 0 ? Math.round(done_items / total_items * 100) : 0
                return (
                  <tr key={p._id} onClick={() => {
                    if (p.type === 'annual_mgmt') nav(`/patients/${p.patientId?._id}/annual-plan`)
                    else nav(`/plans/${p._id}`)
                  }} style={{ cursor: 'pointer' }}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#1A2B24' }}>{p.title}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{p.patientId?.name || '-'}</div>
                      <div style={{ fontSize: 12, color: '#aaa' }}>{p.patientId?.phone}</div>
                    </td>
                    {!typeFilter && (
                      <td><span className="badge badge-info" style={{ fontSize: 11 }}>{TYPE_LABEL[p.type] || p.type}</span></td>
                    )}
                    <td>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                        background: p.status === 'active' ? '#E8F5EF' : p.status === 'completed' ? '#EFF6FF' : '#F5F5F5',
                        color: STATUS_COLOR[p.status],
                      }}>
                        {STATUS_LABEL[p.status]}
                      </span>
                    </td>
                    <td style={{ minWidth: 120 }}>
                      {p.type === 'annual_mgmt' ? (
                        <span style={{ fontSize: 12, color: '#8AA89C' }}>— 独立配置</span>
                      ) : total_items === 0 ? (
                        <span style={{ fontSize: 12, color: '#ccc' }}>暂无项目</span>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 6, background: '#F0EDE7', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#22A06B' : '#1E6B50', borderRadius: 3, transition: 'width 0.3s' }} />
                          </div>
                          <span style={{ fontSize: 12, color: '#8AA89C', whiteSpace: 'nowrap' }}>{done_items}/{total_items}</span>
                        </div>
                      )}
                    </td>
                    <td style={{ color: '#8AA89C', fontSize: 12 }}>{new Date(p.createdAt).toLocaleDateString('zh-CN')}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <button className="btn btn-secondary btn-sm" onClick={() => {
                        if (p.type === 'annual_mgmt') nav(`/patients/${p.patientId?._id}/annual-plan`)
                        else nav(`/plans/${p._id}`)
                      }}>查看</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <NewPlanModal
          nav={nav}
          defaultType={typeFilter || 'annual_checkup'}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); toast('方案已创建') }}
        />
      )}
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

function NewPlanModal({ onClose, onSaved, nav, defaultType = 'annual_checkup' }) {
  const [form, setForm] = useState({ patientId: '', type: defaultType, title: '', description: '', year: new Date().getFullYear() })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const isAnnualMgmt = form.type === 'annual_mgmt'

  const handleSubmit = async e => {
    if (e && e.preventDefault) e.preventDefault()
    if (!form.patientId) { setError('请搜索并选择会员'); return }
    // 年度管理方案跳转专属配置页，不走 HealthPlan 流程
    if (isAnnualMgmt) {
      onClose()
      nav(`/patients/${form.patientId}/annual-plan`)
      return
    }
    if (!form.title) { setError('方案名称不能为空'); return }
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
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">搜索会员 *</label>
            <PatientSearchInput
              value={form.patientId}
              onChange={pid => setForm(f => ({ ...f, patientId: pid }))}
            />
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
          {/* 年度管理方案：不需要填名称，直接跳转专属页 */}
          {isAnnualMgmt ? (
            <div style={{ background: '#EFF6FF', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#0077B6' }}>
              💡 年度管理方案将进入专属配置页，包含医疗、监测、疫苗、生活方式等6大模块，每位会员每年独立一份
            </div>
          ) : (
            <>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">方案名称 *</label>
                <input className="form-input" placeholder="如：2025年度体检方案" value={form.title} onChange={set('title')} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">方案年度</label>
                <input className="form-input" type="number" value={form.year} onChange={set('year')} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">方案说明</label>
                <textarea className="form-input" rows={3} placeholder="简要说明方案目标" value={form.description} onChange={set('description')} />
              </div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? '创建中...' : isAnnualMgmt ? '进入年度方案配置 →' : '创建方案'}
          </button>
        </div>
      </div>
    </div>
  )
}

