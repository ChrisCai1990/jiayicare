import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import { useToast } from '../App'

const CATEGORIES = ['全部', '检测套餐', '专家咨询', '上门服务', '健康课程', '服务包']
const CAT_COLOR = { '检测套餐':'#0077B6', '专家咨询':'#1E6B50', '上门服务':'#22A06B', '健康课程':'#8e44ad', '服务包':'#D97706' }

export default function ProductPushPage() {
  const toast = useToast()
  const [products, setProducts] = useState([])
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [catFilter, setCatFilter] = useState('全部')
  const [pushModal, setPushModal] = useState(null)
  const [pushRecords, setPushRecords] = useState([])

  useEffect(() => {
    Promise.all([
      staffAPI.getProducts(),
      staffAPI.getPatients({ limit: 200 }),
      staffAPI.getPushRecords({ type: 'product', limit: 20 }),
    ]).then(([p, pt, pr]) => {
      setProducts(p.data.products)
      setPatients(pt.data.patients)
      setPushRecords(pr.data.records)
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  const reload = async () => {
    const pr = await staffAPI.getPushRecords({ type: 'product', limit: 20 })
    setPushRecords(pr.data.records)
  }

  const filtered = catFilter === '全部' ? products : products.filter(p => p.category === catFilter)

  if (loading) return <div className="page-loading">加载中...</div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">产品推送</h1>
          <p className="page-subtitle">向会员推荐服务商城产品，产生购买后获得分佣</p>
        </div>
      </div>

      {/* 分类筛选 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {CATEGORIES.map(c => (
          <button key={c}
            className={catFilter === c ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            onClick={() => setCatFilter(c)}
          >{c}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
        {/* 产品列表 */}
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>🛍 服务产品库</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map(p => (
              <div key={p.id} className="card">
                <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 12, background: (CAT_COLOR[p.category] || '#1E6B50') + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
                    {p.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{p.name}</span>
                      <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 99, background: (CAT_COLOR[p.category] || '#1E6B50') + '20', color: CAT_COLOR[p.category] || '#1E6B50' }}>{p.category}</span>
                    </div>
                    <div style={{ fontSize: 13, color: '#8AA89C', marginBottom: 6 }}>{p.subtitle}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 18, color: '#1E6B50' }}>¥{p.price}</span>
                      <span style={{ fontSize: 12, color: '#ccc', textDecoration: 'line-through' }}>¥{p.originalPrice}</span>
                    </div>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => setPushModal(p)}>
                    📤 推送
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 推送记录 */}
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>📋 最近推送记录</div>
          {pushRecords.length === 0 ? (
            <div className="card" style={{ padding: 30, textAlign: 'center', color: '#aaa', fontSize: 14 }}>暂无推送记录</div>
          ) : (
            <div className="card">
              {pushRecords.map((r, i) => (
                <div key={r._id} style={{ padding: '12px 16px', borderBottom: i < pushRecords.length - 1 ? '1px solid #f5f2ec' : 'none' }}>
                  <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 2 }}>{r.title}</div>
                  <div style={{ fontSize: 12, color: '#8AA89C' }}>
                    {r.patientId?.name} · {new Date(r.createdAt).toLocaleDateString('zh-CN')}
                  </div>
                  {r.readAt
                    ? <span style={{ fontSize: 11, color: '#22A06B' }}>✓ 已读</span>
                    : <span style={{ fontSize: 11, color: '#D97706' }}>未读</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {pushModal && (
        <PushProductModal
          product={pushModal}
          patients={patients}
          onClose={() => setPushModal(null)}
          onSaved={async (n) => {
            setPushModal(null)
            toast(`产品已推送给 ${n} 位会员`)
            await reload()
          }}
        />
      )}
    </div>
  )
}

function PushProductModal({ product, patients, onClose, onSaved }) {
  const [selected, setSelected] = useState([])
  const [search, setSearch] = useState('')
  const [pushing, setPushing] = useState(false)
  const toggle = id => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  const filtered = patients.filter(p =>
    !search || p.name?.includes(search) || p.phone?.includes(search)
  )

  const handlePush = async () => {
    if (!selected.length) return
    setPushing(true)
    try {
      await staffAPI.pushProduct(product.id, { patientIds: selected })
      onSaved(selected.length)
    } catch { onSaved(selected.length) }
    finally { setPushing(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 500, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <div>
            <h3 className="modal-title">推送「{product.name}」</h3>
            <div style={{ fontSize: 13, color: '#8AA89C', marginTop: 2 }}>¥{product.price} · {product.category}</div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
          <input className="form-input" placeholder="搜索会员姓名/手机号..." value={search}
            onChange={e => setSearch(e.target.value)} style={{ marginBottom: 12 }} />
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelected(filtered.map(p => p._id))}>全选</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelected([])}>清空</button>
            <span style={{ fontSize: 13, color: '#1E6B50', lineHeight: '28px' }}>已选 {selected.length} 人</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.map(p => (
              <div key={p._id} onClick={() => toggle(p._id)} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8,
                border: `1px solid ${selected.includes(p._id) ? '#1E6B50' : '#E0D9CE'}`,
                background: selected.includes(p._id) ? '#E8F5EF' : '#fff', cursor: 'pointer',
              }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${selected.includes(p._id) ? '#1E6B50' : '#ccc'}`, background: selected.includes(p._id) ? '#1E6B50' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {selected.includes(p._id) && <span style={{ color: '#fff', fontSize: 11 }}>✓</span>}
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 500 }}>{p.name}</span>
                  {p.chronicDiseases?.length > 0 && <span style={{ fontSize: 11, color: '#DC3545', marginLeft: 6 }}>{p.chronicDiseases.join('·')}</span>}
                </div>
                <span style={{ fontSize: 12, color: '#aaa' }}>{p.phone}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handlePush} disabled={!selected.length || pushing}>
            {pushing ? '推送中...' : `推送给 ${selected.length} 人`}
          </button>
        </div>
      </div>
    </div>
  )
}
