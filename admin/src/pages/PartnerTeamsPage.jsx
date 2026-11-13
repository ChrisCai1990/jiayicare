import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminAPI } from '../api'

const card = { background: '#fff', border: '1px solid #dbe5de', borderRadius: 10, padding: 18, marginBottom: 16 }
const row = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }
const yuan = cents => `¥${(Number(cents || 0) / 100).toFixed(2)}`
const typeName = type => type === 'staff' ? '员工' : '市场合伙人'
const activityName = value => value === 'service' ? '服务' : '推广'
const ruleText = rule => !rule ? '未设置' : rule.calculationType === 'percentage'
  ? `${(rule.basisPoints / 100).toFixed(2)}%` : `${yuan(rule.amountCents)}／笔`

export default function PartnerTeamsPage() {
  const [staff, setStaff] = useState([])
  const [partners, setPartners] = useState([])
  const [relations, setRelations] = useState([])
  const [teams, setTeams] = useState([])
  const [earnings, setEarnings] = useState({ rows: [], count: 0, page: 1, pageSize: 10 })
  const [leaderType, setLeaderType] = useState('staff')
  const [leaderId, setLeaderId] = useState('')
  const [memberDrafts, setMemberDrafts] = useState({})
  const [selectedLeader, setSelectedLeader] = useState('')
  const [drafts, setDrafts] = useState({})
  const [payment, setPayment] = useState({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const people = type => type === 'staff' ? staff : partners
  const name = (type, id) => people(type).find(item => String(item._id) === String(id))?.name || '已停用人员'
  const load = async (page = 1) => {
    const [employees, market, team, teamList, ledger] = await Promise.all([
      adminAPI.employees({ limit: 500 }), adminAPI.marketPartners(),
      adminAPI.partnerTeamRelations(), adminAPI.partnerTeams(),
      adminAPI.partnerTeamEarnings({ page }),
    ])
    setStaff((employees.data || []).filter(item => item.staffStatus === 'active'))
    setPartners((market.data || []).filter(item => item.status === 'active'))
    setRelations(team.data || [])
    setTeams(teamList.data || [])
    setEarnings(ledger.data || { rows: [], count: 0, page, pageSize: 10 })
    const next = {}
    for (const relation of team.data || []) for (const activity of ['promotion', 'service']) {
      const current = relation.rules.find(rule => rule.activity === activity)
      next[`${relation._id}:${activity}`] = { calculationType: current?.calculationType || 'percentage',
        value: current ? current.calculationType === 'percentage' ? String(current.basisPoints / 100)
          : String(current.amountCents / 100) : '0' }
    }
    setDrafts(next)
  }
  useEffect(() => { load().catch(error => setMessage(error.message)) }, [])

  const run = async action => {
    setBusy(true); setMessage('')
    try { await action(); await load(earnings.page); setMessage('已保存') }
    catch (error) { setMessage(error.message || '操作失败') }
    finally { setBusy(false) }
  }
  const visible = useMemo(() => relations.filter(item => !selectedLeader
    || `${item.leaderType}:${item.leaderId}` === selectedLeader), [relations, selectedLeader])
  const leaderOptions = teams.map(item => ({ key: `${item.leaderType}:${item.leaderId}`,
    label: `${item.leaderName} · ${typeName(item.leaderType)}` }))
  const setDraft = (key, change) => setDrafts(current => ({ ...current,
    [key]: { ...current[key], ...change } }))
  const setMemberDraft = (key, change) => setMemberDrafts(current => ({ ...current,
    [key]: { memberType: 'staff', memberId: '', ...current[key], ...change } }))

  return <div className="page" style={{ maxWidth: 1240 }}>
    <div className="page-header"><div><div className="page-title">团队设置与财务审核</div>
      <div className="page-subtitle">员工和市场人员共用团队关系；推广、服务分别设置负责人收益</div></div>
      <Link className="btn" to="/partner-team-overview">查看全员团队总览</Link></div>
    {message && <p role="status" style={{ color: message === '已保存' ? '#176b4d' : '#b42318' }}>{message}</p>}
    <section style={card}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>新增负责人团队</h2>
      <p style={{ color: '#667a6d' }}>员工或市场合伙人都可独立成为负责人。市场人员须先建立<Link to="/market-partners">合伙人档案</Link>。每个人同一时间只能独立负责一个团队，或作为成员归属一个团队。</p>
      <div style={row}>
        <select aria-label="负责人类型" className="form-input" value={leaderType} onChange={event => { setLeaderType(event.target.value); setLeaderId('') }}>
          <option value="staff">员工负责人</option><option value="partner">市场负责人</option></select>
        <select aria-label="选择负责人" className="form-input" value={leaderId} onChange={event => setLeaderId(event.target.value)}>
          <option value="">选择负责人</option>{people(leaderType).map(item => <option value={item._id} key={item._id}>{item.name}</option>)}</select>
        <button className="btn btn-primary" disabled={busy || !leaderId}
          onClick={() => run(() => adminAPI.createPartnerTeam({ leaderType, leaderId }))}>新增负责人</button>
      </div>
    </section>
    <section style={card}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>负责人团队（{teams.length}）</h2>
      <select aria-label="筛选负责人" className="form-input" value={selectedLeader} onChange={event => setSelectedLeader(event.target.value)}
        style={{ maxWidth: 320, marginBottom: 12 }}><option value="">所有负责人</option>
        {leaderOptions.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select>
      {!teams.length && <p>暂无负责人团队，请先新增。</p>}
      {teams.filter(team => !selectedLeader || `${team.leaderType}:${team.leaderId}` === selectedLeader).map(team => {
        const key = `${team.leaderType}:${team.leaderId}`
        const draft = memberDrafts[key] || { memberType: 'staff', memberId: '' }
        const members = relations.filter(item => `${item.leaderType}:${item.leaderId}` === key)
        return <div key={team._id} style={{ borderTop: '1px solid #e5ebe7', padding: '14px 0' }}>
          <div style={row}><strong>{team.leaderName}（{typeName(team.leaderType)}负责人）</strong>
            <span>{members.length} 位成员</span>
            <button className="btn btn-sm" disabled={busy || members.length > 0}
              onClick={() => run(() => adminAPI.endPartnerTeam(team._id))}>结束空团队</button></div>
          <div style={{ ...row, marginTop: 10 }}>
            <select aria-label={`${team.leaderName}新增成员类型`} className="form-input" value={draft.memberType}
              onChange={event => setMemberDraft(key, { memberType: event.target.value, memberId: '' })}>
              <option value="staff">员工成员</option><option value="partner">市场成员</option></select>
            <select aria-label={`${team.leaderName}选择新成员`} className="form-input" value={draft.memberId}
              onChange={event => setMemberDraft(key, { memberId: event.target.value })}>
              <option value="">选择成员</option>{people(draft.memberType).map(item => <option value={item._id} key={item._id}>{item.name}</option>)}</select>
            <button className="btn btn-primary" disabled={busy || !draft.memberId}
              onClick={() => run(() => adminAPI.createPartnerTeamRelation({ leaderType: team.leaderType,
                leaderId: team.leaderId, memberType: draft.memberType, memberId: draft.memberId }))}>添加成员</button>
          </div>
          {members.length > 0 && <p style={{ color: '#667a6d' }}>成员：{members.map(item => `${item.memberName}（${typeName(item.memberType)}）`).join('、')}</p>}
        </div>
      })}
    </section>
    <section style={card}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>成员关系与负责人收益规则</h2>
      {!visible.length && <p>暂无生效成员关系</p>}
      {visible.map(relation => <div key={relation._id} style={{ borderTop: '1px solid #e5ebe7', padding: '14px 0' }}>
        <div style={row}><strong>{relation.leaderName}（{typeName(relation.leaderType)}）→ {relation.memberName}（{typeName(relation.memberType)}）</strong>
          <small>自 {relation.effectiveFrom?.slice(0, 10)} 生效</small>
          <button className="btn btn-sm" disabled={busy} onClick={() => {
            const reason = window.prompt('请输入结束团队关系的原因')
            if (reason?.trim()) run(() => adminAPI.endPartnerTeamRelation(relation._id, reason.trim()))
          }}>结束关系</button></div>
        {['promotion', ...(relation.memberType === 'staff' ? ['service'] : [])].map(activity => {
          const key = `${relation._id}:${activity}`
          const current = relation.rules.find(rule => rule.activity === activity)
          const draft = drafts[key] || { calculationType: 'percentage', value: '0' }
          return <div key={key} style={{ ...row, marginTop: 8 }}><span style={{ minWidth: 60 }}>{activityName(activity)}</span>
            <span>当前：{ruleText(current)}</span>
            <select aria-label={`${relation.memberName}${activityName(activity)}负责人收益方式`} className="form-input"
              value={draft.calculationType} onChange={event => setDraft(key, { calculationType: event.target.value })}>
              <option value="percentage">按成员业务量比例</option><option value="fixedAmount">按笔固定金额</option></select>
            <input aria-label={`${relation.memberName}${activityName(activity)}负责人收益数值`} className="form-input"
              type="number" min="0" max={draft.calculationType === 'percentage' ? 100 : 1000000} step="0.01"
              value={draft.value} onChange={event => setDraft(key, { value: event.target.value })}
              style={{ maxWidth: 130 }} />
            <span>{draft.calculationType === 'percentage' ? '%' : '元／笔'}</span>
            <button className="btn btn-sm" disabled={busy} onClick={() => run(() => adminAPI.savePartnerTeamRule(relation._id,
              { activity, calculationType: draft.calculationType, value: Number(draft.value) }))}>保存新版</button>
          </div>
        })}
      </div>)}
    </section>
    <section style={card}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>逐笔核对</h2>
      <div style={{ overflowX: 'auto' }}><table className="table"><thead><tr><th>订单</th><th>负责人／成员</th><th>来源</th><th>规则</th><th>基数</th><th>应计／已发</th><th>状态</th><th>登记实际转账或追回</th></tr></thead><tbody>
        {earnings.rows.map(item => <tr key={item._id}>
          <td>{item.orderId?.orderNo || String(item.orderId)}<br />{item.orderId?.serviceName}</td>
          <td>{name(item.leaderType, item.leaderId)}／{name(item.memberType, item.memberId)}</td>
          <td>{activityName(item.activity)}</td><td>v{item.ruleVersion} · {item.calculationType === 'percentage'
            ? `${item.basisPoints / 100}%` : yuan(item.fixedCents)}</td>
          <td>{yuan(item.basisCents)}</td><td>{yuan(item.accruedCents)}／{yuan(item.paidCents - item.recoveredCents)}</td>
          <td>{({ estimated: '预估', pending: '待发', paid: '已发', reversal_due: '待追回', cancelled: '已取消' })[item.status]}</td>
          <td>{['pending', 'reversal_due'].includes(item.status) && <div style={row}>
            <input className="form-input" type="number" min="0.01" step="0.01" placeholder="金额（元）"
              aria-label={`${item._id}金额`} value={payment[item._id]?.amount || ''}
              onChange={event => setPayment(old => ({ ...old, [item._id]: { ...old[item._id], amount: event.target.value } }))}
              style={{ width: 115 }} />
            <input className="form-input" placeholder="银行流水号" aria-label={`${item._id}流水号`}
              value={payment[item._id]?.reference || ''}
              onChange={event => setPayment(old => ({ ...old, [item._id]: { ...old[item._id], reference: event.target.value } }))}
              style={{ width: 145 }} />
            <button className="btn btn-sm" disabled={busy || !payment[item._id]?.amount || !payment[item._id]?.reference}
              onClick={() => run(() => item.status === 'reversal_due'
                ? adminAPI.recoverPartnerTeamEarning(item._id, payment[item._id])
                : adminAPI.payPartnerTeamEarning(item._id, payment[item._id]))}>
              {item.status === 'reversal_due' ? '登记追回' : '登记转账'}</button></div>}</td>
        </tr>)}
      </tbody></table></div>
      {!earnings.rows.length && <p>暂无逐笔记录</p>}
      <div style={row}><span>共 {earnings.count} 笔 · 第 {earnings.page} 页</span>
        <button className="btn btn-sm" disabled={earnings.page <= 1} onClick={() => load(earnings.page - 1)}>上一页</button>
        <button className="btn btn-sm" disabled={earnings.page * earnings.pageSize >= earnings.count}
          onClick={() => load(earnings.page + 1)}>下一页</button></div>
    </section>
  </div>
}
