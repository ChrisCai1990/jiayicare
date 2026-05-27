import React, { useEffect, useState, useCallback } from 'react'
import { adminAPI } from '../api'
import { useToast } from '../App'

const DEFAULT_CATEGORIES = ['检测套餐', '营养补充', '咨询服务', '上门服务', '健康课程', '中医调理']

const EMPTY_FORM = {
  name: '', category: '检测套餐', originalPrice: '', sortOrder: 999,
  features: '', description: '', stock: 0, status: 'off',
  images: [], memberPrices: {},
}

// ── 会员价动态表单 ──────────────────────────────────────────────
function MemberPriceForm({ memberTypes, memberPrices, originalPrice, onChange }) {
  const applyDiscount = (rate) => {
    if (!originalPrice) return
    const base = parseFloat(originalPrice)
    if (isNaN(base)) return
    const updated = {}
    memberTypes.filter(t => t.active).forEach(t => {
      updated[t.name] = Math.round(base * rate)
    })
    onChange(updated)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <label className="form-label" style={{ margin: 0 }}>会员价（可选）</label>
        <div style={{ display: 'flex', gap: 6 }}>
          {[0.9, 0.85, 0.8].map(r => (
            <button key={r} type="button" className="btn btn-sm btn-ghost"
              onClick={() => applyDiscount(r)} style={{ fontSize: 11 }}>
              一键{r * 10}折
            </button>
          ))}
        </div>
      </div>
      {memberTypes.filter(t => t.active).map(t => (
        <div key={t._id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ minWidth: 80, fontSize: 13, color: '#555' }}>{t.name}</span>
          <span style={{ color: '#888', fontSize: 12 }}>¥</span>
          <input
            className="form-input"
            type="number"
            style={{ width: 110 }}
            placeholder="不填则按原价"
            value={memberPrices[t.name] ?? ''}
            onChange={e => {
              const v = e.target.value
              onChange({ ...memberPrices, [t.name]: v === '' ? undefined : parseFloat(v) })
            }}
          />
          {memberPrices[t.name] !== undefined && originalPrice && (
            <span style={{ fontSize: 11, color: '#888' }}>
              ({Math.round(memberPrices[t.name] / parseFloat(originalPrice) * 100)}折)
            </span>
          )}
        </div>
      ))}
      {memberTypes.filter(t => t.active).length === 0 && (
        <div style={{ fontSize: 12, color: '#aaa' }}>暂无启用的会员类型</div>
      )}
    </div>
  )
}

// ── 图片 URL 列表 ──────────────────────────────────────────────
function ImageUrlList({ images, onChange }) {
  const [input, setInput] = useState('')
  const add = () => {
    const url = input.trim()
    if (!url) return
    onChange([...images, url])
    setInput('')
  }
  const remove = (i) => onChange(images.filter((_, idx) => idx !== i))

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input className="form-input" style={{ flex: 1 }} value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder="粘贴图片 URL，回车或点击添加" />
        <button type="button" className="btn btn-ghost" onClick={add}>添加</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {images.map((url, i) => (
          <div key={i} style={{ position: 'relative', width: 80, height: 80 }}>
            <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6, border: '1px solid #e0d9ce' }}
              onError={e => { e.target.style.background = '#f5f5f5'; e.target.alt = '图片加载失败' }} />
            <button onClick={() => remove(i)} style={{
              position: 'absolute', top: -6, right: -6, background: '#dc3545', color: '#fff',
              border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer',
              fontSize: 11, lineHeight: '18px', textAlign: 'center', padding: 0,
            }}>×</button>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>支持 JPG/PNG，建议 1-5 张</div>
    </div>
  )
}

// ── 产品表单 Modal ──────────────────────────────────────────────
function ProductModal({ product, memberTypes, categories, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = !!product?._id
  const [form, setForm] = useState(() => {
    if (!isEdit) return { ...EMPTY_FORM }
    return {
      name: product.name,
      category: product.category,
      originalPrice: String(product.originalPrice),
      sortOrder: product.sortOrder,
      features: (product.features || []).join(', '),
      description: product.description || '',
      stock: product.stock ?? 0,
      status: product.status || 'off',
      images: product.images || [],
      memberPrices: product.memberPrices || {},
    }
  })
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('basic')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.name || !form.category || form.originalPrice === '') {
      toast('❌ 产品名称、分类、原价为必填项')
      return
    }
    setLoading(true)
    try {
      const cleanedPrices = {}
      Object.entries(form.memberPrices).forEach(([k, v]) => {
        if (v !== undefined && v !== '' && !isNaN(parseFloat(v))) {
          cleanedPrices[k] = parseFloat(v)
        }
      })
      const payload = {
        name: form.name,
        category: form.category,
        originalPrice: parseFloat(form.originalPrice),
        sortOrder: parseInt(form.sortOrder) || 999,
        features: form.features.split(',').map(s => s.trim()).filter(Boolean),
        description: form.description,
        stock: parseInt(form.stock) || 0,
        status: form.status,
        images: form.images,
        memberPrices: cleanedPrices,
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
    { key: 'price', label: '价格设置' },
    { key: 'images', label: '产品图片' },
    { key: 'desc', label: '详情描述' },
  ]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 680, width: '96%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>
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
              <div className="form-group">
                <label className="form-label">分类 *</label>
                <select className="form-input" value={form.category} onChange={e => set('category', e.target.value)}>
                  {[...new Set([...DEFAULT_CATEGORIES, ...(categories || [])])].map(c => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">排序权重</label>
                <input className="form-input" type="number" value={form.sortOrder}
                  onChange={e => set('sortOrder', e.target.value)} placeholder="默认999，数值越小越靠前" />
              </div>
              <div className="form-group">
                <label className="form-label">库存（0表示不限）</label>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">原价 *（元）</label>
                <input className="form-input" type="number" value={form.originalPrice}
                  onChange={e => set('originalPrice', e.target.value)} placeholder="0.00" />
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>将在商城显示为划线价</div>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <MemberPriceForm
                  memberTypes={memberTypes}
                  memberPrices={form.memberPrices}
                  originalPrice={form.originalPrice}
                  onChange={v => set('memberPrices', v)}
                />
              </div>
            </div>
          )}

          {tab === 'images' && (
            <div className="form-group">
              <label className="form-label">产品图片</label>
              <ImageUrlList images={form.images} onChange={v => set('images', v)} />
            </div>
          )}

          {tab === 'desc' && (
            <div className="form-group">
              <label className="form-label">详情描述 *</label>
              <textarea className="form-input" rows={12} value={form.description}
                onChange={e => set('description', e.target.value)}
                placeholder="支持 HTML 格式，描述产品详情、检查项目、服务流程等..." />
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>支持 HTML 富文本格式</div>
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

// ── 主页面 ──────────────────────────────────────────────────────
export default function ProductsPage() {
  const toast = useToast()
  const [products, setProducts] = useState([])
  const [memberTypes, setMemberTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [selected, setSelected] = useState([])
  const [filters, setFilters] = useState({ name: '', category: '', status: '' })

  const categories = [...new Set(products.map(p => p.category))]

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (filters.name) params.name = filters.name
      if (filters.category) params.category = filters.category
      if (filters.status) params.status = filters.status
      const [pRes, mRes] = await Promise.all([
        adminAPI.products(params),
        adminAPI.memberTypes(),
      ])
      setProducts(pRes.data || [])
      setMemberTypes(mRes.data || [])
    } catch (err) {
      toast('❌ 加载失败：' + err.message)
    } finally {
      setLoading(false)
    }
  }, [filters])

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

  const memberPricePreview = (mp) => {
    const entries = Object.entries(mp || {}).filter(([, v]) => v)
    if (!entries.length) return <span style={{ color: '#aaa', fontSize: 12 }}>按原价</span>
    return entries.slice(0, 2).map(([k, v]) => (
      <span key={k} style={{ fontSize: 11, background: '#e8f5ef', color: '#1E6B50', borderRadius: 3, padding: '1px 5px', marginRight: 3 }}>
        {k}:¥{v}
      </span>
    ))
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">🏪 商城产品管理</div>
          <div className="page-subtitle">管理客户端"服务商城"中展示的产品，支持差异化会员定价</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true) }}>＋ 新增产品</button>
      </div>

      {/* 筛选栏 */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="form-input" style={{ width: 200 }} placeholder="搜索产品名称"
          value={filters.name} onChange={e => setFilters(f => ({ ...f, name: e.target.value }))} />
        <select className="form-input" style={{ width: 140 }} value={filters.category}
          onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}>
          <option value="">全部分类</option>
          {[...new Set([...DEFAULT_CATEGORIES, ...categories])].map(c => <option key={c}>{c}</option>)}
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
                <th>产品名称</th>
                <th>分类</th>
                <th>原价</th>
                <th>会员价</th>
                <th>库存</th>
                <th>状态</th>
                <th>排序</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: '#888', padding: 32 }}>暂无产品，点击「新增产品」添加</td></tr>
              )}
              {products.map(p => (
                <tr key={p._id}>
                  <td>
                    <input type="checkbox" checked={selected.includes(p._id)} onChange={() => toggleSelect(p._id)} />
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
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
                  <td>{memberPricePreview(p.memberPrices)}</td>
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
          memberTypes={memberTypes}
          categories={categories}
          onClose={() => setShowModal(false)}
          onSaved={load}
        />
      )}
    </div>
  )
}
