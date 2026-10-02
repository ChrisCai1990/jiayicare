import React, { useEffect, useState } from 'react'
import { adminAPI } from '../api'
import { useAdmin } from '../App'

const yuan = value => `¥${Number(value || 0).toLocaleString('zh-CN')}`

export default function SaasPlanPage() {
  const { admin } = useAdmin()
  const platform = admin?.role === 'platformSuper'
  const [tenants, setTenants] = useState([])
  const [tenantId, setTenantId] = useState(admin?.tenantId || '')
  const [snapshot, setSnapshot] = useState(null)
  const [extras, setExtras] = useState({ extraStaffSeats: 0, extraAdminSeats: 0 })
  const [newAdmin, setNewAdmin] = useState({ username: '', name: '', password: '' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async id => {
    const result = await adminAPI.saasPlan(id)
    setSnapshot(result.data)
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
    try { await fn(); await load(tenantId); setMessage('已保存'); setNewAdmin({ username: '', name: '', password: '' }) }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const plan = snapshot?.standard
  const tenant = snapshot?.tenant
  if (!platform && admin?.role !== 'superadmin') return <div className="page">仅超级管理员可查看套餐。</div>
  return <div className="page" style={{ maxWidth: 1050 }}>
    <div className="page-header"><div><h1 className="page-title">标准机构套餐</h1><p className="page-subtitle">新机构采用标准套餐；嘉医汇按双方独立协议执行。</p></div></div>
    {error && <p style={{ color: '#b42318' }}>{error}</p>}{message && <p style={{ color: '#087f5b' }}>{message}</p>}
    {plan && <div className="card" style={{ padding: 24, marginBottom: 16 }}>
      <h2>标准报价</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 18 }}>
        <p><strong>{yuan(plan.monthlyPlatformYuan)}/月</strong><br />平台订阅，最多 {plan.activeClientLimit} 名在管客户</p>
        <p><strong>{yuan(plan.setupYuan)}</strong><br />首次上线，一次性</p>
        <p><strong>{plan.includedStaffSeats}＋{plan.includedAdminSeats} 个账号</strong><br />服务人员＋机构管理员</p>
        <p><strong>{yuan(plan.extraSeatMonthlyYuan)}/人/月</strong><br />超出包含名额后按已启用账号计</p>
        <p><strong>{yuan(plan.aiMonthlyYuan)}/月</strong><br />AI 可选，含每月 {yuan(plan.aiIncludedSupplierCostYuan)} 的第三方成本额度</p>
      </div>
      <p style={{ color: '#667' }}>在管客户指有效服务期内的客户；历史档案不计入。AI 超额按可核对的供应商实际成本结算，未用额度不结转。客户数与月度账单目前仍须人工核对，页面不自动扣费。</p>
    </div>}
    {platform && tenants.length > 0 && <div className="card" style={{ padding: 22, marginBottom: 16 }}><label>查看机构　<select className="form-input" value={tenantId} onChange={e => setTenantId(e.target.value)}>{tenants.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}</select></label></div>}
    {tenant && <div className="card" style={{ padding: 24 }}>
      <h2>{tenant.name} · {tenant.commercialPlan === 'standard' ? '标准套餐' : '独立协议'}</h2>
      {tenant.commercialPlan !== 'standard' ? <p>此机构不适用标准套餐限额和标准报价；请查看双方签署的合作协议。</p> : <>
        <p>当前已启用：服务人员 <strong>{tenant.usage.staff}</strong> / {tenant.staffLimit}；机构管理员 <strong>{tenant.usage.admins}</strong> / {tenant.adminLimit}。</p>
        <p>按当前账号数估算，额外账号费 <strong>{yuan(tenant.estimatedMonthlySeatFeeYuan)}/月</strong>；实际结算以双方确认的月度账单为准。</p>
        {platform && <><div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', marginTop: 20 }}>
          <label>额外服务账号额度<input className="form-input" type="number" min="0" max="500" value={extras.extraStaffSeats} onChange={e => setExtras({ ...extras, extraStaffSeats: e.target.value })} /></label>
          <label>额外管理员账号额度<input className="form-input" type="number" min="0" max="500" value={extras.extraAdminSeats} onChange={e => setExtras({ ...extras, extraAdminSeats: e.target.value })} /></label>
          <button className="btn btn-primary" disabled={busy} onClick={() => action(() => adminAPI.setTenantSeats(tenantId, extras))}>保存账号额度</button>
        </div><p style={{ color: '#667' }}>增加额度只允许开户；额外账号费按实际启用且超出包含名额的账号估算。</p>
        <h3 style={{ marginTop: 24 }}>新增机构管理员</h3><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
          <label>用户名<input className="form-input" value={newAdmin.username} onChange={e => setNewAdmin({ ...newAdmin, username: e.target.value })} /></label>
          <label>姓名<input className="form-input" value={newAdmin.name} onChange={e => setNewAdmin({ ...newAdmin, name: e.target.value })} /></label>
          <label>初始密码<input className="form-input" type="password" value={newAdmin.password} onChange={e => setNewAdmin({ ...newAdmin, password: e.target.value })} /></label>
          <button className="btn" disabled={busy} onClick={() => action(() => adminAPI.createTenantAdmin(tenantId, newAdmin))}>创建账号</button>
        </div><p style={{ color: '#667' }}>初始密码须 10–128 位，首次登录强制修改；凭据请通过安全渠道交付。</p></>}
      </>}
    </div>}
  </div>
}
