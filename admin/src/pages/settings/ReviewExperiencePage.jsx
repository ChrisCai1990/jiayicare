import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'
import { useToast } from '../../App'

export default function ReviewExperiencePage() {
  const toast = useToast()
  const [state, setState] = useState({ enabled: false, requestedEnabled: false, credentialsValid: false, expiresAt: null })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    adminAPI.getReviewExperienceConfig()
      .then(res => setState(res.data))
      .catch(err => toast(err.message))
      .finally(() => setLoading(false))
  }, [])

  const toggle = async () => {
    const next = !state.requestedEnabled
    setSaving(true)
    try {
      const res = await adminAPI.updateReviewExperienceConfig(next)
      setState(res.data)
      toast(res.message)
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
          <p className="page-subtitle">控制小程序登录页的审核体验入口。</p>
        </div>
      </div>
      <div className="card">
        <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, color: '#1A2B24', marginBottom: 8 }}>
              当前状态：{state.enabled ? '已开放' : '未开放'}
            </div>
            <div style={{ fontSize: 13, color: '#8AA89C', lineHeight: 1.7 }}>
              开启后，审核人员勾选协议即可进入虚构资料的体验账号；正式用户无需使用此入口。
              {state.requestedEnabled && !state.credentialsValid && <div style={{ color: '#DC3545' }}>管理开关已开启，但审核凭证未生效或已到期，请续期后再提交审核。</div>}
              {state.expiresAt && <div>凭证有效至：{new Date(state.expiresAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}（北京时间）</div>}
            </div>
          </div>
          <button onClick={toggle} disabled={saving} style={{ minWidth: 120, padding: '11px 18px', border: 0, borderRadius: 8, color: '#fff', fontWeight: 700, cursor: saving ? 'wait' : 'pointer', background: state.requestedEnabled ? '#DC3545' : '#1E6B50' }}>
            {saving ? '保存中...' : state.requestedEnabled ? '关闭体验入口' : '开放体验入口'}
          </button>
        </div>
      </div>
    </div>
  )
}
