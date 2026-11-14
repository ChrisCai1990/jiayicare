import React, { useEffect, useState } from 'react'

const API_BASE = `${import.meta.env.VITE_API_URL || '/api'}/market-partner`
const money = cents => `¥${(Number(cents || 0) / 100).toFixed(2)}`
const date = value => value ? new Date(value).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—'
const labels = { estimated: '预估', pending: '待审核', partially_paid: '部分已发', paid: '已发放',
  cancelled: '已取消', reversal_due: '待冲回' }
const productLines = { medical: '就医服务', nutrition: '营养与食养', annual: '年度健康管理',
  consultation: '咨询服务', consumer365: '365会员' }
const percent = basisPoints => `${(Number(basisPoints || 0) / 100).toFixed(2).replace(/\.00$/, '')}%`
const commissionTerms = rule => {
  if (!rule) return []
  const first = rule.kind === 'annual' ? '首年' : rule.kind === 'first' || rule.repeatBasisPoints != null ? '首次购买' : '每次购买'
  const opening = rule.tierBasisPoints?.length
    ? `${first}按当月有效单量分档：${rule.tierBasisPoints.map((rate, index) => `${index + 1}单${index === rule.tierBasisPoints.length - 1 ? '及以上' : ''} ${percent(rate)}`).join(' / ')}`
    : `${first}佣金比例：${percent(rule.firstBasisPoints)}`
  const terms = [opening]
  if (rule.kind === 'annual' && rule.renewalBasisPoints?.length)
    terms.push(`续费：${rule.renewalBasisPoints.map(item => `第${item.year}年 ${percent(item.basisPoints)}`).join('、')}`)
  if (rule.kind === 'first') terms.push('后续购买不按本规则计佣')
  if (rule.kind === 'every' && rule.repeatBasisPoints != null) terms.push(`再次购买：${percent(rule.repeatBasisPoints)}`)
  if (rule.directReferralRequired) terms.push('须由本人直接推荐并满足归属条件')
  return terms
}

async function call(path, body, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) { const error = new Error(json.message || '请求失败'); error.status = res.status; throw error }
  return json.data
}

export default function MarketPartnerPortalPage({ view = 'cooperation' }) {
  const [token, setToken] = useState(() => sessionStorage.getItem('jy_market_partner_token') || '')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [me, setMe] = useState(null)
  const [products, setProducts] = useState([])
  const [productSearch, setProductSearch] = useState('')
  const [commissions, setCommissions] = useState([])
  const [orders, setOrders] = useState([])
  const [overview, setOverview] = useState(null)
  const [cooperation, setCooperation] = useState(null)
  const [month, setMonth] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).format(new Date()))
  const [tab, setTab] = useState('commissions')

  useEffect(() => {
    if (!token) return
    const requests = view === 'cooperation'
      ? [call('/me', undefined, token), call('/cooperation/me', undefined, token), call('/products', undefined, token)]
      : [call('/me', undefined, token), call('/commissions', undefined, token), call('/orders', undefined, token)]
    Promise.all(requests).then(([identity, second, third]) => {
      setMe(identity)
      if (view === 'cooperation') { setCooperation(second); setProducts(third) }
      else { setCommissions(second); setOrders(third) }
    }).catch(err => {
      setError(err.message)
      if (err.status === 401) { sessionStorage.removeItem('jy_market_partner_token'); setToken('') }
    })
  }, [token, view])

  useEffect(() => {
    if (!token || view !== 'business') return
    call(`/my-overview?month=${encodeURIComponent(month)}`, undefined, token)
      .then(setOverview).catch(err => setError(err.message))
  }, [token, month, view])

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
  const logout = () => { sessionStorage.removeItem('jy_market_partner_token'); setToken(''); setMe(null); setCooperation(null) }
  const downloadAgreement = async row => {
    setBusy(true); setError('')
    try {
      const res = await fetch(`${API_BASE}/cooperation/files/${row.id}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', referrerPolicy: 'no-referrer' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || '下载失败')
      const url = URL.createObjectURL(await res.blob())
      const link = document.createElement('a')
      link.href = url; link.download = row.name || '已签合作协议'; document.body.appendChild(link); link.click(); link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const card = { background: '#fff', border: '1px solid #d9e5de', borderRadius: 12, padding: 16, marginBottom: 12 }
  const field = { width: '100%', padding: '11px 12px', border: '1px solid #c6d6ce', borderRadius: 8, marginTop: 8, boxSizing: 'border-box' }
  const button = { border: 0, background: '#176b4d', color: '#fff', borderRadius: 8, padding: '11px 16px', cursor: 'pointer' }
  const visibleProducts = products.filter(item => item.name.includes(productSearch.trim()))

  return <main style={{ minHeight: '100vh', background: '#f4f8f5', color: '#20352a', padding: '24px 16px', fontFamily: 'sans-serif' }}>
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, margin: '0 0 8px' }}>嘉医汇市场合伙人</h1>
      <p style={{ color: '#607568', marginTop: 0 }}>{view === 'cooperation' ? '合作资料、协议与可推荐商品' : '查看本人及团队的业务归属和佣金核算'}</p>
      {error && <p role="alert" style={{ color: '#a52222' }}>{error}</p>}
      {notice && <p style={{ color: '#176b4d' }}>{notice}</p>}
      {!token ? <section style={card}>
        <h2 style={{ fontSize: 18, marginTop: 0 }}>手机号登录</h2>
        <label>登记手机号<input style={field} type="tel" value={phone} onChange={e => setPhone(e.target.value)} maxLength={11} /></label>
        <button style={{ ...button, marginTop: 14 }} disabled={busy} onClick={sendCode}>发送验证码</button>
        <label style={{ display: 'block', marginTop: 12 }}>验证码<input style={field} inputMode="numeric" value={code} onChange={e => setCode(e.target.value)} maxLength={6} /></label>
        <button style={{ ...button, marginTop: 14, width: '100%' }} disabled={busy} onClick={login}>登录工作台</button>
      </section> : <>
        <nav aria-label="合伙人工作台页面" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {[['cooperation', '合作信息'], ['business', '业务营收']].map(([key, label]) => <a key={key}
            href={`/market-partner/${key}`} aria-current={view === key ? 'page' : undefined}
            style={{ ...button, flex: 1, textAlign: 'center', textDecoration: 'none', background: view === key ? '#176b4d' : '#e6efe9', color: view === key ? '#fff' : '#20352a' }}>{label}</a>)}
        </nav>
        {view === 'cooperation' && <>
        <section style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><strong>{me?.name || '合伙人'}</strong><button onClick={logout}>退出</button></div>
          <p>合作方向：{productLines[me?.productLine] || me?.productLine || '—'}　推荐码：{me?.referralCode || '—'}</p>
          <p style={{ fontSize: 13, color: '#607568', marginBottom: 0 }}>在用户小程序“我的推广”分享已授权商品；具体佣金以订单归属时的有效规则、财务审核与实际打款为准。</p>
        </section>
        <section style={card}>
          <h2 style={{ fontSize: 18, marginTop: 0 }}>合作协议与约定</h2>
          {cooperation?.profile?.contractReference && <p>合作合同编号：{cooperation.profile.contractReference}</p>}
          {cooperation?.agreements?.length ? cooperation.agreements.map(row => <div key={row.id} style={{ borderTop: '1px solid #E5EDE9', padding: '10px 0' }}>
            <strong>{row.title}</strong> · 签署于 {row.signedDate}<div>{row.name}</div>
            <button type="button" style={button} disabled={busy} onClick={() => downloadAgreement(row)}>下载手签协议</button>
          </div>) : <p>已登记合同编号；签署文件尚未归档，请联系嘉医汇核对。合同编号不代表文件已经签署或归档。</p>}
        </section>
        <section style={card}><h2 style={{ fontSize: 18, marginTop: 0 }}>可推荐商品与佣金比例</h2>
          <p style={{ fontSize: 13, color: '#607568' }}>当前可推荐 {products.length} 项商品</p>
          <label>查找商品<input type="search" value={productSearch} onChange={event => setProductSearch(event.target.value)}
            placeholder="输入商品名称" style={field} /></label>
          {visibleProducts.length ? visibleProducts.map(item => <div key={item.id} style={{ padding: '12px 0', borderTop: '1px solid #e8efea' }}>
            <strong>{item.name}</strong>
            {commissionTerms(item.commission).map((term, index) => <div key={index} style={{ marginTop: 5 }}>{term}</div>)}
            <div style={{ marginTop: 5, fontSize: 12, color: '#607568' }}>当前规则版本 {item.commission?.version || '—'} · 生效日期 {date(item.commission?.effectiveFrom)}{item.commission?.effectiveUntil ? ` 至 ${date(item.commission.effectiveUntil)}` : ' 起持续有效'}</div>
          </div>) : <p>{products.length ? '未找到匹配的商品。' : '暂无已授权的在售商品。'}</p>}
          <p style={{ fontSize: 12, color: '#607568', marginBottom: 0 }}>这里显示当前有效的推荐规则。历史订单按当时锁定的规则核算，具体金额和审核状态请到“业务营收”查看。</p>
        </section>
        </>}
        {view === 'business' && <>
        <section style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><h2 style={{ fontSize: 18, marginTop: 0 }}>个人与团队业务</h2><button onClick={logout}>退出</button></div>
          <label>查看月份 <input type="month" value={month} onChange={event => setMonth(event.target.value)} style={{ ...field, maxWidth: 190 }} /></label>
          {overview && <>
            <p>{overview.role === 'leader' ? `我是团队负责人 · ${overview.team.memberCount} 位成员`
              : overview.role === 'member' ? `所属团队负责人：${overview.leader?.name || '—'}` : '目前独立开展业务'}</p>
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>本人</h3>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div>推广归属净实收<br /><strong>{money(overview.self.promotionCents)}</strong></div>
            </div>
            {overview.role === 'leader' && <><h3 style={{ fontSize: 15, marginBottom: 8 }}>团队（含本人）</h3>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div>推广归属净实收<br /><strong>{money(overview.self.promotionCents + overview.team.promotionCents)}</strong></div>
                <div>成员服务业务归属<br /><strong>{money(overview.team.serviceCents)}</strong></div>
                <div>负责人收益应计／已发<br /><strong>{money(overview.leaderEarnings.accruedCents)}／{money(overview.leaderEarnings.paidCents)}</strong></div>
              </div></>}
            {overview.role === 'leader' && overview.members.length > 0 && <div style={{ marginTop: 16 }}><strong>团队成员业务</strong>
              {overview.members.map(item => <div key={`${item.personType}:${item.personId}`}
                style={{ borderTop: '1px solid #e8efea', padding: '8px 0' }}>
                {item.name}（{item.personType === 'staff' ? '员工' : '市场'}） · 推广 {money(item.promotionCents)} · 服务 {money(item.serviceCents)}
              </div>)}
            </div>}
            <p style={{ fontSize: 12, color: '#607568', marginBottom: 0 }}>业务量按净实收归属展示；推广与服务可能来自同一订单，不可相加为企业营收。团队负责人收益与本人佣金分别核算。</p>
          </>}
        </section>
        <h2 style={{ fontSize: 18 }}>业务与佣金明细</h2>
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
        <p style={{ fontSize: 12, color: '#607568' }}>明细展示最近最多 200 笔；上方月度业务汇总按完整有效范围核算。</p>
        </>}
      </>}
    </div>
  </main>
}
