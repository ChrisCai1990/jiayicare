import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import { useStaff } from '../App'

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
  const limit = 20

  useEffect(() => {
    Promise.all([
      staffAPI.getMyCommission({ page, limit }),
      staffAPI.getReferralCode(),
    ]).then(([c, r]) => {
      setRecords(c.data.records)
      setTotal(c.data.total)
      setTotalEarned(c.data.totalEarned)
      setReferralCode(r.data.referralCode)
    }).catch(console.error).finally(() => setLoading(false))
  }, [page])

  const copyCode = () => {
    navigator.clipboard.writeText(referralCode).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  const shareLink = `http://121.40.156.39?ref=${referralCode}`

  if (loading) return <div className="page-loading">加载中...</div>

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">分佣中心</h1>
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

      {total > limit && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
          <span style={{ lineHeight: '32px', fontSize: 14, color: '#666' }}>第 {page} / {Math.ceil(total / limit)} 页</span>
          <button className="btn btn-secondary btn-sm" disabled={page >= Math.ceil(total / limit)} onClick={() => setPage(p => p + 1)}>下一页</button>
        </div>
      )}
    </div>
  )
}
