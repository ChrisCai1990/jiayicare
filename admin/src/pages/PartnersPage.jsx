import React, { useEffect, useState, useRef } from 'react'
import { adminAPI } from '../api'
import { useToast } from '../App'

const CATEGORIES = ['口腔', '体检', '保险', '酒店', '其他']
// 真实生效的会员等级——与医护端患者详情页"会员类型"下拉框（PatientDetailPage.jsx）保持一致，
// 这是 User.memberType 字段实际会被写入的取值。admin后台另有一套 MemberType 集合（健康重塑计划等），
// 但那套值从未被写入 User.memberType，两者是完全不同的体系，不能混用，否则权益可见性永远匹配不上。
const MEMBER_LEVELS = ['优享', '悦享', '尊享', '卓越']

const EMPTY_PARTNER = { name: '', category: CATEGORIES[0], logo: '', description: '', contactPhone: '', sortOrder: 999, status: 'on' }
const EMPTY_BENEFIT = { title: '', subtitle: '', images: [], description: '', usageGuide: '', visibleMemberTypes: [], sortOrder: 999, status: 'on' }

// ── 单图上传（合作伙伴 logo） ──────────────────────────────────────
function LogoUpload({ value, onChange }) {
  const toast = useToast()
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef()

  const handleFile = async (files) => {
    if (!files?.length) return
    setUploading(true)
    try {
      const res = await adminAPI.uploadImage(files[0])
      if (res.data?.url) onChange(res.data.url)
    } catch (err) {
      toast('❌ 上传失败：' + err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {value && <img src={value} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, border: '1px solid #e0d9ce' }} />}
      <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
        {uploading ? '上传中...' : (value ? '更换Logo' : '📁 上传Logo')}
      </button>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files)} />
      {value && <button type="button" className="btn btn-ghost" onClick={() => onChange('')}>移除</button>}
    </div>
  )
}

// ── 多图上传（权益图片） ──────────────────────────────────────────
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
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()} disabled={uploading} style={{ flexShrink: 0 }}>
          {uploading ? '上传中...' : '📁 本地上传'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />
        <input className="form-input" style={{ flex: 1 }} value={urlInput} onChange={e => setUrlInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addUrl())} placeholder="或粘贴图片 URL，回车添加" />
        <button type="button" className="btn btn-ghost" onClick={addUrl}>添加</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {images.map((url, i) => (
          <div key={i} style={{ position: 'relative', width: 80, height: 80 }}>
            <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6, border: '1px solid #e0d9ce' }}
              onError={e => { e.target.style.background = '#f5f5f5'; e.target.alt = '加载失败' }} />
            <button onClick={() => remove(i)} style={{
              position: 'absolute', top: -6, right: -6, background: '#dc3545', color: '#fff',
              border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', fontSize: 11, lineHeight: '18px', textAlign: 'center', padding: 0,
            }}>×</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 合作伙伴表单 Modal ─────────────────────────────────────────────
function PartnerModal({ partner, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = !!partner?._id
  const [form, setForm] = useState(isEdit ? { ...partner } : EMPTY_PARTNER)
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.name || !form.category) { toast('❌ 名称、分类为必填项'); return }
    setLoading(true)
    try {
      if (isEdit) await adminAPI.updatePartner(partner._id, form)
      else await adminAPI.createPartner(form)
      toast(`✅ 合作伙伴${isEdit ? '更新' : '创建'}成功`)
      onSaved(); onClose()
    } catch (err) {
      toast('❌ ' + (err.message || '操作失败'))
    } finally { setLoading(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560, width: '96%' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{isEdit ? '✏️ 编辑合作伙伴' : '➕ 新增合作伙伴'}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">名称 *</label>
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="如：微笑口腔诊所" />
          </div>
          <div className="form-group">
            <label className="form-label">分类 *</label>
            <select className="form-input" value={form.category} onChange={e => set('category', e.target.value)}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Logo</label>
            <LogoUpload value={form.logo} onChange={v => set('logo', v)} />
          </div>
          <div className="form-group">
            <label className="form-label">简介</label>
            <textarea className="form-input" rows={3} value={form.description} onChange={e => set('description', e.target.value)} placeholder="合作伙伴简介" />
          </div>
          <div className="form-group">
            <label className="form-label">联系电话</label>
            <input className="form-input" value={form.contactPhone} onChange={e => set('contactPhone', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">排序（数字越小越靠前）</label>
            <input className="form-input" type="number" value={form.sortOrder} onChange={e => set('sortOrder', e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={save} disabled={loading}>{loading ? '保存中...' : '保存'}</button>
        </div>
      </div>
    </div>
  )
}

// ── 权益表单 Modal ────────────────────────────────────────────────
function BenefitModal({ partnerId, benefit, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = !!benefit?._id
  const [form, setForm] = useState(isEdit ? { ...benefit, partner: partnerId } : { ...EMPTY_BENEFIT, partner: partnerId })
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const toggleMemberType = (name) => {
    const has = form.visibleMemberTypes.includes(name)
    set('visibleMemberTypes', has ? form.visibleMemberTypes.filter(n => n !== name) : [...form.visibleMemberTypes, name])
  }

  const save = async () => {
    if (!form.title) { toast('❌ 权益标题为必填项'); return }
    setLoading(true)
    try {
      if (isEdit) await adminAPI.updatePartnerBenefit(benefit._id, form)
      else await adminAPI.createPartnerBenefit(form)
      toast(`✅ 权益${isEdit ? '更新' : '创建'}成功`)
      onSaved(); onClose()
    } catch (err) {
      toast('❌ ' + (err.message || '操作失败'))
    } finally { setLoading(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 620, width: '96%' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{isEdit ? '✏️ 编辑权益' : '➕ 新增权益'}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">权益标题 *</label>
            <input className="form-input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="如：免费洁牙一次" />
          </div>
          <div className="form-group">
            <label className="form-label">副标题</label>
            <input className="form-input" value={form.subtitle} onChange={e => set('subtitle', e.target.value)} placeholder="简短描述" />
          </div>
          <div className="form-group">
            <label className="form-label">权益图片</label>
            <ImageUploadList images={form.images} onChange={v => set('images', v)} />
          </div>
          <div className="form-group">
            <label className="form-label">权益详情</label>
            <textarea className="form-input" rows={4} value={form.description} onChange={e => set('description', e.target.value)} placeholder="权益详细内容" />
          </div>
          <div className="form-group">
            <label className="form-label">使用说明</label>
            <textarea className="form-input" rows={3} value={form.usageGuide} onChange={e => set('usageGuide', e.target.value)} placeholder="如何预约/核销该权益" />
          </div>
          <div className="form-group">
            <label className="form-label">可见会员等级（不选=所有会员可见）</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {MEMBER_LEVELS.map(name => (
                <label key={name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.visibleMemberTypes.includes(name)} onChange={() => toggleMemberType(name)} />
                  {name}
                </label>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">排序（数字越小越靠前）</label>
            <input className="form-input" type="number" value={form.sortOrder} onChange={e => set('sortOrder', e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={save} disabled={loading}>{loading ? '保存中...' : '保存'}</button>
        </div>
      </div>
    </div>
  )
}

export default function PartnersPage() {
  const toast = useToast()
  const [partners, setPartners] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [showPartnerModal, setShowPartnerModal] = useState(false)
  const [editingPartner, setEditingPartner] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [benefitsByPartner, setBenefitsByPartner] = useState({})
  const [showBenefitModal, setShowBenefitModal] = useState(false)
  const [editingBenefit, setEditingBenefit] = useState(null)

  const loadPartners = async (name) => {
    setLoading(true)
    try {
      const res = await adminAPI.partners(name ? { name } : {})
      setPartners(res.data || [])
    } catch (err) {
      toast('❌ 加载失败：' + err.message)
    } finally { setLoading(false) }
  }

  const loadBenefits = async (partnerId) => {
    try {
      const res = await adminAPI.partnerBenefits({ partnerId })
      setBenefitsByPartner(m => ({ ...m, [partnerId]: res.data || [] }))
    } catch (err) {
      toast('❌ 加载权益失败：' + err.message)
    }
  }

  useEffect(() => { loadPartners(q) }, [q])

  const toggleExpand = (id) => {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    if (!benefitsByPartner[id]) loadBenefits(id)
  }

  const togglePartner = async (p) => {
    try { await adminAPI.togglePartner(p._id); toast('已更新'); loadPartners() }
    catch (err) { toast('❌ ' + err.message) }
  }

  const deletePartner = async (p) => {
    if (!window.confirm(`确定删除「${p.name}」？其名下所有权益将一并删除，此操作不可恢复。`)) return
    try { await adminAPI.deletePartner(p._id); toast('✅ 已删除'); loadPartners() }
    catch (err) { toast('❌ ' + err.message) }
  }

  const toggleBenefit = async (partnerId, b) => {
    try { await adminAPI.togglePartnerBenefit(b._id); toast('已更新'); loadBenefits(partnerId) }
    catch (err) { toast('❌ ' + err.message) }
  }

  const deleteBenefit = async (partnerId, b) => {
    if (!window.confirm(`确定删除权益「${b.title}」？`)) return
    try { await adminAPI.deletePartnerBenefit(b._id); toast('✅ 已删除'); loadBenefits(partnerId) }
    catch (err) { toast('❌ ' + err.message) }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">🤝 合作伙伴权益管理</div>
          <div className="page-subtitle">管理口腔/体检/保险/酒店等合作伙伴及客户可享权益</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditingPartner(null); setShowPartnerModal(true) }}>＋ 新增合作伙伴</button>
      </div>

      <div className="search-bar" style={{ marginBottom: 12 }}>
        <input
          className="search-input"
          placeholder="🔍  搜索合作伙伴名称..."
          value={q}
          onChange={e => setQ(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="loading">加载中...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {partners.length === 0 && (
            <div className="card" style={{ textAlign: 'center', color: '#888', padding: 32 }}>暂无合作伙伴，点击「新增合作伙伴」添加</div>
          )}
          {partners.map(p => (
            <div key={p._id} className="card" style={{ padding: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: 'pointer' }} onClick={() => toggleExpand(p._id)}>
                {p.logo ? <img src={p.logo} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} /> : <div style={{ width: 40, height: 40, borderRadius: 8, background: '#f5f2ec' }} />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{p.name} <span style={{ fontSize: 12, color: '#888', fontWeight: 400 }}>{p.category}</span></div>
                  <div style={{ fontSize: 12, color: '#888' }}>{p.description}</div>
                </div>
                <span className={`badge ${p.status === 'on' ? 'badge-green' : 'badge-gray'}`}>{p.status === 'on' ? '上架' : '下架'}</span>
                <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                  <button className="btn btn-sm btn-ghost" onClick={() => { setEditingPartner(p); setShowPartnerModal(true) }}>编辑</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => togglePartner(p)}>{p.status === 'on' ? '下架' : '上架'}</button>
                  <button className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc' }} onClick={() => deletePartner(p)}>删除</button>
                </div>
                <span style={{ color: '#888' }}>{expandedId === p._id ? '▲' : '▼'}</span>
              </div>

              {expandedId === p._id && (
                <div style={{ borderTop: '1px solid #f0ede7', padding: '14px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#4A6558' }}>权益列表</div>
                    <button className="btn btn-sm btn-primary" onClick={() => { setEditingBenefit(null); setShowBenefitModal(true) }}>＋ 新增权益</button>
                  </div>
                  {(benefitsByPartner[p._id] || []).length === 0 && (
                    <div style={{ fontSize: 12, color: '#aaa', padding: '8px 0' }}>暂无权益</div>
                  )}
                  {(benefitsByPartner[p._id] || []).map(b => (
                    <div key={b._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px dashed #f0ede7' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500 }}>{b.title}</div>
                        <div style={{ fontSize: 12, color: '#888' }}>{b.subtitle}</div>
                        <div style={{ fontSize: 11, color: '#aaa' }}>
                          {(b.visibleMemberTypes || []).length === 0 ? '所有会员可见' : `可见：${b.visibleMemberTypes.join('、')}`}
                        </div>
                      </div>
                      <span className={`badge ${b.status === 'on' ? 'badge-green' : 'badge-gray'}`}>{b.status === 'on' ? '上架' : '下架'}</span>
                      <button className="btn btn-sm btn-ghost" onClick={() => { setEditingBenefit(b); setShowBenefitModal(true) }}>编辑</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => toggleBenefit(p._id, b)}>{b.status === 'on' ? '下架' : '上架'}</button>
                      <button className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc' }} onClick={() => deleteBenefit(p._id, b)}>删除</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showPartnerModal && (
        <PartnerModal partner={editingPartner} onClose={() => setShowPartnerModal(false)} onSaved={loadPartners} />
      )}
      {showBenefitModal && (
        <BenefitModal
          partnerId={expandedId}
          benefit={editingBenefit}
          onClose={() => setShowBenefitModal(false)}
          onSaved={() => loadBenefits(expandedId)}
        />
      )}
    </div>
  )
}
