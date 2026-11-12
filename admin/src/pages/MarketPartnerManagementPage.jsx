import React, { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { adminAPI } from '../api'

const LINES = [
  ['consumer365', '365会员'], ['annualAdvisor', '年度顾问'], ['premiumAdvisor', '高端顾问'],
  ['weightManagement', '体重管理'], ['chronicManagement', '慢性病管理'],
  ['medicalAssist', '单次就医协助'], ['oneStopMedical', '一站式就医'],
  ['assessment', '单次评估'], ['psychology', '心理咨询'], ['rehabilitation', '运动复健'],
  ['testing', '检测'], ['supplements', '营养素补充'],
]
const ROLES = [['familyDoctor', '健康顾问'], ['nutritionist', '营养师'], ['healthManager', '健管专员'], ['medicalAssistant', '就医专员'], ['psychologist', '心理咨询师'], ['rehabSpecialist', '运动复健师'], ['specialist', '专科医师'], ['tcmDoctor', '中医师']]
const inputStyle = { padding: '9px 10px', border: '1px solid #cbd8d1', borderRadius: 6, minWidth: 150 }
const boxStyle = { background: '#fff', border: '1px solid #dbe5de', borderRadius: 10, padding: 18, marginBottom: 16 }
const toBasisPoints = value => Math.round(Number(value) * 100)

export default function MarketPartnerManagementPage() {
  const [searchParams] = useSearchParams()
  const orderFromUrl = searchParams.get('order')
  const [partners, setPartners] = useState([])
  const [rules, setRules] = useState([])
  const [teamRules, setTeamRules] = useState([])
  const [teamIncentives, setTeamIncentives] = useState([])
  const [teamRevenue, setTeamRevenue] = useState([])
  const [commissions, setCommissions] = useState([])
  const [receipts, setReceipts] = useState([])
  const [offlineOrders, setOfflineOrders] = useState([])
  const [attributedOrders, setAttributedOrders] = useState([])
  const [leadEvents, setLeadEvents] = useState([])
  const [customerHistories, setCustomerHistories] = useState([])
  const [offlineRefunds, setOfflineRefunds] = useState([])
  const [lossReviews, setLossReviews] = useState([])
  const [products, setProducts] = useState([])
  const [eligiblePackages, setEligiblePackages] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [partner, setPartner] = useState({ name: '', phone: '', productLine: 'consumer365', contractReference: '' })
  const [editingPartner, setEditingPartner] = useState(null)
  const [partnerChangeReason, setPartnerChangeReason] = useState('')
  const [rule, setRule] = useState({ productId: '', productLine: 'consumer365', kind: 'annual', firstPercent: '20', tiers: '', renewals: '2:10,3:5,4:5,5:5', effectiveFrom: '', directReferralRequired: false, quickCloseEnabled: false, retentionFloorPercent: '' })
  const [editingRule, setEditingRule] = useState(null)
  const [ruleEndDates, setRuleEndDates] = useState({})
  const [preview, setPreview] = useState({ ruleId: '', paidYuan: '', directCostYuan: '', teamCostYuan: '', transactionCostYuan: '', periodNumber: '1', monthlyQualifiedCount: '1', directReferral: false })
  const [previewResult, setPreviewResult] = useState(null)
  const [team, setTeam] = useState({ productId: '', specificationLabel: '', role: 'familyDoctor', trigger: 'service_completed', ruleType: 'percentage', percent: '0', amountYuan: '0', effectiveFrom: '' })
  const [editingTeam, setEditingTeam] = useState(null)
  const [teamEndDates, setTeamEndDates] = useState({})
  const [teamClaim, setTeamClaim] = useState({ orderId: '', staffId: '', role: 'familyDoctor', serviceItemKey: '', serviceEvidenceId: '', note: '' })
  const [teamClaimOrder, setTeamClaimOrder] = useState(null)
  const [teamPaymentReferences, setTeamPaymentReferences] = useState({})
  const [teamRecoveries, setTeamRecoveries] = useState({})
  const [payouts, setPayouts] = useState({})
  const [recoveries, setRecoveries] = useState({})
  const [receipt, setReceipt] = useState({ orderId: '', amountYuan: '', reference: '', receivedAt: '', evidence: '' })
  const [offlineOrder, setOfflineOrder] = useState({ patientId: '', productId: '', specificationLabel: '', priceYuan: '', partnerCode: '', contractReference: '' })
  const [customerHistory, setCustomerHistory] = useState({ orderId: '', priorPaidPeriods: '0', evidence: '' })
  const [leadEvent, setLeadEvent] = useState({ patientId: '', productId: '', partnerCode: '', directReferral: false, evidence: '' })
  const [offlineRefund, setOfflineRefund] = useState({ orderId: '', amountYuan: '', reference: '', evidence: '', reason: '' })
  const [lossReview, setLossReview] = useState({ orderId: '', terminatedAt: '', reason: '', evidence: '' })
  const [accountingKey, setAccountingKey] = useState(orderFromUrl || '')
  const [accounting, setAccounting] = useState(null)
  const [accountingError, setAccountingError] = useState('')

  const refresh = async () => {
    const [p, r, t, productsResponse, packagesResponse, commissionsResponse, receiptsResponse, teamIncentivesResponse, offlineOrdersResponse, offlineRefundsResponse, lossReviewsResponse, attributedOrdersResponse, customerHistoriesResponse, leadEventsResponse, teamRevenueResponse] = await Promise.all([
      adminAPI.marketPartners(), adminAPI.marketPartnerRules(), adminAPI.teamIncentiveRules(), adminAPI.products({}), adminAPI.marketPartnerEligiblePackages(), adminAPI.marketPartnerCommissions(), adminAPI.marketPartnerReceipts(), adminAPI.teamIncentives(), adminAPI.marketPartnerOfflineOrders(), adminAPI.marketPartnerOfflineRefunds(), adminAPI.marketPartnerLossReviews(), adminAPI.marketPartnerAttributedOrders(), adminAPI.marketPartnerCustomerHistories(), adminAPI.marketPartnerLeadEvents(), adminAPI.marketPartnerTeamRevenue(),
    ])
    setPartners(p.data || [])
    setRules(r.data || [])
    setTeamRules(t.data || [])
    setProducts(productsResponse.data || [])
    setEligiblePackages(packagesResponse.data || [])
    setCommissions(commissionsResponse.data?.rows || [])
    setReceipts(receiptsResponse.data || [])
    setTeamIncentives(teamIncentivesResponse.data || [])
    setTeamRevenue(teamRevenueResponse.data || [])
    setOfflineOrders(offlineOrdersResponse.data || [])
    setAttributedOrders(attributedOrdersResponse.data || [])
    setCustomerHistories(customerHistoriesResponse.data || [])
    setLeadEvents(leadEventsResponse.data || [])
    setOfflineRefunds(offlineRefundsResponse.data || [])
    setLossReviews(lossReviewsResponse.data || [])
  }
  useEffect(() => { refresh().catch(err => setError(err.message)) }, [])
  useEffect(() => {
    if (!orderFromUrl) return
    setAccountingKey(orderFromUrl); setAccounting(null); setAccountingError('')
    adminAPI.marketPartnerOrderAccounting(orderFromUrl)
      .then(response => setAccounting(response.data))
      .catch(err => setAccountingError(err.message || '订单核算读取失败'))
  }, [orderFromUrl])

  const run = async action => {
    setBusy(true); setError(''); setNotice('')
    try { await action(); await refresh(); setNotice('已保存') }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  const submitPartner = e => {
    e.preventDefault()
    run(async () => {
      if (editingPartner) await adminAPI.updateMarketPartner(editingPartner._id, {
        ...partner, reason: partnerChangeReason, updatedAt: editingPartner.updatedAt })
      else await adminAPI.createMarketPartner(partner)
      setEditingPartner(null); setPartnerChangeReason('')
    })
  }
  const loadPartner = item => {
    setEditingPartner(item)
    setPartner({ name: item.name, phone: item.phone, productLine: item.productLine,
      contractReference: item.contractReference || '' })
    setPartnerChangeReason('')
    document.getElementById('market-partner-profile-form')?.scrollIntoView({ behavior: 'smooth' })
  }
  const submitRule = e => {
    e.preventDefault()
    const tierBasisPoints = rule.tiers.trim() ? rule.tiers.split(',').map(part => toBasisPoints(part.trim())) : []
    const renewalBasisPoints = rule.renewals.trim() ? rule.renewals.split(',').map(part => {
      const [year, percent] = part.split(':').map(value => value.trim())
      return { year: Number(year), basisPoints: toBasisPoints(percent) }
    }) : []
    const payload = { productId: rule.productId, productLine: rule.productLine,
      sourceType: rule.productLine === 'consumer365' ? 'servicePackage' : 'product',
      kind: rule.kind, firstBasisPoints: toBasisPoints(rule.firstPercent), tierBasisPoints,
      renewalBasisPoints, effectiveFrom: new Date(rule.effectiveFrom).toISOString(),
      directReferralRequired: rule.directReferralRequired, quickCloseEnabled: rule.quickCloseEnabled,
      retentionFloorBasisPoints: rule.retentionFloorPercent === '' ? null : toBasisPoints(rule.retentionFloorPercent) }
    run(async () => {
      if (editingRule) await adminAPI.updateMarketPartnerRule(editingRule._id, { ...payload, updatedAt: editingRule.updatedAt })
      else await adminAPI.createMarketPartnerRule(payload)
      setEditingRule(null)
    })
  }
  const submitTeam = e => {
    e.preventDefault()
    const payload = { productId: team.productId,
      specificationLabel: team.specificationLabel, role: team.role, trigger: team.trigger,
      ruleType: team.ruleType, basisPoints: toBasisPoints(team.percent),
      amountCents: Math.round(Number(team.amountYuan) * 100), effectiveFrom: new Date(team.effectiveFrom).toISOString() }
    run(async () => {
      if (editingTeam) await adminAPI.updateTeamIncentiveRule(editingTeam._id, { ...payload, updatedAt: editingTeam.updatedAt })
      else await adminAPI.createTeamIncentiveRule(payload)
      setEditingTeam(null)
    })
  }
  const loadRule = (item, edit) => {
    setEditingRule(edit ? item : null)
    setRule({ productId: String(item.productId), productLine: item.productLine, kind: item.kind,
      firstPercent: String((item.firstBasisPoints || 0) / 100),
      tiers: (item.tierBasisPoints || []).map(value => value / 100).join(','),
      renewals: (item.renewalBasisPoints || []).map(value => `${value.year}:${value.basisPoints / 100}`).join(','),
      effectiveFrom: edit ? item.effectiveFrom?.slice(0, 10) || '' : '',
      directReferralRequired: !!item.directReferralRequired, quickCloseEnabled: !!item.quickCloseEnabled,
      retentionFloorPercent: item.retentionFloorBasisPoints == null ? '' : String(item.retentionFloorBasisPoints / 100) })
    document.getElementById('market-partner-rule-form')?.scrollIntoView({ behavior: 'smooth' })
  }
  const loadTeam = (item, edit) => {
    setEditingTeam(edit ? item : null)
    setTeam({ productId: String(item.productId), specificationLabel: item.specificationLabel || '', role: item.role,
      trigger: item.trigger, ruleType: item.ruleType, percent: String((item.basisPoints || 0) / 100),
      amountYuan: String((item.amountCents || 0) / 100), effectiveFrom: edit ? item.effectiveFrom?.slice(0, 10) || '' : '' })
    document.getElementById('team-incentive-rule-form')?.scrollIntoView({ behavior: 'smooth' })
  }
  const loadTeamClaimOrder = async () => {
    setTeamClaimOrder(null); setError('')
    try { setTeamClaimOrder((await adminAPI.marketPartnerOrderAccounting(teamClaim.orderId.trim())).data.order) }
    catch (err) { setError(err.message || '订单子项读取失败') }
  }
  const productName = id => products.find(item => String(item._id) === String(id))?.name
    || eligiblePackages.find(item => String(item._id) === String(id))?.name || String(id || '')
  const runPreview = e => {
    e.preventDefault(); setBusy(true); setError(''); setPreviewResult(null)
    adminAPI.previewMarketPartnerRule({ ruleId: preview.ruleId, paidCents: Math.round(Number(preview.paidYuan) * 100),
      directCostCents: Math.round(Number(preview.directCostYuan) * 100),
      teamIncentiveCents: Math.round(Number(preview.teamCostYuan) * 100),
      transactionCostCents: Math.round(Number(preview.transactionCostYuan) * 100),
      periodNumber: Number(preview.periodNumber), monthlyQualifiedCount: Number(preview.monthlyQualifiedCount),
      directReferral: preview.directReferral, paidAt: new Date().toISOString() })
      .then(response => setPreviewResult(response.data)).catch(err => setError(err.message)).finally(() => setBusy(false))
  }
  const setPayout = (id, value) => setPayouts(current => ({ ...current, [id]: { ...current[id], ...value } }))
  const pay = item => {
    const form = payouts[item._id] || {}
    const amountCents = Math.round(Number(form.amountYuan) * 100)
    run(() => adminAPI.recordMarketPartnerPayout(item._id, { amountCents, paymentReference: form.reference }))
  }
  const recover = item => {
    const form = recoveries[item._id] || {}
    run(() => adminAPI.recordMarketPartnerRecovery(item._id, { amountCents: Math.round(Number(form.amountYuan) * 100), recoveryReference: form.reference }))
  }
  const loadAccounting = async event => {
    event.preventDefault(); setAccounting(null); setAccountingError('')
    try { setAccounting((await adminAPI.marketPartnerOrderAccounting(accountingKey.trim())).data) }
    catch (err) { setAccountingError(err.message || '订单核算读取失败') }
  }
  const yuan = cents => `¥${(Number(cents || 0) / 100).toFixed(2)}`

  return <div style={{ maxWidth: 1100 }}>
    <div className="page-header"><div><div className="page-title">市场合伙人</div><div className="page-subtitle">审核合伙人、按产品配置佣金和服务团队激励</div></div></div>
    <section style={boxStyle}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>订单一页核算</h2>
      <p style={{ color: '#667a6d' }}>按同一订单查看客户、产品、实收、合伙人推广费和服务团队绩效。预估与已发分开显示；履约成本和交易成本未录入时不计算最终毛利。</p>
      <form onSubmit={loadAccounting} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input style={{ ...inputStyle, minWidth: 260 }} aria-label="核算订单号或ID" placeholder="订单号或订单 ID" value={accountingKey} onChange={event => setAccountingKey(event.target.value)} required />
        <button className="btn btn-primary">查询订单核算</button>
      </form>
      {accountingError && <p role="alert" style={{ color: '#B42318' }}>{accountingError}</p>}
      {accounting && <div style={{ marginTop: 14, lineHeight: 1.8 }}>
        <div><strong>{accounting.order.serviceName}</strong>{accounting.order.specificationLabel && ` · ${accounting.order.specificationLabel}`} · {accounting.order.orderNo}</div>
        <div>客户：{accounting.order.user?.name || '—'}；合伙人：{accounting.order.marketPartnerId?.name || '无'}；登记者：{accounting.order.initiatedByStaff?.name || '—'}；内部推广人：{accounting.order.referrerId?.name || '无'}</div>
        <div>订单标价 {yuan(Math.round(Number(accounting.order.servicePrice || 0) * 100))}；现金实收 {yuan(accounting.cash.paidCents)}；成功退款 {yuan(accounting.cash.refundedCents)}；净实收 <strong>{yuan(accounting.cash.netCents)}</strong>；支付状态 {accounting.order.paymentStatus}</div>
        <div>子产品／团队营收：{accounting.revenueAllocation?.length ? accounting.revenueAllocation.map(item => `${item.name} → ${ROLES.find(([role]) => role === item.teamRole)?.[1] || item.teamRole} ${yuan(item.amountCents)}（${item.sharePercent}%）`).join('；') : '未配置组合拆解'}</div>
        <div>服务团队：{accounting.order.servicePerformers?.length ? accounting.order.servicePerformers.map(item => `${ROLES.find(([role]) => role === item.role)?.[1] || item.role} ${item.staffId?.name || '待确认'}`).join('、') : '待确认'}</div>
        <div>合伙人推广费：{accounting.partnerCommission.length ? accounting.partnerCommission.map(item => `${yuan(item.accruedCents)}（${item.status}，已发 ${yuan(item.paidCents)}，已追回 ${yuan(item.recoveredCents)}）`).join('；') : '暂无计提'}</div>
        <div>内部推广与服务绩效：{accounting.staffCommissions.length ? accounting.staffCommissions.map(item => `${item.staffId?.name || '员工'} ${item.role === 'referrer' ? '推广' : '服务'} ${yuan(Math.round(Number(item.commissionAmount || 0) * 100))}（${item.status}）`).join('；') : '暂无计提'}</div>
        <div>服务团队专项激励：{accounting.teamIncentives.length ? accounting.teamIncentives.map(item => `${item.staffId?.name || '员工'} ${yuan(item.amountCents)}（${item.status}，已发 ${yuan(item.paidCents)}）`).join('；') : '暂无计提'}</div>
        <div>线下到账凭据：{accounting.receipts.length ? accounting.receipts.map(item => `${yuan(item.amountCents)}（${item.status}）`).join('；') : '无'}</div>
      </div>}
    </section>
    <section style={boxStyle}>
      <h2 style={{fontSize:18,marginTop:0}}>组合产品团队业务营收</h2>
      <p style={{color:'#667a6d'}}>按已付款订单的子产品拆解快照汇总，成功退款实时扣减；这是业务营收归属，员工佣金在下方单独核算。</p>
      {teamRevenue.length ? <table className="table"><thead><tr><th>负责团队</th><th>子产品</th><th>订单数</th><th>净实收归属</th></tr></thead><tbody>
        {teamRevenue.map(item=><tr key={`${item.teamRole}:${item.childProductId}`}><td>{ROLES.find(([role])=>role===item.teamRole)?.[1] || item.teamRole}</td><td>{item.name}</td><td>{item.orderCount}</td><td>{yuan(item.amountCents)}</td></tr>)}
      </tbody></table> : <div>暂无已付款且完成拆解配置的组合产品订单</div>}
    </section>
    {error && <div role="alert" style={{ color: '#b42318', marginBottom: 12 }}>{error}</div>}
    {notice && <div style={{ color: '#176b4d', marginBottom: 12 }}>{notice}</div>}
    <section style={boxStyle}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>合伙人</h2>
      <form id="market-partner-profile-form" onSubmit={submitPartner} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input style={inputStyle} aria-label="姓名" placeholder="姓名或机构名" value={partner.name} onChange={e => setPartner({ ...partner, name: e.target.value })} required />
        <input style={inputStyle} aria-label="手机号" placeholder="登记手机号" value={partner.phone} onChange={e => setPartner({ ...partner, phone: e.target.value })} required />
        <select style={inputStyle} aria-label="授权产品线" value={partner.productLine} disabled={editingPartner?.status === 'active'} onChange={e => setPartner({ ...partner, productLine: e.target.value })}>{LINES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <input style={inputStyle} aria-label="合同编号" placeholder="合同编号" value={partner.contractReference} onChange={e => setPartner({ ...partner, contractReference: e.target.value })} required />
        {editingPartner && <input style={{ ...inputStyle, minWidth: 210 }} aria-label="资料修改原因" placeholder="修改原因及依据" value={partnerChangeReason} onChange={e => setPartnerChangeReason(e.target.value)} required />}
        <button className="btn btn-primary" disabled={busy}>{editingPartner ? '保存合伙人资料修改' : '创建待审核合伙人'}</button>
        {editingPartner && <button type="button" className="btn" onClick={() => setEditingPartner(null)}>取消编辑</button>}
      </form>
      <div style={{ overflowX: 'auto', marginTop: 14 }}><table className="table"><thead><tr><th>名称</th><th>手机号</th><th>产品线</th><th>推荐码</th><th>状态</th><th>操作</th></tr></thead><tbody>
        {partners.map(item => <tr key={item._id}><td>{item.name}</td><td>{item.phone}</td><td>{LINES.find(([value]) => value === item.productLine)?.[1] || item.productLine}</td><td>{item.referralCode}</td><td>{item.status}</td><td>
          {item.status !== 'closed' && <button className="btn btn-sm" disabled={busy} onClick={() => loadPartner(item)}>编辑资料</button>}
          {item.status !== 'active' && <button className="btn btn-sm" disabled={busy} onClick={() => run(() => adminAPI.setMarketPartnerStatus(item._id, 'active'))}>启用</button>}
          {item.status === 'active' && <button className="btn btn-sm" disabled={busy} onClick={() => run(() => adminAPI.setMarketPartnerStatus(item._id, 'suspended'))}>暂停</button>}
          {!!item.changeHistory?.length && <details><summary>修改记录（{item.changeHistory.length}）</summary>{item.changeHistory.map((change, index) => <div key={index} style={{ maxWidth: 280, fontSize: 12, padding: 4 }}>{change.at?.slice(0, 16).replace('T', ' ')} · {change.reason}<br />{change.before?.name} / {change.before?.productLine} → {change.after?.name} / {change.after?.productLine}</div>)}</details>}
        </td></tr>)}
      </tbody></table></div>
    </section>
    <section style={boxStyle}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>首次沟通与亲自促成证据</h2>
      <p style={{ color: '#667a6d' }}>请在首次方案沟通时登记，时间由服务器生成且不可回填。另一位管理员审核通过后，新订单才会冻结这条证据，用于亲自推荐和 7 天促成奖励。</p>
      <form onSubmit={e => { e.preventDefault(); run(() => adminAPI.submitMarketPartnerLeadEvent(leadEvent)) }} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input style={inputStyle} aria-label="沟通客户ID" placeholder="客户ID" value={leadEvent.patientId} onChange={e => setLeadEvent({ ...leadEvent, patientId: e.target.value })} required />
        <select style={inputStyle} aria-label="沟通商品" value={leadEvent.productId} onChange={e => setLeadEvent({ ...leadEvent, productId: e.target.value })} required><option value="">选择商品</option>{products.filter(item => item.status === 'on').map(item => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
        <input style={inputStyle} aria-label="沟通合伙人码" placeholder="合伙人推荐码" value={leadEvent.partnerCode} onChange={e => setLeadEvent({ ...leadEvent, partnerCode: e.target.value })} required />
        <label><input type="checkbox" checked={leadEvent.directReferral} onChange={e => setLeadEvent({ ...leadEvent, directReferral: e.target.checked })} /> 亲自促成</label>
        <input style={{ ...inputStyle, minWidth: 280 }} aria-label="沟通证据" placeholder="首次沟通具体内容与依据" value={leadEvent.evidence} onChange={e => setLeadEvent({ ...leadEvent, evidence: e.target.value })} required />
        <button className="btn btn-primary" disabled={busy}>登记首次沟通</button>
      </form>
      <div style={{ overflowX: 'auto', marginTop: 14 }}><table className="table"><thead><tr><th>合伙人</th><th>客户</th><th>商品</th><th>记录时间</th><th>亲自促成</th><th>状态</th><th>操作</th></tr></thead><tbody>
        {leadEvents.map(item => <tr key={item._id}><td>{item.partnerId?.name || '—'}</td><td>{item.patientId?.name || '—'}</td><td>{item.productId?.name || '—'}</td><td>{item.occurredAt?.slice(0, 16).replace('T', ' ')}</td><td>{item.directReferral ? '是' : '否'}</td><td>{item.status}</td><td>{item.status === 'requested' && <><button className="btn btn-sm" disabled={busy} onClick={() => run(() => adminAPI.reviewMarketPartnerLeadEvent(item._id, 'approved'))}>审核通过</button> <button className="btn btn-sm" disabled={busy} onClick={() => run(() => adminAPI.reviewMarketPartnerLeadEvent(item._id, 'rejected'))}>退回</button></>}</td></tr>)}
      </tbody></table></div>
    </section>
    <section style={boxStyle}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>30 天内正式流失审核</h2>
      <p style={{ color: '#667a6d' }}>仅合同解除或服务正式终止可提交；未登录、未回复、暂停和投诉不自动算流失。另一位管理员审核通过后重算佣金。</p>
      <form onSubmit={e => { e.preventDefault(); run(() => adminAPI.submitMarketPartnerLossReview({ ...lossReview, terminatedAt: new Date(lossReview.terminatedAt).toISOString() })) }} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input style={inputStyle} aria-label="流失订单ID" placeholder="订单ID" value={lossReview.orderId} onChange={e => setLossReview({ ...lossReview, orderId: e.target.value })} required />
        <input style={inputStyle} aria-label="正式终止时间" type="datetime-local" value={lossReview.terminatedAt} onChange={e => setLossReview({ ...lossReview, terminatedAt: e.target.value })} required />
        <input style={inputStyle} aria-label="终止原因" placeholder="正式终止原因" value={lossReview.reason} onChange={e => setLossReview({ ...lossReview, reason: e.target.value })} required />
        <input style={inputStyle} aria-label="终止依据" placeholder="合同或服务终止依据" value={lossReview.evidence} onChange={e => setLossReview({ ...lossReview, evidence: e.target.value })} required />
        <button className="btn btn-primary" disabled={busy}>提交审核</button>
      </form>
      <div style={{ overflowX: 'auto', marginTop: 14 }}><table className="table"><thead><tr><th>订单</th><th>终止日期</th><th>原因</th><th>状态</th><th>操作</th></tr></thead><tbody>
        {lossReviews.map(item => <tr key={item._id}><td>{item.orderId?.orderNo || item.orderId}</td><td>{item.terminatedAt?.slice(0, 10)}</td><td>{item.reason}</td><td>{item.status}</td><td>{item.status === 'requested' && <><button className="btn btn-sm" disabled={busy} onClick={() => run(() => adminAPI.reviewMarketPartnerLoss(item._id, 'approved'))}>审核通过</button> <button className="btn btn-sm" disabled={busy} onClick={() => run(() => adminAPI.reviewMarketPartnerLoss(item._id, 'rejected'))}>退回</button></>}</td></tr>)}
      </tbody></table></div>
    </section>
    <section style={boxStyle}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>线下退款复核</h2>
      <p style={{ color: '#667a6d' }}>登记已经完成的退款转账。另一位管理员复核后，订单与合伙人佣金按实际退款金额重算。</p>
      <form onSubmit={e => { e.preventDefault(); run(() => adminAPI.submitMarketPartnerOfflineRefund(offlineRefund.orderId, { ...offlineRefund, amountCents: Math.round(Number(offlineRefund.amountYuan) * 100) })) }} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input style={inputStyle} aria-label="退款订单ID" placeholder="订单ID" value={offlineRefund.orderId} onChange={e => setOfflineRefund({ ...offlineRefund, orderId: e.target.value })} required />
        <input style={inputStyle} aria-label="退款金额元" type="number" min="0.01" step="0.01" placeholder="已退金额 元" value={offlineRefund.amountYuan} onChange={e => setOfflineRefund({ ...offlineRefund, amountYuan: e.target.value })} required />
        <input style={inputStyle} aria-label="退款流水号" placeholder="退款流水号" value={offlineRefund.reference} onChange={e => setOfflineRefund({ ...offlineRefund, reference: e.target.value })} required />
        <input style={inputStyle} aria-label="退款凭据" placeholder="转账凭据说明" value={offlineRefund.evidence} onChange={e => setOfflineRefund({ ...offlineRefund, evidence: e.target.value })} required />
        <input style={inputStyle} aria-label="退款原因" placeholder="退款原因" value={offlineRefund.reason} onChange={e => setOfflineRefund({ ...offlineRefund, reason: e.target.value })} />
        <button className="btn btn-primary" disabled={busy}>提交退款复核</button>
      </form>
      <div style={{ overflowX: 'auto', marginTop: 14 }}><table className="table"><thead><tr><th>订单</th><th>金额</th><th>流水号</th><th>状态</th><th>操作</th></tr></thead><tbody>
        {offlineRefunds.map(item => <tr key={item._id}><td>{item.order?.orderNo || item.order}</td><td>¥{Number(item.amount || 0).toFixed(2)}</td><td>{item.marketPartnerOfflineReference}</td><td>{item.status}</td><td>{['requested', 'processing'].includes(item.status) && <button className="btn btn-sm" disabled={busy} onClick={() => run(() => adminAPI.confirmMarketPartnerOfflineRefund(item._id))}>确认已退款</button>}</td></tr>)}
      </tbody></table></div>
    </section>
    <section style={boxStyle}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>非商城线下合同订单</h2>
      <p style={{ color: '#667a6d' }}>按已上架的线下商品原价或规格价建单。建单后登记线下实收，再在下方提交收款凭据复核。</p>
      <form onSubmit={e => { e.preventDefault(); run(() => adminAPI.createMarketPartnerOfflineOrder({ ...offlineOrder, priceCents: Math.round(Number(offlineOrder.priceYuan) * 100) })) }} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input style={inputStyle} aria-label="客户ID" placeholder="客户ID" value={offlineOrder.patientId} onChange={e => setOfflineOrder({ ...offlineOrder, patientId: e.target.value })} required />
        <select style={inputStyle} aria-label="线下商品" value={offlineOrder.productId} onChange={e => setOfflineOrder({ ...offlineOrder, productId: e.target.value })} required><option value="">选择线下商品</option>{products.filter(item => item.status === 'on' && item.paymentChannel === 'offline').map(item => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
        <input style={inputStyle} aria-label="合同规格" placeholder="规格（可留空）" value={offlineOrder.specificationLabel} onChange={e => setOfflineOrder({ ...offlineOrder, specificationLabel: e.target.value })} />
        <input style={inputStyle} aria-label="合同金额元" type="number" min="0.01" step="0.01" placeholder="商品价格 元" value={offlineOrder.priceYuan} onChange={e => setOfflineOrder({ ...offlineOrder, priceYuan: e.target.value })} required />
        <input style={inputStyle} aria-label="线下推荐码" placeholder="合伙人推荐码" value={offlineOrder.partnerCode} onChange={e => setOfflineOrder({ ...offlineOrder, partnerCode: e.target.value })} required />
        <input style={inputStyle} aria-label="线下合同编号" placeholder="合同编号" value={offlineOrder.contractReference} onChange={e => setOfflineOrder({ ...offlineOrder, contractReference: e.target.value })} required />
        <button className="btn btn-primary" disabled={busy}>建立待付款订单</button>
      </form>
      <div style={{ overflowX: 'auto', marginTop: 14 }}><table className="table"><thead><tr><th>订单</th><th>客户</th><th>商品</th><th>合同</th><th>金额</th><th>支付</th><th>操作</th></tr></thead><tbody>
        {offlineOrders.map(item => <tr key={item._id}><td>{item.orderNo}<br /><small>{item._id}</small></td><td>{item.user?.name || '—'}</td><td>{item.serviceName}</td><td>{item.marketPartnerContractReference}</td><td>¥{Number(item.servicePrice || 0).toFixed(2)}</td><td>{item.paymentStatus}</td><td>{item.paymentStatus !== 'paid' && <button className="btn btn-sm" disabled={busy} onClick={() => run(() => adminAPI.payOrder(item._id, 'onsite', item.servicePrice))}>登记已收款</button>}</td></tr>)}
      </tbody></table></div>
    </section>
    <section style={boxStyle}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>年度客户历史付费年序</h2>
      <p style={{ color: '#667a6d' }}>年度订单计佣前须核准该客户在首次合伙人订单以前已付费的服务年数。填 0 也需列明核对依据；另一位管理员复核通过后才生成佣金。</p>
      <form onSubmit={e => { e.preventDefault(); run(() => adminAPI.submitMarketPartnerCustomerHistory({ ...customerHistory, priorPaidPeriods: Number(customerHistory.priorPaidPeriods) })) }} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <select style={{ ...inputStyle, minWidth: 260 }} aria-label="年度合伙人订单" value={customerHistory.orderId} onChange={e => setCustomerHistory({ ...customerHistory, orderId: e.target.value })} required><option value="">选择年度合伙人订单</option>{attributedOrders.filter(item => rules.some(ruleItem => String(ruleItem._id) === String(item.marketPartnerRuleId) && ruleItem.kind === 'annual')).map(item => <option key={item._id} value={item._id}>{item.user?.name || '客户'} · {item.serviceName} · {item.orderNo || item._id}</option>)}</select>
        <input style={{ ...inputStyle, width: 95 }} aria-label="历史已付年数" type="number" min="0" max="100" step="1" value={customerHistory.priorPaidPeriods} onChange={e => setCustomerHistory({ ...customerHistory, priorPaidPeriods: e.target.value })} required />
        <input style={{ ...inputStyle, minWidth: 300 }} aria-label="历史年序依据" placeholder="历史合同／订单编号和核对结果" value={customerHistory.evidence} onChange={e => setCustomerHistory({ ...customerHistory, evidence: e.target.value })} required />
        <button className="btn btn-primary" disabled={busy}>提交年序核准</button>
      </form>
      <div style={{ overflowX: 'auto', marginTop: 14 }}><table className="table"><thead><tr><th>客户</th><th>产品线</th><th>既往已付年数</th><th>状态</th><th>操作</th></tr></thead><tbody>
        {customerHistories.map(item => <tr key={item._id}><td>{item.patientId?.name || item.patientId}</td><td>{item.productLine}</td><td>{item.priorPaidPeriods}</td><td>{item.status}</td><td>{item.status === 'requested' && <><button className="btn btn-sm" disabled={busy} onClick={() => run(() => adminAPI.reviewMarketPartnerCustomerHistory(item._id, 'approved'))}>核准</button> <button className="btn btn-sm" disabled={busy} onClick={() => run(() => adminAPI.reviewMarketPartnerCustomerHistory(item._id, 'rejected'))}>退回</button></>}{item.status === 'approved' && <button className="btn btn-sm" disabled={busy} onClick={() => run(() => adminAPI.recalculateMarketPartnerCustomerHistory(item._id))}>重算佣金</button>}</td></tr>)}
      </tbody></table></div>
    </section>
    <section style={boxStyle}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>服务团队实际贡献</h2>
      <p style={{ color: '#667a6d' }}>仅对已付款且履约记录已完成的订单计提；与原有服务绩效重复时系统拒绝。计提与审核须由不同管理员完成。</p>
      <form onSubmit={e => { e.preventDefault(); run(() => adminAPI.createTeamIncentive(teamClaim)) }} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input style={inputStyle} aria-label="团队订单ID" placeholder="订单ID" value={teamClaim.orderId} onChange={e => { setTeamClaim({ ...teamClaim, orderId: e.target.value, serviceItemKey: '', serviceEvidenceId: '' }); setTeamClaimOrder(null) }} required />
        <button type="button" className="btn" disabled={!teamClaim.orderId.trim()} onClick={loadTeamClaimOrder}>读取订单子项</button>
        {!!teamClaimOrder?.serviceItemsSnapshot?.length && <>
          <select style={inputStyle} aria-label="已完成子产品" value={teamClaim.serviceItemKey} onChange={e => setTeamClaim({ ...teamClaim, serviceItemKey: e.target.value, serviceEvidenceId: '' })} required><option value="">选择子产品</option>{teamClaimOrder.serviceItemsSnapshot.map(item => <option key={item.key} value={item.key}>{item.name} · {ROLES.find(([role]) => role === item.teamRole)?.[1] || item.teamRole}</option>)}</select>
          <select style={inputStyle} aria-label="子产品核销记录" value={teamClaim.serviceEvidenceId} onChange={e => setTeamClaim({ ...teamClaim, serviceEvidenceId: e.target.value })} required><option value="">选择已核销记录</option>{(teamClaimOrder.redemptions || []).filter(item => item.serviceItemKey === teamClaim.serviceItemKey).map(item => <option key={item._id} value={item._id}>第 {item.sequence} 次 · {item.redeemedAt?.slice(0, 16).replace('T', ' ')}</option>)}</select>
        </>}
        <input style={inputStyle} aria-label="服务人员ID" placeholder="实际服务人员ID" value={teamClaim.staffId} onChange={e => setTeamClaim({ ...teamClaim, staffId: e.target.value })} required />
        <select style={inputStyle} aria-label="实际服务岗位" value={teamClaim.role} onChange={e => setTeamClaim({ ...teamClaim, role: e.target.value })}>{ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <input style={inputStyle} aria-label="贡献说明" placeholder="实际贡献说明" value={teamClaim.note} onChange={e => setTeamClaim({ ...teamClaim, note: e.target.value })} required />
        <button className="btn btn-primary" disabled={busy}>提交计提</button>
      </form>
      <div style={{ overflowX: 'auto', marginTop: 14 }}><table className="table"><thead><tr><th>订单</th><th>服务人员</th><th>岗位</th><th>激励</th><th>状态</th><th>操作</th></tr></thead><tbody>
        {teamIncentives.map(item => <tr key={item._id}><td>{item.orderId?.orderNo || item.orderId}{item.serviceItemKey && <><br /><small>子项 {item.serviceItemKey}</small></>}</td><td>{item.staffId?.name || item.staffId}</td><td>{ROLES.find(([value]) => value === item.role)?.[1] || item.role}</td><td>¥{(item.amountCents / 100).toFixed(2)}<br /><small>已发 ¥{((item.paidCents || 0) / 100).toFixed(2)}／追回 ¥{((item.recoveredCents || 0) / 100).toFixed(2)}</small></td><td>{item.status}</td><td>{item.status === 'pending' && <button className="btn btn-sm" disabled={busy} onClick={() => run(() => adminAPI.confirmTeamIncentive(item._id))}>审核确认</button>}{item.status === 'confirmed' && <div style={{ display: 'flex', gap: 5 }}><input style={inputStyle} aria-label="团队激励转账凭证号" placeholder="已转账凭证号" value={teamPaymentReferences[item._id] || ''} onChange={e => setTeamPaymentReferences(current => ({ ...current, [item._id]: e.target.value }))} /><button className="btn btn-sm" disabled={busy} onClick={() => run(() => adminAPI.payTeamIncentive(item._id, teamPaymentReferences[item._id]))}>确认已转账</button></div>}{item.status === 'reversal_due' && <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}><input style={{ ...inputStyle, width: 95 }} aria-label="团队已追回金额元" type="number" min="0.01" step="0.01" placeholder="追回 元" value={teamRecoveries[item._id]?.amountYuan || ''} onChange={e => setTeamRecoveries(current => ({ ...current, [item._id]: { ...current[item._id], amountYuan: e.target.value } }))} /><input style={inputStyle} aria-label="团队追回凭证号" placeholder="追回凭证号" value={teamRecoveries[item._id]?.reference || ''} onChange={e => setTeamRecoveries(current => ({ ...current, [item._id]: { ...current[item._id], reference: e.target.value } }))} /><button className="btn btn-sm" disabled={busy} onClick={() => run(() => adminAPI.recoverTeamIncentive(item._id, { amountCents: Math.round(Number(teamRecoveries[item._id]?.amountYuan) * 100), recoveryReference: teamRecoveries[item._id]?.reference }))}>确认已追回</button></div>}</td></tr>)}
      </tbody></table></div>
    </section>
    <section style={boxStyle}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>合伙人佣金规则</h2>
      <p style={{ color: '#667a6d' }}>先保存草稿，检查产品、比例与生效时间后再发布。旧订单沿用原规则版本。</p>
      <p style={{ color: '#667a6d' }}>普通产品与组合拆解在 <Link to="/products">Admin 产品库</Link> 修改；365 会员服务包在 <Link to="/settings/members">会员设置 → 服务包</Link> 修改。下面只调整相应的推广佣金规则。</p>
      <form id="market-partner-rule-form" onSubmit={submitRule} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <select style={inputStyle} aria-label="商品或服务包" value={rule.productId} disabled={!!editingRule} onChange={e => setRule({ ...rule, productId: e.target.value })} required><option value="">选择商品或服务包</option>{(rule.productLine === 'consumer365' ? eligiblePackages : products).map(item => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
        <select style={inputStyle} aria-label="产品线" value={rule.productLine} disabled={!!editingRule} onChange={e => setRule({ ...rule, productLine: e.target.value, productId: '' })}>{LINES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select style={inputStyle} aria-label="计佣类型" value={rule.kind} onChange={e => setRule({ ...rule, kind: e.target.value })}><option value="annual">年度</option><option value="first">首次</option><option value="every">每次</option></select>
        <input style={inputStyle} aria-label="首年或首次比例" type="number" min="0" max="100" step="0.01" value={rule.firstPercent} onChange={e => setRule({ ...rule, firstPercent: e.target.value })} placeholder="首次比例 %" />
        <input style={inputStyle} aria-label="阶梯比例" value={rule.tiers} onChange={e => setRule({ ...rule, tiers: e.target.value })} placeholder="阶梯 10,15,18,20" />
        <input style={{ ...inputStyle, minWidth: 215 }} aria-label="续费比例" value={rule.renewals} onChange={e => setRule({ ...rule, renewals: e.target.value })} placeholder="续费 2:10,3:5,4:5,5:5" />
        <input style={inputStyle} aria-label="生效日期" type="date" value={rule.effectiveFrom} onChange={e => setRule({ ...rule, effectiveFrom: e.target.value })} required />
        <label><input type="checkbox" checked={rule.directReferralRequired} onChange={e => setRule({ ...rule, directReferralRequired: e.target.checked })} /> 须亲自推荐</label>
        <label><input type="checkbox" checked={rule.quickCloseEnabled} onChange={e => setRule({ ...rule, quickCloseEnabled: e.target.checked })} /> 7日促成奖励</label>
        <input style={inputStyle} aria-label="企业留存底线" type="number" min="0" max="100" step="0.01" placeholder="留存底线 %（可留空）" value={rule.retentionFloorPercent} onChange={e => setRule({ ...rule, retentionFloorPercent: e.target.value })} />
        <button className="btn btn-primary" disabled={busy}>{editingRule ? `保存 v${editingRule.version} 草稿修改` : '保存佣金规则新草稿'}</button>
        {editingRule && <button type="button" className="btn" onClick={() => setEditingRule(null)}>取消编辑</button>}
      </form>
      <p style={{ color: '#667a6d' }}>草稿可直接修改；已发布规则请复制为新版，填写新生效日，并将旧版结束日设为同一天。旧订单始终保留原规则版本。</p>
      <div style={{ overflowX: 'auto', marginTop: 14 }}><table className="table"><thead><tr><th>商品</th><th>产品线</th><th>版本</th><th>状态</th><th>生效</th><th>操作</th></tr></thead><tbody>
        {rules.map(item => <tr key={item._id}><td>{productName(item.productId)}</td><td>{item.productLine}</td><td>{item.version}</td><td>{item.status}</td><td>{item.effectiveFrom?.slice(0, 10)}</td><td>
          {item.status === 'draft' && <><button className="btn btn-sm" disabled={busy} onClick={() => loadRule(item, true)}>编辑草稿</button> <button className="btn btn-sm" disabled={busy} onClick={() => run(() => adminAPI.publishMarketPartnerRule(item._id))}>发布</button></>}
          {item.status === 'active' && <><button className="btn btn-sm" disabled={busy} onClick={() => loadRule(item, false)}>复制修改新版</button> <input type="date" aria-label={`${productName(item.productId)}旧版结束日`} value={ruleEndDates[item._id] || ''} onChange={e => setRuleEndDates(current => ({ ...current, [item._id]: e.target.value }))} /> <button className="btn btn-sm" disabled={busy || !ruleEndDates[item._id]} onClick={() => run(() => adminAPI.endMarketPartnerRule(item._id, new Date(ruleEndDates[item._id]).toISOString()))}>设置旧版结束日</button></>}
        </td></tr>)}
      </tbody></table></div>
      <h3 style={{ fontSize: 16 }}>规则与企业留存试算</h3>
      <form onSubmit={runPreview} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <select style={inputStyle} aria-label="试算规则" value={preview.ruleId} onChange={e => setPreview({ ...preview, ruleId: e.target.value })} required><option value="">选择规则版本</option>{rules.map(item => <option key={item._id} value={item._id}>{productName(item.productId)} · v{item.version}</option>)}</select>
        <input style={inputStyle} aria-label="试算现金实收元" type="number" min="0.01" step="0.01" placeholder="现金实收 元" value={preview.paidYuan} onChange={e => setPreview({ ...preview, paidYuan: e.target.value })} required />
        <input style={inputStyle} aria-label="履约直接成本元" type="number" min="0" step="0.01" placeholder="履约直接成本 元" value={preview.directCostYuan} onChange={e => setPreview({ ...preview, directCostYuan: e.target.value })} required />
        <input style={inputStyle} aria-label="团队激励成本元" type="number" min="0" step="0.01" placeholder="团队激励 元" value={preview.teamCostYuan} onChange={e => setPreview({ ...preview, teamCostYuan: e.target.value })} required />
        <input style={inputStyle} aria-label="交易成本元" type="number" min="0" step="0.01" placeholder="交易成本 元" value={preview.transactionCostYuan} onChange={e => setPreview({ ...preview, transactionCostYuan: e.target.value })} required />
        <input style={{ ...inputStyle, width: 85 }} aria-label="服务年度序号" type="number" min="1" step="1" value={preview.periodNumber} onChange={e => setPreview({ ...preview, periodNumber: e.target.value })} />
        <input style={{ ...inputStyle, width: 85 }} aria-label="月度有效新客数" type="number" min="1" step="1" value={preview.monthlyQualifiedCount} onChange={e => setPreview({ ...preview, monthlyQualifiedCount: e.target.value })} />
        <label><input type="checkbox" checked={preview.directReferral} onChange={e => setPreview({ ...preview, directReferral: e.target.checked })} /> 亲自促成</label>
        <button className="btn btn-primary" disabled={busy}>计算留存</button>
      </form>
      {previewResult && <p style={{ marginBottom: 0 }}>合伙人佣金 ¥{(previewResult.totalCents / 100).toFixed(2)}；企业预计留存 {previewResult.retention ? `¥${(previewResult.retention.retainedCents / 100).toFixed(2)}（${(previewResult.retention.retentionBasisPoints / 100).toFixed(2)}%）` : '成本不全，请人工复核'}{previewResult.retention?.belowFloor && '；低于本产品留存底线，请复核'}</p>}
    </section>
    <section style={boxStyle}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>线下收款复核</h2>
      <p style={{ color: '#667a6d' }}>订单须先走原有线下收款登记。提交收款凭据后，由另一位超级管理员复核；通过后才计提佣金。</p>
      <form onSubmit={e => { e.preventDefault(); run(() => adminAPI.submitMarketPartnerReceipt({ ...receipt, amountCents: Math.round(Number(receipt.amountYuan) * 100) })) }} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input style={inputStyle} aria-label="订单ID" placeholder="订单ID" value={receipt.orderId} onChange={e => setReceipt({ ...receipt, orderId: e.target.value })} required />
        <input style={inputStyle} aria-label="实收金额元" type="number" min="0.01" step="0.01" placeholder="实收金额 元" value={receipt.amountYuan} onChange={e => setReceipt({ ...receipt, amountYuan: e.target.value })} required />
        <input style={inputStyle} aria-label="收款流水号" placeholder="银行或收款流水号" value={receipt.reference} onChange={e => setReceipt({ ...receipt, reference: e.target.value })} required />
        <input style={inputStyle} aria-label="到账日期" type="date" value={receipt.receivedAt} onChange={e => setReceipt({ ...receipt, receivedAt: e.target.value })} required />
        <input style={inputStyle} aria-label="凭据说明" placeholder="凭据说明" value={receipt.evidence} onChange={e => setReceipt({ ...receipt, evidence: e.target.value })} required />
        <button className="btn btn-primary" disabled={busy}>提交待复核</button>
      </form>
      <div style={{ overflowX: 'auto', marginTop: 14 }}><table className="table"><thead><tr><th>订单</th><th>金额</th><th>流水号</th><th>状态</th><th>操作</th></tr></thead><tbody>
        {receipts.map(item => <tr key={item._id}><td>{item.orderId?.orderNo || item.orderId}</td><td>¥{(item.amountCents / 100).toFixed(2)}</td><td>{item.reference}</td><td>{item.status}</td><td>{item.status === 'submitted' && <><button className="btn btn-sm" disabled={busy} onClick={() => run(() => adminAPI.reviewMarketPartnerReceipt(item._id, { status: 'approved' }))}>复核通过</button> <button className="btn btn-sm" disabled={busy} onClick={() => run(() => adminAPI.reviewMarketPartnerReceipt(item._id, { status: 'rejected' }))}>退回</button></>}</td></tr>)}
      </tbody></table></div>
    </section>
    <section style={boxStyle}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>服务团队激励规则</h2>
      <p style={{ color: '#667a6d' }}>组合服务请针对每个子产品分别设置规则。计提时选择已核销的子项与实际人员；系统按该子项的净实收份额及核销次数计算。</p>
      <form id="team-incentive-rule-form" onSubmit={submitTeam} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <select style={inputStyle} aria-label="团队商品" value={team.productId} disabled={!!editingTeam} onChange={e => setTeam({ ...team, productId: e.target.value })} required><option value="">选择商品</option>{products.map(item => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
        <input style={inputStyle} aria-label="规格" placeholder="规格，可留空" value={team.specificationLabel} disabled={!!editingTeam} onChange={e => setTeam({ ...team, specificationLabel: e.target.value })} />
        <select style={inputStyle} aria-label="岗位" value={team.role} disabled={!!editingTeam} onChange={e => setTeam({ ...team, role: e.target.value })}>{ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <input style={inputStyle} aria-label="完成节点" placeholder="完成节点" value={team.trigger} disabled={!!editingTeam} onChange={e => setTeam({ ...team, trigger: e.target.value })} required />
        <select style={inputStyle} aria-label="计算类型" value={team.ruleType} onChange={e => setTeam({ ...team, ruleType: e.target.value })}><option value="percentage">按实收比例</option><option value="fixedAmount">固定金额</option></select>
        {team.ruleType === 'percentage' ? <input style={inputStyle} aria-label="激励比例" type="number" min="0" max="100" step="0.01" value={team.percent} onChange={e => setTeam({ ...team, percent: e.target.value })} placeholder="比例 %" />
          : <input style={inputStyle} aria-label="激励金额" type="number" min="0" step="0.01" value={team.amountYuan} onChange={e => setTeam({ ...team, amountYuan: e.target.value })} placeholder="金额 元" />}
        <input style={inputStyle} aria-label="团队规则生效日期" type="date" value={team.effectiveFrom} onChange={e => setTeam({ ...team, effectiveFrom: e.target.value })} required />
        <button className="btn btn-primary" disabled={busy}>{editingTeam ? `保存 v${editingTeam.version} 草稿修改` : '保存团队规则新草稿'}</button>
        {editingTeam && <button type="button" className="btn" onClick={() => setEditingTeam(null)}>取消编辑</button>}
      </form>
      <p style={{ color: '#667a6d' }}>草稿可修改；已发布版本复制为新草稿后，先设置旧版结束日，再发布不重叠的新版本。</p>
      <div style={{ overflowX: 'auto', marginTop: 14 }}><table className="table"><thead><tr><th>商品</th><th>岗位</th><th>完成节点</th><th>规则</th><th>状态</th><th>操作</th></tr></thead><tbody>
        {teamRules.map(item => <tr key={item._id}><td>{productName(item.productId)}</td><td>{ROLES.find(([value]) => value === item.role)?.[1]}</td><td>{item.trigger}</td><td>{item.ruleType === 'percentage' ? `${(item.basisPoints / 100).toFixed(2)}%` : `¥${(item.amountCents / 100).toFixed(2)}`}</td><td>{item.status}</td><td>
          {item.status === 'draft' && <><button className="btn btn-sm" disabled={busy} onClick={() => loadTeam(item, true)}>编辑草稿</button> <button className="btn btn-sm" disabled={busy} onClick={() => run(() => adminAPI.publishTeamIncentiveRule(item._id))}>发布</button></>}
          {item.status === 'active' && <><button className="btn btn-sm" disabled={busy} onClick={() => loadTeam(item, false)}>复制修改新版</button> <input type="date" aria-label={`${productName(item.productId)}团队旧版结束日`} value={teamEndDates[item._id] || ''} onChange={e => setTeamEndDates(current => ({ ...current, [item._id]: e.target.value }))} /> <button className="btn btn-sm" disabled={busy || !teamEndDates[item._id]} onClick={() => run(() => adminAPI.endTeamIncentiveRule(item._id, new Date(teamEndDates[item._id]).toISOString()))}>设置旧版结束日</button></>}
        </td></tr>)}
      </tbody></table></div>
    </section>
    <section style={boxStyle}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>合伙人佣金核对</h2>
      <p style={{ color: '#667a6d' }}>这里只登记已经完成的转账；系统不会自动向合伙人付款。首笔与尾款上限由后端核验。</p>
      <div style={{ overflowX: 'auto' }}><table className="table"><thead><tr><th>合伙人</th><th>订单</th><th>应计</th><th>已发／追回</th><th>状态</th><th>登记已转账或追回</th></tr></thead><tbody>
        {commissions.map(item => <tr key={item._id}>
          <td>{item.partnerId?.name || '—'}</td><td>{item.orderId?.serviceName || '—'}<br />{item.orderId?.orderNo || ''}</td>
          <td>¥{(item.accruedCents / 100).toFixed(2)}</td><td>¥{(item.paidCents / 100).toFixed(2)}／¥{((item.recoveredCents || 0) / 100).toFixed(2)}</td><td>{item.status}</td>
          <td>{!['cancelled', 'reversal_due', 'paid'].includes(item.status) && <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            <input style={{ ...inputStyle, minWidth: 90, width: 95 }} aria-label="已转账金额元" type="number" min="0.01" step="0.01" placeholder="金额 元" value={payouts[item._id]?.amountYuan || ''} onChange={e => setPayout(item._id, { amountYuan: e.target.value })} />
            <input style={{ ...inputStyle, minWidth: 135 }} aria-label="转账凭证号" placeholder="转账凭证号" value={payouts[item._id]?.reference || ''} onChange={e => setPayout(item._id, { reference: e.target.value })} />
            <button className="btn btn-sm" disabled={busy} onClick={() => pay(item)}>确认已转账</button>
          </div>}{item.status === 'reversal_due' && <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            <input style={{ ...inputStyle, minWidth: 90, width: 95 }} aria-label="已追回金额元" type="number" min="0.01" step="0.01" placeholder="追回 元" value={recoveries[item._id]?.amountYuan || ''} onChange={e => setRecoveries(current => ({ ...current, [item._id]: { ...current[item._id], amountYuan: e.target.value } }))} />
            <input style={{ ...inputStyle, minWidth: 135 }} aria-label="追回凭证号" placeholder="追回凭证号" value={recoveries[item._id]?.reference || ''} onChange={e => setRecoveries(current => ({ ...current, [item._id]: { ...current[item._id], reference: e.target.value } }))} />
            <button className="btn btn-sm" disabled={busy} onClick={() => recover(item)}>确认已追回</button>
          </div>}</td>
        </tr>)}
      </tbody></table></div>
    </section>
  </div>
}
