import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'
import { useToast } from '../../App'

const EMPTY = { name: '', creditCode: '', logo: '', slogan: '', tagline: '', phone: '', address: '' }

export default function CompanyInfoPage() {
  const toast = useToast()
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    adminAPI.getCompanyInfo().then(r => {
      setForm({ ...EMPTY, ...r.data })
    }).catch(e => toast(e.message)).finally(() => setLoading(false))
  }, [])

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleLogoChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { toast('图片不能超过 2MB'); return }
    const reader = new FileReader()
    reader.onload = ev => setForm(f => ({ ...f, logo: ev.target.result }))
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await adminAPI.saveCompanyInfo(form)
      toast('企业信息已保存')
    } catch (e) {
      toast(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    setLoading(true)
    try {
      const r = await adminAPI.getCompanyInfo()
      setForm({ ...EMPTY, ...r.data })
    } catch (e) {
      toast(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>加载中...</div>

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>企业信息</h2>
        <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>配置企业公开信息，供客户端"关于我们"页面展示</p>
      </div>

      <div className="card" style={{ maxWidth: 680 }}>
        <div style={{ display: 'grid', gap: 16 }}>
          <Row label="企业名称">
            <input className="form-input" value={form.name} onChange={set('name')} placeholder="如：北京嘉医汇健康管理有限公司" />
          </Row>
          <Row label="统一社会信用代码">
            <input className="form-input" value={form.creditCode} onChange={set('creditCode')} placeholder="18位信用代码" />
          </Row>
          <Row label="企业 Logo">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {form.logo && (
                <img src={form.logo} alt="logo" style={{ width: 80, height: 80, objectFit: 'contain', border: '1px solid #E5E7EB', borderRadius: 8 }} />
              )}
              <div>
                <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                  选择图片
                  <input type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={handleLogoChange} />
                </label>
                <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>支持 PNG/JPG，不超过 2MB</div>
              </div>
            </div>
          </Row>
          <Row label="Slogan">
            <input className="form-input" value={form.slogan} onChange={set('slogan')} placeholder="一句话品牌口号" />
          </Row>
          <Row label="宣传语">
            <textarea className="form-input" rows={3} value={form.tagline} onChange={set('tagline')} placeholder="品牌宣传语（多行）" />
          </Row>
          <Row label="联系电话">
            <input className="form-input" value={form.phone} onChange={set('phone')} placeholder="如：010-12345678" />
          </Row>
          <Row label="地址">
            <textarea className="form-input" rows={2} value={form.address} onChange={set('address')} placeholder="企业详细地址" />
          </Row>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 24, paddingTop: 16, borderTop: '1px solid #E5E7EB' }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
          <button className="btn btn-ghost" onClick={handleReset}>重置</button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, alignItems: 'start' }}>
      <label style={{ fontSize: 14, color: '#374151', paddingTop: 8, fontWeight: 500 }}>{label}</label>
      <div>{children}</div>
    </div>
  )
}
