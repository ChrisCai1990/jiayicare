import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import { useStaff } from '../App'
import Pagination from '../components/Pagination'

const STATUS_LABEL = { pending:'待确认', confirmed:'已确认', paid:'已结算', cancelled:'已取消' }
const STATUS_COLOR = { pending:'#D97706', confirmed:'#0077B6', paid:'#22A06B', cancelled:'#aaa' }

export default function CommissionPage() {
  const { staff } = useStaff()
  const [records, setRecords] = useState([])
  const [total, setTotal] = useState(0)
  const [totalEarned, setTotalEarned] = useState(0)
  const [loading, setLoading] = useState(true)
  const [referralCode, setReferralCode] = useState('')
  const [page, setPage] = useState(1)
  const [copied, setCopied] = useState(false)
  const [products, setProducts] = useState([])
  const [shareProductId, setShareProductId] = useState('')
  const [productSharePath, setProductSharePath] = useState('')
  const [limit, setLimit] = useState(20)

  useEffect(() => {
    Promise.all([
      staffAPI.getMyCommission({ page, limit }),
      staffAPI.getReferralCode(),
      staffAPI.getCommissionShareProducts(),
    ]).then(([c, r, p]) => {
      setRecords(c.data.records)
      setTotal(c.data.total)
      setTotalEarned(c.data.totalEarned)
      setReferralCode(r.data.referralCode)
      setProducts(p.data || [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [page, limit])

  const copyCode = () => {
    navigator.clipboard.writeText(referralCode).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  const shareLink = `http://121.40.156.39?ref=${referralCode}`

  const createProductShare = async () => {
    if (!shareProductId) return
    const res = await staffAPI.createCommissionProductShare(shareProductId)
    setProductSharePath(res.data.path)
    await navigator.clipboard.writeText(res.data.path)
    alert('产品小程序路径已生成并复制，可用于生成小程序卡片：\n' + res.data.path)
  }

  if (loading) return <div className="page-loading">加载中...</div>

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">分佣中心</h1>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header"><div className="card-title">📤 分享具体服务产品</div></div>
        <div className="card-body">
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <select className="form-input" value={shareProductId} onChange={e=>setShareProductId(e.target.value)} style={{maxWidth:420}}>
              <option value="">选择要分享的产品</option>
              {products.map(p=><option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
            <button className="btn btn-primary" disabled={!shareProductId} onClick={createProductShare}>生成专属分享路径</button>
          </div>
          {productSharePath && <div style={{marginTop:10,fontSize:12,color:'#4A6558',wordBreak:'break-all'}}>{productSharePath}</div>}
          <p style={{fontSize:12,color:'#8AA89C'}}>客户通过此产品路径下单后，订单自动归属当前销售，按产品营收分配规则结算。</p>
        </div>
      </div>

      {/* 统计卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#1E6B50' }}>¥{totalEarned.toFixed(2)}</div>
          <div style={{ fontSize: 13, color: '#8AA89C', marginTop: 4 }}>累计佣金（已结算）</div>
        </div>
        <div className="card" style={{ padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#D97706' }}>
            ¥{records.filter(r => r.status === 'pending').reduce((s, r) => s + r.commissionAmount, 0).toFixed(2)}
          </div>
          <div style={{ fontSize: 13, color: '#8AA89C', marginTop: 4 }}>待结算佣金</div>
        </div>
        <div className="card" style={{ padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#4A6558' }}>{total}</div>
          <div style={{ fontSize: 13, color: '#8AA89C', marginTop: 4 }}>推荐订单总数</div>
        </div>
      </div>

      {/* 推荐码 */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header"><div className="card-title">💰 我的推荐码</div></div>
        <div className="card-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ background: '#f0f4f8', borderRadius: 12, padding: '16px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: 4, color: '#1E6B50', fontFamily: 'monospace' }}>{referralCode}</div>
              <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 4 }}>专属推荐码</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: '#4A6558', marginBottom: 12 }}>
                分享您的推荐码，客户通过您的链接购买服务后，您将获得相应佣金奖励。
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-primary btn-sm" onClick={copyCode}>
                  {copied ? '✓ 已复制' : '📋 复制推荐码'}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => {
                  navigator.clipboard.writeText(shareLink)
                  alert('分享链接已复制：\n' + shareLink)
                }}>
                  🔗 复制分享链接
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 分佣记录 */}
      <div className="card">
        <div className="card-header"><div className="card-title">分佣记录</div></div>
        {records.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无分佣记录</div>
        ) : (
          <table className="table">
            <thead><tr><th>产品</th><th>客户</th><th>订单金额</th><th>分佣比例</th><th>分佣金额</th><th>状态</th><th>时间</th></tr></thead>
            <tbody>
              {records.map(r => (
                <tr key={r._id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{r.productName || '-'}</div>
                    <div style={{ fontSize: 11, color: '#aaa' }}>{r.productType}</div>
                  </td>
                  <td>{r.patientId?.name || '-'} <div style={{ fontSize: 11, color: '#aaa' }}>{r.patientId?.phone}</div></td>
                  <td style={{ fontWeight: 600 }}>¥{r.orderAmount?.toFixed(2)}</td>
                  <td style={{ color: '#4A6558' }}>{(r.commissionRate * 100).toFixed(0)}%</td>
                  <td style={{ fontWeight: 700, color: '#1E6B50' }}>¥{r.commissionAmount?.toFixed(2)}</td>
                  <td><span style={{ color: STATUS_COLOR[r.status], fontWeight: 500, fontSize: 13 }}>{STATUS_LABEL[r.status]}</span></td>
                  <td style={{ fontSize: 12, color: '#aaa' }}>{new Date(r.createdAt).toLocaleDateString('zh-CN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} totalPages={Math.ceil(total / limit)} onChange={setPage}
        pageSize={limit} onPageSizeChange={size => { setLimit(size); setPage(1) }} />
    </div>
  )
}
