import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import { useToast } from '../App'

// 分类颜色：已知分类给固定色，其余按名称稳定哈希分配一个色板色
const CAT_COLOR = { '检测套餐':'#0077B6', '专家咨询':'#1E6B50', '上门服务':'#22A06B', '健康课程':'#8e44ad', '服务包':'#D97706' }
const CAT_PALETTE = ['#0077B6', '#1E6B50', '#22A06B', '#8e44ad', '#D97706', '#DC3545', '#0EA5E9', '#EA580C']
const catColor = (name) => CAT_COLOR[name] || CAT_PALETTE[[...(name || '')].reduce((s, c) => s + c.charCodeAt(0), 0) % CAT_PALETTE.length]

export default function ProductPushPage() {
  const toast = useToast()
  const [products, setProducts] = useState([])
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [catFilter, setCatFilter] = useState('全部')
  const [categories, setCategories] = useState(['全部'])
  const [selected, setSelected] = useState([])   // 已选产品 id 数组
  const [selectedPrices, setSelectedPrices] = useState({})  // { productId: price }
  const [pushRecords, setPushRecords] = useState([])
  const [showPatientModal, setShowPatientModal] = useState(false)

  useEffect(() => {
    Promise.all([
      staffAPI.getProducts(),
      staffAPI.getPatients({ limit: 200 }),
      staffAPI.getPushRecords({ type: 'product', limit: 20 }),
      staffAPI.getProductCategories().catch(() => ({ data: { categories: [] } })),
    ]).then(([p, pt, pr, cat]) => {
      setProducts(p.data.products)
      setPatients(pt.data.patients)
      setPushRecords(pr.data.records)
      setCategories(['全部', ...(cat.data?.categories || [])])
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  const reload = async () => {
    const pr = await staffAPI.getPushRecords({ type: 'product', limit: 20 })
    setPushRecords(pr.data.records)
  }

  const filtered = catFilter === '全部' ? products : products.filter(p => p.category === catFilter)

  const toggleProduct = (id) => {
    const product = products.find(p => p.id === id)
    setSelected(s => {
      if (s.includes(id)) {
        setSelectedPrices(sp => { const n = {...sp}; delete n[id]; return n })
        return s.filter(x => x !== id)
      }
      // 有收费项目时默认选第一项价格，否则用 originalPrice
      const svcPrices = Array.isArray(product?.servicePrices) ? product.servicePrices.filter(sp => sp.label && sp.price != null) : []
      const defaultPrice = svcPrices.length > 0 ? svcPrices[0].price : (product?.price || 0)
      setSelectedPrices(sp => ({ ...sp, [id]: defaultPrice }))
      return [...s, id]
    })
  }

  const selectedItems = products.filter(p => selected.includes(p.id))
  const totalPrice = selectedItems.reduce((sum, p) => sum + (selectedPrices[p.id] ?? p.price ?? 0), 0)

  if (loading) return <div className="page-loading">加载中...</div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">产品推送</h1>
          <p className="page-subtitle">选择多个产品组合推送给会员，会员可自由选择购买</p>
        </div>
      </div>

      {/* 分类筛选 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {categories.map(c => (
          <button key={c}
            className={catFilter === c ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            onClick={() => setCatFilter(c)}
          >{c}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, alignItems: 'start' }}>
        {/* 产品列表（可多选） */}
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
            🛍 服务产品库
            <span style={{ fontSize: 13, color: '#8AA89C', fontWeight: 400, marginLeft: 8 }}>点击产品卡片加入推送清单</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(p => {
              const isSelected = selected.includes(p.id)
              return (
                <div
                  key={p.id}
                  onClick={() => toggleProduct(p.id)}
                  className="card"
                  style={{
                    cursor: 'pointer',
                    border: `2px solid ${isSelected ? '#1E6B50' : 'transparent'}`,
                    background: isSelected ? '#F0FAF5' : '#fff',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                    {/* 选择框 */}
                    <div style={{
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                      border: `2px solid ${isSelected ? '#1E6B50' : '#ccc'}`,
                      background: isSelected ? '#1E6B50' : '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isSelected && <span style={{ color: '#fff', fontSize: 13, lineHeight: 1 }}>✓</span>}
                    </div>
                    {/* 图标 */}
                    <div style={{
                      width: 48, height: 48, borderRadius: 10, flexShrink: 0,
                      background: catColor(p.category) + '15',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                    }}>
                      {p.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</span>
                        <span style={{
                          fontSize: 11, padding: '1px 7px', borderRadius: 99,
                          background: catColor(p.category) + '20',
                          color: catColor(p.category),
                        }}>{p.category}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#8AA89C' }}>{p.subtitle}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {(() => {
                        const svcPrices = Array.isArray(p.servicePrices) ? p.servicePrices.filter(sp => sp.label && sp.price != null) : []
                        if (svcPrices.length > 0) {
                          return (
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 15, color: '#1E6B50' }}>
                                ¥{isSelected ? (selectedPrices[p.id] ?? svcPrices[0].price) : svcPrices[0].price}
                              </div>
                              <div style={{ fontSize: 11, color: '#8AA89C', marginTop: 2 }}>{svcPrices.length}个价格可选</div>
                              {isSelected && (
                                <select
                                  style={{ marginTop: 4, fontSize: 11, padding: '2px 4px', borderRadius: 6, border: '1px solid #1E6B50', color: '#1E6B50', background: '#F0FAF5', width: 100 }}
                                  value={selectedPrices[p.id] ?? svcPrices[0].price}
                                  onClick={e => e.stopPropagation()}
                                  onChange={e => { e.stopPropagation(); setSelectedPrices(sp => ({ ...sp, [p.id]: Number(e.target.value) })) }}
                                >
                                  {svcPrices.map((sp, i) => (
                                    <option key={i} value={sp.price}>{sp.label} ¥{sp.price}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                          )
                        }
                        return <div style={{ fontWeight: 700, fontSize: 17, color: '#1E6B50' }}>¥{p.price}</div>
                      })()}
                    </div>
                  </div>
                </div>
              )
            })}
            {filtered.length === 0 && (
              <div className="card" style={{ padding: 30, textAlign: 'center', color: '#aaa', fontSize: 14 }}>
                该分类暂无上架产品
              </div>
            )}
          </div>
        </div>

        {/* 右侧：推送清单 + 推送记录 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* 推送清单 */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>📋 推送清单</span>
              {selected.length > 0 && (
                <button className="btn btn-secondary btn-sm" onClick={() => setSelected([])}>清空</button>
              )}
            </div>

            {selected.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#aaa', fontSize: 13, padding: '20px 0' }}>
                点击左侧产品添加到推送清单
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  {selectedItems.map(p => {
                    const svcPrices = Array.isArray(p.servicePrices) ? p.servicePrices.filter(sp => sp.label && sp.price != null) : []
                    const hasMultiPrice = svcPrices.length > 0
                    const curPrice = selectedPrices[p.id] ?? p.price
                    return (
                      <div key={p.id} style={{ fontSize: 13, borderBottom: '1px solid #f5f2ec', paddingBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ cursor: 'pointer', color: '#DC3545', fontSize: 15, lineHeight: 1 }}
                              onClick={() => toggleProduct(p.id)}>✕</span>
                            <span style={{ color: '#1A2B24' }}>{p.name}</span>
                          </div>
                          <span style={{ fontWeight: 600, color: '#1E6B50' }}>¥{curPrice}</span>
                        </div>
                        {hasMultiPrice && (
                          <div style={{ marginTop: 5, marginLeft: 20 }}>
                            <select
                              style={{ fontSize: 12, padding: '2px 6px', borderRadius: 6, border: '1px solid #ddd', color: '#555', width: '100%' }}
                              value={curPrice}
                              onClick={e => e.stopPropagation()}
                              onChange={e => setSelectedPrices(sp => ({ ...sp, [p.id]: Number(e.target.value) }))}
                            >
                              {svcPrices.map((sp, i) => (
                                <option key={i} value={sp.price}>{sp.label} ¥{sp.price}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div style={{ borderTop: '1px solid #f5f2ec', paddingTop: 10, marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                    <span style={{ color: '#8AA89C' }}>共 {selectedItems.length} 项</span>
                    <span style={{ fontWeight: 700, color: '#1E6B50' }}>合计 ¥{totalPrice}</span>
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={() => setShowPatientModal(true)}
                >
                  推送给会员 →
                </button>
              </>
            )}
          </div>

          {/* 推送记录 */}
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>🕐 最近推送记录</div>
            {pushRecords.length === 0 ? (
              <div className="card" style={{ padding: 24, textAlign: 'center', color: '#aaa', fontSize: 14 }}>暂无推送记录</div>
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
      </div>

      {showPatientModal && (
        <PatientSelectModal
          patients={patients}
          selectedItems={selectedItems}
          totalPrice={totalPrice}
          selectedPrices={selectedPrices}
          onClose={() => setShowPatientModal(false)}
          onSaved={async (n) => {
            setShowPatientModal(false)
            setSelected([])
            setSelectedPrices({})
            toast(`产品组合已推送给 ${n} 位会员`)
            await reload()
          }}
        />
      )}
    </div>
  )
}

const PERFORMER_ROLE_LABEL = {
  familyDoctor: '家庭医生', nutritionist: '营养师', healthManager: '健管专员',
  medicalAssistant: '就医专员', psychologist: '心理咨询师', rehabSpecialist: '运动复健师',
  specialist: '专科医师', tcmDoctor: '中医师',
}

function PatientSelectModal({ patients, selectedItems, totalPrice, selectedPrices, onClose, onSaved }) {
  const [selectedPatients, setSelectedPatients] = useState([])
  const [search, setSearch] = useState('')
  const [pushing, setPushing] = useState(false)
  const [staffList, setStaffList] = useState([])
  // 岗位服务人选择：{ [productId]: { [role]: staffId } }
  const [performers, setPerformers] = useState({})
  const toggle = id => setSelectedPatients(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  // 有产品配了服务岗位才需要加载员工列表供选人
  const productsWithRoles = selectedItems.filter(p => (p.servicePerformerRoles || []).length > 0)
  useEffect(() => {
    if (productsWithRoles.length === 0) return
    staffAPI.getStaffList({ pageSize: 500 }).then(r => {
      setStaffList(r.data?.staff || r.data?.list || r.data || [])
    }).catch(() => {})
    // 用产品预设的默认服务人预填
    const init = {}
    productsWithRoles.forEach(p => {
      init[p.id] = {}
      ;(p.servicePerformerRoles || []).forEach(sr => { if (sr.defaultStaffId) init[p.id][sr.role] = String(sr.defaultStaffId) })
    })
    setPerformers(init)
  }, [selectedItems.length])

  const setPerformer = (productId, role, staffId) =>
    setPerformers(prev => ({ ...prev, [productId]: { ...(prev[productId] || {}), [role]: staffId } }))

  const filtered = patients.filter(p =>
    !search || p.name?.includes(search) || p.phone?.includes(search)
  )

  const handlePush = async () => {
    if (!selectedPatients.length) return
    setPushing(true)
    try {
      // 把各产品各岗位选定的人展平成 [{productId, role, staffId}]
      const servicePerformers = []
      Object.entries(performers).forEach(([productId, roleMap]) => {
        Object.entries(roleMap || {}).forEach(([role, staffId]) => {
          if (staffId) servicePerformers.push({ productId, role, staffId })
        })
      })
      await staffAPI.pushBundle({
        productIds: selectedItems.map(p => p.id),
        patientIds: selectedPatients,
        pricedProducts: selectedItems.map(p => ({ productId: p.id, price: selectedPrices?.[p.id] ?? p.price })),
        servicePerformers,
      })
      onSaved(selectedPatients.length)
    } catch (e) {
      console.error(e)
    } finally {
      setPushing(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 520, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <div>
            <h3 className="modal-title">选择推送会员</h3>
            <div style={{ fontSize: 13, color: '#8AA89C', marginTop: 2 }}>
              {selectedItems.length} 项产品 · 合计 ¥{totalPrice}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* 产品摘要 */}
        <div style={{ padding: '10px 20px', background: '#F0FAF5', borderBottom: '1px solid #E0D9CE' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {selectedItems.map(p => (
              <span key={p.id} style={{
                fontSize: 12, padding: '2px 10px', borderRadius: 99,
                background: '#1E6B5020', color: '#1E6B50',
              }}>{p.name} ¥{p.price}</span>
            ))}
          </div>
        </div>

        {/* 岗位服务人员：产品配了服务岗位时，逐岗位指定具体人员（供客户下单后按岗位比例发绩效）*/}
        {productsWithRoles.length > 0 && (
          <div style={{ padding: '10px 20px', borderBottom: '1px solid #E0D9CE', background: '#FFFDF7' }}>
            <div style={{ fontSize: 12, color: '#8A6D3B', marginBottom: 8 }}>👥 指定服务人员（可预留空，核销时也可再定）</div>
            {productsWithRoles.map(p => (
              <div key={p.id} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#4A6558', marginBottom: 4 }}>{p.name}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {(p.servicePerformerRoles || []).map(sr => (
                    <div key={sr.role} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 12, color: '#8AA89C' }}>{PERFORMER_ROLE_LABEL[sr.role] || sr.role}({sr.rate}%)</span>
                      <select
                        className="form-input"
                        style={{ width: 120, padding: '4px 8px', fontSize: 12 }}
                        value={performers[p.id]?.[sr.role] || ''}
                        onChange={e => setPerformer(p.id, sr.role, e.target.value)}
                      >
                        <option value="">未指定</option>
                        {staffList.filter(s => s.role === sr.role).map(s => (
                          <option key={s._id} value={s._id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
          <input
            className="form-input"
            placeholder="搜索会员姓名/手机号..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ marginBottom: 10 }}
          />
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelectedPatients(filtered.map(p => p._id))}>全选</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelectedPatients([])}>清空</button>
            <span style={{ fontSize: 13, color: '#1E6B50', lineHeight: '28px' }}>已选 {selectedPatients.length} 人</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.map(p => (
              <div key={p._id} onClick={() => toggle(p._id)} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8,
                border: `1px solid ${selectedPatients.includes(p._id) ? '#1E6B50' : '#E0D9CE'}`,
                background: selectedPatients.includes(p._id) ? '#E8F5EF' : '#fff', cursor: 'pointer',
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                  border: `2px solid ${selectedPatients.includes(p._id) ? '#1E6B50' : '#ccc'}`,
                  background: selectedPatients.includes(p._id) ? '#1E6B50' : '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {selectedPatients.includes(p._id) && <span style={{ color: '#fff', fontSize: 11 }}>✓</span>}
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 500 }}>{p.name}</span>
                  {p.chronicDiseases?.length > 0 && (
                    <span style={{ fontSize: 11, color: '#DC3545', marginLeft: 6 }}>{p.chronicDiseases.join('·')}</span>
                  )}
                </div>
                <span style={{ fontSize: 12, color: '#aaa' }}>{p.phone}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handlePush} disabled={!selectedPatients.length || pushing}>
            {pushing ? '推送中...' : `推送给 ${selectedPatients.length} 人`}
          </button>
        </div>
      </div>
    </div>
  )
}
