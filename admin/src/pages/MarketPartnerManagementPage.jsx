import React, { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { adminAPI } from '../api'

const ROLES = [['familyDoctor', '健康顾问'], ['nutritionist', '营养师'], ['healthManager', '健管专员'], ['medicalAssistant', '就医专员'], ['psychologist', '心理咨询师'], ['rehabSpecialist', '运动复健师'], ['specialist', '专科医师'], ['tcmDoctor', '中医师']]
const inputStyle = { padding: '9px 10px', border: '1px solid #cbd8d1', borderRadius: 6, minWidth: 150 }
const boxStyle = { background: '#fff', border: '1px solid #dbe5de', borderRadius: 10, padding: 18, marginBottom: 16 }

export default function MarketPartnerManagementPage({ view = 'operations' }) {
  const [searchParams] = useSearchParams()
  const orderFromUrl = searchParams.get('order')
  const [rules, setRules] = useState([])
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
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
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
    const [r, productsResponse, commissionsResponse, receiptsResponse, offlineOrdersResponse, offlineRefundsResponse, lossReviewsResponse, attributedOrdersResponse, customerHistoriesResponse, leadEventsResponse, teamRevenueResponse] = await Promise.all([
      adminAPI.marketPartnerRules(), adminAPI.products({}), adminAPI.marketPartnerCommissions(), adminAPI.marketPartnerReceipts(), adminAPI.marketPartnerOfflineOrders(), adminAPI.marketPartnerOfflineRefunds(), adminAPI.marketPartnerLossReviews(), adminAPI.marketPartnerAttributedOrders(), adminAPI.marketPartnerCustomerHistories(), adminAPI.marketPartnerLeadEvents(), adminAPI.marketPartnerTeamRevenue(),
    ])
    setRules(r.data || [])
    setProducts(productsResponse.data || [])
    setCommissions(commissionsResponse.data?.rows || [])
    setReceipts(receiptsResponse.data || [])
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
    <div className="page-header"><div><div className="page-title">{view === 'finance' ? '合伙人财务审核与结算' : '合伙人业务登记'}</div><div className="page-subtitle">{view === 'finance' ? '线下收退款复核与佣金转账核对' : '首次沟通、线下合同订单、流失与年度年序登记'}</div></div></div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
      <Link className="btn btn-ghost" to="/market-partners">合伙人档案与团队</Link>
      <Link className="btn btn-ghost" to="/commission-rules?tab=partner">设置合伙人佣金</Link>
      <Link className="btn btn-ghost" to={view === 'finance' ? '/market-partner-operations' : '/market-partner-finance'}>{view === 'finance' ? '业务登记' : '财务审核与结算'}</Link>
    </div>
    {error && <div role="alert" style={{ color: '#b42318', marginBottom: 12 }}>{error}</div>}
    {notice && <div style={{ color: '#176b4d', marginBottom: 12 }}>{notice}</div>}
    {view === 'operations' && <>
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
        <div>服务／产品业务归属：{accounting.revenueAllocation?.length ? accounting.revenueAllocation.map(item => `${item.businessType === 'enterprise' ? '企业资源' : item.businessType === 'product' ? '产品' : '服务'}·${item.name} → ${item.businessType === 'enterprise' ? '企业资源' : ROLES.find(([role]) => role === item.teamRole)?.[1] || item.teamRole} ${yuan(item.amountCents)}（${item.sharePercent}%）`).join('；') : '未配置业务归属'}</div>
        <div>服务团队：{accounting.order.servicePerformers?.length ? accounting.order.servicePerformers.map(item => `${ROLES.find(([role]) => role === item.role)?.[1] || item.role} ${item.staffId?.name || '待确认'}`).join('、') : '待确认'}</div>
        <div>合伙人推广费：{accounting.partnerCommission.length ? accounting.partnerCommission.map(item => `${yuan(item.accruedCents)}（${item.status}，已发 ${yuan(item.paidCents)}，已追回 ${yuan(item.recoveredCents)}）`).join('；') : '暂无计提'}</div>
        <div>内部推广与服务绩效：{accounting.staffCommissions.length ? accounting.staffCommissions.map(item => `${item.staffId?.name || '员工'} ${item.role === 'referrer' ? '推广' : '服务'} ${yuan(Math.round(Number(item.commissionAmount || 0) * 100))}（${item.status}）`).join('；') : '暂无计提'}</div>
        <div>线下到账凭据：{accounting.receipts.length ? accounting.receipts.map(item => `${yuan(item.amountCents)}（${item.status}）`).join('；') : '无'}</div>
      </div>}
    </section>
    <section style={boxStyle}>
      <h2 style={{fontSize:18,marginTop:0}}>服务与产品业务归属</h2>
      <p style={{color:'#667a6d'}}>按已付款订单的归属快照汇总，成功退款实时扣减；这是业务营收归属，员工佣金在下方单独核算。</p>
      {teamRevenue.length ? <table className="table"><thead><tr><th>归属类型</th><th>负责团队</th><th>项目</th><th>订单数</th><th>净实收归属</th></tr></thead><tbody>
        {teamRevenue.map(item=><tr key={`${item.businessType}:${item.teamRole}:${item.childProductId || item.serviceItemKey}`}><td>{item.businessType === 'enterprise' ? '企业资源' : item.businessType === 'product' ? '产品／检测' : '管理服务'}</td><td>{item.businessType === 'enterprise' ? '企业资源' : ROLES.find(([role])=>role===item.teamRole)?.[1] || item.teamRole}</td><td>{item.name}</td><td>{item.orderCount}</td><td>{yuan(item.amountCents)}</td></tr>)}
      </tbody></table> : <div>暂无已付款且完成业务归属配置的订单</div>}
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
    </>}
    {view === 'finance' && <>
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
    </>}
    {view === 'operations' && <>
    <section style={boxStyle}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>非商城线下合同订单</h2>
      <p style={{ color: '#667a6d' }}>按已上架的线下商品原价或规格价建单。建单后登记线下实收，再在下方提交收款凭据复核。</p>
      <form onSubmit={e => { e.preventDefault(); run(() => adminAPI.createMarketPartnerOfflineOrder({ ...offlineOrder, priceCents: Math.round(Number(offlineOrder.priceYuan) * 100) })) }} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input style={inputStyle} aria-label="客户ID" placeholder="客户ID" value={offlineOrder.patientId} onChange={e => setOfflineOrder({ ...offlineOrder, patientId: e.target.value })} required />
        <select style={inputStyle} aria-label="线下商品" value={offlineOrder.productId} onChange={e => setOfflineOrder({ ...offlineOrder, productId: e.target.value })} required><option value="">选择线下商品</option>{products.filter(item => item.status === 'on' && ['offline', 'both'].includes(item.paymentChannel)).map(item => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
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
    </>}
    {view === 'finance' && <>
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
    </>}
    {view === 'finance' && <>
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
    </>}
  </div>
}
