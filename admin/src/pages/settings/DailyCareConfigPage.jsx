import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'
import { useToast } from '../../App'

// AI 每日健康关怀 —— 定时任务每天给活跃客户推一条 AI 专属关怀/提醒消息，带「去打卡」入口。
// 本页只做总开关：关闭后调度器每次跑会读到 enabled=false 直接跳过，不再发送。
export default function DailyCareConfigPage() {
  const toast = useToast()
  const [enabled, setEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    adminAPI.getDailyCareConfig()
      .then(r => setEnabled(r.data?.enabled !== false))
      .catch(e => toast(e.message))
      .finally(() => setLoading(false))
  }, [])

  const handleToggle = async () => {
    const next = !enabled
    setSaving(true)
    try {
      await adminAPI.updateDailyCareConfig(next)
      setEnabled(next)
      toast(next ? '已开启每日健康关怀' : '已关闭每日健康关怀')
    } catch (err) { toast(err.message) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="page-loading">加载中...</div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">AI 每日健康关怀</h1>
          <p className="page-subtitle">系统每天主动给活跃客户推一条 AI 生成的专属关怀消息，带「去打卡」入口，提升客户打开率与打卡留存</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>
        {/* 开关卡片 */}
        <div className="card">
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 20, borderBottom: '1px solid #F3F4F6' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, color: '#1A2B24', marginBottom: 4 }}>每日关怀推送</div>
                <div style={{ fontSize: 13, color: '#8AA89C', lineHeight: 1.6 }}>
                  {enabled
                    ? '已开启：每天自动为活跃客户生成并推送一条专属关怀消息'
                    : '已关闭：暂停所有自动关怀推送（医护端手动发送不受影响）'}
                </div>
              </div>
              {/* 开关按钮 */}
              <button
                onClick={handleToggle}
                disabled={saving}
                style={{
                  position: 'relative', width: 52, height: 30, borderRadius: 999, border: 'none',
                  background: enabled ? '#1E6B50' : '#D1D5DB', cursor: saving ? 'wait' : 'pointer',
                  transition: 'background 0.2s', flexShrink: 0,
                }}
              >
                <span style={{
                  position: 'absolute', top: 3, left: enabled ? 25 : 3, width: 24, height: 24,
                  borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </button>
            </div>

            <div style={{ paddingTop: 18 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#1A2B24', marginBottom: 10 }}>推送规则说明</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#4A6558', lineHeight: 2 }}>
                <li>推送对象：近 30 天有过打卡，或近 30 天新建档的活跃客户（不打扰僵尸账号）</li>
                <li>推送内容：结合客户打卡天数、慢病标签，由 AI 生成温暖话术；AI 不可用时用暖心模板兜底</li>
                <li>推送频率：每位客户每天最多一条，已发过当天不重复</li>
                <li>客户称呼：优先用档案里标注的称呼，未标注则按性别得体兜底</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 状态面板 */}
        <div className="card">
          <div className="card-body">
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: '#1A2B24' }}>💚 当前状态</h3>
            <div style={{
              background: enabled ? '#EAF5EF' : '#F3F4F6', borderRadius: 8, padding: '18px 14px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: enabled ? '#1E6B50' : '#8AA89C', marginBottom: 4 }}>
                {enabled ? '运行中' : '已暂停'}
              </div>
              <div style={{ fontSize: 12, color: '#8AA89C' }}>
                {enabled ? '每天定时自动推送' : '不再自动推送'}
              </div>
            </div>
            <p style={{ fontSize: 12, color: '#8AA89C', lineHeight: 1.7, marginTop: 14, marginBottom: 0 }}>
              开关实时生效，无需重启系统。关闭后仅停止「自动」推送，医护在患者详情页手动发送 AI 教练消息不受影响。
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
