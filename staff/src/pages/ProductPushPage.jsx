import { usePatientSearch, PatientSearchStatus } from '../components/PatientPicker'
import React, { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { staffAPI } from '../api'
import { useToast } from '../App'
import ScheduleBookingDialog from '../components/ScheduleBookingDialog'

// 分类颜色：已知分类给固定色，其余按名称稳定哈希分配一个色板色
const CAT_COLOR = { '检测套餐':'#0077B6', '专家咨询':'#1E6B50', '上门服务':'#22A06B', '健康课程':'#8e44ad', '服务包':'#D97706' }
const CAT_PALETTE = ['#0077B6', '#1E6B50', '#22A06B', '#8e44ad', '#D97706', '#DC3545', '#0EA5E9', '#EA580C']
const catColor = (name) => CAT_COLOR[name] || CAT_PALETTE[[...(name || '')].reduce((s, c) => s + c.charCodeAt(0), 0) % CAT_PALETTE.length]

function groupedPushRecords(records) {
  const groups = new Map()
  for (const record of records) {
    const item = record.products?.length === 1 ? record.products[0] : null
    const key = record.recommendationBatchId || (item && new Date(record.createdAt).getTime() >= Date.now() - 30 * 86400000
      ? [record.patientId?._id || record.patientId, record.staffId?._id || record.staffId,
        item.productId, item.specificationLabel || '', Math.round(Number(item.price) * 100)].join('|')
      : String(record._id))
    if (!groups.has(key)) groups.set(key, { record, count: 0, maximum: 0, records: [] })
    const group = groups.get(key)
    group.records.push(record)
    if (!record.recalledAt) group.maximum += 1
    if (!record.withdrawnAt) group.count += 1
  }
  return [...groups.values()]
}

export default function ProductPushPage() {
  const location = useLocation()
  const requestedMedicalProxy = new URLSearchParams(location.search).get('medicalProxy') === '1'
  const requestedMedicalServices = new URLSearchParams(location.search).get('medicalServices') === '1'
  const requestedPatientId = new URLSearchParams(location.search).get('patientId') || ''
  const requestedOffline = new URLSearchParams(location.search).get('offline') === '1'
  const toast = useToast()
  const [products, setProducts] = useState([])
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [catFilter, setCatFilter] = useState('全部')
  const [productSearch, setProductSearch] = useState('')
  const [categories, setCategories] = useState(['全部'])
  const [selected, setSelected] = useState([])   // 已选产品 id 数组
  const [selectedPrices, setSelectedPrices] = useState({})  // { productId: price }
  const [quantity, setQuantity] = useState(1)
  const [pushRecords, setPushRecords] = useState([])
  const [showPatientModal, setShowPatientModal] = useState(false)
  const [bookingContext, setBookingContext] = useState(null)
  const [showOfflineOrder, setShowOfflineOrder] = useState(requestedOffline)

  useEffect(() => {
    Promise.all([
      staffAPI.getProducts(),
      requestedPatientId ? staffAPI.getPatient(requestedPatientId).then(r => ({ data: { patients: [r.data.user] } })) : Promise.resolve({ data: { patients: [] } }),
      staffAPI.getPushRecords({ type: 'product', limit: 100 }),
      staffAPI.getProductCategories().catch(() => ({ data: { categories: [] } })),
    ]).then(([p, pt, pr, cat]) => {
      setProducts(p.data.products)
      const loadedPatients = pt.data.patients || []
      const initialPatient = location.state?.initialPatient
      setPatients(initialPatient?._id && !loadedPatients.some(patient => String(patient._id) === String(initialPatient._id))
        ? [initialPatient, ...loadedPatients] : loadedPatients)
      setPushRecords(pr.data.records)
      setCategories(['全部', ...(cat.data?.categories || [])])
      if (requestedMedicalProxy) {
        const proxy = (p.data.products || []).find(product => /医疗代诊/.test(product.name || ''))
        if (proxy) {
          setSelected([proxy.id])
          const firstPrice = (proxy.servicePrices || []).find(item => item.label && item.price != null)?.price
          setSelectedPrices({ [proxy.id]: firstPrice ?? proxy.price ?? 0 })
          setShowPatientModal(true)
        } else toast('未找到已上架的医疗代诊商品，请先在 Admin 配置并上架')
      }
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  const reload = async () => {
    const pr = await staffAPI.getPushRecords({ type: 'product', limit: 100 })
    setPushRecords(pr.data.records)
  }

  const categoryProducts = (catFilter === '全部' ? products : products.filter(p => p.category === catFilter))
    .filter(p => `${p.name} ${p.subtitle || ''} ${p.category || ''}`.toLowerCase().includes(productSearch.trim().toLowerCase()))
  const filtered = requestedMedicalServices ? categoryProducts.filter(p => /medical_assist|medical_proxy/.test(p.serviceWorkflow?.key || '') || /就医|代诊|代办|陪诊|陪同|约诊|复诊|挂号/.test(p.name || '')) : categoryProducts

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
  const totalPrice = selectedItems.reduce((sum, p) => sum + (selectedPrices[p.id] ?? p.price ?? 0), 0) * (selectedItems.length === 1 ? quantity : 1)
  const [historyView, setHistoryView] = useState('sent')
  const isRecalled = historyView === 'recalled'
  const displayPushRecords = groupedPushRecords(pushRecords.filter(row => Boolean(row.recalledAt) === isRecalled))
  const [recalling, setRecalling] = useState(false)
  const recallPush = async record => {
    if (!window.confirm(`撤回发给${record.patientId?.name || '该会员'}的「${record.title}」？撤回后，会员将无法通过这次推送下单。`)) return
    setRecalling(true)
    try {
      await staffAPI.updateProductPushQuantity(record._id, 0)
      setPushRecords(rows => rows.map(row => (row._id === record._id ||
        (record.recommendationBatchId && row.recommendationBatchId === record.recommendationBatchId))
        ? { ...row, withdrawnAt: new Date(), recalledAt: new Date() } : row))
      toast('已撤回推送')
    } catch (error) { toast(error.message || '撤回失败，请重试') }
    finally { setRecalling(false) }
  }
  const changePushQuantity = async group => {
    const entered = window.prompt(`本组共推送 ${group.maximum} 件，当前可购买 ${group.count} 件。请输入新的可购买数量（1-${Math.min(group.maximum, 10)}）：`, String(group.count))
    if (entered === null) return
    const next = Number(entered)
    if (!Number.isInteger(next) || next < 1 || next > Math.min(group.maximum, 10)) {
      toast('请输入有效的整数数量')
      return
    }
    try {
      await staffAPI.updateProductPushQuantity(group.records.find(row => !row.recalledAt)._id, next)
      await reload()
      toast(`推荐数量已调整为 ${next} 件`)
    } catch (error) { toast(error.message || '调整失败，请刷新后重试') }
  }

  if (loading) return <div className="page-loading">加载中...</div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">产品推送</h1>
          <p className="page-subtitle">{requestedMedicalServices ? '选择就医服务产品；单人单项可由医护端直接扣健康基金，套餐权益仍优先使用' : '选择产品推送给会员；单人单项可由医护端直接扣健康基金'}</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => setShowOfflineOrder(true)}>登记线下服务 / 产品</button>
      </div>

      {showOfflineOrder && <OfflineOrderDialog products={products.filter(p => p.offlineOrderEligible)}
        initialPatientId={requestedPatientId} onClose={() => setShowOfflineOrder(false)}
        onSaved={order => { setShowOfflineOrder(false); toast(`已登记待收款订单 ${order.orderNo}，业务编号 ${order.businessReference}；请由管理端核对收款`) }} />}

      {/* 分类筛选 */}
      <input className="form-input" aria-label="搜索服务产品" placeholder="搜索服务或产品名称" value={productSearch} onChange={event => setProductSearch(event.target.value)} style={{ width: '100%', maxWidth: 420, marginBottom: 12 }} />
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
                  <div style={{ padding: '0 16px 12px', textAlign: 'right' }}><button type="button" className="btn btn-secondary btn-sm" onClick={event => { event.stopPropagation(); setBookingContext({ relatedType: 'product', relatedId: p.id, patientId: requestedPatientId || undefined, label: p.name, title: p.name, category: 'service' }) }}>预约时间</button></div>
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
                <button className="btn btn-secondary btn-sm" onClick={() => { setSelected([]); setQuantity(1) }}>清空</button>
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
                {selectedItems.length === 1 && <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 13 }}>
                  推送数量（瓶 / 件）
                  <input type="number" min="1" max="10" step="1" value={quantity} aria-label="推送数量"
                    onChange={event => setQuantity(Math.min(10, Math.max(1, Number.parseInt(event.target.value, 10) || 1)))}
                    style={{ width: 64, padding: '4px 8px', borderRadius: 6, border: '1px solid #ddd' }} />
                </label>}
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
            <div role="group" aria-label="推送记录状态" style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {[['sent', '已推送'], ['recalled', '已撤回']].map(([value, label]) => (
                <button key={value} type="button" aria-pressed={historyView === value}
                  className={`btn btn-sm ${historyView === value ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setHistoryView(value)}>{label}</button>
              ))}
            </div>
            {displayPushRecords.length === 0 ? (
              <div className="card" style={{ padding: 24, textAlign: 'center', color: '#aaa', fontSize: 14 }}>{isRecalled ? '暂无已撤回记录' : '暂无已推送记录'}</div>
            ) : (
              <div className="card">
                {displayPushRecords.map((group, i) => { const r = group.record; return (
                  <div key={r._id} style={{ padding: '12px 16px', borderBottom: i < displayPushRecords.length - 1 ? '1px solid #f5f2ec' : 'none' }}>
                    <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 2 }}>{r.title}</div>
                    <div style={{ fontSize: 12, color: '#8AA89C' }}>
                      {r.patientId?.name} · {new Date(r.createdAt).toLocaleString('zh-CN')}
                    </div>
                    {group.maximum > 1 && <div style={{ fontSize: 12, marginTop: 4 }}>
                      可购买 {group.count}/{group.maximum} 件
                      <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} onClick={() => changePushQuantity(group)}>调整数量</button>
                    </div>}
                    {isRecalled ? (
                      <div style={{ fontSize: 12, color: '#64766d', marginTop: 4 }}>
                        {group.records.length > 1 ? `共 ${group.records.length} 件 · 最近撤回` : '撤回于'} {new Date(Math.max(...group.records.map(row => new Date(row.recalledAt).getTime()))).toLocaleString('zh-CN')}
                      </div>
                    ) : !r.recommendationBatchId && group.records.length > 1 ? (
                      <details style={{ fontSize: 12, marginTop: 6 }}>
                        <summary style={{ cursor: 'pointer' }}>查看 {group.records.length} 条推送明细</summary>
                        {group.records.map(row => <div key={row._id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 6 }}>
                          <span>{new Date(row.createdAt).toLocaleString('zh-CN')}</span>
                          <span>{row.withdrawnAt ? '已调减' : row.readAt ? '已读' : '未读'}</span>
                          <button type="button" className="btn btn-secondary btn-sm" disabled={recalling} onClick={() => recallPush(row)}>撤回推送</button>
                        </div>)}
                      </details>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12 }}>
                        <span>{group.records.some(row => row.readAt) ? '已读' : '未读'}</span>
                        <button type="button" className="btn btn-secondary btn-sm" disabled={recalling} onClick={() => recallPush(r)}>撤回推送</button>
                      </div>
                    )}
                  </div>
                ) })}
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
          quantity={quantity}
          initialPatientId={requestedPatientId}
          onClose={() => setShowPatientModal(false)}
          onSaved={async (n) => {
            setShowPatientModal(false)
            setSelected([])
            setSelectedPrices({})
            setQuantity(1)
            toast(`产品组合已推送给 ${n} 位会员`)
            await reload()
          }}
          onDirectPaid={result => {
            setShowPatientModal(false)
            setSelected([])
            setSelectedPrices({})
            setQuantity(1)
            toast(`健康基金已扣款，服务订单 ${result.orderNo} 已创建`)
          }}
        />
      )}
      {bookingContext && <ScheduleBookingDialog context={bookingContext} onClose={() => setBookingContext(null)} onSaved={() => toast('已预约时间，可在排班与预约中查看')} />}
    </div>
  )
}

function OfflineOrderDialog({ products, initialPatientId, onClose, onSaved }) {
  const [patientId, setPatientId] = useState(initialPatientId)
  const [search, setSearch] = useState('')
  const [productId, setProductId] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [label, setLabel] = useState('')
  const [contractReference, setContractReference] = useState('')
  const [requestId] = useState(() => crypto.randomUUID())
  const [partnerCode, setPartnerCode] = useState('')
  const [staffList, setStaffList] = useState([])
  const [performers, setPerformers] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const patientSearch = usePatientSearch(search)
  const product = products.find(item => item.id === productId)
  const prices = product ? ((product.skus || []).length ? product.skus : (product.servicePrices || [])).filter(item => item.label && Number(item.price) > 0) : []
  const selectedPrice = prices.length ? prices.find(item => item.label === label)?.price : product?.price
  const specificPerformance = product?.servicePrices?.find(item => item.label === label)?.performanceConfig
  const performerRoles = specificPerformance?.enabled === true
    ? (specificPerformance.servicePerformerRoles || []) : (product?.servicePerformerRoles || [])
  useEffect(() => {
    staffAPI.getStaffList({ pageSize: 500 }).then(result => setStaffList(result.data?.staff || result.data?.list || result.data || [])).catch(() => setStaffList([]))
  }, [])
  const submit = async () => {
    setError('')
    if (!patientId || !productId || !selectedPrice || (contractReference.trim() && !/^[A-Za-z0-9_.-]{6,100}$/.test(contractReference.trim()))) {
      setError('请选择客户、商品和规格；外部合同编号如有，须为 6 至 100 位字母、数字、下划线、点或短横线')
      return
    }
    setSaving(true)
    try {
      const result = await staffAPI.createOfflineOrder(patientId, {
        productId, specificationLabel: prices.length ? label : '',
        priceCents: Math.round(Number(selectedPrice) * 100), contractReference: contractReference.trim(), requestId,
        partnerCode: partnerCode.trim().toUpperCase(),
        servicePerformers: Object.entries(performers).filter(([, staffId]) => staffId).map(([role, staffId]) => ({ role, staffId })),
      })
      onSaved(result.data)
    } catch (err) { setError(err.message || '登记失败，请核对后重试') }
    finally { setSaving(false) }
  }
  return <div className="modal-overlay" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="modal" style={{ maxWidth: 560, maxHeight: '88vh', overflowY: 'auto' }}>
      <div className="modal-header"><h3 className="modal-title">登记线下服务 / 产品</h3><button type="button" className="modal-close" onClick={onClose}>✕</button></div>
      <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
        <div style={{ fontSize: 12, color: '#64766d' }}>从 Admin 产品库选择单项服务并登记线下成交；年度组合、库存和权益包走专属流程。登记后只生成待收款订单，实际收款由管理端确认。</div>
        <label>客户<input className="form-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索客户姓名或手机号" /></label>
        <PatientSearchStatus search={patientSearch} />
        <select className="form-input" value={patientId} onChange={event => setPatientId(event.target.value)}>
          <option value="">请选择客户</option>
          {patientId && !patientSearch.patients.some(item => item._id === patientId) && <option value={patientId}>已选择客户</option>}
          {patientSearch.patients.map(item => <option key={item._id} value={item._id}>{item.name} · {item.phone}</option>)}
        </select>
        <label>服务 / 产品<input className="form-input" aria-label="搜索登记商品" value={productSearch} onChange={event => setProductSearch(event.target.value)} placeholder="搜索产品名称或分类" style={{ marginBottom: 6 }} /><select className="form-input" value={productId} onChange={event => { setProductId(event.target.value); setLabel(''); setPerformers({}) }}>
          <option value="">请选择 Admin 产品库商品</option>
          {products.filter(item => item.id === productId || `${item.name} ${item.category || ''}`.toLowerCase().includes(productSearch.trim().toLowerCase())).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        {!products.length && <div role="status" style={{ color: '#B45309', fontSize: 12 }}>Admin 产品库暂无适合单项登记的上架商品。</div>}
        {!!prices.length && <label>收费规格<select className="form-input" value={label} onChange={event => { setLabel(event.target.value); setPerformers({}) }}>
          <option value="">请选择规格</option>
          {prices.map((item, index) => <option key={`${item.label}-${index}`} value={item.label}>{item.label} · ¥{Number(item.price).toFixed(2)}</option>)}
        </select></label>}
        {product && <div>产品库标价：<strong>¥{selectedPrice ? Number(selectedPrice).toFixed(2) : '请选规格'}</strong></div>}
        <label>外部合同编号（如有）<input className="form-input" value={contractReference} maxLength={100} onChange={event => setContractReference(event.target.value)} placeholder="没有合同可留空，系统自动生成业务编号" /></label>
        <label>合伙人推荐码（如有）<input className="form-input" value={partnerCode} maxLength={12} onChange={event => setPartnerCode(event.target.value)} placeholder="无合伙人时留空" /></label>
        {!!performerRoles.length && <div><strong style={{ fontSize: 13 }}>服务团队</strong><div style={{ fontSize: 12, color: '#64766d' }}>这里只记录履约人员，不自动记为该人员的推广业绩或整单营收；服务激励以实际完成和审核为准。</div>
          {performerRoles.map(rule => <label key={rule.role} style={{ display: 'block', marginTop: 8 }}>{PERFORMER_ROLE_LABEL[rule.role] || rule.role}
            <select className="form-input" value={performers[rule.role] || ''} onChange={event => setPerformers(previous => ({ ...previous, [rule.role]: event.target.value }))}>
              <option value="">待确定</option>
              {staffList.filter(item => item.role === rule.role).map(item => <option key={item._id} value={item._id}>{item.name}</option>)}
            </select></label>)}
        </div>}
        {error && <div role="alert" className="login-err">{error}</div>}
      </div>
      <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={onClose}>取消</button>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={saving || !products.length}>{saving ? '登记中…' : '登记待收款订单'}</button></div>
    </div>
  </div>
}

const PERFORMER_ROLE_LABEL = {
  familyDoctor: '健康顾问', nutritionist: '营养师', healthManager: '健管专员',
  medicalAssistant: '就医专员', psychologist: '心理咨询师', rehabSpecialist: '运动复健师',
  specialist: '专科医师', tcmDoctor: '中医师',
}

function PatientSelectModal({ patients, selectedItems, totalPrice, selectedPrices, quantity = 1, initialPatientId = '', onClose, onSaved, onDirectPaid }) {
  const [selectedPatients, setSelectedPatients] = useState(() => patients.some(patient => String(patient._id || patient.id) === initialPatientId) ? [initialPatientId] : [])
  const [search, setSearch] = useState('')
  const [pushing, setPushing] = useState(false)
  const [pushError, setPushError] = useState('')
  const [staffList, setStaffList] = useState([])
  // 岗位服务人选择：{ [productId]: { [role]: staffId } }
  const [performers, setPerformers] = useState({})
  const [directLabel, setDirectLabel] = useState(() => {
    const product = selectedItems[0]
    return (product?.servicePrices || []).find(row => Number(row.price) === Number(selectedPrices?.[product.id]))?.label || product?.servicePrices?.[0]?.label || ''
  })
  const [fundQuote, setFundQuote] = useState(null)
  const [fundError, setFundError] = useState('')
  const [fundLoading, setFundLoading] = useState(false)
  const [fundRequestId] = useState(() => crypto.randomUUID())
  const toggle = id => setSelectedPatients(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  // 有产品配了服务岗位才需要加载员工列表供选人
  const withSelectedRoles = product => {
    const matches = (product.servicePrices || []).filter(row => Number(row.price) === Number(selectedPrices?.[product.id] ?? product.price))
    const specific = matches.length === 1 ? matches[0].performanceConfig : null
    return { ...product, specificationLabel: matches.length === 1 ? matches[0].label : '',
      selectedPerformerRoles: specific?.enabled === true ? (specific.servicePerformerRoles || []) : (product.servicePerformerRoles || []) }
  }
  const productsWithRoles = selectedItems.map(withSelectedRoles).filter(p => p.selectedPerformerRoles.length > 0)
  useEffect(() => {
    if (productsWithRoles.length === 0) return
    staffAPI.getStaffList({ pageSize: 500 }).then(r => {
      setStaffList(r.data?.staff || r.data?.list || r.data || [])
    }).catch(() => {})
    // 用产品预设的默认服务人预填
    const init = {}
    productsWithRoles.forEach(p => {
      init[p.id] = {}
      p.selectedPerformerRoles.forEach(sr => { if (sr.defaultStaffId) init[p.id][sr.role] = String(sr.defaultStaffId) })
    })
    setPerformers(init)
  }, [selectedItems.length])

  const setPerformer = (productId, role, staffId) =>
    setPerformers(prev => ({ ...prev, [productId]: { ...(prev[productId] || {}), [role]: staffId } }))

  const patientSearch = usePatientSearch(search)
  const filtered = patientSearch.patients

  const directPatientId = selectedPatients.length === 1 && selectedItems.length === 1 && quantity === 1 ? selectedPatients[0] : ''
  const directProduct = selectedItems.length === 1 && quantity === 1 ? selectedItems[0] : null
  useEffect(() => {
    setFundQuote(null)
    setFundError('')
    if (!directPatientId || !directProduct) return
    let active = true
    setFundLoading(true)
    staffAPI.quoteStaffFundOrder(directPatientId, { productId: directProduct.id, specificationLabel: directLabel })
      .then(result => { if (active) setFundQuote(result.data) })
      .catch(error => { if (active) setFundError(error.message || '读取健康基金报价失败') })
      .finally(() => { if (active) setFundLoading(false) })
    return () => { active = false }
  }, [directPatientId, directProduct?.id, directLabel])

  const handleDirectFund = async () => {
    if (!fundQuote || fundQuote.shortage > 0 || !directPatientId || !directProduct) return
    setFundLoading(true); setFundError('')
    try {
      const result = await staffAPI.createStaffFundOrder(directPatientId, {
        productId: directProduct.id, specificationLabel: directLabel, requestId: fundRequestId,
        expectedPrice: fundQuote.price, expectedPersonal: fundQuote.personal, expectedCorporate: fundQuote.corporate,
      })
      onDirectPaid(result.data)
    } catch (error) { setFundError(error.message || '扣款状态待核对，请勿重新发起服务') }
    finally { setFundLoading(false) }
  }


  const handlePush = async () => {
    if (!selectedPatients.length) return
    setPushing(true); setPushError('')
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
        pricedProducts: selectedItems.map(p => { const selected = withSelectedRoles(p); return { productId: p.id,
          price: selectedPrices?.[p.id] ?? p.price, specificationLabel: selected.specificationLabel,
          quantity: selectedItems.length === 1 ? quantity : 1 } }),
        servicePerformers,
      })
      onSaved(selectedPatients.length)
    } catch (e) {
      setPushError(e.message || '推送失败，请重试')
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
              {selectedItems.length === 1 ? `${quantity} 瓶 / 件` : `${selectedItems.length} 项产品`} · 合计 ¥{totalPrice}
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
              }}>{p.name} ×{selectedItems.length === 1 ? quantity : 1} ¥{selectedPrices?.[p.id] ?? p.price}</span>
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
                  {p.selectedPerformerRoles.map(sr => (
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
            <button className="btn btn-secondary btn-sm" onClick={() => setSelectedPatients(previous => [...new Set([...previous, ...filtered.map(p => p._id)])])}>选择本页</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelectedPatients([])}>清空</button>
            <span style={{ fontSize: 13, color: '#1E6B50', lineHeight: '28px' }}>已选 {selectedPatients.length} 人</span>
          </div>
          <PatientSearchStatus search={patientSearch} />
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
        {directPatientId && directProduct && <div style={{ padding: '12px 20px', borderTop: '1px solid #E0D9CE', background: '#F3FAF6', display: 'grid', gap: 8 }}>
          <strong style={{ fontSize: 13 }}>医护端直接使用客户健康基金</strong>
          {!!directProduct.servicePrices?.length && <label style={{ fontSize: 12 }}>收费规格
            <select className="form-input" style={{ marginTop: 4 }} value={directLabel} onChange={event => setDirectLabel(event.target.value)}>
              {directProduct.servicePrices.filter(row => row.label).map(row => <option key={row.label} value={row.label}>{row.label} ¥{Number(row.price).toFixed(2)}</option>)}
            </select>
          </label>}
          {fundLoading && !fundQuote && <span style={{ fontSize: 12 }}>正在核算基金余额…</span>}
          {fundQuote && <div style={{ fontSize: 12, lineHeight: 1.7 }}>
            服务价格 ¥{Number(fundQuote.price).toFixed(2)}；自有基金抵扣 ¥{Number(fundQuote.personal).toFixed(2)}；企业赠送基金抵扣 ¥{Number(fundQuote.corporate).toFixed(2)}
            {fundQuote.shortage > 0 && <div style={{ color: '#B45309' }}>基金不足，剩余 ¥{Number(fundQuote.shortage).toFixed(2)} 请通过推送由客户支付。</div>}
          </div>}
          {fundError && <div role="alert" style={{ color: '#B42318', fontSize: 12 }}>{fundError}</div>}
          <button className="btn btn-secondary btn-sm" type="button" disabled={fundLoading || !fundQuote || fundQuote.shortage > 0}
            onClick={handleDirectFund}>确认直接扣款并创建服务订单</button>
        </div>}
        {pushError && <div role="alert" className="login-err" style={{ margin: 12 }}>{pushError}</div>}
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
