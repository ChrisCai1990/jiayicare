import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import { useToast } from '../App'

const ACTIVITY_TYPE_LABEL = { discount: '折扣活动', gift: '赠品活动', coupon: '优惠券', points: '积分活动' }
const SERVICE_TYPE_OPTIONS = [
  { v: '', l: '通用' },
  { v: 'medical_escort', l: '就医协助' },
  { v: 'psychology', l: '心理咨询' },
  { v: 'rehab', l: '运动复健' },
  { v: 'tcm', l: '中医评估' },
  { v: 'specialist', l: '专科会诊' },
]

// ── 会员等级 ──────────────────────────────────────────────
function LevelsTab({ toast }) {
  const [levels, setLevels] = useState([])
  const [form, setForm] = useState({ name: '', minPoints: 0, color: '#1E6B50', benefits: '', sortOrder: 0 })
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = () => staffAPI.getLevels().then(r => setLevels(r.data)).catch(() => {})
  useEffect(() => { load() }, [])

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.name) { toast('请填写等级名称'); return }
    setSaving(true)
    try {
      const data = { ...form, benefits: form.benefits ? form.benefits.split('\n').filter(Boolean) : [], minPoints: Number(form.minPoints) || 0, sortOrder: Number(form.sortOrder) || 0 }
      if (editing) { await staffAPI.updateLevel(editing._id, data) }
      else { await staffAPI.createLevel(data) }
      toast(editing ? '已更新' : '已创建')
      setEditing(null)
      setForm({ name: '', minPoints: 0, color: '#1E6B50', benefits: '', sortOrder: 0 })
      load()
    } catch (err) { toast(err.message || '保存失败') }
    finally { setSaving(false) }
  }

  const startEdit = (l) => {
    setEditing(l)
    setForm({ name: l.name, minPoints: l.minPoints || 0, color: l.color || '#1E6B50', benefits: (l.benefits || []).join('\n'), sortOrder: l.sortOrder || 0 })
  }

  const handleDelete = async (id) => {
    if (!window.confirm('确定删除此等级？')) return
    await staffAPI.deleteLevel(id)
    toast('已删除'); load()
  }

  const handleToggle = async (l) => {
    await staffAPI.updateLevel(l._id, { isActive: !l.isActive })
    toast(l.isActive ? '已禁用' : '已启用'); load()
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>
      {/* 列表 */}
      <div className="card">
        <div className="card-header"><div className="card-title">会员等级列表</div></div>
        <div className="card-body">
          {levels.length === 0 ? <p style={{ color: '#aaa', textAlign: 'center', padding: 20 }}>暂无等级配置</p> : (
            <table className="table">
              <thead><tr><th>等级名称</th><th>最低积分</th><th>权益</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                {levels.map(l => (
                  <tr key={l._id}>
                    <td><span style={{ color: l.color || '#1E6B50', fontWeight: 600 }}>{l.name}</span></td>
                    <td>{l.minPoints} 积分</td>
                    <td style={{ fontSize: 12, color: '#4A6558' }}>{(l.benefits || []).join('、') || '-'}</td>
                    <td><span style={{ color: l.isActive ? '#22A06B' : '#aaa' }}>{l.isActive ? '启用' : '禁用'}</span></td>
                    <td>
                      <button className="btn btn-secondary btn-sm" style={{ marginRight: 6 }} onClick={() => startEdit(l)}>编辑</button>
                      <button className="btn btn-secondary btn-sm" style={{ marginRight: 6 }} onClick={() => handleToggle(l)}>{l.isActive ? '禁用' : '启用'}</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(l._id)}>删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 表单 */}
      <div className="card">
        <div className="card-header"><div className="card-title">{editing ? '编辑等级' : '新建等级'}</div></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label style={{ fontSize: 12, color: '#8AA89C' }}>等级名称 *</label>
            <input className="form-control" value={form.name} onChange={set('name')} placeholder="如：黄金会员" /></div>
          <div><label style={{ fontSize: 12, color: '#8AA89C' }}>升级所需积分</label>
            <input className="form-control" type="number" value={form.minPoints} onChange={set('minPoints')} /></div>
          <div><label style={{ fontSize: 12, color: '#8AA89C' }}>显示颜色</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="color" value={form.color} onChange={set('color')} style={{ width: 40, height: 32, cursor: 'pointer', border: 'none' }} />
              <input className="form-control" value={form.color} onChange={set('color')} style={{ flex: 1 }} />
            </div></div>
          <div><label style={{ fontSize: 12, color: '#8AA89C' }}>权益描述（每行一条）</label>
            <textarea className="form-control" rows={4} value={form.benefits} onChange={set('benefits')} placeholder="每行填写一条权益&#10;如：专属家庭医生服务&#10;每月健康报告" /></div>
          <div><label style={{ fontSize: 12, color: '#8AA89C' }}>排序权重</label>
            <input className="form-control" type="number" value={form.sortOrder} onChange={set('sortOrder')} /></div>
          <div style={{ display: 'flex', gap: 8 }}>
            {editing && <button className="btn btn-secondary" onClick={() => { setEditing(null); setForm({ name: '', minPoints: 0, color: '#1E6B50', benefits: '', sortOrder: 0 }) }}>取消</button>}
            <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 1 }}>
              {saving ? '保存中...' : editing ? '保存修改' : '创建等级'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 活动管理 ──────────────────────────────────────────────
function ActivitiesTab({ toast }) {
  const [activities, setActivities] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const emptyForm = { title: '', type: 'discount', description: '', discountRate: '', minAmount: 0, giftContent: '', pointsBonus: 0, startDate: '', endDate: '', targetPatientType: 'all', isActive: true }
  const [form, setForm] = useState(emptyForm)

  const load = () => staffAPI.getActivities().then(r => setActivities(r.data)).catch(() => {})
  useEffect(() => { load() }, [])

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.title) { toast('请填写活动名称'); return }
    setSaving(true)
    try {
      const data = { ...form, discountRate: form.discountRate ? Number(form.discountRate) : null, minAmount: Number(form.minAmount) || 0, pointsBonus: Number(form.pointsBonus) || 0 }
      if (editing) { await staffAPI.updateActivity(editing._id, data) }
      else { await staffAPI.createActivity(data) }
      toast(editing ? '已更新' : '已创建')
      setEditing(null); setShowForm(false); setForm(emptyForm); load()
    } catch (err) { toast(err.message || '保存失败') }
    finally { setSaving(false) }
  }

  const startEdit = (a) => {
    setEditing(a)
    setForm({ title: a.title, type: a.type, description: a.description || '', discountRate: a.discountRate || '', minAmount: a.minAmount || 0, giftContent: a.giftContent || '', pointsBonus: a.pointsBonus || 0, startDate: a.startDate ? a.startDate.slice(0, 10) : '', endDate: a.endDate ? a.endDate.slice(0, 10) : '', targetPatientType: a.targetPatientType || 'all', isActive: a.isActive })
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('确定删除此活动？')) return
    await staffAPI.deleteActivity(id); toast('已删除'); load()
  }

  const handleToggle = async (a) => {
    await staffAPI.updateActivity(a._id, { isActive: !a.isActive }); toast(a.isActive ? '已禁用' : '已启用'); load()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setForm(emptyForm); setShowForm(true) }}>＋ 创建活动</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <div className="card-title">{editing ? '编辑活动' : '创建活动'}</div>
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowForm(false); setEditing(null) }}>取消</button>
          </div>
          <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 12, color: '#8AA89C' }}>活动名称 *</label>
              <input className="form-control" value={form.title} onChange={set('title')} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C' }}>活动类型</label>
              <select className="form-control" value={form.type} onChange={set('type')}>
                {Object.entries(ACTIVITY_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C' }}>适用人群</label>
              <select className="form-control" value={form.targetPatientType} onChange={set('targetPatientType')}>
                <option value="all">全部会员</option>
                <option value="vip">VIP会员</option>
                <option value="regular">普通会员</option>
                <option value="trial">试用会员</option>
              </select>
            </div>
            {form.type === 'discount' && <>
              <div><label style={{ fontSize: 12, color: '#8AA89C' }}>折扣率（如0.8=八折）</label>
                <input className="form-control" type="number" step="0.01" min="0.01" max="1" value={form.discountRate} onChange={set('discountRate')} /></div>
              <div><label style={{ fontSize: 12, color: '#8AA89C' }}>最低消费金额（元）</label>
                <input className="form-control" type="number" value={form.minAmount} onChange={set('minAmount')} /></div>
            </>}
            {form.type === 'gift' && (
              <div style={{ gridColumn: 'span 2' }}><label style={{ fontSize: 12, color: '#8AA89C' }}>赠品内容</label>
                <input className="form-control" value={form.giftContent} onChange={set('giftContent')} /></div>
            )}
            {form.type === 'points' && (
              <div><label style={{ fontSize: 12, color: '#8AA89C' }}>额外赠送积分</label>
                <input className="form-control" type="number" value={form.pointsBonus} onChange={set('pointsBonus')} /></div>
            )}
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C' }}>开始日期</label>
              <input className="form-control" type="date" value={form.startDate} onChange={set('startDate')} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C' }}>结束日期</label>
              <input className="form-control" type="date" value={form.endDate} onChange={set('endDate')} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 12, color: '#8AA89C' }}>活动说明</label>
              <textarea className="form-control" rows={3} value={form.description} onChange={set('description')} />
            </div>
            <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => { setShowForm(false); setEditing(null) }}>取消</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? '保存中...' : '保存活动'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-body">
          {activities.length === 0 ? <p style={{ color: '#aaa', textAlign: 'center', padding: 20 }}>暂无活动</p> : (
            <table className="table">
              <thead><tr><th>活动名称</th><th>类型</th><th>有效期</th><th>适用人群</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                {activities.map(a => (
                  <tr key={a._id}>
                    <td style={{ fontWeight: 500 }}>{a.title}</td>
                    <td><span className="badge badge-info">{ACTIVITY_TYPE_LABEL[a.type] || a.type}</span></td>
                    <td style={{ fontSize: 13, color: '#4A6558' }}>
                      {a.startDate ? new Date(a.startDate).toLocaleDateString('zh-CN') : '—'} ～ {a.endDate ? new Date(a.endDate).toLocaleDateString('zh-CN') : '—'}
                    </td>
                    <td style={{ fontSize: 13 }}>{a.targetPatientType === 'all' ? '全部' : a.targetPatientType}</td>
                    <td><span style={{ color: a.isActive ? '#22A06B' : '#aaa' }}>{a.isActive ? '进行中' : '已停用'}</span></td>
                    <td>
                      <button className="btn btn-secondary btn-sm" style={{ marginRight: 6 }} onClick={() => startEdit(a)}>编辑</button>
                      <button className="btn btn-secondary btn-sm" style={{ marginRight: 6 }} onClick={() => handleToggle(a)}>{a.isActive ? '停用' : '启用'}</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(a._id)}>删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 积分管理 ──────────────────────────────────────────────
function PointsTab({ toast }) {
  const [rules] = useState([
    { label: '消费满100元', points: 10, desc: '每消费100元获得10积分' },
    { label: '完成随访', points: 5, desc: '每次完成随访获得5积分' },
    { label: '填写健康数据', points: 2, desc: '每次录入健康数据获得2积分' },
    { label: '邀请好友', points: 50, desc: '成功邀请1位好友注册获得50积分' },
  ])

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">积分规则（示例配置，功能开发中）</div>
        </div>
        <div className="card-body">
          <div style={{ background: '#FFF9E6', border: '1px solid #F6D860', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, color: '#8A6000' }}>
            💡 积分系统需配合用户端App上线后联调生效，当前展示为示例规则配置。
          </div>
          <table className="table">
            <thead><tr><th>积分场景</th><th>获得积分</th><th>规则说明</th></tr></thead>
            <tbody>
              {rules.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{r.label}</td>
                  <td><span style={{ color: '#D97706', fontWeight: 600 }}>+{r.points} 分</span></td>
                  <td style={{ fontSize: 13, color: '#4A6558' }}>{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">积分兑换规则</div></div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {[
              { name: '健康咨询券', points: 100, desc: '可兑换1次10分钟健康咨询' },
              { name: '营养评估', points: 200, desc: '可兑换1次营养状况评估' },
              { name: '检验优惠券', points: 500, desc: '可兑换基础检验套餐9折券' },
            ].map((item, i) => (
              <div key={i} style={{ border: '1px solid #E0D9CE', borderRadius: 10, padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1A2B24', marginBottom: 4 }}>{item.name}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#D97706', marginBottom: 8 }}>{item.points} 积分</div>
                <div style={{ fontSize: 12, color: '#8AA89C' }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 次卡套餐 ──────────────────────────────────────────────
function PackagesTab({ toast }) {
  const [packages, setPackages] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const emptyForm = { name: '', serviceType: '', count: '', price: '', originalPrice: '', validDays: 365, description: '', isActive: true }
  const [form, setForm] = useState(emptyForm)

  const load = () => staffAPI.getPackages().then(r => setPackages(r.data)).catch(() => {})
  useEffect(() => { load() }, [])

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.name || !form.count || !form.price) { toast('名称、次数、价格不能为空'); return }
    setSaving(true)
    try {
      const data = { ...form, count: Number(form.count), price: Number(form.price), originalPrice: Number(form.originalPrice) || 0, validDays: Number(form.validDays) || 365 }
      if (editing) { await staffAPI.updatePackage(editing._id, data) }
      else { await staffAPI.createPackage(data) }
      toast(editing ? '已更新' : '已创建')
      setEditing(null); setShowForm(false); setForm(emptyForm); load()
    } catch (err) { toast(err.message || '保存失败') }
    finally { setSaving(false) }
  }

  const startEdit = (p) => {
    setEditing(p)
    setForm({ name: p.name, serviceType: p.serviceType || '', count: p.count, price: p.price, originalPrice: p.originalPrice || '', validDays: p.validDays || 365, description: p.description || '', isActive: p.isActive })
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('确定删除此套餐？')) return
    await staffAPI.deletePackage(id); toast('已删除'); load()
  }

  const handleToggle = async (p) => {
    await staffAPI.updatePackage(p._id, { isActive: !p.isActive }); toast(p.isActive ? '已下架' : '已上架'); load()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setForm(emptyForm); setShowForm(true) }}>＋ 创建套餐</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <div className="card-title">{editing ? '编辑套餐' : '创建次卡套餐'}</div>
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowForm(false); setEditing(null) }}>取消</button>
          </div>
          <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 12, color: '#8AA89C' }}>套餐名称 *（如：10次陪诊卡）</label>
              <input className="form-control" value={form.name} onChange={set('name')} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C' }}>服务类型</label>
              <select className="form-control" value={form.serviceType} onChange={set('serviceType')}>
                {SERVICE_TYPE_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C' }}>次数 *</label>
              <input className="form-control" type="number" value={form.count} onChange={set('count')} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C' }}>售价（元）*</label>
              <input className="form-control" type="number" value={form.price} onChange={set('price')} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C' }}>划线价（元）</label>
              <input className="form-control" type="number" value={form.originalPrice} onChange={set('originalPrice')} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C' }}>有效天数</label>
              <input className="form-control" type="number" value={form.validDays} onChange={set('validDays')} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 12, color: '#8AA89C' }}>套餐说明</label>
              <textarea className="form-control" rows={3} value={form.description} onChange={set('description')} />
            </div>
            <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => { setShowForm(false); setEditing(null) }}>取消</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? '保存中...' : '保存套餐'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-body">
          {packages.length === 0 ? <p style={{ color: '#aaa', textAlign: 'center', padding: 20 }}>暂无次卡套餐</p> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
              {packages.map(p => (
                <div key={p._id} style={{ border: '1px solid #E0D9CE', borderRadius: 12, padding: 16, background: p.isActive ? '#fff' : '#f9f7f3' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 15, color: '#1A2B24' }}>{p.name}</span>
                    <span style={{ fontSize: 12, color: p.isActive ? '#22A06B' : '#aaa' }}>{p.isActive ? '上架中' : '已下架'}</span>
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: 22, fontWeight: 700, color: '#1E6B50' }}>¥{p.price}</span>
                    {p.originalPrice > 0 && <span style={{ fontSize: 13, color: '#aaa', textDecoration: 'line-through', marginLeft: 8 }}>¥{p.originalPrice}</span>}
                  </div>
                  <div style={{ fontSize: 13, color: '#4A6558', marginBottom: 4 }}>共 {p.count} 次 · 有效期 {p.validDays} 天</div>
                  {p.description && <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 12 }}>{p.description}</div>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => startEdit(p)}>编辑</button>
                    <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => handleToggle(p)}>{p.isActive ? '下架' : '上架'}</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p._id)}>删除</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 主页面 ────────────────────────────────────────────────
export default function MarketingPage() {
  const toast = useToast()
  const [tab, setTab] = useState('levels')

  const tabs = [
    { v: 'levels',     l: '🏅 会员等级' },
    { v: 'activities', l: '🎉 活动管理' },
    { v: 'points',     l: '⭐ 积分管理' },
    { v: 'packages',   l: '🎫 次卡套餐' },
  ]

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">会员营销</h1>
          <p className="page-subtitle">管理会员等级、活动、积分与次卡套餐</p>
        </div>
      </div>

      {/* 子导航 */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderRadius: 10, overflow: 'hidden', border: '1px solid #E0D9CE', width: 'fit-content' }}>
        {tabs.map(t => (
          <button key={t.v} onClick={() => setTab(t.v)}
            style={{
              padding: '10px 24px', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500,
              background: tab === t.v ? '#1E6B50' : '#f9f7f3',
              color: tab === t.v ? '#fff' : '#4A6558',
            }}>{t.l}</button>
        ))}
      </div>

      {tab === 'levels'     && <LevelsTab     toast={toast} />}
      {tab === 'activities' && <ActivitiesTab toast={toast} />}
      {tab === 'points'     && <PointsTab     toast={toast} />}
      {tab === 'packages'   && <PackagesTab   toast={toast} />}
    </div>
  )
}
