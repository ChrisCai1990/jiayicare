import React, { useEffect, useState } from 'react'
import { adminAPI } from '../api'

const LINES = [
  ['consumer365', '365会员'], ['annualAdvisor', '年度顾问'], ['premiumAdvisor', '高端顾问'],
  ['weightManagement', '体重管理'], ['chronicManagement', '慢性病管理'],
  ['medicalAssist', '单次就医协助'], ['oneStopMedical', '一站式就医'],
  ['assessment', '单次评估'], ['psychology', '心理咨询'], ['rehabilitation', '运动复健'],
  ['testing', '检测'], ['supplements', '营养素补充'],
]
const ROLES = [['familyDoctor', '健康顾问'], ['nutritionist', '营养师'], ['healthManager', '健管专员']]
const inputStyle = { padding: '9px 10px', border: '1px solid #cbd8d1', borderRadius: 6, minWidth: 150 }
const boxStyle = { background: '#fff', border: '1px solid #dbe5de', borderRadius: 10, padding: 18, marginBottom: 16 }
const toBasisPoints = value => Math.round(Number(value) * 100)

export default function MarketPartnerManagementPage() {
  const [partners, setPartners] = useState([])
  const [rules, setRules] = useState([])
  const [teamRules, setTeamRules] = useState([])
  const [teamIncentives, setTeamIncentives] = useState([])
  const [commissions, setCommissions] = useState([])
  const [receipts, setReceipts] = useState([])
  const [offlineOrders, setOfflineOrders] = useState([])
  const [offlineRefunds, setOfflineRefunds] = useState([])
  const [lossReviews, setLossReviews] = useState([])
  const [products, setProducts] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [partner, setPartner] = useState({ name: '', phone: '', productLine: 'consumer365', contractReference: '' })
  const [rule, setRule] = useState({ productId: '', productLine: 'consumer365', kind: 'annual', firstPercent: '20', tiers: '', renewals: '2:10,3:5,4:5,5:5', effectiveFrom: '', directReferralRequired: false, quickCloseEnabled: false, retentionFloorPercent: '' })
  const [preview, setPreview] = useState({ ruleId: '', paidYuan: '', directCostYuan: '', teamCostYuan: '', transactionCostYuan: '', periodNumber: '1', monthlyQualifiedCount: '1', directReferral: false })
  const [previewResult, setPreviewResult] = useState(null)
  const [team, setTeam] = useState({ productId: '', specificationLabel: '', role: 'familyDoctor', trigger: 'service_completed', ruleType: 'percentage', percent: '0', amountYuan: '0', effectiveFrom: '' })
  const [teamClaim, setTeamClaim] = useState({ orderId: '', staffId: '', role: 'familyDoctor', note: '' })
  const [teamPaymentReferences, setTeamPaymentReferences] = useState({})
  const [teamRecoveries, setTeamRecoveries] = useState({})
  const [payouts, setPayouts] = useState({})
  const [recoveries, setRecoveries] = useState({})
  const [receipt, setReceipt] = useState({ orderId: '', amountYuan: '', reference: '', receivedAt: '', evidence: '' })
  const [offlineOrder, setOfflineOrder] = useState({ patientId: '', productId: '', specificationLabel: '', priceYuan: '', partnerCode: '', contractReference: '' })
  const [offlineRefund, setOfflineRefund] = useState({ orderId: '', amountYuan: '', reference: '', evidence: '', reason: '' })
  const [lossReview, setLossReview] = useState({ orderId: '', terminatedAt: '', reason: '', evidence: '' })

  const refresh = async () => {
    const [p, r, t, productsResponse, commissionsResponse, receiptsResponse, teamIncentivesResponse, offlineOrdersResponse, offlineRefundsResponse, lossReviewsResponse] = await Promise.all([
      adminAPI.marketPartners(), adminAPI.marketPartnerRules(), adminAPI.teamIncentiveRules(), adminAPI.products({}), adminAPI.marketPartnerCommissions(), adminAPI.marketPartnerReceipts(), adminAPI.teamIncentives(), adminAPI.marketPartnerOfflineOrders(), adminAPI.marketPartnerOfflineRefunds(), adminAPI.marketPartnerLossReviews(),
    ])
    setPartners(p.data || [])
    setRules(r.data || [])
    setTeamRules(t.data || [])
    setProducts(productsResponse.data || [])
    setCommissions(commissionsResponse.data?.rows || [])
    setReceipts(receiptsResponse.data || [])
    setTeamIncentives(teamIncentivesResponse.data || [])
    setOfflineOrders(offlineOrdersResponse.data || [])
    setOfflineRefunds(offlineRefundsResponse.data || [])
    setLossReviews(lossReviewsResponse.data || [])
  }
  useEffect(() => { refresh().catch(err => setError(err.message)) }, [])

  const run = async action => {
    setBusy(true); setError(''); setNotice('')
    try { await action(); await refresh(); setNotice('已保存') }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  const submitPartner = e => { e.preventDefault(); run(() => adminAPI.createMarketPartner(partner)) }
  const submitRule = e => {
    e.preventDefault()
    const tierBasisPoints = rule.tiers.trim() ? rule.tiers.split(',').map(part => toBasisPoints(part.trim())) : []
    const renewalBasisPoints = rule.renewals.trim() ? rule.renewals.split(',').map(part => {
      const [year, percent] = part.split(':').map(value => value.trim())
      return { year: Number(year), basisPoints: toBasisPoints(percent) }
    }) : []
    run(() => adminAPI.createMarketPartnerRule({ productId: rule.productId, productLine: rule.productLine,
      kind: rule.kind, firstBasisPoints: toBasisPoints(rule.firstPercent), tierBasisPoints,
      renewalBasisPoints, effectiveFrom: new Date(rule.effectiveFrom).toISOString(),
      directReferralRequired: rule.directReferralRequired, quickCloseEnabled: rule.quickCloseEnabled,
      retentionFloorBasisPoints: rule.retentionFloorPercent === '' ? null : toBasisPoints(rule.retentionFloorPercent) }))
  }
  const submitTeam = e => {
    e.preventDefault()
    run(() => adminAPI.createTeamIncentiveRule({ productId: team.productId,
      specificationLabel: team.specificationLabel, role: team.role, trigger: team.trigger,
      ruleType: team.ruleType, basisPoints: toBasisPoints(team.percent),
      amountCents: Math.round(Number(team.amountYuan) * 100), effectiveFrom: new Date(team.effectiveFrom).toISOString() }))
  }
  const productName = id => products.find(item => String(item._id) === String(id))?.name || String(id || '')
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

  return <div style={{ maxWidth: 1100 }}>
    <div className="page-header"><div><div className="page-title">市场合伙人</div><div className="page-subtitle">审核合伙人、按产品配置佣金和服务团队激励</div></div></div>
    {error && <div role="alert" style={{ color: '#b42318', marginBottom: 12 }}>{error}</div>}
    {notice && <div style={{ color: '#176b4d', marginBottom: 12 }}>{notice}</div>}
    <section style={boxStyle}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>合伙人</h2>
      <form onSubmit={submitPartner} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input style={inputStyle} aria-label="姓名" placeholder="姓名或机构名" value={partner.name} onChange={e => setPartner({ ...partner, name: e.target.value })} required />
        <input style={inputStyle} aria-label="手机号" placeholder="登记手机号" value={partner.phone} onChange={e => setPartner({ ...partner, phone: e.target.value })} required />
        <select style={inputStyle} aria-label="授权产品线" value={partner.productLine} onChange={e => setPartner({ ...partner, productLine: e.target.value })}>{LINES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <input style={inputStyle} aria-label="合同编号" placeholder="合同编号" value={partner.contractReference} onChange={e => setPartner({ ...partner, contractReference: e.target.value })} required />
        <button className="btn btn-primary" disabled={busy}>创建待审核合伙人</button>
      </form>
      <div style={{ overflowX: 'auto', marginTop: 14 }}><table className="table"><thead><tr><th>名称</th><th>手机号</th><th>产品线</th><th>推荐码</th><th>状态</th><th>操作</th></tr></thead><tbody>
        {partners.map(item => <tr key={item._id}><td>{item.name}</td><td>{item.phone}</td><td>{LINES.find(([value]) => value === item.productLine)?.[1] || item.productLine}</td><td>{item.referralCode}</td><td>{item.status}</td><td>
          {item.status !== 'active' && <button className="btn btn-sm" disabled={busy} onClick={() => run(() => adminAPI.setMarketPartnerStatus(item._id, 'active'))}>启用</button>}
          {item.status === 'active' && <button className="btn btn-sm" disabled={busy} onClick={() => run(() => adminAPI.setMarketPartnerStatus(item._id, 'suspended'))}>暂停</button>}
        </td></tr>)}
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
      <h2 style={{ fontSize: 18, marginTop: 0 }}>服务团队实际贡献</h2>
      <p style={{ color: '#667a6d' }}>仅对已付款且履约记录已完成的订单计提；与原有服务绩效重复时系统拒绝。计提与审核须由不同管理员完成。</p>
      <form onSubmit={e => { e.preventDefault(); run(() => adminAPI.createTeamIncentive(teamClaim)) }} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input style={inputStyle} aria-label="团队订单ID" placeholder="订单ID" value={teamClaim.orderId} onChange={e => setTeamClaim({ ...teamClaim, orderId: e.target.value })} required />
        <input style={inputStyle} aria-label="服务人员ID" placeholder="实际服务人员ID" value={teamClaim.staffId} onChange={e => setTeamClaim({ ...teamClaim, staffId: e.target.value })} required />
        <select style={inputStyle} aria-label="实际服务岗位" value={teamClaim.role} onChange={e => setTeamClaim({ ...teamClaim, role: e.target.value })}>{ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <input style={inputStyle} aria-label="贡献说明" placeholder="实际贡献说明" value={teamClaim.note} onChange={e => setTeamClaim({ ...teamClaim, note: e.target.value })} required />
        <button className="btn btn-primary" disabled={busy}>提交计提</button>
      </form>
      <div style={{ overflowX: 'auto', marginTop: 14 }}><table className="table"><thead><tr><th>订单</th><th>服务人员</th><th>岗位</th><th>激励</th><th>状态</th><th>操作</th></tr></thead><tbody>
        {teamIncentives.map(item => <tr key={item._id}><td>{item.orderId?.orderNo || item.orderId}</td><td>{item.staffId?.name || item.staffId}</td><td>{ROLES.find(([value]) => value === item.role)?.[1] || item.role}</td><td>¥{(item.amountCents / 100).toFixed(2)}<br /><small>已发 ¥{((item.paidCents || 0) / 100).toFixed(2)}／追回 ¥{((item.recoveredCents || 0) / 100).toFixed(2)}</small></td><td>{item.status}</td><td>{item.status === 'pending' && <button className="btn btn-sm" disabled={busy} onClick={() => run(() => adminAPI.confirmTeamIncentive(item._id))}>审核确认</button>}{item.status === 'confirmed' && <div style={{ display: 'flex', gap: 5 }}><input style={inputStyle} aria-label="团队激励转账凭证号" placeholder="已转账凭证号" value={teamPaymentReferences[item._id] || ''} onChange={e => setTeamPaymentReferences(current => ({ ...current, [item._id]: e.target.value }))} /><button className="btn btn-sm" disabled={busy} onClick={() => run(() => adminAPI.payTeamIncentive(item._id, teamPaymentReferences[item._id]))}>确认已转账</button></div>}{item.status === 'reversal_due' && <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}><input style={{ ...inputStyle, width: 95 }} aria-label="团队已追回金额元" type="number" min="0.01" step="0.01" placeholder="追回 元" value={teamRecoveries[item._id]?.amountYuan || ''} onChange={e => setTeamRecoveries(current => ({ ...current, [item._id]: { ...current[item._id], amountYuan: e.target.value } }))} /><input style={inputStyle} aria-label="团队追回凭证号" placeholder="追回凭证号" value={teamRecoveries[item._id]?.reference || ''} onChange={e => setTeamRecoveries(current => ({ ...current, [item._id]: { ...current[item._id], reference: e.target.value } }))} /><button className="btn btn-sm" disabled={busy} onClick={() => run(() => adminAPI.recoverTeamIncentive(item._id, { amountCents: Math.round(Number(teamRecoveries[item._id]?.amountYuan) * 100), recoveryReference: teamRecoveries[item._id]?.reference }))}>确认已追回</button></div>}</td></tr>)}
      </tbody></table></div>
    </section>
    <section style={boxStyle}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>合伙人佣金规则</h2>
      <p style={{ color: '#667a6d' }}>先保存草稿，检查产品、比例与生效时间后再发布。旧订单沿用原规则版本。</p>
      <form onSubmit={submitRule} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <select style={inputStyle} aria-label="商品" value={rule.productId} onChange={e => setRule({ ...rule, productId: e.target.value })} required><option value="">选择商品</option>{products.map(item => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
        <select style={inputStyle} aria-label="产品线" value={rule.productLine} onChange={e => setRule({ ...rule, productLine: e.target.value })}>{LINES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select style={inputStyle} aria-label="计佣类型" value={rule.kind} onChange={e => setRule({ ...rule, kind: e.target.value })}><option value="annual">年度</option><option value="first">首次</option><option value="every">每次</option></select>
        <input style={inputStyle} aria-label="首年或首次比例" type="number" min="0" max="100" step="0.01" value={rule.firstPercent} onChange={e => setRule({ ...rule, firstPercent: e.target.value })} placeholder="首次比例 %" />
        <input style={inputStyle} aria-label="阶梯比例" value={rule.tiers} onChange={e => setRule({ ...rule, tiers: e.target.value })} placeholder="阶梯 10,15,18,20" />
        <input style={{ ...inputStyle, minWidth: 215 }} aria-label="续费比例" value={rule.renewals} onChange={e => setRule({ ...rule, renewals: e.target.value })} placeholder="续费 2:10,3:5,4:5,5:5" />
        <input style={inputStyle} aria-label="生效日期" type="date" value={rule.effectiveFrom} onChange={e => setRule({ ...rule, effectiveFrom: e.target.value })} required />
        <label><input type="checkbox" checked={rule.directReferralRequired} onChange={e => setRule({ ...rule, directReferralRequired: e.target.checked })} /> 须亲自推荐</label>
        <label><input type="checkbox" checked={rule.quickCloseEnabled} onChange={e => setRule({ ...rule, quickCloseEnabled: e.target.checked })} /> 7日促成奖励</label>
        <input style={inputStyle} aria-label="企业留存底线" type="number" min="0" max="100" step="0.01" placeholder="留存底线 %（可留空）" value={rule.retentionFloorPercent} onChange={e => setRule({ ...rule, retentionFloorPercent: e.target.value })} />
        <button className="btn btn-primary" disabled={busy}>保存佣金规则草稿</button>
      </form>
      <div style={{ overflowX: 'auto', marginTop: 14 }}><table className="table"><thead><tr><th>商品</th><th>产品线</th><th>版本</th><th>状态</th><th>生效</th><th>操作</th></tr></thead><tbody>
        {rules.map(item => <tr key={item._id}><td>{productName(item.productId)}</td><td>{item.productLine}</td><td>{item.version}</td><td>{item.status}</td><td>{item.effectiveFrom?.slice(0, 10)}</td><td>{item.status === 'draft' && <button className="btn btn-sm" disabled={busy} onClick={() => run(() => adminAPI.publishMarketPartnerRule(item._id))}>发布</button>}</td></tr>)}
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
      <form onSubmit={submitTeam} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <select style={inputStyle} aria-label="团队商品" value={team.productId} onChange={e => setTeam({ ...team, productId: e.target.value })} required><option value="">选择商品</option>{products.map(item => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
        <input style={inputStyle} aria-label="规格" placeholder="规格，可留空" value={team.specificationLabel} onChange={e => setTeam({ ...team, specificationLabel: e.target.value })} />
        <select style={inputStyle} aria-label="岗位" value={team.role} onChange={e => setTeam({ ...team, role: e.target.value })}>{ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <input style={inputStyle} aria-label="完成节点" placeholder="完成节点" value={team.trigger} onChange={e => setTeam({ ...team, trigger: e.target.value })} required />
        <select style={inputStyle} aria-label="计算类型" value={team.ruleType} onChange={e => setTeam({ ...team, ruleType: e.target.value })}><option value="percentage">按实收比例</option><option value="fixedAmount">固定金额</option></select>
        {team.ruleType === 'percentage' ? <input style={inputStyle} aria-label="激励比例" type="number" min="0" max="100" step="0.01" value={team.percent} onChange={e => setTeam({ ...team, percent: e.target.value })} placeholder="比例 %" />
          : <input style={inputStyle} aria-label="激励金额" type="number" min="0" step="0.01" value={team.amountYuan} onChange={e => setTeam({ ...team, amountYuan: e.target.value })} placeholder="金额 元" />}
        <input style={inputStyle} aria-label="团队规则生效日期" type="date" value={team.effectiveFrom} onChange={e => setTeam({ ...team, effectiveFrom: e.target.value })} required />
        <button className="btn btn-primary" disabled={busy}>保存团队规则草稿</button>
      </form>
      <div style={{ overflowX: 'auto', marginTop: 14 }}><table className="table"><thead><tr><th>商品</th><th>岗位</th><th>完成节点</th><th>规则</th><th>状态</th><th>操作</th></tr></thead><tbody>
        {teamRules.map(item => <tr key={item._id}><td>{productName(item.productId)}</td><td>{ROLES.find(([value]) => value === item.role)?.[1]}</td><td>{item.trigger}</td><td>{item.ruleType === 'percentage' ? `${(item.basisPoints / 100).toFixed(2)}%` : `¥${(item.amountCents / 100).toFixed(2)}`}</td><td>{item.status}</td><td>{item.status === 'draft' && <button className="btn btn-sm" disabled={busy} onClick={() => run(() => adminAPI.publishTeamIncentiveRule(item._id))}>发布</button>}</td></tr>)}
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
