import React, { useEffect, useState, useCallback, useRef } from 'react'
import { adminAPI, API_ORIGIN } from '../api'
import { useToast } from '../App'

// 历史遗留数据里存了 http://121.40.156.39 绝对地址，在 https 页面下会被浏览器 Mixed Content
// 策略拦截而不显示——服务器同时监听 http/https 且是同一份静态文件，强制升级协议即可正常加载。
// 2026-07-07 修复：上传接口返回的是相对路径(/api/uploads/xxx.jpg)，admin后台域名跟后端API域名
// 不是同一个，相对路径会按当前页面域名解析导致404、图片"上传后不展示"——需要拼上API_ORIGIN。
function safeImgSrc(url) {
  if (!url) return url
  if (url.startsWith('/')) return API_ORIGIN + url
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http://')) {
    return url.replace(/^http:\/\//, 'https://')
  }
  return url
}

const EMPTY_FORM = {
  name: '', subtitle: '', category: '', originalPrice: '', sortOrder: 999,
  features: '', description: '', stock: 0, status: 'off',
  images: [], servicePrices: [],
  fulfillmentType: 'offline_service', paymentChannel: 'wechat_pay', bookingRequired: true,
  deliveryRequired: false, serviceLocation: '', validityDays: 365,
  refundPolicy: '服务开始前可申请退款；已发生的第三方费用及已完成服务不予退还。', skus: [],
  performanceRule: { ruleType: 'none', referrerRate: 0, fulfillerRate: 0, referrerAmount: 0, fulfillerAmount: 0 },
  servicePerformerRoles: [],
  serviceItems: [],
  aiProfile: {
    enabledForRecommendation: false, targetNeeds: [], suitableFor: [], notSuitableFor: [],
    requiredQuestions: [], supportedCities: [], includedItems: [], excludedItems: [],
    promiseLimits: [], handoffConditions: [], nextAction: 'inquire', operatorNotes: '',
  },
}

const AI_LIST_FIELDS = [
  ['targetNeeds', '目标需求', '客户会用什么需求描述来匹配此产品，每行一项'],
  ['suitableFor', '适用人群', '明确适合的人群或场景，每行一项'],
  ['notSuitableFor', '不适用情况', '不应由 AI 自动推荐的情况，每行一项'],
  ['requiredQuestions', '购买前必问', '推荐或购买前必须向客户确认的问题，每行一项'],
  ['supportedCities', '支持城市/地区', '留空表示商城尚未明确，AI 应转人工确认'],
  ['includedItems', '包含项目', '当前服务或价格明确包含的内容，每行一项'],
  ['excludedItems', '不包含项目', '第三方费用或明确不包含的内容，每行一项'],
  ['promiseLimits', '不可承诺事项', '不能保证的结果，每行一项'],
  ['handoffConditions', '转人工条件', '出现哪些情况必须交给真人，每行一项'],
]

function TextListField({ label, hint, value, onChange }) {
  return <div className="form-group">
    <label className="form-label">{label}</label>
    <textarea className="form-input" rows={4} value={(value || []).join('\n')}
      onChange={e => onChange(e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
      placeholder={hint} />
    <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>{hint}</div>
  </div>
}

// ── 转介绍绩效规则（各机构自行设定，引流人/服务人各自比例或固定金额） ──
function PerformanceRuleForm({ rule, onChange }) {
  const r = rule || { ruleType: 'none', referrerRate: 0, fulfillerRate: 0, referrerAmount: 0, fulfillerAmount: 0 }
  const set = (k, v) => onChange({ ...r, [k]: v })

  return (
    <div>
      <div className="form-group">
        <label className="form-label">规则类型</label>
        <select className="form-input" value={r.ruleType} onChange={e => set('ruleType', e.target.value)}>
          <option value="none">不设置绩效（默认）</option>
          <option value="percentage">按比例分配</option>
          <option value="fixedAmount">按固定金额分配</option>
        </select>
        <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
          转介绍人（引流客户下单的人）和服务人（实际提供服务的医护）可各自设置独立的绩效
        </div>
      </div>

      {r.ruleType === 'percentage' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
          <div className="form-group">
            <label className="form-label">转介绍人比例（%）</label>
            <input className="form-input" type="number" min="0" max="100" value={r.referrerRate}
              onChange={e => set('referrerRate', parseFloat(e.target.value) || 0)} placeholder="0" />
          </div>
          <div className="form-group">
            <label className="form-label">服务人比例（%）</label>
            <input className="form-input" type="number" min="0" max="100" value={r.fulfillerRate}
              onChange={e => set('fulfillerRate', parseFloat(e.target.value) || 0)} placeholder="0" />
          </div>
        </div>
      )}

      {r.ruleType === 'fixedAmount' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
          <div className="form-group">
            <label className="form-label">转介绍人固定金额（¥）</label>
            <input className="form-input" type="number" min="0" value={r.referrerAmount}
              onChange={e => set('referrerAmount', parseFloat(e.target.value) || 0)} placeholder="0.00" />
          </div>
          <div className="form-group">
            <label className="form-label">服务人固定金额（¥）</label>
            <input className="form-input" type="number" min="0" value={r.fulfillerAmount}
              onChange={e => set('fulfillerAmount', parseFloat(e.target.value) || 0)} placeholder="0.00" />
          </div>
        </div>
      )}
    </div>
  )
}

// ── 多服务岗位绩效（一个产品由多岗位协同服务，每岗位占实付价%）──────────
const PERFORMER_ROLE_OPTIONS = [
  { value: 'familyDoctor', label: '健康顾问' },
  { value: 'nutritionist', label: '营养师' },
  { value: 'healthManager', label: '健管专员' },
  { value: 'medicalAssistant', label: '就医专员' },
  { value: 'psychologist', label: '心理咨询师' },
  { value: 'rehabSpecialist', label: '运动复健师' },
  { value: 'specialist', label: '专科医师' },
  { value: 'tcmDoctor', label: '中医师' },
]
const ROLE_LABEL_MAP = Object.fromEntries(PERFORMER_ROLE_OPTIONS.map(o => [o.value, o.label]))

function ServicePerformerRolesForm({ roles, staffList, onChange }) {
  const list = roles || []
  const add = () => onChange([...list, { role: 'familyDoctor', ruleType: 'percentage', rate: 0, amount: 0, defaultStaffId: '' }])
  const remove = (i) => onChange(list.filter((_, idx) => idx !== i))
  const update = (i, field, val) => onChange(list.map((r, idx) => idx === i ? { ...r, [field]: val } : r))
  const totalRate = list.reduce((s, r) => s + ((r.ruleType || 'percentage') === 'percentage' ? (parseFloat(r.rate) || 0) : 0), 0)

  return (
    <div style={{ marginTop: 20, borderTop: '1px dashed #e0d9ce', paddingTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <label className="form-label" style={{ margin: 0 }}>多服务岗位绩效</label>
        <button type="button" onClick={add} style={{ fontSize: 12, color: '#1E6B50', background: '#e8f5ef', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>+ 添加岗位</button>
      </div>
      <div style={{ fontSize: 12, color: '#aaa', marginBottom: 10 }}>
        产品由多个岗位协同提供服务时，逐个岗位设置绩效比例（占产品实付价%）。具体是哪个人可在此预设默认服务人，也可推送时再指定。
      </div>
      {list.length === 0 && <div style={{ fontSize: 12, color: '#bbb', padding: '8px 0' }}>未配置。留空则按上方「引流人/服务人」单服务人规则结算。</div>}
      {list.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 0.9fr 1.4fr auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <select className="form-input" value={r.role} onChange={e => update(i, 'role', e.target.value)}>
            {PERFORMER_ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select className="form-input" value={r.ruleType || 'percentage'} onChange={e => update(i, 'ruleType', e.target.value)}>
            <option value="none">不结算</option>
            <option value="percentage">按比例</option>
            <option value="fixedAmount">固定金额</option>
          </select>
          {(r.ruleType || 'percentage') === 'percentage' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input className="form-input" type="number" min="0" max="100" value={r.rate}
                onChange={e => update(i, 'rate', parseFloat(e.target.value) || 0)} placeholder="0" />
              <span style={{ fontSize: 12, color: '#888' }}>%</span>
            </div>
          ) : r.ruleType === 'fixedAmount' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#888' }}>¥</span>
              <input className="form-input" type="number" min="0" value={r.amount || 0}
                onChange={e => update(i, 'amount', parseFloat(e.target.value) || 0)} placeholder="0.00" />
            </div>
          ) : <div />}
          <select className="form-input" value={r.defaultStaffId || ''} onChange={e => update(i, 'defaultStaffId', e.target.value)}>
            <option value="">默认服务人（可选）</option>
            {staffList.filter(s => s.role === r.role).map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
          <button type="button" onClick={() => remove(i)} style={{ color: '#c0392b', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
      ))}
      {list.length > 0 && (
        <div style={{ fontSize: 12, color: totalRate > 100 ? '#c0392b' : '#888', marginTop: 4 }}>
          各岗位绩效合计：{totalRate}%{totalRate > 100 ? '（超过100%，请检查）' : ''}
        </div>
      )}
    </div>
  )
}

function ServiceItemsForm({ items, staffList, onChange }) {
  const list = items || []
  const add = () => onChange([...list, { key: `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: '', units: 1, performers: [] }])
  const update = (i, patch) => onChange(list.map((item, idx) => idx === i ? { ...item, ...patch } : item))
  return <div style={{ marginTop: 18, borderTop: '1px solid #e0d9ce', paddingTop: 16 }}>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
      <label className="form-label">组合服务子项目（按子项目逐次核销）</label>
      <button type="button" className="btn btn-sm btn-ghost" onClick={add}>+ 添加子项目</button>
    </div>
    <div style={{fontSize:12,color:'#888',marginBottom:10}}>每个子项目可独立设置次数、岗位和结算方式；固定金额及比例均按每次核销计算。</div>
    {list.map((item, i) => <div key={item.key || i} style={{border:'1px solid #e0d9ce',borderRadius:8,padding:12,marginBottom:12}}>
      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr auto',gap:8,alignItems:'center'}}>
        <input className="form-input" value={item.name || ''} placeholder="子项目名称" onChange={e=>update(i,{name:e.target.value})}/>
        <input className="form-input" type="number" min="1" value={item.units || 1} onChange={e=>update(i,{units:Math.max(1,parseInt(e.target.value)||1)})}/>
        <button type="button" onClick={()=>onChange(list.filter((_,idx)=>idx!==i))} style={{color:'#c0392b',background:'none',border:'none',cursor:'pointer'}}>删除</button>
      </div>
      <ServicePerformerRolesForm roles={item.performers || []} staffList={staffList} onChange={v=>update(i,{performers:v})}/>
    </div>)}
  </div>
}

// ── 自定义价格列表 ──────────────────────────────────────────────
function ServicePricesForm({ servicePrices, onChange }) {
  const add = () => onChange([...servicePrices, { label: '', price: '' }])
  const remove = (i) => onChange(servicePrices.filter((_, idx) => idx !== i))
  const update = (i, field, val) => {
    const next = servicePrices.map((item, idx) =>
      idx === i ? { ...item, [field]: val } : item
    )
    onChange(next)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <label className="form-label" style={{ margin: 0 }}>收费项目</label>
        <button type="button" className="btn btn-sm btn-ghost" onClick={add}>＋ 添加收费项目</button>
      </div>
      {servicePrices.length === 0 && (
        <div style={{ fontSize: 12, color: '#aaa', padding: '8px 0' }}>
          暂无收费项目，点击右上角添加（如：医务代办、代开药、常规约检查等）
        </div>
      )}
      {servicePrices.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <input
            className="form-input"
            style={{ flex: 2 }}
            placeholder="项目名称（如：医务代办）"
            value={item.label}
            onChange={e => update(i, 'label', e.target.value)}
          />
          <span style={{ color: '#888', fontSize: 13 }}>¥</span>
          <input
            className="form-input"
            type="number"
            style={{ flex: 1 }}
            placeholder="金额"
            value={item.price}
            onChange={e => update(i, 'price', e.target.value)}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            style={{ background: 'none', border: 'none', color: '#dc3545', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}
          >×</button>
        </div>
      ))}
    </div>
  )
}

// ── 图片上传（支持 URL 粘贴 + 文件上传） ──────────────────────────
function ImageUploadList({ images, onChange }) {
  const toast = useToast()
  const [urlInput, setUrlInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef()

  const addUrl = () => {
    const url = urlInput.trim()
    if (!url) return
    onChange([...images, url])
    setUrlInput('')
  }

  const handleFiles = async (files) => {
    if (!files?.length) return
    setUploading(true)
    const newUrls = []
    for (const file of Array.from(files)) {
      try {
        const res = await adminAPI.uploadImage(file)
        if (res.data?.url) newUrls.push(res.data.url)
      } catch (err) {
        toast('❌ 上传失败：' + err.message)
      }
    }
    if (newUrls.length) onChange([...images, ...newUrls])
    setUploading(false)
  }

  const remove = (i) => onChange(images.filter((_, idx) => idx !== i))

  return (
    <div>
      {/* 上传按钮 + URL 粘贴 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{ flexShrink: 0 }}
        >
          {uploading ? '上传中...' : '📁 本地上传'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)}
        />
        <input
          className="form-input"
          style={{ flex: 1 }}
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addUrl())}
          placeholder="或粘贴图片 URL，回车添加"
        />
        <button type="button" className="btn btn-ghost" onClick={addUrl}>添加</button>
      </div>

      {/* 图片预览 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {images.map((url, i) => (
          <div key={i} style={{ position: 'relative', width: 80, height: 80 }}>
            <img
              src={safeImgSrc(url)} alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6, border: '1px solid #e0d9ce' }}
              onError={e => { e.target.style.background = '#f5f5f5'; e.target.alt = '加载失败' }}
            />
            <button
              onClick={() => remove(i)}
              style={{
                position: 'absolute', top: -6, right: -6, background: '#dc3545', color: '#fff',
                border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer',
                fontSize: 11, lineHeight: '18px', textAlign: 'center', padding: 0,
              }}
            >×</button>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>支持本地上传或粘贴 URL，建议 1-5 张</div>
    </div>
  )
}

// ── 产品表单 Modal ──────────────────────────────────────────────
function ProductModal({ product, categories, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = !!product?._id
  const [form, setForm] = useState(() => {
    if (!isEdit) return { ...EMPTY_FORM, category: categories[0] || '' }
    return {
      name: product.name,
      subtitle: product.subtitle || '',
      category: product.category,
      originalPrice: String(product.originalPrice),
      sortOrder: product.sortOrder,
      features: (product.features || []).join(', '),
      description: product.description || '',
      stock: product.stock ?? 0,
      status: product.status || 'off',
      images: product.images || [],
      servicePrices: (product.servicePrices || []).map(sp => ({ label: sp.label, price: String(sp.price) })),
      fulfillmentType: product.fulfillmentType || 'offline_service',
      paymentChannel: product.paymentChannel || 'wechat_pay',
      bookingRequired: product.bookingRequired !== false,
      deliveryRequired: !!product.deliveryRequired,
      serviceLocation: product.serviceLocation || '',
      validityDays: product.validityDays || 365,
      refundPolicy: product.refundPolicy || '',
      skus: product.skus || [],
      performanceRule: product.performanceRule || { ruleType: 'none', referrerRate: 0, fulfillerRate: 0, referrerAmount: 0, fulfillerAmount: 0 },
      servicePerformerRoles: (product.servicePerformerRoles || []).map(r => ({
        role: r.role, ruleType: r.ruleType || 'percentage', rate: r.rate || 0, amount: r.amount || 0, defaultStaffId: r.defaultStaffId ? String(r.defaultStaffId) : '',
      })),
      serviceItems: (product.serviceItems || []).map(item => ({
        key: item.key, name: item.name, units: item.units || 1,
        performers: (item.performers || []).map(r => ({ role:r.role, ruleType:r.ruleType || 'percentage', rate:r.rate || 0, amount:r.amount || 0, defaultStaffId:r.defaultStaffId ? String(r.defaultStaffId) : '' })),
      })),
      aiProfile: {
        ...EMPTY_FORM.aiProfile,
        ...(product.aiProfile || {}),
        targetNeeds: product.aiProfile?.targetNeeds || [],
        suitableFor: product.aiProfile?.suitableFor || [],
        notSuitableFor: product.aiProfile?.notSuitableFor || [],
        requiredQuestions: product.aiProfile?.requiredQuestions || [],
        supportedCities: product.aiProfile?.supportedCities || [],
        includedItems: product.aiProfile?.includedItems || [],
        excludedItems: product.aiProfile?.excludedItems || [],
        promiseLimits: product.aiProfile?.promiseLimits || [],
        handoffConditions: product.aiProfile?.handoffConditions || [],
      },
    }
  })
  const [loading, setLoading] = useState(false)
  const [generatingAi, setGeneratingAi] = useState(false)
  const [tab, setTab] = useState('basic')
  const [staffList, setStaffList] = useState([])

  useEffect(() => {
    adminAPI.staffList({ pageSize: 500 }).then(r => {
      setStaffList(r.data?.staff || r.data?.list || r.data || [])
    }).catch(() => {})
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const generateAiProfile = async () => {
    if (!form.description.trim()) { toast('❌ 请先填写详情描述'); setTab('desc'); return }
    setGeneratingAi(true)
    try {
      const res = await adminAPI.generateProductAiDraft({
        name: form.name, subtitle: form.subtitle, category: form.category, description: form.description,
        features: form.features.split(',').map(s => s.trim()).filter(Boolean),
        fulfillmentType: form.fulfillmentType, serviceLocation: form.serviceLocation,
      })
      const draft = res.data || {}
      setForm(current => {
        const merged = { ...current.aiProfile }
        AI_LIST_FIELDS.forEach(([key]) => {
          if (!(merged[key] || []).length && Array.isArray(draft[key])) merged[key] = draft[key]
        })
        if (!merged.nextAction || merged.nextAction === 'inquire') merged.nextAction = draft.nextAction || 'inquire'
        merged.enabledForRecommendation = false
        return { ...current, aiProfile: merged }
      })
      toast('✅ 已补充空白推荐规则，请审核后保存并手动启用')
    } catch (err) { toast('❌ ' + (err.message || '生成失败，请重试')) }
    finally { setGeneratingAi(false) }
  }

  const save = async () => {
    if (!form.name || !form.category || form.originalPrice === '') {
      toast('❌ 产品名称、分类、原价为必填项')
      return
    }
    setLoading(true)
    try {
      const cleanedPrices = form.servicePrices
        .filter(sp => sp.label.trim() && sp.price !== '' && !isNaN(parseFloat(sp.price)))
        .map(sp => ({ label: sp.label.trim(), price: parseFloat(sp.price) }))

      const payload = {
        name: form.name,
        subtitle: form.subtitle,
        category: form.category,
        originalPrice: parseFloat(form.originalPrice),
        sortOrder: parseInt(form.sortOrder) || 999,
        features: form.features.split(',').map(s => s.trim()).filter(Boolean),
        description: form.description,
        stock: parseInt(form.stock) || 0,
        status: form.status,
        images: form.images,
        servicePrices: cleanedPrices,
        fulfillmentType: form.fulfillmentType,
        paymentChannel: form.paymentChannel,
        bookingRequired: form.bookingRequired,
        deliveryRequired: form.deliveryRequired,
        serviceLocation: form.serviceLocation,
        validityDays: Math.max(1, parseInt(form.validityDays) || 365),
        refundPolicy: form.refundPolicy,
        skus: form.skus || [],
        performanceRule: form.performanceRule,
        servicePerformerRoles: (form.servicePerformerRoles || [])
          .filter(r => r.role)
          .map(r => ({
            role: r.role,
            ruleType: r.ruleType || 'percentage',
            rate: parseFloat(r.rate) || 0,
            amount: parseFloat(r.amount) || 0,
            defaultStaffId: r.defaultStaffId || null,
          })),
        serviceItems: (form.serviceItems || []).filter(item => item.name?.trim()).map(item => ({
          key: item.key || `item_${Date.now()}`, name: item.name.trim(), units: Math.max(1, parseInt(item.units) || 1),
          performers: (item.performers || []).filter(r=>r.role).map(r=>({ role:r.role, ruleType:r.ruleType || 'percentage', rate:parseFloat(r.rate)||0, amount:parseFloat(r.amount)||0, defaultStaffId:r.defaultStaffId||null })),
        })),
        aiProfile: form.aiProfile,
      }
      if (isEdit) {
        await adminAPI.updateProduct(product._id, payload)
      } else {
        await adminAPI.createProduct(payload)
      }
      toast(`✅ 产品${isEdit ? '更新' : '创建'}成功`)
      onSaved()
      onClose()
    } catch (err) {
      toast('❌ ' + (err.message || '操作失败'))
    } finally {
      setLoading(false)
    }
  }

  const tabs = [
    { key: 'basic', label: '基本信息' },
    { key: 'price', label: '收费项目' },
    { key: 'performance', label: '绩效分配' },
    { key: 'images', label: '产品图片' },
    { key: 'desc', label: '详情描述' },
    { key: 'ai', label: 'AI推荐设置' },
  ]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 680, width: '96%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title">{isEdit ? '✏️ 编辑产品' : '➕ 新增产品'}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e0d9ce', padding: '0 20px' }}>
          {tabs.map(t => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} style={{
              padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? '#1E6B50' : '#666',
              borderBottom: tab === t.key ? '2px solid #1E6B50' : '2px solid transparent',
              marginBottom: -1,
            }}>{t.label}</button>
          ))}
        </div>

        <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
          {tab === 'basic' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">产品名称 *</label>
                <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)}
                  placeholder="如：心脑血管精准检测套餐" />
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">简短描述</label>
                <input className="form-input" value={form.subtitle} onChange={e => set('subtitle', e.target.value)}
                  placeholder="一句话介绍产品（显示在商城列表）" />
              </div>
              <div className="form-group">
                <label className="form-label">分类 *</label>
                <select className="form-input" value={form.category} onChange={e => set('category', e.target.value)}>
                  {categories.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">排序权重</label>
                <input className="form-input" type="number" value={form.sortOrder}
                  onChange={e => set('sortOrder', e.target.value)} placeholder="数值越小越靠前" />
              </div>
              <div className="form-group">
                <label className="form-label">库存（0 = 不限）</label>
                <input className="form-input" type="number" value={form.stock}
                  onChange={e => set('stock', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">状态</label>
                <select className="form-input" value={form.status} onChange={e => set('status', e.target.value)}>
                  <option value="off">下架</option>
                  <option value="on">上架</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">履约类型 *</label>
                <select className="form-input" value={form.fulfillmentType} onChange={e => set('fulfillmentType', e.target.value)}>
                  <option value="offline_service">线下预约服务</option>
                  <option value="remote_service">远程人工服务</option>
                  <option value="delivery_and_service">配送＋人工服务</option>
                  <option value="subscription_service">长期健康计划</option>
                  <option value="digital_content">纯数字内容</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">支付通道 *</label>
                <select className="form-input" value={form.paymentChannel} onChange={e => set('paymentChannel', e.target.value)}>
                  <option value="wechat_pay">普通微信支付</option>
                  <option value="offline">线下收款</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">服务有效期（天）</label>
                <input className="form-input" type="number" min="1" value={form.validityDays} onChange={e => set('validityDays', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">服务地点</label>
                <input className="form-input" value={form.serviceLocation} onChange={e => set('serviceLocation', e.target.value)} placeholder="线上、用户所在地或具体机构" />
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={form.bookingRequired} onChange={e => set('bookingRequired', e.target.checked)} />需要预约
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={form.deliveryRequired} onChange={e => set('deliveryRequired', e.target.checked)} />包含实物/资料配送
              </label>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">退款规则 *</label>
                <textarea className="form-input" rows={3} value={form.refundPolicy} onChange={e => set('refundPolicy', e.target.value)} />
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">产品特点（逗号分隔）</label>
                <input className="form-input" value={form.features} onChange={e => set('features', e.target.value)}
                  placeholder="如：三甲医院专家操作, 居家采样, 24h报告解读" />
                {form.features && (
                  <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {form.features.split(',').map(s => s.trim()).filter(Boolean).map((f, i) => (
                      <span key={i} style={{ background: '#e8f5ef', color: '#1E6B50', borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>{f}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'price' && (
            <div>
              <div className="form-group">
                <label className="form-label">市场价（划线价）*</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#888' }}>¥</span>
                  <input className="form-input" type="number" style={{ width: 160 }} value={form.originalPrice}
                    onChange={e => set('originalPrice', e.target.value)} placeholder="0.00" />
                  <span style={{ fontSize: 12, color: '#aaa' }}>商城显示为划线价</span>
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                <ServicePricesForm
                  servicePrices={form.servicePrices}
                  onChange={v => set('servicePrices', v)}
                />
              </div>
            </div>
          )}

          {tab === 'performance' && (
            <div>
              <PerformanceRuleForm rule={form.performanceRule} onChange={v => set('performanceRule', v)} />
              <ServicePerformerRolesForm
                roles={form.servicePerformerRoles}
                staffList={staffList}
                onChange={v => set('servicePerformerRoles', v)}
              />
              <ServiceItemsForm items={form.serviceItems} staffList={staffList} onChange={v => set('serviceItems', v)} />
            </div>
          )}

          {tab === 'images' && (
            <div className="form-group">
              <label className="form-label">产品图片</label>
              <ImageUploadList images={form.images} onChange={v => set('images', v)} />
            </div>
          )}

          {tab === 'desc' && (
            <div className="form-group">
              <label className="form-label">详情描述</label>
              <textarea className="form-input" rows={12} value={form.description}
                onChange={e => set('description', e.target.value)}
                placeholder="描述产品详情、服务流程、注意事项等..." />
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>支持 HTML 富文本格式</div>
            </div>
          )}

          {tab === 'ai' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', background: '#fff8e8', border: '1px solid #f0dfb4', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#6f5312' }}>根据详情智能生成</div>
                  <div style={{ fontSize: 12, color: '#7d704e', marginTop: 4 }}>仅补充空白字段，不覆盖人工内容，也不会自动开启推荐。</div>
                </div>
                <button type="button" className="btn btn-primary" onClick={generateAiProfile} disabled={generatingAi} style={{ whiteSpace: 'nowrap' }}>
                  {generatingAi ? '生成中...' : '智能生成'}
                </button>
              </div>
              <div style={{ background: '#f3f8f5', border: '1px solid #d7e8df', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600, color: '#1E6B50' }}>
                  <input type="checkbox" checked={form.aiProfile.enabledForRecommendation}
                    onChange={e => set('aiProfile', { ...form.aiProfile, enabledForRecommendation: e.target.checked })} />
                  允许 AI 自动推荐此产品
                </label>
                <div style={{ fontSize: 12, color: '#66756e', marginTop: 6 }}>
                  只有目标需求、适用人群、购买前必问、不可承诺事项和转人工条件全部填写后，AI 才会真正使用此产品。
                </div>
              </div>
              {AI_LIST_FIELDS.map(([key, label, hint]) => (
                <TextListField key={key} label={label} hint={hint} value={form.aiProfile[key]}
                  onChange={value => set('aiProfile', { ...form.aiProfile, [key]: value })} />
              ))}
              <div className="form-group">
                <label className="form-label">推荐后的默认动作</label>
                <select className="form-input" value={form.aiProfile.nextAction}
                  onChange={e => set('aiProfile', { ...form.aiProfile, nextAction: e.target.value })}>
                  <option value="inquire">先提交咨询</option>
                  <option value="book">预约服务</option>
                  <option value="buy">直接购买</option>
                  <option value="handoff">转人工确认</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">运营内部备注（不会提供给客户）</label>
                <textarea className="form-input" rows={4} value={form.aiProfile.operatorNotes || ''}
                  onChange={e => set('aiProfile', { ...form.aiProfile, operatorNotes: e.target.value })}
                  placeholder="待确认事项、资源限制、配置依据等" />
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={save} disabled={loading}>
            {loading ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 分类管理 Modal ──────────────────────────────────────────────
function CategoryModal({ categories, onClose, onChanged }) {
  const toast = useToast()
  const [list, setList] = useState(categories)
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)

  const add = async () => {
    const name = input.trim()
    if (!name) return
    setSaving(true)
    try {
      const res = await adminAPI.createProductCategory({ name })
      toast('✅ 分类添加成功')
      setList([...list, res.data])
      setInput('')
      onChanged()
    } catch (err) {
      toast('❌ ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const del = async (cat) => {
    if (!window.confirm(`确定删除分类「${cat.name}」？已使用该分类的产品不受影响。`)) return
    try {
      await adminAPI.deleteProductCategory(cat._id)
      toast('✅ 已删除')
      setList(list.filter(c => c._id !== cat._id))
      onChanged()
    } catch (err) {
      toast('❌ ' + err.message)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440, width: '96%' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">⚙️ 管理分类</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              className="form-input"
              style={{ flex: 1 }}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !saving && add()}
              placeholder="新分类名称"
            />
            <button className="btn btn-primary" onClick={add} disabled={saving || !input.trim()}>
              {saving ? '添加中...' : '添加'}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {list.map(cat => (
              <div key={cat._id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', borderRadius: 8, border: '1px solid #e0d9ce', background: '#fff',
              }}>
                <span style={{ fontWeight: 500 }}>{cat.name}</span>
                <button
                  className="btn btn-sm"
                  style={{ background: '#fee', color: '#c00', border: '1px solid #fcc' }}
                  onClick={() => del(cat)}
                >删除</button>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}

// ── 主页面 ──────────────────────────────────────────────────────
export default function ProductsPage() {
  const toast = useToast()
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [showCatModal, setShowCatModal] = useState(false)
  const [selected, setSelected] = useState([])
  const [filters, setFilters] = useState({ name: '', category: '', status: '' })

  const categoryNames = categories.map(c => c.name)

  const loadCategories = useCallback(async () => {
    try {
      const res = await adminAPI.productCategories()
      setCategories(res.data || [])
    } catch { /* keep existing */ }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (filters.name) params.name = filters.name
      if (filters.category) params.category = filters.category
      if (filters.status) params.status = filters.status
      const [pRes] = await Promise.all([
        adminAPI.products(params),
        loadCategories(),
      ])
      setProducts(pRes.data || [])
    } catch (err) {
      toast('❌ 加载失败：' + err.message)
    } finally {
      setLoading(false)
    }
  }, [filters, loadCategories])

  useEffect(() => { load() }, [load])

  const toggle = async (p) => {
    try {
      const res = await adminAPI.toggleProduct(p._id)
      toast(res.message || '已更新')
      load()
    } catch (err) { toast('❌ ' + err.message) }
  }

  const del = async (p) => {
    if (!window.confirm(`确定删除「${p.name}」？`)) return
    try {
      await adminAPI.deleteProduct(p._id)
      toast('✅ 已删除')
      load()
    } catch (err) { toast('❌ ' + err.message) }
  }

  const batchToggle = async (status) => {
    if (!selected.length) return
    try {
      const res = await adminAPI.batchToggleProducts(selected, status)
      toast('✅ ' + res.message)
      setSelected([])
      load()
    } catch (err) { toast('❌ ' + err.message) }
  }

  const toggleSelect = (id) => setSelected(prev =>
    prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
  )
  const toggleAll = () => setSelected(
    selected.length === products.length ? [] : products.map(p => p._id)
  )

  const pricePreview = (p) => {
    if (!p.servicePrices?.length) return <span style={{ color: '#aaa', fontSize: 12 }}>按市场价</span>
    return p.servicePrices.slice(0, 2).map((sp, i) => (
      <span key={i} style={{ fontSize: 11, background: '#e8f5ef', color: '#1E6B50', borderRadius: 3, padding: '1px 5px', marginRight: 3 }}>
        {sp.label}:¥{sp.price}
      </span>
    ))
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">🏪 商城产品管理</div>
          <div className="page-subtitle">管理用户端"服务商城"中展示的产品，支持自定义收费项目</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setShowCatModal(true)}>⚙️ 管理分类</button>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true) }}>＋ 新增产品</button>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="form-input" style={{ width: 200 }} placeholder="搜索产品名称"
          value={filters.name} onChange={e => setFilters(f => ({ ...f, name: e.target.value }))} />
        <select className="form-input" style={{ width: 140 }} value={filters.category}
          onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}>
          <option value="">全部分类</option>
          {categoryNames.map(c => <option key={c}>{c}</option>)}
        </select>
        <select className="form-input" style={{ width: 120 }} value={filters.status}
          onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
          <option value="">全部状态</option>
          <option value="on">上架</option>
          <option value="off">下架</option>
        </select>
        <button className="btn btn-ghost" onClick={() => setFilters({ name: '', category: '', status: '' })}>重置</button>

        {selected.length > 0 && (
          <>
            <span style={{ color: '#1E6B50', fontSize: 13 }}>已选 {selected.length} 项</span>
            <button className="btn btn-sm btn-ghost" onClick={() => batchToggle('on')}>批量上架</button>
            <button className="btn btn-sm btn-ghost" onClick={() => batchToggle('off')}>批量下架</button>
          </>
        )}
      </div>

      {loading ? (
        <div className="loading">加载中...</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" checked={selected.length === products.length && products.length > 0}
                    onChange={toggleAll} />
                </th>
                <th style={{ width: 64 }}>图片</th>
                <th>产品名称</th>
                <th>分类</th>
                <th>市场价</th>
                <th>收费项目</th>
                <th>库存</th>
                <th>状态</th>
                <th>排序</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: 'center', color: '#888', padding: 32 }}>暂无产品，点击「新增产品」添加</td></tr>
              )}
              {products.map(p => (
                <tr key={p._id}>
                  <td>
                    <input type="checkbox" checked={selected.includes(p._id)} onChange={() => toggleSelect(p._id)} />
                  </td>
                  <td>
                    {p.images?.[0] ? (
                      <img src={safeImgSrc(p.images[0])} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid #e0d9ce' }}
                        onError={e => { e.target.style.display = 'none' }} />
                    ) : (
                      <div style={{ width: 48, height: 48, borderRadius: 6, background: '#f5f2ec', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#bbb' }}>无图</div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    {p.subtitle && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{p.subtitle}</div>}
                    {p.features?.length > 0 && (
                      <div style={{ marginTop: 3, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        {p.features.slice(0, 3).map((f, i) => (
                          <span key={i} style={{ fontSize: 10, background: '#f0f0f0', color: '#666', borderRadius: 3, padding: '0 4px' }}>{f}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>{p.category}</td>
                  <td style={{ color: '#888', textDecoration: 'line-through' }}>¥{p.originalPrice}</td>
                  <td>{pricePreview(p)}</td>
                  <td style={{ color: p.stock === 0 ? '#aaa' : '#333' }}>
                    {p.stock === 0 ? '不限' : p.stock}
                  </td>
                  <td>
                    <span className={`badge ${p.status === 'on' ? 'badge-green' : 'badge-gray'}`}>
                      {p.status === 'on' ? '上架' : '下架'}
                    </span>
                  </td>
                  <td>{p.sortOrder}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => { setEditing(p); setShowModal(true) }}>编辑</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => toggle(p)}>
                        {p.status === 'on' ? '下架' : '上架'}
                      </button>
                      <button className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc' }} onClick={() => del(p)}>删除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <ProductModal
          product={editing}
          categories={categoryNames}
          onClose={() => setShowModal(false)}
          onSaved={load}
        />
      )}

      {showCatModal && (
        <CategoryModal
          categories={categories}
          onClose={() => setShowCatModal(false)}
          onChanged={loadCategories}
        />
      )}
    </div>
  )
}
