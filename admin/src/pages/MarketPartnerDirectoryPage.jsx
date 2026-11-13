import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminAPI } from '../api'

const segments = [['medical', '就医板块'], ['nutrition', '营养板块'],
  ['annual', '年度管理板块'], ['consultation', '咨询板块']]
const segmentName = value => segments.find(([key]) => key === value)?.[1] || value || '历史未归类'
const card = { background: '#fff', border: '1px solid #dbe5de', borderRadius: 10, padding: 18, marginBottom: 16 }
const row = { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }
const emptyPartner = { name: '', phone: '', segment: 'medical', contractReference: '' }
const emptyMember = { name: '', phone: '', status: 'active', reason: '' }

export default function MarketPartnerDirectoryPage() {
  const [partners, setPartners] = useState([])
  const [staff, setStaff] = useState([])
  const [liaisons, setLiaisons] = useState([])
  const [accountingTeams, setAccountingTeams] = useState([])
  const [liaisonPartnerId, setLiaisonPartnerId] = useState('')
  const [liaisonStaffId, setLiaisonStaffId] = useState('')
  const [staffSearch, setStaffSearch] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [members, setMembers] = useState([])
  const [promotable, setPromotable] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [partnerForm, setPartnerForm] = useState(emptyPartner)
  const [editingPartner, setEditingPartner] = useState(null)
  const [partnerReason, setPartnerReason] = useState('')
  const [memberForm, setMemberForm] = useState(emptyMember)
  const [editingMember, setEditingMember] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadPartners = async () => {
    const [market, employees, assigned, teams] = await Promise.all([
      adminAPI.marketPartners(), adminAPI.employees({ limit: 500 }),
      adminAPI.marketPartnerLiaisons(), adminAPI.partnerTeams(),
    ])
    setPartners(market.data || [])
    setStaff((employees.data || []).filter(item => item.staffStatus === 'active'))
    setLiaisons(assigned.data || [])
    setAccountingTeams(teams.data || [])
  }
  useEffect(() => { loadPartners().catch(err => setError(err.message)) }, [])
  useEffect(() => {
    setEditingMember(null); setMemberForm(emptyMember)
    if (!selectedId) { setMembers([]); setPromotable([]); return }
    let cancelled = false
    setDetailLoading(true)
    Promise.all([adminAPI.marketPartnerTeamMembers(selectedId),
      adminAPI.marketPartnerPromotableProducts(selectedId)])
      .then(([memberResponse, productResponse]) => {
        if (!cancelled) { setMembers(memberResponse.data || []); setPromotable(productResponse.data?.rows || []) }
      })
      .catch(err => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setDetailLoading(false) })
    return () => { cancelled = true }
  }, [selectedId])
  const selected = partners.find(item => String(item._id) === selectedId)
  const liaisonByPartner = useMemo(() => new Map(liaisons.map(item => [
    String(item.partnerId?._id || item.partnerId), item.staffId?.name || '已停用员工',
  ])), [liaisons])
  const visiblePartners = useMemo(() => partners.filter(item =>
    `${item.name} ${item.phone} ${item.referralCode} ${segmentName(item.segment || item.productLine)} ${liaisonByPartner.get(String(item._id)) || ''}`
      .toLowerCase().includes(search.trim().toLowerCase())), [partners, liaisonByPartner, search])

  const run = async action => {
    setBusy(true); setError(''); setNotice('')
    try {
      await action(); await loadPartners()
      if (selectedId) {
        const response = await adminAPI.marketPartnerPromotableProducts(selectedId)
        setPromotable(response.data?.rows || [])
      }
      setNotice('已保存')
    }
    catch (err) { setError(err.message || '操作失败') }
    finally { setBusy(false) }
  }
  const savePartner = event => {
    event.preventDefault()
    run(async () => {
      if (editingPartner) {
        await adminAPI.updateMarketPartner(editingPartner._id, {
          ...partnerForm, reason: partnerReason, updatedAt: editingPartner.updatedAt })
      } else {
        const response = await adminAPI.createMarketPartner(partnerForm)
        setSelectedId(String(response.data._id))
      }
      setEditingPartner(null); setPartnerForm(emptyPartner); setPartnerReason('')
    })
  }
  const editPartner = item => {
    setEditingPartner(item)
    setPartnerForm({ name: item.name, phone: item.phone, segment: item.segment || '',
      productLine: item.productLine, contractReference: item.contractReference || '' })
    setPartnerReason('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const saveMember = event => {
    event.preventDefault()
    if (!selectedId) return
    run(async () => {
      if (editingMember) await adminAPI.updateMarketPartnerTeamMember(editingMember._id, {
        ...memberForm, reason: memberForm.reason, updatedAt: editingMember.updatedAt })
      else await adminAPI.createMarketPartnerTeamMember({ partnerId: selectedId,
        name: memberForm.name, phone: memberForm.phone })
      const response = await adminAPI.marketPartnerTeamMembers(selectedId)
      setMembers(response.data || [])
      setEditingMember(null); setMemberForm(emptyMember)
    })
  }

  return <div className="page">
    <div className="page-header"><div><div className="page-title">市场合伙人</div>
      <div className="page-subtitle">合伙人档案和团队成员名册</div></div></div>
    <div style={{ ...row, marginBottom: 16 }}>
      <Link className="btn btn-ghost" to="/commission-rules?tab=partner">设置合伙人佣金</Link>
      <Link className="btn btn-ghost" to="/partner-teams">设置团队关系与负责人收益</Link>
      <Link className="btn btn-ghost" to="/market-partner-operations">业务登记</Link>
    </div>
    {error && <p role="alert" style={{ color: '#b42318' }}>{error}</p>}
    {notice && <p role="status" style={{ color: '#176b4d' }}>{notice}</p>}
    <section style={card}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>{editingPartner ? '编辑合伙人' : '新增合伙人'}</h2>
      <form onSubmit={savePartner} style={row}>
        <input className="form-input" aria-label="合伙人名称" placeholder="姓名或机构名" value={partnerForm.name}
          onChange={event => setPartnerForm({ ...partnerForm, name: event.target.value })} required />
        <input className="form-input" aria-label="合伙人手机号" placeholder="手机号" value={partnerForm.phone}
          onChange={event => setPartnerForm({ ...partnerForm, phone: event.target.value })} required />
        <select className="form-input" aria-label="合伙人板块" value={partnerForm.segment || ''}
          disabled={editingPartner?.status === 'active'} onChange={event => setPartnerForm({ ...partnerForm, segment: event.target.value })}>
          {!partnerForm.segment && <option value="">历史未归类</option>}
          {segments.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <input className="form-input" aria-label="合伙人合同编号" placeholder="合同编号" value={partnerForm.contractReference}
          onChange={event => setPartnerForm({ ...partnerForm, contractReference: event.target.value })} />
        {editingPartner && <input className="form-input" aria-label="合伙人资料修改原因" placeholder="修改原因及依据"
          value={partnerReason} onChange={event => setPartnerReason(event.target.value)} required />}
        <button className="btn btn-primary" disabled={busy}>{editingPartner ? '保存修改' : '创建待审核合伙人'}</button>
        {editingPartner && <button type="button" className="btn btn-ghost" onClick={() => {
          setEditingPartner(null); setPartnerForm(emptyPartner); setPartnerReason('') }}>取消</button>}
      </form>
      <p style={{ color: '#667a6d', marginBottom: 0 }}>启用前须填写合作合同编号。板块仅标识合伙人方向，具体产品佣金在佣金规则页设置。</p>
    </section>
    <section style={card}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>合伙人档案</h2>
      <input className="form-input" type="search" aria-label="搜索合伙人" placeholder="搜索名称、手机、板块、对接人或推荐码"
        value={search} onChange={event => setSearch(event.target.value)} style={{ marginBottom: 12, maxWidth: 380 }} />
      <div style={{ overflowX: 'auto' }}><table className="table"><thead><tr>
        <th>名称</th><th>手机号</th><th>板块</th><th>内部对接人</th><th>推荐码</th><th>状态</th><th>操作</th>
      </tr></thead><tbody>{visiblePartners.map(item => <tr key={item._id}>
        <td>{item.name}</td><td>{item.phone}</td><td>{segmentName(item.segment || item.productLine)}</td>
        <td>{liaisonByPartner.get(String(item._id)) || '未指定'}</td>
        <td>{item.referralCode}</td><td>{item.status}</td><td>
          <button className="btn btn-sm" onClick={() => { setSelectedId(String(item._id)); setLiaisonPartnerId(String(item._id)) }}>查看产品与团队</button>{' '}
          {item.status !== 'closed' && <button className="btn btn-sm" onClick={() => editPartner(item)}>编辑</button>}{' '}
          {item.status !== 'active' && item.status !== 'closed' && <button className="btn btn-sm" disabled={busy}
            onClick={() => run(() => adminAPI.setMarketPartnerStatus(item._id, 'active'))}>启用</button>}
          {item.status === 'active' && <button className="btn btn-sm" disabled={busy}
            onClick={() => run(() => adminAPI.setMarketPartnerStatus(item._id, 'suspended'))}>暂停</button>}
        </td>
      </tr>)}</tbody></table></div>
      {!visiblePartners.length && <p>暂无匹配合伙人</p>}
    </section>
    <section style={card}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>内部市场对接人</h2>
      <p style={{ color: '#667a6d' }}>一名员工可对接多个市场合伙人；每位市场合伙人当前只指定一名内部对接人。对接关系独立于合伙人自己的团队，不改变客户归属、业务量或佣金。</p>
      <div style={row}>
        <select className="form-input" aria-label="选择对接的市场合伙人" value={liaisonPartnerId}
          onChange={event => setLiaisonPartnerId(event.target.value)}>
          <option value="">选择市场合伙人</option>
          {partners.filter(item => item.status !== 'closed').map(item => <option key={item._id} value={item._id}>{item.name} · {item.phone}</option>)}
        </select>
        <input className="form-input" type="search" aria-label="搜索内部员工" placeholder="搜索员工姓名或岗位"
          value={staffSearch} onChange={event => setStaffSearch(event.target.value)} />
        <select className="form-input" aria-label="选择内部对接员工" value={liaisonStaffId}
          onChange={event => setLiaisonStaffId(event.target.value)}>
          <option value="">选择内部员工</option>
          {staff.filter(item => `${item.name} ${item.role || ''} ${item.title || ''}`.toLowerCase()
            .includes(staffSearch.trim().toLowerCase())).map(item =>
            <option key={item._id} value={item._id}>{item.name} · {item.role}</option>)}
        </select>
        <button className="btn btn-primary" disabled={busy || !liaisonPartnerId || !liaisonStaffId}
          onClick={() => run(() => adminAPI.createMarketPartnerLiaison({ partnerId: liaisonPartnerId,
            staffId: liaisonStaffId }))}>指定对接人</button>
      </div>
      <div style={{ overflowX: 'auto', marginTop: 14 }}><table className="table"><thead><tr>
        <th>内部员工</th><th>市场合伙人</th><th>合伙人团队</th><th>生效时间</th><th>操作</th>
      </tr></thead><tbody>{liaisons.map(item => {
        const team = accountingTeams.find(row => String(row.leaderId) === String(item.partnerId?._id)
          && row.leaderType === 'partner')
        return <tr key={item._id}><td>{item.staffId?.name || '已停用员工'}</td>
          <td>{item.partnerId?.name || '已停用合伙人'}</td>
          <td>{team ? `${team.memberCount} 位成员` : '尚未建立核算团队'}</td>
          <td>{item.effectiveFrom?.slice(0, 10) || '-'}</td><td>
            <button className="btn btn-sm" disabled={busy} onClick={() => {
              const reason = window.prompt('请输入更换或结束内部对接人的原因')
              if (reason?.trim()) run(() => adminAPI.endMarketPartnerLiaison(item._id, reason.trim()))
            }}>结束／更换</button></td></tr>
      })}</tbody></table></div>
      {!liaisons.length && <p>尚未指定内部对接人</p>}
    </section>
    <section style={card}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>可推广产品与佣金{selected && ` · ${selected.name}`}</h2>
      {!selected ? <p>在上方选择合伙人后查看。</p> : detailLoading ? <p>加载中...</p> : <>
        {selected.status !== 'active' && <p style={{ color: '#a65b00' }}>该合伙人尚未启用，以下产品已配置规则，但目前不能使用推荐码推广。</p>}
        <div style={{ overflowX: 'auto' }}><table className="table"><thead><tr>
          <th>产品／服务包</th><th>类别</th><th>推广佣金</th><th>计佣方式</th><th>状态</th>
        </tr></thead><tbody>{promotable.map(item => <tr key={item.productId}>
          <td>{item.name}</td><td>{item.category}</td>
          <td>首次 {item.firstPercent}%{item.kind === 'annual' && item.renewals.length > 0
            ? `；${item.renewals.map(year => `第${year.year}年 ${year.percent}%`).join('；')}` : ''}
            {item.tierPercents.length > 0 && `；阶梯 ${item.tierPercents.join('%／')}%`}</td>
          <td>{item.kind === 'annual' ? '年度首续' : item.kind === 'every' ? '每次' : '仅首次'}
            {item.directReferralRequired && ' · 须亲自推荐'}</td>
          <td>{item.canPromote ? '可推广' : '待启用'}</td>
        </tr>)}</tbody></table></div>
        {!promotable.length && <p>尚无已生效且在售的产品佣金规则。</p>}
        <Link className="btn btn-ghost" to={`/commission-rules?tab=partner&partnerId=${encodeURIComponent(selectedId)}`}>设置／修改该合伙人产品佣金</Link>
      </>}
    </section>
    <section style={card}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>合伙人团队{selected && ` · ${selected.name}`}</h2>
      {!selected ? <p>在上方选择合伙人后登记团队成员。</p> : <>
        <p style={{ color: '#667a6d' }}>这里保留历史联系人名册，不参与业务归因。参与核算的成员须建立自己的合伙人档案，并在<Link to="/partner-teams">合伙人团队</Link>中关联负责人和设置规则。</p>
        <form onSubmit={saveMember} style={row}>
          <input className="form-input" aria-label="团队成员姓名" placeholder="成员姓名" value={memberForm.name}
            onChange={event => setMemberForm({ ...memberForm, name: event.target.value })} required />
          <input className="form-input" aria-label="团队成员手机号" placeholder="成员手机号" value={memberForm.phone}
            onChange={event => setMemberForm({ ...memberForm, phone: event.target.value })} required />
          {editingMember && <><select className="form-input" aria-label="团队成员状态" value={memberForm.status}
            onChange={event => setMemberForm({ ...memberForm, status: event.target.value })}>
            <option value="active">在团队</option><option value="suspended">已暂停</option>
          </select><input className="form-input" aria-label="团队成员修改原因" placeholder="修改原因及依据"
            value={memberForm.reason} onChange={event => setMemberForm({ ...memberForm, reason: event.target.value })} required /></>}
          <button className="btn btn-primary" disabled={busy}>{editingMember ? '保存成员修改' : '添加团队成员'}</button>
          {editingMember && <button type="button" className="btn btn-ghost" onClick={() => {
            setEditingMember(null); setMemberForm(emptyMember) }}>取消</button>}
        </form>
        <div style={{ overflowX: 'auto', marginTop: 14 }}><table className="table"><thead><tr>
          <th>成员</th><th>手机号</th><th>状态</th><th>操作</th>
        </tr></thead><tbody>{members.map(item => <tr key={item._id}><td>{item.name}</td><td>{item.phone}</td>
          <td>{item.status === 'active' ? '在团队' : '已暂停'}</td><td><button className="btn btn-sm" onClick={() => {
            setEditingMember(item); setMemberForm({ name: item.name, phone: item.phone, status: item.status, reason: '' })
          }}>编辑</button></td></tr>)}</tbody></table></div>
        {!members.length && <p>暂未登记团队成员</p>}
      </>}
    </section>
  </div>
}
