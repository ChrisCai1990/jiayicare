import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'
import { useToast } from '../../App'

const CLIENT_BRANDS = [
  { value: 'jiayiguanjia', label: '嘉医管家' },
  { value: 'jinyisen', label: '金伊森' },
]
const brandLabel = value => CLIENT_BRANDS.find(item => item.value === value)?.label || '未设置'
// 客户分层是系统固定口径，与可由运营维护的「会员类型」树分开。
// 归属（嘉医管家/金伊森）、具体服务包及权益次数也各自独立。
const MEMBERSHIP_TIERS = [
  { value: '', label: '不自动改变客户分层' },
  { value: 'basic', label: '基础会员' },
  { value: 'consumer365', label: '365会员' },
  { value: 'annual', label: '年度会员' },
  { value: 'therapy', label: '疗程会员' },
  { value: 'enterprise', label: '企业会员' },
]

// ─── 共用：简单列表管理组件（标签/来源） ─────────────────────────
function SimpleListTab({ title, desc, fetchFn, createFn, updateFn, toggleFn, deleteFn, withClientBrand = false, withEntitlements = false, withActivation = false }) {
  const toast = useToast()
  const [list, setList] = useState([])
  const [productCatalog, setProductCatalog] = useState([])
  const [productSearch, setProductSearch] = useState('')
  const [showIncludedOnly, setShowIncludedOnly] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [name, setName] = useState('')
  const [clientBrand, setClientBrand] = useState('jiayiguanjia')
  const [entitlements, setEntitlements] = useState({ aiHealthAnalysis: false, phaseAssessment: false, monthlyServiceReview: false, healthConsultation: false, medicalPlanning: false })
  const [activation, setActivation] = useState({ enabled: false, durationMonths: 12, price: 0, originalPrice: 0, featuresText: '', tag: '', highlight: false })
  const [configuration, setConfiguration] = useState({ deliveryMode: 'digital', includes365: false, familySharing: false, membershipTier: '', reviewMode: 'exception', noResponseRule: '连续3次（隔日）未配合转人工', phaseAssessmentSchedule: [], monthlyReviewStartMonth: 1, serviceEntitlements: [], sharedEntitlementPools: [] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    const requests = [fetchFn()]
    if (withActivation) requests.push(adminAPI.products({ limit: 500 }))
    Promise.all(requests).then(([r, products]) => {
      setList(r.data)
      if (products) setProductCatalog((products.data || []).filter(item => item.status === 'on'))
    }).catch(e => toast(e.message)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const emptyConfiguration = { deliveryMode: 'digital', includes365: false, familySharing: false, membershipTier: '', reviewMode: 'exception', noResponseRule: '连续3次（隔日）未配合转人工', phaseAssessmentSchedule: [], monthlyReviewStartMonth: 1, serviceEntitlements: [], sharedEntitlementPools: [] }
  const openCreate = () => { setEditId(null); setName(''); setClientBrand('jiayiguanjia'); setEntitlements({ aiHealthAnalysis: false, phaseAssessment: false, monthlyServiceReview: false, healthConsultation: false, medicalPlanning: false }); setActivation({ enabled: false, durationMonths: 12, price: 0, originalPrice: 0, featuresText: '', tag: '', highlight: false }); setConfiguration(emptyConfiguration); setProductSearch(''); setShowIncludedOnly(false); setError(''); setShowModal(true) }
  const openEdit = item => { setEditId(item._id); setName(item.name); setClientBrand(item.clientBrand || 'jiayiguanjia'); setEntitlements({ aiHealthAnalysis: !!item.entitlements?.aiHealthAnalysis, phaseAssessment: !!item.entitlements?.phaseAssessment, monthlyServiceReview: !!item.entitlements?.monthlyServiceReview, healthConsultation: !!item.entitlements?.healthConsultation, medicalPlanning: !!item.entitlements?.medicalPlanning }); setActivation({ enabled: !!item.activation?.enabled, durationMonths: item.activation?.durationMonths || 12, price: item.activation?.price || 0, originalPrice: item.activation?.originalPrice || 0, featuresText: (item.activation?.features || []).join('\n'), tag: item.activation?.tag || '', highlight: !!item.activation?.highlight }); setConfiguration({ ...emptyConfiguration, ...(item.configuration || {}), serviceEntitlements: item.configuration?.serviceEntitlements || [], sharedEntitlementPools: item.configuration?.sharedEntitlementPools || [] }); setProductSearch(''); setShowIncludedOnly(false); setError(''); setShowModal(true) }

  const handleSave = async () => {
    if (!name.trim()) { setError('名称不能为空'); return }
    setSaving(true); setError('')
    try {
      const activationPayload = { ...activation, features: activation.featuresText.split(/\r?\n/).map(v => v.trim()).filter(Boolean) }
      delete activationPayload.featuresText
      const payload = withClientBrand ? { name, clientBrand, ...(withEntitlements ? { entitlements } : {}), ...(withActivation ? { activation: activationPayload, configuration } : {}) } : { name }
      if (editId) { await updateFn(editId, payload); toast('已更新') }
      else { await createFn(payload); toast('已创建') }
      setShowModal(false); load()
    } catch (e) { setError(e.message || '操作失败') }
    finally { setSaving(false) }
  }

  const handleToggle = async item => {
    try { await toggleFn(item._id); load() } catch (e) { toast(e.message) }
  }

  const handleDelete = async item => {
    if (!window.confirm(`确定删除「${item.name}」？`)) return
    try { await deleteFn(item._id); toast('已删除'); load() } catch (e) { toast(e.message) }
  }

  const normalizedProductSearch = productSearch.trim().toLowerCase()
  const includedProducts = (configuration.serviceEntitlements || []).filter(item => Number(item.count) > 0 || item.poolKey)
  const includedIds = new Set(includedProducts.map(item => String(item.productId)))
  const poolByKey = new Map((configuration.sharedEntitlementPools || []).map(item => [item.key, item]))
  const visibleProducts = (normalizedProductSearch
    ? productCatalog.filter(item => [item.name, item.category, item.description].filter(Boolean).join(' ').toLowerCase().includes(normalizedProductSearch))
    : productCatalog).filter(item => !showIncludedOnly || includedIds.has(String(item._id)))
  const isItemActive = item => item.active ?? item.status === 'active'
  const statusCounts = {
    all: list.length,
    active: list.filter(isItemActive).length,
    inactive: list.filter(item => !isItemActive(item)).length,
  }
  const visibleList = list.filter(item => statusFilter === 'all' || (statusFilter === 'active' ? isItemActive(item) : !isItemActive(item)))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: '#6B7280' }}>{desc}</p>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>＋ 新增</button>
      </div>
      {withActivation && <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[['all', '全部'], ['active', '启用'], ['inactive', '停用']].map(([value, label]) => <button key={value} type="button" className={statusFilter === value ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'} onClick={() => setStatusFilter(value)}>{label}（{statusCounts[value]}）</button>)}
      </div>}
      {loading ? <div style={{ padding: 32, textAlign: 'center', color: '#aaa' }}>加载中...</div>
        : list.length === 0 ? <div style={{ padding: 32, textAlign: 'center', color: '#aaa' }}>暂无数据</div>
        : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {(withClientBrand ? ['名称', '客户归属', ...(withEntitlements ? ['AI权益'] : []), ...(withActivation ? ['用户开通'] : []), '状态', '操作'] : ['名称', '状态', '操作']).map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 14px', fontSize: 12, fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleList.map(item => (
              <tr key={item._id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                <td style={{ padding: '10px 14px', fontWeight: 500 }}>{item.name}</td>
                {withClientBrand && <td style={{ padding: '10px 14px' }}>{brandLabel(item.clientBrand)}</td>}
                {withEntitlements && <td style={{ padding: '10px 14px', fontSize: 12, color: '#4B5563' }}>
                  {[item.entitlements?.aiHealthAnalysis && 'AI健康信息整理', item.entitlements?.phaseAssessment && '阶段性评估', item.entitlements?.monthlyServiceReview && '月度服务复盘', item.entitlements?.healthConsultation && '持续咨询支持', item.entitlements?.medicalPlanning && '就医规划支持'].filter(Boolean).join('、') || '无'}
                </td>}
                {withActivation && <td style={{ padding: '10px 14px', fontSize: 12, color: '#4B5563' }}>
                  {item.activation?.enabled ? `${item.activation.durationMonths || '-'}个月 / ¥${item.activation.price || 0}` : '不展示'}
                </td>}
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: isItemActive(item) ? '#E8F5EF' : '#FEF2F2', color: isItemActive(item) ? '#1E6B50' : '#DC2626' }}>
                    {isItemActive(item) ? '启用' : '停用'}
                  </span>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)} style={{ marginRight: 6 }}>编辑</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => handleToggle(item)} style={{ marginRight: 6 }}>{isItemActive(item) ? '停用' : '启用'}</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item)}>删除</button>
                </td>
              </tr>
            ))}
            {!visibleList.length && <tr><td colSpan={withClientBrand ? 6 : 3} style={{ padding: 28, textAlign: 'center', color: '#6B7280' }}>当前筛选条件下暂无服务包</td></tr>}
          </tbody>
        </table>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="modal" style={{ maxWidth: withActivation ? 620 : 360 }}>
            <div className="modal-header">
              <h3 className="modal-title">{editId ? '编辑' : '新增'}{title}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            {error && <div className="login-err" style={{ margin: '0 20px 12px' }}>⚠️ {error}</div>}
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">名称 *</label>
                <input className="form-input" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} autoFocus />
              </div>
              {withClientBrand && (
                <div className="form-group">
                  <label className="form-label">客户归属 *</label>
                  <select className="form-input" value={clientBrand} onChange={e => setClientBrand(e.target.value)}>
                    {CLIENT_BRANDS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </div>
              )}
              {withEntitlements && (
                <div className="form-group">
                  <label className="form-label">服务包专属权益</label>
                  {[['aiHealthAnalysis', 'AI健康信息整理'], ['phaseAssessment', '阶段性评估'], ['monthlyServiceReview', '月度服务复盘'], ['healthConsultation', '健康顾问持续咨询支持（不计次数）'], ['medicalPlanning', '就医规划支持（不计次数）']].map(([key, label]) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!entitlements[key]} onChange={e => setEntitlements(v => ({ ...v, [key]: e.target.checked }))} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              )}
              {withActivation && (
                <div className="form-group" style={{ borderTop: '1px solid #E5E7EB', paddingTop: 14 }}>
                  <label className="form-label">服务交付方式</label>
                  <select className="form-input" value={configuration.deliveryMode} onChange={e => setConfiguration(v => ({ ...v, deliveryMode: e.target.value }))}>
                    <option value="digital">数字自助型：AI/App 为主，必要时转人工</option>
                    <option value="team">团队协同型：健管专员主动执行，顾问关键决策</option>
                    <option value="human">人工主导型：服务团队主导，AI 作为工作台</option>
                  </select>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer' }}><input type="checkbox" checked={!!configuration.includes365} onChange={e => setConfiguration(v => ({ ...v, includes365: e.target.checked }))} />方案已含365健康管理权限</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer' }}><input type="checkbox" checked={!!configuration.familySharing} onChange={e => setConfiguration(v => ({ ...v, familySharing: e.target.checked }))} />套餐权益允许已关联家庭成员共享</label>
                  <label className="form-label" style={{ marginTop: 12 }}>开通后写入客户分层</label>
                  <select className="form-input" value={configuration.membershipTier || ''} onChange={e => setConfiguration(v => ({ ...v, membershipTier: e.target.value }))}>
                    {MEMBERSHIP_TIERS.map(item => <option key={item.value || 'none'} value={item.value}>{item.label}</option>)}
                  </select>
                  <p style={{ color: '#6B7280', fontSize: 12, margin: '5px 0 0' }}>这是固定的系统客户分层，不再关联旧“会员类型”树。客户归属、具体服务包及实际权益次数分别独立维护；权益与扣减以下方商城产品配置为准。</p>
                  <select className="form-input" style={{ marginTop: 10 }} value={configuration.reviewMode} onChange={e => setConfiguration(v => ({ ...v, reviewMode: e.target.value }))}>
                    <option value="none">档案处理：不安排人工审核</option><option value="exception">档案处理：标准内容AI跟进，异常/非标准转人工</option><option value="required">档案处理：需人工审核后启动服务</option>
                  </select>
                  <input className="form-input" style={{ marginTop: 10 }} value={configuration.noResponseRule || ''} onChange={e => setConfiguration(v => ({ ...v, noResponseRule: e.target.value }))} placeholder="未配合转人工规则" />
                  <label className="form-label" style={{ marginTop: 14 }}>共享次数池（可选）</label>
                  <p style={{ color: '#6B7280', fontSize: 12, margin: '4px 0 8px' }}>适用于“代办、代诊、陪诊共 2 次”这类合并权益。先新增次数池，再在下方商品中选择它；选入池的商品不再单独计次。</p>
                  {(configuration.sharedEntitlementPools || []).map((pool, index) => (
                    <div key={pool.key || index} style={{ display: 'grid', gridTemplateColumns: '1fr .45fr auto', gap: 8, marginBottom: 8 }}>
                      <input className="form-input" value={pool.name || ''} placeholder="例如：就医协助共享次数" onChange={e => setConfiguration(v => ({ ...v, sharedEntitlementPools: (v.sharedEntitlementPools || []).map((item, i) => i === index ? { ...item, name: e.target.value } : item) }))} />
                      <input className="form-input" type="number" min="1" value={pool.count ?? 1} title="共享次数" onChange={e => setConfiguration(v => ({ ...v, sharedEntitlementPools: (v.sharedEntitlementPools || []).map((item, i) => i === index ? { ...item, count: Math.max(1, Number(e.target.value) || 1) } : item) }))} />
                      <button type="button" className="btn btn-ghost" onClick={() => setConfiguration(v => ({ ...v, sharedEntitlementPools: (v.sharedEntitlementPools || []).filter((_, i) => i !== index), serviceEntitlements: (v.serviceEntitlements || []).map(item => item.poolKey === pool.key ? { ...item, poolKey: '' } : item) }))}>删除</button>
                    </div>
                  ))}
                  {entitlements.phaseAssessment && <div style={{ margin: '10px 0 0 26px', padding: 10, background: '#F7FAFC', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#4A5568', marginBottom: 6 }}>阶段性评估节点</div>
                    {[['week2', '第2周'], ['month1', '第1个月'], ['quarterly', '每季度']].map(([value, label]) => <label key={value} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginRight: 16, fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={(configuration.phaseAssessmentSchedule || []).includes(value)} onChange={e => setConfiguration(v => ({ ...v, phaseAssessmentSchedule: e.target.checked ? [...new Set([...(v.phaseAssessmentSchedule || []), value])] : (v.phaseAssessmentSchedule || []).filter(item => item !== value) }))} />{label}</label>)}
                    <div style={{ fontSize: 11, color: '#718096', marginTop: 6 }}>节点决定系统何时创建待办；首月节点与月度复盘会合并为一次工作提醒，避免重复。</div>
                  </div>}
                  {entitlements.monthlyServiceReview && <div style={{ margin: '10px 0 0 26px', display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 13, color: '#4A5568' }}>月度复盘从服务第</span><select className="form-input" style={{ width: 88, padding: '6px 8px' }} value={configuration.monthlyReviewStartMonth || 1} onChange={e => setConfiguration(v => ({ ...v, monthlyReviewStartMonth: Number(e.target.value) }))}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select><span style={{ fontSize: 13, color: '#4A5568' }}>个月开始，每月一次</span></div>}
                  <button type="button" className="btn btn-ghost" onClick={() => setConfiguration(v => ({ ...v, sharedEntitlementPools: [...(v.sharedEntitlementPools || []), { key: `pool_${Date.now()}`, name: '', count: 1 }] }))}>+ 新增共享次数池</button>
                  <label className="form-label" style={{ marginTop: 14 }}>方案包含的商城产品</label>
                  <p style={{ color: '#6B7280', fontSize: 12, margin: '4px 0 8px' }}>商城产品自动列出；填写大于 0 的次数即写入客户权益，填 0 表示不包含。阶段性评估、月度服务复盘等套餐管理动作在上方“年度会员专属权益”中勾选，不在此处配置为商城产品。产品价格、抵扣比例和履约规则仍在商城产品中维护。</p>
                  <div style={{ padding: 10, marginBottom: 10, border: '1px solid #BBF7D0', borderRadius: 8, background: '#F0FDF4' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: includedProducts.length ? 8 : 0 }}>
                      <strong style={{ fontSize: 13, color: '#166534' }}>已包含 {includedProducts.length} 项商城服务</strong>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowIncludedOnly(value => !value)}>{showIncludedOnly ? '查看全部商品' : '只看已包含'}</button>
                    </div>
                    {includedProducts.length ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{includedProducts.map(item => {
                      const pool = poolByKey.get(item.poolKey)
                      return <span key={item.productId} style={{ padding: '3px 8px', background: '#DCFCE7', color: '#166534', borderRadius: 99, fontSize: 12 }}>{item.name || productCatalog.find(p => String(p._id) === String(item.productId))?.name || '已选商品'} · {pool ? `共享：${pool.name || '未命名次数池'}（${pool.count || 0}次）` : `${item.count}次`}</span>
                    })}</div> : <span style={{ fontSize: 12, color: '#6B7280' }}>尚未选择商城服务；填入次数或选择共享次数池后会显示在这里。</span>}
                  </div>
                  <input className="form-input" value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="搜索产品名称、分类或说明" style={{ marginBottom: 8 }} />
                  <div style={{ maxHeight: 330, overflowY: 'auto', border: '1px solid #E5E7EB', borderRadius: 8, padding: 8 }}>
                    {visibleProducts.map(product => {
                      const saved = (configuration.serviceEntitlements || []).find(item => String(item.productId) === String(product._id)) || { productId: String(product._id), name: product.name, count: 0, schedule: '' }
                      const update = patch => setConfiguration(v => {
                        const rows = [...(v.serviceEntitlements || [])]
                        const i = rows.findIndex(item => String(item.productId) === String(product._id))
                        const next = { ...saved, ...patch, productId: String(product._id), name: product.name }
                        if (i >= 0) rows[i] = next; else rows.push(next)
                        return { ...v, serviceEntitlements: rows }
                      })
                      const inPool = !!saved.poolKey
                      const included = Number(saved.count) > 0 || inPool
                      return <div key={product._id} style={{ display: 'grid', gridTemplateColumns: '1.15fr .35fr .8fr 1fr', gap: 8, padding: '7px 6px', borderBottom: '1px solid #F3F4F6', background: included ? '#F0FDF4' : 'transparent', borderRadius: 6 }}>
                        <div style={{ fontSize: 13, alignSelf: 'center' }}><strong>{product.name}</strong>{included && <span style={{ marginLeft: 6, padding: '1px 5px', borderRadius: 99, background: '#BBF7D0', color: '#166534', fontSize: 11 }}>已包含</span>}<small style={{ display: 'block', color: '#6B7280' }}>{product.category}</small></div>
                        {inPool ? <div className="form-input" title="由共享次数池统一扣减" style={{ color: '#6B7280', background: '#F9FAFB' }}>共享</div> : <input className="form-input" type="number" min="0" value={saved.count ?? 0} onChange={e => update({ count: Math.max(0, Number(e.target.value) || 0) })} title="包含次数" />}
                        <select className="form-input" value={saved.poolKey || ''} onChange={e => update({ poolKey: e.target.value, count: e.target.value ? 0 : saved.count })} title="共享次数池"><option value="">独立次数</option>{(configuration.sharedEntitlementPools || []).map(pool => <option key={pool.key} value={pool.key}>{pool.name || '未命名共享池'}</option>)}</select>
                        <input className="form-input" value={saved.schedule || ''} placeholder="周期/核销说明（可选）" onChange={e => update({ schedule: e.target.value })} />
                      </div>
                    })}
                    {!productCatalog.length && <p style={{ color: '#6B7280', padding: 8 }}>暂无上架商城产品，请先在“商城产品”中维护。</p>}
                    {!!productCatalog.length && !visibleProducts.length && <p style={{ color: '#6B7280', padding: 8 }}>没有匹配的商城产品。</p>}
                  </div>
                </div>
              )}
              {withActivation && (
                <div className="form-group" style={{ borderTop: '1px solid #E5E7EB', paddingTop: 14 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={activation.enabled} onChange={e => setActivation(v => ({ ...v, enabled: e.target.checked }))} />
                    <span className="form-label" style={{ margin: 0 }}>允许新客户在用户端开通</span>
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
                    <input className="form-input" type="number" min="1" placeholder="服务月数" value={activation.durationMonths} onChange={e => setActivation(v => ({ ...v, durationMonths: Number(e.target.value) }))} />
                    <input className="form-input" type="number" min="0" placeholder="售价" value={activation.price} onChange={e => setActivation(v => ({ ...v, price: Number(e.target.value) }))} />
                    <input className="form-input" type="number" min="0" placeholder="划线价（可选）" value={activation.originalPrice} onChange={e => setActivation(v => ({ ...v, originalPrice: Number(e.target.value) }))} />
                    <input className="form-input" placeholder="标签（如 推荐）" value={activation.tag} onChange={e => setActivation(v => ({ ...v, tag: e.target.value }))} />
                  </div>
                  <textarea className="form-input" rows="4" style={{ marginTop: 10 }} placeholder="权益说明，每行一项" value={activation.featuresText} onChange={e => setActivation(v => ({ ...v, featuresText: e.target.value }))} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer' }}>
                    <input type="checkbox" checked={activation.highlight} onChange={e => setActivation(v => ({ ...v, highlight: e.target.checked }))} />
                    <span>重点展示</span>
                  </label>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? '保存中...' : (editId ? '保存' : '创建')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 会员类型（树形） ──────────────────────────────────────────
function MemberTypeTab() {
  const toast = useToast()
  const [treeData, setTreeData] = useState([])
  const [flatList, setFlatList] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ name: '', parent: '', sortOrder: 0, clientBrand: 'jiayiguanjia' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    adminAPI.memberTypesTree().then(r => {
      setTreeData(r.data)
      // 展开为平铺列表
      const flat = []
      const walk = (nodes, depth = 0) => nodes.forEach(n => { flat.push({ ...n, depth }); walk(n.children || [], depth + 1) })
      walk(r.data)
      setFlatList(flat)
    }).catch(e => toast(e.message)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openCreate = (parentId = '') => {
    const parent = flatList.find(item => item._id === parentId)
    setEditId(null); setForm({ name: '', parent: parentId, sortOrder: 0, clientBrand: parent?.clientBrand || 'jiayiguanjia' }); setError(''); setShowModal(true)
  }
  const openEdit = item => {
    setEditId(item._id); setForm({ name: item.name, parent: item.parent || '', sortOrder: item.sortOrder || 0, clientBrand: item.clientBrand || 'jiayiguanjia' }); setError(''); setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('类型名称不能为空'); return }
    setSaving(true); setError('')
    try {
      if (editId) { await adminAPI.updateMemberTypeTree(editId, form); toast('已更新') }
      else { await adminAPI.createMemberTypeTree(form); toast('已创建') }
      setShowModal(false); load()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleToggle = async item => {
    try { await adminAPI.toggleMemberTypeTree(item._id); load() } catch (e) { toast(e.message) }
  }

  const handleDelete = async item => {
    if (!window.confirm(`确定删除「${item.name}」？子类目也将被删除。`)) return
    try { await adminAPI.deleteMemberTypeTree(item._id); toast('已删除'); load() } catch (e) { toast(e.message) }
  }

  const renderTree = (nodes, depth = 0) => nodes.map(n => (
    <React.Fragment key={n._id}>
      <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
        <td style={{ padding: '10px 14px', paddingLeft: 14 + depth * 24 }}>
          <span style={{ color: depth > 0 ? '#6B7280' : undefined }}>
            {depth > 0 ? '└ ' : ''}{n.name}
          </span>
        </td>
        <td style={{ padding: '10px 14px' }}>
          {brandLabel(n.clientBrand)}
        </td>
        <td style={{ padding: '10px 14px' }}>
          <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: n.active ? '#E8F5EF' : '#FEF2F2', color: n.active ? '#1E6B50' : '#DC2626' }}>
            {n.active ? '启用' : '停用'}
          </span>
        </td>
        <td style={{ padding: '10px 14px' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => openCreate(n._id)} style={{ marginRight: 4 }}>＋子类目</button>
          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(n)} style={{ marginRight: 4 }}>编辑</button>
          <button className="btn btn-secondary btn-sm" onClick={() => handleToggle(n)} style={{ marginRight: 4 }}>{n.active ? '停用' : '启用'}</button>
          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(n)}>删除</button>
        </td>
      </tr>
      {n.children?.length > 0 && renderTree(n.children, depth + 1)}
    </React.Fragment>
  ))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: '#6B7280' }}>定义会员等级/类型，支持多层子类目树形结构</p>
        <button className="btn btn-primary btn-sm" onClick={() => openCreate()}>＋ 新增顶级类型</button>
      </div>
      {loading ? <div style={{ padding: 32, textAlign: 'center', color: '#aaa' }}>加载中...</div>
        : treeData.length === 0 ? <div style={{ padding: 32, textAlign: 'center', color: '#aaa' }}>暂无类型</div>
        : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {['类型名称', '客户归属', '状态', '操作'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 14px', fontSize: 12, fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>{renderTree(treeData)}</tbody>
        </table>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3 className="modal-title">{editId ? '编辑类型' : (form.parent ? '新增子类目' : '新增顶级类型')}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            {error && <div className="login-err" style={{ margin: '0 20px 12px' }}>⚠️ {error}</div>}
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">类型名称 *</label>
                <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">客户归属 *</label>
                <select className="form-input" value={form.clientBrand}
                  onChange={e => setForm(f => ({ ...f, clientBrand: e.target.value, parent: '' }))}>
                  {CLIENT_BRANDS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">父级类型</label>
                <select className="form-input" value={form.parent} onChange={e => setForm(f => ({ ...f, parent: e.target.value }))}>
                  <option value="">无（顶级）</option>
                  {flatList.filter(n => n._id !== editId && (n.clientBrand || 'jiayiguanjia') === form.clientBrand).map(n => (
                    <option key={n._id} value={n._id}>{'　'.repeat(n.depth)}{n.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">排序权重</label>
                <input className="form-input" type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? '保存中...' : (editId ? '保存' : '创建')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 主页面（3个 Tab） ─────────────────────────────────────────
const TABS = ['会员标签', '会员来源', '会员类型', '服务包']

export default function MemberSettingsPage() {
  const [tab, setTab] = useState(0)

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>会员设置</h2>
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: 0, borderBottom: '2px solid #E5E7EB' }}>
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            style={{
              padding: '10px 24px', fontSize: 14, fontWeight: 500, border: 'none', background: 'none', cursor: 'pointer',
              color: tab === i ? '#1E6B50' : '#6B7280',
              borderBottom: tab === i ? '2px solid #1E6B50' : '2px solid transparent',
              marginBottom: -2,
            }}
          >{t}</button>
        ))}
      </div>

      <div className="card" style={{ borderTopLeftRadius: 0, marginTop: 0 }}>
        {tab === 0 && (
          <SimpleListTab
            title="会员标签"
            desc="自定义会员标签，用于分类、筛选、营销"
            fetchFn={adminAPI.memberTags}
            createFn={adminAPI.createMemberTag}
            updateFn={adminAPI.updateMemberTag}
            toggleFn={adminAPI.toggleMemberTag}
            deleteFn={adminAPI.deleteMemberTag}
          />
        )}
        {tab === 1 && (
          <SimpleListTab
            title="会员来源"
            desc='定义会员的渠道来源，如"线上注册""线下活动""推荐"'
            fetchFn={adminAPI.memberSources}
            createFn={adminAPI.createMemberSource}
            updateFn={adminAPI.updateMemberSource}
            toggleFn={adminAPI.toggleMemberSource}
            deleteFn={adminAPI.deleteMemberSource}
          />
        )}
        {tab === 2 && <MemberTypeTab />}
        {tab === 3 && (
          <SimpleListTab
            title="服务包"
            desc="按客户归属维护医护端可选的服务包"
            fetchFn={adminAPI.servicePackages}
            createFn={adminAPI.createServicePackage}
            updateFn={adminAPI.updateServicePackage}
            toggleFn={adminAPI.toggleServicePackage}
            deleteFn={adminAPI.deleteServicePackage}
            withClientBrand
            withEntitlements
            withActivation
          />
        )}
      </div>
    </div>
  )
}
