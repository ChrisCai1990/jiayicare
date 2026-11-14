import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminAPI } from '../api'
import './partnerWorkspace.css'

const segments = [['medical', '就医板块'], ['nutrition', '营养板块'],
  ['annual', '年度管理板块'], ['consultation', '咨询板块']]
const segmentName = value => segments.find(([key]) => key === value)?.[1] || value || '历史未归类'
const row = { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }
const emptyPartner = { name: '', phone: '', segment: 'medical', contractReference: '' }

export default function MarketPartnerDirectoryPage() {
  const [partners, setPartners] = useState([])
  const [staff, setStaff] = useState([])
  const [liaisons, setLiaisons] = useState([])
  const [accountingTeams, setAccountingTeams] = useState([])
  const [liaisonPartnerId, setLiaisonPartnerId] = useState('')
  const [liaisonStaffId, setLiaisonStaffId] = useState('')
  const [staffSearch, setStaffSearch] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [promotable, setPromotable] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [partnerForm, setPartnerForm] = useState(emptyPartner)
  const [editingPartner, setEditingPartner] = useState(null)
  const [partnerReason, setPartnerReason] = useState('')
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
    if (!selectedId) { setPromotable([]); return }
    let cancelled = false
    setDetailLoading(true)
    adminAPI.marketPartnerPromotableProducts(selectedId)
      .then(productResponse => {
        if (!cancelled) setPromotable(productResponse.data?.rows || [])
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
  const totalPages = Math.max(1, Math.ceil(visiblePartners.length / 10))
  const currentPage = Math.min(page, totalPages)
  const displayedPartners = visiblePartners.slice((currentPage - 1) * 10, currentPage * 10)
  const selectedTeam = accountingTeams.find(item => item.leaderType === 'partner'
    && String(item.leaderId) === selectedId)

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
      setShowForm(false)
    })
  }
  const editPartner = item => {
    setEditingPartner(item)
    setPartnerForm({ name: item.name, phone: item.phone, segment: item.segment || '',
      productLine: item.productLine, contractReference: item.contractReference || '' })
    setPartnerReason('')
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return <div className="page">
    <div className="page-header"><div><div className="page-title">市场合伙人</div>
      <div className="page-subtitle">管理合伙人档案与内部对接关系，查看每人的可推广产品</div></div>
      <button className="btn btn-primary" onClick={() => setShowForm(value => !value)}>
        {showForm ? '收起表单' : '+ 新增合伙人'}</button></div>
    <div style={{ ...row, marginBottom: 16 }}>
      <Link className="btn btn-ghost" to="/commission-rules?tab=partner">设置合伙人佣金</Link>
      <Link className="btn btn-ghost" to="/partner-teams">设置团队关系与负责人收益</Link>
      <Link className="btn btn-ghost" to="/partner-workbench/operations">打开业务登记</Link>
    </div>
    {error && <p role="alert" style={{ color: '#b42318' }}>{error}</p>}
    {notice && <p role="status" style={{ color: '#176b4d' }}>{notice}</p>}
    {showForm && <section className="partner-ui__card">
      <h2>{editingPartner ? '编辑合伙人' : '新增合伙人'}</h2>
      <p className="partner-ui__muted">启用前须填写合作合同编号。板块标识合作方向，具体推广产品在佣金规则页设置。</p>
      <form onSubmit={savePartner}><div className="partner-ui__form-grid">
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
      </div><div className="partner-ui__form-actions">
        <button className="btn btn-primary" disabled={busy}>{editingPartner ? '保存修改' : '创建待审核合伙人'}</button>
        {editingPartner && <button type="button" className="btn btn-ghost" onClick={() => {
          setEditingPartner(null); setPartnerForm(emptyPartner); setPartnerReason(''); setShowForm(false) }}>取消</button>}
      </div>
      </form>
    </section>}
    <div className="partner-ui__directory"><section className="partner-ui__card">
      <h2>合伙人档案 <span className="partner-ui__muted">· {visiblePartners.length} 位</span></h2>
      <input className="form-input" type="search" aria-label="搜索合伙人" placeholder="搜索名称、手机、板块、对接人或推荐码"
        value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} style={{ marginBottom: 14, maxWidth: 420 }} />
      <div className="partner-ui__table-wrap"><table className="table"><thead><tr>
        <th>合伙人</th><th>合作板块</th><th>内部对接</th><th>状态</th><th>操作</th>
      </tr></thead><tbody>{displayedPartners.map(item => <tr key={item._id} className={selectedId === String(item._id) ? 'is-selected' : ''}>
        <td><strong>{item.name}</strong><br /><small className="partner-ui__muted">{item.phone}</small></td>
        <td>{segmentName(item.segment || item.productLine)}</td>
        <td>{liaisonByPartner.get(String(item._id)) || '未指定'}</td>
        <td><span className={`partner-ui__badge${item.status === 'active' ? '' : ' partner-ui__badge--amber'}`}>
          {({ active: '已启用', draft: '待启用', suspended: '已暂停', pending: '待审核', closed: '已结束' })[item.status] || item.status}</span></td><td>
          <button className="btn btn-sm" aria-pressed={selectedId === String(item._id)} onClick={() => {
            setSelectedId(String(item._id)); setLiaisonPartnerId(String(item._id)) }}>查看详情</button>{' '}
          {item.status !== 'closed' && <button className="btn btn-sm" onClick={() => editPartner(item)}>编辑</button>}{' '}
          {item.status !== 'active' && item.status !== 'closed' && <button className="btn btn-sm" disabled={busy}
            onClick={() => run(() => adminAPI.setMarketPartnerStatus(item._id, 'active'))}>启用</button>}
          {item.status === 'active' && <button className="btn btn-sm" disabled={busy}
            onClick={() => run(() => adminAPI.setMarketPartnerStatus(item._id, 'suspended'))}>暂停</button>}
        </td>
      </tr>)}</tbody></table></div>
      {!visiblePartners.length && <p>暂无匹配合伙人</p>}
      <div className="partner-ui__pagination"><span>第 {currentPage} / {totalPages} 页</span>
        <button className="btn btn-sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>上一页</button>
        <button className="btn btn-sm" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>下一页</button></div>
    </section>
    <aside className="partner-ui__card partner-ui__detail">
      <h2>{selected ? selected.name : '合伙人详情'}</h2>
      {!selected ? <p className="partner-ui__muted">从左侧选择合伙人，即可查看可推广产品、佣金与团队关系。</p> : <>
        <div className="partner-ui__form-actions"><span className="partner-ui__badge">{segmentName(selected.segment || selected.productLine)}</span>
          <span className="partner-ui__muted">推荐码 {selected.referralCode || '—'}</span></div>
        <p className="partner-ui__muted">内部对接人：{liaisonByPartner.get(selectedId) || '未指定'}<br />
          核算团队：{selectedTeam ? `${selectedTeam.memberCount} 位成员` : '未建立'}</p>
        <h3 style={{ fontSize: 15, margin: '18px 0 8px' }}>可推广产品与佣金 · {promotable.length} 项</h3>
        {detailLoading ? <p>正在加载…</p> : <div className="partner-ui__detail-list">
          {promotable.map(item => <div className="partner-ui__product" key={item.productId}>
            <strong>{item.name}</strong><small>{item.category} · {item.kind === 'annual' ? '年度首续' : item.kind === 'every' ? '每次' : '仅首次'}
              {item.directReferralRequired && ' · 须亲自推荐'}</small>
            <small>首次 {item.firstPercent}%{item.kind === 'annual' && item.renewals.length > 0
              ? `；${item.renewals.map(year => `第${year.year}年 ${year.percent}%`).join('；')}` : ''}
              {item.kind === 'every' && item.repeatPercent != null ? `；再次亲自推荐 ${item.repeatPercent}%` : ''}
              {item.tierPercents.length > 0 && `；阶梯 ${item.tierPercents.join('%／')}%`}</small>
          </div>)}
          {!promotable.length && <p className="partner-ui__muted">暂无已生效且在售的推广佣金规则。</p>}
        </div>}
        {selected.status !== 'active' && <p className="partner-ui__muted">该合伙人尚未启用，推荐码当前不能用于推广。</p>}
        <div className="partner-ui__form-actions">
          <Link className="btn btn-primary" to={`/commission-rules?tab=partner&partnerId=${encodeURIComponent(selectedId)}`}>编辑推广佣金</Link>
          <Link className="btn btn-ghost" to="/partner-teams">设置核算团队</Link>
        </div>
      </>}
    </aside></div>
    <section className="partner-ui__card">
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
      <div className="partner-ui__table-wrap" style={{ marginTop: 16 }}><table className="table"><thead><tr>
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
  </div>
}
