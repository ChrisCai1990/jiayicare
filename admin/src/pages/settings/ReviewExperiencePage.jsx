import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'
import { useToast } from '../../App'

export default function ReviewExperiencePage() {
  const toast = useToast()
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    adminAPI.getReviewExperienceConfig()
      .then(res => setEnabled(res.data?.enabled === true))
      .catch(err => toast(err.message))
      .finally(() => setLoading(false))
  }, [])

  const toggle = async () => {
    const next = !enabled
    setSaving(true)
    try {
      await adminAPI.updateReviewExperienceConfig(next)
      setEnabled(next)
      toast(next ? '已开启审核一键体验' : '已关闭审核一键体验')
    } catch (err) {
      toast(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="page-loading">加载中...</div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">小程序审核体验</h1>
          <p className="page-subtitle">控制小程序登录页是否向微信审核人员显示“审核一键体验”入口。</p>
        </div>
      </div>
      <div className="card">
        <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, color: '#1A2B24', marginBottom: 8 }}>
              当前状态：{enabled ? '已开放' : '已关闭'}
            </div>
            <div style={{ fontSize: 13, color: '#8AA89C', lineHeight: 1.7 }}>
              开启后，审核人员勾选协议即可一键进入审核体验账号；正式用户无需使用此入口。
            </div>
          </div>
          <button onClick={toggle} disabled={saving} style={{ minWidth: 120, padding: '11px 18px', border: 0, borderRadius: 8, color: '#fff', fontWeight: 700, cursor: saving ? 'wait' : 'pointer', background: enabled ? '#DC3545' : '#1E6B50' }}>
            {saving ? '保存中...' : enabled ? '关闭体验入口' : '开放体验入口'}
          </button>
        </div>
      </div>
    </div>
  )
}
