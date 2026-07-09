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

// 三维度分区容器：体检 / 保险 / 健康管理，每块独立卡片+标题，避免所有指标挤成一堆
function ServiceSection({ icon, title, children }) {
  return (
    <div className="card" style={{ padding: 20, marginBottom: 14 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: '#1A2B24', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{icon}</span><span>{title}</span>
      </div>
      {children}
    </div>
  )
}

// 服务启动状态徽章
const SERVICE_STATUS_STYLE = {
  未启动: { bg: '#F3F4F6', color: '#8AA89C' },
  进行中: { bg: '#FEF3E2', color: '#D97706' },
  已完成: { bg: '#EAF5EF', color: '#1E6B50' },
}
function StatusBadge({ status }) {
  const s = SERVICE_STATUS_STYLE[status] || SERVICE_STATUS_STYLE.未启动
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 999, background: s.bg, color: s.color }}>
      {status || '未启动'}
    </span>
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
  const [selectedYear, setSelectedYear] = useState(null)  // null=默认当前年，切换后为具体年份

  // 首次加载：拉当前年 overview + 群体健康聚合
  useEffect(() => {
    Promise.all([hrAPI.overview(), hrAPI.healthSummary()])
      .then(([ov, sm]) => { setOverview(ov.data); setSummary(sm.data); setSelectedYear(ov.data.year) })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  // 切换年度：只重拉 overview（财务/服务是按年的），群体健康聚合不随年份变
  const handleYearChange = (year) => {
    if (year === selectedYear) return
    setSelectedYear(year)
    hrAPI.overview(year)
      .then(ov => setOverview(ov.data))
      .catch(err => setError(err.message))
  }

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {(overview?.availableYears?.length > 0) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, color: '#8AA89C' }}>服务年度</span>
              <select
                value={selectedYear || overview.year}
                onChange={e => handleYearChange(e.target.value)}
                style={{
                  padding: '6px 10px', borderRadius: 8, border: '1px solid #E0D9CE',
                  fontSize: 14, color: '#1A2B24', background: '#fff', cursor: 'pointer',
                }}
              >
                {overview.availableYears.map(y => (
                  <option key={y} value={y}>{y} 年</option>
                ))}
              </select>
            </div>
          )}
          <button className="btn btn-ghost" onClick={logout}>退出登录</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <StatCard label="采购名额" value={overview?.enterprise?.seatsTotal || '不限'} />
        <StatCard label="已分配员工" value={overview?.seatsUsed} sub={`剩余 ${overview?.seatsRemaining ?? '-'}`} />
        <StatCard label="已激活账号" value={overview?.activated} color="#0077B6" />
        <StatCard label="激活率" value={`${overview?.activationRate ?? 0}%`} color="#D97706" />
      </div>

      {!overview?.hrData && (
        <div className="card" style={{ padding: 24, marginBottom: 16, textAlign: 'center', color: '#8AA89C', fontSize: 14 }}>
          {overview?.year} 年暂无服务数据记录
        </div>
      )}

      {overview?.hrData && (() => {
        const hr = overview.hrData
        const fund = hr.healthFund || {}
        return (
          <>
            {/* 维度一：体检服务 */}
            <ServiceSection icon="🩺" title={`${overview.year} 年 · 体检服务`}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <StatCard label="体检机构" value={hr.examOrg || '-'} />
                <StatCard label="当年体检人数" value={hr.examCount || 0} sub="人" />
                <StatCard label="客单价（总体）" value={`¥${hr.examUnitPrice || 0}`} color="#0077B6" />
                <StatCard label="体检总额" value={`¥${(hr.examTotal || 0).toLocaleString()}`} color="#DC3545" />
              </div>
              {(hr.examUnitPriceMale || hr.examUnitPriceMarriedFemale || hr.examUnitPriceSingleFemale) ? (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
                  <StatCard label="客单价·男性" value={`¥${hr.examUnitPriceMale || 0}`} />
                  <StatCard label="客单价·已婚女性" value={`¥${hr.examUnitPriceMarriedFemale || 0}`} />
                  <StatCard label="客单价·未婚女性" value={`¥${hr.examUnitPriceSingleFemale || 0}`} />
                </div>
              ) : null}
            </ServiceSection>

            {/* 维度二：保险服务 */}
            <ServiceSection icon="🛡️" title={`${overview.year} 年 · 保险服务`}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <StatCard label="保险公司" value={hr.insurerName || '-'} />
                <StatCard label="参保人数（总体）" value={hr.insuredCount || 0} sub="人" />
                <StatCard label="保险金额" value={`¥${(hr.insuredAmount || 0).toLocaleString()}`} color="#0077B6" />
              </div>
              {(hr.insuredExecCount || hr.insuredFamilyCount || hr.insuredChildCount) ? (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
                  <StatCard label="参保·高管" value={hr.insuredExecCount || 0} sub="人" />
                  <StatCard label="参保·家属" value={hr.insuredFamilyCount || 0} sub="人" />
                  <StatCard label="参保·孩子" value={hr.insuredChildCount || 0} sub="人" />
                </div>
              ) : null}
            </ServiceSection>

            {/* 维度三：健康管理服务（含服务清单+启动状态、健康基金） */}
            <ServiceSection icon="💚" title={`${overview.year} 年 · 健康管理服务`}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <StatCard label="健康管理费" value={`¥${(hr.healthMgmtFee || 0).toLocaleString()}`} color="#D97706" />
              </div>

              {/* 付费服务清单：让企业看清过去一年提供了哪些服务及实际启动情况 */}
              {(hr.otherServices || []).length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#4A6558', marginBottom: 8 }}>付费健康管理服务清单</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {hr.otherServices.map((o, i) => (
                      <div key={i} style={{ fontSize: 13, padding: '10px 12px', background: '#f8faf9', borderRadius: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <StatusBadge status={o.status} />
                            <span style={{ color: '#1A2B24', fontWeight: 600 }}>{o.name}</span>
                          </div>
                          <span style={{ fontWeight: 700, color: '#1E6B50' }}>¥{(o.amount || 0).toLocaleString()}</span>
                        </div>
                        {o.detail && (
                          <div style={{ fontSize: 12, color: '#4A6558', lineHeight: 1.6, marginTop: 6, paddingLeft: 2 }}>
                            {o.detail}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 健康基金账户：总额-已用=余额，充值流水区分企业自有/平台赠送 */}
              {(fund.total > 0 || (fund.transactions || []).length > 0) && (
                <div style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#4A6558', marginBottom: 8 }}>健康基金账户</div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <StatCard label="基金总额" value={`¥${(fund.total || 0).toLocaleString()}`} />
                    <StatCard label="已使用" value={`¥${(fund.used || 0).toLocaleString()}`} color="#D97706" />
                    <StatCard label="可用余额" value={`¥${(fund.balance || 0).toLocaleString()}`} color="#1E6B50" />
                  </div>
                  {(fund.transactions || []).length > 0 && (
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {fund.transactions.map((t, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, padding: '6px 12px', background: '#f8faf9', borderRadius: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{
                              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                              background: t.source === '平台赠送' ? '#EAF5EF' : '#EAF1F8',
                              color: t.source === '平台赠送' ? '#1E6B50' : '#0077B6',
                            }}>{t.source}</span>
                            {t.date && <span style={{ color: '#8AA89C' }}>{t.date}</span>}
                            {t.note && <span style={{ color: '#4A6558' }}>{t.note}</span>}
                          </div>
                          <span style={{ fontWeight: 700, color: '#1A2B24' }}>+¥{(t.amount || 0).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </ServiceSection>
          </>
        )
      })()}

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
