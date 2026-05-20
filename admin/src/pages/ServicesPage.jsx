import React, { useEffect, useState } from 'react'
import { adminAPI } from '../api'
import { useToast } from '../App'

const CATEGORIES = ['检测套餐', '专家咨询', '上门服务', '健康课程']
const ICONS = ['heart', 'videocam', 'home', 'school', 'water', 'nutrition', 'star-outline', 'fitness']

const EMPTY_FORM = {
  serviceId: '', category: '检测套餐', name: '', subtitle: '',
  price: '', originalPrice: '', tag: '', tagColor: '#E74C3C',
  icon: 'star-outline', iconColor: '#1E6B50', features: '',
  sortOrder: 0,
}

function ServiceModal({ service, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = !!service?._id
  const [form, setForm] = useState(isEdit ? {
    ...service,
    features: (service.features || []).join('\n'),
    price: String(service.price),
    originalPrice: String(service.originalPrice),
  } : EMPTY_FORM)
  const [loading, setLoading] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.serviceId || !form.name || !form.category) {
      toast('❌ 服务ID、名称、分类为必填项')
      return
    }
    setLoading(true)
    try {
      const payload = {
        ...form,
        price: parseFloat(form.price) || 0,
        originalPrice: parseFloat(form.originalPrice) || 0,
        features: form.features.split('\n').map(s => s.trim()).filter(Boolean),
        sortOrder: parseInt(form.sortOrder) || 0,
      }
      if (isEdit) {
        await adminAPI.updateService(service._id, payload)
      } else {
        await adminAPI.createService(payload)
      }
      toast(`✅ 服务${isEdit ? '更新' : '创建'}成功`)
      onSaved()
      onClose()
    } catch (err) {
      toast('❌ ' + (err.message || '操作失败'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600, width: '96%' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{isEdit ? '✏️ 编辑服务' : '➕ 新增服务'}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">服务ID *</label>
            <input className="form-input" value={form.serviceId} onChange={e => set('serviceId', e.target.value)}
              placeholder="如 S7" disabled={isEdit} />
          </div>
          <div className="form-group">
            <label className="form-label">分类 *</label>
            <select className="form-input" value={form.category} onChange={e => set('category', e.target.value)}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">服务名称 *</label>
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="服务名称" />
          </div>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">副标题</label>
            <input className="form-input" value={form.subtitle} onChange={e => set('subtitle', e.target.value)} placeholder="简短描述" />
          </div>
          <div className="form-group">
            <label className="form-label">价格（元）</label>
            <input className="form-input" type="number" value={form.price} onChange={e => set('price', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">原价（元）</label>
            <input className="form-input" type="number" value={form.originalPrice} onChange={e => set('originalPrice', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">标签文字</label>
            <input className="form-input" value={form.tag} onChange={e => set('tag', e.target.value)} placeholder="如：热销、限时折扣" />
          </div>
          <div className="form-group">
            <label className="form-label">标签颜色</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="color" value={form.tagColor || '#E74C3C'} onChange={e => set('tagColor', e.target.value)} style={{ width: 40, height: 36 }} />
              <input className="form-input" value={form.tagColor} onChange={e => set('tagColor', e.target.value)} style={{ flex: 1 }} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">图标名称</label>
            <input className="form-input" value={form.icon} onChange={e => set('icon', e.target.value)} placeholder="如：heart, home, school" />
          </div>
          <div className="form-group">
            <label className="form-label">图标颜色</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="color" value={form.iconColor || '#1E6B50'} onChange={e => set('iconColor', e.target.value)} style={{ width: 40, height: 36 }} />
              <input className="form-input" value={form.iconColor} onChange={e => set('iconColor', e.target.value)} style={{ flex: 1 }} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">排序（数字越小越靠前）</label>
            <input className="form-input" type="number" value={form.sortOrder} onChange={e => set('sortOrder', e.target.value)} />
          </div>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">特色功能（每行一条）</label>
            <textarea className="form-input" rows={4} value={form.features}
              onChange={e => set('features', e.target.value)}
              placeholder={'三甲医院专家操作\n24h报告解读\n健管专员跟进'} />
          </div>
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

export default function ServicesPage() {
  const toast = useToast()
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await adminAPI.services()
      setServices(res.data || [])
    } catch (err) {
      toast('❌ 加载失败：' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const toggle = async (svc) => {
    try {
      const res = await adminAPI.toggleService(svc._id)
      toast(res.message || '已更新')
      load()
    } catch (err) {
      toast('❌ ' + err.message)
    }
  }

  const del = async (svc) => {
    if (!window.confirm(`确定删除「${svc.name}」？此操作不可恢复。`)) return
    try {
      await adminAPI.deleteService(svc._id)
      toast('✅ 已删除')
      load()
    } catch (err) {
      toast('❌ ' + err.message)
    }
  }

  const openEdit = (svc) => { setEditing(svc); setShowModal(true) }
  const openNew  = ()    => { setEditing(null); setShowModal(true) }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">🛒 服务管理</div>
          <div className="page-subtitle">管理服务商城上架的服务项目</div>
        </div>
        <button className="btn btn-primary" onClick={openNew}>＋ 新增服务</button>
      </div>

      {loading ? (
        <div className="loading">加载中...</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>服务名称</th>
                <th>分类</th>
                <th>价格</th>
                <th>原价</th>
                <th>标签</th>
                <th>状态</th>
                <th>排序</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {services.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: '#888', padding: 32 }}>暂无服务，点击「新增服务」添加</td></tr>
              )}
              {services.map(svc => (
                <tr key={svc._id}>
                  <td><span style={{ fontFamily: 'monospace', color: '#1E6B50', fontWeight: 600 }}>{svc.serviceId}</span></td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{svc.name}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>{svc.subtitle}</div>
                  </td>
                  <td>{svc.category}</td>
                  <td style={{ color: '#E74C3C', fontWeight: 700 }}>¥{svc.price}</td>
                  <td style={{ color: '#888', textDecoration: 'line-through' }}>¥{svc.originalPrice}</td>
                  <td>
                    {svc.tag && (
                      <span style={{ background: svc.tagColor + '20', color: svc.tagColor, border: `1px solid ${svc.tagColor}40`, borderRadius: 4, padding: '2px 6px', fontSize: 12 }}>
                        {svc.tag}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${svc.active ? 'badge-green' : 'badge-gray'}`}>
                      {svc.active ? '上架' : '下架'}
                    </span>
                  </td>
                  <td>{svc.sortOrder}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => openEdit(svc)}>编辑</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => toggle(svc)}>
                        {svc.active ? '下架' : '上架'}
                      </button>
                      <button className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc' }} onClick={() => del(svc)}>删除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <ServiceModal
          service={editing}
          onClose={() => setShowModal(false)}
          onSaved={load}
        />
      )}
    </div>
  )
}
