import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminAPI } from '../api'

const money = cents => `¥${(Number(cents || 0) / 100).toFixed(2)}`
const card = { background: '#fff', border: '1px solid #dbe5de', borderRadius: 10, padding: 18 }
const channelName = { wechat: '微信商城', onsite: '线下收款', alipay: '支付宝', healthFund: '健康基金' }
const roleName = { familyDoctor: '健康顾问', nutritionist: '营养师', healthManager: '健管专员', medicalAssistant: '就医专员' }

function DataTable({ title, headers, rows, render }) {
  return <section style={{ ...card, marginTop: 16, overflowX: 'auto' }}>
    <h2 style={{ fontSize: 18, marginTop: 0 }}>{title}</h2>
    <table className="table"><thead><tr>{headers.map(head => <th key={head}>{head}</th>)}</tr></thead>
      <tbody>{rows.length ? rows.map(render) : <tr><td colSpan={headers.length}>所选期间暂无记录</td></tr>}</tbody></table>
  </section>
}

export default function BusinessAccountingPage() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [data, setData] = useState(null)
  const [orders, setOrders] = useState(null)
  const [teamRevenue, setTeamRevenue] = useState([])
  const [source, setSource] = useState('')
  const [page, setPage] = useState(1)
  const [productPage, setProductPage] = useState(1)
  const [productsExpanded, setProductsExpanded] = useState(false)
  const [ordersExpanded, setOrdersExpanded] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = async (start = from, end = to) => {
    setLoading(true); setError('')
    const period = { ...(start ? { from: start } : {}), ...(end ? { to: end } : {}) }
    try {
      const [summary, orderList, teamList] = await Promise.all([
        adminAPI.marketPartnerBusinessOverview(period),
        adminAPI.marketPartnerBusinessOrders({ ...period, ...(source ? { source } : {}), page: 1, pageSize: 10 }),
        adminAPI.marketPartnerTeamRevenue(period),
      ])
      setData(summary.data); setOrders(orderList.data); setTeamRevenue(teamList.data || []); setPage(1); setProductPage(1)
    }
    catch (err) { setError(err.message || '经营数据读取失败') }
    finally { setLoading(false) }
  }
  const loadOrderPage = async (nextSource, nextPage) => {
    setLoading(true); setError('')
    try {
      const result = await adminAPI.marketPartnerBusinessOrders({ ...(from ? { from } : {}), ...(to ? { to } : {}),
        ...(nextSource ? { source: nextSource } : {}), page: nextPage, pageSize: 10 })
      setOrders(result.data); setSource(nextSource); setPage(nextPage)
    } catch (err) { setError(err.message || '订单明细读取失败') }
    finally { setLoading(false) }
  }
  useEffect(() => { load('', '') }, [])
  const sources = data?.sources || {}
  const attributed = ['partner', 'staff', 'unassigned'].reduce((sum, key) => sum + Number(sources[key]?.netCents || 0), 0)

  return <div style={{ maxWidth: 1200 }}>
    <div className="page-header"><div><div className="page-title">经营与分账总览</div>
      <div className="page-subtitle">企业现金经营视图 · 推广来源 · 产品与渠道</div></div></div>
    <form onSubmit={event => { event.preventDefault(); load() }} style={{ ...card, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <label>付款日期从 <input aria-label="付款开始日期" type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
      <label>至 <input aria-label="付款结束日期" type="date" value={to} onChange={event => setTo(event.target.value)} /></label>
      <button className="btn btn-primary" disabled={loading}>查询</button>
      <button type="button" className="btn" onClick={() => { setFrom(''); setTo(''); load('', '') }} disabled={loading}>全部期间</button>
    </form>
    <p style={{ color: '#667a6d', lineHeight: 1.6 }}>当前为订单记录的现金净实收：实付现金减成功退款。期间按付款日期归属，后续退款会回溯冲减原付款期；不等于财务已确认营业收入。线下记录仍需与财务流水核对。</p>
    {error && <p role="alert" style={{ color: '#b42318' }}>{error}</p>}
    {data && <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {[
          ['现金实收', data.total.paidCents], ['成功退款', data.total.refundedCents], ['企业净实收', data.total.netCents],
          ['外部合伙人带来', sources.partner?.netCents], ['内部员工推广', sources.staff?.netCents], ['无推广归属', sources.unassigned?.netCents],
        ].map(([label, amount]) => <div key={label} style={card}><div style={{ color: '#667a6d' }}>{label}</div><strong style={{ fontSize: 23 }}>{money(amount)}</strong></div>)}
      </div>
      <p style={{ color: attributed === data.total.netCents ? '#176b4d' : '#b42318' }}>推广来源合计 {money(attributed)}；企业净实收 {money(data.total.netCents)}；{attributed === data.total.netCents ? '对账一致' : '对账异常，请核查'}</p>
      <DataTable title="外部市场合伙人推广业务" headers={['合伙人', '已付款订单数', '净实收归属']} rows={data.partners} render={row =>
        <tr key={row.id}><td>{row.name}</td><td>{row.orderCount}</td><td>{money(row.netCents)}</td></tr>} />
      <DataTable title="内部员工推广业务" headers={['员工', '已付款订单数', '净实收归属']} rows={data.staff} render={row =>
        <tr key={row.id}><td>{row.name}</td><td>{row.orderCount}</td><td>{money(row.netCents)}</td></tr>} />
      <section style={{ ...card, marginTop: 16, overflowX: 'auto' }}>
        <button type="button" className="btn" aria-expanded={productsExpanded} onClick={() => setProductsExpanded(value => !value)}>
          产品业务（{data.products.length} 项）{productsExpanded ? '收起 ▲' : '展开 ▼'}
        </button>
        {productsExpanded && <>
          <table className="table"><thead><tr><th>产品</th><th>已付款订单数</th><th>净实收</th></tr></thead>
            <tbody>{data.products.length ? data.products.slice((productPage - 1) * 10, productPage * 10).map((row, index) =>
              <tr key={`${row.serviceId || row.name}:${index}`}><td>{row.name}</td><td>{row.orderCount}</td><td>{money(row.netCents)}</td></tr>)
              : <tr><td colSpan={3}>所选期间暂无记录</td></tr>}</tbody></table>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>每页 10 项 · 第 {productPage} / {Math.max(1, Math.ceil(data.products.length / 10))} 页</span>
            <button type="button" className="btn" disabled={productPage <= 1} onClick={() => setProductPage(value => value - 1)}>上一页</button>
            <button type="button" className="btn" disabled={productPage * 10 >= data.products.length} onClick={() => setProductPage(value => value + 1)}>下一页</button>
          </div>
        </>}
      </section>
      <DataTable title="收款渠道" headers={['渠道', '已付款订单数', '净实收']} rows={data.channels} render={row =>
        <tr key={row.channel}><td>{channelName[row.channel] || row.channel}</td><td>{row.orderCount}</td><td>{money(row.netCents)}</td></tr>} />
      <DataTable title="服务团队业务归属" headers={['负责团队', '服务项目', '订单数', '净实收分摊']} rows={teamRevenue} render={row =>
        <tr key={`${row.teamRole}:${row.childProductId || row.serviceItemKey}`}><td>{roleName[row.teamRole] || row.teamRole}</td><td>{row.name}</td><td>{row.orderCount}</td><td>{money(row.amountCents)}</td></tr>} />
      <p style={{ color: '#667a6d' }}>团队表仅含已完成 100% 归属配置的订单；未拆解的订单仍计入企业净实收。人员服务激励必须依据实际履约，不能把团队分摊额直接当作个人收入。</p>
      <section style={{ ...card, marginTop: 16, overflowX: 'auto' }}>
        <button type="button" className="btn" aria-expanded={ordersExpanded} onClick={() => setOrdersExpanded(value => !value)}>
          订单明细（{orders?.count || 0} 笔）{ordersExpanded ? '收起 ▲' : '展开 ▼'}
        </button>
        {ordersExpanded && <>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {[['', '全部来源'], ['partner', '外部合伙人'], ['staff', '内部员工'], ['unassigned', '无推广归属']].map(([key, label]) =>
            <button type="button" key={key} className={source === key ? 'btn btn-primary' : 'btn'} disabled={loading} onClick={() => loadOrderPage(key, 1)}>{label}</button>)}
        </div>
        <table className="table"><thead><tr><th>付款时间</th><th>订单/客户</th><th>产品</th><th>渠道</th><th>推广来源</th><th>实收</th><th>退款</th><th>净额</th><th>核算</th></tr></thead><tbody>
          {orders?.rows?.length ? orders.rows.map(row => <tr key={row.id}>
            <td>{row.paidAt?.slice(0, 16).replace('T', ' ')}</td><td>{row.orderNo || row.id}<br />{row.customer}</td>
            <td>{row.product}{row.specification && ` · ${row.specification}`}</td><td>{channelName[row.channel] || row.channel || '未标注'}</td>
            <td>{row.sourceName}</td><td>{money(row.paidCents)}</td><td>{money(row.refundedCents)}</td><td>{money(row.netCents)}</td>
            <td><Link to={`/market-partners?order=${encodeURIComponent(row.orderNo || row.id)}`}>逐单核算</Link></td>
          </tr>) : <tr><td colSpan={9}>所选条件暂无订单</td></tr>}
        </tbody></table>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>共 {orders?.count || 0} 笔 · 第 {page} 页</span>
          <button className="btn" disabled={loading || page <= 1} onClick={() => loadOrderPage(source, page - 1)}>上一页</button>
          <button className="btn" disabled={loading || page * 10 >= (orders?.count || 0)} onClick={() => loadOrderPage(source, page + 1)}>下一页</button>
        </div>
        </>}
      </section>
      <div style={{ ...card, marginTop: 16, lineHeight: 1.8 }}>
        <strong>后续核算接入</strong>：财务已确认营业收入、实际成本与毛利、员工已履约服务业绩、激励应付和实付仍需按统一账本接入。现有服务团队归属、佣金核对和单笔订单查询可在 <Link to="/market-partners">市场合伙人</Link> 查看。
      </div>
    </>}
  </div>
}
