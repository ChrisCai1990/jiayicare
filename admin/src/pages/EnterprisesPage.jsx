import React, { useEffect, useState } from 'react'
import { adminAPI } from '../api'
import { useToast } from '../App'

const EMPTY_ENTERPRISE = {
  name: '', creditCode: '', contactName: '', contactPhone: '', contactEmail: '',
  contractStartAt: '', contractEndAt: '', seatsTotal: 0, packageType: '', status: 'active', note: '',
}

// ── 企业信息表单 Modal ─────────────────────────────────────────────
function EnterpriseModal({ enterprise, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = !!enterprise?._id
  const [form, setForm] = useState(isEdit ? {
    ...enterprise,
    contractStartAt: enterprise.contractStartAt ? enterprise.contractStartAt.slice(0, 10) : '',
    contractEndAt: enterprise.contractEndAt ? enterprise.contractEndAt.slice(0, 10) : '',
  } : EMPTY_ENTERPRISE)
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.name) { toast('❌ 企业名称为必填项'); return }
    setLoading(true)
    try {
      if (isEdit) await adminAPI.updateEnterprise(enterprise._id, form)
      else await adminAPI.createEnterprise(form)
      toast(`✅ 企业客户${isEdit ? '更新' : '创建'}成功`)
      onSaved(); onClose()
    } catch (err) {
      toast('❌ ' + (err.message || '操作失败'))
    } finally { setLoading(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600, width: '96%' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{isEdit ? '✏️ 编辑企业客户' : '➕ 新增企业客户'}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">企业名称 *</label>
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">统一社会信用代码</label>
            <input className="form-input" value={form.creditCode} onChange={e => set('creditCode', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">状态</label>
            <select className="form-input" value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="active">合作中</option>
              <option value="expired">已到期</option>
              <option value="suspended">已暂停</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">对接人姓名</label>
            <input className="form-input" value={form.contactName} onChange={e => set('contactName', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">对接人电话</label>
            <input className="form-input" value={form.contactPhone} onChange={e => set('contactPhone', e.target.value)} />
          </div>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">对接人邮箱</label>
            <input className="form-input" value={form.contactEmail} onChange={e => set('contactEmail', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">合同开始日期</label>
            <input className="form-input" type="date" value={form.contractStartAt} onChange={e => set('contractStartAt', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">合同结束日期</label>
            <input className="form-input" type="date" value={form.contractEndAt} onChange={e => set('contractEndAt', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">采购名额总数</label>
            <input className="form-input" type="number" value={form.seatsTotal} onChange={e => set('seatsTotal', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">采购服务包类型</label>
            <input className="form-input" value={form.packageType} onChange={e => set('packageType', e.target.value)} placeholder="如 pkg_1y" />
          </div>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">备注</label>
            <textarea className="form-input" rows={3} value={form.note} onChange={e => set('note', e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={save} disabled={loading}>{loading ? '保存中...' : '保存'}</button>
        </div>
      </div>
    </div>
  )
}

// ── 关联员工 Modal（搜索会员并加入企业）────────────────────────────
function LinkEmployeesModal({ enterprise, onClose, onSaved }) {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)

  const search = async () => {
    if (!q.trim()) { toast('请输入姓名或手机号搜索'); return }
    setSearching(true)
    try {
      const res = await adminAPI.patients({ q })
      setResults(res.data || [])
    } catch (err) {
      toast('❌ ' + err.message)
    } finally { setSearching(false) }
  }

  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  const save = async () => {
    if (selected.length === 0) { toast('请至少选择一名员工'); return }
    setSaving(true)
    try {
      await adminAPI.linkEnterpriseEmployees(enterprise._id, selected)
      toast(`✅ 已关联 ${selected.length} 名员工`)
      onSaved(); onClose()
    } catch (err) {
      toast('❌ ' + (err.message || '操作失败'))
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560, width: '96%' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">🔗 关联员工到「{enterprise.name}」</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input className="form-input" style={{ flex: 1 }} value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), search())} placeholder="按姓名或手机号搜索会员" />
            <button className="btn btn-ghost" onClick={search} disabled={searching}>{searching ? '搜索中...' : '搜索'}</button>
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {results.map(u => (
              <label key={u._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px dashed #f0ede7', cursor: 'pointer' }}>
                <input type="checkbox" checked={selected.includes(u._id)} onChange={() => toggle(u._id)} />
                <div>
                  <div style={{ fontWeight: 500 }}>{u.name}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{u.phone}</div>
                </div>
              </label>
            ))}
            {results.length === 0 && <div style={{ fontSize: 12, color: '#aaa', padding: '8px 0' }}>暂无搜索结果</div>}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? '保存中...' : `关联已选 ${selected.length} 人`}</button>
        </div>
      </div>
    </div>
  )
}

// ── HR账号创建 Modal ──────────────────────────────────────────────
function HrAccountModal({ enterprise, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState({ username: '', password: '', name: '', phone: '' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.name || !form.password) { toast('❌ 姓名、密码为必填项'); return }
    setSaving(true)
    try {
      await adminAPI.createEnterpriseHr(enterprise._id, form)
      toast('✅ HR账号已创建')
      onSaved(); onClose()
    } catch (err) {
      toast('❌ ' + (err.message || '操作失败'))
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420, width: '96%' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">👤 为「{enterprise.name}」创建HR账号</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">姓名 *</label>
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">登录用户名（留空自动生成）</label>
            <input className="form-input" value={form.username} onChange={e => set('username', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">登录密码 *</label>
            <input className="form-input" type="text" value={form.password} onChange={e => set('password', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">联系电话</label>
            <input className="form-input" value={form.phone} onChange={e => set('phone', e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? '创建中...' : '创建'}</button>
        </div>
      </div>
    </div>
  )
}

const STATUS_LABEL = { active: '合作中', expired: '已到期', suspended: '已暂停' }
const STATUS_BADGE = { active: 'badge-green', expired: 'badge-gray', suspended: 'badge-gray' }

export default function EnterprisesPage() {
  const toast = useToast()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [employeesByEnt, setEmployeesByEnt] = useState({})
  const [hrByEnt, setHrByEnt] = useState({})
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [showHrModal, setShowHrModal] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await adminAPI.enterprises()
      setList(res.data || [])
    } catch (err) {
      toast('❌ 加载失败：' + err.message)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const loadDetail = async (id) => {
    try {
      const [empRes, hrRes] = await Promise.all([adminAPI.enterpriseEmployees(id), adminAPI.enterpriseHrAccounts(id)])
      setEmployeesByEnt(m => ({ ...m, [id]: empRes.data || [] }))
      setHrByEnt(m => ({ ...m, [id]: hrRes.data || [] }))
    } catch (err) {
      toast('❌ 加载详情失败：' + err.message)
    }
  }

  const toggleExpand = (id) => {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    if (!employeesByEnt[id]) loadDetail(id)
  }

  const del = async (e) => {
    if (!window.confirm(`确定删除「${e.name}」？`)) return
    try { await adminAPI.deleteEnterprise(e._id); toast('✅ 已删除'); load() }
    catch (err) { toast('❌ ' + err.message) }
  }

  const unlinkEmployee = async (entId, userId) => {
    if (!window.confirm('确定解除该员工与企业的关联？')) return
    try { await adminAPI.unlinkEnterpriseEmployee(entId, userId); toast('✅ 已解除'); loadDetail(entId) }
    catch (err) { toast('❌ ' + err.message) }
  }

  const deleteHr = async (entId, hrId) => {
    if (!window.confirm('确定删除该HR账号？')) return
    try { await adminAPI.deleteEnterpriseHr(hrId); toast('✅ 已删除'); loadDetail(entId) }
    catch (err) { toast('❌ ' + err.message) }
  }

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('zh-CN') : '-'

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">🏢 企业客户管理</div>
          <div className="page-subtitle">管理B2B2C企业客户、员工名额分配、HR账号</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowEditModal(true) }}>＋ 新增企业客户</button>
      </div>

      {loading ? (
        <div className="loading">加载中...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {list.length === 0 && (
            <div className="card" style={{ textAlign: 'center', color: '#888', padding: 32 }}>暂无企业客户，点击「新增企业客户」添加</div>
          )}
          {list.map(e => (
            <div key={e._id} className="card" style={{ padding: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: 'pointer' }} onClick={() => toggleExpand(e._id)}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{e.name}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>
                    对接人：{e.contactName || '-'} {e.contactPhone} · 合同：{fmtDate(e.contractStartAt)} ~ {fmtDate(e.contractEndAt)}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#4A6558' }}>名额 {e.seatsUsed}/{e.seatsTotal || '不限'}</div>
                <span className={`badge ${STATUS_BADGE[e.status]}`}>{STATUS_LABEL[e.status]}</span>
                <div style={{ display: 'flex', gap: 6 }} onClick={ev => ev.stopPropagation()}>
                  <button className="btn btn-sm btn-primary" onClick={() => toggleExpand(e._id)}>
                    {expandedId === e._id ? '收起' : '管理员工/HR账号'}
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={() => { setEditing(e); setShowEditModal(true) }}>编辑</button>
                  <button className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc' }} onClick={() => del(e)}>删除</button>
                </div>
              </div>

              {expandedId === e._id && (
                <div style={{ borderTop: '1px solid #f0ede7', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* 员工列表 */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#4A6558' }}>已关联员工</div>
                      <button className="btn btn-sm btn-primary" onClick={() => setShowLinkModal(true)}>＋ 关联员工</button>
                    </div>
                    {(employeesByEnt[e._id] || []).length === 0 && <div style={{ fontSize: 12, color: '#aaa' }}>暂无关联员工</div>}
                    {(employeesByEnt[e._id] || []).map(u => (
                      <div key={u._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px dashed #f0ede7' }}>
                        <div style={{ flex: 1 }}>{u.name} <span style={{ fontSize: 12, color: '#888' }}>{u.phone}</span></div>
                        <span className={`badge ${u.onboardingCompleted ? 'badge-green' : 'badge-gray'}`}>{u.onboardingCompleted ? '已激活' : '未激活'}</span>
                        <button className="btn btn-sm btn-ghost" onClick={() => unlinkEmployee(e._id, u._id)}>解除</button>
                      </div>
                    ))}
                  </div>

                  {/* HR账号 */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#4A6558' }}>HR账号</div>
                      <button className="btn btn-sm btn-primary" onClick={() => setShowHrModal(true)}>＋ 创建HR账号</button>
                    </div>
                    {(hrByEnt[e._id] || []).length === 0 && <div style={{ fontSize: 12, color: '#aaa' }}>暂无HR账号</div>}
                    {(hrByEnt[e._id] || []).map(hr => (
                      <div key={hr._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px dashed #f0ede7' }}>
                        <div style={{ flex: 1 }}>{hr.name} <span style={{ fontSize: 12, color: '#888' }}>@{hr.username}</span></div>
                        <button className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc' }} onClick={() => deleteHr(e._id, hr._id)}>删除</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showEditModal && (
        <EnterpriseModal enterprise={editing} onClose={() => setShowEditModal(false)} onSaved={load} />
      )}
      {showLinkModal && expandedId && (
        <LinkEmployeesModal enterprise={list.find(e => e._id === expandedId)} onClose={() => setShowLinkModal(false)} onSaved={() => { loadDetail(expandedId); load() }} />
      )}
      {showHrModal && expandedId && (
        <HrAccountModal enterprise={list.find(e => e._id === expandedId)} onClose={() => setShowHrModal(false)} onSaved={() => loadDetail(expandedId)} />
      )}
    </div>
  )
}
