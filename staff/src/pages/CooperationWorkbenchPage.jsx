import React, { useEffect, useState } from 'react'
import { API_ORIGIN, getToken, staffAPI } from '../api'
import { useStaff } from '../App'

const monthNow = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).format(new Date())
const cash = cents => `¥${(Number(cents || 0) / 100).toFixed(2)}`
const yuan = amount => `¥${Number(amount || 0).toFixed(2)}`
const statuses = { estimated: '预估', pending: '待审核', confirmed: '已确认', paid: '已发放', cancelled: '已取消' }
const card = { padding: 18, marginBottom: 16 }

export default function CooperationWorkbenchPage() {
  const { staff } = useStaff()
  const [month, setMonth] = useState(monthNow)
  const [data, setData] = useState(null)
  const [overview, setOverview] = useState(null)
  const [commissions, setCommissions] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let alive = true
    setError('')
    Promise.all([staffAPI.getCooperationWorkbench(), staffAPI.getMyPartnerOverview(month), staffAPI.getMyCommission({ page: 1, limit: 30 })])
      .then(([identity, business, earnings]) => {
        if (!alive) return
        setData(identity.data); setOverview(business.data); setCommissions(earnings.data)
      }).catch(e => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [month])
  async function download(row) {
    setBusy(true); setError('')
    try {
      const parts = String(row.id).split(':')
      const path = parts[0] === 'expert' ? `/expert/${parts[1]}/${parts[2]}` : `/${row.id}`
      const res = await fetch(`${API_ORIGIN}/api/staff/cooperation/files${path}`, {
        headers: { Authorization: `Bearer ${getToken()}` }, cache: 'no-store', referrerPolicy: 'no-referrer',
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || '下载失败')
      const url = URL.createObjectURL(await res.blob())
      const link = document.createElement('a')
      link.href = url; link.download = row.name || '已签合作协议'; document.body.appendChild(link); link.click(); link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <div className="page">
    <div className="page-header"><div><h1 className="page-title">我的合作</h1><p className="page-subtitle">本人资料、协议、团队、业务与收益</p></div></div>
    {error && <p role="alert" style={{ color: '#B42318' }}>{error}</p>}
    {!data ? <div className="card" style={card}>正在读取工作台…</div> : <>
      <section className="card" style={card}>
        <h2>我的资料</h2>
        <p>{data.profile.name} · {data.profile.title || data.profile.role} · {data.profile.department || '未设置部门'}</p>
        <p>手机号：{data.profile.phone || '未登记'}　{staff?.role === 'psychologist' ? '资料变更请联系机构管理员' : <a href="/profile">管理个人资料</a>}</p>
        <p>如同时具有市场合伙人身份，可用登记手机号进入<a href="https://admin.jiaycare.com/market-partner" target="_blank" rel="noreferrer">市场合伙人工作台</a>。两种身份的业务与收益分别核对。</p>
        {staff?.role === 'psychologist' && <p>心理咨询师服务报酬按双方已签协议核算；逐次结算记录尚未接入本页。</p>}
      </section>
      <section className="card" style={card}>
        <h2>我的协议</h2>
        {data.agreements.length ? data.agreements.map(row => <div key={row.id} style={{ padding: '10px 0', borderTop: '1px solid #E5EDE9' }}>
          <strong>{row.title}</strong> · 签署于 {row.signedDate}<div>{row.name}</div>
          <button type="button" className="btn" disabled={busy} onClick={() => download(row)}>下载手签协议</button>
        </div>) : <p>尚未归档本人协议；请联系机构管理员核对。</p>}
      </section>
      <section className="card" style={card}>
        <h2>团队成员</h2>
        {data.teams.length ? data.teams.map(team => <div key={`${team.type}:${team.id}`} style={{ marginBottom: 16 }}>
          <h3>{team.name} · {team.type === 'internal' ? '内部服务团队' : '外部专业团队'}{team.leader ? ' · 我是负责人' : ''}</h3>
          {team.members.map(member => <div key={member.id} style={{ padding: '7px 0', borderTop: '1px solid #E5EDE9' }}>{member.name} · {member.title || member.role} · {member.department || '—'}</div>)}
        </div>) : <p>当前没有关联团队。</p>}
        <p style={{ color: '#667085' }}>成员个人合同、证件和实发金额不在团队页展示。</p>
      </section>
      <section className="card" style={card}>
        <h2>业务与团队收益</h2>
        <label>查看月份 <input type="month" value={month} onChange={e => setMonth(e.target.value)}/></label>
        {overview && <>
          <p>本人推广业务归属 {cash(overview.self?.promotionCents)} · 本人服务业务归属 {cash(overview.self?.serviceCents)}</p>
          {overview.role === 'leader' && <><p>团队成员推广归属 {cash(overview.team?.promotionCents)} · 服务归属 {cash(overview.team?.serviceCents)}</p>
            <p>负责人收益应计 {cash(overview.leaderEarnings?.accruedCents)} · 已发净额 {cash(overview.leaderEarnings?.paidCents)}</p>
            {overview.members.map(member => <div key={`${member.personType}:${member.personId}`} style={{ padding: '7px 0', borderTop: '1px solid #E5EDE9' }}>{member.name} · 推广 {cash(member.promotionCents)} · 服务 {cash(member.serviceCents)}</div>)}
          </>}
          <p style={{ color: '#667085' }}>推广和服务是不同归属视角，不能相加为企业营收；本页不展示未接入的财务确认收入。</p>
        </>}
      </section>
      <section className="card" style={card}>
        <h2>我的佣金与报酬</h2>
        <p>以下为现有员工分佣记录。固定工资及尚未接入的专业服务费不显示为零元。</p>
        {commissions?.records?.length ? commissions.records.map(row => <div key={row._id} style={{ padding: '9px 0', borderTop: '1px solid #E5EDE9' }}>
          <strong>{row.productName || row.serviceItemName || '服务'}</strong> · {row.role === 'fulfiller' ? '服务激励' : '推广佣金'} · {statuses[row.status] || row.status}
          <div>订单金额 {yuan(row.orderAmount)} · 佣金 {yuan(row.commissionAmount)}</div>
        </div>) : <p>暂无已记录的本人佣金。</p>}
        {commissions?.total > 30 && staff?.role !== 'psychologist' && <p>当前显示最近30笔；完整记录请到<a href="/commission">分佣中心</a>查看。</p>}
      </section>
    </>}
  </div>
}
