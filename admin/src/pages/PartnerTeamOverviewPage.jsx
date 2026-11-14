import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminAPI } from '../api'
import './partnerWorkspace.css'

const money = cents => `¥${(Number(cents || 0) / 100).toFixed(2)}`
const key = (type, id) => `${type}:${id}`

export default function PartnerTeamOverviewPage() {
  const [staff, setStaff] = useState([])
  const [partners, setPartners] = useState([])
  const [teams, setTeams] = useState([])
  const [relations, setRelations] = useState([])
  const [volumes, setVolumes] = useState([])
  const [teamVolumes, setTeamVolumes] = useState([])
  const [earnings, setEarnings] = useState([])
  const [type, setType] = useState('staff')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([adminAPI.employees({ limit: 500 }), adminAPI.marketPartners(),
      adminAPI.partnerTeams(), adminAPI.partnerTeamRelations(),
      adminAPI.partnerPeopleVolume(), adminAPI.partnerTeamBusinessVolume(),
      adminAPI.partnerTeamSummary()])
      .then(([s, p, t, r, v, tv, e]) => {
        setStaff((s.data || []).filter(item => item.staffStatus === 'active'))
        setPartners((p.data || []).filter(item => item.status === 'active'))
        setTeams(t.data || []); setRelations(r.data || [])
        setVolumes(v.data || []); setTeamVolumes(tv.data || []); setEarnings(e.data || [])
      }).catch(err => setError(err.message || '加载失败'))
  }, [])

  const people = type === 'staff' ? staff : partners
  const visible = useMemo(() => people.filter(item => `${item.name || ''} ${item.phone || ''}`
    .toLowerCase().includes(search.trim().toLowerCase())), [people, search])
  const pages = Math.max(1, Math.ceil(visible.length / 10))
  const current = Math.min(page, pages)
  const lookup = (personType, id) => (personType === 'staff' ? staff : partners)
    .find(item => String(item._id) === String(id))?.name || '已停用人员'
  const amount = (personType, id, activity) => volumes.find(row => row.personType === personType
    && String(row.personId) === String(id) && row.activity === activity)?.amountCents || 0
  const teamAmount = (leaderType, leaderId, memberType, memberId, activity) => teamVolumes
    .filter(row => row.leaderType === leaderType && String(row.leaderId) === String(leaderId)
      && row.memberType === memberType && String(row.memberId) === String(memberId)
      && row.activity === activity).reduce((sum, row) => sum + row.amountCents, 0)

  return <div className="page">
    <div className="page-header"><div><div className="page-title">合伙人团队总览</div>
      <div className="page-subtitle">按人员查看团队、推广与服务业务量；企业营收请到经营与分账总览核对</div></div>
      <Link className="btn btn-ghost" to="/partner-teams">团队规则设置 ↗</Link></div>
    {error && <p role="alert" style={{ color: '#b42318' }}>{error}</p>}
    <section className="partner-ui__card partner-ui__toolbar">
      <div className="partner-ui__tabs" role="group" aria-label="人员类型">
        <button aria-pressed={type === 'staff'} onClick={() => { setType('staff'); setPage(1) }}>员工 {staff.length}</button>
        <button aria-pressed={type === 'partner'} onClick={() => { setType('partner'); setPage(1) }}>市场合伙人 {partners.length}</button>
      </div>
        <input className="form-input" aria-label="搜索人员" placeholder="搜索姓名或手机号" value={search}
          onChange={event => { setSearch(event.target.value); setPage(1) }} style={{ maxWidth: 280 }} />
    </section>
    <div className="partner-ui__metrics">
      <div className="partner-ui__metric"><span>当前人员</span><strong>{visible.length}</strong></div>
      <div className="partner-ui__metric"><span>负责团队</span><strong>{teams.filter(row => row.leaderType === type).length}</strong></div>
      <div className="partner-ui__metric"><span>团队成员关系</span><strong>{relations.filter(row => row.leaderType === type).length}</strong></div>
      <div className="partner-ui__metric partner-ui__metric--accent"><span>负责人收益应计</span><strong>{money(earnings.filter(row => row.leaderType === type).reduce((sum, row) => sum + row.accruedCents, 0))}</strong></div>
    </div>
    {visible.slice((current - 1) * 10, current * 10).map(person => {
      const personKey = key(type, person._id)
      const team = teams.find(row => key(row.leaderType, row.leaderId) === personKey)
      const parent = relations.find(row => key(row.memberType, row.memberId) === personKey)
      const members = relations.filter(row => key(row.leaderType, row.leaderId) === personKey)
      const leaderEarnings = earnings.filter(row => key(row.leaderType, row.leaderId) === personKey)
      return <section key={personKey} className="partner-ui__card">
        <div className="partner-ui__person-head">
          <div><div className="partner-ui__person-name">{person.name}</div>
            <span className="partner-ui__muted">{type === 'staff' ? '员工' : '市场合伙人'}</span></div>
          <span className={`partner-ui__badge${team ? '' : ' partner-ui__badge--amber'}`}>{team ? `负责人 · ${members.length} 位成员` : parent
            ? `团队成员 · 负责人 ${lookup(parent.leaderType, parent.leaderId)}` : '独立人员'}</span>
        </div>
        <div className="partner-ui__metrics">
          <div className="partner-ui__metric"><span>本人推广业务量</span><strong>{money(amount(type, person._id, 'promotion'))}</strong></div>
          <div className="partner-ui__metric"><span>本人服务业务量</span><strong>{money(amount(type, person._id, 'service'))}</strong></div>
          {team && <><div className="partner-ui__metric"><span>成员归属推广 / 服务</span><strong>{money(members.reduce((sum, row) => sum + teamAmount(type, person._id, row.memberType, row.memberId, 'promotion'), 0))} / {money(members.reduce((sum, row) => sum + teamAmount(type, person._id, row.memberType, row.memberId, 'service'), 0))}</strong></div>
            <div className="partner-ui__metric partner-ui__metric--accent"><span>负责人收益应计 / 已发</span><strong>{money(leaderEarnings.reduce((sum, row) => sum + row.accruedCents, 0))} / {money(leaderEarnings.reduce((sum, row) => sum + row.paidCents - row.recoveredCents, 0))}</strong></div></>}
        </div>
        {team && <>
          <div className="partner-ui__members">
            <strong>团队成员</strong>{members.length ? members.map(row => <div key={row._id} className="partner-ui__member">
              <span>{row.memberName} <small className="partner-ui__muted">{row.memberType === 'staff' ? '员工' : '市场合伙人'}</small></span>
              <span className="partner-ui__muted">推广 {money(teamAmount(type, person._id, row.memberType, row.memberId, 'promotion'))} · 服务 {money(teamAmount(type, person._id, row.memberType, row.memberId, 'service'))}</span>
            </div>) : <p>暂无成员</p>}
          </div>
        </>}
      </section>
    })}
    {!visible.length && <section className="partner-ui__card">暂无匹配人员</section>}
    <div className="partner-ui__pagination">
      <button className="btn" disabled={current <= 1} onClick={() => setPage(current - 1)}>上一页</button>
      <span>第 {current} / {pages} 页 · 共 {visible.length} 人</span>
      <button className="btn" disabled={current >= pages} onClick={() => setPage(current + 1)}>下一页</button>
    </div>
    <p className="partner-ui__muted">推广与服务是同一笔实收的不同归属视角，不可相加为企业营收。负责人收益是单独的激励成本。</p>
  </div>
}
