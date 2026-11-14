import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminAPI } from '../api'
import './partnerWorkspace.css'

const PAGE_SIZE = 10
const lineName = { medical: '就医服务', nutrition: '营养与食养', annual: '年度健康管理', consultation: '咨询服务' }
const rate = value => value == null ? '—' : `${Number(value).toFixed(2).replace(/\.00$/, '')}%`

export default function FinanceCooperationPage() {
  const [partners, setPartners] = useState([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState('')
  const [products, setProducts] = useState([])
  const [productPage, setProductPage] = useState(1)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminAPI.marketPartners().then(result => {
      const rows = result.data || []
      setPartners(rows)
      setSelectedId(rows[0]?._id || '')
    }).catch(err => setError(err.message)).finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    if (!selectedId) { setProducts([]); return }
    let cancelled = false
    setProducts([]); setProductPage(1)
    adminAPI.marketPartnerPromotableProducts(selectedId).then(result => {
      if (!cancelled) setProducts(result.data?.rows || [])
    }).catch(err => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [selectedId])

  const visible = useMemo(() => partners.filter(item =>
    `${item.name} ${item.phone} ${item.contractReference} ${lineName[item.segment || item.productLine] || ''}`
      .toLowerCase().includes(search.trim().toLowerCase())), [partners, search])
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const currentPage = Math.min(page, pages)
  const selected = partners.find(item => String(item._id) === selectedId)
  const productPages = Math.max(1, Math.ceil(products.length / PAGE_SIZE))

  return <div className="partner-workspace">
    <div className="partner-workspace__shell">
      <div className="page-header"><div><h1 className="page-title">合作信息</h1><p className="page-subtitle">本机构合伙人资料、合作编号与当前可推荐商品佣金规则</p></div><Link to="/finance/business" className="btn btn-primary">查看业务营收 →</Link></div>
      {error && <p role="alert" style={{ color: '#b42318' }}>{error}</p>}
      <div className="partner-ui__directory">
        <section className="partner-ui__card">
          <div className="partner-ui__toolbar"><h2>合伙人（{visible.length}）</h2><input className="form-input" type="search" aria-label="查找合伙人" placeholder="查找姓名、手机号、合同编号" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} /></div>
          {loading ? <p>读取中…</p> : <div className="partner-ui__detail-list">{visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map(item => <button className={`finance-partner-row${selectedId === String(item._id) ? ' is-selected' : ''}`} key={item._id} type="button" onClick={() => setSelectedId(String(item._id))}>
            <strong>{item.name}</strong><span>{lineName[item.segment || item.productLine] || item.productLine || '未分类'} · {item.status === 'active' ? '合作中' : '非活动'}</span>
          </button>)}</div>}
          <div className="partner-ui__pagination"><span>第 {currentPage} / {pages} 页 · 每页 10 位</span><button className="btn" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>上一页</button><button className="btn btn-primary" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>下一页 →</button></div>
        </section>
        <section className="partner-ui__card partner-ui__detail">
          <h2>{selected?.name || '选择合伙人'}</h2>
          {selected && <><p>手机号：{selected.phone || '—'}</p><p>合作方向：{lineName[selected.segment || selected.productLine] || selected.productLine || '—'}</p><p>合同编号：{selected.contractReference || '尚未登记'}</p><p className="partner-ui__muted">合同编号不代表签署文件已归档；签署文件以协议档案为准。</p>
            <h3>可推荐商品与佣金比例（{products.length}）</h3>
            {products.slice((productPage - 1) * PAGE_SIZE, productPage * PAGE_SIZE).map(item => <div className="partner-ui__product" key={item.productId}>
              <strong>{item.name}</strong><small>首次购买 {rate(item.firstPercent)}{item.repeatPercent != null ? ` · 再次购买 ${rate(item.repeatPercent)}` : ''}</small>
              {item.tierPercents?.length > 0 && <small>月度分档：{item.tierPercents.map((value, index) => `${index + 1}单${index === item.tierPercents.length - 1 ? '及以上' : ''} ${rate(value)}`).join(' / ')}</small>}
              {item.renewals?.length > 0 && <small>续费：{item.renewals.map(entry => `第${entry.year}年 ${rate(entry.percent)}`).join('、')}</small>}
              <small>规则版本 {item.version || '—'} · 生效 {item.effectiveFrom ? new Date(item.effectiveFrom).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—'}</small>
            </div>)}
            {!products.length && <p className="partner-ui__muted">暂无当前有效的授权商品。</p>}
            {products.length > PAGE_SIZE && <div className="partner-ui__pagination"><span>第 {productPage} / {productPages} 页</span><button className="btn" disabled={productPage <= 1} onClick={() => setProductPage(productPage - 1)}>上一页</button><button className="btn btn-primary" disabled={productPage >= productPages} onClick={() => setProductPage(productPage + 1)}>下一页 →</button></div>}
          </>}
        </section>
      </div>
    </div>
  </div>
}
