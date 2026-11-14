import React, { useEffect, useState } from 'react'

const API_BASE = `${import.meta.env.VITE_API_URL || '/api'}/market-partner`
const money = cents => `¥${(Number(cents || 0) / 100).toFixed(2)}`
const date = value => value ? new Date(value).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—'
const labels = { estimated: '预估', pending: '待审核', partially_paid: '部分已发', paid: '已发放',
  cancelled: '已取消', reversal_due: '待冲回' }

async function call(path, body, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.message || '请求失败')
  return json.data
}

export default function MarketPartnerPortalPage() {
  const [token, setToken] = useState(() => sessionStorage.getItem('jy_market_partner_token') || '')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [me, setMe] = useState(null)
  const [products, setProducts] = useState([])
  const [commissions, setCommissions] = useState([])
  const [orders, setOrders] = useState([])
  const [overview, setOverview] = useState(null)
  const [month, setMonth] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).format(new Date()))
  const [tab, setTab] = useState('commissions')

  useEffect(() => {
    if (!token) return
    Promise.all([call('/me', undefined, token), call('/products', undefined, token),
      call('/commissions', undefined, token), call('/orders', undefined, token)])
      .then(([identity, items, fees, sales]) => { setMe(identity); setProducts(items); setCommissions(fees); setOrders(sales) })
      .catch(err => { setError(err.message); sessionStorage.removeItem('jy_market_partner_token'); setToken('') })
  }, [token])

  useEffect(() => {
    if (!token) return
    call(`/my-overview?month=${encodeURIComponent(month)}`, undefined, token)
      .then(setOverview).catch(err => setError(err.message))
  }, [token, month])

  const sendCode = async () => {
    setError(''); setNotice(''); setBusy(true)
    try { await call('/send-code', { phone }); setNotice('验证码已发送至登记手机号') }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  const login = async () => {
    setError(''); setBusy(true)
    try {
      const result = await call('/login', { phone, code })
      sessionStorage.setItem('jy_market_partner_token', result.token)
      setToken(result.token)
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  const logout = () => { sessionStorage.removeItem('jy_market_partner_token'); setToken(''); setMe(null) }
  const card = { background: '#fff', border: '1px solid #d9e5de', borderRadius: 12, padding: 16, marginBottom: 12 }
  const field = { width: '100%', padding: '11px 12px', border: '1px solid #c6d6ce', borderRadius: 8, marginTop: 8, boxSizing: 'border-box' }
  const button = { border: 0, background: '#176b4d', color: '#fff', borderRadius: 8, padding: '11px 16px', cursor: 'pointer' }

  return <main style={{ minHeight: '100vh', background: '#f4f8f5', color: '#20352a', padding: '24px 16px', fontFamily: 'sans-serif' }}>
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, margin: '0 0 8px' }}>嘉医汇市场合伙人</h1>
      <p style={{ color: '#607568', marginTop: 0 }}>查看推荐服务的交易与佣金核算</p>
      {error && <p role="alert" style={{ color: '#a52222' }}>{error}</p>}
      {notice && <p style={{ color: '#176b4d' }}>{notice}</p>}
      {!token ? <section style={card}>
        <h2 style={{ fontSize: 18, marginTop: 0 }}>手机号登录</h2>
        <label>登记手机号<input style={field} type="tel" value={phone} onChange={e => setPhone(e.target.value)} maxLength={11} /></label>
        <button style={{ ...button, marginTop: 14 }} disabled={busy} onClick={sendCode}>发送验证码</button>
        <label style={{ display: 'block', marginTop: 12 }}>验证码<input style={field} inputMode="numeric" value={code} onChange={e => setCode(e.target.value)} maxLength={6} /></label>
        <button style={{ ...button, marginTop: 14, width: '100%' }} disabled={busy} onClick={login}>登录并查账</button>
      </section> : <>
        <section style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><strong>{me?.name || '合伙人'}</strong><button onClick={logout}>退出</button></div>
          <p>授权产品线：{me?.productLine || '—'}　推荐码：{me?.referralCode || '—'}</p>
          <p style={{ fontSize: 13, color: '#607568', marginBottom: 0 }}>在用户小程序“我的推广”选择商品并分享给客户；佣金以财务审核与实际打款为准。</p>
        </section>
        <section style={card}>
          <h2 style={{ fontSize: 18, marginTop: 0 }}>我的团队与业务</h2>
          <label>查看月份 <input type="month" value={month} onChange={event => setMonth(event.target.value)} style={{ ...field, maxWidth: 190 }} /></label>
          {overview && <>
            <p>{overview.role === 'leader' ? `我是团队负责人 · ${overview.team.memberCount} 位成员`
              : overview.role === 'member' ? `所属团队负责人：${overview.leader?.name || '—'}` : '目前独立开展业务'}</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div>本人推广业务量<br /><strong>{money(overview.self.promotionCents)}</strong></div>
              <div>成员推广业务量<br /><strong>{money(overview.team.promotionCents)}</strong></div>
              <div>成员服务业务量<br /><strong>{money(overview.team.serviceCents)}</strong></div>
              <div>负责人收益应计／已发<br /><strong>{money(overview.leaderEarnings.accruedCents)}／{money(overview.leaderEarnings.paidCents)}</strong></div>
            </div>
            {overview.members.length > 0 && <div style={{ marginTop: 16 }}><strong>团队成员</strong>
              {overview.members.map(item => <div key={`${item.personType}:${item.personId}`}
                style={{ borderTop: '1px solid #e8efea', padding: '8px 0' }}>
                {item.name}（{item.personType === 'staff' ? '员工' : '市场'}） · 推广 {money(item.promotionCents)} · 服务 {money(item.serviceCents)}
              </div>)}
            </div>}
            <p style={{ fontSize: 12, color: '#607568', marginBottom: 0 }}>业务量按净实收归属展示；推广与服务可能来自同一订单，不可相加为企业营收。负责人收益与本人佣金分别核算。</p>
          </>}
        </section>
        <section style={card}><h2 style={{ fontSize: 18, marginTop: 0 }}>可推荐商品</h2>
          {products.length ? products.map(item => <div key={item.id} style={{ padding: '8px 0', borderTop: '1px solid #e8efea' }}>
            <strong>{item.name}</strong>
          </div>) : <p>暂无已授权的在售商品</p>}
        </section>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button onClick={() => setTab('commissions')} aria-pressed={tab === 'commissions'}>佣金明细</button>
          <button onClick={() => setTab('orders')} aria-pressed={tab === 'orders'}>客户交易</button>
        </div>
        {tab === 'commissions' ? (commissions.length ? commissions.map(item => <section key={item.id} style={card}>
          <strong>{item.serviceName}</strong><span style={{ float: 'right' }}>{labels[item.status] || item.status}</span>
          <p style={{ marginBottom: 4 }}>客户 {item.customer} · {date(item.paidAt)} · 第 {item.periodNumber} 期</p>
          <p style={{ margin: '4px 0' }}>计佣实收 {money(item.eligibleCashCents)} × {(item.basisPoints / 100).toFixed(2)}%</p>
          <p style={{ marginBottom: 0 }}>应计 {money(item.accruedCents)}　累计已发 {money(item.paidCents)}　已追回 {money(item.recoveredCents || 0)}</p>
        </section>) : <section style={card}>暂无佣金记录</section>)
          : (orders.length ? orders.map((item, index) => <section key={`${item.orderNo}-${index}`} style={card}>
            <strong>{item.serviceName}</strong><p>客户 {item.customer} · {date(item.paidAt)}</p>
            <p style={{ marginBottom: 0 }}>订单登记实收 ¥{Number(item.paidAmount || 0).toFixed(2)} · {item.paymentStatus} · 佣金 {item.commissionStatus === 'awaiting_review' ? '待核对' : (labels[item.commissionStatus] || item.commissionStatus)}</p>
          </section>) : <section style={card}>暂无交易记录</section>)}
      </>}
    </div>
  </main>
}
