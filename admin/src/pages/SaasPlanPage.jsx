import React, { useEffect, useState } from 'react'
import { adminAPI } from '../api'
import { useAdmin } from '../App'
import './SaasPlanPage.css'

const yuan = value => `¥${Number(value || 0).toLocaleString('zh-CN')}`
const services = [
  ['admin', '机构管理后台'], ['staff', '医护／服务端'],
  ['customer', '客户小程序'], ['ai', 'AI 辅助功能（可选）'],
]

export default function SaasPlanPage() {
  const { admin } = useAdmin()
  const platform = admin?.role === 'platformSuper'
  const [tenants, setTenants] = useState([])
  const [tenantId, setTenantId] = useState(admin?.tenantId || '')
  const [snapshot, setSnapshot] = useState(null)
  const [standardForm, setStandardForm] = useState({})
  const [termsForm, setTermsForm] = useState({})
  const [profileForm, setProfileForm] = useState({ legalName: '', serviceScope: [], serviceScopeNote: '' })
  const [profileReason, setProfileReason] = useState('')
  const [reason, setReason] = useState('')
  const [extras, setExtras] = useState({ extraStaffSeats: 0, extraAdminSeats: 0 })
  const [newAdmin, setNewAdmin] = useState({ username: '', name: '', password: '' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async id => {
    const result = await adminAPI.saasPlan(id)
    setSnapshot(result.data)
    setStandardForm(result.data.standard || {})
    setTermsForm(result.data.tenant?.terms || {})
    setProfileForm({ legalName: result.data.tenant?.legalName || '', serviceScope: result.data.tenant?.serviceScope || [], serviceScopeNote: result.data.tenant?.serviceScopeNote || '' })
    setExtras({ extraStaffSeats: result.data.tenant?.extraStaffSeats || 0, extraAdminSeats: result.data.tenant?.extraAdminSeats || 0 })
  }
  useEffect(() => {
    if (!platform) return
    adminAPI.tenants().then(result => {
      const rows = result.data || []
      setTenants(rows)
      setTenantId(current => current || rows[0]?._id || '')
    }).catch(e => setError(e.message))
  }, [platform])
  useEffect(() => { load(tenantId).catch(e => setError(e.message)) }, [tenantId])
  const action = async fn => {
    setBusy(true); setError(''); setMessage('')
    try { await fn(); await load(tenantId); setMessage('已保存'); setReason(''); setProfileReason(''); setNewAdmin({ username: '', name: '', password: '' }) }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const plan = snapshot?.standard
  const tenant = snapshot?.tenant
  const fields = [
    ['monthlyPlatformYuan', '平台订阅费（元/月）'], ['setupYuan', '首次上线费（元）'],
    ['activeClientLimit', '包含在管客户数'], ['includedStaffSeats', '包含服务人员账号'],
    ['includedAdminSeats', '包含机构管理员账号'], ['extraSeatMonthlyYuan', '额外账号（元/人/月）'],
    ['aiMonthlyYuan', 'AI 功能费（元/月）'], ['aiIncludedSupplierCostYuan', 'AI 含第三方成本额度（元/月）'],
  ]
  const formFields = (value, setter) => <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, margin: '16px 0' }}>
    {fields.map(([key, label]) => <label key={key}>{label}<input className="form-input" type="number" min="0" step={['activeClientLimit', 'includedStaffSeats', 'includedAdminSeats'].includes(key) ? '1' : '0.01'} value={value[key] ?? ''} onChange={e => setter({ ...value, [key]: e.target.value })} /></label>)}
  </div>
  if (!platform && admin?.role !== 'superadmin') return <div className="page">仅超级管理员可查看套餐。</div>
  return <div className="page sp-page">
    <div className="page-header"><div><h1 className="page-title">机构服务与收费</h1><p className="page-subtitle">每家企业独立配置服务、价格与账号额度。</p></div></div>
    {error && <p style={{ color: '#b42318' }}>{error}</p>}{message && <p style={{ color: '#087f5b' }}>{message}</p>}
    {platform && tenants.length > 0 && <div className="sp-toolbar"><label>当前机构<select className="form-input" value={tenantId} onChange={e => setTenantId(e.target.value)}>{tenants.map(t => <option key={t._id} value={t._id}>{t.name} · {t.legalName || '企业待核验'}</option>)}</select></label><a className="btn btn-secondary" href="/tenants">机构管理</a></div>}
    {tenant && <>
      <section className="card sp-hero">
        <div className="sp-hero-top"><div className="sp-brand">{tenant.name.slice(0, 1)}</div><div className="sp-heading"><div className="sp-eyebrow">机构档案 <span>/{tenant.code}</span></div><h2>{tenant.name}</h2><p>{tenant.legalName || '待核验企业全称'}</p></div><span className={`sp-status ${tenant.status === 'active' ? 'is-active' : ''}`}>{tenant.status === 'active' ? '运营中' : '待接入'}</span></div>
        <div className="sp-service-head"><h3>服务范围</h3><span>{tenant.serviceProfileSaved ? '平台已记录' : '待按协议核对'}</span></div>
        <div className="sp-service-grid">{services.map(([code, label]) => <div key={code} className={`sp-service ${tenant.serviceScope?.includes(code) ? 'is-selected' : ''}`}><span>{tenant.serviceScope?.includes(code) ? '✓' : '＋'}</span>{label}</div>)}</div>
        {tenant.serviceScopeNote && <p className="sp-note">{tenant.serviceScopeNote}</p>}
        <p className="sp-footnote">{tenant.serviceProfileSaved ? '配置已保存。' : '以上为系统模块建议清单。'}实际交付和收费以双方协议及验收为准；此处不直接开通功能。</p>
      </section>
      {platform && <details className="card sp-editor"><summary>编辑签约企业与服务范围 <span>填写变更依据后保存</span></summary>
        <div className="sp-editor-body"><label>签约企业全称<input className="form-input" maxLength={120} value={profileForm.legalName} onChange={e => setProfileForm({ ...profileForm, legalName: e.target.value })} /></label>
        <div className="sp-choice-grid">{services.map(([code, label]) => <label key={code}><input type="checkbox" checked={profileForm.serviceScope.includes(code)} onChange={e => setProfileForm({ ...profileForm, serviceScope: e.target.checked ? [...profileForm.serviceScope, code] : profileForm.serviceScope.filter(item => item !== code) })} />{label}</label>)}</div>
        <div className="sp-fields"><label>服务说明<input className="form-input" maxLength={500} value={profileForm.serviceScopeNote} onChange={e => setProfileForm({ ...profileForm, serviceScopeNote: e.target.value })} placeholder="交付方式、上线安排等" /></label><label>配置依据<input className="form-input" maxLength={500} value={profileReason} onChange={e => setProfileReason(e.target.value)} placeholder="例如：根据双方服务清单确认" /></label></div>
        <button className="btn btn-primary" disabled={busy || profileReason.trim().length < 4 || !profileForm.legalName.trim() || !profileForm.serviceScope.length} onClick={() => action(() => adminAPI.saveTenantServiceProfile(tenantId, { ...profileForm, reason: profileReason }))}>保存服务配置</button></div>
      </details>}
      <section className="card sp-commercial"><div className="sp-section-title"><div><span className="sp-eyebrow">商务条款</span><h2>{tenant.commercialPlan === 'standard' ? '本机构专属报价' : '独立合作协议'}</h2></div><span className="sp-tag">{tenant.commercialPlan === 'standard' ? '标准套餐 · 可协商' : '独立协议'}</span></div>
      {tenant.commercialPlan !== 'standard' ? <div className="sp-legacy"><p>嘉医汇的价格与账号人数按独立协议执行，不套用新机构标准价。</p><a className="btn btn-secondary" href="/agreements">查看合作协议与收费</a></div> : <>
        <div className="sp-metrics"><div><small>平台订阅</small><strong>{yuan(tenant.terms.monthlyPlatformYuan)}<em>/月</em></strong></div><div><small>首次上线</small><strong>{yuan(tenant.terms.setupYuan)}</strong></div><div><small>在管客户</small><strong>{tenant.terms.activeClientLimit}<em>人</em></strong></div><div><small>包含账号</small><strong>{tenant.terms.includedStaffSeats} + {tenant.terms.includedAdminSeats}<em>个</em></strong></div></div>
        <div className="sp-seat"><span>服务人员 <strong>{tenant.usage.staff}/{tenant.staffLimit}</strong></span><span>机构管理员 <strong>{tenant.usage.admins}/{tenant.adminLimit}</strong></span><span>预计超额账号费 <strong>{yuan(tenant.estimatedMonthlySeatFeeYuan)}/月</strong></span></div>
        <p className="sp-footnote">实际费用以双方确认的月度账单为准；页面不自动扣费。</p>
        {platform && <details className="sp-inner-details"><summary>调整本机构协商价格与包含人数</summary><p className="sp-footnote">仅更新本机构配置；合同与账单仍需双方确认。</p>
          {formFields(termsForm, setTermsForm)}
          <label>协商或变更依据<input className="form-input" value={reason} onChange={e => setReason(e.target.value)} placeholder="例如：双方确认增加两个服务人员名额" /></label>
          <button className="btn btn-primary" style={{ marginTop: 12 }} disabled={busy || reason.trim().length < 4} onClick={() => action(() => adminAPI.saveTenantCommercialTerms(tenantId, termsForm, reason))}>保存本机构条款</button>
        </details>}
        {platform && tenant.status === 'active' && <><div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', marginTop: 20 }}>
          <label>额外服务账号额度<input className="form-input" type="number" min="0" max="500" value={extras.extraStaffSeats} onChange={e => setExtras({ ...extras, extraStaffSeats: e.target.value })} /></label>
          <label>额外管理员账号额度<input className="form-input" type="number" min="0" max="500" value={extras.extraAdminSeats} onChange={e => setExtras({ ...extras, extraAdminSeats: e.target.value })} /></label>
          <button className="btn btn-primary" disabled={busy} onClick={() => action(() => adminAPI.setTenantSeats(tenantId, extras))}>保存账号额度</button>
        </div><p style={{ color: '#667' }}>增加额度只允许开户；额外账号费按实际启用且超出包含名额的账号估算。</p>
        <h3 style={{ marginTop: 24 }}>新增机构管理员</h3><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
          <label>用户名<input className="form-input" value={newAdmin.username} onChange={e => setNewAdmin({ ...newAdmin, username: e.target.value })} /></label>
          <label>姓名<input className="form-input" value={newAdmin.name} onChange={e => setNewAdmin({ ...newAdmin, name: e.target.value })} /></label>
          <label>初始密码<input className="form-input" type="password" value={newAdmin.password} onChange={e => setNewAdmin({ ...newAdmin, password: e.target.value })} /></label>
          <button className="btn" disabled={busy || tenant.usage.admins >= tenant.adminLimit} onClick={() => action(() => platform ? adminAPI.createTenantAdmin(tenantId, newAdmin) : adminAPI.createOwnTenantAdmin(newAdmin))}>创建账号</button>
        </div><p style={{ color: '#667' }}>机构可在本机构额度内自行创建管理员；超额由平台先扩容。初始密码须 10–128 位，首次登录强制修改。</p>
      </>}
      {tenant.status !== 'active' && <p className="sp-footnote">待接入机构尚未开放账号和客户业务；启用前须完成跨机构隔离验收。</p>}
      </>}
      </section>
    </>}
    {plan && <details className="card sp-template"><summary>新机构标准模板 <span>仅用于以后新建的机构</span></summary>
      <p>平台订阅 {yuan(plan.monthlyPlatformYuan)}/月，首次上线 {yuan(plan.setupYuan)}；最多 {plan.activeClientLimit} 名在管客户，含 {plan.includedStaffSeats} 个服务账号和 {plan.includedAdminSeats} 个管理员账号。超额账号 {yuan(plan.extraSeatMonthlyYuan)}/人/月。可选 AI {yuan(plan.aiMonthlyYuan)}/月，含第三方成本额度 {yuan(plan.aiIncludedSupplierCostYuan)}/月。</p>
      <p style={{ color: '#667' }}>只影响此后新建机构；已有机构配置和协议不自动变更。账单仍需人工核对。</p>
      {platform && <><h3>修改标准模板</h3>{formFields(standardForm, setStandardForm)}<button className="btn btn-primary" disabled={busy} onClick={() => action(() => adminAPI.saveStandardPlan(standardForm, plan.revision || 0))}>保存标准模板</button></>}
    </details>}
  </div>
}
