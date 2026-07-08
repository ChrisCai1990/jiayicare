import React, { useEffect, useState } from 'react'
import { hrAPI } from '../../hrApi'
import { useHr } from './HrApp'

const STATUS_LABEL = { active: '合作中', expired: '已到期', suspended: '已暂停' }

function StatCard({ label, value, sub, color = '#1E6B50' }) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 160, padding: '18px 20px' }}>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function BucketBar({ title, buckets, colorMap }) {
  const total = Object.values(buckets).reduce((a, b) => a + b, 0) || 1
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: '#1A2B24' }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Object.entries(buckets).map(([key, count]) => (
          <div key={key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#4A6558', marginBottom: 3 }}>
              <span>{key}</span>
              <span>{count} 人（{Math.round((count / total) * 100)}%）</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: '#f0ede7' }}>
              <div style={{
                height: '100%', borderRadius: 4, width: `${(count / total) * 100}%`,
                background: (colorMap && colorMap[key]) || '#1E6B50',
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const ASCVD_LABEL = { low: '低危', medium: '中危', high: '高危', unassessed: '未评估' }
const ASCVD_COLOR = { 低危: '#22A06B', 中危: '#D97706', 高危: '#DC3545', 未评估: '#B0A99C' }

export default function HrDashboardPage() {
  const { admin, logout } = useHr()
  const [overview, setOverview] = useState(null)
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([hrAPI.overview(), hrAPI.healthSummary()])
      .then(([ov, sm]) => { setOverview(ov.data); setSummary(sm.data) })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('zh-CN') : '-'

  if (loading) return <div className="page"><div className="loading">加载中...</div></div>
  if (error) return <div className="page"><div className="card" style={{ padding: 24, color: '#c00' }}>{error}</div></div>

  const ascvdBuckets = summary ? {
    低危: summary.ascvdBuckets.low, 中危: summary.ascvdBuckets.medium,
    高危: summary.ascvdBuckets.high, 未评估: summary.ascvdBuckets.unassessed,
  } : {}

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">🏢 {overview?.enterprise?.name}</div>
          <div className="page-subtitle">
            合同：{fmtDate(overview?.enterprise?.contractStartAt)} ~ {fmtDate(overview?.enterprise?.contractEndAt)} · 状态：{STATUS_LABEL[overview?.enterprise?.status]}
          </div>
        </div>
        <button className="btn btn-ghost" onClick={logout}>退出登录</button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <StatCard label="采购名额" value={overview?.enterprise?.seatsTotal || '不限'} />
        <StatCard label="已分配员工" value={overview?.seatsUsed} sub={`剩余 ${overview?.seatsRemaining ?? '-'}`} />
        <StatCard label="已激活账号" value={overview?.activated} color="#0077B6" />
        <StatCard label="激活率" value={`${overview?.activationRate ?? 0}%`} color="#D97706" />
      </div>

      {overview?.hrData && (
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, color: '#1A2B24' }}>
            📊 {overview.year} 年度服务概览
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <StatCard label="体检机构" value={overview.hrData.examOrg || '-'} />
            <StatCard label="当年体检人数" value={overview.hrData.examCount || 0} sub="人" />
            <StatCard label="客单价（总体）" value={`¥${overview.hrData.examUnitPrice || 0}`} color="#0077B6" />
            <StatCard label="体检总额" value={`¥${(overview.hrData.examTotal || 0).toLocaleString()}`} color="#DC3545" />
          </div>
          {(overview.hrData.examUnitPriceMale || overview.hrData.examUnitPriceMarriedFemale || overview.hrData.examUnitPriceSingleFemale) ? (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
              <StatCard label="客单价·男性" value={`¥${overview.hrData.examUnitPriceMale || 0}`} />
              <StatCard label="客单价·已婚女性" value={`¥${overview.hrData.examUnitPriceMarriedFemale || 0}`} />
              <StatCard label="客单价·未婚女性" value={`¥${overview.hrData.examUnitPriceSingleFemale || 0}`} />
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
            <StatCard label="保险公司" value={overview.hrData.insurerName || '-'} />
            <StatCard label="参保人数（总体）" value={overview.hrData.insuredCount || 0} sub="人" />
            <StatCard label="保险金额" value={`¥${(overview.hrData.insuredAmount || 0).toLocaleString()}`} color="#0077B6" />
            <StatCard label="健康管理费" value={`¥${(overview.hrData.healthMgmtFee || 0).toLocaleString()}`} color="#D97706" />
          </div>
          {(overview.hrData.insuredExecCount || overview.hrData.insuredFamilyCount || overview.hrData.insuredChildCount) ? (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
              <StatCard label="参保·高管" value={overview.hrData.insuredExecCount || 0} sub="人" />
              <StatCard label="参保·家属" value={overview.hrData.insuredFamilyCount || 0} sub="人" />
              <StatCard label="参保·孩子" value={overview.hrData.insuredChildCount || 0} sub="人" />
            </div>
          ) : null}
          {(overview.hrData.otherServices || []).length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#4A6558', marginBottom: 8 }}>其他付费单项服务</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {overview.hrData.otherServices.map((o, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 12px', background: '#f8faf9', borderRadius: 6 }}>
                    <span style={{ color: '#4A6558' }}>{o.name}</span>
                    <span style={{ fontWeight: 700, color: '#1E6B50' }}>¥{(o.amount || 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 320 }}>
          <BucketBar title="员工心血管风险分层（10年ASCVD风险，脱敏聚合）" buckets={ascvdBuckets} colorMap={ASCVD_COLOR} />
        </div>
        <div style={{ flex: 1, minWidth: 320 }}>
          <BucketBar title="健康分分布" buckets={summary?.scoreBuckets || {}} />
        </div>
        <div style={{ flex: 1, minWidth: 320 }}>
          <BucketBar title="年龄段分布" buckets={summary?.ageBuckets || {}} />
        </div>
      </div>

      <div style={{ fontSize: 12, color: '#aaa', marginTop: 16, textAlign: 'center' }}>
        以上数据均为脱敏聚合统计，不展示任何员工个人身份信息与详细健康数据
      </div>
    </div>
  )
}
