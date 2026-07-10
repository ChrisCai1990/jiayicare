import React, { useEffect, useState } from 'react'
import { adminAPI, API_ORIGIN } from '../api'
import { useToast } from '../App'

// 上传接口返回相对路径(/api/uploads/xxx)，admin域名与后端API域名不同，需拼上API_ORIGIN才能正常打开
function safeFileSrc(url) {
  if (!url) return url
  if (url.startsWith('/')) return API_ORIGIN + url
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http://')) {
    return url.replace(/^http:\/\//, 'https://')
  }
  return url
}

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
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
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
  const [q, setQ] = useState('')
  const [showEditModal, setShowEditModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [employeesByEnt, setEmployeesByEnt] = useState({})
  const [hrByEnt, setHrByEnt] = useState({})
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [showHrModal, setShowHrModal] = useState(false)
  const [hrDataEnt, setHrDataEnt] = useState(null)   // 正在录入HR看板数据的企业

  const load = async (name) => {
    setLoading(true)
    try {
      const res = await adminAPI.enterprises(name ? { name } : {})
      setList(res.data || [])
    } catch (err) {
      toast('❌ 加载失败：' + err.message)
    } finally { setLoading(false) }
  }

  useEffect(() => { load(q) }, [q])

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
    try { await adminAPI.deleteEnterprise(e._id); toast('✅ 已删除'); load(q) }
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

      <div className="search-bar" style={{ marginBottom: 12 }}>
        <input
          className="search-input"
          placeholder="🔍  搜索企业名称..."
          value={q}
          onChange={e => setQ(e.target.value)}
        />
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
                  <button className="btn btn-sm btn-ghost" onClick={() => setHrDataEnt(e)}>📊 HR数据</button>
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
        <EnterpriseModal enterprise={editing} onClose={() => setShowEditModal(false)} onSaved={() => load(q)} />
      )}
      {showLinkModal && expandedId && (
        <LinkEmployeesModal enterprise={list.find(e => e._id === expandedId)} onClose={() => setShowLinkModal(false)} onSaved={() => { loadDetail(expandedId); load(q) }} />
      )}
      {showHrModal && expandedId && (
        <HrAccountModal enterprise={list.find(e => e._id === expandedId)} onClose={() => setShowHrModal(false)} onSaved={() => loadDetail(expandedId)} />
      )}
      {hrDataEnt && (
        <HrDataModal enterprise={hrDataEnt} onClose={() => setHrDataEnt(null)} onSaved={() => load(q)} toast={toast} />
      )}
    </div>
  )
}

// ── 企业HR看板数据录入（超管手工，按年度）────────────────────────────
function HrDataModal({ enterprise, onClose, onSaved, toast }) {
  const yearNow = new Date().getFullYear()
  const byYear = enterprise.hrDataByYear || {}
  // 已录入过的年份（快捷切换用），倒序
  const savedYears = Object.keys(byYear).sort((a, b) => Number(b) - Number(a))
  const [year, setYear] = useState(String(yearNow))
  const blankFund = { transactions: [], used: '' }
  const blank = { seatsTotal: '', examOrg: '', examCount: '', examUnitPrice: '', examUnitPriceMale: '', examUnitPriceMarriedFemale: '', examUnitPriceSingleFemale: '', examTotal: '', insurerName: '', insuredCount: '', insuredExecCount: '', insuredFamilyCount: '', insuredChildCount: '', insuredAmount: '', healthMgmtFee: '', healthMgmtCount: '', otherServices: [], healthFund: { ...blankFund }, examAttachments: [], insuredAttachments: [], healthMgmtAttachments: [] }
  // 载入已有年度数据时，确保 healthFund 结构完整（旧数据可能没有这个字段）
  const withDefaults = (d) => ({ ...blank, ...d, healthFund: { ...blankFund, ...(d?.healthFund || {}) } })
  const [form, setForm] = useState(() => withDefaults(byYear[String(yearNow)]))
  const [saving, setSaving] = useState(false)

  const switchYear = (y) => { setYear(y); setForm(withDefaults(byYear[y])) }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  // 付费服务清单（含启动状态）
  const setOther = (i, k, v) => setForm(f => ({ ...f, otherServices: f.otherServices.map((o, idx) => idx === i ? { ...o, [k]: v } : o) }))
  const addOther = () => setForm(f => ({ ...f, otherServices: [...(f.otherServices || []), { name: '', frequency: '', detail: '' }] }))
  const rmOther = (i) => setForm(f => ({ ...f, otherServices: f.otherServices.filter((_, idx) => idx !== i) }))
  // 健康基金充值明细
  const setFund = (k, v) => setForm(f => ({ ...f, healthFund: { ...f.healthFund, [k]: v } }))
  const setFundTx = (i, k, v) => setForm(f => ({ ...f, healthFund: { ...f.healthFund, transactions: f.healthFund.transactions.map((t, idx) => idx === i ? { ...t, [k]: v } : t) } }))
  const addFundTx = () => setForm(f => ({ ...f, healthFund: { ...f.healthFund, transactions: [...(f.healthFund.transactions || []), { source: '企业自有', amount: '', date: '', note: '' }] } }))
  const rmFundTx = (i) => setForm(f => ({ ...f, healthFund: { ...f.healthFund, transactions: f.healthFund.transactions.filter((_, idx) => idx !== i) } }))
  // 基金总额/余额实时预览（与后端算法一致）
  const fundTotal = (form.healthFund?.transactions || []).reduce((s, t) => s + (Number(t.amount) || 0), 0)
  const fundBalance = fundTotal - (Number(form.healthFund?.used) || 0)

  // 附件（服务合约等），三个维度各自一份列表：[{ name, url }]
  const [uploadingKey, setUploadingKey] = useState('')
  const addAttachment = async (key, file) => {
    if (!file) return
    setUploadingKey(key)
    try {
      const res = await adminAPI.uploadImage(file)
      setForm(f => ({ ...f, [key]: [...(f[key] || []), { name: file.name, url: res.data.url }] }))
    } catch (err) { toast('❌ ' + (err.message || '上传失败')) } finally { setUploadingKey('') }
  }
  const rmAttachment = (key, i) => setForm(f => ({ ...f, [key]: f[key].filter((_, idx) => idx !== i) }))

  const save = async () => {
    setSaving(true)
    try {
      await adminAPI.saveEnterpriseHrData(enterprise._id, year, form)
      toast(`✅ ${year}年度数据已保存`)
      onSaved(); onClose()
    } catch (err) { toast('❌ ' + (err.message || '保存失败')) } finally { setSaving(false) }
  }

  const numField = (label, key, unit) => (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <label className="form-label">{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input className="form-input" type="number" value={form[key]} onChange={e => set(key, e.target.value)} placeholder="0" />
        {unit && <span style={{ fontSize: 12, color: '#888' }}>{unit}</span>}
      </div>
    </div>
  )

  // 附件列表（服务合约等，每个维度独立存储，支持多文件）
  const attachmentList = (key, label) => (
    <div style={{ gridColumn: 'span 2', marginTop: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <label className="form-label" style={{ marginBottom: 0 }}>{label}</label>
        <label className="btn btn-sm btn-secondary" style={{ cursor: 'pointer', margin: 0 }}>
          {uploadingKey === key ? '上传中...' : '+ 上传附件'}
          <input
            type="file"
            accept="image/*,.pdf"
            style={{ display: 'none' }}
            disabled={uploadingKey === key}
            onChange={e => { addAttachment(key, e.target.files[0]); e.target.value = '' }}
          />
        </label>
      </div>
      {(form[key] || []).length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {form[key].map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: '#f8faf9', borderRadius: 6, padding: '6px 10px' }}>
              <span>📎</span>
              <a href={safeFileSrc(a.url)} target="_blank" rel="noreferrer" style={{ flex: 1, color: '#1E6B50', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</a>
              <button type="button" onClick={() => rmAttachment(key, i)} style={{ color: '#c0392b', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // 服务起止日期（三维度各一对，时间可能都不同）
  const dateRange = (startKey, endKey) => (
    <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
      <label className="form-label">服务起止</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input className="form-input" type="date" value={form[startKey] || ''} onChange={e => set(startKey, e.target.value)} />
        <span style={{ color: '#888' }}>至</span>
        <input className="form-input" type="date" value={form[endKey] || ''} onChange={e => set(endKey, e.target.value)} />
      </div>
    </div>
  )

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <div className="modal-title">📊 「{enterprise.name}」HR看板数据</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ overflowY: 'auto' }}>
          <div className="form-group">
            <label className="form-label">年度</label>
            {/* 年份可直接输入任意年（不写死，2027年之后也能录）；已录年份点标签快捷切换 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                className="form-input"
                type="number"
                style={{ maxWidth: 120 }}
                value={year}
                min="2020"
                max="2099"
                onChange={e => switchYear(e.target.value)}
                placeholder="如 2026"
              />
              <span style={{ fontSize: 12, color: '#888' }}>年{byYear[year] ? '（已录，可修改）' : '（新建）'}</span>
            </div>
            {savedYears.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {savedYears.map(y => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => switchYear(y)}
                    style={{
                      fontSize: 12, padding: '3px 12px', borderRadius: 999, cursor: 'pointer',
                      border: y === year ? '1px solid #1E6B50' : '1px solid #E0D9CE',
                      background: y === year ? '#EAF5EF' : '#fff',
                      color: y === year ? '#1E6B50' : '#4A6558', fontWeight: y === year ? 700 : 400,
                    }}
                  >{y} 年</button>
                ))}
              </div>
            )}
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E6B50', margin: '12px 0 8px' }}>服务名额</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {numField('该年度采购名额', 'seatsTotal', '人')}
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E6B50', margin: '16px 0 8px' }}>体检</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
              <label className="form-label">体检机构</label>
              <input className="form-input" value={form.examOrg} onChange={e => set('examOrg', e.target.value)} placeholder="如：美年大健康 / 慈铭体检" />
            </div>
            {numField('当年体检人数', 'examCount', '人')}
            {/* 2026-07-09：去掉"客单价（总体）"录入——体检按类别计价，无统一总体客单价 */}
            {numField('客单价·男性', 'examUnitPriceMale', '¥')}
            {numField('客单价·已婚女性', 'examUnitPriceMarriedFemale', '¥')}
            {numField('客单价·未婚女性', 'examUnitPriceSingleFemale', '¥')}
            {numField('体检总额', 'examTotal', '¥')}
            {dateRange('examStartAt', 'examEndAt')}
            {attachmentList('examAttachments', '体检服务合约附件')}
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E6B50', margin: '16px 0 8px' }}>保险（如为高管购买高端医疗险）</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
              <label className="form-label">保险公司</label>
              <input className="form-input" value={form.insurerName} onChange={e => set('insurerName', e.target.value)} placeholder="如：中国平安 / 友邦" />
            </div>
            {numField('参保人数（总体）', 'insuredCount', '人')}
            {numField('参保·高管', 'insuredExecCount', '人')}
            {numField('参保·配偶', 'insuredFamilyCount', '人')}
            {numField('参保·孩子', 'insuredChildCount', '人')}
            {numField('保险金额', 'insuredAmount', '¥')}
            {dateRange('insuredStartAt', 'insuredEndAt')}
            {attachmentList('insuredAttachments', '保险服务合约附件')}
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E6B50', margin: '16px 0 8px' }}>健康管理</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {numField('服务人数', 'healthMgmtCount', '人')}
            {numField('健康管理费', 'healthMgmtFee', '¥')}
            {dateRange('healthMgmtStartAt', 'healthMgmtEndAt')}
            {attachmentList('healthMgmtAttachments', '健康管理服务合约附件')}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 8px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1E6B50' }}>付费健康管理服务清单</div>
            <button type="button" className="btn btn-sm btn-secondary" onClick={addOther}>+ 添加</button>
          </div>
          {(form.otherServices || []).map((o, i) => (
            <div key={i} style={{ border: '1px solid #EEE9E0', borderRadius: 8, padding: 10, marginBottom: 8, background: '#fcfbf9' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr auto', gap: 8, alignItems: 'center' }}>
                <input className="form-input" value={o.name} onChange={e => setOther(i, 'name', e.target.value)} placeholder="服务名称，如：健康讲座" />
                <input className="form-input" value={o.frequency || ''} onChange={e => setOther(i, 'frequency', e.target.value)} placeholder="频次，如：每季度1次" />
                <button type="button" onClick={() => rmOther(i)} style={{ color: '#c0392b', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
              </div>
              <textarea
                className="form-input"
                style={{ marginTop: 8, minHeight: 52, resize: 'vertical', width: '100%' }}
                value={o.detail || ''}
                onChange={e => setOther(i, 'detail', e.target.value)}
                placeholder="具体服务内容 / 启动情况，如：全年组织4场，主题涵盖三高防治、颈椎健康，累计参与320人次"
              />
            </div>
          ))}

          {/* ── 健康基金账户 ────────────────────────────────────── */}
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E6B50', margin: '18px 0 8px' }}>健康基金账户</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: '#888' }}>充值明细（区分企业自有 / 平台赠送）</div>
            <button type="button" className="btn btn-sm btn-secondary" onClick={addFundTx}>+ 添加充值</button>
          </div>
          {(form.healthFund?.transactions || []).map((t, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.2fr auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <select className="form-input" value={t.source || '企业自有'} onChange={e => setFundTx(i, 'source', e.target.value)}>
                <option value="企业自有">企业自有</option>
                <option value="平台赠送">平台赠送</option>
              </select>
              <input className="form-input" type="number" value={t.amount} onChange={e => setFundTx(i, 'amount', e.target.value)} placeholder="金额 ¥" />
              <input className="form-input" type="date" value={t.date} onChange={e => setFundTx(i, 'date', e.target.value)} />
              <input className="form-input" value={t.note} onChange={e => setFundTx(i, 'note', e.target.value)} placeholder="备注" />
              <button type="button" onClick={() => rmFundTx(i)} style={{ color: '#c0392b', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 8, alignItems: 'end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">已使用金额</label>
              <input className="form-input" type="number" value={form.healthFund?.used} onChange={e => setFund('used', e.target.value)} placeholder="0" />
            </div>
            <div style={{ fontSize: 13, color: '#888', paddingBottom: 8 }}>基金总额：<b style={{ color: '#1A2B24' }}>¥{fundTotal.toLocaleString()}</b></div>
            <div style={{ fontSize: 13, color: '#888', paddingBottom: 8 }}>可用余额：<b style={{ color: fundBalance < 0 ? '#c0392b' : '#1E6B50' }}>¥{fundBalance.toLocaleString()}</b></div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? '保存中...' : '保存'}</button>
        </div>
      </div>
    </div>
  )
}
