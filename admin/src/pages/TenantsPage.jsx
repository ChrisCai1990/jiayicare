import React, { useEffect, useState } from 'react'
import { adminAPI } from '../api'
import { useAdmin, useToast } from '../App'

const STATUS_LABEL = { active: '运营中', suspended: '已暂停' }
const EMPTY = { code: '', name: '', slogan: '', themeColor: '#1E6B50', adminUsername: '', adminPassword: '' }
const externalEnabled = import.meta.env.VITE_ENABLE_EXTERNAL_TENANTS === 'true'

export default function TenantsPage() {
  const { admin } = useAdmin()
  const toast = useToast()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)   // null=新建
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [customerView, setCustomerView] = useState(null)
  const [customerLoading, setCustomerLoading] = useState(false)

  const isPlatform = admin?.role === 'platformSuper'

  const load = async () => {
    setLoading(true)
    try { const res = await adminAPI.tenants(); setList(res.data || []) }
    catch (err) { toast('❌ ' + (err.message || '加载失败')) }
    finally { setLoading(false) }
  }
  useEffect(() => { if (isPlatform) load() }, [])

  const openCreate = () => { setEditing(null); setForm(EMPTY); setShowModal(true) }
  const openEdit = (t) => { setEditing(t); setForm({ code: t.code, name: t.name, slogan: t.slogan || '', themeColor: t.themeColor || '#1E6B50', status: t.status, adminUsername: '', adminPassword: '' }); setShowModal(true) }
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    if (!form.code || !form.name) { toast('❌ 机构标识和名称必填'); return }
    setSaving(true)
    try {
      if (editing) await adminAPI.updateTenant(editing._id, { name: form.name, slogan: form.slogan, themeColor: form.themeColor, status: form.status })
      else await adminAPI.createTenant(form)
      toast(editing ? '✅ 机构已更新' : '✅ 机构创建成功')
      setShowModal(false); load()
    } catch (err) { toast('❌ ' + (err.message || '操作失败')) } finally { setSaving(false) }
  }

  const del = async (t) => {
    if (!window.confirm(`删除机构「${t.name}」？（有员工或客户时不可删）`)) return
    try { await adminAPI.deleteTenant(t._id); toast('✅ 已删除'); load() }
    catch (err) { toast('❌ ' + (err.message || '删除失败')) }
  }

  const viewCustomers = async (tenant, page = 1) => {
    setCustomerLoading(true)
    try {
      const res = await adminAPI.tenantCustomers(tenant._id, page)
      setCustomerView(res.data)
    } catch (err) { toast('❌ ' + (err.message || '客户名册加载失败')) }
    finally { setCustomerLoading(false) }
  }

  if (!isPlatform) {
    return <div className="page"><div className="card" style={{ padding: 32, color: '#c00' }}>仅平台超管可访问机构管理</div></div>
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">🏛️ 机构管理</h1>
          <p className="page-subtitle">多机构 SaaS 运营 · 各机构使用独立管理员账号</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setShowGuide(true)}>📖 后续接入流程</button>
          {externalEnabled && <button className="btn btn-primary" onClick={openCreate}>＋ 新建机构</button>}
        </div>
      </div>

      {/* 顶部流程提示条 */}
      <div style={{ background: '#F0FAF5', border: '1px solid #CDE9DC', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#2C6E52', lineHeight: 1.7 }}>
        <b>当前阶段：</b>嘉医汇作为独立业务机构运营，嘉静佑辰从平台侧按机构查看。外部机构接入在跨机构权限验收后开放。
        <span style={{ color: '#888', cursor: 'pointer', marginLeft: 6, textDecoration: 'underline' }} onClick={() => setShowGuide(true)}>查看详细步骤</span>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>加载中...</div>
        ) : list.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>机构记录尚未初始化，请先完成嘉医汇历史归属迁移。</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['机构名称', '标识', '员工数', '客户数', '状态', '创建时间', '操作'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(t => (
                <tr key={t._id}>
                  <td style={{ padding: '12px 14px', fontWeight: 600 }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: t.themeColor || '#1E6B50', marginRight: 8 }} />
                    {t.name}
                  </td>
                  <td style={{ padding: '12px 14px', color: '#6B7280', fontFamily: 'monospace' }}>{t.code}</td>
                  <td style={{ padding: '12px 14px', color: '#6B7280' }}>{t.staffCount ?? 0}</td>
                  <td style={{ padding: '12px 14px', color: '#6B7280' }}>{t.userCount ?? 0}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: t.status === 'active' ? '#E8F5EF' : '#FEECEC', color: t.status === 'active' ? '#1E6B50' : '#c0392b' }}>
                      {STATUS_LABEL[t.status] || t.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', color: '#9CA3AF', fontSize: 12 }}>{new Date(t.createdAt).toLocaleDateString('zh-CN')}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => viewCustomers(t)} style={{ marginRight: 6 }}>查看客户</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(t)} style={{ marginRight: 6 }}>编辑</button>
                    <button className="btn btn-danger btn-sm" onClick={() => del(t)}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {customerView && <div className="card" style={{ marginTop: 16, padding: 20 }}>
        <div className="page-header"><div><h2>{customerView.tenant.name} · 客户名册</h2><p className="page-subtitle">平台按机构查看；本次访问已记录。共 {customerView.total} 位客户。</p></div><button className="btn" onClick={() => setCustomerView(null)}>关闭</button></div>
        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%' }}><thead><tr><th>客户</th><th>手机号</th><th>正式客户</th><th>注册时间</th></tr></thead><tbody>
          {customerView.rows.map(row => <tr key={row._id}><td>{row.name || '未填写'}</td><td>{row.phone || '—'}</td><td>{row.isRegisteredClient ? '是' : '否'}</td><td>{row.createdAt ? new Date(row.createdAt).toLocaleDateString('zh-CN') : '—'}</td></tr>)}
        </tbody></table></div>
        {!customerView.rows.length && <p>该机构暂无客户。</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
          <button className="btn" disabled={customerLoading || customerView.page <= 1} onClick={() => viewCustomers(customerView.tenant, customerView.page - 1)}>上一页</button>
          <span>第 {customerView.page} 页</span>
          <button className="btn" disabled={customerLoading || customerView.page * customerView.pageSize >= customerView.total} onClick={() => viewCustomers(customerView.tenant, customerView.page + 1)}>下一页</button>
        </div>
      </div>}

      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? '编辑机构' : '新建机构'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">机构名称 *</label>
                  <input className="form-input" value={form.name} onChange={set('name')} placeholder="如：华东康养中心" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">机构标识 *（英文/拼音，创建后不可改）</label>
                  <input className="form-input" value={form.code} onChange={set('code')} placeholder="如 huadong" disabled={!!editing} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">主题色</label>
                  <input className="form-input" type="color" value={form.themeColor} onChange={set('themeColor')} style={{ height: 38, padding: 4 }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">品牌标语</label>
                  <input className="form-input" value={form.slogan} onChange={set('slogan')} placeholder="选填" />
                </div>
                {editing && (
                  <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                    <label className="form-label">状态</label>
                    <select className="form-input" value={form.status} onChange={set('status')}>
                      <option value="active">运营中</option>
                      <option value="suspended">已暂停</option>
                    </select>
                  </div>
                )}
                {!editing && (
                  <>
                    <div style={{ gridColumn: 'span 2', fontSize: 12, color: '#8A6D3B', background: '#FFFDF7', padding: '8px 12px', borderRadius: 6 }}>
                      为新机构创建一个超级管理员账号（该机构自己登录管理用）。留空则暂不创建，之后需另行添加。
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">机构管理员用户名</label>
                      <input className="form-input" value={form.adminUsername} onChange={set('adminUsername')} placeholder="登录用" />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">管理员初始密码</label>
                      <input className="form-input" type="password" value={form.adminPassword} onChange={set('adminPassword')} placeholder="至少10位，首次登录须修改" autoComplete="new-password" />
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? '保存中...' : (editing ? '保存' : '创建机构')}</button>
            </div>
          </div>
        </div>
      )}

      {showGuide && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowGuide(false) }}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3 className="modal-title">📖 外部机构后续接入流程</h3>
              <button className="modal-close" onClick={() => setShowGuide(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ fontSize: 14, lineHeight: 1.8, color: '#333' }}>
              {[
                ['第 1 步 · 完成权限验收', '外部机构开户目前关闭。先完成各业务接口的跨机构读写验收，再启用开户功能。'],
                ['第 2 步 · 新建机构', '点右上「＋ 新建机构」，填写：机构名称（如"华东康养中心"）、机构标识（英文/拼音，如 huadong，创建后不可改）、可选主题色和标语。'],
                ['第 3 步 · 设机构管理员', '在同一弹窗里填写该机构的管理员用户名和初始密码。系统会自动为这家机构创建一个独立的超级管理员账号。'],
                ['第 4 步 · 权限验收', '先核对机构归属和各业务接口的跨机构读写限制；创建机构本身不代表全部业务数据已完成隔离验收。'],
                ['第 5 步 · 交付同行使用', '验收通过后，通过安全渠道交付初始凭据。机构管理员首次登录须修改密码，再管理本机构的员工、客户和服务配置。'],
                ['第 6 步 · 平台侧管理', '平台超管随时可在本页查看各机构的员工数/客户数，或暂停（status=已暂停）某机构。机构下已有员工或客户时不允许直接删除，需先清理，防误删。'],
              ].map(([t, d], i) => (
                <div key={i} style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, color: '#1E6B50', marginBottom: 2 }}>{t}</div>
                  <div style={{ color: '#555' }}>{d}</div>
                </div>
              ))}
              <div style={{ background: '#FFFDF7', border: '1px solid #F0E6C8', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#8A6D3B' }}>
                💡 目前尚未做的（需人工线下处理）：机构自助注册开户、按机构计费/续费、每家机构独立登录域名。当前所有机构共用 admin.jiaycare.com 登录，靠账号自动区分归属。
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setShowGuide(false)}>知道了</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
