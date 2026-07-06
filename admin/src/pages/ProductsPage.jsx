import React, { useEffect, useState, useCallback, useRef } from 'react'
import { adminAPI } from '../api'
import { useToast } from '../App'

const EMPTY_FORM = {
  name: '', subtitle: '', category: '', originalPrice: '', sortOrder: 999,
  features: '', description: '', stock: 0, status: 'off',
  images: [], servicePrices: [],
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
              src={url} alt=""
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
    { key: 'images', label: '产品图片' },
    { key: 'desc', label: '详情描述' },
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
                      <img src={p.images[0]} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid #e0d9ce' }}
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
