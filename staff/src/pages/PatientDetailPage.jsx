import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { staffAPI, API_ORIGIN } from '../api'
import { useToast, useStaff } from '../App'
import FollowUpModal from '../components/FollowUpModal'
import AiRuleHint from '../components/AiRuleHint'
import AppIcon from '../components/AppIcon'
import AiCaseReviewPanel from '../components/AiCaseReviewPanel'
import femalePortraitPhoto from '../assets/health-portrait-female.webp'
import malePortraitPhoto from '../assets/health-portrait-male.webp'

const CHECKIN_LABEL = { diet: '饮食', exercise: '运动', sleep: '睡眠', alcohol: '烟酒', weight: '体重', bloodPressure: '血压', bloodSugar: '血糖', heartRate: '心率', water: '饮水' }
const normalizeRiskTagValues = values => [...new Set((Array.isArray(values) ? values : [values])
  .flatMap(value => String(value || '').split(/[、,，;；\n]+/))
  .map(value => value.trim())
  .filter(Boolean))]

function HealthPortraitOverview({ user, reports = [] }) {
  const [expandedGroups, setExpandedGroups] = useState({})
  const profile = user.healthProfile || {}
  // 健康画像只呈现可明确识别的健康问题。问卷中的“有/无/以上均无”等选项值
  // 缺少具体医学信息，直接展示会被误解为新的健康问题。
  const isSubstantiveIssue = (value) => {
    const text = String(value || '').trim()
    if (!text) return false
    if (['无', '没有', '否', '有', '是', '以上均无', '均无', '无异常', '未见异常'].includes(text)) return false
    if (/^无.{0,12}(史|过敏|异常)$/.test(text)) return false
    return true
  }
  // 全面体检按“同一检查日期批次”归集。历史上为提高解析准确率，会把同一份年度报告
  // 拆成多张单项截图分别保存；因此不能再要求某一条记录本身必须是 annual。
  const isExplicitComprehensiveReport = (report) => {
    const title = String(report.title || '').trim()
    return report.type === 'annual' || /年度.{0,6}体检报告|全面体检|健康体检报告/.test(title)
  }
  const auditedReports = reports.filter(report => report.audit_status === 'audited' || report.aiStatus === 'reviewed')
  const normalizeCheckDate = (value) => {
    const text = String(value || '').trim()
    const matched = text.match(/^(\d{4}-\d{2}-\d{2})/)
    return matched ? matched[1] : text
  }
  const batchesByDate = auditedReports.reduce((map, report) => {
    const dateKey = normalizeCheckDate(report.checkDate || report.date || (isExplicitComprehensiveReport(report) ? String(report.reportYear || '') : ''))
    if (!dateKey) return map
    if (!map[dateKey]) map[dateKey] = { dateKey, reports: [] }
    map[dateKey].reports.push(report)
    return map
  }, {})
  const medicalDomainRules = [
    /血常规|红细胞|白细胞|血红蛋白|血小板|凝血/,
    /生化|肝功能|转氨酶|胆红素|白蛋白|肾功能|肌酐|尿素|尿酸|血脂|胆固醇|甘油三酯|血糖|糖化血红蛋白/,
    /尿常规|尿检|尿蛋白|尿潜血|尿比重/,
    /心电图|心脏超声|肌钙蛋白|BNP|脑钠肽|颈动脉|血压/,
    /腹部超声|肝胆胰脾|肝脏超声|胆囊超声|胰腺超声|脾脏超声/,
    /甲状腺|内分泌|甲功|维生素D/,
    /前列腺|子宫|附件|卵巢|宫颈|妇科/,
    /肿瘤标志物|甲胎蛋白|癌胚抗原|CA\d|PSA/,
    /胸片|胸部CT|肺功能|肺部|呼吸/,
    /胃镜|肠镜|幽门螺杆菌|呼气试验|消化/,
    /乙肝|丙肝|梅毒|HIV|EB病毒|感染/,
    /眼科|视力|眼底|耳鼻喉|听力|口腔/,
  ]
  const comprehensiveBatches = Object.values(batchesByDate).filter(batch => {
    const items = batch.reports.flatMap(report => report.reportItems || [])
    const titles = new Set(batch.reports.map(report => String(report.title || '').trim()).filter(Boolean))
    const searchableText = batch.reports.flatMap(report => [
      report.title,
      report.screeningL1,
      report.screeningL2,
      report.screeningCategory,
      ...(report.reportItems || []).flatMap(item => [item.name, item.orderName, item.sourceSection]),
    ]).filter(Boolean).join(' ')
    const domainCount = medicalDomainRules.filter(rule => rule.test(searchableText)).length
    const hasExplicitMarker = batch.reports.some(isExplicitComprehensiveReport)
    const hasBroadCoverage = items.length >= 8 && domainCount >= 4
    const hasBroadSplitCoverage = batch.reports.length >= 5 && titles.size >= 5 && domainCount >= 3
    const hasCredibleExplicitReport = hasExplicitMarker && items.length >= 6 && domainCount >= 3
    return hasBroadCoverage || hasBroadSplitCoverage || hasCredibleExplicitReport
  })
  const latestComprehensiveBatch = comprehensiveBatches.sort((a, b) => new Date(b.dateKey) - new Date(a.dateKey))[0]
  const latestComprehensiveDate = latestComprehensiveBatch
    ? new Date(latestComprehensiveBatch.dateKey)
    : null
  const hasRecentComprehensiveReport = latestComprehensiveDate
    && !Number.isNaN(latestComprehensiveDate.getTime())
    && Date.now() - latestComprehensiveDate.getTime() <= 365 * 24 * 60 * 60 * 1000
  const latestBatch = hasRecentComprehensiveReport ? latestComprehensiveBatch : null
  const hasLegacyAbnormalConclusion = (item) => {
    if (item.status !== 'unknown') return false
    const text = String(item.conclusion || item.diagnosis || '').trim()
    if (!text) return false
    // 旧报告常有结论文字但 status 未回填。先移除明确的正常/阴性语句，再判断是否仍含异常发现，
    // 避免“未见上皮内病变”“正常心电图”等被“病变/心电图”关键词误判。
    const signalText = text
      .replace(/未见[^。；\n]*(?:异常|病变)/g, '')
      .replace(/(?:正常心电图|阴性|NILM|标准型)/gi, '')
    return /异常|增生|囊肿|囊性|肌瘤|结节|团块|肿块|斑块|息肉|痔疮|脂肪肝|钙化|积液|占位|错构瘤|屈光不正|回声不均|回声欠均匀|偏高|偏低|升高|降低|下降|狭窄|减退|缺损|阳性/.test(signalText)
  }
  const conciseAbnormalConclusion = (value) => {
    const text = String(value || '').replace(/^小结\s*[：:]\s*/, '').trim()
    const bracketFinding = text.match(/^【([^】]+)】/)
    if (bracketFinding) return bracketFinding[1]
    const findingsOnly = text.split(/\n+/).map(line => line
      .replace(/[，,；;。]?\s*(?:建议|请到|可多吃|应注意|需要注意|注意事项)[\s\S]*$/, '')
      .trim()
    ).filter(Boolean).join('；')
    return findingsOnly.length > 60 ? `${findingsOnly.slice(0, 60)}…` : findingsOnly
  }
  const latestReportIssues = (latestBatch?.reports || []).flatMap(report => report.reportItems || [])
    .filter(item => ['abnormal', 'attention'].includes(item.status) || hasLegacyAbnormalConclusion(item))
    .map(item => {
      const result = item.conclusion || item.diagnosis || item.value || item.findings || ''
      const conciseResult = conciseAbnormalConclusion(result)
      return [item.name || item.bodyPart, conciseResult].filter(Boolean).join('：')
    })
    .filter(isSubstantiveIssue)
    .filter((item, index, all) => all.indexOf(item) === index)
  const latestReportDate = latestBatch?.dateKey || ''

  const groups = [
    { label: '慢病与重点问题', color: '#DC3545', items: user.chronicDiseases || [], emptyText: '暂无记录' },
    { label: `最近一次全面体检异常${latestReportDate ? ` · ${latestReportDate}` : ''}`, color: '#D97706', items: latestReportIssues, emptyText: latestBatch ? '该次全面体检未记录异常' : '缺乏近1年的全面体检数据' },
    { label: '过敏风险', color: '#7C3AED', items: [profile.drugAllergy, profile.foodAllergy].filter(Boolean), emptyText: '暂无明确过敏记录' },
  ].map(group => ({ ...group, items: group.items.filter(isSubstantiveIssue) }))
  const bodyRegionRules = [
    { key: 'head', label: '头面部', pattern: /眼|视力|屈光|耳|听力|鼻|咽|脑/, top: 17, femaleOffset: 4 },
    { key: 'neck', label: '颈部', pattern: /甲状腺|颈动脉|颈部/, top: 27, femaleOffset: 2 },
    { key: 'chest', label: '胸部', pattern: /乳腺|乳房|心脏|心电|冠心|肺|胸/, top: 38 },
    { key: 'abdomen', label: '腹部', pattern: /肝|胆|胰|脾|肾|胃|肠|肌酐|尿素|尿酸/, top: 49 },
    { key: 'pelvis', label: '盆腔', pattern: /子宫|附件|卵巢|宫颈|前列腺|膀胱|盆腔|痔疮|肛门/, top: 59 },
    { key: 'limbs', label: '骨骼四肢', pattern: /骨|关节|肌肉|四肢|膝|腰椎|颈椎/, top: 76 },
  ]
  const allPortraitIssues = groups.flatMap(group => group.items)
  const bodyMarkers = bodyRegionRules.filter(rule => allPortraitIssues.some(issue => rule.pattern.test(issue)))
  const markerNumbersForIssue = (issue) => bodyMarkers.reduce((numbers, marker, index) => {
    if (marker.pattern.test(issue)) numbers.push({ number: index + 1, color: index % 2 ? '#D97706' : '#DC3545' })
    return numbers
  }, [])
  const genderText = String(user.gender || '')
  const isFemalePortrait = /女|female/i.test(genderText)
  const isMalePortrait = /男|male/i.test(genderText)
  const portraitGenderLabel = isFemalePortrait ? '女性画像' : isMalePortrait ? '男性画像' : '通用画像'

  return (
    <div className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
      <div className="card-header">
        <div>
          <div className="card-title">人物健康画像</div>
          <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 3 }}>把客户已有健康问题集中标注，便于健康管理人员快速了解重点</div>
        </div>
      </div>
      <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 24, alignItems: 'center' }}>
        <div style={{ minWidth: 0, minHeight: 390, borderRadius: 20, backgroundImage: `url(${isFemalePortrait ? femalePortraitPhoto : malePortraitPhoto})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
          <span style={{ position: 'absolute', top: 12, right: 14, padding: '3px 8px', borderRadius: 99, background: '#E3F1EA', color: '#527566', fontSize: 10, fontWeight: 700 }}>{portraitGenderLabel}</span>
          <div aria-label="人物健康画像示意" style={{ position: 'absolute', inset: 0 }}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
              <defs>
                <linearGradient id="portraitGarment" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#A8D2C1" />
                  <stop offset="1" stopColor="#6EA78F" />
                </linearGradient>
                <linearGradient id="portraitSkin" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#F1D7C4" />
                  <stop offset="1" stopColor="#DDB99F" />
                </linearGradient>
                <filter id="portraitShadow" x="-30%" y="-20%" width="160%" height="160%">
                  <feDropShadow dx="0" dy="7" stdDeviation="8" floodColor="#365A4B" floodOpacity=".16" />
                </filter>
              </defs>
              <g filter="url(#portraitShadow)" display="none">
                {isFemalePortrait ? <>
                  {/* 年轻女性：蓬松卷发、收腰连衣裙与高跟鞋 */}
                  <path d="M113 52 Q104 29 116 13 Q127 -1 145 3 Q165 5 172 22 Q180 42 166 63 Q158 72 150 67 H126 Q116 68 113 52Z" fill="#4B332B" />
                  <circle cx="112" cy="31" r="8" fill="#5A3A30" /><circle cx="116" cy="16" r="8" fill="#5A3A30" />
                  <circle cx="128" cy="8" r="8" fill="#5A3A30" /><circle cx="144" cy="7" r="8" fill="#5A3A30" />
                  <circle cx="159" cy="13" r="8" fill="#5A3A30" /><circle cx="168" cy="27" r="8" fill="#5A3A30" />
                  <ellipse cx="140" cy="37" rx="17" ry="23" fill="url(#portraitSkin)" />
                  <path d="M123 27 Q133 11 160 18 Q150 22 123 35Z" fill="#5A3A30" />
                  <circle cx="134" cy="37" r="1.3" fill="#4A504D" /><circle cx="147" cy="37" r="1.3" fill="#4A504D" />
                  <path d="M136 49 Q141 52 146 48" fill="none" stroke="#B66F76" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M134 58 L133 75 H148 L147 58" fill="url(#portraitSkin)" />
                  <path d="M115 78 Q140 68 165 78 L171 153 L185 218 Q163 226 140 226 Q117 226 95 218 L109 153Z" fill="url(#portraitGarment)" />
                  <path d="M109 82 Q96 87 93 105 L83 190 Q81 204 90 207 Q100 210 104 195 L118 105Z" fill="url(#portraitSkin)" />
                  <path d="M171 82 Q184 87 187 105 L197 190 Q199 204 190 207 Q180 210 176 195 L162 105Z" fill="url(#portraitSkin)" />
                  <path d="M113 153 Q140 161 167 153" fill="none" stroke="#F3E5C5" strokeWidth="4" />
                  <circle cx="140" cy="156" r="3" fill="#D2AA61" />
                  <path d="M121 221 L136 221 L132 303 H118Z" fill="url(#portraitSkin)" />
                  <path d="M144 221 L159 221 L162 303 H148Z" fill="url(#portraitSkin)" />
                  <path d="M115 300 H133 L132 309 H113 Q109 308 115 300Z" fill="#593E48" />
                  <path d="M147 300 H164 L170 309 H149Z" fill="#593E48" />
                  <path d="M114 307 L111 316" stroke="#593E48" strokeWidth="3" strokeLinecap="round" />
                  <path d="M164 307 L168 316" stroke="#593E48" strokeWidth="3" strokeLinecap="round" />
                  <path d="M128 74 Q140 88 152 74" fill="none" stroke="#FFF7EA" strokeWidth="3" />
                </> : <>
                  {/* 年轻男性：利落发型、修身西装与皮鞋 */}
                  <path d="M119 29 Q121 5 143 5 Q164 6 168 27 Q157 18 149 17 Q135 22 119 32Z" fill="#2F3D3A" />
                  <path d="M120 24 Q129 8 153 9 L163 18 Q141 14 120 31Z" fill="#3B4B47" />
                  <ellipse cx="140" cy="38" rx="17" ry="23" fill="url(#portraitSkin)" />
                  <circle cx="134" cy="38" r="1.3" fill="#414A47" /><circle cx="147" cy="38" r="1.3" fill="#414A47" />
                  <path d="M136 50 Q141 52 146 49" fill="none" stroke="#A76F6C" strokeWidth="1.4" strokeLinecap="round" />
                  <path d="M134 58 L133 76 H148 L147 58" fill="url(#portraitSkin)" />
                  <path d="M104 82 Q140 67 176 82 L168 213 H112Z" fill="#314B59" />
                  <path d="M106 84 Q93 88 90 106 L79 190 Q77 204 87 208 Q98 211 102 196 L117 106Z" fill="#314B59" />
                  <path d="M174 84 Q187 88 190 106 L201 190 Q203 204 193 208 Q182 211 178 196 L163 106Z" fill="#314B59" />
                  <ellipse cx="86" cy="202" rx="8" ry="10" fill="url(#portraitSkin)" /><ellipse cx="194" cy="202" rx="8" ry="10" fill="url(#portraitSkin)" />
                  <path d="M124 77 L140 101 L156 77" fill="#FAFCFB" />
                  <path d="M105 82 L127 78 L140 101 L122 94Z" fill="#456476" />
                  <path d="M175 82 L153 78 L140 101 L158 94Z" fill="#456476" />
                  <path d="M140 92 L145 102 L140 149 L135 102Z" fill="#8F3945" />
                  <circle cx="140" cy="157" r="2" fill="#D2BE96" /><circle cx="140" cy="178" r="2" fill="#D2BE96" />
                  <path d="M112 209 Q126 203 139 211 L136 306 H113Z" fill="#253946" />
                  <path d="M141 211 Q154 203 168 209 L167 306 H144Z" fill="#203540" />
                  <path d="M111 302 H137 L136 313 H105 Q103 308 111 302Z" fill="#171F23" />
                  <path d="M144 302 H169 Q177 307 175 313 H144Z" fill="#171F23" />
                </>}
              </g>
              {bodyMarkers.map((marker, index) => {
                const leftSide = index % 2 === 0
                const markerTop = marker.top + (isFemalePortrait ? marker.femaleOffset || 0 : 0)
                return <path key={`line-${marker.key}`} d={`M${leftSide ? 37 : 54} ${markerTop} H${leftSide ? 46 : 63}`} fill="none" stroke={index % 2 ? '#D97706' : '#DC3545'} strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" opacity=".7" />
              })}
            </svg>
            {bodyMarkers.map((marker, index) => {
              const leftSide = index % 2 === 0
              const markerTop = marker.top + (isFemalePortrait ? marker.femaleOffset || 0 : 0)
              return <span key={marker.key} title={allPortraitIssues.filter(issue => marker.pattern.test(issue)).join('；')} style={{ position: 'absolute', top: `${markerTop}%`, left: leftSide ? '9%' : '63%', width: '28%', transform: 'translateY(-50%)', display: 'inline-flex', flexDirection: leftSide ? 'row' : 'row-reverse', alignItems: 'center', justifyContent: 'flex-start', gap: 5, zIndex: 2, whiteSpace: 'nowrap' }}>
                <span style={{ width: 24, height: 24, flex: '0 0 24px', borderRadius: '50%', background: index % 2 ? '#D97706' : '#DC3545', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800, boxShadow: `0 3px 9px ${index % 2 ? '#D9770666' : '#DC354566'}` }}>{index + 1}</span>
                <span style={{ padding: '3px 7px', border: '1px solid #E5ECE8', borderRadius: 7, background: 'rgba(255,255,255,.96)', color: '#31473D', fontSize: 10, fontWeight: 700, boxShadow: '0 2px 7px rgba(30,60,45,.10)' }}>{marker.label}</span>
              </span>
            })}
          </div>
        </div>
        <div style={{ minWidth: 0, display: 'grid', gap: 12 }}>
          {groups.map(group => (
            <div key={group.label} style={{ padding: '13px 15px', border: '1px solid #E5ECE8', borderLeft: `4px solid ${group.color}`, borderRadius: 10, background: '#fff' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1A2B24', marginBottom: 8 }}>{group.label}</div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {group.items.length ? <>
                  {group.items.slice(0, expandedGroups[group.label] ? group.items.length : 8).map((item, index) => {
                    const markerNumbers = markerNumbersForIssue(item)
                    return <span key={`${item}-${index}`} title={item} style={{ padding: '4px 9px', borderRadius: 7, background: `${group.color}12`, color: group.color, fontSize: 12, fontWeight: 600, lineHeight: 1.5, maxWidth: '100%', overflowWrap: 'anywhere', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      {markerNumbers.map(marker => <span key={marker.number} style={{ width: 17, height: 17, flex: '0 0 17px', borderRadius: '50%', background: marker.color, color: '#fff', display: 'inline-grid', placeItems: 'center', fontSize: 9, fontWeight: 800 }}>{marker.number}</span>)}
                      <span>{item}</span>
                    </span>
                  })}
                  {group.items.length > 8 && <button type="button" onClick={() => setExpandedGroups(s => ({ ...s, [group.label]: !s[group.label] }))} style={{ padding: '4px 9px', border: 0, borderRadius: 7, background: '#F3F5F4', color: '#52675E', fontSize: 12, cursor: 'pointer' }}>
                    {expandedGroups[group.label] ? '收起' : `展开其余 ${group.items.length - 8} 项`}
                  </button>}
                </> : <span style={{ color: '#A0AEA7', fontSize: 12 }}>{group.emptyText || '暂无记录'}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── 停止记录确认弹窗：只记录客户已停止使用的事实，不作停药或停用建议 ──
function ConfirmStopModal({ title, itemName, onClose, onConfirm }) {
  const [checked, setChecked] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const handleConfirm = async () => {
    setSubmitting(true)
    try { await onConfirm(reason.trim()) } finally { setSubmitting(false) }
  }
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 14, color: '#1A2B24', marginBottom: 10 }}>
            确认将「{itemName}」标记为客户已停止使用？本操作仅更新信息记录，不构成停药或停止补充建议。
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#4A6558', cursor: 'pointer' }}>
            <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />
            已根据客户陈述、处方/医嘱或其他来源确认该信息
          </label>
          <div className="form-group" style={{ marginTop: 14, marginBottom: 0 }}>
            <label className="form-label">信息来源及停止原因 *</label>
            <textarea className="form-input" rows={3} value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="如：客户反馈已按开方医师医嘱停用；保存后作为历史信息保留" />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn" style={{ background: '#D97706', color: '#fff' }} disabled={!checked || !reason.trim() || submitting} onClick={handleConfirm}>
            {submitting ? '保存中...' : '确认更新记录'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 生活方式表单子组件（定义在组件外，引用稳定，避免每次渲染重新挂载）─────
const LS_LABEL_STYLE = { fontSize: 12, color: '#8AA89C', marginBottom: 4, display: 'block' }

function LsRadio({ label, value, editing, options, onChange }) {
  return (
    <div>
      {label && <span style={LS_LABEL_STYLE}>{label}</span>}
      {editing ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px' }}>
          {options.map(o => (
            <label key={o} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="radio" checked={value === o} onChange={() => onChange(o)} />
              {o}
            </label>
          ))}
        </div>
      ) : (
        <span style={{ fontSize: 13, color: '#1A2B24' }}>{value || '-'}</span>
      )}
    </div>
  )
}

function LsCheckbox({ label, value = [], editing, options, onChange }) {
  return (
    <div>
      {label && <span style={LS_LABEL_STYLE}>{label}</span>}
      {editing ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px' }}>
          {options.map(o => (
            <label key={o} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="checkbox" checked={value.includes(o)}
                onChange={e => onChange(e.target.checked ? [...value, o] : value.filter(x => x !== o))} />
              {o}
            </label>
          ))}
        </div>
      ) : (
        <span style={{ fontSize: 13, color: '#1A2B24' }}>{value.length ? value.join('、') : '-'}</span>
      )}
    </div>
  )
}

// 稳定的体检指标输入组件（定义在组件外避免焦点丢失）
function LabField({ label, unit, value, onChange, placeholder, type }) {
  return (
    <div>
      <span style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 3 }}>{label}{unit ? ` (${unit})` : ''}</span>
      <input className="form-control" type={type || 'text'} value={value} placeholder={placeholder || ''} onChange={onChange} style={{ fontSize: 13 }} />
    </div>
  )
}
function LabTextarea({ label, unit, value, onChange, placeholder }) {
  return (
    <div>
      <span style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 3 }}>{label}{unit ? ` (${unit})` : ''}</span>
      <textarea className="form-control" rows={2} value={value} placeholder={placeholder || ''} onChange={onChange} style={{ fontSize: 13 }} />
    </div>
  )
}

function LsText({ label, value = '', editing, placeholder, multiline, onChange }) {
  return (
    <div>
      {label && <span style={LS_LABEL_STYLE}>{label}</span>}
      {editing ? (
        multiline
          ? <textarea className="form-control" rows={3} value={value} placeholder={placeholder || ''}
              onChange={e => onChange(e.target.value)} style={{ resize: 'vertical' }} />
          : <input className="form-control" value={value} placeholder={placeholder || ''}
              onChange={e => onChange(e.target.value)} />
      ) : (
        <span style={{ fontSize: 13, color: value ? '#1A2B24' : '#ccc' }}>{value || '-'}</span>
      )}
    </div>
  )
}

// ── 简易 SVG 折线趋势图 ───────────────────────────────────────────
function MiniTrendChart({ data, color = '#1E6B50', label, refLow, refHigh }) {
  if (!data || data.length < 2) return null;
  const W = 260, H = 80, PAD = 8;
  const vals = data.map(d => d.y);
  const rangeVals = [...vals];
  if (refLow  != null) rangeVals.push(refLow);
  if (refHigh != null) rangeVals.push(refHigh);
  const min = Math.min(...rangeVals), max = Math.max(...rangeVals);
  const range = max - min || 1;
  const toY = v => H - PAD - ((v - min) / range) * (H - PAD * 2);
  const xs = data.map((_, i) => PAD + (i / (data.length - 1)) * (W - PAD * 2));
  const ys = vals.map(v => toY(v));
  const pts = xs.map((x, i) => `${x},${ys[i]}`).join(' ');
  const last = data[data.length - 1];
  const highY = refHigh != null ? toY(refHigh) : null;
  const lowY  = refLow  != null ? toY(refLow)  : null;
  return (
    <div style={{ display: 'inline-block', marginRight: 16, marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 4, fontWeight: 600 }}>{label}</div>
      <svg width={W} height={H} style={{ border: '1px solid #f0ece4', borderRadius: 8, background: '#faf9f6' }}>
        {highY != null && (
          <>
            <line x1={PAD} y1={highY} x2={W - PAD} y2={highY} stroke="#DC354550" strokeWidth="1.5" strokeDasharray="4,3" />
            <text x={PAD + 2} y={Math.max(highY - 2, 10)} textAnchor="start" fontSize="8" fill="#DC3545AA">上限 {refHigh}</text>
          </>
        )}
        {lowY != null && (
          <>
            <line x1={PAD} y1={lowY} x2={W - PAD} y2={lowY} stroke="#0077B650" strokeWidth="1.5" strokeDasharray="4,3" />
            <text x={PAD + 2} y={Math.min(lowY + 9, H - 2)} textAnchor="start" fontSize="8" fill="#0077B6AA">下限 {refLow}</text>
          </>
        )}
        <polyline fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" points={pts} />
        {xs.map((x, i) => {
          // 不同机构参考范围可能不同，悬停查看该次检查所在机构+当时的参考范围（原生SVG title，无需额外UI）
          const p = data[i]
          const tip = [p.institution, p.ref ? `参考范围 ${p.ref}` : ''].filter(Boolean).join(' · ')
          return (
            <circle key={i} cx={x} cy={ys[i]} r="3" fill={color}>
              {tip && <title>{tip}</title>}
            </circle>
          )
        })}
        {/* 每个数据点都标注数值，不只是最后一个点，方便一眼看出历次具体读数 */}
        {xs.map((x, i) => (
          <text key={`v-${i}`} x={x} y={Math.max(ys[i] - 6, 9)} textAnchor="middle" fontSize="9" fill={color}>{vals[i]}</text>
        ))}
        <text x={PAD} y={H - 2} fontSize="9" fill="#aaa">{data[0].x}</text>
        <text x={W - PAD} y={H - 2} textAnchor="end" fontSize="9" fill="#aaa">{last.x}</text>
      </svg>
    </div>
  );
}

const ADULT_BODY_COMP_METRICS = [
  { key: 'weight', referenceKey: 'weightReference', label: '体成分体重', unit: 'kg', placeholder: '如 56.2', color: '#2563EB' },
  { key: 'skelMuscle', referenceKey: 'skelMuscleReference', label: '骨骼肌量', unit: 'kg', placeholder: '如 28.5', color: '#1E6B50' },
  { key: 'visceralFat', referenceKey: 'visceralFatReference', label: '内脏脂肪', unit: '级', placeholder: '如 9', color: '#7C3AED' },
  { key: 'bodyFatRate', referenceKey: 'bodyFatRateReference', label: '体脂率', unit: '%', placeholder: '如 25.3', color: '#D97706' },
]

const PEDIATRIC_BODY_COMP_METRICS = [
  { key: 'weight', referenceKey: 'weightReference', label: '体成分体重', unit: 'kg', placeholder: '如 24.6', color: '#2563EB' },
  { key: 'calcium', referenceKey: 'calciumReference', label: '钙质', unit: 'kg', placeholder: '如 0.61', color: '#0F8B8D' },
  { key: 'protein', referenceKey: 'proteinReference', label: '蛋白质', unit: 'kg', placeholder: '如 4.6', color: '#65A30D' },
  { key: 'fatMass', referenceKey: 'fatMassReference', label: '脂肪量', unit: 'kg', placeholder: '如 1.9', color: '#D97706' },
  { key: 'muscleMass', referenceKey: 'muscleMassReference', label: '肌肉量', unit: 'kg', placeholder: '如 21.0', color: '#7C3AED' },
]

function BodyCompositionTrendCharts({ history = [], metrics = ADULT_BODY_COMP_METRICS }) {
  const parseRange = value => {
    // 参考范围常写成 [33.8-38.5]；这里的“-”是区间分隔符，不是第二个数的负号。
    const nums = String(value || '').match(/\d+(?:\.\d+)?/g)?.map(Number) || []
    return nums.length >= 2 ? { low: nums[0], high: nums[1] } : {}
  }
  const rows = [...history].sort((a, b) => String(a?.measuredAt || a?.recordedAt || '').localeCompare(String(b?.measuredAt || b?.recordedAt || '')))
  const available = metrics.map(metric => {
    const data = rows.map(row => ({
      y: Number.parseFloat(row?.[metric.key]),
      x: String(row?.measuredAt || row?.recordedAt || '').slice(0, 10),
      ref: row?.[metric.referenceKey] || '',
      institution: row?.institution || '',
    })).filter(point => Number.isFinite(point.y))
    const latestWithRange = [...rows].reverse().find(row => row?.[metric.referenceKey])
    return { metric, data, range: parseRange(latestWithRange?.[metric.referenceKey]) }
  }).filter(item => item.data.length >= 2)
  if (!available.length) return null
  return (
    <div style={{ marginTop: 14, borderTop: '1px solid #f0ece4', paddingTop: 12 }}>
      <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 8 }}>趋势曲线（按测量日期）</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {available.map(({ metric, data, range }) => (
        <MiniTrendChart key={metric.key} data={data} color={metric.color} label={`${metric.label}（${metric.unit}）`} refLow={range.low} refHigh={range.high} />
        ))}
      </div>
    </div>
  )
}

const TYPE_MAP = { phone: '电话', wechat: '微信', visit: '上门', video: '视频', other: '其他' }
const SERVICE_PACKAGE_LABELS = {
  health_prevention: '健康预防计划', chronic_stable: '慢病维稳计划',
  young_state: '健康年轻态计划', health_reshape: '健康重塑计划',
  pkg_1y: '年度服务包', pkg_6m: '半年服务包', pkg_3m: '季度服务包',
}
const getServicePackageLabel = (pkg) => SERVICE_PACKAGE_LABELS[pkg] || pkg || '-'
const STATUS_MAP = { completed: '已完成', missed: '未接通', planned: '计划中', in_progress: '进行中', cancelled: '已取消' }
const STATUS_COLOR = { completed: '#22A06B', missed: '#DC3545', planned: '#D97706', in_progress: '#0077B6', cancelled: '#8AA89C' }
const TYPE_OPTIONS = [
  { v: 'phone',  l: '电话' },
  { v: 'wechat', l: '微信' },
  { v: 'visit',  l: '上门' },
  { v: 'video',  l: '视频' },
  { v: 'other',  l: '其他' },
]
// 报告归类一级大类（与用户端 ReportUploadScreen / admin 分类管理对齐的 7 类）
const REPORT_L1_TYPES = [
  { key: 'general_exam',   label: '一般检查' },
  { key: 'tumor',          label: '肿瘤筛查' },
  { key: 'cardiovascular', label: '心脑血管病筛查' },
  { key: 'chronic',        label: '慢性病筛查' },
  { key: 'functional',     label: '功能医学检测' },
  { key: 'gender_health',  label: '男性/女性健康筛查' },
  // 居家监测设备产出的报告（动态血压/动态血糖/动态心电图/肺功能等），2026-07-17需求新增
  { key: 'home_monitor',   label: '居家监测' },
  { key: 'other',          label: '其他常规筛查' },
]
const REPORT_L1_LABEL_TO_TYPE = Object.fromEntries(REPORT_L1_TYPES.map(item => [item.label, item.key]))
const PLAN_TYPE_LABEL = {
  annual_checkup:'年度体检方案', annual_mgmt:'年度管理方案',
  nutrition:'营养干预方案', medical_assist:'就医协助方案',
  tcm:'中医调理方案', rehab:'运动复健方案', psychology:'心理咨询方案',
  checkup:'体检方案', health:'健康管理方案', followup:'随访计划',
}
const PLAN_STATUS_COLOR = { draft:'#aaa', active:'#22A06B', completed:'#0077B6' }
const PLAN_STATUS_LABEL = { draft:'草稿', active:'进行中', completed:'已完成' }
const SR_TYPE_LABEL = {
  nutrition:'营养干预', disease_mgmt:'专病管理', medical_visit:'医院就医', routine:'日常随访', doctor_followup:'健康顾问跟进',
  stage_assessment:'阶段性健康评估', phase_assessment:'阶段性健康评估',
  medical_escort:'就医协助', psychology:'心理咨询', rehab:'运动复健', tcm:'中医评估', specialist:'专科会诊',
}
const SR_CATEGORY = {
  nutrition:     '营养干预',
  disease_mgmt:  '专病管理', specialist: '专病管理', psychology: '专病管理', rehab: '专病管理', tcm: '专病管理',
  medical_visit: '医院就医', medical_escort: '医院就医',
  routine:       '日常随访',
  doctor_followup: '健康顾问跟进',
  stage_assessment: '阶段性健康评估', phase_assessment: '阶段性健康评估',
}
const SR_CATEGORY_COLOR = { '营养干预':'#22A06B', '专病管理':'#0077B6', '医院就医':'#D97706', '阶段性健康评估':'#8A4AC7' }

// ── 开单弹窗 ─────────────────────────────────────────────
function RequisitionModal({ patientId, onClose, onSaved, prefillTitle = '', prefillNotes = '', prefillSuggestions = [] }) {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [title, setTitle] = useState(prefillTitle)
  const [notes, setNotes] = useState(prefillNotes)
  const [dueDate, setDueDate] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [matchingSuggestions, setMatchingSuggestions] = useState(false)
  const [unmatchedSuggestions, setUnmatchedSuggestions] = useState([])
  const timerRef = React.useRef()

  const doSearch = async (q) => {
    if (!q.trim()) { setSearchResults([]); return }
    setSearching(true)
    try {
      const res = await staffAPI.getRequisitionItems(q)
      setSearchResults(res.data || [])
    } catch { setSearchResults([]) }
    finally { setSearching(false) }
  }

  const handleSearchInput = e => {
    const q = e.target.value; setSearchQ(q)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => doSearch(q), 300)
  }

  const addItem = (item) => {
    if (items.find(i => i.itemId === item._id)) return
    setItems(prev => [...prev, { itemType: item.type, itemId: item._id, itemName: item.name, notes: '' }])
    setSearchQ(''); setSearchResults([])
  }

  // AI开单建议给出的是纯项目名称（如"TSH促甲状腺激素"），弹窗打开时按名称逐个搜索项目库，
  // 命中的自动加入已选列表，避免医护还要照着AI建议文字手动一个个再搜一遍——
  // 之前AI建议的项目名称只是拼成文字塞进备注框，跟真正的开单条目完全脱节
  useEffect(() => {
    if (!prefillSuggestions.length) return
    let cancelled = false
    setMatchingSuggestions(true)
    ;(async () => {
      const unmatched = []
      for (const name of prefillSuggestions) {
        if (cancelled) return
        try {
          const res = await staffAPI.getRequisitionItems(name)
          const hit = (res.data || [])[0]
          if (hit) {
            setItems(prev => prev.find(i => i.itemId === hit._id) ? prev : [...prev, { itemType: hit.type, itemId: hit._id, itemName: hit.name, notes: '' }])
          } else {
            unmatched.push(name)
          }
        } catch { unmatched.push(name) }
      }
      if (!cancelled) { setUnmatchedSuggestions(unmatched); setMatchingSuggestions(false) }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx))
  const updateItemNotes = (idx, v) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, notes: v } : it))

  const handleSave = async () => {
    if (!items.length) { setError('请至少添加一个检查项目'); return }
    setSaving(true); setError('')
    try {
      await staffAPI.createRequisition({ patientId, title: title || '检查开单', notes, items, dueDate: dueDate || null })
      onSaved()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 600, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h3 className="modal-title">新建检查开单</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {error && <div className="login-err" style={{ margin: '0 20px 8px' }}>⚠️ {error}</div>}
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
              <label className="form-label">开单标题</label>
              <input className="form-input" placeholder="如：2026年5月体检开单" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">要求完成日期（可选）</label>
              <input className="form-input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
              <label className="form-label">整体备注（可选）</label>
              <textarea className="form-input" rows={4} placeholder="整体注意事项...（如AI开单建议的复查背景、原因说明）"
                style={{ resize: 'vertical', lineHeight: 1.6 }}
                value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>

          {matchingSuggestions && (
            <div style={{ fontSize: 12, color: '#8AA89C' }}>正在匹配AI建议的检查项目…</div>
          )}
          {!matchingSuggestions && unmatchedSuggestions.length > 0 && (
            <div style={{ fontSize: 12, color: '#D97706', background: '#FEF3E2', padding: '8px 12px', borderRadius: 8 }}>
              ⚠️ AI建议的以下项目在系统项目库中未找到匹配，请手动搜索添加或忽略：{unmatchedSuggestions.join('、')}
            </div>
          )}

          {/* 搜索添加项目 */}
          <div>
            <label className="form-label">搜索并添加检查项目</label>
            <div style={{ position: 'relative' }}>
              <input className="form-input" placeholder="输入名称或助记码搜索..." value={searchQ} onChange={handleSearchInput} />
              {searching && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#aaa' }}>搜索中...</span>}
              {searchResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999, background: '#fff', border: '1px solid #E0D9CE', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', maxHeight: 200, overflowY: 'auto', marginTop: 4 }}>
                  {searchResults.map(item => (
                    <div key={item._id} onMouseDown={() => addItem(item)} style={{ padding: '8px 14px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #f5f5f5' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f9f7f3'}
                      onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                      <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: item.type === 'labTestOrder' ? '#EEF2FF' : '#F0FDF4', color: item.type === 'labTestOrder' ? '#4338CA' : '#166534', fontWeight: 600 }}>{item.typeName}</span>
                      <span style={{ fontWeight: 500 }}>{item.name}</span>
                      {item.mnemonic && <span style={{ color: '#8AA89C', fontSize: 12 }}>{item.mnemonic}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 已选项目列表 */}
          {items.length > 0 ? (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1A2B24', marginBottom: 8 }}>已添加 {items.length} 个项目</div>
              {items.map((item, idx) => (
                <div key={idx} style={{ background: '#f9f7f3', borderRadius: 8, padding: '10px 12px', marginBottom: 8, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: item.itemType === 'labTestOrder' ? '#EEF2FF' : '#F0FDF4', color: item.itemType === 'labTestOrder' ? '#4338CA' : '#166534', fontWeight: 600 }}>{item.itemType === 'labTestOrder' ? '检验' : '检查'}</span>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{item.itemName}</span>
                    </div>
                    <input className="form-input" style={{ fontSize: 12 }} placeholder="注意事项（可选，如：空腹抽血）" value={item.notes} onChange={e => updateItemNotes(idx, e.target.value)} />
                  </div>
                  <button type="button" onClick={() => removeItem(idx)} style={{ background: 'none', border: 'none', color: '#DC3545', fontSize: 18, cursor: 'pointer', lineHeight: 1, flexShrink: 0, marginTop: 2 }}>✕</button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '20px', textAlign: 'center', color: '#aaa', fontSize: 13, background: '#f9f7f3', borderRadius: 8 }}>
              请搜索并添加需要检查的项目
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !items.length}>
            {saving ? '创建中...' : `创建开单（${items.length} 项）`}
          </button>
        </div>
      </div>
    </div>
  )
}

// AI健康分析的卡片与数组编辑框：必须定义在组件外（模块级），否则每次输入重渲染会重建组件导致输入框失焦
function AISectionCard({ title, icon, color, children }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <button type="button" onClick={() => setExpanded(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px 10px',
          border: 'none', borderBottom: expanded ? '1px solid #F0EDE7' : 'none', background: 'transparent',
          textAlign: 'left', cursor: 'pointer' }}>
        <span style={{ fontSize: 17 }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#1A2B24', flex: 1 }}>{title}</span>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ color: '#8AA89C', fontSize: 13 }}>{expanded ? '收起 ▲' : '展开 ▼'}</span>
      </button>
      {expanded && <div style={{ padding: '12px 20px' }}>{children}</div>}
    </div>
  )
}
function AIArrEdit({ value, placeholder, onChange }) {
  return (
    <textarea className="form-control" rows={5} placeholder={placeholder}
      value={value} onChange={onChange}
      style={{ fontSize: 14, lineHeight: 1.7, minHeight: 125, resize: 'vertical', width: '100%' }} />
  )
}

function AIListLines({ items, color = '#4A6558' }) {
  if (!Array.isArray(items) || items.length === 0) return null
  return (
    <div style={{ marginTop: 4 }}>
      {items.map((item, index) => (
        <div key={`${index}-${item}`} style={{ fontSize: 13, lineHeight: 1.75, color, overflowWrap: 'anywhere' }}>
          · {item}
        </div>
      ))}
    </div>
  )
}

function AISectionSourceButton({ title, ids, onOpen }) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return <div style={{ fontSize: 12, color: '#B0B8B3', marginBottom: 10 }}>暂无可关联的原始材料</div>
  }
  return (
    <button type="button" className="btn btn-secondary btn-sm" style={{ marginBottom: 10 }}
      onClick={() => onOpen(title, ids)}>
      🔗 查看原始材料（{ids.length}份）
    </button>
  )
}

// AI健康分析讨论区：团队针对该年度分析提出疑问/补充信息，纯团队内部留言，AI不参与回复
function AISummaryDiscussionPanel({ patientId, year, recordIndex, discussions, staff, onRefresh, onPreviewImage, title = 'AI分析讨论', sectionKey }) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [images, setImages] = useState([]) // 已上传图片URL，如"AI认为某检查没做，实际做了"可截图说明
  const [uploadingImg, setUploadingImg] = useState(false)
  const [posting, setPosting] = useState(false)
  const [aiReplying, setAiReplying] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [applying, setApplying] = useState(false)
  const list = (Array.isArray(discussions) ? discussions : [])
    .map((item, originalIndex) => ({ ...item, originalIndex }))
    .filter(item => item.sectionKey === sectionKey)

  const handlePickImage = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingImg(true)
    try {
      const data = await staffAPI.uploadReportFile(file, () => {})
      setImages(prev => [...prev, data.url])
    } catch (err) { toast(err.message || '图片上传失败') }
    finally { setUploadingImg(false) }
  }

  const handlePost = async () => {
    if (!text.trim() && images.length === 0) return
    setPosting(true)
    try {
      await staffAPI.addAIHealthSummaryDiscussion(patientId, text.trim(), year, images, recordIndex, sectionKey)
      setText('')
      setImages([])
      onRefresh()
    } catch (err) { toast(err.message || '发布失败'); setPosting(false); return }
    // 发布成功后自动让AI接话，形成对话式讨论，无需再手动点按钮
    setAiReplying(true)
    try {
      await staffAPI.generateAIHealthSummaryReply(patientId, year, recordIndex, sectionKey)
      onRefresh()
    } catch (err) { toast(err.message || 'AI回应失败') }
    finally { setPosting(false); setAiReplying(false) }
  }

  const handleDelete = async (idx) => {
    if (!window.confirm('确认删除这条留言？')) return
    try {
      await staffAPI.deleteAIHealthSummaryDiscussion(patientId, idx, year, recordIndex)
      toast('已删除')
      onRefresh()
    } catch (err) { toast(err.message || '删除失败') }
  }

  const handleAiReply = async () => {
    setAiReplying(true)
    try {
      await staffAPI.generateAIHealthSummaryReply(patientId, year, recordIndex, sectionKey)
      toast('AI已回应')
      onRefresh()
    } catch (err) { toast(err.message || 'AI回应失败') }
    finally { setAiReplying(false) }
  }

  const handleApplyDiscussion = async () => {
    const label = {
      medical_priority: '需优先关注的信息', tumor_risk: '肿瘤筛查', cardiovascular_risk: '心脑血管',
      chronic_disease: '慢性病及其他指标', checkup_completeness: '体检资料覆盖', lifestyle_assessment: '生活方式分析',
    }[sectionKey]
    if (!window.confirm(`将参考本轮全部讨论和原始报告，局部重写“${label}”板块。其他板块不变，原审核状态将撤回为待审核。是否继续？`)) return
    setApplying(true)
    try {
      await staffAPI.applyAIHealthSummaryDiscussion(patientId, year, recordIndex, sectionKey)
      toast(`${label}已按讨论局部补提，请核对后重新审核`)
      await onRefresh()
    } catch (err) { toast(err.message || '局部补提失败') }
    finally { setApplying(false) }
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <button type="button" onClick={() => setExpanded(value => !value)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px 10px', border: 'none', borderBottom: expanded ? '1px solid #F0EDE7' : 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ fontSize: 17 }}>💬</span>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#1A2B24', flex: 1 }}>{title}</span>
        <span style={{ fontSize: 12, color: '#8AA89C' }}>{list.length} 条留言</span>
        <span style={{ fontSize: 12, color: '#8AA89C' }}>{expanded ? '收起 ▲' : '展开 ▼'}</span>
      </button>
      {expanded && <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.length === 0 ? (
          <div style={{ fontSize: 13, color: '#8AA89C' }}>暂无留言，对本年度分析有疑问或补充信息可在此讨论，也可让AI重新分析给出解释</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {list.map((d, i) => {
              const isOwner = staff?._id && d.staffId && String(d.staffId) === String(staff._id)
              return (
                <div key={i} style={{
                  background: d.isAI ? '#EFF8FF' : '#F9F6F0',
                  borderLeft: d.isAI ? '3px solid #0077B6' : 'none',
                  borderRadius: 8, padding: '10px 14px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: d.isAI ? '#0077B6' : '#4A6558' }}>
                      {d.isAI ? '✨ ' : ''}{d.staffName}{d.staffRole ? ` · ${d.staffRole}` : ''}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: '#8AA89C' }}>{d.createdAt ? new Date(d.createdAt).toLocaleString('zh-CN') : ''}</span>
                      {(isOwner || staff?.role === 'superadmin') && (
                        <span onClick={() => handleDelete(d.originalIndex)} style={{ fontSize: 11, color: '#DC3545', cursor: 'pointer' }}>删除</span>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: '#1A2B24', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{d.content}</div>
                  {Array.isArray(d.images) && d.images.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      {d.images.map((img, ii) => {
                        const src = img.startsWith('/') ? API_ORIGIN + img : img
                        return (
                          <img key={ii} src={src} alt="留言图片" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, cursor: 'zoom-in', border: '1px solid #E0D9CE' }}
                            onClick={() => onPreviewImage?.(src)} />
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {aiReplying && (
          <div style={{ fontSize: 12, color: '#0077B6', display: 'flex', alignItems: 'center', gap: 6 }}>✨ AI思考中...</div>
        )}
        {list.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-secondary btn-sm" disabled={aiReplying || posting || applying} onClick={handleAiReply}>
              {aiReplying ? '分析中...' : '✨ 让AI再想一次'}
            </button>
            <button className="btn btn-primary btn-sm" disabled={aiReplying || posting || applying} onClick={handleApplyDiscussion}>
              {applying ? '局部补提中...' : '↻ 按讨论局部补提'}
            </button>
          </div>
        )}
        {images.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {images.map((img, ii) => {
              const src = img.startsWith('/') ? API_ORIGIN + img : img
              return (
                <div key={ii} style={{ position: 'relative' }}>
                  <img src={src} alt="待发送图片" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid #E0D9CE' }} />
                  <span onClick={() => setImages(prev => prev.filter((_, x) => x !== ii))}
                    style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: '#DC3545', color: '#fff', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>✕</span>
                </div>
              )
            })}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <textarea className="form-input" rows={2} style={{ flex: 1, resize: 'vertical' }}
            placeholder="提出疑问、补充信息，AI会自动回复...（如某检查AI认为没做，实际已做，可截图说明）" value={text} onChange={e => setText(e.target.value)} />
          <label className="btn btn-secondary btn-sm" style={{ cursor: uploadingImg ? 'not-allowed' : 'pointer', opacity: uploadingImg ? 0.6 : 1 }}>
            {uploadingImg ? '上传中...' : '📷 图片'}
            <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploadingImg} onChange={handlePickImage} />
          </label>
          <button className="btn btn-primary btn-sm" disabled={posting || (!text.trim() && images.length === 0)} onClick={handlePost}>
            {posting ? (aiReplying ? 'AI回复中...' : '发布中...') : '发布'}
          </button>
        </div>
      </div>}
    </div>
  )
}

const PSYCH_SEVERITY_COLOR = {
  '正常': '#22A06B',
  '轻度嗜睡': '#D97706', '重度嗜睡': '#DC3545',
  '轻度焦虑': '#D97706', '中度焦虑': '#EA580C', '重度焦虑': '#DC3545',
  '轻度抑郁': '#D97706', '中度抑郁': '#EA580C', '重度抑郁': '#DC3545',
}

// SCL90 因子分正常/异常判定（与后端 psychScaleImport.assessScl90Factor 同一标准：因子均分≥2为阳性）
// 医护端现算，兼容旧数据（写入时未带 factorAssessment 的记录也能显示）
const SCL90_FACTOR_LEVEL = {
  normal:   { label: '正常', color: '#22A06B' },
  mild:     { label: '轻度', color: '#D97706' },
  moderate: { label: '中度', color: '#EA580C' },
  severe:   { label: '重度', color: '#DC3545' },
  unknown:  { label: '—',   color: '#8AA89C' },
}
function assessScl90Factor(score) {
  if (typeof score !== 'number' || Number.isNaN(score)) return 'unknown'
  if (score < 2) return 'normal'
  if (score < 3) return 'mild'
  if (score < 4) return 'moderate'
  return 'severe'
}

// 问卷无冲突自动写入档案的历史记录（折叠展示，避免占用过多篇幅）
function ArchiveAutoLogPanel({ log }) {
  const [open, setOpen] = useState(false)
  const entries = (log || []).slice().reverse() // 最新的在前
  if (entries.length === 0) return null
  return (
    <div style={{ marginBottom: 12, border: '1px solid #D8EDE3', borderRadius: 8, background: '#F6F9F7' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', cursor: 'pointer' }}
        onClick={() => setOpen(v => !v)}>
        <span style={{ fontSize: 13, color: '#4A6558' }}>✅ 问卷自动写入档案记录（{entries.length}次，无冲突项系统已直接写入）</span>
        <span style={{ fontSize: 12, color: '#aaa' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {entries.map((e, i) => (
            <div key={i} style={{ borderTop: '1px solid #E3EFE9', paddingTop: 8 }}>
              <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 4 }}>
                「{e.questionnaireTitle}」· {new Date(e.appliedAt).toLocaleString('zh-CN')}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(e.items || []).map((it, j) => (
                  <span key={j} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 99, background: '#fff', border: '1px solid #E0D9CE', color: '#4A6558' }}>
                    {it.label}：{it.valueStr}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ArchiveChangeLogPanel({ log }) {
  const [open, setOpen] = useState(true)
  const entries = (log || []).slice().reverse()
  if (entries.length === 0) return null
  return (
    <div style={{ marginBottom: 12, border: '1px solid #F4D58D', borderRadius: 8, background: '#FFF8E8' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', cursor: 'pointer' }} onClick={() => setOpen(v => !v)}>
        <span style={{ fontSize: 13, color: '#8A5A00', fontWeight: 600 }}>📝 客户健康档案变更记录（{entries.length}次）</span>
        <span style={{ fontSize: 12, color: '#8AA89C' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {entries.map((entry, index) => <div key={index} style={{ borderTop: '1px solid #F4E2B8', paddingTop: 8 }}>
          <div style={{ fontSize: 12, color: '#8AA89C' }}>{entry.changedByName || '客户本人'} · {entry.changedAt ? new Date(entry.changedAt).toLocaleString('zh-CN') : '时间未记录'}</div>
          <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(entry.items || []).map((item, itemIndex) => <div key={itemIndex} style={{ fontSize: 13, color: '#4A6558', overflowWrap: 'anywhere' }}>
              <strong>{item.label || item.path}：</strong>{String(item.from ?? '') || '未填写'} → {String(item.to ?? '') || '未填写'}
            </div>)}
          </div>
        </div>)}
      </div>}
    </div>
  )
}

// 健管专员确认写入档案的留痕（archive-draft/apply 每次写入的操作人+时间+字段，只读展示）
function ArchiveConfirmLogPanel({ log }) {
  const [open, setOpen] = useState(false)
  const entries = (log || []).slice().reverse() // 最新的在前
  if (entries.length === 0) return null
  return (
    <div style={{ marginBottom: 12, border: '1px solid #E0D9CE', borderRadius: 8, background: '#FAFAF8' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', cursor: 'pointer' }}
        onClick={() => setOpen(v => !v)}>
        <span style={{ fontSize: 13, color: '#4A6558' }}>📋 档案确认写入记录（{entries.length}次，健管专员人工审核确认）</span>
        <span style={{ fontSize: 12, color: '#aaa' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {entries.map((e, i) => (
            <div key={i} style={{ borderTop: '1px solid #E3EFE9', paddingTop: 8 }}>
              <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 4 }}>
                {e.confirmedByName || '未知'} 确认 · {new Date(e.confirmedAt).toLocaleString('zh-CN')}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(e.items || []).map((it, j) => (
                  <span key={j} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 99, background: '#fff', border: '1px solid #E0D9CE', color: '#4A6558' }}>
                    {it.path}：{it.value}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// 心理健康量表结果（Epworth/SCL90/SDS/SAS，问卷推送会员自填→自动计分写入，只读展示）
const PSYCH_SCALE_META = {
  epworth: { name: 'Epworth 嗜睡量表' },
  scl90:   { name: 'SCL90 症状自评量表' },
  sds:     { name: 'SDS 抑郁自评量表' },
  sas:     { name: 'SAS 焦虑自评量表' },
}

// 兼容旧数据：无 byYear 的扁平量表结果（{totalScore, filledAt, ...}）归入其填写年份
function psychByYear(raw) {
  if (!raw) return {}
  if (raw.byYear) return raw.byYear
  if (raw.totalScore !== undefined) {
    const y = String(raw.filledAt ? new Date(raw.filledAt).getFullYear() : new Date().getFullYear())
    return { [y]: raw }
  }
  return {}
}

function PsychAssessmentPanel({ user }) {
  const [expandedKeys, setExpandedKeys] = useState({}) // { [scaleKey]: bool } 每个量表独立展开
  const [scaleYear, setScaleYear] = useState({})        // { [scaleKey]: '2026' } 每个量表独立年度
  const assessments = user.psychAssessments || {}
  const nowY = new Date().getFullYear()
  const entries = Object.entries(PSYCH_SCALE_META)
    .map(([key, meta]) => {
      const byYear = psychByYear(assessments[key])
      const years = Object.keys(byYear).sort((a, b) => Number(b) - Number(a))
      const curYear = (scaleYear[key] && years.includes(scaleYear[key])) ? scaleYear[key] : years[0]
      return { key, meta, byYear, years, curYear, result: byYear[curYear] }
    })

  const hasAny = entries.some(e => e.result)
  const toggle = (key) => setExpandedKeys(v => ({ ...v, [key]: !v[key] }))

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}><AppIcon name="brain" size={17} />心理健康评估</div>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!hasAny && (
          <div style={{ color: '#8AA89C', fontSize: 13 }}>暂无心理健康评估记录，可在问卷库推送相应量表给该会员</div>
        )}
        {entries.filter(e => e.result).map(({ key, meta, result, years, curYear }) => {
          const color = PSYCH_SEVERITY_COLOR[result.severity] || '#8AA89C'
          const expanded = !!expandedKeys[key]
          const answersDetail = result.answersDetail || []
          const factorScores = result.factorScores || {}
          const hasFactor = key === 'scl90' && Object.keys(factorScores).length > 0
          const hasDetail = answersDetail.length > 0
          const canExpand = hasFactor || hasDetail
          return (
            <div key={key} style={{ border: '1px solid #F0EDE7', borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', cursor: canExpand ? 'pointer' : 'default', flexWrap: 'wrap', gap: 8 }}
                onClick={() => canExpand && toggle(key)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{meta.name}</span>
                  <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 99, background: color + '15', color, fontWeight: 600 }}>
                    {result.totalScore}分{result.severity ? ` · ${result.severity}` : ''}
                  </span>
                  <span style={{ fontSize: 12, color: '#8AA89C' }}>{new Date(result.filledAt).toLocaleDateString('zh-CN')}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {years.length > 0 && (
                    <div style={{ display: 'flex', gap: 3 }} onClick={e => e.stopPropagation()}>
                      {years.map(y => (
                        <button key={y} onClick={() => setScaleYear(v => ({ ...v, [key]: y }))}
                          style={{
                            border: 'none', borderRadius: 5, padding: '1px 7px', fontSize: 11, cursor: years.length > 1 ? 'pointer' : 'default',
                            background: y === curYear ? '#1E6B50' : '#F5F2EC',
                            color: y === curYear ? '#fff' : '#4A6558',
                          }}>{y}年</button>
                      ))}
                    </div>
                  )}
                  {canExpand && <span style={{ fontSize: 12, color: '#aaa' }}>{expanded ? '▲' : '▼'}</span>}
                </div>
              </div>

              {expanded && (
                <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* SCL90 因子分 + 正常/异常判定 */}
                  {hasFactor && (
                    <div>
                      <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 6 }}>各因子得分（因子均分≥2为异常，分数越高症状越明显）</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {Object.entries(factorScores).map(([factor, score]) => {
                          // 优先用后端写入的判定，旧数据则前端现算
                          const lvKey = result.factorAssessment?.[factor]?.level || assessScl90Factor(score)
                          const lv = SCL90_FACTOR_LEVEL[lvKey] || SCL90_FACTOR_LEVEL.unknown
                          return (
                            <span key={factor} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 8, background: lv.color + '12', color: lv.color, fontWeight: 500, border: `1px solid ${lv.color}30` }}>
                              {factor} {score} · {lv.label}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* 逐题作答明细 */}
                  {hasDetail ? (
                    <div>
                      <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 6 }}>逐题作答情况（共{answersDetail.length}题）</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {answersDetail.map((it, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, lineHeight: 1.5 }}>
                            <span style={{ color: '#8AA89C', minWidth: 22 }}>{i + 1}.</span>
                            <span style={{ flex: 1, color: '#4A6558' }}>
                              {it.factor ? <span style={{ color: '#8AA89C' }}>[{it.factor}] </span> : ''}
                              {it.question}
                            </span>
                            <span style={{ color: '#1A2B24', fontWeight: 500, whiteSpace: 'nowrap' }}>
                              {it.answer}{typeof it.score === 'number' ? `（${it.score}分）` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: '#B0A99C' }}>该记录为旧版数据，暂无逐题明细；客户下次填写该量表后即可查看每道题作答情况。</div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 10年ASCVD风险评估面板（医护录入体检参数→中国指南自动分层，展示在心理评估下方）──
const ASCVD_LEVEL_COLOR = {
  low:    { label: '低危', color: '#22A06B', bg: '#F0FDF4' },
  medium: { label: '中危', color: '#D97706', bg: '#FEF9EC' },
  high:   { label: '高危', color: '#DC3545', bg: '#FEF2F2' },
}
function AscvdRiskPanel({ user, patientId, onSaved, toast }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expandedIdx, setExpandedIdx] = useState(null) // 展开查看详情的记录下标（该年度内），null=全部收起只看摘要行

  // 兼容旧数据：早期版本 ascvdRisk 是单个扁平对象（无byYear），或byYear下每年是单条扁平结果（无records数组）。
  // 统一归一化成 { [year]: { records: [...] } }，2026-07-17改：支持同年内新增多条评估，不再互相覆盖
  const byYear = (() => {
    const raw = user.ascvdRisk || null
    if (!raw) return {}
    let by = {}
    if (raw.byYear) by = raw.byYear
    else if (raw.level) {
      const y = raw.evaluatedAt ? String(new Date(raw.evaluatedAt).getFullYear()) : String(new Date().getFullYear())
      by = { [y]: raw }
    }
    const normalized = {}
    Object.entries(by).forEach(([y, entry]) => {
      if (!entry) return
      normalized[y] = { records: Array.isArray(entry.records) ? entry.records : [entry] }
    })
    return normalized
  })()

  const nowY = String(new Date().getFullYear())
  // 年度标签只展示实际已有评估的年份，一条评估都没有时不展示任何年份（避免凭空出现当前年占位）
  const years = Object.keys(byYear).sort((a, b) => Number(b) - Number(a))
  const [year, setYear] = useState(null)
  const curYear = (year && years.includes(year)) ? year : (years[0] || nowY)
  // 该年度全部评估记录，按评估日期新→旧排序；result 兼容旧渲染逻辑，始终指向最新一条
  const records = [...(byYear[curYear]?.records || [])].sort((a, b) => new Date(b.evaluatedAt || 0) - new Date(a.evaluatedAt || 0))
  const result = records[0] || null

  // 从档案预填性别/年龄，其余体检值默认空
  const genderInit = user.gender === '女' ? 'female' : user.gender === '男' ? 'male' : 'male'
  const todayStr = () => new Date().toISOString().slice(0, 10)
  const blankForm = () => ({
    gender: genderInit,
    age: user.age || '',
    tc: '', ldl: '', hdl: '',
    sbp: '', dbp: '', bmi: '',
    onHypertensionTreatment: false,
    smoking: false, diabetes: false, ckdStage34: false,
    evaluatedAt: todayStr(),
  })
  const [form, setForm] = useState(blankForm)

  // 新增评估：不再预填上一条的数值（新增≠修改上一条，体检参数应重新录入当次实际值）
  const openEdit = () => { setForm(blankForm()); setEditing(true) }

  const handleSave = async () => {
    if (!form.age || !form.sbp || (!form.tc && !form.ldl)) {
      toast('请至少填写年龄、收缩压，以及总胆固醇或LDL-C'); return
    }
    setSaving(true)
    try {
      const evalYear = String(new Date(form.evaluatedAt || todayStr()).getFullYear())
      await staffAPI.saveAscvdRisk(patientId, { ...form, year: evalYear })
      toast(`${evalYear}年度 ASCVD风险评估已保存`)
      setEditing(false)
      setYear(evalYear)
      setExpandedIdx(0)
      onSaved()
    } catch (err) { toast(err.message || '保存失败') }
    finally { setSaving(false) }
  }

  const handleDeleteRecord = async (idx) => {
    if (!window.confirm('确认删除这条评估记录？')) return
    try { await staffAPI.deleteAscvdRisk(patientId, curYear, idx); onSaved() }
    catch (err) { toast(err.message || '删除失败') }
  }

  const lv = result ? (ASCVD_LEVEL_COLOR[result.level] || ASCVD_LEVEL_COLOR.low) : null
  const numField = (label, key, unit) => (
    <div>
      <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 3, whiteSpace: 'nowrap' }}>{label}{unit ? `（${unit}）` : ''}</label>
      <input className="form-control" type="number" step="0.01" value={form[key]} style={{ width: '100%' }}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
    </div>
  )

  return (
    <div className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
      <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div className="card-title" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 7 }}><AppIcon name="heart" size={17} />10年ASCVD风险评估</div>
        {/* 年度切换：只列出已有评估的年份，一份评估都没有时不展示 */}
        {!editing && years.length > 0 && (
          <div style={{ display: 'flex', gap: 4 }}>
            {years.map(y => (
              <button key={y} onClick={() => setYear(y)}
                style={{
                  border: 'none', borderRadius: 6, padding: '3px 10px', fontSize: 12, cursor: 'pointer',
                  background: y === curYear ? '#1E6B50' : '#F5F2EC',
                  color: y === curYear ? '#fff' : '#4A6558',
                  fontWeight: y === curYear ? 700 : 400,
                }}>
                {y}{byYear[y] ? ' ●' : ''}
              </button>
            ))}
          </div>
        )}
        {!editing && (
          <div style={{ display: 'flex', gap: 6 }}>
            {/* 可能需要多次评估（如调理后复查），不再是"重新评估"覆盖旧结果，改成始终"新增评估" */}
            <button className="btn btn-secondary btn-sm" onClick={openEdit}>＋ 新增评估</button>
          </div>
        )}
      </div>
      <div className="card-body">
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 3 }}>评估日期</label>
              <input className="form-control" type="date" value={form.evaluatedAt}
                onChange={e => setForm(f => ({ ...f, evaluatedAt: e.target.value }))} style={{ width: 180 }} />
            </div>
            <div style={{ background: '#FAFAF8', border: '1px solid #F0EDE7', borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* 2026-07-09修复金娟"界面看不到全局要键盘左右移动才能找到按键"：原固定 repeat(3, 230px)=690px 网格
                  在窄容器里会横向溢出，把靠右的"计算并保存"按钮挤出视口。改用 auto-fit 自适应，列数随容器宽度换行，
                  按钮永远在可视区内。 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 3, whiteSpace: 'nowrap' }}>性别</label>
                  <select className="form-control" style={{ width: '100%' }} value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
                    <option value="male">男</option>
                    <option value="female">女</option>
                  </select>
                </div>
                {numField('年龄', 'age', '岁')}
                {numField('收缩压', 'sbp', 'mmHg')}
                {numField('舒张压', 'dbp', 'mmHg')}
                {numField('总胆固醇 TC', 'tc', 'mmol/L')}
                {numField('低密度脂蛋白 LDL-C', 'ldl', 'mmol/L')}
                {numField('高密度脂蛋白 HDL-C', 'hdl', 'mmol/L')}
                {numField('体质指数 BMI', 'bmi', 'kg/m²')}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', background: '#f9f7f3', borderRadius: 8, padding: '10px 14px' }}>
              <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.smoking} onChange={e => setForm(f => ({ ...f, smoking: e.target.checked }))} /> 吸烟
              </label>
              <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.diabetes} onChange={e => setForm(f => ({ ...f, diabetes: e.target.checked }))} /> 糖尿病
              </label>
              <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.onHypertensionTreatment} onChange={e => setForm(f => ({ ...f, onHypertensionTreatment: e.target.checked }))} /> 正在降压治疗
              </label>
              <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.ckdStage34} onChange={e => setForm(f => ({ ...f, ckdStage34: e.target.checked }))} /> 慢性肾脏病(CKD) 3~4期
              </label>
            </div>
            <div style={{ fontSize: 11, color: '#B0A99C' }}>
              依据《中国血脂管理指南（2023年）》图1"中国成人ASCVD总体发病风险评估流程图"完整校准，含直接高危判定、21格查表矩阵及余生风险判定（10年中危且年龄&lt;55岁时触发）。
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>{saving ? '计算中...' : '计算并保存'}</button>
            </div>
          </div>
        ) : records.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {records.map((r, idx) => {
              const rLv = ASCVD_LEVEL_COLOR[r.level] || ASCVD_LEVEL_COLOR.low
              const isExpanded = expandedIdx === idx || (expandedIdx === null && idx === 0)
              const dateLabel = r.evaluatedAt ? new Date(r.evaluatedAt).toLocaleDateString('zh-CN') : '-'
              return (
                <div key={idx} style={{ border: '1px solid #F0EDE7', borderRadius: 10, overflow: 'hidden' }}>
                  {/* 摘要行：始终显示日期+等级，点击展开/收起完整详情，多条评估历史一目了然 */}
                  <div onClick={() => setExpandedIdx(isExpanded ? -1 : idx)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', background: isExpanded ? rLv.bg : '#FAFAF8' }}>
                    <span style={{
                      width: 30, height: 30, borderRadius: '50%', flexShrink: 0, background: rLv.color, color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800,
                    }}>{r.levelLabel}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: rLv.color, flex: 1 }}>{r.description}</span>
                    <span style={{ fontSize: 12, color: '#8AA89C' }}>{dateLabel}{r.evaluatedBy ? ` · ${r.evaluatedBy}` : ''}</span>
                    <span style={{ fontSize: 12, color: '#1E6B50' }}>{isExpanded ? '收起 ▲' : '展开 ▼'}</span>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {r.directHighRisk && (
                        <div style={{ fontSize: 12, color: '#DC3545' }}>⚠ 直接判定高危：{r.directHighRisk}</div>
                      )}
                      {/* 危险因素 */}
                      {Array.isArray(r.riskFactors) && r.riskFactors.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 4 }}>危险因素</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {r.riskFactors.map((f, i) => (
                              <span key={i} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 99, background: '#F5F2EC', color: '#4A6558' }}>{f}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* 建议 */}
                      {r.advice && (
                        <div style={{ fontSize: 13, color: '#1E6B50', background: '#E8F5EF', borderRadius: 8, padding: '10px 14px', lineHeight: 1.6 }}>
                          💡 {r.advice}
                        </div>
                      )}
                      {/* 录入参数：网格化，替代原来一长串文字 */}
                      <div style={{ borderTop: '1px dashed #E0D9CE', paddingTop: 10 }}>
                        <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 6 }}>录入参数</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8 }}>
                          {[
                            ['性别', r.inputs.gender === 'female' ? '女' : '男'],
                            ['年龄', `${r.inputs.age}岁`],
                            ['收缩压', `${r.inputs.sbp} mmHg`],
                            ['舒张压', r.inputs.dbp ? `${r.inputs.dbp} mmHg` : '-'],
                            ['TC', r.inputs.tc ?? '-'],
                            ['LDL-C', r.inputs.ldl ?? '-'],
                            ['HDL-C', r.inputs.hdl ?? '-'],
                            ['BMI', r.inputs.bmi ?? '-'],
                          ].map(([k, v]) => (
                            <div key={k} style={{ background: '#f9f7f3', borderRadius: 6, padding: '5px 8px', textAlign: 'center' }}>
                              <div style={{ fontSize: 10, color: '#aaa' }}>{k}</div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#1A2B24' }}>{v}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ fontSize: 11, color: '#B0A99C', marginTop: 8 }}>
                          {r.inputs.smoking ? '吸烟 · ' : ''}{r.inputs.diabetes ? '糖尿病 · ' : ''}{r.inputs.ckdStage34 ? 'CKD 3~4期 · ' : ''}
                          {r.evaluatedBy ? `由${r.evaluatedBy}评估` : ''}{dateLabel !== '-' ? ` · ${dateLabel}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc' }}
                          onClick={() => handleDeleteRecord(idx)}>删除这条记录</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: '#8AA89C', textAlign: 'center', padding: '20px 0' }}>
            {years.length > 0 ? `${curYear} 年度尚未评估` : '尚未评估'}。点击「新增评估」，填写体检参数后系统将按中国指南自动分层。
          </div>
        )}
      </div>
    </div>
  )
}

export default function PatientDetailPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const { staff } = useStaff()
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState(null) // 加载会员详情失败时的具体原因（区分"无权限查看"和"会员不存在"，2026-07-13 修复：此前统一误显示成"会员不存在"）
  const [loading, setLoading] = useState(true)
  const requestedTab = new URLSearchParams(location.search).get('tab') || 'info'
  const initialTab = requestedTab
  const [tab, setTab] = useState(initialTab === 'requisitions' ? 'info' : initialTab)
  const archiveSectionsRef = useRef(null)
  const [followUps, setFollowUps] = useState([])
  const [plans, setPlans] = useState([])
  const [reports, setReports] = useState([])
  const [serviceRecords, setServiceRecords] = useState([])
  const [serviceRecordCategory, setServiceRecordCategory] = useState('营养干预')
  const [patientReferrals, setPatientReferrals] = useState([])
  const [expandedReferralCats, setExpandedReferralCats] = useState({})
  const [reportSearchKw, setReportSearchKw] = useState('')
  const [reportYearFilter, setReportYearFilter] = useState('')
  const [reportTaskFilter, setReportTaskFilter] = useState('all')
  const [reportMissingOnly, setReportMissingOnly] = useState(false)
  const [reportPage, setReportPage] = useState(1)
  const [openReportActionId, setOpenReportActionId] = useState(null)
  const [showMoreTabs, setShowMoreTabs] = useState(false)
  const [patientOrders, setPatientOrders] = useState([])
  const [redeemingOrderId, setRedeemingOrderId] = useState(null)
  const [requisitions, setRequisitions] = useState([])
  const [showReqModal, setShowReqModal] = useState(false)
  const [showReferralModal, setShowReferralModal] = useState(false)
  const [showReportDetail, setShowReportDetail] = useState(null)
  const [reportDetailLoading, setReportDetailLoading] = useState(false)
  const [showSRDetail, setShowSRDetail] = useState(null)
  const [reviewingDraft, setReviewingDraft] = useState(null)
  const [staffList, setStaffList] = useState([])
  const [assigningFulfillerOrder, setAssigningFulfillerOrder] = useState(null)
  const [fulfillerChoice, setFulfillerChoice] = useState('')
  const [showFollowUpModal, setShowFollowUpModal] = useState(false)
  const [followUpDetail, setFollowUpDetail] = useState(null)
  const [editingFollowUp, setEditingFollowUp] = useState(null)
  const [followUpSaving, setFollowUpSaving] = useState(false)
  const [showUploadReport, setShowUploadReport] = useState(false)
  const [showMessageModal, setShowMessageModal] = useState(() => new URLSearchParams(location.search).get('openChat') === '1')
  const [auditLoading, setAuditLoading] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [editingBasicInfo, setEditingBasicInfo] = useState(false)
  const [basicInfoForm, setBasicInfoForm] = useState({})
  const [editingHealthNeeds, setEditingHealthNeeds] = useState(false)
  const [healthNeedsForm, setHealthNeedsForm] = useState({})
  const [editingReport, setEditingReport] = useState(null)
  const [editingReportForm, setEditingReportForm] = useState({})
  const [editingReportSaving, setEditingReportSaving] = useState(false)
  const [editingHealth, setEditingHealth] = useState(false)
  const [editingLifestyle, setEditingLifestyle] = useState(false)
  const [showLifestyleChangeModal, setShowLifestyleChangeModal] = useState(false)
  const [lifestyleChangeSaving, setLifestyleChangeSaving] = useState(false)
  const [lifestyleChangeForm, setLifestyleChangeForm] = useState({ changes: {}, effectiveAt: new Date().toISOString().slice(0, 10), healthStatusChange: '' })
  const [editingInsurance, setEditingInsurance] = useState(false)
  const [healthForm, setHealthForm] = useState({})
  const [lifestyleForm, setLifestyleForm] = useState({})
  const [insuranceForm, setInsuranceForm] = useState({})
  // 药物 & 营养素
  const [medications, setMedications] = useState([])
  const [supplements, setSupplements] = useState([])
  const [medSubTab, setMedSubTab] = useState('med') // 'med' | 'sup'
  const [aiSupGenerating, setAiSupGenerating] = useState(false)
  const [aiExamSuggesting, setAiExamSuggesting] = useState(false)
  const [aiNutritionGenerating, setAiNutritionGenerating] = useState(false)
  const [aiCheckupGenerating, setAiCheckupGenerating] = useState(false)
  const [aiMedicalAssistGenerating, setAiMedicalAssistGenerating] = useState(false)
  // 三类方案生成前先选模板：值为要打开的弹窗类型('annual_checkup'|'nutrition'|'medical_assist')或null
  const [showSelectTplModal, setShowSelectTplModal] = useState(null)
  const [pendingMedicalAssistOrderId, setPendingMedicalAssistOrderId] = useState('') // 手动点按钮生成时若有关联订单，带给选模板弹窗
  const [autoGenMedicalAssistOrderId, setAutoGenMedicalAssistOrderId] = useState(null) // 非null时代表从工作台商城订单待办跳转过来，服务名已能唯一定模板，自动触发AI生成一次
  const [reqPrefill, setReqPrefill] = useState(null)
  const [showMedModal, setShowMedModal] = useState(false)
  const [showSupModal, setShowSupModal] = useState(false)
  const [editingMed, setEditingMed] = useState(null)
  const [editingSup, setEditingSup] = useState(null)
  const [stoppingMed, setStoppingMed] = useState(null) // 待确认停用的用药记录
  const [reminderMed, setReminderMed] = useState(null)
  const [reminderForm, setReminderForm] = useState({ intervalDays: 30, startDate: '', endDate: '', remindTime: '09:00', note: '' })
  const [reminderSaving, setReminderSaving] = useState(false)
  const [stoppingSup, setStoppingSup] = useState(null) // 待确认停用的营养素记录
  const [editingSupAiApprove, setEditingSupAiApprove] = useState(false)
  const [followUpFilter, setFollowUpFilter] = useState('all') // all | pending | done
  const [expandedMonitorGroups, setExpandedMonitorGroups] = useState({}) // 随访记录表格里日常监测折叠组的展开状态，key: theme+status
  // 执行随访（填写随访结果、标记完成/随访中），逻辑与 FollowUpsPage.jsx 的 execItem/execForm 一致
  const [execItem, setExecItem] = useState(null)
  const [execForm, setExecForm] = useState({ type: 'phone', content: '', status: 'completed' })
  const [execSaving, setExecSaving] = useState(false)
  const [execDraftLoading, setExecDraftLoading] = useState(false)
  const [medForm, setMedForm] = useState({})
  const [supForm, setSupForm] = useState({})
  const [medSaving, setMedSaving] = useState(false)
  // 健康顾问健康档案查看确认（2026-07-28改造）：不再逐份审核报告数据，改为客户维度的
  // "确认已查看健康档案"，AI健康解析/风险评估生成前强制要求此确认处于有效状态（未过期）。
  // pendingDoctorAuditReports 仍保留为"有哪些新审核完的报告需要提醒"的展示用途。
  //
  // 2026-07-28补充修复：最初"确认已查看"是个孤立按钮，点一下就直接标记完成，健康顾问完全
  // 可以不看任何内容就点掉，是假确认。改为强制交互：先弹出待查看报告清单，要求逐份点开
  // （复用 openReportDetail 已有的报告详情弹窗），全部点开过之后"确认已查看"才从禁用变可点。
  //
  // 2026-07-28再修复：单份报告的"已查看"最初只存在前端本地state（archiveReviewViewedIds），
  // 没有写后端，导致中途退出（没点最后的"确认已查看"整体按钮）后重新进入，刚查看过的报告
  // 又变回"待查看"——用户已经真实看过内容，却被要求重新看一遍。改为后端持久化：点开单份
  // 报告时调用 familyDoctorViewReport 写入 MedicalReport.familyDoctorViewedAt，"是否已查看"
  // 直接读这个字段判断，不再依赖任何前端本地state。
  const [pendingDoctorAuditReports, setPendingDoctorAuditReports] = useState([])
  const [archiveReviewSaving, setArchiveReviewSaving] = useState(false)
  const [showArchiveReviewModal, setShowArchiveReviewModal] = useState(false)
  const loadPendingDoctorAudit = () => {
    staffAPI.getPendingDoctorAuditReports(id).then(r => {
      setPendingDoctorAuditReports(r.data || [])
    }).catch(() => {})
  }
  const markArchiveReviewViewed = (reportId) => {
    // 立即持久化到后端，同时乐观更新本地列表，避免等接口返回才刷新体验卡顿
    staffAPI.markReportFamilyDoctorViewed(reportId).catch(() => {})
    setPendingDoctorAuditReports(prev => prev.map(r => r._id === reportId ? { ...r, familyDoctorViewedAt: new Date().toISOString() } : r))
  }
  const allArchiveReviewViewed = pendingDoctorAuditReports.length > 0
    && pendingDoctorAuditReports.every(r => !!r.familyDoctorViewedAt)
  const handleConfirmArchiveReview = () => {
    if (archiveReviewSaving || !allArchiveReviewViewed) return
    setArchiveReviewSaving(true)
    staffAPI.confirmArchiveReview(id)
      .then(() => { toast('已确认查看健康档案'); setShowArchiveReviewModal(false); loadPendingDoctorAudit(); load() })
      .catch(err => toast(err.message || '操作失败'))
      .finally(() => setArchiveReviewSaving(false))
  }
  // 专项筛查三层目录（动态加载）
  const [screeningTree, setScreeningTree] = useState([])
  // 专项筛查 L1/L2 横向 tab 激活状态
  const [screeningActiveL1, setScreeningActiveL1] = useState(null)  // l1key 或 '__other__'
  const [screeningActiveL2s, setScreeningActiveL2s] = useState({})
  // 专项筛查 & 打卡记录
  const [screeningItems, setScreeningItems] = useState([])
  const [screeningReports, setScreeningReports] = useState([])
  const [showScreeningForm, setShowScreeningForm] = useState(false)
  const [screeningForm, setScreeningForm] = useState({ title: '', screeningCategory: '', screeningL1: '', screeningL2: '', screeningL3: '', screeningL3Items: [], checkDate: '', hospital: '', note: '', reportItems: [], examOrderItems: [], funcTestItems: [], examDescription: '', examConclusion: '', linkedItemType: null })
  const [screeningYearSummaries, setScreeningYearSummaries] = useState([])
  const [screeningSummaryYear, setScreeningSummaryYear] = useState(new Date().getFullYear())
  const [screeningSummaryExpanded, setScreeningSummaryExpanded] = useState(true)
  const [screeningSectionExpanded, setScreeningSectionExpanded] = useState({})
  const [screeningSummaryBusy, setScreeningSummaryBusy] = useState(false)
  const [editingScreeningSummary, setEditingScreeningSummary] = useState(null)
  const [screeningSummaryRecordIndex, setScreeningSummaryRecordIndex] = useState(0)
  const [screeningSummaryEditMode, setScreeningSummaryEditMode] = useState('new')
  const [screeningFiles, setScreeningFiles] = useState([])
  const [screeningSaving, setScreeningSaving] = useState(false)
  const [screeningSearchQ, setScreeningSearchQ] = useState('')
  const [screeningSearchResults, setScreeningSearchResults] = useState([])
  const [screeningSearching, setScreeningSearching] = useState(false)
  const [screeningAutoMatches, setScreeningAutoMatches] = useState([])  // L3选完后自动匹配的后台项目
  const [screeningSuggestKey, setScreeningSuggestKey] = useState(null) // 'lab-0' | 'exam-1' | 'func-2'
  const screeningL2SuggestData = useMemo(() => {
    if (!screeningForm.screeningL1 || !screeningForm.screeningL2) return null
    const l1 = screeningTree.find(n => String(n._id) === screeningForm.screeningL1)
    const l2 = l1?.children?.find(c => c.label === screeningForm.screeningL2)
    return {
      labOrders: (l2?.labOrders || []).map(o => typeof o === 'string' ? { name: o, subItems: [] } : o),
      examItems: (l2?.examItems || []).map(x => typeof x === 'string' ? { name: x, description: '', conclusion: '' } : x),
      funcItems: (l2?.funcItems || []).filter(Boolean)
    }
  }, [screeningTree, screeningForm.screeningL1, screeningForm.screeningL2])
  const [screeningAutoLoading, setScreeningAutoLoading] = useState(false)
  const [screeningLinkedItem, setScreeningLinkedItem] = useState(null)  // 已关联的后台项目
  const [expandedRecords, setExpandedRecords] = useState(() => new Set()) // 展开详情的记录 _id 集合，支持多条同时展开对比
  const [expandedExamKey, setExpandedExamKey] = useState(null) // 展开的检查医嘱子项 key
  const [editingScreeningId, setEditingScreeningId] = useState(null) // 编辑中的记录 _id
  const [previewImageUrl, setPreviewImageUrl] = useState(null) // 灯箱预览：字符串=仅查看，{url,reportId}=可旋转保存
  const [previewRotation, setPreviewRotation] = useState(0) // 灯箱当前旋转角度（0/90/180/270）
  const [previewSaving, setPreviewSaving] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null) // 正在修正的打卡记录（数据有疑问时医护端修改，留痕修改人）
  const [editRecordForm, setEditRecordForm] = useState({ value: '', sys: '', dia: '', note: '' })
  const [editRecordSaving, setEditRecordSaving] = useState(false)
  const screeningSearchTimer = useRef(null)
  const [healthRecords, setHealthRecords] = useState([])

  useEffect(() => {
    if (tab !== 'records' || !archiveSectionsRef.current) return
    archiveSectionsRef.current.querySelectorAll('.card').forEach(card => {
      const header = Array.from(card.children).find(child => child.classList?.contains('card-header'))
      if (header) {
        header.dataset.archiveToggle = 'true'
        header.title = '点击收起或展开此板块'
        if (!card.dataset.archiveInitialized) {
          card.classList.add('archive-collapsed')
          card.dataset.archiveInitialized = 'true'
        }
      }
    })
  }, [tab, data, healthRecords])

  const handleArchiveSectionClick = (event) => {
    if (event.target.closest('button, a, input, select, textarea, label')) return
    const header = event.target.closest('.card-header[data-archive-toggle="true"]')
    if (!header || !archiveSectionsRef.current?.contains(header)) return
    header.parentElement?.classList.toggle('archive-collapsed')
  }

  const setAllArchiveSections = (collapsed) => {
    archiveSectionsRef.current?.querySelectorAll('.card').forEach(card => {
      const header = Array.from(card.children).find(child => child.classList?.contains('card-header'))
      if (header) card.classList.toggle('archive-collapsed', collapsed)
    })
  }
  const [editingSymptom, setEditingSymptom] = useState(null)
  const [addingSymptom, setAddingSymptom] = useState(false)
  const [newSymptomForm, setNewSymptomForm] = useState({ value: '', note: '', recordedAt: '' })
  const [newSymptomSaving, setNewSymptomSaving] = useState(false)
  const [symptomForm, setSymptomForm] = useState({ value: '', note: '', decisionNote: '' })
  const [symptomActionSaving, setSymptomActionSaving] = useState(false)
  const [expandedSymptoms, setExpandedSymptoms] = useState(() => new Set())
  const [riskEvidenceModal, setRiskEvidenceModal] = useState(null)
  // 管理信息下拉选项：服务包(admin商城服务) + 会员来源(admin配置)，替代手工录入（2026-07-10 金娟）
  const [serviceOptions, setServiceOptions] = useState([])
  const [memberTypeOptions, setMemberTypeOptions] = useState([])
  const [memberSourceOptions, setMemberSourceOptions] = useState([])
  // 趋势图
  const [trendRecords, setTrendRecords] = useState(null) // null=未加载，[]+=已加载
  const [trendLoading, setTrendLoading] = useState(false)
  const [trendStartDate, setTrendStartDate] = useState('')
  const [trendEndDate, setTrendEndDate] = useState('')
  const [showAllLab, setShowAllLab] = useState(false)
  // 健康评分
  const [scoreLoading, setScoreLoading] = useState(false)
  const [editingLabValues, setEditingLabValues] = useState(false)
  const [labNewRecord, setLabNewRecord] = useState(false) // true=新增记录 false=编辑当前
  const [labForm, setLabForm] = useState({})
  // 单项修改体检关键指标（直接改来源报告的 reportItem，不依赖AI重跑）
  const [editingMetric, setEditingMetric] = useState(null) // { key, reportId, itemName, label }
  const [editingMetricVal, setEditingMetricVal] = useState('')
  const [savingMetric, setSavingMetric] = useState(false)
  const [expandedMetricHistory, setExpandedMetricHistory] = useState({})
  const [editingDiseaseSeverity, setEditingDiseaseSeverity] = useState(false)
  const [severityForm, setSeverityForm] = useState({})
  const [showTagEditor, setShowTagEditor] = useState(false)
  const [tagEditorDiseases, setTagEditorDiseases] = useState({ tumor_risk: [], cardiovascular_risk: [], chronic_disease: [] })
  const [tagEditorInput, setTagEditorInput] = useState({ tumor_risk: '', cardiovascular_risk: '', chronic_disease: '' })
  const [tagSaving, setTagSaving] = useState(false)
  // 4.2 身体成分
  const [editingBodyComp, setEditingBodyComp] = useState(false)
  const [bodyCompNewRecord, setBodyCompNewRecord] = useState(false)
  const [bodyCompForm, setBodyCompForm] = useState({})
  const [editingHistoryIndex, setEditingHistoryIndex] = useState(null)
  const [historyEditForm, setHistoryEditForm] = useState({})
  // 4.4 AI健康汇总
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false)
  const [parsingReportId, setParsingReportId] = useState(null)
  const [editingAISummary, setEditingAISummary] = useState(false)
  const [editingAISection, setEditingAISection] = useState('')
  const [aiSummaryForm, setAiSummaryForm] = useState({})
  const [aiYear, setAiYear] = useState(null)        // 当前查看的AI健康分析年度
  const [aiRecordIndex, setAiRecordIndex] = useState({ doctor: 0, nutrition: 0 })
  const [aiAnalysisView, setAiAnalysisView] = useState('doctor')
  const [lastRegeneratedItem, setLastRegeneratedItem] = useState('')
  const [aiSourceGroup, setAiSourceGroup] = useState(null) // { title, ids }
  // 场景八：健康关注提示（内部沿用既有风险数据结构）
  const [riskYear, setRiskYear] = useState(null)             // 当前查看的AI风险评估年度
  const [riskGenerating, setRiskGenerating] = useState(false)
  const [riskApproving, setRiskApproving] = useState(false)
  const [editingRisk, setEditingRisk] = useState(false)      // 是否处于编辑态
  const [riskForm, setRiskForm] = useState(null)             // 编辑中的风险评估副本
  const [riskSaving, setRiskSaving] = useState(false)
  const [riskDiscInput, setRiskDiscInput] = useState('')     // 讨论区输入
  const [riskDiscImages, setRiskDiscImages] = useState([])   // 待发送图片，如"AI认为某检查没做，实际已做"可截图说明
  const [riskDiscImgUploading, setRiskDiscImgUploading] = useState(false)
  const [riskDiscBusy, setRiskDiscBusy] = useState(false)
  const [riskAiReplying, setRiskAiReplying] = useState(false)
  // 场景五/六/九：AI 助手（随访建议 / 教练消息 / 内容推荐）
  const [aiHelper, setAiHelper] = useState(null)   // { type, loading, data, error }
  const [aiHelperBusy, setAiHelperBusy] = useState(false)
  const [ocrReviewReport, setOcrReviewReport] = useState(null)
  const [ocrEditItems, setOcrEditItems] = useState([])
  const [ocrReviewPage, setOcrReviewPage] = useState(null)
  const [ocrFocusItemIndex, setOcrFocusItemIndex] = useState(null)
  const [ocrSaving, setOcrSaving] = useState(false)
  const [ocrClassifySearch, setOcrClassifySearch] = useState({}) // {[rowIndex]: searchText}
  const [ocrClassifyOpen, setOcrClassifyOpen] = useState({})    // {[rowIndex]: bool}
  const [ocrClassifyDropUp, setOcrClassifyDropUp] = useState({}) // {[rowIndex]: bool} 归类下拉框展开方向，按实测可用空间动态判断
  const ocrClassifyWrapRefs = useRef({})                        // {[rowIndex]: {current: HTMLElement}}
  const ocrModalBodyRef = useRef(null)                          // 归类下拉框的真实裁切边界是这个 overflow:auto 的表格滚动容器，不是浏览器视口
  const ocrItemRefs = useRef({})
  const ocrFocusHandledRef = useRef(null)
  const [screeningCatalog, setScreeningCatalog] = useState([])
  useEffect(() => { staffAPI.getScreeningCatalog().then(r => setScreeningCatalog(r.data || [])).catch(() => {}) }, [])
  // 客户归属决定会员类型和服务包选项，两者均读取 admin 会员设置。
  useEffect(() => {
    if (!editForm.clientBrand) {
      setServiceOptions([])
      setMemberTypeOptions([])
      return
    }
    staffAPI.serviceOptions(editForm.clientBrand).then(r => setServiceOptions(r.data || [])).catch(() => setServiceOptions([]))
    staffAPI.memberTypeOptions(editForm.clientBrand).then(r => setMemberTypeOptions(r.data || [])).catch(() => setMemberTypeOptions([]))
  }, [editForm.clientBrand])
  useEffect(() => { staffAPI.memberSourceOptions().then(r => setMemberSourceOptions(r.data || [])).catch(() => {}) }, [])

  // 问卷 → 健康档案 自动导入审核
  const [archiveDraftOpen, setArchiveDraftOpen] = useState(false)
  const [archiveDraftItems, setArchiveDraftItems] = useState([])
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [qResponses, setQResponses] = useState([])
  useEffect(() => { staffAPI.getQuestionnaireResponses(id).then(r => setQResponses(r.data || [])).catch(() => {}) }, [id])

  const openArchiveDraft = (draft) => {
    setArchiveDraftItems((draft?.items || []).map(it => ({
      ...it,
      apply: !it.conflict, // 冲突项默认不勾，交专员定夺
      valueStr: it.valueStr != null ? it.valueStr : (Array.isArray(it.value) ? it.value.join('、') : String(it.value || '')),
    })))
    setArchiveDraftOpen(true)
  }
  const handleGenerateArchiveDraft = async (responseId) => {
    setArchiveBusy(true)
    try {
      const r = await staffAPI.generateArchiveDraft(id, responseId)
      if (!r.data?.items?.length) { toast('该问卷未匹配到可导入的档案字段'); return }
      openArchiveDraft(r.data)
      load()
    } catch (err) { toast(err.message || '生成失败') } finally { setArchiveBusy(false) }
  }
  const handleApplyArchiveDraft = async () => {
    const items = archiveDraftItems.filter(it => it.apply).map(it => ({
      path: it.path,
      value: it.fieldType === 'array'
        ? (String(it.valueStr || '').split(/[、,，;；]/).map(s => s.trim()).filter(Boolean))
        : it.valueStr,
    }))
    if (!items.length) { toast('请至少勾选一个字段'); return }
    setArchiveBusy(true)
    try {
      await staffAPI.applyArchiveDraft(id, items)
      toast('已写入健康档案')
      setArchiveDraftOpen(false)
      load()
    } catch (err) { toast(err.message || '写入失败') } finally { setArchiveBusy(false) }
  }
  const handleDismissArchiveDraft = async () => {
    setArchiveBusy(true)
    try { await staffAPI.dismissArchiveDraft(id); setArchiveDraftOpen(false); load() }
    catch (err) { toast(err.message || '操作失败') } finally { setArchiveBusy(false) }
  }

  const [dietaryReviewBusy, setDietaryReviewBusy] = useState(false)
  const handleNutritionistReview = async (responseId) => {
    setDietaryReviewBusy(true)
    try {
      await staffAPI.nutritionistReviewResponse(id, responseId)
      toast('已复核确认')
      staffAPI.getQuestionnaireResponses(id).then(r => setQResponses(r.data || [])).catch(() => {})
    } catch (err) { toast(err.message || '复核失败') } finally { setDietaryReviewBusy(false) }
  }

  const load = async () => {
    try {
      const [res, scrRes] = await Promise.allSettled([
        staffAPI.getPatient(id),
        staffAPI.getScreeningReports(id),
      ])
      if (res.status === 'fulfilled') {
        setLoadError(null)
        setData(res.value.data)
        setEditForm(buildEditForm(res.value.data.user))
        setBasicInfoForm(buildBasicInfoForm(res.value.data.user))
        setHealthNeedsForm(buildHealthNeedsForm(res.value.data.user))
        setHealthForm(buildHealthForm(res.value.data.user))
        setLifestyleForm(buildLifestyleForm(res.value.data.user))
        setInsuranceForm(buildInsuranceForm(res.value.data.user))
        setLabForm(res.value.data.user.labValues || {})
        setSeverityForm(res.value.data.user.chronicDiseaseSeverity || {})
        setBodyCompForm(res.value.data.user.bodyComposition || {})
        setAiSummaryForm(res.value.data.user.aiHealthSummary || {})
      } else {
        throw res.reason
      }
      if (scrRes.status === 'fulfilled') setScreeningReports(scrRes.value.data || [])
    } catch (err) {
      setLoadError(err.status === 403 ? '无权限查看该会员' : (err.message || '会员不存在'))
      toast(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  // 打卡数据有疑问时医护端修正：血压拆sys/dia两个数值输入，其余类型统一走单值输入
  const startEditRecord = (r) => {
    setEditingRecord(r)
    if (r.type === 'bloodPressure') {
      setEditRecordForm({ value: '', sys: String(r.extra?.sys ?? ''), dia: String(r.extra?.dia ?? ''), note: r.note || '' })
    } else {
      setEditRecordForm({ value: String(r.value ?? ''), sys: '', dia: '', note: r.note || '' })
    }
  }

  const saveEditRecord = async () => {
    if (!editingRecord || editRecordSaving) return
    setEditRecordSaving(true)
    try {
      let payload = { note: editRecordForm.note }
      if (editingRecord.type === 'bloodPressure') {
        const sys = parseInt(editRecordForm.sys, 10)
        const dia = parseInt(editRecordForm.dia, 10)
        if (!sys || !dia) { toast('收缩压和舒张压不能为空'); setEditRecordSaving(false); return }
        payload.value = `${sys}/${dia}`
        payload.extra = { ...editingRecord.extra, sys, dia }
      } else {
        if (!editRecordForm.value) { toast('数值不能为空'); setEditRecordSaving(false); return }
        payload.value = editRecordForm.value
        payload.extra = editingRecord.extra
      }
      await staffAPI.updatePatientHealthRecord(id, editingRecord._id, payload)
      toast('已修正')
      setEditingRecord(null)
      load()
    } catch (err) {
      toast(err.message || '修正失败')
    } finally {
      setEditRecordSaving(false)
    }
  }

  const loadFollowUps = async () => {
    try {
      const res = await staffAPI.getPatientFollowUps(id)
      setFollowUps(res.data.followUps)
    } catch {}
  }

  // 执行随访：填写随访结果、标记完成/随访中，逻辑与 FollowUpsPage.jsx 一致
  const openExec = (f) => {
    setExecItem(f)
    setExecForm({ type: f.type || 'phone', content: '', status: 'completed' })
  }
  const handleExec = async () => {
    if (!execForm.content.trim()) { toast('请填写随访结果'); return }
    setExecSaving(true)
    try {
      await staffAPI.updateFollowUp(execItem._id, {
        type: execForm.type,
        content: execForm.content,
        status: execForm.status,
      })
      toast('随访记录已更新')
      setExecItem(null)
      loadFollowUps()
    } catch (err) { toast(err.message || '保存失败') }
    finally { setExecSaving(false) }
  }
  const handleExecAIDraft = async () => {
    if (!id) return
    setExecDraftLoading(true)
    try {
      const r = await staffAPI.generateAIDraft(id, 'followup', {
        theme: execItem.theme || '',
        type: TYPE_OPTIONS.find(o => o.v === execForm.type)?.l || execForm.type,
        focus: execItem.theme || '',
      })
      setExecForm(f => ({ ...f, content: r.data.draft }))
      toast('AI草稿已生成，请审核修改后保存')
    } catch (err) { toast(err.message || 'AI生成失败') }
    finally { setExecDraftLoading(false) }
  }

  const loadPlans = async () => {
    try { const res = await staffAPI.getPatientPlans(id); setPlans(res.data) } catch {}
  }
  const genAIMedicalAssistPlan = async (orderId, templateId) => {
    setAiMedicalAssistGenerating(true)
    try {
      await staffAPI.generateAIMedicalAssistPlan(id, orderId, templateId)
      toast('AI就医协助方案已生成，待健康规划师审核')
      loadPlans()
    } catch (err) { toast('AI生成失败：' + (err.message || '未知错误')) }
    finally { setAiMedicalAssistGenerating(false) }
  }
  const loadReports = async () => {
    try { const res = await staffAPI.getPatientReports(id); setReports(res.data) } catch {}
  }

  const openRiskEvidence = async (tag, categoryLabel) => {
    setRiskEvidenceModal({ tag, categoryLabel, loading: true, sources: [] })
    try {
      const res = await staffAPI.getPatientReports(id)
      const rows = res.data || []
      const sources = []
      rows.forEach(report => {
        const isSubsequence = (needle, haystack) => {
          let index = 0
          for (const char of haystack) if (char === needle[index]) index += 1
          return index === needle.length
        }
        const matchesTag = (value) => {
          const target = String(tag || '').replace(/[\s·，,。；;：:（）()【】\[\]、/\\_-]/g, '')
          const source = String(value || '').replace(/[\s·，,。；;：:（）()【】\[\]、/\\_-]/g, '')
          if (!target || !source) return false
          return source.includes(target) || target.includes(source) || (target.length >= 2 && isSubsequence(target, source))
        }
        const add = (itemName, value) => {
          const text = String(value || '').trim()
          if (!text || !matchesTag(`${itemName || ''}${text}`)) return
          sources.push({ reportId: report._id, title: report.title || '体检报告', date: report.checkDate || report.date || '', itemName, text })
        }
        ;(report.reportItems || []).forEach(item => add(item.name || '', [item.diagnosis, item.conclusion, item.findings, item.value].filter(Boolean).join('；')))
        Object.entries(report.examMainConclusions || {}).forEach(([name, value]) => add(name, value))
        add('', report.examConclusion)
      })
      setRiskEvidenceModal({ tag, categoryLabel, loading: false, sources })
    } catch (err) {
      setRiskEvidenceModal({ tag, categoryLabel, loading: false, sources: [], error: err.message || '来源加载失败' })
    }
  }
  // 专项筛查目录（供审核 modal 下拉选择）
  useEffect(() => {
    staffAPI.getScreeningCatalog().then(res => setScreeningCatalog(res.data || [])).catch(() => {})
  }, [])
  // 有报告处于「识别中」时，每 5 秒自动刷新，识别完成后停止
  useEffect(() => {
    if (tab !== 'reports') return
    if (!reports.some(r => r.aiStatus === 'processing')) return
    const timer = setInterval(loadReports, 5000)
    return () => clearInterval(timer)
  }, [tab, reports])
  const loadServiceRecords = async () => {
    try { const res = await staffAPI.getPatientServiceRecords(id); setServiceRecords(res.data) } catch {}
  }
  const loadPatientReferrals = async () => {
    try { const res = await staffAPI.getPatientReferrals(id); setPatientReferrals(res.data?.referrals || []) } catch {}
  }
  const loadRequisitions = async () => {
    try { const res = await staffAPI.getPatientRequisitions(id); setRequisitions(res.data) } catch {}
  }
  const loadMedications = async () => {
    try { const r = await staffAPI.getPatientMedications(id); setMedications(r.data || []) } catch {}
  }
  const loadSupplements = async () => {
    try { const r = await staffAPI.getPatientSupplements(id); setSupplements(r.data || []) } catch {}
  }
  const loadScreening = async () => {
    try {
      const [sr, hr, scr, tree, summaries] = await Promise.allSettled([
        staffAPI.getPatientScreening(id),
        // 今日健康状态必须在会员档案长期可追溯，不能被最近30条普通打卡挤出列表。
        staffAPI.getPatientHealthRecords(id, { type: 'symptom', days: 365, limit: 500 }),
        staffAPI.getScreeningReports(id),
        staffAPI.getScreeningTree(),
        staffAPI.getScreeningYearSummaries(id),
      ])
      if (sr.status === 'fulfilled') setScreeningItems(sr.value.data || [])
      if (hr.status === 'fulfilled') setHealthRecords(hr.value.data || [])
      if (scr.status === 'fulfilled') setScreeningReports(scr.value.data || [])
      if (tree.status === 'fulfilled') setScreeningTree(tree.value.data || [])
      if (summaries.status === 'fulfilled') setScreeningYearSummaries(summaries.value.data || [])
    } catch {}
  }

  const [reportScreeningData, setReportScreeningData] = useState([])
  const [reportSourceFocus, setReportSourceFocus] = useState(null)

  const openReportDetail = (r) => {
    // 立即显示弹窗（用列表里已有的数据）
    setShowReportDetail(r)
    setReportScreeningData([])
    setReportDetailLoading(true)

    // 背景异步：拉完整报告详情
    staffAPI.getReport(r._id)
      .then(res => setShowReportDetail(res.data))
      .catch(() => { /* 保持列表数据，下方会显示加载失败提示 */ })
      .finally(() => setReportDetailLoading(false))

    // 健康顾问打开报告详情，联动标记"已解读"（2026-07-28新增）：此前用户端报告列表的
    // "待解读/已解读"状态字段(status)从未被任何动作驱动过，一直卡死在默认值"待解读"，
    // 跟审核状态毫无关联。改为健康顾问查看过这份报告后自动置为已解读，不需要额外操作。
    if (staff?.role === 'familyDoctor' || staff?.role === 'superadmin') {
      staffAPI.markReportFamilyDoctorViewed(r._id).catch(() => {})
    }

    // 背景异步：拉专项筛查匹配数据（不阻塞弹窗）
    const reportTitle = r.title || ''
    const reportDate  = r.checkDate || r.date || ''
    staffAPI.getScreeningReports(id)
      .then(res => {
        const all = res.data || []
        const matched = all.filter(s => {
          const l2 = s.screeningL2 || s.title || ''
          const l2Match = l2 === reportTitle || l2.includes(reportTitle) || reportTitle.includes(l2)
          if (!l2Match) return false
          if (!reportDate || !s.checkDate) return true
          return Math.abs(new Date(reportDate) - new Date(s.checkDate)) / 86400000 <= 30
        })
        setReportScreeningData(matched)
      })
      .catch(() => {})
  }

  useEffect(() => {
    const reportId = new URLSearchParams(location.search).get('reportId')
    if (tab === 'reports' && reportId) openReportDetail({ _id: reportId, title: '待处理体检报告' })
  }, [tab, location.search])

  useEffect(() => {
    const healthRecordId = new URLSearchParams(location.search).get('healthRecordId')
    if (tab !== 'portrait' || !healthRecordId) return
    setExpandedSymptoms(previous => new Set([...previous, String(healthRecordId)]))
    setTimeout(() => document.getElementById(`symptom-record-${healthRecordId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100)
  }, [tab, location.search, healthRecords.length])

  const openSymptomEditor = record => {
    setEditingSymptom(record)
    setSymptomForm({
      value: record.value || '',
      note: record.note || '',
      decisionNote: record.symptomWorkflow?.decisionNote || '',
    })
  }

  const createSymptomRecord = async () => {
    if (!newSymptomForm.value.trim() || newSymptomSaving) return
    setNewSymptomSaving(true)
    try {
      await staffAPI.createPatientHealthRecord(id, {
        type: 'symptom', value: newSymptomForm.value.trim(), note: newSymptomForm.note.trim(),
        recordedAt: newSymptomForm.recordedAt || new Date().toISOString(),
      })
      toast('不适主诉已录入，客户端已同步展示')
      setAddingSymptom(false)
      setNewSymptomForm({ value: '', note: '', recordedAt: '' })
      await loadScreening()
    } catch (err) { toast(err.message || '录入失败') }
    finally { setNewSymptomSaving(false) }
  }

  const submitSymptomVerification = async action => {
    if (!editingSymptom || !symptomForm.value.trim() || symptomActionSaving) return
    setSymptomActionSaving(true)
    try {
      await staffAPI.verifySymptom(editingSymptom._id, { action, ...symptomForm })
      toast(action === 'save' ? '审核修改已保存' : action === 'dismiss' ? '已确认为误录' : '已转交健康顾问')
      setEditingSymptom(null)
      await loadScreening()
    } catch (err) {
      toast(err.message || '操作失败')
    } finally {
      setSymptomActionSaving(false)
    }
  }

  const referSymptomToDoctor = record => {
    openSymptomEditor(record)
  }

  const handleDoctorSymptom = async record => {
    const decisionNote = window.prompt('请填写健康顾问处理意见：', record.symptomWorkflow?.decisionNote || '')
    if (decisionNote === null) return
    try {
      await staffAPI.resolveSymptom(record._id, { status: 'resolved', decisionNote })
      toast('已完成处理，用户端待办已同步结束')
      await loadScreening()
      loadFollowUps()
    } catch (err) {
      toast(err.message || '处理失败')
    }
  }

  const deleteSymptomRecord = async record => {
    const reason = window.prompt('请输入删除原因（例如：测试记录、客户误点）：', '')
    if (reason === null) return
    if (!reason.trim()) { toast('删除原因不能为空'); return }
    if (!window.confirm(`确认删除这条不适记录？\n\n${record.value || ''}\n\n删除后将从用户端、医护端及待办中移除。`)) return
    try {
      await staffAPI.deleteSymptom(record._id, reason.trim())
      toast('记录已删除，同源待办已取消')
      await loadScreening()
      loadFollowUps()
    } catch (err) {
      toast(err.message || '删除失败')
    }
  }

  const openAIAnalysisSource = (sourceReportId, focus = null) => {
    if (!sourceReportId) return
    setReportSourceFocus(focus)
    openReportDetail({ _id: sourceReportId, title: '原始体检报告' })
  }
  useEffect(() => { load() }, [id])
  // 切换到不同会员时，上一个会员的"健康档案已查看"进度不能带过来，否则会误判成这个新会员
  // 也已经查看过某些报告（组件是同一实例复用，id变了但state不会自动清零）
  useEffect(() => { setPendingDoctorAuditReports([]) }, [id])
  useEffect(() => {
    staffAPI.getStaffList().then(r => setStaffList(r.data)).catch(() => {})
  }, [])
  // 从工作台/随访任务面板点击某条随访直接跳转过来时，带着该条完整记录（location.state.openFollowUp），
  // 不依赖列表分页/折叠命中，进详情页直接跳到对应界面，不用用户在列表里再翻找一遍。
  // 来源+当前角色不同，目的地也不同：
  // - 普通随访任务（sourceType!=='order'）：工作台点进来就是要去处理，直接跳"执行随访"弹窗填写结果
  //   （2026-07-13 反馈：应该直接到执行随访界面，不然怎么填写随访内容）。
  // - 商城服务订单（sourceType==='order'）+ 健康规划师本人：目的是去生成就医协助方案，不是执行随访，
  //   直接跳"管理方案"tab并自动触发AI生成；方案生成后再安排就医专员执行，
  //   AI先生成方案，审核后推送给客户，并自动建立随访计划）。
  // - 商城服务订单 + 其他执行角色：目的是"选执行人转派"，不是自己生成方案，
  //   执行随访弹窗没有转派入口会把这条路堵死（2026-07-13 反馈：跳到执行随访界面，无法选择执行人，
  //   没办法真正转到实际服务的人员）——跳只读详情弹窗，里面"编辑"按钮能选执行人(assignedTo)。
  // 已完成/已取消的记录都没有"执行/转派"的意义，统一退回只读详情。
  useEffect(() => {
    if (tab === 'followups' && location.state?.openFollowUp) {
      const f = location.state.openFollowUp
      if (f.sourceType === 'order' && staff?.role === 'healthPlanner') {
        setTab('plans')
        // 订单服务名已能唯一对应到具体模板，无需人工确认，跳转到方案tab后直接自动生成
        // （后端按服务名匹配到templateId后同样走模板固定内容锁定的生成逻辑，不是自由发挥）
        setAutoGenMedicalAssistOrderId((f.sourceOrderId?._id || f.sourceOrderId) || '')
        nav(location.pathname + '?tab=plans', { replace: true })
        return
      }
      if (f.sourceType === 'order') setFollowUpDetail(f)
      else if (['planned', 'in_progress', 'missed'].includes(f.status)) openExec(f)
      else setFollowUpDetail(f)
      nav(location.pathname + location.search, { replace: true, state: {} })
    }
  }, [tab])
  // 从商城订单待办跳转到"管理方案"tab后，自动触发一次AI生成，不用健康规划师再点一次按钮；
  // 后端按订单服务名匹配到templateId后走的是模板固定内容锁定的生成逻辑，不是AI自由发挥
  useEffect(() => {
    if (tab === 'plans' && autoGenMedicalAssistOrderId !== null) {
      genAIMedicalAssistPlan(autoGenMedicalAssistOrderId)
      setAutoGenMedicalAssistOrderId(null)
    }
  }, [tab, autoGenMedicalAssistOrderId])
  useEffect(() => {
    if (tab === 'followups') loadFollowUps()
    else if (tab === 'plans') loadPlans()
    else if (tab === 'reports') {
      loadReports()
      // 体检报告排序也需要 screeningTree，按需加载
      if (screeningTree.length === 0) {
        staffAPI.getScreeningTree().then(r => setScreeningTree(r.data || [])).catch(() => {})
      }
    }
    else if (tab === 'serviceRecords') loadServiceRecords()
    else if (tab === 'referrals') loadPatientReferrals()
    else if (tab === 'medications') { loadMedications(); loadSupplements() }
    else if (tab === 'portrait') {
      loadScreening()
      if (reports.length === 0) loadReports()
    }
    else if (tab === 'records') {
      loadScreening()
      // 专项筛查页面的"待完成方案项目"提示条需要 plans 数据，但 plans 平时只在"方案"Tab才加载，这里按需补一次
      if (plans.length === 0) loadPlans()
      // 2026-07-02：专项筛查里AI识别记录的"编辑"按钮要靠 reports 列表反查报告对象再打开审核弹窗，
      // 但 reports 平时只在"体检报告"Tab才加载——如果用户没先点过那个Tab，reports是空数组，
      // reports.find()找不到、按钮点了没反应（表现为"有些编辑键不可用"），这里同样按需补一次
      if (reports.length === 0) loadReports()
    }
    else if (tab === 'consumption') staffAPI.getPatientOrders(id).then(r => setPatientOrders(r.data || [])).catch(() => {})
    else if (tab === 'ai') {
      // 健康顾问审核依赖 reports（要展示报告原文对照），同上按需补加载
      if (reports.length === 0) loadReports()
      loadPendingDoctorAudit()
    }
  }, [tab])

  const buildEditForm = (u) => ({
    chronicDiseases: u.chronicDiseases || [],
    clientBrand: u.clientBrand || '',
    memberType: u.memberType || '',
    patientType: u.patientType || '',
    source: u.source || '',
    remark: u.remark || '',
    // contactPhone2/contactName/deliveryAddress 已移到基本信息卡(basicInfoForm)统一管理，
    // 此处不再纳入 editForm，避免管理信息卡保存时用旧值覆盖基本信息卡刚存的新值（2026-07-11）
    assignedHealthPlanner:    u.assignedHealthPlanner?._id    || '',
    assignedHealthManager:    u.assignedHealthManager?._id    || '',
    assignedFamilyDoctor:     u.assignedFamilyDoctor?._id     || '',
    assignedNutritionist:     u.assignedNutritionist?._id     || '',
    assignedSpecialist:       u.assignedSpecialist?._id       || '',
    assignedTcmDoctor:        u.assignedTcmDoctor?._id        || '',
    assignedPsychologist:     u.assignedPsychologist?._id     || '',
    assignedRehabSpecialist:  u.assignedRehabSpecialist?._id  || '',
    assignedMedicalAssistant: u.assignedMedicalAssistant?._id || '',
    servicePackage: u.servicePackage || '',
    serviceExpiry: u.serviceExpiry || '',
    serviceStartDate: u.serviceStartDate || '',
  })

  const buildBasicInfoForm = (u) => ({
    name: u.name || '',
    preferredTitle: u.preferredTitle || '',
    gender: u.gender || '未知',
    birthDate: u.birthDate || '',
    idType: u.idType || 'idCard',
    idNumber: u.idNumber || '',
    maritalStatus: u.maritalStatus || '',
    ethnicity: u.ethnicity || '',
    workplace: u.workplace || '',
    occupation: u.occupation || '',
    education: u.education || '',
    hasAnnualCheckup: u.hasAnnualCheckup || '',
    height: u.height || '',
    weight: u.weight || '',
    address: u.address || '',
    // 登录手机号与联系电话已合并；旧数据仅有 contactPhone 时作为兼容回填显示。
    phone: u.phone || u.contactPhone || '',
    contactName: u.contactName || '',
    contactPhone2: u.contactPhone2 || '',
    deliveryAddress: u.deliveryAddress || '',
    chronicDiseases: u.chronicDiseases || [],
    basicRemark: u.basicRemark || '',
    preferences: u.preferences || '',
  })

  const handleSaveBasicInfo = async () => {
    try {
      const phone = String(basicInfoForm.phone || '').trim()
      if (phone && !/^1\d{10}$/.test(phone)) {
        toast('请输入正确的11位手机号码')
        return
      }
      await staffAPI.updatePatient(id, basicInfoForm)
      toast('基本信息已保存')
      setEditingBasicInfo(false)
      load()
    } catch (err) { toast(err.message || '保存失败') }
  }

  const handleSaveHealthNeeds = async () => {
    try {
      await staffAPI.updatePatient(id, healthNeedsForm)
      toast('健康需求已保存')
      setEditingHealthNeeds(false)
      load()
    } catch (err) { toast(err.message || '保存失败') }
  }

  const handleSaveTags = async () => {
    try {
      setTagSaving(true)
      const tags = Object.fromEntries(Object.keys(tagEditorDiseases).map(key => [key,
        normalizeRiskTagValues([...(tagEditorDiseases[key] || []), tagEditorInput[key] || '']),
      ]))
      await staffAPI.reviewHealthRiskTags(id, tags)
      toast('标签已审核确认')
      setShowTagEditor(false)
      setTagEditorInput({ tumor_risk: '', cardiovascular_risk: '', chronic_disease: '' })
      load()
    } catch (err) { toast(err.message || '保存失败') }
    finally { setTagSaving(false) }
  }

  const buildHealthForm = (u) => ({
    bloodTypeABO: u.bloodTypeABO || '',
    bloodTypeRH: u.bloodTypeRH || '',
    traumaHistory: u.traumaHistory || '',
    transfusionHistory: u.transfusionHistory || '',
    poisoningHistory: u.poisoningHistory || '',
    infectiousHistory: u.infectiousHistory || '',
    vaccinationHistory: u.vaccinationHistory || '',
    otherDiseaseHistory: u.otherDiseaseHistory || '',
    healthProfile: {
      drugAllergy: u.healthProfile?.drugAllergy || '',
      foodAllergy: u.healthProfile?.foodAllergy || '',
      pastHistory: u.healthProfile?.pastHistory || '',
      medicHistory: u.healthProfile?.medicHistory || '',
      surgeryHistory: u.healthProfile?.surgeryHistory || '',
      menstrualHistory: u.healthProfile?.menstrualHistory || '',
      maritalHistory: u.healthProfile?.maritalHistory || '',
      sexualHistory: u.healthProfile?.sexualHistory || '',
      familyHistoryNote: u.healthProfile?.familyHistoryNote || '',
      supplementHistory: u.healthProfile?.supplementHistory || '',
      recentSymptoms: u.healthProfile?.recentSymptoms || [],
      recentMedication: u.healthProfile?.recentMedication || '',
      recentSupplement: u.healthProfile?.recentSupplement || '',
    },
  })

  const buildHealthNeedsForm = (u) => ({
    healthConcern: u.healthConcern || '',
    healthConcernFor: u.healthConcernFor || '',
    expectedService: u.expectedService || '',
    hasHomeMonitor: u.hasHomeMonitor || '',
    hasMedicineCabinet: u.hasMedicineCabinet || '',
  })

  const buildLifestyleForm = (u) => ({
    lifestyle: {
      diet: u.lifestyle?.diet || '',
      exercise: u.lifestyle?.exercise || '',
      sleep: u.lifestyle?.sleep || '',
      water: u.lifestyle?.water || '',
      alcohol: u.lifestyle?.alcohol || '',
      smoking: u.lifestyle?.smoking || '',
      bowel: u.lifestyle?.bowel || '',
      mood: u.lifestyle?.mood || '',
    },
    lifestyle_data: u.lifestyle_data || {},
  })

  // 生活方式：自动生成综合概述
  const buildLifestyleSummary = (d) => {
    const flags = []
    // 三餐：少吃或不吃
    const meals = ['breakfast', 'lunch', 'dinner']
    const missedMeals = meals.filter(m => d[`${m}Detail`] === '少吃' || d[`${m}Detail`] === '不吃')
    if (missedMeals.length > 0) flags.push('三餐不规律或经常少吃/不吃某一餐')
    // 能量摄入不足/节食：有2餐及以上少吃或不吃
    const severelyMissed = meals.filter(m => d[`${m}Detail`] === '不吃')
    const lightMissed = meals.filter(m => d[`${m}Detail`] === '少吃')
    if (severelyMissed.length >= 1 || lightMissed.length >= 2) flags.push('每日摄入能量不足/节食')
    // 外卖/外食频率高：应酬≥3次/周，或三餐中≥2餐为外卖/饭店
    const eatOutMeals = meals.filter(m => d[`${m}Detail`] === '外卖' || d[`${m}Detail`] === '饭店' || d[`${m}Detail`] === '饭店或外卖')
    const highEntertainment = d.entertainment === '3-5次/周' || d.entertainment === '6-7次/周'
    if (eatOutMeals.length >= 2 || highEntertainment) flags.push('外卖/外食频率高（每周≥5次）')
    // 饮水不足
    if (d.dailyWater === '1500毫升内') flags.push('饮水量不足（＜1500毫升/天）')
    // 蔬菜摄入不足
    if (d.dailyVegetables && (d.dailyVegetables === '300克以内' || d.dailyVegetables === '几乎不吃')) {
      flags.push('蔬菜、水果、粗杂粮、奶制品摄入不足')
    }
    // 主食过多
    if (d.dailyStaple === '400克以上') flags.push('精制主食摄入过多')
    // 不良饮食习惯（"无不良饮食习惯"是否定选项，不计入"存在不良习惯"判定，2026-07-17修复误判）
    const badHabits = (d.badDietHabits || []).filter(h => h !== '无不良饮食习惯')
    if (badHabits.length > 0) flags.push('存在不良饮食习惯（油炸、甜品、腌制、重油、偏咸、夜宵等）')
    // 作息/运动
    if (d.scheduleRegularity === '不规律' || d.exerciseFrequency === '无') flags.push('作息不规律或运动不足')
    // 过敏/忌口
    const hasAllergy = (d.foodAllergens || []).some(a => a !== '无') || d.dietaryRestrictions === '有'
    if (hasAllergy) flags.push('有食物过敏、忌口或营养干预史')
    if (d.nutritionHistory && d.nutritionHistory.trim()) flags.push('有食物过敏、忌口或营养干预史')
    // 排便
    if (d.bowelRegularity === '便秘/腹泻') flags.push('排便不规律或便秘')
    else if (d.bowelRegularity === '偶尔不规律') flags.push('排便偶有不规律')
    // 心理压力
    if (d.psychStress && d.psychStress !== '正常') flags.push('存在心理压力或情绪问题')
    return [...new Set(flags)]
  }

  // 从膳食调查问卷细分字段提炼"基本生活记录"8项简述（供综合概述展示，可被医护手动覆盖）
  const deriveBasicLifestyle = (d) => {
    const mealLabel = { 居家: '居家', 饭店: '饭店', 外卖: '外卖', 在校: '在校', '饭店或外卖': '外食', 少吃: '少吃', 不吃: '不吃' }
    const meals = [['breakfastDetail', '早'], ['lunchDetail', '午'], ['dinnerDetail', '晚']]
    const mealParts = meals.filter(([k]) => d[k]).map(([k, prefix]) => `${prefix}${mealLabel[d[k]] || d[k]}`)
    const badHabits = (d.badDietHabits || []).filter(h => h !== '无不良饮食习惯')
    const dietParts = [...mealParts]
    if (badHabits.length > 0) dietParts.push(badHabits.join('、'))
    if (d.dietaryRestrictions === '有' && d.dietaryRestrictionsDesc) dietParts.push(`忌${d.dietaryRestrictionsDesc}`)
    const diet = dietParts.join('，')

    const exParts = []
    if (d.exerciseType) exParts.push(d.exerciseType)
    if (d.exerciseFrequency && d.exerciseFrequency !== '无') exParts.push(d.exerciseFrequency)
    if (d.exerciseDuration) exParts.push(`每次${d.exerciseDuration}分钟`)
    const exercise = exParts.join('，')

    const sleepParts = []
    if (d.sleepTime || d.wakeTime) sleepParts.push(`${d.sleepTime || '?'}入睡，${d.wakeTime || '?'}起床`)
    if (d.scheduleRegularity) sleepParts.push(d.scheduleRegularity)
    const sleep = sleepParts.join('，')

    const water = d.dailyWater || ''
    const smoking = d.smokingStatus || ''

    const alcoholParts = []
    if (d.drinkingFrequency) alcoholParts.push(d.drinkingFrequency)
    const drinkTypes = (d.drinkingType || []).filter(t => t !== '其它')
    if ((d.drinkingType || []).includes('其它') && d.drinkingTypeOtherDesc) drinkTypes.push(d.drinkingTypeOtherDesc)
    if (drinkTypes.length > 0) alcoholParts.push(drinkTypes.join('、'))
    if (d.drinkingAmount) alcoholParts.push(d.drinkingAmount)
    const alcohol = alcoholParts.join('，')

    const bowelParts = []
    if (d.bowelRegularity) bowelParts.push(d.bowelRegularity)
    if (d.bowelShape) bowelParts.push(d.bowelShape)
    const bowel = bowelParts.join('，')

    const mood = (d.psychStress && d.psychStress !== '正常') ? d.psychStress : (d.psychStress === '正常' ? '情绪稳定' : '')

    return { diet, exercise, sleep, water, smoking, alcohol, bowel, mood }
  }

  // 生活方式：活动标签页
  const [lifestyleTab, setLifestyleTab] = useState('diet')

  const buildInsuranceForm = (u) => ({
    basic_insurance: u.basic_insurance || '',
    commercial_medical: u.commercial_medical || '',
    critical_illness: u.critical_illness || '',
  })

  const handleSave = async () => {
    try {
      await staffAPI.updatePatient(id, editForm)
      toast('保存成功')
      setEditing(false)
      load()
    } catch (err) {
      toast(err.message || '保存失败')
    }
  }

  const handleSaveInsurance = async () => {
    try {
      await staffAPI.updatePatient(id, {
        basic_insurance: insuranceForm.basic_insurance,
        commercial_medical: insuranceForm.commercial_medical,
        critical_illness: insuranceForm.critical_illness,
      })
      toast('医疗保障信息已保存')
      setEditingInsurance(false)
      load()
    } catch (err) { toast(err.message || '保存失败') }
  }

  const handleSaveHealth = async () => {
    try {
      await staffAPI.updatePatient(id, healthForm)
      toast('健康档案已保存')
      setEditingHealth(false)
      load()
    } catch (err) { toast(err.message || '保存失败') }
  }

  const handleSaveLifestyle = async () => {
    try {
      const d = lifestyleForm.lifestyle_data || {}
      if (!d.summaryOverride) {
        const flags = buildLifestyleSummary(d)
        lifestyleForm.lifestyle_data = { ...d, autoSummaryFlags: flags }
      }
      await staffAPI.updatePatient(id, lifestyleForm)
      await staffAPI.recalculateScore(id)
      toast('生活方式已保存，评分已更新')
      setEditingLifestyle(false)
      load()
    } catch (err) { toast(err.message || '保存失败') }
  }

  const handleSaveLabValues = async () => {
    try {
      const payload = { labValues: labForm }
      if (labNewRecord) payload._addLabHistory = true
      await staffAPI.updatePatient(id, payload)
      await staffAPI.recalculateScore(id)
      toast(labNewRecord ? '新增体检记录已保存，评分已更新' : '体检指标已保存，评分已更新')
      setEditingLabValues(false)
      setLabNewRecord(false)
      load()
    } catch (err) { toast(err.message || '保存失败') }
  }

  // 单项修改体检关键指标：把新值写回它来源报告里的那条 reportItem（走 updateReport，不依赖AI重跑）
  const handleSaveMetric = async () => {
    if (!editingMetric || !editingMetric.reportId) { toast('该指标无来源报告，暂不能单项修改'); return }
    const newVal = editingMetricVal.trim()
    if (!newVal) { toast('请输入数值'); return }
    setSavingMetric(true)
    try {
      const report = screeningReports.find(r => String(r._id) === String(editingMetric.reportId))
      if (!report) { toast('找不到来源报告，请刷新后重试'); setSavingMetric(false); return }
      const items = (report.reportItems || []).map(it => ({ ...it }))
      const target = items.find(it => it.name === editingMetric.itemName)
      if (!target) { toast('来源报告中找不到该项目，请刷新后重试'); setSavingMetric(false); return }
      target.value = newVal
      await staffAPI.updateReport(editingMetric.reportId, { reportItems: items, editSource: editingMetric.history ? 'key_metric_history' : 'key_metric_current' })
      await staffAPI.recalculateScore(id)
      toast(`${editingMetric.label} 已更新为 ${newVal}`)
      setEditingMetric(null)
      setEditingMetricVal('')
      load()
    } catch (err) {
      toast(err.message || '保存失败')
    } finally {
      setSavingMetric(false)
    }
  }

  const handleSaveDiseaseSeverity = async () => {
    try {
      await staffAPI.updatePatient(id, { chronicDiseaseSeverity: severityForm })
      await staffAPI.recalculateScore(id)
      toast('慢病分级已保存，评分已更新')
      setEditingDiseaseSeverity(false)
      load()
    } catch (err) { toast(err.message || '保存失败') }
  }

  // 4.2 身体成分
  const handleSaveBodyComp = async () => {
    try {
      const payload = { bodyComposition: bodyCompForm }
      if (bodyCompNewRecord) payload._addBodyCompHistory = true
      await staffAPI.updatePatient(id, payload)
      toast(bodyCompNewRecord ? '新增身体成分记录已保存' : '身体成分数据已保存')
      setEditingBodyComp(false)
      setBodyCompNewRecord(false)
      load()
    } catch (err) { toast(err.message || '保存失败') }
  }

  // 4.4 AI汇总（scope: 'doctor'=仅5维度 / 'nutrition'=仅生活方式评估 / 'all'=兼容旧逻辑全量）
  const applyAIHealthSummary = (summary) => {
    setAiSummaryForm(summary || {})
    setData(prev => prev ? {
      ...prev,
      user: { ...prev.user, aiHealthSummary: summary || {} },
    } : prev)
  }

  const handleGenerateAISummary = async (year, scope = 'all', force = false) => {
    const y = String(year || new Date().getFullYear())
    try {
      setAiSummaryLoading(true)
      const res = await staffAPI.generateAIHealthSummary(id, y, scope, force)
      applyAIHealthSummary(res.data)
      // 生成接口已返回最新完整AI汇总，直接更新当前会员状态即可立即展示。
      // 不再调用整页load()重复拉取会员、报告、问卷等大量无关数据。
      setAiYear(y)
      toast(`${y}年度AI分析已生成`)
    } catch (err) {
      if (err.needConfirm) {
        const label = scope === 'nutrition' ? '生活方式信息整理' : (scope === 'doctor' ? '5维健康信息整理' : 'AI健康信息整理')
        if (window.confirm(`${err.message}${err.approvedBy ? `（审核人：${err.approvedBy}）` : ''}\n是否确认重新生成${label}？`)) {
          return handleGenerateAISummary(year, scope, true)
        }
      } else if (err.needReportAudit) {
        loadPendingDoctorAudit()
        toast(err.message || '请先审核确认体检报告')
      } else if (err.needDoctorAnalysis) {
        toast(err.message || '请先完成并审核5维分析')
      } else {
        toast(err.message || 'AI生成失败')
      }
    }
    finally { setAiSummaryLoading(false) }
  }

  const handleRegenerateAISummaryItem = async (sectionKey, itemName) => {
    const instruction = window.prompt(`请输入“${itemName}”需要重新核对的问题：`, '')
    if (!instruction?.trim()) return
    try {
      setAiSummaryLoading(true)
      const scope = sectionKey === 'tumor_risk' || sectionKey === 'cardiovascular_risk' || sectionKey === 'chronic_disease' ? 'doctor' : 'all'
      const res = await staffAPI.regenerateAIHealthSummaryItem(id, { year: aiYear, scope, recordIndex: aiRecordIndex.doctor, sectionKey, itemName, instruction: instruction.trim() })
      applyAIHealthSummary(res.data)
      setLastRegeneratedItem(`${sectionKey}:${itemName}`)
      toast(`${itemName}已单项重新生成`)
    } catch (err) { toast(err.message || '单项重新生成失败') }
    finally { setAiSummaryLoading(false) }
  }

  const handleParseReportAI = async (reportId) => {
    setParsingReportId(reportId)
    try {
      const res = await staffAPI.parseReportAI(reportId)
      toast(res.message || 'AI解析完成')
      loadReports()
    } catch (err) { toast(err.message || 'AI解析失败') }
    finally { setParsingReportId(null) }
  }

  useEffect(() => {
    if (!ocrReviewReport || ocrFocusItemIndex == null) return
    const focusKey = `${ocrReviewReport._id}:${ocrFocusItemIndex}`
    if (ocrFocusHandledRef.current === focusKey) return
    ocrFocusHandledRef.current = focusKey
    const frame = requestAnimationFrame(() => {
      const body = ocrModalBodyRef.current
      const target = ocrItemRefs.current[ocrFocusItemIndex]
      if (!body || !target) return
      const bodyRect = body.getBoundingClientRect()
      const targetRect = target.getBoundingClientRect()
      // 只滚动弹窗右侧一次；不能用 ref 中的 scrollIntoView，否则每次输入重渲染都会把用户拉回原处。
      body.scrollTop += targetRect.top - bodyRect.top - (body.clientHeight - targetRect.height) / 2
    })
    const timer = setTimeout(() => setOcrFocusItemIndex(null), 2600)
    return () => { cancelAnimationFrame(frame); clearTimeout(timer) }
  }, [ocrReviewReport, ocrFocusItemIndex])

  const handleOpenOCRReview = async (r, focusItems = []) => {
    ocrFocusHandledRef.current = null
    setOcrReviewReport(r)
    // 每次打开都以服务器最新版初始化，避免保存草稿后从旧列表副本恢复。
    let latestReport = r
    try {
      const latestRes = await staffAPI.getReport(r._id)
      if (latestRes.data) {
        latestReport = latestRes.data
        setOcrReviewReport(latestReport)
      }
    } catch {}
    // 列表接口 select('-content') 裁掉了原图内容（体积大），这里按需补拉完整报告，
    // 否则走 content(base64) 存储的报告在审核弹窗左侧会显示"无原始文件可预览"
    if (!latestReport.content && !latestReport.fileUrl && !(latestReport.fileUrls && latestReport.fileUrls.length)) {
      staffAPI.getReport(r._id).then(res => {
        if (res.data) setOcrReviewReport(prev => (prev && prev._id === r._id) ? { ...prev, content: res.data.content } : prev)
      }).catch(() => {})
    }
    // 每次打开审核弹窗都重新拉取归类目录，确保管理后端新增/修改的分类实时生效
    staffAPI.getScreeningCatalog().then(res => setScreeningCatalog(res.data || [])).catch(() => {})
    // 旧数据迁移：只有明确标记为 imaging 的旧记录才把 value 搬到 findings。
    // 不能用“内容长度 > 40”猜类型，否则用户只是打开并保存，字段内容也会被改写。
    const items = JSON.parse(JSON.stringify(latestReport.reportItems || []))
      .filter(it => it.name && String(it.name).trim())
      .map(it => {
        const isImg = it.itemType === 'imaging'
        if (isImg && !it.findings && it.value) return { ...it, findings: it.value, value: '' }
        return it
      })
    const targets = (Array.isArray(focusItems) ? focusItems : [focusItems]).map(v => String(v || '').trim()).filter(Boolean)
    let focusedIndex = -1
    // 具体项目名按点击记录中的顺序优先匹配，目录名只在最后兜底，避免定位到前面的宽泛同名项。
    for (const target of targets) {
      focusedIndex = items.findIndex(it => String(it.name || '').trim() === target)
      if (focusedIndex >= 0) break
    }
    if (focusedIndex < 0) {
      for (const target of targets) {
        focusedIndex = items.findIndex(it => [it.name, it.sourceSection, it.orderName].some(v => {
          const value = String(v || '').trim()
          return value && (value.includes(target) || target.includes(value))
        }))
        if (focusedIndex >= 0) break
      }
    }
    setOcrEditItems(items)
    setOcrFocusItemIndex(focusedIndex >= 0 ? focusedIndex : null)
    const pages = items.map(it => Number(it.sourcePage)).filter(Number.isFinite).filter(n => n > 0)
    const focused = focusedIndex >= 0 ? items[focusedIndex] : null
    setOcrReviewPage(Number(focused?.sourcePage) || (pages.length ? Math.min(...pages) : 1))
  }

  const handleApproveOCR = async () => {
    setOcrSaving(true)
    try {
      await staffAPI.updateReport(ocrReviewReport._id, { reportItems: ocrEditItems, aiStatus: 'reviewed' })
      toast('审核通过，数据已写入专项筛查，已进入待健康顾问审核')
      setOcrReviewReport(null)
      loadReports()
    } catch (err) { toast(err.message || '保存失败') }
    finally { setOcrSaving(false) }
  }

  // 存草稿：保存归类/编辑结果但保持「待审核」，可稍后继续
  const handleSaveOCRDraft = async () => {
    setOcrSaving(true)
    try {
      const saved = await staffAPI.updateReport(ocrReviewReport._id, { reportItems: ocrEditItems, aiStatus: 'pending' })
      if (saved.data) setReports(current => current.map(report => report._id === saved.data._id ? { ...report, ...saved.data } : report))
      toast('草稿已保存（仍为待审核）')
      setOcrReviewReport(null)
      await loadReports()
    } catch (err) { toast(err.message || '保存失败') }
    finally { setOcrSaving(false) }
  }

  const handleParseCurrentPage = async () => {
    if (!ocrReviewReport || !ocrReviewPage) return
    setOcrSaving(true)
    try {
      // 先保存当前人工修改，再启动单页补提，避免覆盖尚未保存的审核内容。
      await staffAPI.updateReport(ocrReviewReport._id, { reportItems: ocrEditItems, aiStatus: 'pending' })
      const res = await staffAPI.parseReportPageAI(ocrReviewReport._id, ocrReviewPage)
      toast(res.message || `第${ocrReviewPage}页补提已开始`)
      setOcrReviewReport(prev => prev ? { ...prev, pageParseStatus: { pageNum: ocrReviewPage, status: 'processing', message: `正在补提第${ocrReviewPage}页` } } : prev)
      // 保持审核窗口打开并轮询；完成后原地刷新该页数据，避免用户靠猜测反复点击。
      for (let poll = 0; poll < 150; poll++) {
        await new Promise(resolve => setTimeout(resolve, 5000))
        const latestRes = await staffAPI.getReport(ocrReviewReport._id)
        const latest = latestRes.data
        if (!latest) continue
        setOcrReviewReport(prev => (prev && prev._id === latest._id) ? { ...prev, ...latest } : prev)
        if (latest.pageParseStatus?.status !== 'processing') {
          if (latest.pageParseStatus?.status === 'success') {
            setOcrEditItems(JSON.parse(JSON.stringify(latest.reportItems || [])))
            toast(latest.pageParseStatus.message || `第${ocrReviewPage}页补提完成`)
          } else if (latest.pageParseStatus?.status === 'failed') {
            toast(`补提失败：${latest.pageParseStatus.message || '未知错误'}`)
          }
          loadReports()
          break
        }
      }
    } catch (err) { toast(err.message || '单页补提失败') }
    finally { setOcrSaving(false) }
  }

  const handleReclassifyOCR = async () => {
    setOcrSaving(true)
    try {
      const res = await staffAPI.reclassifyReport(id, ocrReviewReport._id)
      setOcrEditItems(res.data || [])
      toast(`重新归类完成，已自动匹配 ${res.matchedCount || 0} 项`)
    } catch (err) { toast(err.message || '归类失败') }
    finally { setOcrSaving(false) }
  }

  const handleRejectOCR = async () => {
    setOcrSaving(true)
    try {
      await staffAPI.updateReport(ocrReviewReport._id, { aiStatus: 'none', reportItems: [] })
      toast('已驳回，可重新触发AI识别')
      setOcrReviewReport(null)
      loadReports()
    } catch (err) { toast(err.message || '操作失败') }
    finally { setOcrSaving(false) }
  }

  // 保存前清理数组字段里的空行/首尾空格（编辑时为了流畅保留了空行）
  const cleanSections = (secs) => {
    const out = JSON.parse(JSON.stringify(secs || {}))
    const walk = (o) => {
      if (!o || typeof o !== 'object') return
      for (const k in o) {
        const v = o[k]
        if (Array.isArray(v)) {
          o[k] = v
            .map(x => (typeof x === 'string' ? x.trim() : x))
            .filter(x => !(typeof x === 'string') || x !== '')
          o[k].forEach(x => walk(x))
        } else if (v && typeof v === 'object') walk(v)
      }
    }
    walk(out)
    return out
  }

  const handleSaveAISummary = async (approve = false) => {
    try {
      const payload = {
        sections: cleanSections(aiSummaryForm.sections),
        ...(aiYear ? { year: aiYear } : {}),
        ...(editingAISummary ? { scope: editingAISummary, recordIndex: aiRecordIndex[editingAISummary] } : {}),
        ...(approve ? { action: 'approve' } : {}),
      }
      await staffAPI.updateAIHealthSummary(id, payload)
      toast(approve ? '分析报告已审核确认' : '内容已保存')
      setEditingAISummary(false)
      load()
    } catch (err) { toast(err.message || '保存失败') }
  }

  const handleSaveAISection = async (sectionKey, approve = false, sectionValue = undefined) => {
    try {
      const res = await staffAPI.updateAIHealthSummary(id, {
        sections: { [sectionKey]: sectionValue === undefined ? cleanSections(aiSummaryForm.sections)?.[sectionKey] : sectionValue },
        sectionKey, year: aiYear, scope: sectionKey === 'lifestyle_assessment' ? 'nutrition' : 'doctor',
        recordIndex: aiRecordIndex[sectionKey === 'lifestyle_assessment' ? 'nutrition' : 'doctor'],
        ...(approve ? { action: 'approve' } : {}),
      })
      applyAIHealthSummary(res.data)
      setEditingAISummary(false); setEditingAISection('')
      toast(approve ? '该板块已审核通过' : '该板块草稿已保存')
    } catch (err) { toast(err.message || '板块保存失败') }
  }

  // 按角色维度审核 AI 汇总分析（scope: 'doctor'=5维 / 'nutrition'=生活方式评估）
  const handleApproveSummaryScope = async (scope, year, recordIndex) => {
    const label = scope === 'nutrition' ? '生活方式评估' : '5维度分析'
    if (!window.confirm(`请确认您已完整查看并核对本次${label}内容。\n审核通过后将作为正式分析结果展示，是否继续？`)) return
    try {
      await staffAPI.updateAIHealthSummary(id, { action: 'approve', scope, recordIndex, ...(year ? { year } : {}) })
      toast(`${label}已审核通过`)
      load()
    } catch (err) { toast(err.message || '操作失败') }
  }

  const handleAddLifestyleChange = async () => {
    const changes = Object.fromEntries(Object.entries(lifestyleChangeForm.changes || {}).filter(([, value]) => String(value || '').trim()))
    if (Object.keys(changes).length === 0) return toast('请至少填写一项发生变化的生活习惯')
    try {
      setLifestyleChangeSaving(true)
      await staffAPI.updatePatient(id, {
        lifestyle: changes,
        _lifestyleChangeMeta: {
          effectiveAt: lifestyleChangeForm.effectiveAt,
          healthStatusChange: lifestyleChangeForm.healthStatusChange.trim(),
        },
      })
      await staffAPI.recalculateScore(id)
      toast('生活方式变化已新增，并保留历史记录')
      setShowLifestyleChangeModal(false)
      setLifestyleChangeForm({ changes: {}, effectiveAt: new Date().toISOString().slice(0, 10), healthStatusChange: '' })
      load()
    } catch (err) { toast(err.message || '新增失败') }
    finally { setLifestyleChangeSaving(false) }
  }

  const handleDeleteAISummaryRecord = async (scope, year, recordIndex, generatedAt) => {
    const label = scope === 'nutrition' ? '生活方式分析' : '5维分析'
    const time = generatedAt ? new Date(generatedAt).toLocaleString('zh-CN') : ''
    if (!window.confirm(`确认删除${time ? ` ${time} 生成的` : '本次'}${label}？\n删除后不可恢复，但不会影响另一类分析记录。`)) return
    try {
      await staffAPI.deleteAIHealthSummaryRecord(id, year, recordIndex, scope)
      setAiRecordIndex(v => ({ ...v, [scope]: 0 }))
      toast('本次评估已删除')
      load()
    } catch (err) { toast(err.message || '删除失败') }
  }

  // 场景八：AI风险评估
  // 兼容旧数据：无 byYear 的扁平 aiRiskAssessment 归入其生成年份
  const riskByYearFE = (raw) => {
    if (!raw) return {}
    if (raw.byYear) return raw.byYear
    if (raw.dimensions || raw.overallLevel) {
      const y = String(raw.generatedAt ? new Date(raw.generatedAt).getFullYear() : new Date().getFullYear())
      return { [y]: raw }
    }
    return {}
  }
  const handleGenerateRisk = async (year) => {
    const y = String(year || new Date().getFullYear())
    setRiskGenerating(true)
    try {
      await staffAPI.generateAIRisk(id, y)
      setRiskYear(y)
      toast(`${y}年度健康关注提示已生成`)
      load()
    } catch (err) {
      if (err.needReportAudit) { loadPendingDoctorAudit(); toast(err.message || '请先审核确认体检报告') }
      else toast(err.message || 'AI生成失败')
    }
    finally { setRiskGenerating(false) }
  }
  const handleApproveRisk = async (year) => {
    setRiskApproving(true)
    try {
      await staffAPI.updateAIRisk(id, { action: 'approve', year })
      toast('健康关注提示已核对确认')
      load()
      return true
    } catch (err) {
      toast(err.message || '操作失败')
      return false
    }
    finally { setRiskApproving(false) }
  }
  const handleCloseRiskTodo = async () => {
    const years = Object.keys(riskByYearFE(data?.user?.aiRiskAssessment || {})).sort((a, b) => Number(b) - Number(a))
    const latestYear = location.state?.sourceTodo?.year || years[0]
    if (!latestYear) { toast('未找到可审核的健康关注信息'); return }
    if (!window.confirm('确认已核对完整风险依据并关闭该待审核任务？')) return
    const ok = await handleApproveRisk(latestYear)
    if (ok) nav(location.pathname + location.search, { replace: true, state: {} })
  }
  // 进入编辑态：把当前风险评估复制成可编辑副本
  const startEditRisk = (year) => {
    const byYear = riskByYearFE(data?.user?.aiRiskAssessment)
    const ra = byYear[year] || {}
    setRiskForm({
      overallSummary: ra.overallSummary || '',
      dimensions: (ra.dimensions || []).map(d => ({
        ...d,
        factorsText: Array.isArray(d.factors) ? d.factors.join('\n') : '',
      })),
    })
    setEditingRisk(true)
  }
  const handleSaveRisk = async (year) => {
    setRiskSaving(true)
    try {
      const dimensions = riskForm.dimensions.map(d => ({
        key: d.key, label: d.label, level: d.level, score: d.score,
        factors: (d.factorsText || '').split('\n').map(s => s.trim()).filter(Boolean),
        advice: d.advice || '',
      }))
      await staffAPI.updateAIRisk(id, { dimensions, overallSummary: riskForm.overallSummary, year })
      toast('健康关注提示已保存')
      setEditingRisk(false); setRiskForm(null)
      load()
    } catch (err) { toast(err.message || '保存失败') }
    finally { setRiskSaving(false) }
  }
  const handleRiskDiscPickImage = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setRiskDiscImgUploading(true)
    try {
      const data = await staffAPI.uploadReportFile(file, () => {})
      setRiskDiscImages(prev => [...prev, data.url])
    } catch (err) { toast(err.message || '图片上传失败') }
    finally { setRiskDiscImgUploading(false) }
  }
  // 风险评估讨论区：发留言后自动让AI接话，形成对话式讨论，无需再手动点按钮
  const handleRiskDiscSend = async (year) => {
    if (!riskDiscInput.trim() && riskDiscImages.length === 0) return
    setRiskDiscBusy(true)
    try {
      await staffAPI.addAIRiskDiscussion(id, riskDiscInput.trim(), year, riskDiscImages)
      setRiskDiscInput('')
      setRiskDiscImages([])
      load()
    } catch (err) { toast(err.message || '发送失败'); setRiskDiscBusy(false); return }
    setRiskDiscBusy(false)
    setRiskAiReplying(true)
    try {
      await staffAPI.generateAIRiskReply(id, year)
      load()
    } catch (err) { toast(err.message || 'AI回应失败') }
    finally { setRiskAiReplying(false) }
  }
  const handleRiskDiscDelete = async (index, year) => {
    try { await staffAPI.deleteAIRiskDiscussion(id, index, year); load() }
    catch (err) { toast(err.message || '撤回失败') }
  }
  const handleRiskAiReply = async (year) => {
    setRiskAiReplying(true)
    try { await staffAPI.generateAIRiskReply(id, year); load() }
    catch (err) { toast(err.message || 'AI回应失败') }
    finally { setRiskAiReplying(false) }
  }

  // 场景五/六/九：AI 助手统一调用。生成结果仅在弹窗内临时预览，不写库；关闭弹窗即视为丢弃，不留痕迹
  const runAIHelper = async (type) => {
    setAiHelper({ type, loading: true, data: null, error: null })
    try {
      let r
      if (type === 'followup') r = await staffAPI.generateAIFollowupSuggestion(id)
      else if (type === 'coach') r = await staffAPI.generateAICoachMessage(id)
      else r = await staffAPI.generateAIContentRecommend(id)
      setAiHelper({ type, loading: false, data: r.data, error: null })
    } catch (err) { setAiHelper({ type, loading: false, data: null, error: err.message || 'AI生成失败' }) }
  }
  // 场景六：采纳随访建议预览 → 直接创建随访计划（预览内容随请求一次性提交，不经过草稿落库）
  const adoptFollowupSuggestion = async () => {
    const d = aiHelper?.data; if (!d) return
    setAiHelperBusy(true)
    try {
      await staffAPI.reviewFollowupDraft(id, 'approve', undefined, { theme: d.theme, suggestedDate: d.suggestedDate, timingReason: d.timingReason, outline: d.outline, type: d.type, assignedTo: d.assignedTo }, d.draftToken)
      toast('已采纳，随访计划已创建')
      setAiHelper(null); loadFollowUps(); load()
    } catch (err) { toast(err.message || '创建失败') }
    finally { setAiHelperBusy(false) }
  }
  // 从待审面板点进来，直接审核草稿（不需要重新生成），edits 为待审面板内联编辑后的内容
  const reviewFollowupDraft = async (action, edits) => {
    try {
      await staffAPI.reviewFollowupDraft(id, action, undefined, edits)
      toast(action === 'approve' ? '已采纳，随访计划已创建' : action === 'withdraw' ? '已撤回' : '已拒绝')
      load(); loadFollowUps()
    } catch (err) { toast(err.message || '操作失败') }
  }
  // 场景九：发送教练消息预览 → 直接调用发送接口（预览内容随请求一次性提交，不经过草稿落库）
  const sendCoachMessage = async () => {
    const d = aiHelper?.data; const msg = d?.message; if (!msg) return
    setAiHelperBusy(true)
    try {
      await staffAPI.reviewCoachDraft(id, 'approve', msg, d.draftToken)
      toast('已发送给会员')
      setAiHelper(h => ({ ...h, data: { ...h.data, sent: true, sentAt: new Date().toISOString() } }))
    } catch (err) { toast(err.message || '发送失败') }
    finally { setAiHelperBusy(false) }
  }
  // 场景十：AI 营养素建议生成 + 单条审核
  const generateAISupplement = async () => {
    setAiSupGenerating(true)
    try {
      const r = await staffAPI.generateAISupplementSuggest(id)
      toast(`AI生成 ${r.count} 条营养素建议，请营养师审核`)
      loadSupplements()
    } catch (err) { toast(err.message || 'AI生成失败') }
    finally { setAiSupGenerating(false) }
  }
  const reviewAISupplement = async (supId, action) => {
    try {
      await staffAPI.reviewAISupplement(id, supId, action)
      toast(action === 'approve' ? '已采纳营养素建议' : action === 'withdraw' ? '已撤回' : '已拒绝')
      loadSupplements()
    } catch (err) { toast(err.message || '操作失败') }
  }

  // 用药信息核对（健康顾问）：只核对录入内容与客户提供资料是否一致，不作处方或用药决策
  const reviewMedication = async (medId, action) => {
    try {
      await staffAPI.reviewPatientMedication(id, medId, action)
      toast(action === 'approve' ? '用药信息已核对并归档' : action === 'withdraw' ? '已撤回' : '已退回订正')
      loadMedications()
    } catch (err) { toast(err.message || '操作失败') }
  }

  // 场景五：推送推荐内容
  const pushRecommendedContent = async (knowledgeId) => {
    setAiHelperBusy(true)
    try {
      await staffAPI.pushKnowledge(knowledgeId, [id])
      toast('已推送给会员')
      setAiHelper(h => ({ ...h, data: { ...h.data, items: h.data.items.map(it => it.knowledgeId === knowledgeId ? { ...it, alreadyPushed: true } : it) } }))
    } catch (err) { toast(err.message || '推送失败') }
    finally { setAiHelperBusy(false) }
  }

  // 4.3 录入筛查结果
  const handleSaveScreeningRecord = async () => {
    if (!screeningForm.screeningL1) return toast('请选择筛查大类')
    if (!screeningForm.screeningL2) return toast('请选择具体分类')
    try {
      setScreeningSaving(true)
      // 编译三类项目到后端字段
      // 把检验医嘱（含子项目）打平为 reportItems
      // 结论按检验单(orderName)维度共用一条，赋给该单下所有子项的conclusion字段，跟AI提取路径的展示逻辑兼容
      const flatLabItems = (screeningForm.reportItems || []).flatMap(order =>
        order.subItems && order.subItems.length > 0
          ? order.subItems.map(sub => ({ name: sub.name, value: sub.value || '', unit: sub.unit || '', referenceRange: sub.referenceRange || '', status: sub.status || 'normal', orderName: order.name, conclusion: order.conclusion || '' }))
          : [{ name: order.name, value: order.value || '', unit: order.unit || '', referenceRange: order.referenceRange || '', status: order.status || 'normal', orderName: '', conclusion: order.conclusion || '' }]
      )
      const funcAsReportItems = (screeningForm.funcTestItems || []).map(f => ({ name: f.name, value: f.result || '', unit: '', referenceRange: '', status: 'unknown', itemType: 'data' }))
      // 保留 OCR 识别的检查项目（影像/内镜等，含检查所见/诊断意见），手动编辑不丢失
      const imagingItems = (screeningForm._imagingItems || []).map(i => ({ ...i, itemType: 'imaging' }))
      const allReportItems = [...flatLabItems, ...funcAsReportItems, ...imagingItems]
      const examDesc = (screeningForm.examOrderItems || []).map(e => { if (!e.name) return ''; return e.description ? `【${e.name}】\n${e.description}` : `【${e.name}】` }).filter(Boolean).join('\n\n') || screeningForm.examDescription || ''
      const examConc = (screeningForm.examOrderItems || []).map(e => { if (!e.name) return ''; return e.conclusion ? `【${e.name}】\n${e.conclusion}` : `【${e.name}】` }).filter(Boolean).join('\n\n') || screeningForm.examConclusion || ''
      const examMainConclusions = Object.fromEntries((screeningForm.examOrderItems || []).filter(e => e.name && e.mainConclusion).map(e => [e.name, e.mainConclusion]))
      const allL3Names = [...(screeningForm.reportItems || []).map(r => r.name), ...(screeningForm.examOrderItems || []).map(e => e.name), ...(screeningForm.funcTestItems || []).map(f => f.name)].filter(Boolean)
      const payload = { ...screeningForm, reportItems: allReportItems, examDescription: examDesc, examConclusion: examConc, examMainConclusions, screeningL3Items: allL3Names }
      if (editingScreeningId) {
        await staffAPI.updateScreeningRecord(id, editingScreeningId, payload, screeningFiles)
        toast('筛查结果已更新')
      } else {
        await staffAPI.createScreeningRecord(id, payload, screeningFiles)
        toast('筛查结果已录入')
      }
      setShowScreeningForm(false)
      setEditingScreeningId(null)
      setScreeningForm({ title: '', screeningCategory: '', screeningL1: '', screeningL2: '', screeningL3: '', screeningL3Items: [], checkDate: '', hospital: '', note: '', reportItems: [], examOrderItems: [], funcTestItems: [], examDescription: '', examConclusion: '', linkedItemType: null })
      setScreeningFiles([])
      setScreeningLinkedItem(null)
      setScreeningAutoMatches([])
      loadScreening()
    } catch (err) { toast(err.message || '录入失败') }
    finally { setScreeningSaving(false) }
  }

  const handleRecalculateScore = async () => {
    try {
      setScoreLoading(true)
      await staffAPI.recalculateScore(id)
      toast('健康评分已重新计算')
      load()
    } catch (err) {
      toast(err.message || '计算失败')
    } finally {
      setScoreLoading(false)
    }
  }

  const handleFollowUpCreated = () => {
    setShowFollowUpModal(false)
    toast('随访记录已保存')
    loadFollowUps()
    load()
  }

  const handleAudit = async (action) => {
    try {
      setAuditLoading(true)
      await staffAPI.auditReport(showReportDetail._id, { action, rejectReason })
      toast(action === 'approve' ? '已审核通过' : '已驳回')
      setShowReportDetail(null)
      setRejectReason('')
      setShowRejectInput(false)
      loadReports()
    } catch (err) {
      toast(err.message || '操作失败')
    } finally {
      setAuditLoading(false)
    }
  }

  if (loading) return <div className="page-loading">加载中...</div>
  if (!data) return <div className="page">{loadError || '会员不存在'}</div>

  const { user, recentFollowUps, recentRecords } = data
  const age = user.age ? `${user.age}岁` : '-'
  const numericAge = Number(user.age)
  const isPediatricBodyComp = Number.isFinite(numericAge) && numericAge >= 0 && numericAge < 18
  const bodyCompMetrics = isPediatricBodyComp ? PEDIATRIC_BODY_COMP_METRICS : ADULT_BODY_COMP_METRICS
  const bmi = user.height && user.weight
    ? (user.weight / Math.pow(user.height / 100, 2)).toFixed(1)
    : null
  const latestBodyCompHistory = [...(user.bodyCompHistory || [])]
    .sort((a, b) => String(a?.measuredAt || a?.recordedAt || '').localeCompare(String(b?.measuredAt || b?.recordedAt || '')))
    .at(-1) || {}
  const displayBodyComposition = { ...(user.bodyComposition || {}), ...latestBodyCompHistory }
  const riskCategories = [['tumor_risk', '肿瘤风险'], ['cardiovascular_risk', '心脑血管病风险'], ['chronic_disease', '慢性病及其他风险']]
  const hasConfirmedRisk = riskCategories.some(([key]) => normalizeRiskTagValues(user.healthRiskTags?.[key] || (key === 'chronic_disease' ? user.chronicDiseases || [] : [])).length > 0)

  return (
    // 2026-07-09 金娟反复反馈"界面看不到全局，要键盘左右移动才能找到按键"：会员详情页内某些
    // grid(repeat(3,1fr) 含固定宽input/nowrap长label) 会把格子撑到 min-content 宽度，导致整页横向溢出。
    // 逐个格子加 minmax(0,1fr) 风险大且易漏，这里在页面根容器统一加 overflowX:hidden 兜底——
    // 消灭页面级横向滚动条(金娟"键盘左右移动"的直接根源)；内部需要横向滚动的区块(趋势图/tab条/表格)
    // 各自已有 overflowX:auto，不受影响。
    <div className="page" style={{ overflowX: 'hidden', maxWidth: '100%' }}>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => nav('/patients')}>← 返回</button>
          <div>
            <h1 className="page-title" style={{ marginBottom: 2 }}>
              {user.name}
              {user.patientType === 'vip' && <span className="badge badge-warning" style={{ marginLeft: 8 }}>VIP</span>}
              <span className="badge" style={{ marginLeft: 8, background: user.clientBrand === 'jinyisen' ? '#EAF2FF' : '#E8F5EF', color: user.clientBrand === 'jinyisen' ? '#2459A9' : '#1E6B50' }}>
                {user.clientBrand === 'jiayiguanjia' ? '嘉医管家' : user.clientBrand === 'jinyisen' ? '金伊森' : '归属未设置'}
              </span>
            </h1>
            <p className="page-subtitle">
              {user.phone} · {user.gender} · {age} · 系统建档：{user.createdAt ? new Date(user.createdAt).toLocaleString('zh-CN') : '历史数据未记录'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowReferralModal(true)}>🔀 转介</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowMessageModal(true)}>💬 发消息</button>
        </div>
      </div>

      {location.state?.sourceTodo && (
        <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 10, background: '#FFF8E8', border: '1px solid #F4D58D', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ fontSize: 18 }}>📌</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#8A5A00' }}>当前处理：{location.state.sourceTodo.label || '待处理任务'}</div>
            <div style={{ fontSize: 13, color: '#4A6558', marginTop: 3, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.6 }}>{location.state.sourceTodo.summary || '请核对本页对应信息并完成处理'}</div>
            {location.state.sourceTodo.updateLocation && <div style={{ fontSize: 12, color: '#8A5A00', marginTop: 4, fontWeight: 600 }}>更新位置：{location.state.sourceTodo.updateLocation}</div>}
            {location.state.sourceTodo.type === 'risk_review' && tab !== 'ai-risk' && <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => setTab('ai-risk')}>查看完整风险依据</button>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {location.state.sourceTodo.type === 'risk_review' && <button type="button" className="btn btn-primary btn-sm" disabled={riskApproving} onClick={handleCloseRiskTodo}>{riskApproving ? '处理中…' : '已核对，确认关闭任务'}</button>}
            <button className="btn btn-secondary btn-sm" onClick={() => nav(location.pathname + location.search, { replace: true, state: {} })}>{location.state.sourceTodo.type === 'risk_review' ? '仅隐藏提示' : '关闭提示'}</button>
          </div>
        </div>
      )}

      {/* AI 从专项筛查异常项生成，健康顾问分三类审核 */}
      <div style={{ marginBottom: 12, padding: showTagEditor || hasConfirmedRisk ? '10px 14px' : '8px 14px', background: '#F7FAF8', borderRadius: 10, border: '1px solid #EDF2EE' }}>
        {!showTagEditor && !hasConfirmedRisk && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 22, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#4A6558' }}>风险概览</span>
              <span style={{ fontSize: 12, color: '#8AA89C' }}>暂无已确认风险</span>
              {user.healthRiskTags?.status && <span style={{ fontSize: 11, color: user.healthRiskTags.status === 'reviewed' ? '#16A34A' : '#D97706', background: user.healthRiskTags.status === 'reviewed' ? '#ECFDF5' : '#FFF7ED', borderRadius: 999, padding: '3px 7px' }}>{user.healthRiskTags.status === 'reviewed' ? '风险标签已审核' : '风险标签待审核'}</span>}
            </div>
            {['familyDoctor','superadmin'].includes(staff?.role) && <button className="btn btn-secondary btn-sm" onClick={() => { const t = user.healthRiskTags || {}; setTagEditorDiseases({ tumor_risk: normalizeRiskTagValues(t.tumor_risk || []), cardiovascular_risk: normalizeRiskTagValues(t.cardiovascular_risk || []), chronic_disease: normalizeRiskTagValues(t.chronic_disease || user.chronicDiseases || []) }); setTagEditorInput({ tumor_risk: '', cardiovascular_risk: '', chronic_disease: '' }); setShowTagEditor(true) }}>编辑风险标签</button>}
          </div>
        )}
        {(showTagEditor || hasConfirmedRisk) && riskCategories.map(([key, label]) => {
          const values = normalizeRiskTagValues(user.healthRiskTags?.[key] || (key === 'chronic_disease' ? user.chronicDiseases || [] : []))
          const addTags = () => {
            const additions = String(tagEditorInput[key] || '').split(/[、,，;；\n]+/).map(v => v.trim()).filter(Boolean)
            if (!additions.length) return
            setTagEditorDiseases(cur => ({ ...cur, [key]: [...new Set([...(cur[key] || []), ...additions])] }))
            setTagEditorInput(cur => ({ ...cur, [key]: '' }))
          }
          const handleTagInputChange = value => {
            if (!/[、,，;；\n]/.test(value)) {
              setTagEditorInput(cur => ({ ...cur, [key]: value }))
              return
            }
            const parts = value.split(/[、,，;；\n]+/)
            const endsWithSeparator = /[、,，;；\n]$/.test(value)
            const remainder = endsWithSeparator ? '' : parts.pop() || ''
            const additions = parts.map(v => v.trim()).filter(Boolean)
            if (additions.length) {
              setTagEditorDiseases(cur => ({ ...cur, [key]: [...new Set([...(cur[key] || []), ...additions])] }))
            }
            setTagEditorInput(cur => ({ ...cur, [key]: remainder }))
          }
          const handleTagPaste = event => {
            const pasted = event.clipboardData.getData('text')
            if (!/[、,，;；\n]/.test(pasted)) return
            event.preventDefault()
            const additions = `${tagEditorInput[key] || ''}${pasted}`.split(/[、,，;；\n]+/).map(v => v.trim()).filter(Boolean)
            setTagEditorDiseases(cur => ({ ...cur, [key]: [...new Set([...(cur[key] || []), ...additions])] }))
            setTagEditorInput(cur => ({ ...cur, [key]: '' }))
          }
          return <div key={key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minHeight: showTagEditor ? 32 : undefined, marginBottom: showTagEditor ? 0 : 4 }}>
            <span style={{ width: 120, fontSize: 12, fontWeight: 600, color: '#4A6558', paddingTop: 3 }}>{label}：</span>
            {showTagEditor ? <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: (tagEditorDiseases[key] || []).length ? 7 : 0 }}>
                {(tagEditorDiseases[key] || []).map(v => <span key={v} className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  {v}<button type="button" aria-label={`删除${v}`} onClick={() => setTagEditorDiseases(cur => ({ ...cur, [key]: (cur[key] || []).filter(item => item !== v) }))} style={{ border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
                </span>)}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input className="form-input" style={{ flex: 1, fontSize: 12 }} value={tagEditorInput[key] || ''} placeholder="输入标签，逗号、顿号或分号后自动添加" onChange={e => handleTagInputChange(e.target.value)} onPaste={handleTagPaste} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); addTags() } }} />
                <button type="button" className="btn btn-secondary btn-sm" onClick={addTags}>＋ 添加</button>
              </div>
            </div>
              : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>{values.length ? values.map(v => <button key={v} type="button" onClick={() => openRiskEvidence(v, label)} title="点击查看判定来源" style={{ border: 0, cursor: 'pointer', whiteSpace: 'normal', textAlign: 'left', lineHeight: 1.45 }} className="badge badge-danger">{v} · 查看来源</button>) : <span style={{ fontSize: 12, color: '#A0AAA5' }}>暂无</span>}</div>}
          </div>
        })}
        <div style={{ display: (showTagEditor || hasConfirmedRisk) ? 'flex' : 'none', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
          {!showTagEditor ? <>
            {['familyDoctor','superadmin'].includes(staff?.role) && <button className="btn btn-primary btn-sm" onClick={() => { const t = user.healthRiskTags || {}; setTagEditorDiseases({ tumor_risk: normalizeRiskTagValues(t.tumor_risk || []), cardiovascular_risk: normalizeRiskTagValues(t.cardiovascular_risk || []), chronic_disease: normalizeRiskTagValues(t.chronic_disease || user.chronicDiseases || []) }); setTagEditorInput({ tumor_risk: '', cardiovascular_risk: '', chronic_disease: '' }); setShowTagEditor(true) }}>人工编辑标签</button>}
          </> : <><button className="btn btn-secondary btn-sm" style={{ color: '#DC3545' }} onClick={() => setTagEditorDiseases({ tumor_risk: [], cardiovascular_risk: [], chronic_disease: [] })}>清空全部</button><button className="btn btn-secondary btn-sm" onClick={() => setShowTagEditor(false)}>取消</button><button className="btn btn-primary btn-sm" onClick={handleSaveTags} disabled={tagSaving}>{tagSaving ? '保存中…' : '保存确认'}</button></>}
          {user.healthRiskTags?.status && <span style={{ fontSize: 12, color: user.healthRiskTags.status === 'reviewed' ? '#16A34A' : '#D97706', alignSelf: 'center' }}>{user.healthRiskTags.status === 'reviewed' ? `已审核${user.healthRiskTags.reviewedByName ? ' · '+user.healthRiskTags.reviewedByName : ''}` : '待审核'}</span>}
        </div>
      </div>

      {/* 服务效期提示 */}
      {user.serviceExpiry && (() => {
        const left = Math.ceil((new Date(user.serviceExpiry) - new Date()) / (1000 * 60 * 60 * 24))
        if (left > 30) return null
        const color = left <= 0 ? '#DC3545' : left <= 7 ? '#DC3545' : '#D97706'
        const bg = left <= 0 ? '#FEF2F2' : left <= 7 ? '#FEF2F2' : '#FFFBEB'
        return (
          <div style={{ marginBottom: 12, padding: '10px 16px', background: bg, borderRadius: 8, border: `1px solid ${color}20`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>{left <= 0 ? '🔴' : '⏰'}</span>
            <div>
              <span style={{ color, fontWeight: 600, fontSize: 14 }}>
                {left <= 0 ? '会员服务已到期' : `会员服务还剩 ${left} 天到期`}
              </span>
              <span style={{ color: '#666', fontSize: 13, marginLeft: 10 }}>
                {getServicePackageLabel(user.servicePackage)} · 到期：{new Date(user.serviceExpiry).toLocaleDateString('zh-CN')}
              </span>
            </div>
          </div>
        )
      })()}

      {/* 问卷自动填档：冲突待审核提醒 / 自动写入记录 / 手动导入入口 */}
      {(() => {
        const draft = user.archiveDraft
        const pending = draft && draft.status === 'pending' && (draft.items || []).length > 0
        if (pending) {
          return (
            <div style={{ marginBottom: 12, padding: '10px 16px', background: '#FEF3C7', borderRadius: 8, border: '1px solid #FDE68A', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <div style={{ flex: 1, minWidth: 180 }}>
                <span style={{ color: '#92400E', fontWeight: 600, fontSize: 14 }}>问卷答案与档案现有记录冲突（{draft.items.length} 项）</span>
                <span style={{ color: '#666', fontSize: 13, marginLeft: 10 }}>来自「{draft.questionnaireTitle || '健康问卷'}」，无冲突的字段已自动写入，以下需人工确认</span>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => openArchiveDraft(draft)}>审核并写入</button>
              <button className="btn btn-secondary btn-sm" onClick={handleDismissArchiveDraft} disabled={archiveBusy}>忽略</button>
            </div>
          )
        }
        if (qResponses.length > 0) {
          return (
            <div style={{ marginBottom: 12, padding: '8px 14px', background: '#F6F9F7', borderRadius: 8, border: '1px solid #D8EDE3', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#4A6558' }}>📝 从已答问卷自动填充健康档案：</span>
              <select id="qresp-select" className="form-control" style={{ width: 'auto', maxWidth: 320, fontSize: 13, padding: '4px 8px' }} defaultValue={qResponses[0].responseId}>
                {qResponses.map(r => <option key={r.responseId} value={r.responseId}>{r.title}（{new Date(r.submittedAt).toLocaleDateString('zh-CN')}）</option>)}
              </select>
              <button className="btn btn-secondary btn-sm" disabled={archiveBusy}
                onClick={() => handleGenerateArchiveDraft(document.getElementById('qresp-select')?.value)}>
                {archiveBusy ? '生成中…' : '生成档案草稿'}
              </button>
            </div>
          )
        }
        return null
      })()}

      {/* 膳食调查问卷：营养师复核（与健管专员审核写入档案是独立并行的两道确认，互不阻塞） */}
      {qResponses.filter(r => r.isDietarySurvey && r.nutritionistReview?.status !== 'reviewed').map(r => (
        <div key={r.responseId} style={{ marginBottom: 12, padding: '10px 16px', background: '#F0FDF4', borderRadius: 8, border: '1px solid #BBF7D0', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 18 }}>🥗</span>
          <div style={{ flex: 1, minWidth: 180 }}>
            <span style={{ color: '#166534', fontWeight: 600, fontSize: 14 }}>膳食调查问卷待营养师复核</span>
            <span style={{ color: '#666', fontSize: 13, marginLeft: 10 }}>提交于 {new Date(r.submittedAt).toLocaleDateString('zh-CN')}</span>
          </div>
          {(staff?.role === 'nutritionist' || staff?.role === 'superadmin') && (
            <button className="btn btn-primary btn-sm" disabled={dietaryReviewBusy} onClick={() => handleNutritionistReview(r.responseId)}>
              {dietaryReviewBusy ? '提交中…' : '复核确认'}
            </button>
          )}
        </div>
      ))}

      {/* 问卷自动写入档案的历史记录（无冲突项，系统已直接写入，供健康顾问核查） */}
      <ArchiveChangeLogPanel log={user.archiveChangeLog} />
      <ArchiveAutoLogPanel log={user.archiveAutoLog} />
      {/* 健管专员人工审核确认写入档案的记录（有冲突需人工判断的字段） */}
      <ArchiveConfirmLogPanel log={user.archiveConfirmLog} />

      {/* Tabs */}
      {(() => {
        const primaryTabs = [
          { key: 'info',          label: '基本信息' },
          { key: 'records',       label: '健康档案' },
          { key: 'reports',       label: '体检报告' },
          { key: 'portrait',      label: '健康画像' },
          { key: 'medications',   label: '用药与营养' },
          ...(user.aiPilotFeatures?.stageAssessment ? [{ key: 'aiReview', label: '阶段性健康评估' }] : []),
          { key: 'plans',         label: '管理方案' },
          { key: 'followups',     label: '随访记录' },
        ]
        const secondaryTabs = [
          { key: 'ai',            label: 'AI健康信息整理' },
          { key: 'serviceRecords', label: '服务记录' },
          { key: 'referrals',     label: '转介记录' },
          { key: 'consumption',   label: '消费记录' },
          { key: 'family',        label: '家庭信息' },
          { key: 'membership',    label: '会员信息' },
        ]
        const isSecondaryTab = secondaryTabs.some(t => t.key === tab)
        const showSecondaryTabs = showMoreTabs || isSecondaryTab
        const renderTab = (t, isSecondary = false) => (
          <button
            key={t.key}
            className={`tab-btn ${tab === t.key ? 'active' : ''}`}
            onClick={() => { setTab(t.key); if (!isSecondary) setShowMoreTabs(false) }}
          >
            {t.label}
          </button>
        )
        return <div style={{ marginBottom: 20 }}>
          <div className="tabs" style={{ marginBottom: showSecondaryTabs ? 8 : 0 }}>
            {primaryTabs.map(t => renderTab(t))}
            <button className={`tab-btn ${isSecondaryTab ? 'active' : ''}`} onClick={() => setShowMoreTabs(v => !v)}>更多 {showSecondaryTabs ? '⌃' : '⌄'}</button>
          </div>
          {showSecondaryTabs && <div className="tabs patient-secondary-tabs">{secondaryTabs.map(t => renderTab(t, true))}</div>}
        </div>
      })()}

      {tab === 'aiReview' && user.aiPilotFeatures?.stageAssessment && <AiCaseReviewPanel patientId={id} staff={staff} toast={toast} />}

      {/* ── Info Tab ── */}
      {tab === 'info' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* 基本资料 */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">基本资料</div>
              {!editingBasicInfo
                ? <button className="btn btn-secondary btn-sm" onClick={() => { setEditingBasicInfo(true); setBasicInfoForm(buildBasicInfoForm(user)) }}>编辑</button>
                : <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={handleSaveBasicInfo}>保存</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setEditingBasicInfo(false); setBasicInfoForm(buildBasicInfoForm(user)) }}>取消</button>
                  </div>
              }
            </div>
            <div className="card-body">
              {editingBasicInfo ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { key: 'name', label: '姓名' },
                    { key: 'phone', label: '手机号码（用户端登录账号）', type: 'tel' },
                  ].map(({ key, label, type }) => (
                    <div key={key} className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: 12, color: '#8AA89C' }}>{label}</label>
                      <input className="form-input" type={type || 'text'} value={basicInfoForm[key] || ''}
                        onChange={e => setBasicInfoForm(f => ({ ...f, [key]: e.target.value }))} />
                    </div>
                  ))}
                  <div className="form-group" style={{ marginBottom: 0, display: 'flex', gap: 8 }}>
                    <div style={{ flexShrink: 0, width: 90 }}>
                      <label style={{ fontSize: 12, color: '#8AA89C' }}>证件类型</label>
                      <select className="form-input" value={basicInfoForm.idType || 'idCard'} onChange={e => setBasicInfoForm(f => ({ ...f, idType: e.target.value }))}>
                        <option value="idCard">身份证</option>
                        <option value="passport">护照</option>
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 12, color: '#8AA89C' }}>{basicInfoForm.idType === 'passport' ? '护照号' : '身份证号'}</label>
                      <input className="form-input" value={basicInfoForm.idNumber || ''}
                        onChange={e => setBasicInfoForm(f => ({ ...f, idNumber: e.target.value }))} />
                    </div>
                  </div>
                  {[
                    { key: 'birthDate', label: '出生日期', type: 'date' },
                    { key: 'height', label: '身高(cm)', type: 'number' },
                    { key: 'weight', label: '体重(kg)', type: 'number' },
                    { key: 'address', label: '联系地址' },
                    { key: 'contactName', label: '紧急联系人' },
                    { key: 'contactPhone2', label: '紧急联系电话' },
                    { key: 'deliveryAddress', label: '快递配送地址' },
                    { key: 'workplace', label: '所在企业' },
                    { key: 'occupation', label: '所在行业' },
                  ].map(({ key, label, type }) => (
                    <div key={key} className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: 12, color: '#8AA89C' }}>{label}</label>
                      <input className="form-input" type={type || 'text'} value={basicInfoForm[key] || ''}
                        onChange={e => setBasicInfoForm(f => ({ ...f, [key]: e.target.value }))} />
                    </div>
                  ))}
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>性别</label>
                    <select className="form-input" value={basicInfoForm.gender || '未知'} onChange={e => setBasicInfoForm(f => ({ ...f, gender: e.target.value }))}>
                      <option value="未知">未知</option><option value="男">男</option><option value="女">女</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>称呼（AI发消息用）</label>
                    <input className="form-input" value={basicInfoForm.preferredTitle || ''}
                      placeholder="如：潘老师 / 张姐 / 李先生（留空则按性别自动称呼）"
                      onChange={e => setBasicInfoForm(f => ({ ...f, preferredTitle: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>婚姻状况</label>
                    <select className="form-input" value={basicInfoForm.maritalStatus || ''} onChange={e => setBasicInfoForm(f => ({ ...f, maritalStatus: e.target.value }))}>
                      <option value="">未填写</option><option>未婚</option><option>已婚</option><option>离异</option><option>丧偶</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>民族</label>
                    <input className="form-input" value={basicInfoForm.ethnicity || ''} onChange={e => setBasicInfoForm(f => ({ ...f, ethnicity: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>学历</label>
                    <select className="form-input" value={basicInfoForm.education || ''} onChange={e => setBasicInfoForm(f => ({ ...f, education: e.target.value }))}>
                      <option value="">未填写</option>
                      {['小学','初中','高中','大专','本科','硕士','博士'].map(v => <option key={v}>{v}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>是否每年健康体检</label>
                    <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                      {['是','否'].map(v => (
                        <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                          <input type="radio" checked={basicInfoForm.hasAnnualCheckup === v} onChange={() => setBasicInfoForm(f => ({ ...f, hasAnnualCheckup: v }))} />{v}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>慢性病标签</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                      {(basicInfoForm.chronicDiseases || []).map((d, i) => (
                        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 10px', borderRadius: 99, background: '#fee2e2', color: '#DC3545', fontSize: 12, fontWeight: 500 }}>
                          {d}
                          <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC3545', padding: '0 2px', lineHeight: 1, fontSize: 14 }}
                            onClick={() => setBasicInfoForm(f => ({ ...f, chronicDiseases: f.chronicDiseases.filter((_, j) => j !== i) }))}>×</button>
                        </span>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <input
                        className="form-input"
                        placeholder="输入慢性病名称后按 Enter 或点添加"
                        style={{ flex: 1, fontSize: 13 }}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && e.target.value.trim()) {
                            e.preventDefault()
                            const v = e.target.value.trim()
                            if (!(basicInfoForm.chronicDiseases || []).includes(v))
                              setBasicInfoForm(f => ({ ...f, chronicDiseases: [...(f.chronicDiseases || []), v] }))
                            e.target.value = ''
                          }
                        }}
                      />
                      <button type="button" className="btn btn-secondary btn-sm" onClick={e => {
                        const inp = e.currentTarget.previousSibling
                        const v = inp.value.trim()
                        if (v && !(basicInfoForm.chronicDiseases || []).includes(v)) {
                          setBasicInfoForm(f => ({ ...f, chronicDiseases: [...(f.chronicDiseases || []), v] }))
                          inp.value = ''
                        }
                      }}>添加</button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {['高血压','糖尿病','冠心病','高脂血症','痛风','甲状腺疾病','慢性肾病','脂肪肝','骨质疏松','慢阻肺'].map(d => (
                        <button key={d} type="button"
                          style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, border: `1px solid ${ (basicInfoForm.chronicDiseases||[]).includes(d) ? '#DC3545' : '#ddd'}`, background: (basicInfoForm.chronicDiseases||[]).includes(d) ? '#fee2e2' : '#f9f9f9', color: (basicInfoForm.chronicDiseases||[]).includes(d) ? '#DC3545' : '#666', cursor: 'pointer' }}
                          onClick={() => setBasicInfoForm(f => {
                            const cur = f.chronicDiseases || []
                            return { ...f, chronicDiseases: cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d] }
                          })}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>
                      个性化喜好/禁忌
                      <span style={{ marginLeft: 6, fontSize: 11, color: '#D97706', background: '#FEF3E2', border: '1px solid #F6D860', borderRadius: 4, padding: '1px 5px' }}>AI会读取</span>
                    </label>
                    <textarea className="form-input" rows={3} value={basicInfoForm.preferences || ''}
                      placeholder="如：不喜欢过年期间到医院、忌讳提及某疾病名称——AI生成随访建议/健康教练消息/内容推荐时会参考"
                      onChange={e => setBasicInfoForm(f => ({ ...f, preferences: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>备注</label>
                    <textarea className="form-input" rows={3} value={basicInfoForm.basicRemark || ''}
                      placeholder="基本信息相关的补充说明"
                      onChange={e => setBasicInfoForm(f => ({ ...f, basicRemark: e.target.value }))} />
                  </div>
                </div>
              ) : (
                <>
                  <InfoRow label="姓名" value={user.name} />
                  <InfoRow label="称呼（AI用）" value={(() => {
                    // 与后端 resolveTitle 对齐：preferredTitle 优先，否则按性别+姓氏兜底，未标注时标「自动」
                    if (user.preferredTitle && user.preferredTitle.trim()) return user.preferredTitle.trim()
                    const surname = (user.name || '').trim().charAt(0)
                    if (user.gender === '男') return `${surname ? surname + '先生' : (user.name || '您')}（自动）`
                    if (user.gender === '女') return `${surname ? surname + '女士' : (user.name || '您')}（自动）`
                    return `${user.name || '您'}（自动）`
                  })()} />
                  <InfoRow label="手机号码（用户端登录账号）" value={user.phone || user.contactPhone || '-'} />
                  <InfoRow label="系统建档时间" value={user.createdAt ? new Date(user.createdAt).toLocaleString('zh-CN') : '历史数据未记录'} />
                  <InfoRow label="微信小程序" value={user.wechatMpOpenid ? '已绑定' : '未绑定'} />
                  <InfoRow label="最近登录" value={user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('zh-CN') : '-'} />
                  <InfoRow label="累计登录时长" value={user.totalLoginSeconds ? `${Math.floor(user.totalLoginSeconds / 3600)}小时${Math.floor((user.totalLoginSeconds % 3600) / 60)}分钟` : '0分钟'} />
                  <InfoRow label="登录次数" value={user.loginCount || 0} />
                  <InfoRow label="性别" value={user.gender} />
                  <InfoRow label="年龄" value={age} />
                  <InfoRow label="身高" value={user.height ? `${user.height} cm` : '-'} />
                  <InfoRow label="体重" value={user.weight ? `${user.weight} kg` : '-'} />
                  {bmi && <InfoRow label="BMI" value={bmi} />}
                  <InfoRow label={user.idType === 'passport' ? '护照' : '身份证'} value={user.idNumber || '-'} />
                  <InfoRow label="常住所在地" value={[user.residence?.province, user.residence?.city, user.residence?.district].filter(Boolean).join(' ') || '-'} />
                  <InfoRow label="联系地址" value={user.address || '-'} />
                  <InfoRow label="紧急联系人" value={user.contactName || '-'} />
                  <InfoRow label="紧急联系电话" value={user.contactPhone2 || '-'} />
                  <InfoRow label="快递配送地址" value={user.deliveryAddress || '-'} />
                  <InfoRow label="婚姻状况" value={user.maritalStatus || '-'} />
                  <InfoRow label="民族" value={user.ethnicity || '-'} />
                  <InfoRow label="学历" value={user.education || '-'} />
                  <InfoRow label="所在企业" value={user.workplace || '-'} />
                  <InfoRow label="所在行业" value={user.occupation || '-'} />
                  <InfoRow label="每年体检" value={user.hasAnnualCheckup || '-'} />
                  <div style={{ display: 'flex', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <span style={{ fontSize: 13, color: '#8AA89C', width: 90, flexShrink: 0 }}>慢性病</span>
                    <span style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {(user.chronicDiseases || []).length
                        ? user.chronicDiseases.map((d, i) => (
                            <span key={i} style={{ padding: '1px 10px', borderRadius: 99, background: '#fee2e2', color: '#DC3545', fontSize: 12, fontWeight: 500 }}>{d}</span>
                          ))
                        : <span style={{ fontSize: 13, color: '#1A2B24' }}>-</span>}
                    </span>
                  </div>
                  {user.preferences && (
                    <div style={{ marginTop: 10, padding: '8px 12px', background: '#FEF3E2', border: '1px solid #F6D860', borderRadius: 8, fontSize: 13, color: '#92400E', whiteSpace: 'pre-wrap' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 3 }}>⚠️ 个性化喜好/禁忌（AI会读取）</div>
                      {user.preferences}
                    </div>
                  )}
                  {user.basicRemark && (
                    <div style={{ marginTop: 10, padding: '8px 12px', background: '#F7F5F0', borderRadius: 8, fontSize: 13, color: '#4A6558', whiteSpace: 'pre-wrap' }}>
                      📝 {user.basicRemark}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 管理信息（可编辑） */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">管理信息</div>
              {!editing
                ? <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>编辑</button>
                : <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(false); setEditForm(buildEditForm(user)) }}>取消</button>
                    <button className="btn btn-primary btn-sm" onClick={handleSave}>保存</button>
                  </div>
              }
            </div>
            <div className="card-body">
              {editing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* 紧急联系人/紧急联系电话/快递配送地址已统一归到「基本信息」卡（与问卷自动填档字段口径一致，2026-07-11） */}
                  {[
                    { label: '健康规划师',field: 'assignedHealthPlanner',    role: 'healthPlanner' },
                    { label: '健康顾问',  field: 'assignedFamilyDoctor',     role: 'familyDoctor' },
                    { label: '营养师',    field: 'assignedNutritionist',     role: 'nutritionist' },
                    { label: '健管专员',  field: 'assignedHealthManager',    role: 'healthManager' },
                    { label: '专科医师',  field: 'assignedSpecialist',       role: 'specialist' },
                    { label: '中医师',    field: 'assignedTcmDoctor',        role: 'tcmDoctor' },
                    { label: '心理咨询师',field: 'assignedPsychologist',     role: 'psychologist' },
                    { label: '运动复健师',field: 'assignedRehabSpecialist',  role: 'rehabSpecialist' },
                    { label: '就医专员',  field: 'assignedMedicalAssistant', role: 'medicalAssistant' },
                  ].map(({ label, field, role }) => (
                    <div key={field} className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">{label}</label>
                      <select className="form-input" value={editForm[field]}
                        onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}>
                        <option value="">-- 未分配 --</option>
                        {staffList.filter(s => s.role === role).map(s => (
                          <option key={s._id} value={s._id}>{s.name}{s.title ? ` · ${s.title}` : ''}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">客户归属</label>
                    <select className="form-input" value={editForm.clientBrand || ''}
                      onChange={e => setEditForm(f => ({
                        ...f,
                        clientBrand: e.target.value,
                        memberType: '',
                        servicePackage: '',
                      }))}>
                      <option value="">-- 未设置 --</option>
                      <option value="jiayiguanjia">嘉医管家</option>
                      <option value="jinyisen">金伊森</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">会员类型</label>
                    <select className="form-input" value={editForm.memberType || ''}
                      disabled={!editForm.clientBrand}
                      onChange={e => setEditForm(f => ({ ...f, memberType: e.target.value }))}>
                      <option value="">{editForm.clientBrand ? '-- 未设置 --' : '请先选择客户归属'}</option>
                      {memberTypeOptions.map(item => (
                        <option key={item._id} value={item.name}>{item.name}</option>
                      ))}
                      {editForm.memberType && !memberTypeOptions.some(item => item.name === editForm.memberType) && (
                        <option value={editForm.memberType}>{editForm.memberType}（历史值）</option>
                      )}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">服务包</label>
                    <select className="form-input" value={editForm.servicePackage}
                      disabled={!editForm.clientBrand}
                      onChange={e => setEditForm(f => ({ ...f, servicePackage: e.target.value }))}>
                      <option value="">{editForm.clientBrand ? '请选择服务包' : '请先选择客户归属'}</option>
                      {serviceOptions.map(s => (
                        <option key={s._id} value={s.name}>{s.name}</option>
                      ))}
                      {editForm.servicePackage && !serviceOptions.some(s => s.name === editForm.servicePackage) && (
                        <option value={editForm.servicePackage}>{editForm.servicePackage}（历史值）</option>
                      )}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">服务开始时间</label>
                    <input className="form-input" type="date" value={editForm.serviceStartDate}
                      onChange={e => setEditForm(f => ({ ...f, serviceStartDate: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">服务到期时间</label>
                    <input className="form-input" type="date" value={editForm.serviceExpiry}
                      onChange={e => setEditForm(f => ({ ...f, serviceExpiry: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">会员来源</label>
                    {/* 从 admin 会员来源配置选，不再手工录（2026-07-10 金娟）；兼容历史手工值 */}
                    <select className="form-input" value={editForm.source}
                      onChange={e => setEditForm(f => ({ ...f, source: e.target.value }))}>
                      <option value="">请选择会员来源</option>
                      {memberSourceOptions.map(s => (
                        <option key={s._id} value={s.name}>{s.name}</option>
                      ))}
                      {editForm.source && !memberSourceOptions.some(s => s.name === editForm.source) && (
                        <option value={editForm.source}>{editForm.source}（历史值）</option>
                      )}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">备注</label>
                    <textarea className="form-input" rows={3} value={editForm.remark}
                      onChange={e => setEditForm(f => ({ ...f, remark: e.target.value }))} />
                  </div>
                </div>
              ) : (
                <>
                  {/* 紧急联系人/紧急联系电话/快递配送地址已移至「基本信息」卡（2026-07-11） */}
                  <InfoRow label="健康规划师" value={user.assignedHealthPlanner?.name    || '-'} />
                  <InfoRow label="健康顾问"   value={user.assignedFamilyDoctor?.name     || '-'} />
                  <InfoRow label="营养师"     value={user.assignedNutritionist?.name     || '-'} />
                  <InfoRow label="健管专员"   value={user.assignedHealthManager?.name    || '-'} />
                  {user.assignedSpecialist       && <InfoRow label="专科医师"   value={user.assignedSpecialist?.name      || '-'} />}
                  {user.assignedTcmDoctor        && <InfoRow label="中医师"     value={user.assignedTcmDoctor?.name       || '-'} />}
                  {user.assignedPsychologist     && <InfoRow label="心理咨询师" value={user.assignedPsychologist?.name    || '-'} />}
                  {user.assignedRehabSpecialist  && <InfoRow label="运动复健师" value={user.assignedRehabSpecialist?.name || '-'} />}
                  {user.assignedMedicalAssistant && <InfoRow label="就医专员"   value={user.assignedMedicalAssistant?.name|| '-'} />}
                  <InfoRow label="客户归属" value={user.clientBrand === 'jiayiguanjia' ? '嘉医管家' : user.clientBrand === 'jinyisen' ? '金伊森' : '-'} />
                  <InfoRow label="会员类型" value={user.memberType || '-'} />
                  <InfoRow label="会员来源" value={user.source || '-'} />
                  <InfoRow label="服务包" value={getServicePackageLabel(user.servicePackage)} />
                  <InfoRow label="服务开始" value={user.serviceStartDate || '-'} />
                  <InfoRow label="服务到期" value={user.serviceExpiry || '-'} />
                  <InfoRow label="健康评分" value={(() => {
                    const s = user.healthScore
                    const g = user.healthScoreDetail?.grade
                    if (!s) return '-'
                    const c = { '优': '#22A06B', '良': '#1E6B50', '中': '#D97706', '差': '#DC3545' }[g] || '#8AA89C'
                    return <span>{s}分 {g && <span style={{ marginLeft: 6, padding: '1px 8px', borderRadius: 10, background: c + '20', color: c, fontSize: 12, fontWeight: 600 }}>{g}</span>}</span>
                  })()} />
                  {user.remark && (
                    <div style={{ marginTop: 8, padding: '8px 12px', background: '#f9f7f3', borderRadius: 8, fontSize: 13, color: '#4A6558' }}>
                      📝 {user.remark}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 医疗保障信息 */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">医疗保障信息</div>
              {!editingInsurance
                ? <button className="btn btn-secondary btn-sm" onClick={() => { setEditingInsurance(true); setInsuranceForm(buildInsuranceForm(user)) }}>编辑</button>
                : <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={handleSaveInsurance}>保存</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setEditingInsurance(false); setInsuranceForm(buildInsuranceForm(user)) }}>取消</button>
                  </div>
              }
            </div>
            <div className="card-body">
              {editingInsurance ? (
                <div style={{ display: 'grid', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 6 }}>基础医疗保障（三选一）</label>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      {['城镇医疗保险', '居民医疗保险', '自费'].map(opt => (
                        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14, color: '#1A2B24' }}>
                          <input type="radio" name="ins_basic" value={opt}
                            checked={insuranceForm.basic_insurance === opt}
                            onChange={() => setInsuranceForm(p => ({ ...p, basic_insurance: opt }))} />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 6 }}>商业医疗险（四选一）</label>
                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                      {['百万医疗险', '高端医疗险（亚洲版）', '高端医疗险（全球版）', '未购买'].map(opt => (
                        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14, color: '#1A2B24' }}>
                          <input type="radio" name="ins_commercial" value={opt}
                            checked={insuranceForm.commercial_medical === opt}
                            onChange={() => setInsuranceForm(p => ({ ...p, commercial_medical: opt }))} />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 6 }}>重疾险（三选一）</label>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      {['大陆险', '港险', '未购买'].map(opt => (
                        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14, color: '#1A2B24' }}>
                          <input type="radio" name="ins_critical" value={opt}
                            checked={insuranceForm.critical_illness === opt}
                            onChange={() => setInsuranceForm(p => ({ ...p, critical_illness: opt }))} />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#8AA89C', minWidth: 80 }}>基础医疗保障：</span>
                    <span style={{ fontSize: 13, color: '#1A2B24' }}>{user.basic_insurance || '-'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#8AA89C', minWidth: 80 }}>医疗险：</span>
                    <span style={{ fontSize: 13, color: '#1A2B24' }}>{user.commercial_medical || '-'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#8AA89C', minWidth: 80 }}>重疾险：</span>
                    <span style={{ fontSize: 13, color: '#1A2B24' }}>{user.critical_illness || '-'}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 健康需求 */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">健康需求</div>
              {!editingHealthNeeds
                ? <button className="btn btn-secondary btn-sm" onClick={() => { setEditingHealthNeeds(true); setHealthNeedsForm(buildHealthNeedsForm(user)) }}>编辑</button>
                : <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={handleSaveHealthNeeds}>保存</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditingHealthNeeds(false)}>取消</button>
                  </div>
              }
            </div>
            <div className="card-body">
              {editingHealthNeeds ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { key: 'healthConcern', label: '关注的健康问题', rows: 2 },
                    { key: 'healthConcernFor', label: '更关注谁的健康', rows: 1 },
                    { key: 'expectedService', label: '期望健康顾问服务', rows: 2 },
                    { key: 'hasHomeMonitor', label: '居家检测设备', rows: 2 },
                  ].map(({ key, label, rows }) => (
                    <div key={key}>
                      <label style={{ fontSize: 12, color: '#8AA89C' }}>{label}</label>
                      {rows > 1
                        ? <textarea className="form-input" rows={rows} value={healthNeedsForm[key] || ''} onChange={e => setHealthNeedsForm(f => ({ ...f, [key]: e.target.value }))} />
                        : <input className="form-input" value={healthNeedsForm[key] || ''} onChange={e => setHealthNeedsForm(f => ({ ...f, [key]: e.target.value }))} />
                      }
                    </div>
                  ))}
                  <div>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>居家小药箱</label>
                    <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                      {['是','否'].map(v => (
                        <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                          <input type="radio" checked={healthNeedsForm.hasMedicineCabinet === v} onChange={() => setHealthNeedsForm(f => ({ ...f, hasMedicineCabinet: v }))} />{v}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {[
                    ['关注的健康问题', user.healthConcern],
                    ['更关注谁的健康', user.healthConcernFor],
                    ['期望服务', user.expectedService],
                    ['居家检测设备', user.hasHomeMonitor],
                    ['居家小药箱', user.hasMedicineCabinet],
                  ].map(([label, val]) => val ? (
                    <div key={label} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid #f5f2ec' }}>
                      <span style={{ fontSize: 12, color: '#8AA89C', minWidth: 90 }}>{label}：</span>
                      <span style={{ fontSize: 13, color: '#1A2B24', flex: 1 }}>{val}</span>
                    </div>
                  ) : null)}
                  {!user.healthConcern && !user.expectedService && (
                    <div style={{ color: '#ccc', fontSize: 13 }}>暂未填写</div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 最近随访 */}
          <div className="card" style={{ gridColumn: 'span 2' }}>
            <div className="card-header">
              <div className="card-title">最近随访</div>
            </div>
            <div className="card-body">
              {recentFollowUps?.length > 0 ? (
                recentFollowUps.map(f => (
                  <div key={f._id} style={{
                    padding: '12px 0', borderBottom: '1px solid #f0ece4',
                    display: 'flex', gap: 16, alignItems: 'flex-start'
                  }}>
                    <span style={{ color: STATUS_COLOR[f.status] || '#666', fontSize: 12, minWidth: 50 }}>
                      {STATUS_MAP[f.status]}
                    </span>
                    <span style={{ fontSize: 12, color: '#8AA89C', minWidth: 80 }}>
                      {new Date(f.date).toLocaleDateString('zh-CN')}
                    </span>
                    <span style={{ fontSize: 12, color: '#4A6558' }}>[{TYPE_MAP[f.type]}]</span>
                    <span style={{ fontSize: 13, color: '#1A2B24', flex: 1 }}>{f.content || '无内容'}</span>
                    <span style={{ fontSize: 12, color: '#8AA89C' }}>{f.staffId?.name}</span>
                  </div>
                ))
              ) : (
                <div style={{ color: '#aaa', textAlign: 'center', padding: '16px 0', fontSize: 14 }}>
                  暂无随访记录
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Records Tab ── */}
      {tab === 'records' && (
        <div ref={archiveSectionsRef} className="health-archive-sections" onClick={handleArchiveSectionClick}>
        <style>{`.health-archive-sections>.archive-toolbar+.card,.health-archive-sections>.card{transition:box-shadow .2s}.health-archive-sections .archive-collapsed>:not(.card-header){display:none!important}.health-archive-sections .card-header[data-archive-toggle="true"]{cursor:pointer}.health-archive-sections .card-header[data-archive-toggle="true"]:after{content:'⌃';margin-left:10px;color:#1E6B50;font-size:18px}.health-archive-sections .archive-collapsed>.card-header[data-archive-toggle="true"]:after{content:'⌄'}`}</style>
        <div className="archive-toolbar" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
          <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); setAllArchiveSections(true) }}>全部收起</button>
          <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); setAllArchiveSections(false) }}>全部展开</button>
        </div>
        {/* 档案是问卷答案自动导入的，冲突提醒已在页面顶部单独展示（见"问卷自动填档"横幅）；
            一致的情况无需人工再次确认，故此处不再重复放置整体人工审核开关 */}

        {/* ── 初始健康数据录入 ── */}
        <InitialHealthRecordForm patientId={user._id} onSaved={() => load()} toast={toast} />
        <BatchHealthRecordImport patient={user} onSaved={() => load()} toast={toast} />

        {/* ── 健康评分卡片 ── */}
        {(() => {
          const detail = user.healthScoreDetail || {}
          const score = user.healthScore || 0
          const grade = detail.grade || (score >= 90 ? '优' : score >= 75 ? '良' : score >= 60 ? '中' : score > 0 ? '差' : '-')
          const gradeColor = { '优': '#22A06B', '良': '#1E6B50', '中': '#D97706', '差': '#DC3545' }[grade] || '#8AA89C'
          return (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <div className="card-title">健康评分</div>
                <button className="btn btn-primary btn-sm" onClick={handleRecalculateScore} disabled={scoreLoading}>
                  {scoreLoading ? '计算中...' : '重新计算'}
                </button>
              </div>
              <div style={{ padding: '16px 20px' }}>
                {score > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 32, flexWrap: 'wrap' }}>
                    {/* 总分 */}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 48, fontWeight: 700, color: gradeColor, lineHeight: 1 }}>{score}</div>
                      <div style={{ fontSize: 13, color: '#8AA89C', marginTop: 4 }}>满分100</div>
                      <div style={{ marginTop: 8, padding: '3px 12px', background: gradeColor + '20', borderRadius: 12, color: gradeColor, fontWeight: 600, fontSize: 15, display: 'inline-block' }}>
                        {grade}
                      </div>
                    </div>
                    {/* 分项明细 */}
                    {detail.deductions && (
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 8 }}>评分构成</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px' }}>
                          {[
                            ['基础健康分（初始60）', `${60 + (detail.deductions?.chronic || 0) + (detail.deductions?.lab || 0)}`],
                            ['生活方式分（初始40）', `${40 + (detail.deductions?.lifestyle || 0)}`],
                            ['慢性病扣分', `${detail.deductions?.chronic || 0}`],
                            ['体检指标扣分', `${detail.deductions?.lab || 0}`],
                            ['生活方式扣分', `${detail.deductions?.lifestyle || 0}`],
                            ['年龄性别调整', `${detail.ageGenderAdj >= 0 ? '+' : ''}${detail.ageGenderAdj || 0}`],
                          ].map(([label, val]) => (
                            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0', borderBottom: '1px solid #f0ede6' }}>
                              <span style={{ color: '#4A6558' }}>{label}</span>
                              <span style={{ fontWeight: 600, color: String(val).startsWith('-') ? '#DC3545' : '#1A2B24' }}>{val}</span>
                            </div>
                          ))}
                        </div>
                        {/* 2026-07-09：生活方式扣分明细，展示"扣N分具体扣在哪"（吸烟/运动/膳食/睡眠等各扣多少），
                            回应金娟"生活方式扣8分不知道扣的什么"。仅当有扣分明细时展示。 */}
                        {Array.isArray(detail.lifestyleBreakdown) && detail.lifestyleBreakdown.length > 0 && (
                          <div style={{ marginTop: 10, background: '#FFF8F5', border: '1px solid #FBE3D8', borderRadius: 8, padding: '10px 12px' }}>
                            <div style={{ fontSize: 12, color: '#B45309', fontWeight: 600, marginBottom: 6 }}>生活方式扣分明细</div>
                            {detail.lifestyleBreakdown.map((b, i) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12, padding: '3px 0', gap: 12 }}>
                                <span style={{ color: '#4A6558' }}>
                                  <span style={{ fontWeight: 600, color: '#1A2B24' }}>{b.label}</span>
                                  {b.reason ? <span style={{ color: '#8AA89C', marginLeft: 6 }}>{b.reason}</span> : null}
                                </span>
                                <span style={{ fontWeight: 700, color: '#DC3545', flexShrink: 0 }}>{b.points}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {detail.calculatedAt && (
                          <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>
                            计算时间：{new Date(detail.calculatedAt).toLocaleString('zh-CN')}
                          </div>
                        )}
                      </div>
                    )}
                    {/* 趋势 */}
                    {user.scoreHistory?.length >= 2 && (
                      <div>
                        <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 8 }}>评分趋势</div>
                        {(() => {
                          const hist = [...(user.scoreHistory || [])].slice(-8).reverse()
                          const W = 180, H = 60, PAD = 6
                          const vals = hist.map(h => h.score)
                          const min = Math.min(...vals, 0), max = Math.max(...vals, 100)
                          const range = max - min || 1
                          const xs = hist.map((_, i) => PAD + (i / Math.max(hist.length - 1, 1)) * (W - PAD * 2))
                          const ys = vals.map(v => H - PAD - ((v - min) / range) * (H - PAD * 2))
                          const pts = xs.map((x, i) => `${x},${ys[i]}`).join(' ')
                          return (
                            <svg width={W} height={H} style={{ display: 'block' }}>
                              <polyline fill="none" stroke="#1E6B50" strokeWidth="2" points={pts} />
                              {hist.map((h, i) => (
                                <circle key={i} cx={xs[i]} cy={ys[i]} r={3} fill="#1E6B50" />
                              ))}
                            </svg>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', padding: '12px 0' }}>
                    暂无评分，请先录入体检指标和生活方式数据，然后点击「重新计算」
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {/* ── 基本档案 ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title">基本档案</div>
            {!editingHealth
              ? <button className="btn btn-secondary btn-sm" onClick={() => setEditingHealth(true)}>编辑</button>
              : <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary btn-sm" onClick={handleSaveHealth}>保存</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setEditingHealth(false); setHealthForm(buildHealthForm(user)) }}>取消</button>
                </div>
            }
          </div>
          <div className="card-body">
            {editingHealth ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>血型 ABO</label>
                    <select className="form-control" value={healthForm.bloodTypeABO || ''} onChange={e => setHealthForm(p => ({ ...p, bloodTypeABO: e.target.value }))}>
                      <option value="">未知</option>
                      {['A','B','O','AB'].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>RH 血型</label>
                    <select className="form-control" value={healthForm.bloodTypeRH || ''} onChange={e => setHealthForm(p => ({ ...p, bloodTypeRH: e.target.value }))}>
                      <option value="">未知</option>
                      <option value="阳性">阳性</option>
                      <option value="阴性">阴性</option>
                    </select>
                  </div>
                </div>
                {[
                  { key: 'drugAllergy', label: '药物过敏', nested: true },
                  { key: 'foodAllergy', label: '食物过敏', nested: true },
                  { key: 'pastHistory', label: '既往史', nested: true },
                  { key: 'medicHistory', label: '是否长期服用中药或西药', nested: true },
                  { key: 'supplementHistory', label: '是否有长期服用营养补剂', nested: true },
                  { key: 'surgeryHistory', label: '手术史', nested: true },
                  { key: 'traumaHistory', label: '外伤史', nested: false },
                  { key: 'transfusionHistory', label: '输血史', nested: false },
                  { key: 'poisoningHistory', label: '中毒史', nested: false },
                  { key: 'infectiousHistory', label: '传染病史', nested: false },
                  { key: 'vaccinationHistory', label: '预防接种史', nested: false },
                  { key: 'otherDiseaseHistory', label: '其他特殊疾病史', nested: false },
                  { key: 'familyHistoryNote', label: '家族史', nested: true },
                  ...(user.gender === '女' ? [
                    { key: 'sexualHistory', label: '是否有性生活史', nested: true },
                    { key: 'menstrualHistory', label: '月经史', nested: true },
                    { key: 'maritalHistory', label: '生育史', nested: true },
                  ] : []),
                ].map(({ key, label, nested }) => (
                  <div key={key}>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>{label}</label>
                    <textarea className="form-control" rows={2} value={nested ? (healthForm.healthProfile?.[key] || '') : (healthForm[key] || '')}
                      onChange={e => {
                        if (nested) setHealthForm(p => ({ ...p, healthProfile: { ...p.healthProfile, [key]: e.target.value } }))
                        else setHealthForm(p => ({ ...p, [key]: e.target.value }))
                      }}
                    />
                  </div>
                ))}
                <div style={{ fontWeight: 600, fontSize: 13, color: '#1E6B50', marginTop: 8, marginBottom: 4 }}>近期健康状态</div>
                <div>
                  <label style={{ fontSize: 12, color: '#8AA89C' }}>最近3个月躯体症状</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {(() => {
                      const symptoms = healthForm.healthProfile?.recentSymptoms || []
                      const noSymptom = symptoms.includes('无躯体症状')
                      const otherEntry = symptoms.find(s => s.startsWith('其他'))
                      const otherText = otherEntry ? otherEntry.replace(/^其他[:：]?/, '') : ''
                      const OPTS = ['头痛','头晕','胸闷','乏力','失眠','焦虑/抑郁','消化不良','关节疼痛','皮肤问题']
                      const updateSymptoms = (next) => setHealthForm(p => ({ ...p, healthProfile: { ...p.healthProfile, recentSymptoms: next } }))
                      return (
                        <>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 12, padding: '3px 8px', borderRadius: 20, border: `1px solid ${noSymptom ? '#1E6B50' : '#E0D9CE'}`, background: noSymptom ? '#E8F5EF' : '#fff', color: noSymptom ? '#1E6B50' : '#4A6558' }}>
                            <input type="checkbox" style={{ display: 'none' }} checked={noSymptom}
                              onChange={e => updateSymptoms(e.target.checked ? ['无躯体症状'] : [])} />
                            无躯体症状
                          </label>
                          {OPTS.map(s => {
                            const checked = !noSymptom && symptoms.includes(s)
                            return (
                              <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 12, padding: '3px 8px', borderRadius: 20, border: `1px solid ${checked ? '#1E6B50' : '#E0D9CE'}`, background: checked ? '#E8F5EF' : '#fff', color: checked ? '#1E6B50' : '#4A6558' }}>
                                <input type="checkbox" style={{ display: 'none' }} checked={checked}
                                  onChange={e => {
                                    const cur = symptoms.filter(x => x !== '无躯体症状')
                                    updateSymptoms(e.target.checked ? [...cur, s] : cur.filter(x => x !== s))
                                  }} />{s}
                              </label>
                            )
                          })}
                          {(() => {
                            const otherChecked = !noSymptom && symptoms.some(s => s.startsWith('其他'))
                            return (
                              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 12, padding: '3px 8px', borderRadius: 20, border: `1px solid ${otherChecked ? '#1E6B50' : '#E0D9CE'}`, background: otherChecked ? '#E8F5EF' : '#fff', color: otherChecked ? '#1E6B50' : '#4A6558' }}>
                                <input type="checkbox" style={{ display: 'none' }} checked={otherChecked}
                                  onChange={e => {
                                    const cur = symptoms.filter(x => x !== '无躯体症状' && !x.startsWith('其他'))
                                    updateSymptoms(e.target.checked ? [...cur, '其他'] : cur)
                                  }} />
                                其他
                                {otherChecked && (
                                  <input
                                    type="text"
                                    placeholder="请说明"
                                    value={otherText}
                                    onClick={e => e.preventDefault()}
                                    onChange={e => {
                                      const cur = symptoms.filter(x => x !== '无躯体症状' && !x.startsWith('其他'))
                                      const text = e.target.value
                                      updateSymptoms([...cur, text ? `其他：${text}` : '其他'])
                                    }}
                                    style={{ marginLeft: 4, border: 'none', outline: 'none', background: 'transparent', fontSize: 12, width: 100, color: '#1A2B24' }}
                                  />
                                )}
                              </label>
                            )
                          })()}
                        </>
                      )
                    })()}
                  </div>
                </div>
                {[
                  { key: 'recentMedication', label: '最近1个月是否服用中药或西药' },
                  { key: 'recentSupplement', label: '最近1个月是否服用营养补剂' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>{label}</label>
                    <textarea className="form-control" rows={2} value={healthForm.healthProfile?.[key] || ''}
                      onChange={e => setHealthForm(p => ({ ...p, healthProfile: { ...p.healthProfile, [key]: e.target.value } }))} />
                  </div>
                ))}
              </div>
            ) : (() => {
              const Field = ({ label, val, full }) => !val ? null : (
                <div style={{ gridColumn: full ? '1 / -1' : undefined, display: 'flex', flexDirection: 'column', padding: '5px 0' }}>
                  <span style={{ fontSize: 11, color: '#8AA89C', marginBottom: 2 }}>{label}</span>
                  <span style={{ fontSize: 13, color: '#1A2B24', lineHeight: 1.4 }}>{val}</span>
                </div>
              )
              const bloodType = [user.bloodTypeABO, user.bloodTypeRH].filter(Boolean).join(' ')
              const symptoms = (user.healthProfile?.recentSymptoms || []).join('、')

              const SECTIONS = [
                {
                  icon: '🩸', title: '基础信息', color: '#0077B6',
                  fields: [
                    <Field key="bt" label="血型" val={bloodType || '-'} />,
                    <Field key="da" label="药物过敏" val={user.healthProfile?.drugAllergy} />,
                    <Field key="fa" label="食物过敏" val={user.healthProfile?.foodAllergy} />,
                  ],
                },
                {
                  icon: '📋', title: '病史', color: '#D97706',
                  fields: [
                    <Field key="ph" label="既往史" val={user.healthProfile?.pastHistory} full />,
                    <Field key="sh" label="手术史" val={user.healthProfile?.surgeryHistory} />,
                    <Field key="th" label="外伤史" val={user.traumaHistory} />,
                    <Field key="tf" label="输血史" val={user.transfusionHistory} />,
                    <Field key="ps" label="中毒史" val={user.poisoningHistory} />,
                    <Field key="ih" label="传染病史" val={user.infectiousHistory} />,
                    <Field key="vh" label="预防接种史" val={user.vaccinationHistory} />,
                    <Field key="oh" label="其他特殊疾病史" val={user.otherDiseaseHistory} full />,
                    <Field key="fh" label="家族史" val={user.healthProfile?.familyHistoryNote} full />,
                  ],
                },
                {
                  icon: '💊', title: '用药及补剂', color: '#16A34A',
                  fields: [
                    <Field key="mh" label="长期用药（中/西药）" val={user.healthProfile?.medicHistory} />,
                    <Field key="suh" label="长期服用营养补剂" val={user.healthProfile?.supplementHistory} />,
                  ],
                },
                ...(user.gender === '女' ? [{
                  icon: '🌸', title: '女性专项', color: '#DB2777',
                  fields: [
                    <Field key="sxh" label="性生活史" val={user.healthProfile?.sexualHistory} />,
                    <Field key="mnh" label="月经史" val={user.healthProfile?.menstrualHistory} />,
                    <Field key="mah" label="生育史" val={user.healthProfile?.maritalHistory} />,
                  ],
                }] : []),
                {
                  icon: '🩺', title: '近期健康状态', color: '#7C3AED',
                  fields: [
                    <Field key="sym" label="躯体症状" val={symptoms} full />,
                    <Field key="rm" label="近期用药（中/西药）" val={user.healthProfile?.recentMedication} />,
                    <Field key="rs" label="近期营养补剂" val={user.healthProfile?.recentSupplement} />,
                  ],
                },
              ].filter(sec => sec.fields.some(f => f !== null))

              if (SECTIONS.length === 0) {
                return <div style={{ color: '#8AA89C', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>暂无档案信息，点击「编辑」录入</div>
              }

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {SECTIONS.map(sec => (
                    <div key={sec.title} style={{ background: '#FAFAF8', border: '1px solid #F0EDE7', borderRadius: 8, padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 13 }}>{sec.icon}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: sec.color }}>{sec.title}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
                        {sec.fields}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        </div>

        {/* ── 心理健康评估（问卷库Epworth/SCL90/SDS/SAS，会员自填自动写入）── */}
        <PsychAssessmentPanel user={user} />

        {/* ── 10年ASCVD风险评估（医护录入体检参数→中国指南自动分层）── */}
        <AscvdRiskPanel user={user} patientId={id} onSaved={load} toast={toast} />

        {/* ── 生活方式（膳食调查基础资料）── 位于健康档案顶部，打卡数据在下方 */}
        {(() => {
          const ld = editingLifestyle ? (lifestyleForm.lifestyle_data || {}) : (user.lifestyle_data || {})
          const setLd = (patch) => setLifestyleForm(p => ({ ...p, lifestyle_data: { ...(p.lifestyle_data || {}), ...patch } }))
          const row2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', marginBottom: 12 }
          const row3 = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 20px', marginBottom: 12 }
          const secTitle = {
            fontWeight: 700, fontSize: 12, color: '#1E6B50', margin: '14px 0 10px',
            background: '#E8F5EF', borderRadius: 6, padding: '4px 10px', display: 'inline-block',
          }
          const tabBtnStyle = (k) => ({
            padding: '7px 16px', fontSize: 13, cursor: 'pointer',
            color: lifestyleTab === k ? '#1E6B50' : '#8AA89C',
            fontWeight: lifestyleTab === k ? 700 : 400,
            background: lifestyleTab === k ? '#F0FAF6' : 'none',
            border: 'none', borderRadius: '6px 6px 0 0',
            borderBottom: lifestyleTab === k ? '2px solid #1E6B50' : '2px solid transparent',
          })
          return (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <div className="card-title">生活方式（膳食调查）</div>
                {!editingLifestyle
                  ? <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary btn-sm" onClick={() => setShowLifestyleChangeModal(true)}>＋ 新增变化</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setLifestyleTab('diet'); setEditingLifestyle(true) }}>编辑当前档案</button>
                    </div>
                  : <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary btn-sm" onClick={handleSaveLifestyle}>保存</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setEditingLifestyle(false); setLifestyleForm(buildLifestyleForm(user)) }}>取消</button>
                    </div>
                }
              </div>
              <div className="card-body">
                {/* 子板块 Tab 导航 */}
                <div style={{ display: 'flex', borderBottom: '1px solid #e0d9ce', marginBottom: 16, overflowX: 'auto' }}>
                  {[
                    { key: 'diet', label: '膳食调查' },
                    { key: 'exercise', label: '运动与作息' },
                    { key: 'alcohol', label: '烟酒与应酬' },
                    { key: 'nutrition', label: '营养素与过敏' },
                    { key: 'summary', label: '综合概述' },
                  ].map(t => (
                    <button key={t.key} style={tabBtnStyle(t.key)} onClick={() => setLifestyleTab(t.key)}>{t.label}</button>
                  ))}
                </div>

                {/* ── 膳食调查 ── */}
                {lifestyleTab === 'diet' && (
                  <div>
                    <div style={secTitle}>三餐与加餐</div>
                    <div style={row2}>
                      <LsText label="早餐时间" value={ld.breakfastTime} editing={editingLifestyle} placeholder="如 07:30" onChange={v => setLd({ breakfastTime: v })} />
                      <LsRadio label="早餐就餐方式" value={ld.breakfastDetail} editing={editingLifestyle} options={['居家', '饭店', '外卖', '在校', '公司', '少吃', '不吃']} onChange={v => setLd({ breakfastDetail: v })} />
                      <LsText label="早餐品类描述" value={ld.breakfastDesc} editing={editingLifestyle} placeholder="如 粥、鸡蛋、包子" onChange={v => setLd({ breakfastDesc: v })} />
                      <div>
                        <LsRadio label="上午加餐" value={ld.morningSnack} editing={editingLifestyle} options={['是', '否']} onChange={v => setLd({ morningSnack: v })} />
                        {(ld.morningSnack === '是' || !editingLifestyle) && (
                          <LsText label="上午加餐品类" value={ld.morningSnackDesc} editing={editingLifestyle} placeholder="如 坚果、水果" onChange={v => setLd({ morningSnackDesc: v })} />
                        )}
                      </div>
                    </div>
                    <div style={row2}>
                      <LsText label="午餐时间" value={ld.lunchTime} editing={editingLifestyle} placeholder="如 12:00" onChange={v => setLd({ lunchTime: v })} />
                      <LsRadio label="午餐就餐方式" value={ld.lunchDetail} editing={editingLifestyle} options={['居家', '饭店', '外卖', '在校', '公司', '少吃', '不吃']} onChange={v => setLd({ lunchDetail: v })} />
                      <LsText label="午餐品类描述" value={ld.lunchDesc} editing={editingLifestyle} placeholder="如 米饭、炒菜、汤" onChange={v => setLd({ lunchDesc: v })} />
                      <div>
                        <LsRadio label="下午加餐" value={ld.afternoonSnack} editing={editingLifestyle} options={['是', '否']} onChange={v => setLd({ afternoonSnack: v })} />
                        {(ld.afternoonSnack === '是' || !editingLifestyle) && (
                          <LsText label="下午加餐品类" value={ld.afternoonSnackDesc} editing={editingLifestyle} placeholder="如 酸奶、饼干" onChange={v => setLd({ afternoonSnackDesc: v })} />
                        )}
                      </div>
                    </div>
                    <div style={row2}>
                      <LsText label="晚餐时间" value={ld.dinnerTime} editing={editingLifestyle} placeholder="如 18:30" onChange={v => setLd({ dinnerTime: v })} />
                      <LsRadio label="晚餐就餐方式" value={ld.dinnerDetail} editing={editingLifestyle} options={['居家', '饭店', '外卖', '在校', '公司', '少吃', '不吃']} onChange={v => setLd({ dinnerDetail: v })} />
                      <LsText label="晚餐品类描述" value={ld.dinnerDesc} editing={editingLifestyle} placeholder="如 蔬菜、豆腐、汤" onChange={v => setLd({ dinnerDesc: v })} />
                      <div>
                        <LsRadio label="晚间加餐" value={ld.eveningSnack} editing={editingLifestyle} options={['是', '否']} onChange={v => setLd({ eveningSnack: v })} />
                        {(ld.eveningSnack === '是' || !editingLifestyle) && (
                          <LsText label="晚间加餐品类" value={ld.eveningSnackDesc} editing={editingLifestyle} placeholder="如 牛奶、坚果" onChange={v => setLd({ eveningSnackDesc: v })} />
                        )}
                      </div>
                    </div>

                    <div style={secTitle}>食物摄入量</div>
                    <div style={row3}>
                      <LsRadio label="每日主食摄入量" value={ld.dailyStaple} editing={editingLifestyle} options={['约250克', '100-200克', '250-400克', '400克以上', '几乎不吃']} onChange={v => setLd({ dailyStaple: v })} />
                      <LsRadio label="每日蔬菜摄入量" value={ld.dailyVegetables} editing={editingLifestyle} options={['500克及以上', '300-500克', '300克以内', '几乎不吃']} onChange={v => setLd({ dailyVegetables: v })} />
                      <LsRadio label="每日荤菜摄入量" value={ld.dailyMeat} editing={editingLifestyle} options={['80克以内', '80-150克', '150-200克', '200-250克', '250克以上', '几乎不吃']} onChange={v => setLd({ dailyMeat: v })} />
                    </div>
                    <div style={row2}>
                      <LsRadio label="吃水果频次" value={ld.fruitFrequency} editing={editingLifestyle} options={['1-2天/周', '3天/周及以上', '每天吃', '几乎不吃']} onChange={v => setLd({ fruitFrequency: v })} />
                      <LsRadio label="水果摄入量" value={ld.fruitAmount} editing={editingLifestyle} options={['200克以内', '200-350克', '350克以上']} onChange={v => setLd({ fruitAmount: v })} />
                      <LsRadio label="鸡蛋摄入频次" value={ld.eggFrequency} editing={editingLifestyle} options={['1-3天/周', '3-5天/周', '每天都吃', '不吃']} onChange={v => setLd({ eggFrequency: v })} />
                      <LsRadio label="鸡蛋摄入量" value={ld.eggAmount} editing={editingLifestyle} options={['1个', '2-3个', '4个以上']} onChange={v => setLd({ eggAmount: v })} />
                      <LsRadio label="奶制品摄入量" value={ld.dairyAmount} editing={editingLifestyle} options={['＜300毫升/天', '300-500毫升/天', '＞500毫升', '几乎不喝']} onChange={v => setLd({ dairyAmount: v })} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <LsText label="奶制品备注" value={ld.dairyRemark} editing={editingLifestyle} placeholder="如：乳糖不耐受、只喝无乳糖牛奶" onChange={v => setLd({ dairyRemark: v })} />
                    </div>
                    <div style={row2}>
                      <LsRadio label="坚果摄入频次" value={ld.nutFrequency} editing={editingLifestyle} options={['一周2-3天', '一周3-5天', '每天吃', '几乎不吃']} onChange={v => setLd({ nutFrequency: v })} />
                      <LsRadio label="坚果摄入量" value={ld.nutAmount} editing={editingLifestyle} options={['10克', '20-30克', '50克以上']} onChange={v => setLd({ nutAmount: v })} />
                      <LsRadio label="粗杂粮摄入频次" value={ld.grainFrequency} editing={editingLifestyle} options={['每天吃', '1-2天/周', '3天/周及以上', '几乎不吃']} onChange={v => setLd({ grainFrequency: v })} />
                      <LsRadio label="粗杂粮摄入量" value={ld.grainAmount} editing={editingLifestyle} options={['50-100克', '100-200克', '200-250克', '300克以上']} onChange={v => setLd({ grainAmount: v })} />
                    </div>

                    <div style={secTitle}>饮食习惯</div>
                    <div style={row2}>
                      <LsRadio label="忌口" value={ld.dietaryRestrictions} editing={editingLifestyle} options={['无', '有']} onChange={v => setLd({ dietaryRestrictions: v })} />
                      <LsText label="忌口具体说明" value={ld.dietaryRestrictionsDesc} editing={editingLifestyle} placeholder="如 不吃海鲜、不吃辣" onChange={v => setLd({ dietaryRestrictionsDesc: v })} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <LsCheckbox label="不良饮食习惯（可多选）" value={ld.badDietHabits || []} editing={editingLifestyle}
                        options={['三餐不规律', '常吃夜宵', '常吃外卖', '进餐速度过快', '常吃油炸食品', '常吃甜品及含糖饮料', '常吃腌制食品', '常吃动物内脏', '饮食重油', '口味偏咸', '挑食', '偏食', '无不良饮食习惯']}
                        onChange={v => setLd({ badDietHabits: v })} />
                    </div>
                    <LsRadio label="应酬频率" value={ld.entertainment} editing={editingLifestyle} options={['1-2次/周', '3-5次/周', '6-7次/周', '无或偶尔']} onChange={v => setLd({ entertainment: v })} />
                  </div>
                )}

                {/* ── 运动与作息 ── */}
                {lifestyleTab === 'exercise' && (
                  <div>
                    <div style={secTitle}>运动</div>
                    <div style={row3}>
                      <LsText label="运动类型" value={ld.exerciseType} editing={editingLifestyle} placeholder="如 跑步、瑜伽、游泳" onChange={v => setLd({ exerciseType: v })} />
                      <LsRadio label="运动频率" value={ld.exerciseFrequency} editing={editingLifestyle} options={['1-2天/周', '3-5天/周', '6-7天/周', '无']} onChange={v => setLd({ exerciseFrequency: v })} />
                      <LsText label="每次时长（分钟）" value={ld.exerciseDuration} editing={editingLifestyle} placeholder="如 30" onChange={v => setLd({ exerciseDuration: v })} />
                    </div>
                    <div style={secTitle}>作息</div>
                    <div style={row3}>
                      <LsText label="起床时间" value={ld.wakeTime} editing={editingLifestyle} placeholder="如 07:00" onChange={v => setLd({ wakeTime: v })} />
                      <LsText label="入睡时间" value={ld.sleepTime} editing={editingLifestyle} placeholder="如 23:00" onChange={v => setLd({ sleepTime: v })} />
                      <LsRadio label="作息规律性" value={ld.scheduleRegularity} editing={editingLifestyle} options={['规律', '不规律']} onChange={v => setLd({ scheduleRegularity: v })} />
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <LsText label="备注" value={ld.exerciseRemark} editing={editingLifestyle}
                        placeholder="如：膝盖有伤，不适合跑步；夜班工作，作息不规律" onChange={v => setLd({ exerciseRemark: v })} />
                    </div>
                  </div>
                )}

                {/* ── 烟酒与应酬 ── */}
                {lifestyleTab === 'alcohol' && (
                  <div>
                    <div style={{ marginBottom: 12 }}>
                      <LsRadio label="吸烟情况" value={ld.smokingStatus} editing={editingLifestyle}
                        options={['＜10支/日', '10-20支/日', '20-30支/日', '30支以上/日', '不吸烟', '吸二手烟', '吸电子烟', '抽雪茄', '戒烟']}
                        onChange={v => setLd({ smokingStatus: v })} />
                    </div>
                    <div style={row2}>
                      <LsRadio label="饮酒频率" value={ld.drinkingFrequency} editing={editingLifestyle}
                        options={['＜1天/周', '1-3天/周', '3天/周及以上', '每天喝', '几乎不喝酒']}
                        onChange={v => setLd({ drinkingFrequency: v })} />
                      <LsCheckbox label="饮酒类型" value={ld.drinkingType || []} editing={editingLifestyle}
                        options={['红酒', '白酒', '啤酒', '洋酒', '其它']}
                        onChange={v => setLd({ drinkingType: v })} />
                    </div>
                    {(ld.drinkingType || []).includes('其它') && (
                      <div style={{ marginBottom: 12 }}>
                        <LsText label="饮酒类型-其它说明" value={ld.drinkingTypeOtherDesc} editing={editingLifestyle}
                          placeholder="请说明具体酒类" onChange={v => setLd({ drinkingTypeOtherDesc: v })} />
                      </div>
                    )}
                    <div style={{ marginTop: 12 }}>
                      <LsText label="饮酒量" value={ld.drinkingAmount} editing={editingLifestyle}
                        placeholder="如：每次100ml、每次2两" onChange={v => setLd({ drinkingAmount: v })} />
                    </div>
                    <LsRadio label="应酬频率" value={ld.entertainmentFreq} editing={editingLifestyle}
                      options={['1-2次/周', '3-5次/周', '6-7次/周', '无或偶尔']}
                      onChange={v => setLd({ entertainmentFreq: v })} />
                  </div>
                )}

                {/* ── 营养素与过敏 ── */}
                {lifestyleTab === 'nutrition' && (
                  <div>
                    <div style={row3}>
                      <LsText label="营养干预史" value={ld.nutritionHistory} editing={editingLifestyle} placeholder="描述既往营养干预情况" multiline onChange={v => setLd({ nutritionHistory: v })} />
                      <LsText label="每日膳食摄入量评估" value={ld.dailyDietAssessment} editing={editingLifestyle} placeholder="描述" multiline onChange={v => setLd({ dailyDietAssessment: v })} />
                      <LsText label="营养素摄入概况" value={ld.nutrientOverview} editing={editingLifestyle} placeholder="描述" multiline onChange={v => setLd({ nutrientOverview: v })} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <LsCheckbox label="食物过敏源（可多选）" value={ld.foodAllergens || []} editing={editingLifestyle}
                        options={['无', '海鲜', '坚果', '奶制品', '蛋类', '芒果', '其它']}
                        onChange={v => setLd({ foodAllergens: v })} />
                    </div>
                    {(ld.foodAllergens || []).includes('其它') && (
                      <div style={{ marginBottom: 12 }}>
                        <LsText label="食物过敏源-其它说明" value={ld.foodAllergensOtherDesc} editing={editingLifestyle}
                          placeholder="请说明具体过敏源" onChange={v => setLd({ foodAllergensOtherDesc: v })} />
                      </div>
                    )}
                    <div style={row2}>
                      <LsRadio label="麸质过敏" value={ld.glutenAllergy} editing={editingLifestyle} options={['是', '否', '不清楚']} onChange={v => setLd({ glutenAllergy: v })} />
                      <LsRadio label="每日饮水量" value={ld.dailyWater} editing={editingLifestyle}
                        options={['1500毫升内', '1500-1700毫升', '1800-2000毫升', '2500毫升', '3000毫升以上']}
                        onChange={v => setLd({ dailyWater: v })} />
                    </div>
                    <div style={row2}>
                      <LsRadio label="心理压力" value={ld.psychStress} editing={editingLifestyle}
                        options={['正常', '中等压力/焦虑', '严重抑郁/焦虑']}
                        onChange={v => setLd({ psychStress: v })} />
                      <LsRadio label="排便规律性" value={ld.bowelRegularity} editing={editingLifestyle}
                        options={['规律（1-2次/日）', '偶尔不规律', '便秘/腹泻']}
                        onChange={v => setLd({ bowelRegularity: v })} />
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <LsText label="大便形状" value={ld.bowelShape} editing={editingLifestyle}
                        placeholder="如：成形香蕉形、松散、稀水样" onChange={v => setLd({ bowelShape: v })} />
                    </div>
                  </div>
                )}

                {/* ── 综合概述 ── */}
                {lifestyleTab === 'summary' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                    {/* 基本生活记录（由膳食调查问卷自动提取，医护可手动覆盖） */}
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#1E6B50', marginBottom: 6 }}>基本生活记录</div>
                      <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 10 }}>
                        系统根据膳食调查问卷自动提取，留空的字段手动填写后将覆盖自动结果。
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}>
                        {(() => {
                          const derived = deriveBasicLifestyle(ld)
                          return [
                            { key: 'diet',     label: '饮食习惯',       placeholder: '如：清淡为主' },
                            { key: 'exercise', label: '运动习惯',       placeholder: '如：每周跑步3次' },
                            { key: 'sleep',    label: '睡眠习惯',       placeholder: '如：23:00入睡，7小时' },
                            { key: 'water',    label: '饮水情况',       placeholder: '如：每日2000ml' },
                            { key: 'smoking',  label: '吸烟情况',       placeholder: '如：不吸烟' },
                            { key: 'alcohol',  label: '饮酒情况',       placeholder: '如：偶尔饮酒' },
                            { key: 'bowel',    label: '排便情况',       placeholder: '如：每日1次，成形' },
                            { key: 'mood',     label: '情绪状态',       placeholder: '如：情绪稳定，偶有焦虑' },
                          ].map(({ key, label, placeholder }) => {
                            const override = lifestyleForm.lifestyle?.[key] || ''
                            const displayVal = override || derived[key] || ''
                            return (
                              <div key={key} className="form-group" style={{ marginBottom: 0 }}>
                                <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 3 }}>{label}</label>
                                {editingLifestyle ? (
                                  <input className="form-input" placeholder={derived[key] || placeholder}
                                    value={override}
                                    onChange={e => setLifestyleForm(f => ({ ...f, lifestyle: { ...f.lifestyle, [key]: e.target.value } }))}
                                    style={{ fontSize: 13 }} />
                                ) : (
                                  <div style={{ fontSize: 13, color: displayVal ? '#1A2B24' : '#bbb', padding: '6px 0', borderBottom: '1px solid #f0ede8' }}>
                                    {displayVal || '未填写'}
                                  </div>
                                )}
                              </div>
                            )
                          })
                        })()}
                      </div>
                    </div>

                    {/* 自动生成概述 */}
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#1E6B50', marginBottom: 6 }}>膳食调查概述</div>
                      <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 10 }}>
                        系统根据膳食调查问卷自动生成，医护可手动覆盖。
                      </div>
                      {editingLifestyle ? (
                        <div>
                          <div style={{ marginBottom: 10 }}>
                            <LsText label="手动概述（填写后覆盖自动生成，留空则用自动结果）"
                              value={ld.summaryOverride || ''} editing multiline
                              placeholder="留空则使用自动生成概述"
                              onChange={v => setLd({ summaryOverride: v })} />
                          </div>
                          <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 8 }}>预览（自动生成）：</div>
                          <div style={{ marginTop: 6 }}>
                            {buildLifestyleSummary(ld).length > 0
                              ? buildLifestyleSummary(ld).map((f, i) => (
                                  <div key={i} style={{ fontSize: 13, color: '#4A6558', padding: '3px 0' }}>☑ {f}</div>
                                ))
                              : <div style={{ fontSize: 13, color: '#aaa' }}>暂无自动生成内容。</div>
                            }
                          </div>
                        </div>
                      ) : (
                        <div>
                          {ld.summaryOverride ? (
                            <div style={{ fontSize: 13, color: '#1A2B24', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{ld.summaryOverride}</div>
                          ) : (
                            (ld.autoSummaryFlags || buildLifestyleSummary(ld)).length > 0
                              ? (ld.autoSummaryFlags || buildLifestyleSummary(ld)).map((f, i) => (
                                  <div key={i} style={{ fontSize: 13, color: '#4A6558', padding: '3px 0' }}>☑ {f}</div>
                                ))
                              : <div style={{ fontSize: 13, color: '#aaa' }}>暂无概述，请先填写膳食调查各板块。</div>
                          )}
                        </div>
                      )}
                    </div>

                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {/* 生活方式变化历史：每次只展示本次真正改变的字段，并关联同期健康状况变化。 */}
        {(() => {
          const labels = { diet: '饮食习惯', exercise: '运动习惯', sleep: '睡眠习惯', water: '饮水情况', alcohol: '饮酒情况', smoking: '吸烟情况', bowel: '排便情况', mood: '情绪状态' }
          const entries = [...(user.lifestyleHistory || [])].sort((a, b) => new Date(b.effectiveAt || b.recordedAt) - new Date(a.effectiveAt || a.recordedAt))
          if (!entries.length) return null
          return (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <div>
                  <div className="card-title">生活方式变化记录</div>
                  <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 3 }}>按时间追踪生活习惯改变及同期健康状况变化</div>
                </div>
                <span style={{ fontSize: 12, color: '#4A6558' }}>共 {entries.length} 次</span>
              </div>
              <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {entries.map((entry, index) => {
                  const occurredAt = new Date(entry.effectiveAt || entry.recordedAt)
                  const older = entries[index + 1]
                  const olderAt = older ? new Date(older.effectiveAt || older.recordedAt) : null
                  const days = olderAt ? Math.max(0, Math.round((occurredAt - olderAt) / 86400000)) : null
                  const basicChanges = Object.entries(entry.changes || {}).filter(([key]) => key !== 'lifestyle_data')
                  const detailChanges = Object.entries(entry.changes?.lifestyle_data || {})
                  return (
                    <div key={entry._id || `${entry.recordedAt}-${index}`} style={{ borderLeft: '4px solid #1E6B50', background: '#F7FAF8', borderRadius: 10, padding: '13px 15px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 9 }}>
                        <div style={{ fontWeight: 700, color: '#1A2B24', fontSize: 14 }}>{occurredAt.toLocaleDateString('zh-CN')}</div>
                        <div style={{ fontSize: 11, color: '#8AA89C' }}>{days !== null ? `距上次变化 ${days} 天 · ` : ''}{entry.recordedByName || '医护人员'}记录</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        {basicChanges.map(([key, change]) => (
                          <div key={key} style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 10, fontSize: 12 }}>
                            <b style={{ color: '#1E6B50' }}>{labels[key] || key}</b>
                            <span style={{ color: '#4A6558' }}><span style={{ color: '#98A59F', textDecoration: change.from ? 'line-through' : 'none' }}>{change.from || '未记录'}</span><span style={{ margin: '0 7px', color: '#A0AEA7' }}>→</span><span style={{ color: '#1A2B24', fontWeight: 600 }}>{change.to || '清空'}</span></span>
                          </div>
                        ))}
                        {detailChanges.map(([key, change]) => (
                          <div key={key} style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 10, fontSize: 12 }}>
                            <b style={{ color: '#1E6B50' }}>{key}</b>
                            <span style={{ color: '#4A6558' }}>{Array.isArray(change.to) ? change.to.join('、') : String(change.to || '清空')}</span>
                          </div>
                        ))}
                      </div>
                      {entry.healthStatusChange && <div style={{ marginTop: 10, padding: '9px 11px', background: '#fff', border: '1px solid #DDE8E2', borderRadius: 8, fontSize: 12, color: '#4A6558' }}><b style={{ color: '#1A2B24' }}>同期健康状况变化：</b>{entry.healthStatusChange}</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {showLifestyleChangeModal && (() => {
          const fields = [
            ['diet', '饮食习惯'], ['exercise', '运动习惯'], ['sleep', '睡眠习惯'], ['water', '饮水情况'],
            ['smoking', '吸烟情况'], ['alcohol', '饮酒情况'], ['bowel', '排便情况'], ['mood', '情绪状态'],
          ]
          return (
            <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowLifestyleChangeModal(false)}>
              <div className="modal" style={{ maxWidth: 680 }}>
                <div className="modal-header"><h3 className="modal-title">新增生活方式变化</h3><button className="modal-close" onClick={() => setShowLifestyleChangeModal(false)}>×</button></div>
                <div className="modal-body">
                  <div style={{ padding: '9px 11px', background: '#F0FAF6', color: '#1E6B50', borderRadius: 8, fontSize: 12, marginBottom: 14 }}>只填写本次发生改变的项目；未填写的项目保持原记录不变。</div>
                  <label className="form-label">变化发生日期</label>
                  <input className="form-input" type="date" value={lifestyleChangeForm.effectiveAt} onChange={e => setLifestyleChangeForm(f => ({ ...f, effectiveAt: e.target.value }))} style={{ maxWidth: 220, marginBottom: 14 }} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 18px' }}>
                    {fields.map(([key, label]) => (
                      <div key={key}>
                        <label className="form-label">{label}</label>
                        <input className="form-input" value={lifestyleChangeForm.changes[key] || ''} placeholder={`当前：${user.lifestyle?.[key] || '未记录'}`} onChange={e => setLifestyleChangeForm(f => ({ ...f, changes: { ...f.changes, [key]: e.target.value } }))} />
                      </div>
                    ))}
                  </div>
                  <label className="form-label" style={{ marginTop: 16 }}>同期健康状况有哪些变化</label>
                  <textarea className="form-input" rows={3} value={lifestyleChangeForm.healthStatusChange} placeholder="如：连续调整饮食两个月后体重下降3kg，空腹血糖较前稳定" onChange={e => setLifestyleChangeForm(f => ({ ...f, healthStatusChange: e.target.value }))} />
                </div>
                <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowLifestyleChangeModal(false)} disabled={lifestyleChangeSaving}>取消</button><button className="btn btn-primary" onClick={handleAddLifestyleChange} disabled={lifestyleChangeSaving}>{lifestyleChangeSaving ? '保存中...' : '保存变化记录'}</button></div>
              </div>
            </div>
          )
        })()}


        {/* ── 4.3 专项筛查结果（三层目录树） ── */}
        {(() => {
          const STATUS_TEXT = { normal: '正常', abnormal: '异常', attention: '注意', unknown: '' }
          const STATUS_COLOR_MAP = { normal: '#22A06B', abnormal: '#DC3545', attention: '#D97706', unknown: '#8AA89C' }

          // 构建三层树：{ l1key: { l2label: { l3label: records[] } } }
          // 2026-07-09修复"专项筛查多出一模一样的一份"（金娟/潘孝银）：treeData 有两个来源——
          // ①screeningReports(报告本身按 screeningL1/L2/L3 挂树) ②aiVirtualMap(UserScreeningItem，AI归类写入)。
          // 一份经过 AI 解析归类的报告，其筛查项已通过 UserScreeningItem 展示，若这份报告在 screeningReports 里
          // 又带了 screeningL1/L2/L3，就会被再挂一次，同一内容出现两遍。这里跳过"已有对应 UserScreeningItem 的报告"，
          // 由 aiVirtualMap 统一负责展示，报告派生只处理纯手动录入(无 AI 归类项)的报告。
          const reportIdsWithScreeningItems = new Set(
            (screeningItems || []).map(it => String(it.reportId || '')).filter(Boolean)
          )
          const treeData = {}
          screeningReports.forEach(r => {
            if (reportIdsWithScreeningItems.has(String(r._id))) return // 已由 UserScreeningItem 展示，避免重复
            const l1 = r.screeningL1 || r.screeningCategory || 'other'
            const l2 = r.screeningL2 || r.title || '未分类'
            const l3 = r.screeningL3 || r.title || '未命名'
            if (!treeData[l1]) treeData[l1] = {}
            if (!treeData[l1][l2]) treeData[l1][l2] = {}
            if (!treeData[l1][l2][l3]) treeData[l1][l2][l3] = []
            treeData[l1][l2][l3].push(r)
          })
          // 按日期倒序
          Object.values(treeData).forEach(l2map =>
            Object.values(l2map).forEach(l3map =>
              Object.values(l3map).forEach(arr =>
                arr.sort((a, b) => (a.checkDate || a.createdAt || 0) < (b.checkDate || b.createdAt || 0) ? 1 : -1)
              )
            )
          )

          const handleEditScreening = r => {
            // 解析 examDescription/examConclusion 回 examOrderItems
            const parseExamItems = (desc, conc) => {
              if (!desc && !conc) return []
              const parts = (desc || '').split('\n\n').map(b => b.trim()).filter(Boolean)
              const concParts = (conc || '').split('\n\n').map(b => b.trim())
              const len = Math.max(parts.length, concParts.length)
              return Array.from({ length: len }, (_, i) => {
                const part = parts[i] || ''
                const concPart = concParts[i] || ''
                const m = part.match(/^【(.+?)】/) || concPart.match(/^【(.+?)】/)
                const name = m ? m[1] : `检查项${i + 1}`
                const description = part.replace(/^【.+?】\n?/, '').trim()
                const conclusion = concPart.replace(/^【.+?】\n?/, '').trim()
                return { name, description, conclusion }
              })
            }
            const savedLabItems = (r.reportItems || []).filter(i => i.itemType !== 'data' && i.itemType !== 'imaging')
            const savedImagingItems = (r.reportItems || []).filter(i => i.itemType === 'imaging') // 原样保留，避免手动编辑时丢失检查所见/诊断意见
            const funcItems = (r.reportItems || []).filter(i => i.itemType === 'data').map(i => ({ name: i.name, result: i.value || '' }))
            const examItems = parseExamItems(r.examDescription, r.examConclusion).map(e => ({ ...e, mainConclusion: (r.examMainConclusions || {})[e.name] || '' }))
            // 按 orderName 还原分组（orderName 为空说明是旧数据或手动添加的单项）
            const orderMap = {}
            const orderKeys = []
            savedLabItems.forEach(item => {
              const key = item.orderName || ''
              if (!orderMap[key]) { orderMap[key] = []; orderKeys.push(key) }
              orderMap[key].push(item)
            })
            const labItems = orderKeys.flatMap(key => {
              const items = orderMap[key]
              if (!key) {
                // 无 orderName：每个子项作为独立 order 卡片
                return items.map(i => ({ name: i.name, subItems: [], value: i.value || '', unit: i.unit || '', referenceRange: i.referenceRange || '', status: i.status || 'normal', conclusion: i.conclusion || '' }))
              }
              // 有 orderName：还原为一个 order 含 subItems；结论是整单共用一条，取组内第一条子项的值回显
              return [{ name: key, subItems: items.map(i => ({ name: i.name, value: i.value || '', unit: i.unit || '', referenceRange: i.referenceRange || '', status: i.status || 'normal' })), value: '', unit: '', referenceRange: '', status: 'normal', conclusion: items[0]?.conclusion || '' }]
            })
            setScreeningForm({
              title: r.title || '', screeningCategory: r.screeningCategory || '',
              screeningL1: r.screeningL1 || '', screeningL2: r.screeningL2 || '',
              screeningL3: r.screeningL3 || '', screeningL3Items: r.screeningL3Items || [],
              checkDate: r.checkDate || '', hospital: r.hospital || '', note: r.note || '',
              reportItems: labItems, examOrderItems: examItems, funcTestItems: funcItems,
              examDescription: r.examDescription || '', examConclusion: r.examConclusion || '',
              linkedItemType: null, _imagingItems: savedImagingItems,
            })
            setEditingScreeningId(r._id)
            setScreeningFiles([])
            setShowScreeningForm(true)
          }

          const handleDeleteScreening = async (r) => {
            if (!window.confirm(`确认删除「${r.title || r.screeningL2}」的筛查记录？`)) return
            try {
              await staffAPI.deleteScreeningRecord(id, r._id)
              toast('已删除')
              loadScreening()
            } catch (err) { toast(err.message || '删除失败') }
          }

          // 同一筛查项下的多次检测记录按检查日期升序排列（旧→新），checkDate 取不到合法日期的
          // （如AI记录兜底成报告标题"体检报告"这类非日期字符串）排到最后，不参与破坏正常排序
          const sortByCheckDate = (records) => {
            const parseDate = (r) => {
              const d = new Date(r.checkDate || r.createdAt || '')
              return isNaN(d.getTime()) ? null : d.getTime()
            }
            return [...records].sort((a, b) => {
              const ta = parseDate(a), tb = parseDate(b)
              if (ta === null && tb === null) return 0
              if (ta === null) return 1
              if (tb === null) return -1
              return ta - tb
            })
          }

          const renderRecord = (r, color) => {
            const isExpanded = expandedRecords.has(r._id)
            // 多文件优先，向下兼容旧 fileUrl
            const allUrls = (r.fileUrls && r.fileUrls.length > 0)
              ? r.fileUrls
              : (r.fileUrl ? [r.fileUrl] : [])
            const resolvedUrls = allUrls.map(u => u.startsWith('/') ? API_ORIGIN + u : u)
            const fullUrl = resolvedUrls[0] || null
            const labItems = (r.reportItems || []).filter(i => i.itemType !== 'data' && i.itemType !== 'imaging')
            const imgItems = (r.reportItems || []).filter(i => i.itemType === 'imaging')
            const funcItems = (r.reportItems || []).filter(i => i.itemType === 'data')
            const hasExam = r.examDescription || r.examConclusion
            const totalCount = labItems.length + imgItems.length + funcItems.length + (hasExam ? 1 : 0)
            return (
              <div id={`screening-record-${r._id}`} data-source-report-id={(r._sourceItems || [])[0]?.reportId || r._id} key={r._id} style={{ padding: '6px 0 6px 12px', borderLeft: `2px solid ${color}40`, marginBottom: 2, transition: 'box-shadow .2s' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div onClick={() => setExpandedRecords(prev => {
                      const next = new Set(prev)
                      if (isExpanded) next.delete(r._id); else next.add(r._id)
                      return next
                    })}
                    style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', userSelect: 'none', flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 11, color: '#aaa', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {r.checkDate || (r.createdAt && new Date(r.createdAt).toLocaleDateString('zh-CN'))}
                    </span>
                    {r.hospital && <span style={{ fontSize: 11, color: '#8AA89C', flexShrink: 0 }}>📍 {r.hospital}</span>}
                    {r.note && <span style={{ fontSize: 12, color: '#4A6558', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.note}</span>}
                    {totalCount > 0 && <span style={{ fontSize: 11, color: '#8AA89C', flexShrink: 0 }}>{totalCount} 项</span>}
                    <span style={{ fontSize: 11, color: '#8AA89C', flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                  {r.isAI
                    ? (<>
                        <button onClick={() => {
                          const rid = (r._sourceItems || [])[0]?.reportId
                          if (!rid) return
                          const rpt = reports.find(x => String(x._id) === rid)
                          if (rpt) handleOpenOCRReview(rpt, [
                            ...(r.reportItems || []).map(item => item.name),
                            (r._sourceItems || [])[0]?.itemLabel,
                            r.screeningL3,
                            r.title,
                          ])
                        }} style={{ background: 'none', border: '1px solid #E0D9CE', borderRadius: 4, fontSize: 11, padding: '1px 6px', color: '#4A6558', cursor: 'pointer', flexShrink: 0 }}>编辑</button>
                        <button onClick={async () => {
                          if (!window.confirm('删除该AI识别筛查项？')) return
                          try {
                            const rid = (r._sourceItems || [])[0]?.reportId
                            const lbl = (r._sourceItems || [])[0]?.itemLabel
                            await staffAPI.deleteAIScreeningItem(id, { reportId: rid, itemLabel: lbl })
                            toast('已删除')
                            loadScreening()
                          } catch (e) { toast('删除失败：' + (e.message || '')) }
                        }} style={{ background: 'none', border: '1px solid #DC3545', borderRadius: 4, fontSize: 11, padding: '1px 6px', color: '#DC3545', cursor: 'pointer', flexShrink: 0 }}>删除</button>
                      </>)
                    : (<>
                        <button onClick={() => handleEditScreening(r)}
                          style={{ background: 'none', border: '1px solid #E0D9CE', borderRadius: 4, fontSize: 11, padding: '1px 6px', color: '#4A6558', cursor: 'pointer', flexShrink: 0 }}>编辑</button>
                        <button onClick={() => handleDeleteScreening(r)}
                          style={{ background: 'none', border: '1px solid #DC3545', borderRadius: 4, fontSize: 11, padding: '1px 6px', color: '#DC3545', cursor: 'pointer', flexShrink: 0 }}>删除</button>
                      </>)
                  }
                </div>
                {isExpanded && (
                  <div style={{ marginTop: 8 }}>
                    {r.note && <div style={{ fontSize: 12, color: '#4A6558', marginBottom: 6 }}>结论：{r.note}</div>}
                    {/* 检验医嘱 */}
                    {labItems.length > 0 && (() => {
                      // 按 orderName 分组，无 orderName 的归入 '' 组
                      const groupMap = {}
                      const groupKeys = []
                      labItems.forEach(item => {
                        const key = item.orderName || ''
                        if (!groupMap[key]) { groupMap[key] = []; groupKeys.push(key) }
                        groupMap[key].push(item)
                      })
                      const renderItemRows = (items) => [
                        ...items.map((item, j) => (
                          <tr key={j} style={{ background: item.status === 'abnormal' ? '#FFF5F5' : 'transparent', borderBottom: '1px solid #f0ece4' }}>
                            <td style={{ padding: '4px 8px', color: '#1A2B24' }}>{item.name}</td>
                            <td style={{ padding: '4px 8px', fontWeight: 600, color: STATUS_COLOR_MAP[item.status] || '#1A2B24' }}>
                              {item.value}{item.unit && <span style={{ fontWeight: 400, color: '#8AA89C', marginLeft: 2 }}>{item.unit}</span>}
                            </td>
                            <td style={{ padding: '4px 8px', color: '#8AA89C' }}>{item.referenceRange || '-'}</td>
                            <td style={{ padding: '4px 8px', color: STATUS_COLOR_MAP[item.status] || '#8AA89C' }}>{STATUS_TEXT[item.status] || '-'}</td>
                          </tr>
                        )),
                      ]
                      return (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#1E6B50', marginBottom: 4 }}>检验医嘱</div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: '#f5f2ec' }}>
                                {['项目','结果','参考范围','状态'].map(h => (
                                  <th key={h} style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600, color: '#4A6558', borderBottom: '1px solid #E0D9CE' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {groupKeys.map(key => (
                                key
                                  ? [
                                    <tr key={`g-${key}`} style={{ background: '#E8F5EF' }}>
                                      <td colSpan={4} style={{ padding: '3px 8px', fontSize: 11, fontWeight: 600, color: '#1E6B50' }}>{key}</td>
                                    </tr>,
                                    ...renderItemRows(groupMap[key])
                                  ]
                                  : renderItemRows(groupMap[key])
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    })()}
                    {/* 检查项目（OCR 影像/内镜/CT/MRI 等，完整检查所见+诊断意见） */}
                    {imgItems.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#0369A1', marginBottom: 4 }}>检查项目</div>
                        {imgItems.map((item, j) => {
                          const findings = item.findings || item.value || ''
                          return (
                            <div key={j} style={{ border: '1px solid #BFDBFE', borderRadius: 6, marginBottom: 6, overflow: 'hidden' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#EFF6FF' }}>
                                <span style={{ fontWeight: 600, color: '#1E40AF', fontSize: 12 }}>{item.name}</span>
                                {item.bodyPart && <span style={{ fontSize: 11, color: '#3B82F6' }}>· {item.bodyPart}</span>}
                                {(item.examDate || r.checkDate) && <span style={{ fontSize: 11, color: '#93C5FD', marginLeft: 'auto' }}>{item.examDate || r.checkDate}</span>}
                              </div>
                              <div style={{ padding: '6px 10px', fontSize: 12, background: '#fff', lineHeight: 1.7 }}>
                                {item.conclusion && <div style={{ color: '#5B21B6', fontWeight: 600, marginBottom: 4 }}><span style={{ color: '#7C3AED' }}>主要结论：</span>{item.conclusion}</div>}
                                {findings && <div style={{ color: '#374151', marginBottom: 4, whiteSpace: 'pre-wrap' }}><span style={{ color: '#6B7280' }}>检查所见：</span>{findings}</div>}
                                {item.diagnosis && <div style={{ color: '#374151', whiteSpace: 'pre-wrap' }}><span style={{ color: '#6B7280' }}>诊断意见：</span>{item.diagnosis}</div>}
                                {!item.conclusion && !findings && !item.diagnosis && <span style={{ color: '#9CA3AF' }}>暂无检查所见/诊断意见</span>}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {/* 检查医嘱 */}
                    {hasExam && (() => {
                      const descBlocks = (r.examDescription || '').split('\n\n').map(b => b.trim()).filter(Boolean)
                      const concBlocks = (r.examConclusion || '').split('\n\n').map(b => b.trim()).filter(Boolean)
                      // 以描述块为主，兼容只有结论的情况
                      const blocks = descBlocks.length >= concBlocks.length ? descBlocks : concBlocks
                      const parsed = blocks.map((block, i) => {
                        const descBlock = (descBlocks[i] || '').trim()
                        const concBlock = (concBlocks[i] || '').trim()
                        const nameM = descBlock.match(/^【(.+?)】/) || concBlock.match(/^【(.+?)】/)
                        const name = nameM ? nameM[1] : `检查项${i+1}`
                        const desc = descBlock.replace(/^【.+?】\n?/, '').trim()
                        const conc = concBlock.replace(/^【.+?】\n?/, '').trim()
                        return { name, desc, conc }
                      })
                      return (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#0369A1', marginBottom: 4 }}>检查医嘱</div>
                          {parsed.map((item, i) => {
                            const examKey = `${r._id}_exam_${i}`
                            const isOpen = expandedExamKey === examKey
                            const hasDetail = item.desc || item.conc
                            return (
                              <div key={i} style={{ border: '1px solid #BFDBFE', borderRadius: 6, marginBottom: 4, overflow: 'hidden' }}>
                                <div
                                  onClick={() => hasDetail && setExpandedExamKey(isOpen ? null : examKey)}
                                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', background: '#EFF6FF', cursor: hasDetail ? 'pointer' : 'default' }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ fontWeight: 600, color: '#1E40AF', fontSize: 12 }}>{item.name}</span>
                                    {(r.examMainConclusions || {})[item.name] && (
                                      <span style={{ fontSize: 12, color: '#5B21B6', fontWeight: 600, marginLeft: 8 }}>· {(r.examMainConclusions || {})[item.name]}</span>
                                    )}
                                  </div>
                                  {hasDetail && <span style={{ fontSize: 11, color: '#93C5FD', flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>}
                                </div>
                                {isOpen && hasDetail && (
                                  <div style={{ padding: '6px 10px', fontSize: 12, background: '#fff' }}>
                                    {item.desc && <div style={{ color: '#374151', marginBottom: 4 }}><span style={{ color: '#6B7280' }}>描述：</span>{item.desc}</div>}
                                    {item.conc && <div style={{ color: '#374151' }}><span style={{ color: '#6B7280' }}>结论：</span>{item.conc}</div>}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}
                    {/* 功能医学检测 */}
                    {funcItems.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#7C3AED', marginBottom: 4 }}>功能医学检测</div>
                        {funcItems.map((item, j) => (
                          <div key={j} style={{ display: 'flex', gap: 12, fontSize: 12, padding: '3px 0', borderBottom: '1px solid #f0ece4' }}>
                            <span style={{ color: '#1A2B24', flex: 1 }}>{item.name}</span>
                            <span style={{ color: '#4A6558' }}>{item.value || '-'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {resolvedUrls.length > 0 && (
                      <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {resolvedUrls.map((url, idx) => {
                          const isPdf = url.endsWith('.pdf') || (idx === 0 && r.mimeType === 'application/pdf')
                          return isPdf ? (
                            <a key={idx} href={url} target="_blank" rel="noopener noreferrer"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, border: '1px solid #BBF7D0', background: '#F0FDF4', fontSize: 12, color: '#1E6B50', textDecoration: 'none' }}>
                              📄 {resolvedUrls.length > 1 ? `PDF ${idx + 1}` : '查看报告 PDF'}
                            </a>
                          ) : (
                            <button key={idx} onClick={() => setPreviewImageUrl(url)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, border: '1px solid #BBF7D0', background: '#F0FDF4', fontSize: 12, color: '#1E6B50', cursor: 'pointer' }}>
                              🖼 {resolvedUrls.length > 1 ? `图片 ${idx + 1}` : '查看报告图片'}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          }

          const hasAny = screeningReports.length > 0 || screeningItems.length > 0
          const AI_CAT_LABEL = { tumor: '肿瘤风险筛查', cardio: '心脑血管', chronic: '慢性病筛查', hp: '健康促进', other: '其他筛查' }
          return (
            <div id="screening-results" className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <div className="card-title">专项筛查结果</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" title="清理重复的AI识别筛查记录（同一项目保留最新一条）"
                    onClick={async () => {
                      if (!window.confirm('将清理重复的AI识别筛查记录，每个项目只保留最新一条。确认继续？')) return
                      try {
                        const res = await staffAPI.dedupPatientScreening(id)
                        toast(res.message || '去重完成')
                        loadScreening()
                      } catch (e) { toast('去重失败：' + (e.message || '')) }
                    }}>🧹 清理重复</button>
                  <button className="btn btn-primary btn-sm" onClick={() => {
                    setScreeningForm({ title: '', screeningCategory: '', screeningL1: '', screeningL2: '', screeningL3: '', screeningL3Items: [], checkDate: '', hospital: '', note: '', reportItems: [], examOrderItems: [], funcTestItems: [], examDescription: '', examConclusion: '', linkedItemType: null })
                    setScreeningFiles([])
                    setEditingScreeningId(null)
                    setScreeningLinkedItem(null)
                    setScreeningAutoMatches([])
                    setShowScreeningForm(true)
                  }}>+ 录入筛查结果</button>
                </div>
              </div>
              {(() => {
                const current = screeningYearSummaries.find(item => Number(item.year) === Number(screeningSummaryYear))
                const summaryRecords = current
                  ? (Array.isArray(current.records) && current.records.length ? current.records : [current])
                  : []
                const currentRecord = summaryRecords[screeningSummaryRecordIndex] || summaryRecords[0]
                const sections = editingScreeningSummary || currentRecord?.sections || {}
                const canManage = ['familyDoctor', 'superadmin'].includes(staff?.role)
                const categories = [
                  ['tumor_risk', '肿瘤筛查小结'],
                  ['cardiovascular_risk', '心脑血管病筛查小结'],
                  ['chronic_disease', '慢性病及其他小结'],
                ]
                const years = [...new Set([
                  new Date().getFullYear(),
                  ...screeningYearSummaries.map(item => Number(item.year)),
                  ...screeningReports.map(item => Number(item.reportYear || String(item.checkDate || '').slice(0, 4))).filter(Boolean),
                ])].sort((a, b) => b - a)
                return (
                  <div style={{ margin: '0 16px 14px', padding: 14, border: '1px solid #D9E9E1', borderRadius: 10, background: '#F8FCFA' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                      <strong style={{ color: '#1E6B50' }}>年度专项筛查小结</strong>
                      <select className="form-input" style={{ width: 120 }} value={screeningSummaryYear}
                        onChange={e => { setScreeningSummaryYear(Number(e.target.value)); setEditingScreeningSummary(null) }}>
                        {years.map(year => <option key={year} value={year}>{year}年度</option>)}
                      </select>
                      {summaryRecords.length > 0 && <select className="form-input" style={{ width: 250 }} value={currentRecord ? screeningSummaryRecordIndex : 0}
                        onChange={e => { setScreeningSummaryRecordIndex(Number(e.target.value)); setEditingScreeningSummary(null) }}>
                        {summaryRecords.map((record, index) => (
                          <option key={index} value={index}>第{summaryRecords.length - index}次 · {record.createdAt ? new Date(record.createdAt).toLocaleString('zh-CN') : '历史小结'} · {record.status === 'approved' ? '已审核' : '待审核'}</option>
                        ))}
                      </select>}
                      {currentRecord && <span style={{ fontSize: 12, color: currentRecord.status === 'approved' ? '#16A34A' : '#D97706' }}>
                        {currentRecord.status === 'approved' ? `✓ 健康顾问已审核${currentRecord.approvedByName ? ' · ' + currentRecord.approvedByName : ''}` : '待健康顾问审核'}
                      </span>}
                      <button className="btn btn-secondary btn-sm"
                        aria-expanded={screeningSummaryExpanded}
                        onClick={() => setScreeningSummaryExpanded(value => !value)}>
                        {screeningSummaryExpanded ? '收起小结 ▲' : '展开小结 ▼'}
                      </button>
                      {canManage && <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                        <button className="btn btn-secondary btn-sm" disabled={screeningSummaryBusy} onClick={async () => {
                          setScreeningSummaryBusy(true)
                          try {
                            await staffAPI.generateScreeningYearSummary(id, screeningSummaryYear)
                            await loadScreening()
                            toast('AI年度专项筛查小结已生成，待健康顾问审核')
                          } catch (error) { toast(error.message || '生成失败') }
                          finally { setScreeningSummaryBusy(false) }
                        }}>{screeningSummaryBusy ? '生成中…' : '✨ AI自动小结'}</button>
                        <button className="btn btn-primary btn-sm" onClick={() => {
                          setScreeningSummaryEditMode('new')
                          setEditingScreeningSummary({
                          tumor_risk: { summary: '', sourceReportIds: [] },
                          cardiovascular_risk: { summary: '', sourceReportIds: [] },
                          chronic_disease: { summary: '', sourceReportIds: [] },
                        })
                        }}>＋ 新增小结</button>
                        {currentRecord && <button className="btn btn-secondary btn-sm" onClick={() => {
                          setScreeningSummaryEditMode('edit')
                          setEditingScreeningSummary(JSON.parse(JSON.stringify(currentRecord.sections || {})))
                        }}>编辑当前小结</button>}
                        {currentRecord && <button className="btn btn-sm" style={{ color: '#DC3545', borderColor: '#FCA5A5', background: '#FFF5F5' }} onClick={async () => {
                          const time = currentRecord.createdAt ? new Date(currentRecord.createdAt).toLocaleString('zh-CN') : ''
                          if (!window.confirm(`确认删除${time ? ` ${time} 的` : '当前'}专项筛查小结？删除后不可恢复。`)) return
                          try {
                            await staffAPI.deleteScreeningYearSummary(id, screeningSummaryYear, screeningSummaryRecordIndex)
                            setScreeningSummaryRecordIndex(0)
                            setEditingScreeningSummary(null)
                            await loadScreening()
                            toast('当前专项筛查小结已删除')
                          } catch (error) { toast(error.message || '删除失败') }
                        }}>删除当前小结</button>}
                        {currentRecord && currentRecord.status !== 'approved' && <button className="btn btn-primary btn-sm" onClick={async () => {
                          try { await staffAPI.approveScreeningYearSummary(id, screeningSummaryYear, screeningSummaryRecordIndex); await loadScreening(); toast('年度小结已审核') }
                          catch (error) { toast(error.message || '审核失败') }
                        }}>审核通过</button>}
                      </div>}
                    </div>
                    {screeningSummaryExpanded && (!currentRecord && !editingScreeningSummary ? (
                      <div style={{ color: '#8AA89C', fontSize: 13 }}>该年度尚无小结，可由健康顾问新增或使用 AI 自动生成。</div>
                    ) : (
                      <div style={{ display: 'grid', gap: 10 }}>
                        {categories.map(([key, label]) => (
                          <div key={key} style={{ background: '#fff', borderRadius: 8, padding: '14px 16px', border: '1px solid #EEF2EF' }}>
                            <button type="button" onClick={() => setScreeningSectionExpanded(prev => ({ ...prev, [key]: !prev[key] }))}
                              style={{ width: '100%', border: 0, background: 'none', display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: 0 }}>
                              <span>{label}</span><span>{screeningSectionExpanded[key] ? '收起 ▲' : '展开 ▼'}</span>
                            </button>
                            {screeningSectionExpanded[key] && (editingScreeningSummary ? (
                              <textarea className="form-input" rows={10} value={sections[key]?.summary || ''}
                                style={{ marginTop: 12, minHeight: 240, maxHeight: '60vh', boxSizing: 'border-box', padding: '14px 16px', fontSize: 14, lineHeight: 1.8, resize: 'vertical' }}
                                onChange={e => setEditingScreeningSummary(prev => ({
                                  ...prev,
                                  [key]: { ...(prev[key] || {}), summary: e.target.value },
                                }))} />
                            ) : <div style={{ marginTop: 12, padding: '2px 4px', fontSize: 14, color: '#4A6558', lineHeight: 1.85 }}>
                              {(sections[key]?.summary || '暂无相关资料').split(/\n+/).map(v => v.trim()).filter(Boolean).map((line, i) => {
                                const matched = line.match(/^([^：:]+)[：:]\s*(.*)$/)
                                return <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                                  <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: '#1E6B50', color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>{i + 1}</span>
                                  {matched ? <span><strong style={{ color: '#1E6B50' }}>{matched[1]}：</strong>{matched[2]}</span> : <span>{line}</span>}
                                </div>
                              })}
                            </div>)}
                          </div>
                        ))}
                        {editingScreeningSummary && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => setEditingScreeningSummary(null)}>取消</button>
                          <button className="btn btn-primary btn-sm" onClick={async () => {
                            try {
                              await staffAPI.saveScreeningYearSummary(id, screeningSummaryYear, editingScreeningSummary, screeningSummaryEditMode, screeningSummaryRecordIndex)
                              setEditingScreeningSummary(null)
                              setScreeningSummaryRecordIndex(0)
                              await loadScreening()
                              toast(screeningSummaryEditMode === 'new' ? '已新增一次年度小结，待健康顾问审核' : '当前年度小结已修改，待健康顾问审核')
                            } catch (error) { toast(error.message || '保存失败') }
                          }}>保存小结</button>
                        </div>}
                      </div>
                    ))}
                  </div>
                )
              })()}
              {(() => {
                // 2026-07-02：体检方案里已开具但客户还未做/未上传报告的检验检查项目，在这里做一条轻量提示——
                // 不把方案项目直接并入下面的三层筛查树渲染（那块逻辑已经很复杂，硬塞进去容易出连锁问题），
                // 只统计数量+列名字，点击可跳转到对应方案详情页查看。
                const pendingPlanItems = (plans || [])
                  .flatMap(p => (p.items || []).map(it => ({ ...it, planId: p._id, planTitle: p.title })))
                  .filter(it => it.status === 'pending' && it.itemType && ['labTest', 'specialExam', 'functionalTest'].includes(it.itemType))
                if (!pendingPlanItems.length) return null
                return (
                  <div style={{ margin: '0 16px 12px', padding: '10px 14px', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, fontSize: 13 }}>
                    <span style={{ color: '#D97706', fontWeight: 600 }}>⏳ 有 {pendingPlanItems.length} 项已开具体检方案项目待完成：</span>
                    <span style={{ color: '#6B7280', marginLeft: 6 }}>
                      {[...new Set(pendingPlanItems.map(it => it.name))].slice(0, 6).join('、')}
                      {pendingPlanItems.length > 6 ? ' 等' : ''}
                    </span>
                    <span style={{ marginLeft: 10, color: '#1E6B50', cursor: 'pointer', textDecoration: 'underline' }}
                      onClick={() => nav(`/plans/${pendingPlanItems[0].planId}`)}>查看方案详情 →</span>
                  </div>
                )
              })()}
              {!hasAny ? (
                <div style={{ padding: 30, textAlign: 'center', color: '#aaa', fontSize: 14 }}>暂无专项筛查记录，点击「录入筛查结果」添加</div>
              ) : (() => {
                const L1_COLORS = ['#7C3AED','#DC3545','#D97706','#0369A1','#0891B2','#1E6B50','#9D174D']

                // 建立 AI category → screeningTree L1 _id 映射
                // 2026-07-01起 AI归类的 category 字段已经直接是 admin「分类管理」的 L1 _id（见 screeningMatch.js），
                // 优先直接命中；下面的关键词表只用于兜底旧版 screeningTree.js 遗留的 tumor/cardio/chronic/hp 格式数据
                const knownTreeIds = new Set(screeningTree.map(n => String(n._id)))
                const CAT_KEYWORDS = {
                  tumor: ['肿瘤', 'tumor'],
                  cardio: ['心脑', '血管', '心血管', 'cardio'],
                  chronic: ['慢性', 'chronic'],
                  hp: ['健康促进', '功能医学', 'hp'],
                }
                const catToTreeId = {}
                screeningTree.forEach(n => {
                  const nid = String(n._id)
                  for (const [cat, kws] of Object.entries(CAT_KEYWORDS)) {
                    if (kws.some(kw => n.label.includes(kw))) { catToTreeId[cat] = nid; break }
                  }
                })

                // 把 AI 识别的 UserScreeningItem 转成虚拟记录合并进 treeData
                const reportTitleMap = {}
                reports.forEach(r => { reportTitleMap[String(r._id)] = r.title || new Date(r.createdAt).toLocaleDateString('zh-CN') })
                const aiVirtualMap = {}
                screeningItems.forEach(it => {
                  const l1Key = knownTreeIds.has(String(it.category)) ? String(it.category) : (catToTreeId[it.category] || `ai_${it.category}`)
                  const l2 = it.parentLabel || '其他'
                  const l3 = it.itemLabel || '未知'
                  const rid = String(it.reportId || 'unknown')
                  const vKey = `${l1Key}||${l2}||${l3}||${rid}`
                  if (!aiVirtualMap[vKey]) {
                    aiVirtualMap[vKey] = {
                      _id: vKey, isAI: true,
                      checkDate: it.checkDate || reportTitleMap[rid] || '体检报告',
                      hospital: it.institution || '',
                      note: '', reportItems: [],
                      _l1Key: l1Key, _l2: l2, _l3: l3,
                    }
                  }
                  // 2026-07-02：一个 itemId(如"肝功能")在报告里通常对应多个检验子项(总蛋白/球蛋白/转氨酶...)，
                  // 后端已改为在 matchedItems 里返回全部匹配子项，这里逐条 push 而不是只用第一条，
                  // 避免血脂全套/血常规/抗核抗体谱等只显示一项、其余漏项的问题。
                  const subItems = Array.isArray(it.matchedItems) && it.matchedItems.length ? it.matchedItems : [it]
                  subItems.forEach(sub => {
                    aiVirtualMap[vKey].reportItems.push({
                      name: sub.name || it.itemLabel,
                      value: sub.value || '',
                      unit: sub.unit || '',
                      referenceRange: sub.referenceRange || '',
                      status: sub.status || 'unknown',
                      itemType: sub.itemType || 'lab',
                      findings: sub.findings || '',
                      diagnosis: sub.diagnosis || '',
                      conclusion: sub.conclusion || '',
                    })
                  })
                  // 记录原始 reportId 和 itemLabel 供删除用
                  if (!aiVirtualMap[vKey]._sourceItems) aiVirtualMap[vKey]._sourceItems = []
                  aiVirtualMap[vKey]._sourceItems.push({ reportId: rid, itemLabel: it.itemLabel || '' })
                })
                Object.values(aiVirtualMap).forEach(({ _l1Key, _l2, _l3, _sourceItems, ...rec }) => {
                  rec._sourceItems = _sourceItems || []
                  // 2026-07-02修复：AI虚拟记录的note此前硬编码为空字符串，导致折叠状态下的摘要行
                  // （人工录入靠 r.note 显示"所见结肠黏膜未见异常"这类摘要）AI记录永远显示不出来，
                  // 不是没有数据——conclusion其实一直都在reportItems里，只是没有被取来填这个摘要字段。
                  // 取第一条有内容的 conclusion（找不到则退而求其次用 diagnosis）作为折叠态摘要。
                  if (!rec.note) {
                    const withText = rec.reportItems.find(x => x.conclusion) || rec.reportItems.find(x => x.diagnosis)
                    if (withText) rec.note = withText.conclusion || withText.diagnosis
                  }
                  if (!treeData[_l1Key]) treeData[_l1Key] = {}
                  if (!treeData[_l1Key][_l2]) treeData[_l1Key][_l2] = {}
                  if (!treeData[_l1Key][_l2][_l3]) treeData[_l1Key][_l2][_l3] = []
                  treeData[_l1Key][_l2][_l3].push(rec)
                })

                // legacyMap：screeningTree 里没有的、非 ai_xxx 的 key
                const knownL1s = new Set(screeningTree.map(n => String(n._id)))
                const legacyKeys = Object.keys(treeData).filter(k => !knownL1s.has(k) && !k.startsWith('ai_'))
                const aiOnlyKeys = Object.keys(treeData).filter(k => k.startsWith('ai_'))
                const legacyMap = Object.fromEntries(legacyKeys.map(k => [k, treeData[k]]))
                const hasLegacy = legacyKeys.length > 0

                // 所有可选 L1 tab
                const availL1s = [
                  ...screeningTree
                    .filter(n => treeData[String(n._id)])
                    .map((n, idx) => ({
                      key: String(n._id), label: n.label, node: n,
                      color: L1_COLORS[idx % L1_COLORS.length], isLegacy: false,
                    })),
                  // 2026-07-09 金娟明确要求去掉「其他」tab：它是 AI 自动归类失败落到 legacy 兜底的项
                  //（如整份年度体检报告、归不进标准筛查树的超声），金娟原话"这个其他是AI自动生成的，不需要"。
                  // 这些项的原始数据在体检报告详情/体检指标等界面已有展示，专项筛查视图不再单独堆一个「其他」分类。
                  // （legacyMap/hasLegacy 变量保留但不再注入 tab；下方 isLegacy 渲染分支随之成为不可达代码，无副作用。）
                  // ai_hp（功能医学）和 ai_other（其他筛查）不在专项筛查视图展示，由人工维护
                  ...aiOnlyKeys.filter(k => k !== 'ai_hp' && k !== 'ai_other').map((k, i) => ({
                    key: k, label: AI_CAT_LABEL[k.replace('ai_', '')] || k, node: null,
                    color: L1_COLORS[(screeningTree.length + i) % L1_COLORS.length], isLegacy: false,
                  })),
                ]
                const activeL1Key = (screeningActiveL1 && availL1s.find(x => x.key === screeningActiveL1))
                  ? screeningActiveL1 : availL1s[0]?.key
                const activeL1 = availL1s.find(x => x.key === activeL1Key)

                // 选中 L1 的 L2 内容
                const renderL1Content = () => {
                  if (!activeL1) return null
                  const { key, node, color, isLegacy } = activeL1
                  if (isLegacy) {
                    // 旧数据：展示所有 legacy L1 的 L2 tabs（合并到一层）
                    const allLegacyL2 = []
                    Object.entries(legacyMap).forEach(([, l2map]) => {
                      Object.entries(l2map).forEach(([l2Label, l3map]) => {
                        allLegacyL2.push([l2Label, l3map])
                      })
                    })
                    const activeL2 = screeningActiveL2s['__legacy__'] || allLegacyL2[0]?.[0]
                    return (
                      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8e4dc', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', borderBottom: '1px solid #f0ece4', padding: '4px 8px', background: '#faf9f6', gap: 2, width: '100%', minWidth: 0 }}>
                          {allLegacyL2.map(([l2]) => {
                            const isA = l2 === activeL2
                            return (
                              <button key={l2} type="button"
                                onClick={() => setScreeningActiveL2s(prev => ({ ...prev, '__legacy__': l2 }))}
                                style={{ padding: '8px 14px', fontSize: 13, border: 'none', cursor: 'pointer', background: 'none', whiteSpace: 'nowrap', flexShrink: 0, color: isA ? color : '#8AA89C', fontWeight: isA ? 700 : 400, borderBottom: isA ? `2px solid ${color}` : '2px solid transparent' }}>
                                {l2}
                              </button>
                            )
                          })}
                        </div>
                        {allLegacyL2.filter(([l2]) => l2 === activeL2).map(([l2, l3map]) => (
                          <div key={l2} style={{ padding: '12px 16px' }}>
                            {Object.entries(l3map).map(([l3, records]) => (
                              <div key={l3} style={{ marginBottom: 6 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#4A6558', marginBottom: 4 }}>▶ {l3} ({records.length} 次)</div>
                                <div style={{ paddingLeft: 14 }}>{sortByCheckDate(records).map(r => renderRecord(r, color))}</div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )
                  }
                  // 正常 tree L1（包括 ai_xxx 独立 tab，node 可能为 null）
                  const l2map = treeData[key]
                  if (!l2map) return null
                  const treeL2Order = (node?.children || []).map(c => c.label)
                  const sortedL2 = [
                    ...treeL2Order.filter(k => l2map[k]).map(k => [k, l2map[k]]),
                    ...Object.entries(l2map).filter(([k]) => !treeL2Order.includes(k)),
                  ]
                  const activeL2 = screeningActiveL2s[key] || sortedL2[0]?.[0]
                  return (
                    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8e4dc', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', borderBottom: '1px solid #f0ece4', padding: '4px 8px', background: '#faf9f6', gap: 2, width: '100%', minWidth: 0 }}>
                        {sortedL2.map(([l2Label]) => {
                          const isActive = l2Label === activeL2
                          return (
                            <button key={l2Label} type="button"
                              onClick={() => setScreeningActiveL2s(prev => ({ ...prev, [key]: l2Label }))}
                              style={{ padding: '8px 14px', fontSize: 13, border: 'none', cursor: 'pointer', background: 'none', whiteSpace: 'nowrap', flexShrink: 0, color: isActive ? color : '#8AA89C', fontWeight: isActive ? 700 : 400, borderBottom: isActive ? `2px solid ${color}` : '2px solid transparent', transition: 'all 0.15s' }}>
                              {l2Label}
                            </button>
                          )
                        })}
                      </div>
                      {sortedL2.filter(([l2Label]) => l2Label === activeL2).map(([l2Label, l3map]) => (
                        <div key={l2Label} style={{ padding: '12px 16px' }}>
                          {Object.entries(l3map).map(([l3Label, records]) => (
                            <div key={l3Label} style={{ marginBottom: 10 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#4A6558', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ color, fontSize: 10 }}>▶</span>
                                {l3Label}
                                <span style={{ fontSize: 11, color: '#8AA89C', fontWeight: 400 }}>({records.length} 次)</span>
                              </div>
                              <div style={{ paddingLeft: 14 }}>{sortByCheckDate(records).map(r => renderRecord(r, color))}</div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )
                }

                return (
                  <div>
                    {/* L1 横向 Tab 行 */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', borderBottom: '2px solid #f0ece4', marginBottom: 12, gap: 0 }}>
                      {availL1s.map(({ key, label, color }) => {
                        const isA = key === activeL1Key
                        return (
                          <button key={key} type="button"
                            onClick={() => setScreeningActiveL1(key)}
                            style={{ padding: '10px 18px', fontSize: 13, border: 'none', cursor: 'pointer', background: 'none', whiteSpace: 'nowrap', flexShrink: 0, color: isA ? color : '#8AA89C', fontWeight: isA ? 700 : 400, borderBottom: isA ? `2px solid ${color}` : '2px solid transparent', marginBottom: -2, transition: 'all 0.15s' }}>
                            {label}
                          </button>
                        )
                      })}
                    </div>
                    {/* 当前 L1 内容 */}
                    {renderL1Content()}
                  </div>
                )
              })()}
            </div>
          )
        })()}

        {/* 录入筛查结果 Modal */}
        {showScreeningForm && (
          <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowScreeningForm(false) }}>
            <div className="modal" style={{ maxWidth: 620, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
              <div className="modal-header" style={{ flexShrink: 0 }}>
                <h3 className="modal-title">{editingScreeningId ? '修改筛查结果' : '录入筛查结果'}</h3>
                <button className="modal-close" onClick={() => { setShowScreeningForm(false); setEditingScreeningId(null) }}>✕</button>
              </div>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', flex: 1 }}>
                {/* 三级联动选择（从管理端动态加载） */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">第一层：筛查大类 *</label>
                  <select className="form-input" value={screeningForm.screeningL1}
                    onChange={e => {
                      const l1 = e.target.value
                      setScreeningForm(f => ({ ...f, screeningL1: l1, screeningL2: '', screeningL3: '', title: '', screeningCategory: l1 }))
                    }}>
                    <option value="">请选择</option>
                    {screeningTree.map(n => <option key={String(n._id)} value={String(n._id)}>{n.label}</option>)}
                  </select>
                </div>
                {screeningForm.screeningL1 && (() => {
                  const l1Node = screeningTree.find(n => String(n._id) === screeningForm.screeningL1)
                  if (!l1Node) return null
                  return (
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">第二层：具体分类 *</label>
                      <select className="form-input" value={screeningForm.screeningL2}
                        onChange={e => {
                          const l2 = e.target.value
                          const l2Node = l1Node.children.find(c => c.label === l2)
                          const labOrders = l2Node?.labOrders || []
                          const examItems = l2Node?.examItems || []
                          const funcItems = l2Node?.funcItems || []
                          const allNames = [...labOrders.map(o => o.name || o), ...examItems.map(x => x.name), ...funcItems]
                          setScreeningForm(f => ({ ...f, screeningL2: l2, screeningL3: '', screeningL3Items: allNames, title: l2, reportItems: labOrders.map(o => { const order = typeof o === 'string' ? { name: o, subItems: [] } : o; return { name: order.name, subItems: (order.subItems || []).map(s => ({ name: s.name, value: '', unit: s.unit || '', referenceRange: s.referenceRange || '', status: 'normal' })), value: '', unit: '', referenceRange: '', status: 'normal' } }), examOrderItems: examItems.map(x => ({ name: x.name, description: x.description || '', conclusion: x.conclusion || '' })), funcTestItems: funcItems.map(name => ({ name, result: '' })), examDescription: '', examConclusion: '', linkedItemType: null }))
                        }}>
                        <option value="">请选择</option>
                        {l1Node.children.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
                      </select>
                    </div>
                  )
                })()}
                {/* 已选路径 */}
                {screeningForm.screeningL2 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: '#E8F5EF', borderRadius: 6, border: '1px solid #BBF7D0', fontSize: 12, color: '#1E6B50' }}>
                    <span>✓</span>
                    <span style={{ color: '#8AA89C' }}>
                      {screeningTree.find(n => String(n._id) === screeningForm.screeningL1)?.label}
                      {' › '}
                    </span>
                    <span style={{ fontWeight: 600 }}>{screeningForm.screeningL2}</span>
                    {(screeningForm.screeningL3Items || []).length > 0 && (
                      <span style={{ color: '#8AA89C' }}>（{screeningForm.screeningL3Items.length} 项）</span>
                    )}
                  </div>
                )}

                {/* ── 检验医嘱 ── */}
                {screeningForm.screeningL2 && (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <label className="form-label" style={{ marginBottom: 0, color: '#1E6B50', fontWeight: 700 }}>
                        检验医嘱
                        {screeningForm.reportItems.length > 0 && <span style={{ marginLeft: 6, fontSize: 11, color: '#8AA89C', fontWeight: 400 }}>（{screeningForm.reportItems.length} 项）</span>}
                      </label>
                      <button type="button" className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setScreeningForm(f => ({ ...f, reportItems: [{ name: '', subItems: [], value: '', unit: '', referenceRange: '', status: 'normal' }, ...f.reportItems] }))
                          setScreeningSuggestKey('lab-0')
                        }}>
                        + 手动添加
                      </button>
                    </div>
                    {screeningForm.reportItems.length === 0 ? (
                      <div style={{ fontSize: 12, color: '#aaa', padding: '4px 0' }}>该分类无检验医嘱项目</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {screeningForm.reportItems.map((order, oi) => {
                          const hasSubItems = order.subItems && order.subItems.length > 0
                          const updateOrder = patch => setScreeningForm(f => { const a = [...f.reportItems]; a[oi] = { ...a[oi], ...patch }; return { ...f, reportItems: a } })
                          const updateSub = (si, patch) => setScreeningForm(f => { const a = [...f.reportItems]; const subs = [...a[oi].subItems]; subs[si] = { ...subs[si], ...patch }; a[oi] = { ...a[oi], subItems: subs }; return { ...f, reportItems: a } })
                          const STATUS_OPTIONS = [['normal','正常'],['abnormal','异常'],['attention','注意']]
                          return (
                            <div key={oi} style={{ border: '1px solid #BBF7D0', borderRadius: 8, background: '#fff', position: 'relative', zIndex: screeningSuggestKey === `lab-${oi}` ? 100 : 1 }}>
                              {/* 医嘱标题行 */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: '#E8F5EF', borderBottom: hasSubItems ? '1px solid #BBF7D0' : 'none' }}>
                                <div style={{ flex: 1, position: 'relative' }}>
                                  <input className="form-input" style={{ width: '100%', fontWeight: 600, fontSize: 13, background: 'transparent', border: '1px solid transparent', padding: '2px 6px' }}
                                    placeholder="检验医嘱名称（可搜索）" value={order.name}
                                    onChange={e => { updateOrder({ name: e.target.value }); setScreeningSuggestKey(`lab-${oi}`) }}
                                    onFocus={() => setScreeningSuggestKey(`lab-${oi}`)}
                                    onBlur={() => setTimeout(() => setScreeningSuggestKey(k => k === `lab-${oi}` ? null : k), 150)} />
                                  {screeningSuggestKey === `lab-${oi}` && (() => {
                                    const q = order.name.toLowerCase()
                                    const hits = (screeningL2SuggestData?.labOrders || []).filter(o2 => o2.name.toLowerCase().includes(q) && o2.name !== order.name)
                                    if (!hits.length) return null
                                    return (
                                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999, background: '#fff', border: '1px solid #BBF7D0', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 180, overflowY: 'auto', marginTop: 2 }}>
                                        {hits.map((hit, hi) => (
                                          <div key={hi} onMouseDown={() => {
                                            updateOrder({ name: hit.name, subItems: (hit.subItems || []).map(s => ({ name: s.name, value: '', unit: s.unit || '', referenceRange: s.referenceRange || '', status: 'normal' })) })
                                            setScreeningSuggestKey(null)
                                          }} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 12, color: '#1A2B24', borderBottom: '1px solid #f0ece4' }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#E8F5EF'}
                                            onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                            {hit.name}
                                            {hit.subItems?.length > 0 && <span style={{ marginLeft: 6, fontSize: 11, color: '#8AA89C' }}>{hit.subItems.length}项</span>}
                                          </div>
                                        ))}
                                      </div>
                                    )
                                  })()}
                                </div>
                                {!hasSubItems && (
                                  <>
                                    <input className="form-input" style={{ width: 70, padding: '2px 6px', fontSize: 12 }} placeholder="结果" value={order.value || ''}
                                      onChange={e => updateOrder({ value: e.target.value })} />
                                    <input className="form-input" style={{ width: 60, padding: '2px 6px', fontSize: 12 }} placeholder="单位" value={order.unit || ''}
                                      onChange={e => updateOrder({ unit: e.target.value })} />
                                    <select className="form-input" style={{ width: 72, padding: '2px 4px', fontSize: 12 }} value={order.status || 'normal'}
                                      onChange={e => updateOrder({ status: e.target.value })}>
                                      {STATUS_OPTIONS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                                    </select>
                                  </>
                                )}
                                <button type="button" style={{ background: 'none', border: 'none', color: '#DC3545', cursor: 'pointer', fontSize: 14, padding: '0 2px', flexShrink: 0 }}
                                  onClick={() => setScreeningForm(f => ({ ...f, reportItems: f.reportItems.filter((_, i) => i !== oi) }))}>✕</button>
                              </div>
                              {/* 子项目表格 */}
                              {hasSubItems && (
                                <div>
                                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr 1fr auto', gap: 0, background: '#f5f2ec', padding: '3px 10px', fontSize: 11, color: '#8AA89C', fontWeight: 600 }}>
                                    <span>指标名称</span><span>结果</span><span>单位</span><span>参考范围</span><span>状态</span><span />
                                  </div>
                                  {order.subItems.map((sub, si) => (
                                    <div key={si} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr 1fr auto', gap: 4, padding: '4px 10px', borderTop: '1px solid #f0ece4', alignItems: 'center' }}>
                                      <span style={{ fontSize: 12, color: '#1A2B24' }}>{sub.name}</span>
                                      <input className="form-input" style={{ padding: '2px 6px', fontSize: 12 }} placeholder="结果" value={sub.value || ''}
                                        onChange={e => updateSub(si, { value: e.target.value })} />
                                      <input className="form-input" style={{ padding: '2px 6px', fontSize: 12 }} placeholder="单位" value={sub.unit || ''}
                                        onChange={e => updateSub(si, { unit: e.target.value })} />
                                      <input className="form-input" style={{ padding: '2px 6px', fontSize: 12 }} placeholder="参考范围" value={sub.referenceRange || ''}
                                        onChange={e => updateSub(si, { referenceRange: e.target.value })} />
                                      <select className="form-input" style={{ padding: '2px 4px', fontSize: 12 }} value={sub.status || 'normal'}
                                        onChange={e => updateSub(si, { status: e.target.value })}>
                                        {STATUS_OPTIONS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                                      </select>
                                      <button type="button" style={{ background: 'none', border: 'none', color: '#DC3545', cursor: 'pointer', fontSize: 14, padding: '0 2px', flexShrink: 0 }}
                                        onClick={() => setScreeningForm(f => { const a = [...f.reportItems]; a[oi] = { ...a[oi], subItems: a[oi].subItems.filter((_, i) => i !== si) }; return { ...f, reportItems: a } })}>✕</button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {/* 2026-07-02：检验单结论——按用户确认，结论是整张检验单(orderName)维度共用一条，
                                  不需要每个子项单独填；提交时会把这条结论赋值给该单下所有子项的conclusion字段，
                                  跟AI提取路径（每个lab子项本身就带conclusion）保持展示层完全兼容，不用改展示逻辑 */}
                              <div style={{ padding: '4px 10px 8px', borderTop: '1px solid #f0ece4' }}>
                                <input className="form-input" style={{ width: '100%', padding: '3px 6px', fontSize: 12, background: '#FFFBEB', borderColor: '#FCD34D' }}
                                  placeholder="本检验单结论（选填，如：肝功能各项均正常）" value={order.conclusion || ''}
                                  onChange={e => updateOrder({ conclusion: e.target.value })} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ── 检查医嘱 ── */}
                {screeningForm.screeningL2 && (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <label className="form-label" style={{ marginBottom: 0, color: '#0369A1', fontWeight: 700 }}>
                        检查医嘱
                        {screeningForm.examOrderItems.length > 0 && <span style={{ marginLeft: 6, fontSize: 11, color: '#8AA89C', fontWeight: 400 }}>（{screeningForm.examOrderItems.length} 项）</span>}
                      </label>
                      <button type="button" className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setScreeningForm(f => ({ ...f, examOrderItems: [{ name: '', description: '', conclusion: '' }, ...f.examOrderItems] }))
                          setScreeningSuggestKey('exam-0')
                        }}>
                        + 手动添加
                      </button>
                    </div>
                    {screeningForm.examOrderItems.length === 0 ? (
                      <div style={{ fontSize: 12, color: '#aaa', padding: '4px 0' }}>该分类无检查医嘱项目</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {screeningForm.examOrderItems.map((item, idx) => (
                          <div key={idx} style={{ border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 12px', background: '#EFF6FF' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
                              <div style={{ flex: 1, position: 'relative' }}>
                                <input className="form-input" style={{ width: '100%', fontWeight: 600, fontSize: 13 }} placeholder="检查项目名称（可搜索）" value={item.name}
                                  onChange={e => { setScreeningForm(f => { const a = [...f.examOrderItems]; a[idx] = { ...a[idx], name: e.target.value }; return { ...f, examOrderItems: a } }); setScreeningSuggestKey(`exam-${idx}`) }}
                                  onFocus={() => setScreeningSuggestKey(`exam-${idx}`)}
                                  onBlur={() => setTimeout(() => setScreeningSuggestKey(k => k === `exam-${idx}` ? null : k), 150)} />
                                {screeningSuggestKey === `exam-${idx}` && (() => {
                                  const q = item.name.toLowerCase()
                                  const hits = (screeningL2SuggestData?.examItems || []).filter(x => x.name.toLowerCase().includes(q) && x.name !== item.name)
                                  if (!hits.length) return null
                                  return (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999, background: '#fff', border: '1px solid #BFDBFE', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 160, overflowY: 'auto', marginTop: 2 }}>
                                      {hits.map((hit, hi) => (
                                        <div key={hi} onMouseDown={() => {
                                          setScreeningForm(f => { const a = [...f.examOrderItems]; a[idx] = { ...a[idx], name: hit.name, description: hit.description || '', conclusion: hit.conclusion || '' }; return { ...f, examOrderItems: a } })
                                          setScreeningSuggestKey(null)
                                        }} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 12, color: '#1A2B24', borderBottom: '1px solid #f0ece4' }}
                                          onMouseEnter={e => e.currentTarget.style.background = '#EFF6FF'}
                                          onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                          {hit.name}
                                        </div>
                                      ))}
                                    </div>
                                  )
                                })()}
                              </div>
                              <button type="button" style={{ background: 'none', border: 'none', color: '#DC3545', cursor: 'pointer', fontSize: 14, padding: '0 4px', flexShrink: 0 }}
                                onClick={() => setScreeningForm(f => ({ ...f, examOrderItems: f.examOrderItems.filter((_, i) => i !== idx) }))}>✕</button>
                            </div>
                            <textarea className="form-input" rows={2} style={{ fontSize: 12, marginBottom: 4 }} placeholder="检查描述（检查目的、注意事项等）"
                              value={item.description}
                              onChange={e => setScreeningForm(f => { const a = [...f.examOrderItems]; a[idx] = { ...a[idx], description: e.target.value }; return { ...f, examOrderItems: a } })} />
                            <textarea className="form-input" rows={2} style={{ fontSize: 12, marginBottom: 4 }} placeholder="诊断结论（如：未见明显异常）"
                              value={item.conclusion}
                              onChange={e => setScreeningForm(f => { const a = [...f.examOrderItems]; a[idx] = { ...a[idx], conclusion: e.target.value }; return { ...f, examOrderItems: a } })} />
                            <div style={{ fontSize: 11, color: '#7C3AED', marginBottom: 2, fontWeight: 600 }}>主要结论（展示在专项筛查）</div>
                            <input className="form-input" style={{ fontSize: 12, background: '#F3EFFB', borderColor: '#C4B5FD' }} placeholder="如：未见明显异常 / 建议3个月后复查"
                              value={item.mainConclusion || ''}
                              onChange={e => setScreeningForm(f => { const a = [...f.examOrderItems]; a[idx] = { ...a[idx], mainConclusion: e.target.value }; return { ...f, examOrderItems: a } })} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── 功能医学检测 ── */}
                {screeningForm.screeningL2 && (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <label className="form-label" style={{ marginBottom: 0, color: '#7C3AED', fontWeight: 700 }}>
                        功能医学检测
                        {screeningForm.funcTestItems.length > 0 && <span style={{ marginLeft: 6, fontSize: 11, color: '#8AA89C', fontWeight: 400 }}>（{screeningForm.funcTestItems.length} 项）</span>}
                      </label>
                      <button type="button" className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setScreeningForm(f => ({ ...f, funcTestItems: [{ name: '', result: '' }, ...f.funcTestItems] }))
                          setScreeningSuggestKey('func-0')
                        }}>
                        + 手动添加
                      </button>
                    </div>
                    {screeningForm.funcTestItems.length === 0 ? (
                      <div style={{ fontSize: 12, color: '#aaa', padding: '4px 0' }}>该分类无功能医学检测项目</div>
                    ) : (
                      <div style={{ border: '1px solid #E0D9CE', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr auto', gap: 0, background: '#f5f2ec', padding: '4px 8px', fontSize: 11, color: '#8AA89C', fontWeight: 600 }}>
                          <span>检测项目</span><span>检测结果</span><span />
                        </div>
                        {screeningForm.funcTestItems.map((item, idx) => (
                          <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 3fr auto', gap: 4, padding: '4px 8px', borderTop: '1px solid #f0ece4', alignItems: 'center' }}>
                            <div style={{ position: 'relative' }}>
                              <input className="form-input" style={{ padding: '3px 6px', fontSize: 12, width: '100%' }} placeholder="检测项目名称" value={item.name}
                                onChange={e => { setScreeningForm(f => { const a = [...f.funcTestItems]; a[idx] = { ...a[idx], name: e.target.value }; return { ...f, funcTestItems: a } }); setScreeningSuggestKey(`func-${idx}`) }}
                                onFocus={() => setScreeningSuggestKey(`func-${idx}`)}
                                onBlur={() => setTimeout(() => setScreeningSuggestKey(k => k === `func-${idx}` ? null : k), 150)} />
                              {screeningSuggestKey === `func-${idx}` && (() => {
                                const q = item.name.toLowerCase()
                                const hits = (screeningL2SuggestData?.funcItems || []).filter(n => n.toLowerCase().includes(q) && n !== item.name)
                                if (!hits.length) return null
                                return (
                                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999, background: '#fff', border: '1px solid #E9D5FF', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 160, overflowY: 'auto', marginTop: 2 }}>
                                    {hits.map((hit, hi) => (
                                      <div key={hi} onMouseDown={() => {
                                        setScreeningForm(f => { const a = [...f.funcTestItems]; a[idx] = { ...a[idx], name: hit }; return { ...f, funcTestItems: a } })
                                        setScreeningSuggestKey(null)
                                      }} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 12, color: '#1A2B24', borderBottom: '1px solid #f0ece4' }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#F5F3FF'}
                                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                        {hit}
                                      </div>
                                    ))}
                                  </div>
                                )
                              })()}
                            </div>
                            <input className="form-input" style={{ padding: '3px 6px', fontSize: 12 }} placeholder="检测结果" value={item.result}
                              onChange={e => setScreeningForm(f => { const a = [...f.funcTestItems]; a[idx] = { ...a[idx], result: e.target.value }; return { ...f, funcTestItems: a } })} />
                            <button type="button" style={{ background: 'none', border: 'none', color: '#DC3545', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}
                              onClick={() => setScreeningForm(f => ({ ...f, funcTestItems: f.funcTestItems.filter((_, i) => i !== idx) }))}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">检查日期</label>
                    <input className="form-input" type="date" value={screeningForm.checkDate}
                      onChange={e => setScreeningForm(f => ({ ...f, checkDate: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">检查机构</label>
                    <input className="form-input" placeholder="如：北京协和医院" value={screeningForm.hospital}
                      onChange={e => setScreeningForm(f => ({ ...f, hospital: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">主要结论/备注</label>
                  <textarea className="form-input" rows={2} placeholder="如：未见明显异常；左叶结节3mm，建议随访" value={screeningForm.note}
                    onChange={e => setScreeningForm(f => ({ ...f, note: e.target.value }))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">上传报告（图片或 PDF，可多选）</label>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                    multiple
                    style={{ display: 'none' }}
                    id="screening-file-input"
                    onChange={e => {
                      const picked = Array.from(e.target.files || [])
                      setScreeningFiles(prev => [...prev, ...picked])
                      e.target.value = ''
                    }}
                  />
                  <div style={{ marginTop: 4 }}>
                    <label htmlFor="screening-file-input" style={{ cursor: 'pointer', padding: '6px 14px', borderRadius: 8, border: '1px solid #E0D9CE', background: '#fff', fontSize: 13, color: '#4A6558', display: 'inline-block' }}>
                      + 选择文件
                    </label>
                    {screeningFiles.length > 0 && (
                      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {screeningFiles.map((f, i) => (
                          <span key={i} style={{ fontSize: 12, color: '#1E6B50', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {f.type === 'application/pdf' ? '📄' : '🖼'} {f.name}
                            <button onClick={() => setScreeningFiles(prev => prev.filter((_, j) => j !== i))}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC3545', fontSize: 12, padding: 0 }}>✕</button>
                          </span>
                        ))}
                      </div>
                    )}
                    {screeningFiles.length === 0 && <span style={{ fontSize: 12, color: '#8AA89C', marginLeft: 10 }}>未选择文件</span>}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={() => setShowScreeningForm(false)}>取消</button>
                <button className="btn btn-primary" onClick={handleSaveScreeningRecord} disabled={screeningSaving}>
                  {screeningSaving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── 体检关键指标 ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title">体检关键指标</div>
            {!editingLabValues ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => { setLabNewRecord(false); setLabForm(user.labValues || {}); setEditingLabValues(true) }}>编辑当前</button>
                <button className="btn btn-primary btn-sm" onClick={() => { setLabNewRecord(true); setLabForm({}); setEditingLabValues(true) }}>+ 新增记录</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {labNewRecord && <span style={{ fontSize: 12, color: '#1E6B50', fontWeight: 600 }}>新增复查记录</span>}
                <button className="btn btn-primary btn-sm" onClick={handleSaveLabValues}>保存</button>
                <button className="btn btn-secondary btn-sm" onClick={() => { setEditingLabValues(false); setLabNewRecord(false); setLabForm(user.labValues || {}) }}>取消</button>
              </div>
            )}
          </div>
          <div style={{ padding: '12px 20px' }}>
            {editingLabValues ? (
              <div>
                <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 12 }}>填写最近一次体检结果（用于健康评分，留空表示正常）</div>
                <div>
                  <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 8, fontWeight: 600 }}>体征 / 血压</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px 20px', marginBottom: 16 }}>
                    <LabField label="体重" unit="kg" placeholder="如 65" value={labForm.weight || ''} onChange={e => setLabForm(f => ({ ...f, weight: e.target.value }))} />
                    <LabField label="收缩压 SBP" unit="mmHg" placeholder="如 120" value={labForm.sbp || ''} onChange={e => setLabForm(f => ({ ...f, sbp: e.target.value }))} />
                    <LabField label="舒张压 DBP" unit="mmHg" placeholder="如 80" value={labForm.dbp || ''} onChange={e => setLabForm(f => ({ ...f, dbp: e.target.value }))} />
                    <LabField label="腰围" unit="cm" placeholder="如 80" value={labForm.waist || ''} onChange={e => setLabForm(f => ({ ...f, waist: e.target.value }))} />
                  </div>
                  <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 8, fontWeight: 600 }}>血糖 / 血脂</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px 20px', marginBottom: 16 }}>
                    <LabField label="空腹血糖 FPG" unit="mmol/L" placeholder="如 5.6" value={labForm.fpg || ''} onChange={e => setLabForm(f => ({ ...f, fpg: e.target.value }))} />
                    <LabField label="糖化血红蛋白 HbA1c" unit="%" placeholder="如 5.4" value={labForm.hba1c || ''} onChange={e => setLabForm(f => ({ ...f, hba1c: e.target.value }))} />
                    <LabField label="总胆固醇 TC" unit="mmol/L" placeholder="如 4.8" value={labForm.tc || ''} onChange={e => setLabForm(f => ({ ...f, tc: e.target.value }))} />
                    <LabField label="低密度脂蛋白 LDL-C" unit="mmol/L" placeholder="如 2.8" value={labForm.ldl || ''} onChange={e => setLabForm(f => ({ ...f, ldl: e.target.value }))} />
                    <LabField label="高密度脂蛋白 HDL-C" unit="mmol/L" placeholder="如 1.3" value={labForm.hdl || ''} onChange={e => setLabForm(f => ({ ...f, hdl: e.target.value }))} />
                    <LabField label="甘油三酯 TG" unit="mmol/L" placeholder="如 1.2" value={labForm.tg || ''} onChange={e => setLabForm(f => ({ ...f, tg: e.target.value }))} />
                  </div>
                  <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 8, fontWeight: 600 }}>肝肾 / 代谢</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px 20px', marginBottom: 16 }}>
                    <LabField label="谷丙转氨酶 ALT" unit="U/L" placeholder="如 25" value={labForm.alt || ''} onChange={e => setLabForm(f => ({ ...f, alt: e.target.value }))} />
                    <LabField label="谷草转氨酶 AST" unit="U/L" placeholder="如 22" value={labForm.ast || ''} onChange={e => setLabForm(f => ({ ...f, ast: e.target.value }))} />
                    <LabField label="γ-谷氨酰转肽酶 GGT" unit="U/L" placeholder="如 30" value={labForm.ggt || ''} onChange={e => setLabForm(f => ({ ...f, ggt: e.target.value }))} />
                    <LabField label="血肌酐 Cr" unit="μmol/L" placeholder="如 75" value={labForm.cr || ''} onChange={e => setLabForm(f => ({ ...f, cr: e.target.value }))} />
                    <LabField label="尿微量蛋白 mAlb" unit="mg/L" placeholder="如 15" value={labForm.umalb || ''} onChange={e => setLabForm(f => ({ ...f, umalb: e.target.value }))} />
                    <LabField label="肾小球滤过率 eGFR" unit="mL/min/1.73m²" placeholder="如 90" value={labForm.egfr || ''} onChange={e => setLabForm(f => ({ ...f, egfr: e.target.value }))} />
                    <LabField label="尿酸 UA" unit="μmol/L" placeholder="如 350" value={labForm.ua || ''} onChange={e => setLabForm(f => ({ ...f, ua: e.target.value }))} />
                    <LabField label="同型半胱氨酸 Hcy" unit="μmol/L" placeholder="如 10" value={labForm.hcy || ''} onChange={e => setLabForm(f => ({ ...f, hcy: e.target.value }))} />
                    <LabField label="脂蛋白磷脂酶A2 Lp-PLA2" unit="ng/mL" placeholder="如 180" value={labForm.lpla2 || ''} onChange={e => setLabForm(f => ({ ...f, lpla2: e.target.value }))} />
                    <div>
                      <span style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 3 }}>肾功能（CKD分期）</span>
                      <select className="form-control" value={labForm.ckdStage || ''}
                        onChange={e => setLabForm(f => ({ ...f, ckdStage: e.target.value }))} style={{ fontSize: 13 }}>
                        <option value="">正常/未查</option>
                        <option value="1">1期（轻度）</option>
                        <option value="2">2期（轻中度）</option>
                        <option value="3">3期（中度）</option>
                        <option value="4">4期（重度）</option>
                        <option value="5">5期（终末期）</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 3 }}>检测日期</span>
                    <input className="form-control" type="date" value={labForm.labDate || ''}
                      onChange={e => setLabForm(f => ({ ...f, labDate: e.target.value }))} style={{ fontSize: 13, width: 200 }} />
                  </div>
                </div>
              </div>
            ) : (() => {
              // ── 从专项筛查 reportItems 派生指标值 ──
              // 按检查日期倒序，每个 key 取最新一条
              // 每项可为 string[] 或 { names: string[], exclude: string[] }
              const REPORT_KEY_MAP = {
                fpg:   ['空腹血糖','空腹葡萄糖','GLU','FPG','Glu(空腹)','血糖-0'],
                hba1c: ['糖化血红蛋白','HbA1c','HbA1C','HBA1C','HBA1c','HbA1c(%)'],
                // 裸'胆固醇'会误命中'高密度脂蛋白胆固醇'(HDL)/'低密度脂蛋白胆固醇'(LDL)——金娟2026 TC误取成HDL的1.73(应4.42)。排除脂蛋白类
                tc:    { names: ['总胆固醇','TC','CHOL','胆固醇'], exclude: ['高密度','低密度','脂蛋白','HDL','LDL'] },
                tg:    ['甘油三酯','TG','三酰甘油','TRIG'],
                ldl:   ['低密度脂蛋白','LDL','LDL-C','LDL-胆固醇'],
                hdl:   ['高密度脂蛋白','HDL','HDL-C','HDL-胆固醇'],
                alt:   ['谷丙转氨酶','ALT','丙氨酸转氨酶','丙氨酸氨基转移酶'],
                // 天/门冬 × 转氨酶/氨基转移酶 四种写法全覆盖（2026-07-10：金娟名下"天冬氨酸氨基转移酶"此前漏配，导致历年AST只显示最新一年）
                ast:   ['谷草转氨酶','AST','天冬氨酸转氨酶','天冬氨酸氨基转移酶','门冬氨酸转氨酶','门冬氨酸氨基转移酶'],
                // 故意不含'谷氨酰转肽酶'，避免匹配到 尿谷氨酰转肽酶G（尿液GGT）
                ggt:   ['γ-谷氨酰转肽酶','γ-谷氨酸转肽酶','GGT','γ-GT','γGT','谷氨酸转肽酶'],
                // 排除'结晶/盐结晶'：三大常规里的"尿酸结晶"不是血尿酸
                ua:    { names: ['尿酸','UA','SUA'], exclude: ['结晶','盐结晶'] },
                // 血肌酐：不含短形式'Cr'，避免匹配到尿Cr（尿液肌酐）。
                // 2026-07-09修复"血肌酐夹杂尿肌酐"：names含裸"肌酐"会匹配到"尿肌酐/尿液肌酐/U-肌酐"，
                // 用exclude排除所有尿液标本的肌酐（带"尿"字），确保只取血清肌酐。
                cr:    { names: ['血肌酐','血清肌酐','肌酐','CREA','SCr','S-Cr','血Cr'], exclude: ['尿','U-','U肌酐','U-Cr'] },
                umalb: ['尿微量白蛋白','尿微量蛋白','mAlb','MAU','微量白蛋白','MALB'],
                egfr:  ['肾小球滤过率','eGFR','GFR','估算肾小球滤过率'],
                hcy:   ['同型半胱氨酸','Hcy','HCY'],
                lpla2: ['Lp-PLA2','脂蛋白磷脂酶A2','LPLA2'],
                // 动态血压监测报告里有"夜间收缩压下降率""24小时收缩压最大值"等衍生指标，
                // name本身包含"收缩压"三个字但value是百分比/衍生值不是真实血压，必须排除，
                // 否则会被误判命中显示成血压数值（2026-07-03 潘孝银"动态血压"报告复现过）
                sbp:   { names: ['收缩压','SBP','收缩压(mmHg)'], exclude: ['下降率','最大值','最小值','负荷','标准差','变异'] },
                dbp:   { names: ['舒张压','DBP','舒张压(mmHg)'], exclude: ['下降率','最大值','最小值','负荷','标准差','变异'] },
                weight:{ names: ['体重','Weight','BW'], exclude: ['体重指数','BMI','身体质量指数'] },
              }
              // 排序报告（最新在前）
              const sortedReports = [...screeningReports].sort((a, b) =>
                new Date(b.checkDate || b.createdAt || 0) - new Date(a.checkDate || a.createdAt || 0)
              )
              // 从 reportItems 派生数值指标
              const derived = {}
              for (const [key, def] of Object.entries(REPORT_KEY_MAP)) {
                const names = Array.isArray(def) ? def : def.names
                const exclude = Array.isArray(def) ? [] : (def.exclude || [])
                for (const report of sortedReports) {
                  const item = (report.reportItems || []).find(ri =>
                    ri.name &&
                    names.some(n => ri.name.toLowerCase().includes(n.toLowerCase())) &&
                    !exclude.some(ex => ri.name.includes(ex))
                  )
                  if (item && item.value) {
                    derived[key] = {
                      value: item.value,
                      unit: item.unit || '',
                      date: report.checkDate || report.date || '',
                      source: report.title || '专项筛查',
                      abnormal: item.status === 'abnormal',
                      referenceRange: item.referenceRange || '',
                      // 供「单项修改」精确回写：记来源报告 id 与命中的项目名
                      reportId: report._id,
                      itemName: item.name,
                      lastEdit: [...(report.dataEditLog || [])].reverse().find(log => log.itemName === item.name && log.field === 'value'),
                    }
                    break
                  }
                }
              }
              // 动态血压监测等报告常把血压记成一条 name="血压" value="124/75" 的复合格式，
              // 上面按"收缩压"/"舒张压"关键词找独立子项会找不到（2026-07-03 潘孝银"动态血压"
              // 报告即是此情况），这里退而解析复合格式补上 sbp/dbp
              ;['sbp', 'dbp'].forEach((key, idx) => {
                if (derived[key]) return
                for (const report of sortedReports) {
                  const item = (report.reportItems || []).find(ri => ri.name === '血压' && /^\d+\s*\/\s*\d+/.test(ri.value || ''))
                  if (item) {
                    const parts = item.value.split('/').map(s => s.trim())
                    derived[key] = {
                      value: parts[idx], unit: item.unit || 'mmHg',
                      date: report.checkDate || report.date || '',
                      source: report.title || '专项筛查', abnormal: false, referenceRange: '',
                    }
                    break
                  }
                }
              })
              // （超声不纳入体检关键指标——金娟明确无此要求，2026-07-10 移除）

              // 合并：labValues 优先（手动录入），derived 作为来源补充展示
              const lv = user.labValues || {}
              const history = user.labHistory || []
              const gender = user.gender === '女' ? 'F' : 'M'

              // 指标定义：key / label / unit / 判断函数
              const LAB_DEFS = [
                { key: 'weight',  label: '体重',           unit: 'kg',           check: () => null },
                { key: 'sbp',     label: '收缩压',          unit: 'mmHg',         check: v => parseFloat(v) >= 130, ref: '90-130',  refLow: 90,  refHigh: 130 },
                { key: 'dbp',     label: '舒张压',          unit: 'mmHg',         check: v => parseFloat(v) >= 80,  ref: '60-80',   refLow: 60,  refHigh: 80 },
                { key: 'fpg',     label: '空腹血糖',        unit: 'mmol/L',       check: v => parseFloat(v) > 6.1,  ref: '3.9-6.1', refLow: 3.9, refHigh: 6.1 },
                { key: 'hba1c',   label: 'HbA1c',          unit: '%',            check: v => parseFloat(v) >= 6.5, ref: '4-6.5',   refLow: 4.0, refHigh: 6.5 },
                { key: 'tc',      label: '总胆固醇 TC',     unit: 'mmol/L',       check: v => parseFloat(v) >= 5.2, ref: '3.1-5.2', refLow: 3.1, refHigh: 5.2 },
                { key: 'tg',      label: '甘油三酯 TG',     unit: 'mmol/L',       check: v => parseFloat(v) >= 1.7, ref: '0.6-1.7', refLow: 0.6, refHigh: 1.7 },
                { key: 'ldl',     label: 'LDL-C',          unit: 'mmol/L',       check: v => parseFloat(v) >= 3.4, ref: '1.4-3.4', refLow: 1.4, refHigh: 3.4 },
                { key: 'hdl',     label: 'HDL-C',          unit: 'mmol/L',       check: v => parseFloat(v) < (gender === 'F' ? 1.3 : 1.0), ref: gender === 'F' ? '≥1.3' : '≥1.0', refLow: gender === 'F' ? 1.3 : 1.0 },
                { key: 'ua',      label: '尿酸 UA',         unit: 'μmol/L',       check: v => parseFloat(v) > (gender === 'F' ? 360 : 420), ref: gender === 'F' ? '150-360' : '210-420', refLow: gender === 'F' ? 150 : 210, refHigh: gender === 'F' ? 360 : 420 },
                { key: 'cr',      label: '血肌酐',          unit: 'μmol/L',       check: v => parseFloat(v) > (gender === 'F' ? 97 : 106),  ref: gender === 'F' ? '53-97' : '62-106',   refLow: gender === 'F' ? 53 : 62,   refHigh: gender === 'F' ? 97 : 106 },
                { key: 'umalb',   label: '尿微量蛋白',      unit: 'mg/L',         check: v => parseFloat(v) > 30,   ref: '≤30',     refHigh: 30 },
                { key: 'egfr',    label: 'eGFR',           unit: 'mL/min/1.73m²', check: v => parseFloat(v) < 60,  ref: '≥60',     refLow: 60 },
                { key: 'alt',     label: 'ALT',            unit: 'U/L',           check: v => parseFloat(v) > 40,   ref: '7-40',    refLow: 7,   refHigh: 40 },
                { key: 'ast',     label: 'AST',            unit: 'U/L',           check: v => parseFloat(v) > 40,   ref: '13-40',   refLow: 13,  refHigh: 40 },
                { key: 'ggt',     label: 'GGT',            unit: 'U/L',           check: v => parseFloat(v) > (gender === 'F' ? 35 : 50), ref: gender === 'F' ? '7-35' : '11-50', refLow: gender === 'F' ? 7 : 11, refHigh: gender === 'F' ? 35 : 50 },
                { key: 'hcy',     label: '同型半胱氨酸 Hcy', unit: 'μmol/L',      check: v => parseFloat(v) > 15,   ref: '≤15',     refHigh: 15 },
                { key: 'lpla2',   label: 'Lp-PLA2',        unit: 'ng/mL',        check: v => parseFloat(v) > 200,  ref: '≤200',    refHigh: 200 },
              ]

              // 解析保存的参考范围文字 → { refLow, refHigh, ref }
              const parseRefRange = (str) => {
                if (!str) return {}
                str = str.trim()
                const rangeM = str.match(/^([\d.]+)\s*[-~]\s*([\d.]+)/)
                if (rangeM) return { refLow: parseFloat(rangeM[1]), refHigh: parseFloat(rangeM[2]), ref: str }
                const highM = str.match(/^[≤<]\s*([\d.]+)/)
                if (highM) return { refHigh: parseFloat(highM[1]), ref: str }
                const lowM = str.match(/^[≥>]\s*([\d.]+)/)
                if (lowM) return { refLow: parseFloat(lowM[1]), ref: str }
                return { ref: str }
              }

              // 只从专项筛查派生值，不读 labValues
              const getVal = (key) => {
                if (derived[key]) return { val: derived[key].value, sourceLabel: derived[key].source || '筛查', date: derived[key].date || '', abnormal: derived[key].abnormal }
                return null
              }

              // 趋势：从所有筛查报告里按时间收集该 key 的历次值（旧→新）
              const trendData = (key) => {
                const def = REPORT_KEY_MAP[key]
                const names = Array.isArray(def) ? def : (def?.names || [])
                const exclude = Array.isArray(def) ? [] : (def?.exclude || [])
                if (!names.length) return []
                const pts = []
                ;[...sortedReports].reverse().forEach(report => {
                  const item = (report.reportItems || []).find(ri =>
                    ri.name &&
                    names.some(n => ri.name.toLowerCase().includes(n.toLowerCase())) &&
                    !exclude.some(ex => ri.name.includes(ex))
                  )
                  if (item && item.value && parseFloat(item.value)) {
                    const d = report.checkDate || report.date || ''
                    // 带年份（如 25/12），否则跨年历史点在 x 轴上无法区分（2026-07-10 金娟"AST历年只显示最新一年"同源问题）
                    let dateStr = '?'
                    if (d) {
                      const dt = new Date(d)
                      dateStr = `${String(dt.getFullYear()).slice(2)}/${dt.getMonth() + 1}`
                    }
                    // 不同检查机构参考范围可能不一致，每个历史点带上各自的机构+参考范围，
                    // 供悬停查看（2026-07-17反馈：不能统一用固定/最新一条的参考范围）
                    pts.push({
                      x: dateStr, y: parseFloat(item.value),
                      institution: report.hospital || report.institution || '',
                      ref: item.referenceRange || '',
                      reportId: report._id,
                      itemName: item.name,
                      lastEdit: [...(report.dataEditLog || [])].reverse().find(log => log.itemName === item.name && log.field === 'value'),
                      rawValue: item.value,
                      date: d,
                    })
                  }
                })
                return pts
              }

              // 有值的项（仅筛查派生）
              const filledDefs = LAB_DEFS.filter(d => getVal(d.key) !== null)
              const abnormalDefs = filledDefs.filter(d => {
                const v = getVal(d.key)
                if (!v) return false
                // 优先使用报告中明确标注的状态
                if (v.abnormal === true) return true
                if (v.abnormal === false && !d.isText) return false
                return d.check && d.check(v.val)
              })
              const hasData = filledDefs.length > 0

              // 展示的项（默认只显示异常，有体重就加上）
              const displayDefs = showAllLab ? filledDefs : [
                ...abnormalDefs,
                ...(getVal('weight') ? [LAB_DEFS.find(d => d.key === 'weight')] : []),
              ].filter((d, i, arr) => d && arr.findIndex(x => x && x.key === d.key) === i)

              if (!hasData) return (
                <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', padding: '12px 0' }}>
                  暂无筛查指标数据，请在「专项筛查结果」中录入报告项目
                </div>
              )

              return (
                <div>
                  {/* 摘要行 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      {abnormalDefs.length > 0
                        ? <span style={{ fontSize: 13, fontWeight: 600, color: '#DC3545' }}>⚠️ {abnormalDefs.length} 项异常</span>
                        : <span style={{ fontSize: 13, color: '#22A06B', fontWeight: 600 }}>✓ 所有指标正常</span>}
                      <span style={{ fontSize: 12, color: '#aaa' }}>来自专项筛查，共 {filledDefs.length} 项</span>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowAllLab(s => !s)}>
                      {showAllLab ? '只看异常' : `查看全部 ${filledDefs.length} 项`}
                    </button>
                  </div>

                  {displayDefs.length === 0 && !showAllLab && (
                    <div style={{ fontSize: 13, color: '#22A06B', textAlign: 'center', padding: '12px 0' }}>✓ 所有指标均在正常范围内</div>
                  )}

                  {/* 数值指标卡片 */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px 12px' }}>
                    {displayDefs.filter(d => d && !d.isText).map(d => {
                      const cur = getVal(d.key)
                      if (!cur) return null
                      const { val, sourceLabel, date, abnormal: itemAbnormal } = cur
                      const isAbnormal = itemAbnormal === true || (itemAbnormal !== false && d.check && d.check(val))
                      const pts = trendData(d.key)
                      const bgColor = isAbnormal ? '#FEF2F2' : d.key === 'weight' ? '#f9f7f3' : '#f0faf5'
                      const borderColor = isAbnormal ? '#DC3545' : d.key === 'weight' ? '#aaa' : '#22A06B'
                      const textColor = isAbnormal ? '#DC3545' : '#1A2B24'
                      const savedRef = parseRefRange(derived[d.key]?.referenceRange)
                      const displayRef = savedRef.ref || d.ref
                      const displayRefLow = savedRef.refLow ?? d.refLow
                      const displayRefHigh = savedRef.refHigh ?? d.refHigh
                      const src = derived[d.key] || {}
                      const canEdit = !!src.reportId && !!src.itemName
                      const isEditingThis = editingMetric && !editingMetric.history && editingMetric.key === d.key
                      return (
                        <div key={d.key} style={{ padding: '10px 12px', background: bgColor, borderRadius: 8, borderLeft: `3px solid ${borderColor}` }}>
                          <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 2, display: 'flex', justifyContent: 'space-between' }}>
                            <span>{d.label}</span>
                            {displayRef && <span style={{ color: isAbnormal ? '#DC354560' : '#8AA89C' }}>参考 {displayRef}</span>}
                          </div>
                          {isEditingThis ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '2px 0' }}>
                              <input className="form-control" autoFocus type="text" value={editingMetricVal}
                                onChange={e => setEditingMetricVal(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !savingMetric) handleSaveMetric() }}
                                style={{ fontSize: 14, fontWeight: 700, padding: '3px 8px', width: 80 }} />
                              <span style={{ fontSize: 11, color: '#8AA89C' }}>{d.unit}</span>
                              <button className="btn btn-primary btn-sm" style={{ fontSize: 11, padding: '2px 8px' }} disabled={savingMetric} onClick={handleSaveMetric}>{savingMetric ? '...' : '保存'}</button>
                              <button className="btn btn-secondary btn-sm" style={{ fontSize: 11, padding: '2px 8px' }} disabled={savingMetric} onClick={() => { setEditingMetric(null); setEditingMetricVal('') }}>取消</button>
                            </div>
                          ) : (
                            <div style={{ fontSize: 15, fontWeight: 700, color: textColor, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                              <span>{val} <span style={{ fontSize: 11, fontWeight: 400, color: '#8AA89C' }}>{d.unit}</span></span>
                              {canEdit && (
                                <button title="单项修改（直接改来源报告数据，无需AI重跑）" className="btn btn-secondary btn-sm"
                                  style={{ fontSize: 11, fontWeight: 500, color: '#1E6B50', padding: '2px 8px', lineHeight: 1.3 }}
                                  onClick={() => { setEditingMetric({ key: d.key, reportId: src.reportId, itemName: src.itemName, label: d.label }); setEditingMetricVal(String(val)) }}>编辑</button>
                              )}
                            </div>
                          )}
                          {sourceLabel && <div style={{ fontSize: 10, color: '#8AA89C', marginTop: 2 }}>{sourceLabel}{date ? `  ${date}` : ''}</div>}
                          {src.lastEdit && <div style={{ fontSize: 10, color: '#D97706', marginTop: 2 }}>最近修改：{src.lastEdit.operatorName || '未知人员'} · {new Date(src.lastEdit.at).toLocaleString('zh-CN')}</div>}
                          {!isEditingThis && pts.length >= 2 && (
                            <div style={{ marginTop: 4 }}>
                              <MiniTrendChart
                                data={pts}
                                color={borderColor}
                                label=""
                                refLow={displayRefLow}
                                refHigh={displayRefHigh}
                              />
                            </div>
                          )}
                          {pts.length > 0 && <div style={{ marginTop: 5 }}>
                            <button type="button" onClick={() => setExpandedMetricHistory(prev => ({ ...prev, [d.key]: !prev[d.key] }))}
                              style={{ border: 0, background: 'none', color: '#1E6B50', fontSize: 11, cursor: 'pointer', padding: 0 }}>
                              {expandedMetricHistory[d.key] ? '收起历史 ▲' : `查看/修改历史（${pts.length}）▼`}
                            </button>
                            {expandedMetricHistory[d.key] && <div style={{ marginTop: 5, borderTop: '1px solid #E5E7EB' }}>
                              {[...pts].reverse().map((point, pointIndex) => {
                                const editingPoint = editingMetric?.history && String(editingMetric.reportId) === String(point.reportId) && editingMetric.itemName === point.itemName
                                return <div key={`${point.reportId}-${point.itemName}-${pointIndex}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', fontSize: 11 }}>
                                  <span style={{ color: '#8AA89C', minWidth: 68 }}>{String(point.date || point.x).slice(0, 10)}</span>
                                  {editingPoint ? <>
                                    <input className="form-control" autoFocus value={editingMetricVal} onChange={e => setEditingMetricVal(e.target.value)} style={{ width: 72, padding: '2px 6px', fontSize: 11 }} />
                                    <button className="btn btn-primary btn-sm" disabled={savingMetric} onClick={handleSaveMetric}>保存</button>
                                    <button className="btn btn-secondary btn-sm" onClick={() => setEditingMetric(null)}>取消</button>
                                  </> : <>
                                    <span style={{ fontWeight: 600 }}>{point.rawValue} {d.unit}</span>
                                    <button className="btn btn-secondary btn-sm" style={{ padding: '1px 6px', fontSize: 10 }} onClick={() => {
                                      setEditingMetric({ key: d.key, reportId: point.reportId, itemName: point.itemName, label: `${d.label}（历史）`, history: true })
                                      setEditingMetricVal(String(point.rawValue))
                                    }}>修改来源</button>
                                    {point.lastEdit && <span style={{ color: '#8AA89C', marginLeft: 'auto' }}>修改：{point.lastEdit.operatorName || '未知人员'} · {new Date(point.lastEdit.at).toLocaleString('zh-CN')}</span>}
                                  </>}
                                </div>
                              })}
                            </div>}
                          </div>}
                        </div>
                      )
                    })}
                  </div>

                  {lv.labDate && <div style={{ fontSize: 12, color: '#aaa', marginTop: 10 }}>检测日期：{lv.labDate}</div>}
                </div>
              )
            })()}
          </div>
        </div>

        {/* ── 4.2 身体成分指标 ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title">身体成分指标</div>
            {!editingBodyComp ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => { setBodyCompNewRecord(false); setBodyCompForm(user.bodyComposition || {}); setEditingBodyComp(true) }}>编辑当前</button>
                <button className="btn btn-primary btn-sm" onClick={() => { setBodyCompNewRecord(true); setBodyCompForm({}); setEditingBodyComp(true) }}>+ 新增记录</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {bodyCompNewRecord && <span style={{ fontSize: 12, color: '#1E6B50', fontWeight: 600 }}>新增测量记录</span>}
                <button className="btn btn-primary btn-sm" onClick={handleSaveBodyComp}>保存</button>
                <button className="btn btn-secondary btn-sm" onClick={() => { setEditingBodyComp(false); setBodyCompNewRecord(false); setBodyCompForm(user.bodyComposition || {}) }}>取消</button>
              </div>
            )}
          </div>
          <div style={{ padding: '12px 20px' }}>
            {editingBodyComp ? (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${bodyCompMetrics.length}, minmax(0, 1fr))`, gap: '10px 20px' }}>
                {bodyCompMetrics.map(({ label, key: field, referenceKey: referenceField, unit, placeholder }) => (
                  <div key={field}>
                    <span style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 3 }}>{label}{unit ? ` (${unit})` : ''}</span>
                    <input className="form-control" value={bodyCompForm[field] || ''} placeholder={placeholder}
                      onChange={e => setBodyCompForm(f => ({ ...f, [field]: e.target.value }))} style={{ fontSize: 13 }} />
                    <input className="form-control" value={bodyCompForm[referenceField] || ''} placeholder="报告参考范围（无则留空）"
                      onChange={e => setBodyCompForm(f => ({ ...f, [referenceField]: e.target.value }))} style={{ fontSize: 12, marginTop: 6 }} />
                  </div>
                ))}
                <div>
                  <span style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 3 }}>测量日期</span>
                  <input className="form-control" type="date" value={bodyCompForm.measuredAt || ''}
                    onChange={e => setBodyCompForm(f => ({ ...f, measuredAt: e.target.value }))} style={{ fontSize: 13 }} />
                </div>
              </div>
            ) : (
              <div>
                {bodyCompMetrics.some(metric => displayBodyComposition[metric.key] != null && displayBodyComposition[metric.key] !== '') ? (
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${bodyCompMetrics.length}, minmax(0, 1fr))`, gap: '6px 16px' }}>
                    {bodyCompMetrics.map(metric => [metric.label, displayBodyComposition[metric.key], metric.unit, displayBodyComposition[metric.referenceKey]])
                      .filter(([,v]) => v != null && v !== '').map(([label, val, unit, reference]) => (
                      <div key={label} style={{ padding: '6px 10px', background: '#f9f7f3', borderRadius: 8, borderLeft: '3px solid #1E6B50' }}>
                        <div style={{ fontSize: 11, color: '#8AA89C' }}>{label}</div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{val}{unit && <span style={{ fontSize: 11, fontWeight: 400 }}> {unit}</span>}</div>
                        <div style={{ fontSize: 11, color: '#8AA89C', marginTop: 3 }}>参考范围：{reference || '未录入'}</div>
                      </div>
                    ))}
                    {displayBodyComposition.measuredAt && (
                      <div style={{ fontSize: 12, color: '#aaa', gridColumn: 'span 3', marginTop: 4 }}>测量日期：{displayBodyComposition.measuredAt}</div>
                    )}
                  </div>
                ) : (
                  <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', padding: '12px 0' }}>暂无身体成分数据，点击「编辑」录入</div>
                )}
                <BodyCompositionTrendCharts history={user.bodyCompHistory || []} metrics={bodyCompMetrics} />
                {/* 历史记录 */}
                {!editingBodyComp && (user.bodyCompHistory || []).length > 0 && (
                  <div style={{ marginTop: 12, borderTop: '1px solid #f0ece4', paddingTop: 10 }}>
                    <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 8 }}>历史记录（{(user.bodyCompHistory || []).length} 条）</div>
                    {[...(user.bodyCompHistory || [])].reverse().map((h, i) => {
                      const realIndex = (user.bodyCompHistory || []).length - 1 - i;
                      const isEditingThis = editingHistoryIndex === realIndex;
                      return (
                        <div key={i} style={{ fontSize: 12, color: '#4A6558', padding: '6px 0', borderBottom: '1px solid #f9f7f3' }}>
                          {isEditingThis ? (
                            <div>
                              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${bodyCompMetrics.length}, 1fr)`, gap: 6, marginBottom: 6 }}>
                                {bodyCompMetrics.map(({ label, key: field, unit }) => (
                                  <div key={field}>
                                    <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 2 }}>{label}({unit})</div>
                                    <input className="form-control" style={{ fontSize: 12, padding: '3px 6px' }}
                                      value={historyEditForm[field] || ''}
                                      onChange={e => setHistoryEditForm(f => ({ ...f, [field]: e.target.value }))} />
                                  </div>
                                ))}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <div style={{ fontSize: 11, color: '#8AA89C' }}>测量日期</div>
                                <input className="form-control" type="date" style={{ fontSize: 12, padding: '3px 6px', width: 140 }}
                                  value={historyEditForm.measuredAt || ''}
                                  onChange={e => setHistoryEditForm(f => ({ ...f, measuredAt: e.target.value }))} />
                              </div>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-primary btn-sm" style={{ fontSize: 11, padding: '2px 10px' }} onClick={async () => {
                                  await staffAPI.editBodyCompHistory(id, realIndex, historyEditForm);
                                  setEditingHistoryIndex(null);
                                  load();
                                  toast('记录已更新');
                                }}>保存</button>
                                <button className="btn btn-secondary btn-sm" style={{ fontSize: 11, padding: '2px 10px' }} onClick={() => setEditingHistoryIndex(null)}>取消</button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <span style={{ color: '#aaa', minWidth: 90 }}>{h.measuredAt || (h.recordedAt ? new Date(h.recordedAt).toLocaleDateString('zh-CN') : '-')}</span>
                              {bodyCompMetrics.filter(metric => h[metric.key] != null && h[metric.key] !== '').map(metric => (
                                <span key={metric.key}>{metric.label}: {h[metric.key]}{metric.unit}</span>
                              ))}
                              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                                <button style={{ fontSize: 11, color: '#1E6B50', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
                                  onClick={() => { setEditingHistoryIndex(realIndex); setHistoryEditForm({ ...h }); }}>编辑</button>
                                <button style={{ fontSize: 11, color: '#DC3545', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
                                  onClick={async () => {
                                    if (!window.confirm('确定删除这条记录？')) return;
                                    await staffAPI.deleteBodyCompHistory(id, realIndex);
                                    load();
                                    toast('记录已删除');
                                  }}>删除</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {false && <>
        {/* 不适主诉已迁移到独立的“健康画像”Tab，保留原实现片段便于历史逻辑核对。 */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div>
              <div className="card-title">今日健康状态 / 不适主诉</div>
              <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 3 }}>来自客户每日打卡或医护人员补充记录</div>
            </div>
          </div>
          <div style={{ padding: '12px 20px' }}>
            {healthRecords.length === 0 ? (
              <div style={{ color: '#8AA89C', fontSize: 14, textAlign: 'center', padding: '12px 0' }}>暂无不适主诉记录</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {healthRecords.map(record => {
                  const workflow = record.symptomWorkflow || {}
                  const workflowLabel = {
                    pending_manager: '待健管专员核实',
                    pending_doctor: '待健康顾问判断',
                    manager_followup: '健管专员跟进',
                    referred: '已转介',
                    resolved: '已处理',
                    dismissed: '已确认为误录',
                  }[workflow.status] || '待处理'
                  const pending = ['pending_manager', 'pending_doctor'].includes(workflow.status)
                  const source = record.recordedBy?.source === 'staff'
                    ? (record.recordedBy.staffName || '医护人员录入')
                    : record.recordedBy?.source === 'system' ? '系统记录' : '客户打卡'
                  return (
                    <div key={record._id} style={{
                      padding: '11px 13px', borderRadius: 10,
                      background: pending ? '#FFF5F5' : '#F7FAF8',
                      borderLeft: `4px solid ${pending ? '#DC3545' : '#1E6B50'}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ color: pending ? '#991B1B' : '#1A2B24', fontSize: 14, lineHeight: 1.6, fontWeight: 600 }}>
                          {record.value || record.note || '未填写具体内容'}
                        </div>
                        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20,
                            color: pending ? '#B42318' : '#1E6B50', background: pending ? '#FEE4E2' : '#E8F5EE' }}>
                            {workflowLabel}
                          </span>
                          {['healthManager', 'superadmin'].includes(staff?.role)
                            && ['pending_manager', 'pending_doctor'].includes(workflow.status)
                            && !workflow.verifiedAt && (
                            <>
                              <button className="btn btn-secondary btn-sm" onClick={() => openSymptomEditor(record)}>编辑审核</button>
                              <button className="btn btn-primary btn-sm" onClick={() => referSymptomToDoctor(record)}>待处理：转健康顾问</button>
                            </>
                          )}
                          {['familyDoctor', 'superadmin'].includes(staff?.role)
                            && workflow.status === 'pending_doctor' && !!workflow.verifiedAt && (
                            <button className="btn btn-primary btn-sm" onClick={() => handleDoctorSymptom(record)}>处理</button>
                          )}
                          {['healthManager', 'superadmin'].includes(staff?.role) && (
                            <button className="btn btn-sm" style={{ color: '#B42318', background: '#FFF', border: '1px solid #FDA29B' }}
                              onClick={() => deleteSymptomRecord(record)}>删除</button>
                          )}
                        </div>
                      </div>
                      {record.note && record.note !== record.value && <div style={{ fontSize: 12, color: '#4A6558', marginTop: 4 }}>{record.note}</div>}
                      <div style={{ fontSize: 11, color: '#8AA89C', marginTop: 6 }}>
                        {new Date(record.recordedAt).toLocaleString('zh-CN')} · {source}
                        {workflow.decidedByName ? ` · 处理人：${workflow.decidedByName}` : ''}
                      </div>
                      {workflow.decisionNote && (
                        <div style={{ marginTop: 7, paddingTop: 7, borderTop: '1px solid #E7ECE9', fontSize: 12, color: '#4A6558' }}>
                          处理意见：{workflow.decisionNote}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {editingSymptom && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditingSymptom(null)}>
            <div className="modal" style={{ maxWidth: 520 }}>
              <div className="modal-header">
                <h3 className="modal-title">编辑并审核不适主诉</h3>
                <button className="modal-close" onClick={() => setEditingSymptom(null)}>×</button>
              </div>
              <div className="modal-body">
                <label className="form-label">核实后的不适内容 *</label>
                <textarea className="form-input" rows={3} value={symptomForm.value}
                  onChange={e => setSymptomForm(f => ({ ...f, value: e.target.value }))} />
                <label className="form-label" style={{ marginTop: 12 }}>补充说明</label>
                <textarea className="form-input" rows={2} value={symptomForm.note}
                  onChange={e => setSymptomForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="部位、持续时间、严重程度等" />
                <label className="form-label" style={{ marginTop: 12 }}>审核意见</label>
                <textarea className="form-input" rows={2} value={symptomForm.decisionNote}
                  onChange={e => setSymptomForm(f => ({ ...f, decisionNote: e.target.value }))}
                  placeholder="填写与客户核实后的结果" />
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" disabled={symptomActionSaving}
                  onClick={() => submitSymptomVerification('dismiss')}>确认为误录</button>
                <button className="btn btn-secondary" disabled={symptomActionSaving || !symptomForm.value.trim()}
                  onClick={() => submitSymptomVerification('save')}>保存审核修改</button>
                <button className="btn btn-primary" disabled={symptomActionSaving || !symptomForm.value.trim()}
                  onClick={() => submitSymptomVerification('refer_doctor')}>
                  {symptomActionSaving ? '提交中...' : '确认并转健康顾问'}
                </button>
              </div>
            </div>
          </div>
        )}

        </>}

        {/* ── 慢病分级 ── */}
        {user.chronicDiseases?.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <div className="card-title">慢病分级（用于评分）</div>
              {!editingDiseaseSeverity
                ? <button className="btn btn-secondary btn-sm" onClick={() => setEditingDiseaseSeverity(true)}>编辑</button>
                : <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={handleSaveDiseaseSeverity}>保存</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setEditingDiseaseSeverity(false); setSeverityForm(user.chronicDiseaseSeverity || {}) }}>取消</button>
                  </div>
              }
            </div>
            <div style={{ padding: '12px 20px' }}>
              <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 10 }}>设置每种慢性病的严重程度，影响基础健康分扣分幅度</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px 20px' }}>
                {user.chronicDiseases.map(disease => (
                  <div key={disease}>
                    <div style={{ fontSize: 13, color: '#1A2B24', fontWeight: 500, marginBottom: 4 }}>{disease}</div>
                    {editingDiseaseSeverity ? (
                      <select className="form-control" style={{ fontSize: 13 }}
                        value={severityForm[disease] || 1}
                        onChange={e => setSeverityForm(f => ({ ...f, [disease]: parseInt(e.target.value) }))}>
                        <option value={1}>一级（早/轻症，无并发症）</option>
                        <option value={2}>二级（中症，有并发症风险）</option>
                        <option value={3}>三级（重症/终末期）</option>
                      </select>
                    ) : (
                      <span style={{ fontSize: 13, color: '#4A6558' }}>
                        {['一级（轻症）','二级（中症）','三级（重症）'][(user.chronicDiseaseSeverity?.[disease] || 1) - 1]}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 健康趋势图 */}
        {(() => {
          const srcRecords = trendRecords ?? recentRecords ?? [];
          const TYPE_COLORS = {
            bloodPressureSystolic: '#DC3545',
            bloodPressureDiastolic: '#0077B6',
            bloodSugar: '#D97706', weight: '#0077B6', height: '#0891B2', heartRate: '#7C3AED', sleep: '#059669', mood: '#B45309',
          };
          const TREND_TYPE_LABELS = {
            ...RECORD_TYPE_LABEL,
            bloodPressureSystolic: '血压（收缩压）',
            bloodPressureDiastolic: '血压（舒张压）',
          };

          const buildCharts = (records) => {
            const byType = {};
            records.forEach(r => {
              const dateStr = new Date(r.recordedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
              if (r.type === 'bloodPressure') {
                const [valueSys, valueDia] = String(r.value || '').split('/').map(Number);
                const systolic = Number(r.extra?.sys ?? r.sys ?? valueSys);
                const diastolic = Number(r.extra?.dia ?? r.dia ?? valueDia);
                if (systolic > 0) {
                  if (!byType.bloodPressureSystolic) byType.bloodPressureSystolic = [];
                  byType.bloodPressureSystolic.push({ x: dateStr, y: systolic });
                }
                if (diastolic > 0) {
                  if (!byType.bloodPressureDiastolic) byType.bloodPressureDiastolic = [];
                  byType.bloodPressureDiastolic.push({ x: dateStr, y: diastolic });
                }
                return;
              }
              const y = parseFloat(r.value) || 0;
              if (y > 0) {
                if (!byType[r.type]) byType[r.type] = [];
                byType[r.type].push({ x: dateStr, y });
              }
            });
            return Object.entries(byType).filter(([, arr]) => arr.length >= 2).reverse();
          };

          const charts = buildCharts(srcRecords);

          const loadTrend = async () => {
            setTrendLoading(true);
            try {
              const params = { limit: 500 };
              if (trendStartDate) params.startDate = trendStartDate;
              if (trendEndDate) params.endDate = trendEndDate;
              const res = await staffAPI.getPatientHealthRecords(id, params);
              setTrendRecords(res.data || []);
            } catch { /* ignore */ }
            finally { setTrendLoading(false); }
          };

          const exportCSV = () => {
            const rows = [['日期', '类型', '数值', '单位']];
            srcRecords.forEach(r => {
              const date = new Date(r.recordedAt).toLocaleString('zh-CN');
              const label = RECORD_TYPE_LABEL[r.type] || r.type;
              const val = r.type === 'bloodPressure' ? `${r.extra?.sys || ''}/${r.extra?.dia || ''}` : (r.value || '');
              rows.push([date, label, val, r.unit || '']);
            });
            const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
            const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
            a.download = `健康数据_${user.name || id}_${new Date().toLocaleDateString('zh-CN')}.csv`;
            a.click();
          };

          const downloadCharts = () => {
            const wrap = document.getElementById('trend-chart-wrap');
            if (!wrap) return;
            const svgs = wrap.querySelectorAll('svg');
            if (!svgs.length) return;
            // 合并所有 SVG 为一个并下载
            const W = 280, rowH = 120, pad = 16;
            const total = svgs.length;
            const svgContent = Array.from(svgs).map((svg, i) => {
              const inner = svg.innerHTML;
              return `<g transform="translate(0,${i * rowH})">${inner}</g>`;
            }).join('');
            const combined = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${total * rowH + pad}" style="background:#faf9f6">${svgContent}</svg>`;
            const blob = new Blob([combined], { type: 'image/svg+xml' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
            a.download = `趋势图_${user.name || id}_${new Date().toLocaleDateString('zh-CN')}.svg`;
            a.click();
          };

          return (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div className="card-title">健康数据趋势</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <input type="date" className="form-control" style={{ width: 136, fontSize: 12, padding: '4px 8px' }}
                    value={trendStartDate} onChange={e => setTrendStartDate(e.target.value)} placeholder="开始日期" />
                  <span style={{ fontSize: 12, color: '#aaa' }}>—</span>
                  <input type="date" className="form-control" style={{ width: 136, fontSize: 12, padding: '4px 8px' }}
                    value={trendEndDate} onChange={e => setTrendEndDate(e.target.value)} placeholder="结束日期" />
                  <button className="btn btn-primary btn-sm" onClick={loadTrend} disabled={trendLoading}>
                    {trendLoading ? '加载中…' : '查询'}
                  </button>
                  {srcRecords.length > 0 && <>
                    <button className="btn btn-secondary btn-sm" onClick={exportCSV} title="导出 CSV">导出数据</button>
                    {charts.length > 0 && <button className="btn btn-secondary btn-sm" onClick={downloadCharts} title="下载趋势图">下载图表</button>}
                  </>}
                </div>
              </div>
              {trendLoading ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#aaa', fontSize: 13 }}>加载中…</div>
              ) : charts.length >= 1 ? (
                <div id="trend-chart-wrap" style={{ padding: '12px 16px', overflowX: 'auto' }}>
                  {charts.map(([type, arr]) => (
                    <MiniTrendChart key={type} data={[...arr].reverse()} color={TYPE_COLORS[type] || '#1E6B50'} label={TREND_TYPE_LABELS[type] || type} />
                  ))}
                </div>
              ) : (
                <div style={{ padding: '16px 20px', fontSize: 13, color: '#aaa' }}>
                  {trendRecords !== null ? '所选时间段内无趋势数据（需同类型至少2条记录）' : '选择时间段后点击查询，或查看默认最近30条数据'}
                </div>
              )}
            </div>
          );
        })()}

        {/* 日常健康打卡数据 */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header"><div className="card-title">日常健康打卡数据（每类型最近10条）</div></div>
          {recentRecords?.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>类型</th>
                  <th>数值 / 备注</th>
                  <th>图片</th>
                  <th>归属时间</th>
                  <th>提交时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {groupRecordsByTypeAndDate(recentRecords).map(({ groupKey, groupLabel, count, records }) => (
                  <React.Fragment key={groupKey}>
                    {count > 1 && (
                      <tr>
                        <td colSpan={6} style={{ background: '#F2EDE3', fontSize: 12, fontWeight: 700, color: '#4A6558', padding: '6px 12px' }}>
                          {groupLabel}（共{count}次）
                        </td>
                      </tr>
                    )}
                    {records.map(r => {
                      const imageUrls = [...new Set([
                        ...(Array.isArray(r.imageUrls) ? r.imageUrls : []),
                        r.imageUrl,
                        r.extra?.imageUrl,
                      ].filter(Boolean))]
                      // 归属时间(recordedAt)与提交时间(createdAt)相差不大时，提交时间列显示"同上"避免冗余
                      const recordedTime = r.recordedAt ? new Date(r.recordedAt) : null
                      const createdTime = r.createdAt ? new Date(r.createdAt) : null
                      const closeEnough = recordedTime && createdTime && Math.abs(createdTime - recordedTime) <= 5 * 60 * 1000
                      return (
                        <tr key={r._id}>
                          <td><span className="badge badge-info">{RECORD_TYPE_LABEL[r.type] || r.type}</span></td>
                          <td>
                            {formatRecordValue(r)}
                            {r.editedBy?.editedAt && (
                              <div style={{ fontSize: 11, color: '#D97706', marginTop: 2 }}>
                                {r.editedBy.staffName} 修正于 {new Date(r.editedBy.editedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}（原值 {r.editedBy.prevValue}）
                              </div>
                            )}
                          </td>
                          <td>
                            {imageUrls.length ? (
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {imageUrls.map((imgUrl, imageIndex) => (
                                  <img
                                    key={`${imgUrl}-${imageIndex}`}
                                    src={imgUrl}
                                    alt={`打卡图片${imageIndex + 1}`}
                                    style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, cursor: 'pointer', border: '1px solid #E0D9CE' }}
                                    onClick={() => setPreviewImageUrl(imgUrl)}
                                  />
                                ))}
                              </div>
                            ) : <span style={{ color: '#ccc', fontSize: 12 }}>—</span>}
                          </td>
                          <td style={{ color: '#8AA89C', fontSize: 13 }}>
                            {recordedTime ? recordedTime.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                          </td>
                          <td style={{ color: '#8AA89C', fontSize: 13 }}>
                            {closeEnough ? '同上' : (createdTime ? createdTime.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-')}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <button className="btn btn-primary btn-sm" onClick={() => setShowMessageModal(true)}>进入对话</button>
                              <button className="btn btn-secondary btn-sm" onClick={() => startEditRecord(r)}>编辑</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无健康打卡记录</div>
          )}
        </div>
        </div>
      )}

      {/* ── AI Tab ── */}
      {tab === 'ai' && (() => {
        const aisRoot = user.aiHealthSummary || {}
        // 按年度组织（兼容旧数据：无 byYear 但有 sections → 归到其年份或2026）
        let byYear = aisRoot.byYear || {}
        if (Object.keys(byYear).length === 0 && aisRoot.sections) {
          const oy = String(aisRoot.generatedAt ? new Date(aisRoot.generatedAt).getFullYear() : 2026)
          byYear = { [oy]: { sections: aisRoot.sections, generatedAt: aisRoot.generatedAt, approvedAt: aisRoot.approvedAt, approvedBy: aisRoot.approvedBy } }
        }
        const years = Object.keys(byYear).sort((a, b) => Number(b) - Number(a))
        const nowY = new Date().getFullYear()
        // 年度候选只展示实际已生成的年份 + 当前年（用于首次生成入口），不预设未来/往年空占位
        const yearOpts = [...new Set([...years, String(nowY)])].sort((a, b) => Number(b) - Number(a))
        // 当前查看的年度：允许查看尚未生成的当前年度（此时显示空状态+生成按钮）
        const curYear = (aiYear && yearOpts.includes(aiYear)) ? aiYear : (years[0] || String(nowY))
        const rawYearEntry = byYear[curYear] || {}
        const records = (Array.isArray(rawYearEntry.records) ? rawYearEntry.records : (rawYearEntry.sections ? [rawYearEntry] : []))
          .map((record, index) => ({ ...record, _recordIndex: index }))
        const doctorRecords = records.filter(r => r.scope === 'doctor' || r.scope === 'all' || (!r.scope && ['medical_priority', 'tumor_risk', 'cardiovascular_risk', 'chronic_disease', 'checkup_completeness'].some(k => r.sections?.[k])))
        const nutritionRecords = records.filter(r => r.scope === 'nutrition' || r.scope === 'all' || (!r.scope && r.sections?.lifestyle_assessment))
        const doctorRecord = doctorRecords.find(r => r._recordIndex === aiRecordIndex.doctor) || doctorRecords[0] || {}
        const nutritionRecord = nutritionRecords.find(r => r._recordIndex === aiRecordIndex.nutrition) || nutritionRecords[0] || {}
        const latestDoctorApproved = !!(doctorRecords[0]?.doctorApprovedAt || doctorRecords[0]?.approvedAt)
        // 两条链独立选择历史记录，展示层再组合，任何一方重新评估都不会改变另一方当前结果。
        // 旧版记录的 sections 同时包含健康顾问和营养师板块，不能直接整体展开 nutritionRecord.sections；
        // 否则旧营养记录会覆盖当前选中的新版5维分析，出现“下拉框是第2次、内容却是第1次”的错位。
        const doctorSectionKeys = ['medical_priority', 'tumor_risk', 'cardiovascular_risk', 'chronic_disease', 'checkup_completeness']
        const selectedDoctorSections = Object.fromEntries(
          doctorSectionKeys
            .filter(key => doctorRecord.sections?.[key] !== undefined)
            .map(key => [key, doctorRecord.sections[key]])
        )
        const selectedLifestyleSection = nutritionRecord.sections?.lifestyle_assessment
        const ais = {
          sections: {
            ...selectedDoctorSections,
            ...(selectedLifestyleSection !== undefined ? { lifestyle_assessment: selectedLifestyleSection } : {}),
          },
          doctorApprovedAt: doctorRecord.doctorApprovedAt || doctorRecord.approvedAt,
          doctorApprovedBy: doctorRecord.doctorApprovedBy || doctorRecord.approvedBy,
          nutritionApprovedAt: nutritionRecord.nutritionApprovedAt || nutritionRecord.approvedAt,
          nutritionApprovedBy: nutritionRecord.nutritionApprovedBy || nutritionRecord.approvedBy,
          discussions: doctorRecord.discussions || [],
        }
        // 编辑模式用 aiSummaryForm.sections，查看模式用当前年度 ais.sections
        const sec = editingAISummary ? (aiSummaryForm.sections || {}) : (ais.sections || {})
        const docEditing = editingAISummary === 'doctor'
        const nutEditing = editingAISummary === 'nutrition'
        const renderSectionActions = (sectionKey) => {
          const review = doctorRecord.sectionReviews?.[sectionKey] || {}
          const isEditing = docEditing && editingAISection === sectionKey
          return <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: review.status === 'approved' ? '#15803D' : '#64748B' }}>
              {review.status === 'approved'
                ? `已审核 · ${review.approvedBy || ''} · ${review.approvedAt ? new Date(review.approvedAt).toLocaleString('zh-CN') : ''}`
                : review.updatedAt
                  ? `待重新审核 · ${review.updatedBy || ''}修改于 ${new Date(review.updatedAt).toLocaleString('zh-CN')}${review.approvedAt ? ` · 上次审核 ${new Date(review.approvedAt).toLocaleString('zh-CN')}` : ''}`
                  : '待审核'}
            </span>
            {!isEditing ? <>
              <button className="btn btn-secondary btn-sm" onClick={() => {
                setAiSummaryForm({ sections: JSON.parse(JSON.stringify(ais.sections || {})) }); setAiYear(curYear)
                setAiRecordIndex(v => ({ ...v, doctor: doctorRecord._recordIndex || 0 })); setEditingAISummary('doctor'); setEditingAISection(sectionKey)
              }}>编辑本板块</button>
              <button className="btn btn-primary btn-sm" onClick={() => handleSaveAISection(sectionKey, true, ais.sections?.[sectionKey])}>审核本板块</button>
            </> : <>
              <button className="btn btn-secondary btn-sm" onClick={() => { setEditingAISummary(false); setEditingAISection('') }}>取消</button>
              <button className="btn btn-secondary btn-sm" onClick={() => handleSaveAISection(sectionKey, false)}>临时保存</button>
              <button className="btn btn-primary btn-sm" onClick={() => handleSaveAISection(sectionKey, true)}>保存并审核</button>
            </>}
          </div>
        }
        const hasDoctorData = !!(ais.sections?.medical_priority || ais.sections?.tumor_risk || ais.sections?.cardiovascular_risk || ais.sections?.chronic_disease || ais.sections?.checkup_completeness)
        const hasLifestyle = !!(ais.sections?.lifestyle_assessment?.summary || (ais.sections?.lifestyle_assessment?.items || []).length)
        const hasData = hasDoctorData || hasLifestyle
        const activeHasData = aiAnalysisView === 'doctor' ? hasDoctorData : hasLifestyle

        const URGENCY_BADGE = { high: { label: '高', bg: '#FEE2E2', color: '#DC2626' }, medium: { label: '中', bg: '#FEF9EC', color: '#D97706' }, low: { label: '低', bg: '#F0FDF4', color: '#16A34A' } }
        const STATUS_COLOR = { abnormal: '#DC2626', mild_abnormal: '#D97706', normal: '#16A34A' }
        const TREND_LABEL = { no_data: '暂无趋势', baseline: '已建立基线', stable: '基本稳定', improving: '改善', worsening: '需关注变化', fluctuating: '存在波动', not_comparable: '暂不可比较' }
        const renderHealthTrendCards = (items, overview, accent = '#1D4ED8', sectionKey = '') => {
          const list = Array.isArray(items) ? items : []
          if (!list.length) return null
          const attention = item => ['attention', 'abnormal', 'worsening'].includes(item.status) || item.trendStatus === 'worsening'
          const statusBadge = item => attention(item)
            ? { label: '需关注', color: '#B91C1C', bg: '#FEE2E2' }
            : item.status === 'mild_abnormal' || item.status === 'monitor'
              ? { label: '持续关注', color: '#A16207', bg: '#FEF9C3' }
              : { label: '基本稳定', color: '#15803D', bg: '#DCFCE7' }
          return <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 10, padding: '11px 13px' }}>
              <div style={{ fontWeight: 800, color: accent }}>{overview?.headline || '健康指标趋势总览'}</div>
              <div style={{ marginTop: 5, fontSize: 12, color: '#64748B' }}>共 {list.length} 个主题 · 需关注 {Number(overview?.attentionCount) || list.filter(attention).length} 项</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 8 }}>
              {list.map((item, index) => {
                const isAttention = attention(item)
                const badge = statusBadge(item)
                return <details key={`${item.name}-${index}`} open={lastRegeneratedItem === `${sectionKey}:${item.name}`}
                  style={{ border: `1px solid ${isAttention ? '#FECACA' : '#E5E7EB'}`, borderRadius: 9, background: '#fff', padding: '9px 11px' }}>
                  <summary style={{ cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 800, color: '#1F2937', flex: 1 }}>{item.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: badge.color, background: badge.bg, borderRadius: 999, padding: '2px 8px' }}>{badge.label}</span>
                    <span style={{ fontSize: 11, color: '#64748B' }}>{TREND_LABEL[item.trendStatus] || '趋势待确认'}</span>
                  </summary>
                  <div style={{ marginTop: 9, paddingTop: 8, borderTop: '1px solid #F1F5F9', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, lineHeight: 1.6 }}>
                    {(item.latest || item.value) && <div><b style={{ color: '#64748B' }}>最近检查：</b>{item.latest || item.value}</div>}
                    {item.trend && <div><b style={{ color: '#64748B' }}>5年趋势：</b>{item.trend}</div>}
                    {(item.keyChanges || []).length > 0 && <div><b style={{ color: '#64748B' }}>关键变化：</b>{item.keyChanges.join('；')}</div>}
                    {item.nextAction && <div style={{ color: isAttention ? '#B91C1C' : accent }}><b>下一步：</b>{item.nextAction}</div>}
                    {!item.trend && item.note && <div style={{ color: '#64748B' }}>{item.note}</div>}
                    {sectionKey && <button className="btn btn-secondary btn-sm" onClick={() => openItemSources(item, sectionKey)}>🔗 按年份查看对应材料</button>}
                    {sectionKey && <button className="btn btn-secondary btn-sm" disabled={aiSummaryLoading} onClick={() => handleRegenerateAISummaryItem(sectionKey, item.name)}>✎ 录入问题并单项重新生成</button>}
                  </div>
                </details>
              })}
            </div>
          </div>
        }
        const inStyle = { width: '100%', padding: '5px 8px', border: '1px solid #E0D9CE', borderRadius: 6, fontSize: 12, boxSizing: 'border-box', fontFamily: 'inherit', background: '#FAFAF8' }
        const reportLabel = reportId => {
          const report = screeningReports.find(r => String(r._id) === String(reportId))
          if (!report) return '原始报告'
          return [report.screeningL2 || report.title || '检查报告', report.hospital || report.institution || '', String(report.checkDate || report.date || '').slice(0, 10)]
            .filter(Boolean).join(' · ')
        }
        const SOURCE_RULES = {
          tumor_risk: { keys: ['tumor'], words: ['肿瘤', '癌', '肿瘤标志物'] },
          cardiovascular_risk: { keys: ['cardiovascular', 'brain_vessel'], words: ['心电图', '心脏超声', '冠脉', '心脏磁共振', '颈动脉', '头颅MRI', '头颅MRA', '同型半胱氨酸', '脂蛋白磷脂酶A2'] },
          chronic_disease: { keys: ['chronic', 'functional', 'other_routine', 'health_promote'], words: ['血压', '血糖', '糖化血红蛋白', '血脂', '尿酸', '肾功能', '肌酐', '骨密度', '骨质疏松'] },
          checkup_completeness: { keys: [], words: [] },
          medical_priority: { keys: [], words: [] },
        }
        const sourceIdsFor = sectionKey => {
          const section = sec[sectionKey] || {}
          const saved = [
            ...(section.sourceReportIds || []),
            ...(section.items || []).map(item => item.sourceReportId).filter(Boolean),
          ]
          if (saved.length) return [...new Set(saved.map(String))]
          const rule = SOURCE_RULES[sectionKey]
          if (!rule) return []
          const matched = screeningReports.filter(report => {
            if (!rule.keys.length && !rule.words.length) return true
            const text = [report.title, report.screeningL1, report.screeningL2,
              ...(report.reportItems || []).flatMap(item => [item.name, item.conclusion, item.diagnosis])
            ].filter(Boolean).join(' ')
            return rule.keys.includes(report.screeningCategory) || rule.words.some(word => text.includes(word))
          })
          return [...new Set(matched.map(report => String(report._id)))]
        }
        const ITEM_SOURCE_WORDS = {
          '肺癌': ['肺', '胸部CT', '肺CT', '低剂量CT'],
          '结直肠癌': ['肠镜', '结肠镜', '直肠镜', '粪便隐血', '便潜血'],
          '胃癌': ['胃镜', '胃窦', '胃角', '幽门螺杆菌', '病理'],
          '食管癌': ['食管', '胃镜', '病理'],
          '肝癌': ['肝脏', '肝胆', 'AFP', '甲胎蛋白', '肝纤维'],
          '前列腺癌': ['前列腺', 'PSA'],
          '甲状腺癌': ['甲状腺'],
          '胰腺癌': ['胰腺', '肝胆胰脾'],
          '膀胱癌': ['膀胱', '双肾输尿管膀胱', '泌尿系'],
          '乳腺癌': ['乳腺'],
          '宫颈癌': ['宫颈', 'TCT', 'HPV'],
          '卵巢癌': ['卵巢', '子宫附件', '阴道超声'],
        }
        const itemSourceMatches = (item, sectionKey) => {
          const itemText = [item.name, item.latest, item.value, item.trend, item.note, ...(item.keyChanges || [])].filter(Boolean).join(' ')
          const years = [...new Set((itemText.match(/20\d{2}/g) || []))]
          const continuousClaim = /每年|逐年|连续|历年|每年度/.test(itemText)
          const words = ITEM_SOURCE_WORDS[item.name] || [item.name]
          const sectionIds = new Set(sourceIdsFor(sectionKey))
          const reportYear = report => String(report.checkDate || report.date || report.createdAt || '').slice(0, 4)
          const reportText = report => [report.title, report.screeningL1, report.screeningL2, report.note,
            report.examDescription, report.examConclusion, report.aiSummary,
            ...(report.reportItems || []).flatMap(row => [row.name, row.sourceSection, row.orderName, row.findings, row.diagnosis, row.conclusion, row.value])
          ].filter(Boolean).join(' ')
          const linked = (item.sourceEvidence || []).map(evidence => {
            const report = screeningReports.find(row => String(row._id) === String(evidence.reportId))
            return report ? { report, focus: { itemName: item.name, years: [String(evidence.year || '').trim()].filter(Boolean), words, items: evidence.items || [] } } : null
          }).filter(Boolean)
          if (linked.length) return linked
          const exact = screeningReports.filter(report => {
            const year = reportYear(report)
            // “从2022年开始每年都有”只会显式出现起始年，不能据此把2023/2024等中间年份过滤掉。
            if (!continuousClaim && years.length && !years.includes(year)) return false
            return words.some(word => word && reportText(report).includes(word))
          })
          const sameYearReferenced = screeningReports.filter(report => {
            if (!sectionIds.has(String(report._id))) return false
            return continuousClaim || !years.length || years.includes(reportYear(report))
          })
          const referenced = screeningReports.filter(report => sectionIds.has(String(report._id)))
          const selected = exact.length ? exact : (sameYearReferenced.length ? sameYearReferenced : referenced)
          return selected.filter((report, index, list) => list.findIndex(row => String(row._id) === String(report._id)) === index)
            .sort((a, b) => String(a.checkDate || a.date || '').localeCompare(String(b.checkDate || b.date || '')))
            .map(report => ({ report, focus: { itemName: item.name, years: [reportYear(report)].filter(Boolean), words } }))
        }
        const openItemSources = (item, sectionKey) => {
          const matches = itemSourceMatches(item, sectionKey)
          const itemText = [item.latest, item.value, item.trend, ...(item.keyChanges || [])].filter(Boolean).join(' ')
          const statedYears = [...new Set(itemText.match(/20\d{2}/g) || [])].map(Number).sort((a, b) => a - b)
          const actualYears = [...new Set(matches.map(({ report }) => Number(String(report.checkDate || report.date || report.createdAt || '').slice(0, 4))).filter(Number.isFinite))]
          const continuousClaim = /每年|逐年|连续|历年|每年度/.test(itemText)
          const endYear = statedYears.length > 1 ? statedYears[statedYears.length - 1] : Math.max(...actualYears, ...statedYears)
          const expectedYears = continuousClaim && statedYears.length && Number.isFinite(endYear)
            ? Array.from({ length: endYear - statedYears[0] + 1 }, (_, index) => statedYears[0] + index) : statedYears
          const missingYears = expectedYears.filter(year => !actualYears.includes(year))
          setAiSourceGroup({
            title: `${item.name} · 对应年份原件`,
            ids: matches.map(({ report }) => String(report._id)),
            reportLabel,
            focusById: Object.fromEntries(matches.map(({ report, focus }) => [String(report._id), focus])),
            missingYears,
          })
        }
        const openSectionSources = (title, ids) => setAiSourceGroup({ title, ids, reportLabel })

        // 更新编辑中的 sections 字段
        const updSec = (secKey, field, val) => setAiSummaryForm(f => ({
          ...f, sections: { ...f.sections, [secKey]: { ...(f.sections?.[secKey] || {}), [field]: val } }
        }))
        // 更新 sections 中某个数组字段（textarea 换行解析）
        // 编辑时保留原始行（含空行），避免实时 trim/filter 导致光标跳动；空行在保存时清理
        const updSecArr = (secKey, field, text) => updSec(secKey, field, text.split('\n'))
        // 更新 sections 中某条 items 数组里的某个 item 字段
        const updItem = (secKey, idx, field, val) => setAiSummaryForm(f => {
          const items = [...(f.sections?.[secKey]?.items || [])]
          items[idx] = { ...items[idx], [field]: val }
          return { ...f, sections: { ...f.sections, [secKey]: { ...(f.sections?.[secKey] || {}), items } } }
        })
        const addItem = (secKey, tpl) => setAiSummaryForm(f => {
          const items = [...(f.sections?.[secKey]?.items || []), tpl]
          return { ...f, sections: { ...f.sections, [secKey]: { ...(f.sections?.[secKey] || {}), items } } }
        })
        const delItem = (secKey, idx) => setAiSummaryForm(f => {
          const items = (f.sections?.[secKey]?.items || []).filter((_, i) => i !== idx)
          return { ...f, sections: { ...f.sections, [secKey]: { ...(f.sections?.[secKey] || {}), items } } }
        })
        const updStructuredItem = (secKey, listKey, idx, field, value) => setAiSummaryForm(f => {
          const list = [...(f.sections?.[secKey]?.[listKey] || [])]
          list[idx] = { ...list[idx], [field]: value }
          return { ...f, sections: { ...f.sections, [secKey]: { ...(f.sections?.[secKey] || {}), [listKey]: list } } }
        })
        const updOverviewHeadline = (secKey, value) => setAiSummaryForm(f => ({
          ...f, sections: { ...f.sections, [secKey]: { ...(f.sections?.[secKey] || {}), overview: { ...(f.sections?.[secKey]?.overview || {}), headline: value } } }
        }))
        const renderStructuredEditor = (secKey, listKey, list, statusOptions) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(list || []).map((item, idx) => (
              <div key={`${item.name}-${idx}`} style={{ border: '1px solid #DDD6FE', borderRadius: 10, padding: '16px 18px', background: '#FAFAFF', width: '100%', boxSizing: 'border-box' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(130px, 1fr) minmax(120px, .7fr)', gap: 8, marginBottom: 8 }}>
                  <input style={inStyle} value={item.name || ''} placeholder="项目名称" onChange={e => updStructuredItem(secKey, listKey, idx, 'name', e.target.value)} />
                  <select style={inStyle} value={item.status || statusOptions[0][0]} onChange={e => updStructuredItem(secKey, listKey, idx, 'status', e.target.value)}>
                    {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                <div style={{ fontSize: 12, color: '#475569', fontWeight: 700, marginBottom: 5 }}>最近检查</div>
                <textarea className="form-control" rows={4} value={item.latest || ''} placeholder="填写最近一次检查的日期、项目和结果" onChange={e => updStructuredItem(secKey, listKey, idx, 'latest', e.target.value)} style={{ fontSize: 14, lineHeight: 1.7, resize: 'vertical', width: '100%', minHeight: 110, marginBottom: 12 }} />
                <div style={{ fontSize: 12, color: '#475569', fontWeight: 700, marginBottom: 5 }}>5年趋势</div>
                <textarea className="form-control" rows={5} value={item.trend || ''} placeholder="填写各年份检查记录及趋势判断" onChange={e => updStructuredItem(secKey, listKey, idx, 'trend', e.target.value)} style={{ fontSize: 14, lineHeight: 1.7, resize: 'vertical', width: '100%', minHeight: 135, marginBottom: 10 }} />
                <select style={{ ...inStyle, marginBottom: 7 }} value={item.trendStatus || 'no_data'} onChange={e => updStructuredItem(secKey, listKey, idx, 'trendStatus', e.target.value)}>
                  <option value="no_data">暂无趋势</option><option value="baseline">已建立基线</option><option value="stable">基本稳定</option>
                  <option value="improving">改善</option><option value="worsening">需关注变化</option><option value="fluctuating">存在波动</option><option value="not_comparable">暂不可比较</option>
                </select>
                <div style={{ fontSize: 12, color: '#475569', fontWeight: 700, marginBottom: 5 }}>关键变化</div>
                <textarea className="form-control" rows={3} value={(item.keyChanges || []).join('\n')} placeholder="每行填写一条关键变化" onChange={e => updStructuredItem(secKey, listKey, idx, 'keyChanges', e.target.value.split('\n'))} style={{ fontSize: 14, lineHeight: 1.7, resize: 'vertical', width: '100%', minHeight: 90, marginBottom: 12 }} />
                <div style={{ fontSize: 12, color: '#475569', fontWeight: 700, marginBottom: 5 }}>下一步</div>
                <textarea className="form-control" rows={3} value={item.nextAction || ''} placeholder="填写复查或后续处理建议" onChange={e => updStructuredItem(secKey, listKey, idx, 'nextAction', e.target.value)} style={{ fontSize: 14, lineHeight: 1.7, resize: 'vertical', width: '100%', minHeight: 90 }} />
              </div>
            ))}
          </div>
        )

        // SectionCard / ArrEdit 已提到模块级（AISectionCard / AIArrEdit），避免重渲染失焦

        return (
          <div>
            <AiRuleHint scene="health_analysis" />
            {/* 前置要求：健康顾问生成AI健康分析/风险评估前必须先查看确认健康档案（2026-07-28改造，
                不再逐份审核报告数据本身，那是健管专员audit_status的职责） */}
            {['familyDoctor', 'superadmin'].includes(staff?.role) && pendingDoctorAuditReports.length > 0 && (() => {
              // 文案显示"待查看"数量而非总数：此前写死显示 pendingDoctorAuditReports.length（总数），
              // 哪怕已经逐份点开查看了60/61份，这行提示文字也纹丝不动还是显示"61"，容易让人误以为
              // 一份都没处理、之前的查看进度没生效。改为显示还剩几份未查看，全部查看完文案自动收尾。
              const unviewedCount = pendingDoctorAuditReports.filter(r => !r.familyDoctorViewedAt).length
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 14, background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8 }}>
                  <span style={{ fontSize: 18 }}>⚠️</span>
                  <div style={{ flex: 1, fontSize: 13, color: '#92400E' }}>
                    {unviewedCount > 0
                      ? <>健管专员已审核 <b>{pendingDoctorAuditReports.length}</b> 份新体检报告，还有 <b>{unviewedCount}</b> 份未查看，请查看后确认，才能生成健康信息整理与关注提示</>
                      : <>已查看完全部 <b>{pendingDoctorAuditReports.length}</b> 份新体检报告，请点击确认完成</>}
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => setShowArchiveReviewModal(true)}>
                    {unviewedCount > 0 ? '去查看' : '去确认'}
                  </button>
                </div>
              )
            })()}
            {/* 年度选择：下拉 select，✓=已审核 ●=已生成待审核 */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#8AA89C', whiteSpace: 'nowrap' }}>📅 年度</span>
              <select value={curYear} onChange={e => { setAiYear(e.target.value); setEditingAISummary(false) }}
                style={{ padding: '5px 10px', borderRadius: 8, fontSize: 13, border: '1px solid #1E6B50',
                  background: '#E8F5EF', color: '#1E6B50', fontWeight: 700, cursor: 'pointer', outline: 'none' }}>
                {yearOpts.map(y => {
                  const generated = !!byYear[y]
                  const yearEntry = byYear[y] || {}
                  const latest = Array.isArray(yearEntry.records) ? (yearEntry.records[0] || {}) : yearEntry
                  const approved = !!(latest.doctorApprovedAt || latest.approvedAt)
                  return (
                    <option key={y} value={y}>
                      {y}年度{approved ? ' ✓' : (generated ? ' ●' : '')}
                    </option>
                  )
                })}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button className={`btn btn-sm ${aiAnalysisView === 'doctor' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => { setAiAnalysisView('doctor'); setEditingAISummary(false) }}>
                健康顾问 · 5维分析
              </button>
              <button className={`btn btn-sm ${aiAnalysisView === 'nutrition' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => { setAiAnalysisView('nutrition'); setEditingAISummary(false) }}>
                营养师 · 生活方式分析
              </button>
            </div>
            {/* 同一年度分成两条独立评估链，各自显示生成时间与历史版本。 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 10, marginBottom: 14 }}>
              {[
                { key: 'doctor', title: '健康顾问 · 5维分析', records: doctorRecords, current: doctorRecord, color: '#1E6B50' },
                { key: 'nutrition', title: '营养师 · 生活方式分析', records: nutritionRecords, current: nutritionRecord, color: '#16A34A' },
              ].filter(group => group.key === aiAnalysisView).map(group => (
                <div key={group.key} className="card" style={{ padding: '12px 14px', borderTop: `3px solid ${group.color}` }}>
                  <div style={{ fontWeight: 700, color: '#1A2B24', marginBottom: 8 }}>{group.title}</div>
                  {group.records.length ? (
                    <>
                      <select className="form-input" value={group.current._recordIndex ?? group.records[0]._recordIndex}
                        onChange={e => setAiRecordIndex(v => ({ ...v, [group.key]: Number(e.target.value) }))}
                        style={{ fontSize: 12, padding: '6px 8px' }}>
                        {group.records.map((r, i) => {
                          const approved = group.key === 'doctor'
                            ? !!(r.doctorApprovedAt || r.approvedAt)
                            : !!(r.nutritionApprovedAt || r.approvedAt)
                          const time = r.generatedAt ? new Date(r.generatedAt).toLocaleString('zh-CN') : '历史记录'
                          return <option key={r._recordIndex} value={r._recordIndex}>第{group.records.length - i}次 · {time}{approved ? ' · 已审核' : ' · 待审核'}</option>
                        })}
                      </select>
                      <div style={{ marginTop: 6, fontSize: 11, color: '#8AA89C' }}>
                        生成时间：{group.current.generatedAt ? new Date(group.current.generatedAt).toLocaleString('zh-CN') : '—'}
                      </div>
                      {(staff?.role === 'superadmin'
                        || (group.key === 'doctor' && staff?.role === 'familyDoctor')
                        || (group.key === 'nutrition' && staff?.role === 'nutritionist')) && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                          <button className="btn btn-primary btn-sm" disabled={aiSummaryLoading || (group.key === 'nutrition' && !latestDoctorApproved)}
                            onClick={() => {
                              const approved = group.key === 'doctor'
                                ? !!(doctorRecords[0]?.doctorApprovedAt || doctorRecords[0]?.approvedAt)
                                : !!(nutritionRecords[0]?.nutritionApprovedAt || nutritionRecords[0]?.approvedAt)
                              if (approved && !window.confirm('最新一次评估已经审核。新增评估不会覆盖旧记录，确定继续？')) return
                              handleGenerateAISummary(curYear, group.key, approved)
                            }}>
                            ＋ 新增{group.key === 'doctor' ? '5维分析' : '生活方式分析'}
                          </button>
                          <button className="btn btn-sm" style={{ color: '#DC3545', borderColor: '#FCA5A5', background: '#FFF5F5' }}
                            onClick={() => handleDeleteAISummaryRecord(group.key, curYear, group.current._recordIndex, group.current.generatedAt)}>
                            删除本次评估
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div>
                      <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 8 }}>
                        {group.key === 'nutrition' && !latestDoctorApproved
                          ? '等待健康顾问完成并审核本年度5维分析'
                          : '本年度尚未生成'}
                      </div>
                      {(staff?.role === 'superadmin'
                        || (group.key === 'doctor' && staff?.role === 'familyDoctor')
                        || (group.key === 'nutrition' && staff?.role === 'nutritionist')) && (
                        <button className="btn btn-primary btn-sm"
                          disabled={aiSummaryLoading || (group.key === 'nutrition' && !latestDoctorApproved)}
                          onClick={() => handleGenerateAISummary(curYear, group.key, false)}>
                          ＋ 新增{group.key === 'doctor' ? '5维分析' : '生活方式分析'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {/* 操作栏 */}
            {(() => {
              // 按角色拆分审核（健康顾问审5维 / 营养师审生活方式评估；超管两者皆可）
              const roleScope = staff?.role === 'familyDoctor' ? 'doctor'
                : staff?.role === 'nutritionist' ? 'nutrition'
                : staff?.role === 'superadmin' ? 'all' : null
              const docApproved = !!(ais.doctorApprovedAt || ais.approvedAt)
              const nutApproved = !!(ais.nutritionApprovedAt || ais.approvedAt)
              const hasLifestyle = (ais.sections?.lifestyle_assessment?.items || []).length > 0 || !!ais.sections?.lifestyle_assessment?.summary
              const canDoc = hasDoctorData && !docApproved && (roleScope === 'doctor' || roleScope === 'all')
              const canNut = hasLifestyle && !nutApproved && (roleScope === 'nutrition' || roleScope === 'all')
              return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {/* 双维度审核状态 */}
              {hasData && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 200 }}>
                  {aiAnalysisView === 'doctor' && <span style={{ fontSize: 12, color: docApproved ? '#22A06B' : '#8AA89C' }}>
                    {docApproved
                      ? `✓ 5维度分析 已审核${ais.doctorApprovedBy ? '·' + ais.doctorApprovedBy : ''}（健康顾问）`
                      : '○ 5维度分析 待健康顾问审核'}
                  </span>}
                  {aiAnalysisView === 'nutrition' && <span style={{ fontSize: 12, color: nutApproved ? '#16A34A' : '#8AA89C' }}>
                    {!hasLifestyle ? '— 生活方式评估（暂无内容）'
                      : nutApproved
                        ? `✓ 生活方式评估 已审核${ais.nutritionApprovedBy ? '·' + ais.nutritionApprovedBy : ''}（营养师）`
                        : '○ 生活方式评估 待营养师审核'}
                  </span>}
                </div>
              )}
              {!hasData && (
                <div style={{ fontSize: 12, color: '#8AA89C', flex: 1, minWidth: 180 }}>{curYear}年度尚未生成</div>
              )}
              {/* 角色化审核按钮（仅查看模式） */}
              {!editingAISummary && aiAnalysisView === 'doctor' && canDoc && (
                <button className="btn btn-primary btn-sm" onClick={() => handleApproveSummaryScope('doctor', curYear, doctorRecord._recordIndex)}>
                  审核5维度通过
                </button>
              )}
              {!editingAISummary && aiAnalysisView === 'nutrition' && canNut && (
                <button className="btn btn-primary btn-sm" style={{ background: '#16A34A', borderColor: '#16A34A' }} onClick={() => handleApproveSummaryScope('nutrition', curYear, nutritionRecord._recordIndex)}>
                  审核生活方式评估通过
                </button>
              )}
              {!editingAISummary && aiAnalysisView === 'doctor' && hasDoctorData && (roleScope === 'doctor' || roleScope === 'all') && (
                <button className="btn btn-secondary btn-sm" onClick={() => {
                  setAiSummaryForm({ sections: JSON.parse(JSON.stringify(ais.sections || {})) })
                  setAiYear(curYear)
                  setAiRecordIndex(v => ({ ...v, doctor: doctorRecord._recordIndex || 0 }))
                  setEditingAISummary('doctor')
                }}>编辑5维分析</button>
              )}
              {!editingAISummary && aiAnalysisView === 'nutrition' && hasLifestyle && (roleScope === 'nutrition' || roleScope === 'all') && (
                <button className="btn btn-secondary btn-sm" onClick={() => {
                  setAiSummaryForm({ sections: JSON.parse(JSON.stringify(ais.sections || {})) })
                  setAiYear(curYear)
                  setAiRecordIndex(v => ({ ...v, nutrition: nutritionRecord._recordIndex || 0 }))
                  setEditingAISummary('nutrition')
                }}>编辑生活方式评估</button>
              )}
              {editingAISummary && (
                <>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditingAISummary(false)}>取消</button>
                  <button className="btn btn-primary btn-sm" onClick={() => handleSaveAISummary(false)}>保存</button>
                </>
              )}
              {/* 生成按钮按角色拆分：家医只生成5维度，营养师只生成生活方式评估，超管两者都能触发（走 all，一次生成全部）
                  已审核的部分，生成按钮变灰并提示，点击需二次确认，防止误点覆盖已审核内容（2026-07-10 金娟：家医端要提示已审核防误点） */}
              {!editingAISummary && aiAnalysisView === 'doctor' && (roleScope === 'doctor') && (
                <button className="btn btn-sm" disabled={aiSummaryLoading}
                  style={docApproved ? { background: '#E5E7EB', color: '#6B7280', borderColor: '#E5E7EB' } : { background: '#1E6B50', color: '#fff', borderColor: '#1E6B50' }}
                  onClick={() => {
                    if (docApproved && !window.confirm('最新一条5维度分析已审核。重新生成会新增一条待审核记录，原审核记录仍会保留，确定继续？')) return
                    handleGenerateAISummary(curYear, 'doctor', docApproved)
                  }}>
                  {aiSummaryLoading ? '生成中…' : (docApproved ? '新增5维分析' : (hasDoctorData ? '重新生成5维度分析' : '生成5维度分析'))}
                </button>
              )}
              {!editingAISummary && aiAnalysisView === 'nutrition' && (roleScope === 'nutrition') && (
                <button className="btn btn-sm" disabled={aiSummaryLoading || !latestDoctorApproved}
                  title={!latestDoctorApproved ? '请先由健康顾问完成并审核本年度5维分析' : ''}
                  style={nutApproved ? { background: '#E5E7EB', color: '#6B7280', borderColor: '#E5E7EB' } : { background: '#1E6B50', color: '#fff', borderColor: '#1E6B50' }}
                  onClick={() => {
                    if (nutApproved && !window.confirm('最新一条生活方式评估已审核。重新生成会新增一条待审核记录，原审核记录仍会保留，确定继续？')) return
                    handleGenerateAISummary(curYear, 'nutrition', nutApproved)
                  }}>
                  {aiSummaryLoading ? '生成中…' : (!latestDoctorApproved ? '等待5维分析审核' : (nutApproved ? '新增生活方式评估' : (hasLifestyle ? '重新生成生活方式评估' : '生成生活方式评估')))}
                </button>
              )}
              {!editingAISummary && (roleScope === 'all') && (
                <button className="btn btn-sm" disabled={aiSummaryLoading || (aiAnalysisView === 'nutrition' && !latestDoctorApproved)}
                  style={(aiAnalysisView === 'doctor' ? docApproved : nutApproved) ? { background: '#E5E7EB', color: '#6B7280', borderColor: '#E5E7EB' } : { background: '#1E6B50', color: '#fff', borderColor: '#1E6B50' }}
                  onClick={() => {
                    const approved = aiAnalysisView === 'doctor' ? docApproved : nutApproved
                    const label = aiAnalysisView === 'doctor' ? '5维分析' : '生活方式分析'
                    if (approved && !window.confirm(`本年度最新${label}已有审核结果。重新生成会新增一条待审核记录，原审核记录仍会保留，确定继续？`)) return
                    handleGenerateAISummary(curYear, aiAnalysisView, approved)
                  }}>
                  {aiSummaryLoading ? '生成中…' : `新增${aiAnalysisView === 'doctor' ? '5维分析' : '生活方式分析'}`}
                </button>
              )}
            </div>
              )
            })()}

            {!activeHasData ? (
              <div className="card" style={{ textAlign: 'center', padding: 40, color: '#8AA89C', fontSize: 14 }}>
                {aiAnalysisView === 'doctor'
                  ? `${curYear}年度5维分析尚未生成，请由健康顾问新增评估。`
                  : (!latestDoctorApproved
                    ? `请先由健康顾问完成并审核${curYear}年度5维分析。`
                    : `${curYear}年度生活方式分析尚未生成，请由营养师新增评估。`)}
              </div>
            ) : (
              <>
                {aiAnalysisView === 'doctor' && hasDoctorData && (
                  <div style={{ margin: '6px 0 12px', padding: '10px 14px', borderRadius: 8, background: '#E8F5EF', color: '#1E6B50', fontWeight: 800 }}>
                    健康顾问 · 5维健康信息整理
                  </div>
                )}
                {aiAnalysisView === 'doctor' && hasDoctorData && <>
                {(() => {
                  const groups = [
                    ['肿瘤风险筛查', sec.tumor_risk?.sourceReportIds || []],
                    ['心脑血管风险', sec.cardiovascular_risk?.sourceReportIds || []],
                    ['慢性病及其他指标', sec.chronic_disease?.sourceReportIds || []],
                    ['体检全面性', sec.checkup_completeness?.sourceReportIds || []],
                    ['优先医疗问题', sec.medical_priority?.sourceReportIds || []],
                  ].map(([label, ids]) => [label, [...new Set(ids)]])
                    .filter(([, ids]) => ids.length)
                  if (!groups.length) return null
                  const reportLabel = reportId => {
                    const report = screeningReports.find(r => String(r._id) === String(reportId))
                    if (!report) return '原始报告'
                    const title = report.screeningL2 || report.title || '检查报告'
                    const date = String(report.checkDate || report.date || '').slice(0, 10)
                    const hospital = report.hospital || report.institution || ''
                    return [title, hospital, date].filter(Boolean).join(' · ')
                  }
                  return (
                    <details className="card" style={{ marginBottom: 12, padding: '10px 14px', background: '#F0F7FF', border: '1px solid #BFDBFE' }}>
                      <summary style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', cursor: 'pointer' }}>
                        🔗 本次5维分析依据（按分析板块对应，点击展开）
                      </summary>
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {groups.map(([label, ids]) => (
                          <div key={label}>
                            <div style={{ fontSize: 12, color: '#1D4ED8', fontWeight: 700, marginBottom: 5 }}>{label}</div>
                            <button className="btn btn-secondary btn-sm"
                              onClick={() => setAiSourceGroup({ title: label, ids, reportLabel })}>
                              查看原始材料（{ids.length}份）
                            </button>
                          </div>
                        ))}
                      </div>
                    </details>
                  )
                })()}
                {/* 板块一：肿瘤风险筛查分析 */}
                <AISectionCard title="肿瘤筛查信息整理" icon="🔬" color="#7C3AED">
                  <AISectionSourceButton title="肿瘤风险筛查分析" ids={sourceIdsFor('tumor_risk')} onOpen={openSectionSources} />
                  {renderSectionActions('tumor_risk')}
                  {docEditing && (!editingAISection || editingAISection === 'tumor_risk') ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {sec.tumor_risk?.overview && <textarea className="form-control" rows={3} value={sec.tumor_risk.overview.headline || ''} placeholder="卡片总览" onChange={e => updOverviewHeadline('tumor_risk', e.target.value)} style={{ fontSize: 14, lineHeight: 1.7, minHeight: 90, resize: 'vertical', width: '100%' }} />}
                      {Array.isArray(sec.tumor_risk?.cancers) && sec.tumor_risk.cancers.length > 0
                        ? renderStructuredEditor('tumor_risk', 'cancers', sec.tumor_risk.cancers, [
                          ['covered','已覆盖'], ['due_soon','即将到期'], ['overdue','已到期'], ['follow_up_due','异常复查'], ['not_routinely_recommended','无需常规年筛'], ['unknown','资料不足'],
                        ])
                        : [['completed','✅ 已完成筛查（每行一条）'],['abnormal','⚠️ 异常发现（每行一条）'],['missing','📌 未覆盖项目（每行一条）']].map(([f,lbl]) => (
                          <div key={f}><div style={{ fontSize: 11, color: '#4A6558', marginBottom: 3 }}>{lbl}</div><AIArrEdit value={(sec.tumor_risk?.[f] || []).join('\n')} placeholder={lbl} onChange={e => updSecArr('tumor_risk', f, e.target.value)} /></div>
                        ))}
                      <div><div style={{ fontSize: 11, color: '#4A6558', marginBottom: 3 }}>总评</div>
                        <textarea className="form-control" rows={2} value={sec.tumor_risk?.summary || ''} onChange={e => updSec('tumor_risk', 'summary', e.target.value)} style={{ fontSize: 12, resize: 'vertical', width: '100%' }} /></div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {Array.isArray(sec.tumor_risk?.cancers) && sec.tumor_risk.cancers.length > 0 ? (() => {
                        const statusMeta = {
                          covered: { label: '已覆盖', color: '#15803D', bg: '#DCFCE7' },
                          due_soon: { label: '即将到期', color: '#A16207', bg: '#FEF9C3' },
                          overdue: { label: '已到期', color: '#C2410C', bg: '#FFEDD5' },
                          follow_up_due: { label: '异常复查', color: '#B91C1C', bg: '#FEE2E2' },
                          not_routinely_recommended: { label: '无需常规年筛', color: '#475569', bg: '#F1F5F9' },
                          unknown: { label: '资料不足', color: '#64748B', bg: '#F1F5F9' },
                        }
                        const trendMeta = {
                          no_data: '暂无趋势', baseline: '已建立基线', stable: '基本稳定', improving: '改善',
                          worsening: '需关注变化', fluctuating: '存在波动', not_comparable: '暂不可比较',
                        }
                        // 后端已按当前男女常见肿瘤目录排序；展示层不得再按关注等级重排。
                        const cancers = [...sec.tumor_risk.cancers]
                        const ov = sec.tumor_risk.overview || {}
                        return <>
                          <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 10, padding: '11px 13px' }}>
                            <div style={{ fontWeight: 800, color: '#5B21B6', marginBottom: 5 }}>{ov.headline || sec.tumor_risk.summary || '常见肿瘤筛查与趋势总览'}</div>
                            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: '#6B7280' }}>
                              <span>常见肿瘤目录 {cancers.length} 项</span>
                              <span style={{ color: '#15803D' }}>已覆盖 {Number(ov.coveredCount) || cancers.filter(c => c.status === 'covered').length} 项</span>
                              <span style={{ color: '#B91C1C' }}>需关注 {Number(ov.attentionCount) || cancers.filter(c => ['follow_up_due', 'overdue', 'due_soon'].includes(c.status)).length} 项</span>
                              <span>待补资料 {Number(ov.unknownCount) || cancers.filter(c => c.status === 'unknown').length} 项</span>
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 8 }}>
                            {cancers.map((cancer, index) => {
                              const meta = statusMeta[cancer.status] || statusMeta.unknown
                              const needsAttention = ['follow_up_due', 'overdue', 'due_soon'].includes(cancer.status)
                              return <details key={`${cancer.name}-${index}`} open={lastRegeneratedItem === `tumor_risk:${cancer.name}`}
                                style={{ border: `1px solid ${needsAttention ? meta.bg : '#E5E7EB'}`, borderRadius: 9, background: '#fff', padding: '9px 11px' }}>
                                <summary style={{ cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ fontWeight: 800, color: '#1F2937', flex: 1 }}>{cancer.name}</span>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: meta.color, background: meta.bg, borderRadius: 999, padding: '2px 8px' }}>{meta.label}</span>
                                  <span style={{ fontSize: 11, color: '#64748B' }}>{trendMeta[cancer.trendStatus] || '趋势待确认'}</span>
                                </summary>
                                <div style={{ marginTop: 9, paddingTop: 8, borderTop: '1px solid #F1F5F9', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, lineHeight: 1.6 }}>
                                  {cancer.latest && <div><b style={{ color: '#64748B' }}>最近检查：</b>{cancer.latest}</div>}
                                  {cancer.trend && <div><b style={{ color: '#64748B' }}>5年趋势：</b>{cancer.trend}</div>}
                                  {(cancer.keyChanges || []).length > 0 && <div><b style={{ color: '#64748B' }}>关键变化：</b>{cancer.keyChanges.join('；')}</div>}
                                  {cancer.nextAction && <div style={{ color: meta.color }}><b>下一步：</b>{cancer.nextAction}</div>}
                                  {cancer.riskBasis && cancer.status === 'unknown' && <div><b style={{ color: '#64748B' }}>待核对：</b>{cancer.riskBasis}</div>}
                                  <button className="btn btn-secondary btn-sm" onClick={() => openItemSources(cancer, 'tumor_risk')}>🔗 按年份查看对应材料</button>
                                  <button className="btn btn-secondary btn-sm" disabled={aiSummaryLoading} onClick={() => handleRegenerateAISummaryItem('tumor_risk', cancer.name)}>✎ 录入问题并单项重新生成</button>
                                </div>
                              </details>
                            })}
                          </div>
                        </>
                      })() : <>
                        {(sec.tumor_risk?.completed || []).length > 0 && <div><div style={{ fontSize: 12, color: '#8AA89C', fontWeight: 600 }}>已完成筛查</div><AIListLines items={sec.tumor_risk.completed} /></div>}
                        {(sec.tumor_risk?.abnormal || []).length > 0 && <div><div style={{ fontSize: 12, color: '#8AA89C', fontWeight: 600 }}>异常发现</div><AIListLines items={sec.tumor_risk.abnormal} color="#DC2626" /></div>}
                        {(sec.tumor_risk?.missing || []).length > 0 && <div><div style={{ fontSize: 12, color: '#8AA89C', fontWeight: 600 }}>未覆盖项目</div><AIListLines items={sec.tumor_risk.missing} color="#8AA89C" /></div>}
                      </>}
                      {sec.tumor_risk?.summary && <div style={{ fontSize: 13, lineHeight: 1.7, color: '#1A2B24', background: '#F2EDE3', borderRadius: 8, padding: '9px 12px', marginTop: 2 }}>{sec.tumor_risk.summary}</div>}
                    </div>
                  )}
                </AISectionCard>

                {/* 板块二：心脑血管病风险分析 */}
                <AISectionCard title="心脑血管相关信息整理" icon="❤️" color="#EF4444">
                  <AISectionSourceButton title="心脑血管病风险分析" ids={sourceIdsFor('cardiovascular_risk')} onOpen={openSectionSources} />
                  {renderSectionActions('cardiovascular_risk')}
                  {docEditing && (!editingAISection || editingAISection === 'cardiovascular_risk') ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {sec.cardiovascular_risk?.overview && <textarea className="form-control" rows={3} value={sec.cardiovascular_risk.overview.headline || ''} placeholder="卡片总览" onChange={e => updOverviewHeadline('cardiovascular_risk', e.target.value)} style={{ fontSize: 14, lineHeight: 1.7, minHeight: 90, resize: 'vertical', width: '100%' }} />}
                      {Array.isArray(sec.cardiovascular_risk?.topics) && sec.cardiovascular_risk.topics.length > 0
                        ? renderStructuredEditor('cardiovascular_risk', 'topics', sec.cardiovascular_risk.topics, [
                          ['attention','需关注'], ['monitor','持续监测'], ['stable','基本稳定'], ['unknown','资料不足'],
                        ])
                        : [['high','🔴 重点关注信息（每行一条）'],['medium','🟡 持续关注信息（每行一条）']].map(([f,lbl]) => (
                          <div key={f}><div style={{ fontSize: 11, color: '#4A6558', marginBottom: 3 }}>{lbl}</div><AIArrEdit value={(sec.cardiovascular_risk?.[f] || []).join('\n')} placeholder={lbl} onChange={e => updSecArr('cardiovascular_risk', f, e.target.value)} /></div>
                        ))}
                      <div><div style={{ fontSize: 11, color: '#4A6558', marginBottom: 3 }}>综合评估</div>
                        <textarea className="form-control" rows={2} value={sec.cardiovascular_risk?.summary || ''} onChange={e => updSec('cardiovascular_risk', 'summary', e.target.value)} style={{ fontSize: 12, resize: 'vertical', width: '100%' }} /></div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {Array.isArray(sec.cardiovascular_risk?.topics) && sec.cardiovascular_risk.topics.length > 0
                        ? renderHealthTrendCards(sec.cardiovascular_risk.topics, sec.cardiovascular_risk.overview, '#B91C1C', 'cardiovascular_risk')
                        : <>
                          {(sec.cardiovascular_risk?.high || []).length > 0 && <div><div style={{ fontSize: 12, color: '#8AA89C', fontWeight: 600 }}>重点关注信息</div><AIListLines items={sec.cardiovascular_risk.high} color="#DC2626" /></div>}
                          {(sec.cardiovascular_risk?.medium || []).length > 0 && <div><div style={{ fontSize: 12, color: '#8AA89C', fontWeight: 600 }}>持续关注信息</div><AIListLines items={sec.cardiovascular_risk.medium} color="#D97706" /></div>}
                        </>}
                      {sec.cardiovascular_risk?.summary && <div style={{ fontSize: 13, lineHeight: 1.7, color: '#1A2B24', background: '#F2EDE3', borderRadius: 8, padding: '9px 12px', marginTop: 2 }}>{sec.cardiovascular_risk.summary}</div>}
                    </div>
                  )}
                </AISectionCard>

                {/* 板块三：慢性病及其他健康指标 */}
                <AISectionCard title="慢病及其他健康信息整理" icon="📊" color="#0077B6">
                  <AISectionSourceButton title="慢性病及其他健康指标分析" ids={sourceIdsFor('chronic_disease')} onOpen={openSectionSources} />
                  {renderSectionActions('chronic_disease')}
                  {docEditing && (!editingAISection || editingAISection === 'chronic_disease') ? (
                    (sec.chronic_disease?.items || []).some(item => item.trend || item.latest || item.trendStatus) ? <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {sec.chronic_disease?.overview && <textarea className="form-control" rows={3} value={sec.chronic_disease.overview.headline || ''} placeholder="卡片总览" onChange={e => updOverviewHeadline('chronic_disease', e.target.value)} style={{ fontSize: 14, lineHeight: 1.7, minHeight: 90, resize: 'vertical', width: '100%' }} />}
                      {renderStructuredEditor('chronic_disease', 'items', sec.chronic_disease.items, [
                        ['abnormal','异常'], ['mild_abnormal','轻度异常'], ['normal','正常'],
                      ])}</div> : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {(sec.chronic_disease?.items || []).map((item, i) => (
                        <div key={i} style={{ border: '1px solid #E0D9CE', borderRadius: 8, padding: '8px 12px', background: '#FAFAF8' }}>
                          <div style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                            <input style={{ ...inStyle, flex: 2 }} value={item.name || ''} placeholder="指标/系统名称" onChange={e => updItem('chronic_disease', i, 'name', e.target.value)} />
                            <select style={{ ...inStyle, flex: 1 }} value={item.status || 'normal'} onChange={e => updItem('chronic_disease', i, 'status', e.target.value)}>
                              <option value="abnormal">异常</option>
                              <option value="mild_abnormal">轻度异常</option>
                              <option value="normal">正常</option>
                            </select>
                            <button onClick={() => delItem('chronic_disease', i)} style={{ fontSize: 11, color: '#DC3545', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', flexShrink: 0 }}>删除</button>
                          </div>
                          <input style={{ ...inStyle, marginBottom: 4 }} value={item.value || ''} placeholder="当前值描述" onChange={e => updItem('chronic_disease', i, 'value', e.target.value)} />
                          <input style={inStyle} value={item.note || ''} placeholder="简要说明" onChange={e => updItem('chronic_disease', i, 'note', e.target.value)} />
                        </div>
                      ))}
                      <button onClick={() => addItem('chronic_disease', { name: '', status: 'mild_abnormal', value: '', note: '' })}
                        style={{ fontSize: 12, color: '#1E6B50', background: 'none', border: '1px dashed #B2D8C7', borderRadius: 6, padding: '6px', cursor: 'pointer' }}>＋ 新增指标</button>
                    </div>
                  ) : (
                    (sec.chronic_disease?.items || []).length === 0 ? (
                      <div style={{ color: '#8AA89C', fontSize: 13 }}>各项慢性病指标暂无异常</div>
                    ) : sec.chronic_disease.items.some(item => item.trend || item.latest || item.trendStatus) ? (
                      renderHealthTrendCards(sec.chronic_disease.items, sec.chronic_disease.overview, '#0369A1', 'chronic_disease')
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {sec.chronic_disease.items.map((item, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderBottom: i < sec.chronic_disease.items.length - 1 ? '1px solid #F5F2EC' : 'none' }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[item.status] || '#aaa', marginTop: 5, flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.7, color: '#1A2B24' }}>{item.name}</div>
                              {item.value && <div style={{ fontSize: 13, lineHeight: 1.7, color: '#4A6558' }}>· {item.value}</div>}
                              {item.note && <div style={{ fontSize: 12, lineHeight: 1.7, color: '#6B7280', marginTop: 2 }}>· {item.note}</div>}
                              {item.sourceReportId && (
                                <button className="btn btn-secondary btn-sm" style={{ marginTop: 5 }}
                                  onClick={() => openAIAnalysisSource(item.sourceReportId)}>🔗 查看分析依据</button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </AISectionCard>

                {/* 板块四：体检全面性评估 */}
                <AISectionCard title="体检资料覆盖情况" icon="📋" color="#1E6B50">
                  <AISectionSourceButton title="体检全面性评估" ids={sourceIdsFor('checkup_completeness')} onOpen={openSectionSources} />
                  {renderSectionActions('checkup_completeness')}
                  {docEditing && (!editingAISection || editingAISection === 'checkup_completeness') ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {[['covered','✅ 已覆盖项目（每行一条）'],['missing','❌ 缺失重要项目（每行一条）']].map(([f,lbl]) => (
                        <div key={f}><div style={{ fontSize: 11, color: '#4A6558', marginBottom: 3 }}>{lbl}</div><AIArrEdit value={(sec.checkup_completeness?.[f] || []).join('\n')} placeholder={lbl} onChange={e => updSecArr('checkup_completeness', f, e.target.value)} /></div>
                      ))}
                      <div><div style={{ fontSize: 11, color: '#4A6558', marginBottom: 3 }}>补项建议</div>
                        <textarea className="form-control" rows={2} value={sec.checkup_completeness?.suggestion || ''} onChange={e => updSec('checkup_completeness', 'suggestion', e.target.value)} style={{ fontSize: 12, resize: 'vertical', width: '100%' }} /></div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {(sec.checkup_completeness?.covered || []).length > 0 && <div><div style={{ fontSize: 12, color: '#8AA89C', fontWeight: 600 }}>已覆盖</div><AIListLines items={sec.checkup_completeness.covered} /></div>}
                      {(sec.checkup_completeness?.missing || []).length > 0 && <div><div style={{ fontSize: 12, color: '#8AA89C', fontWeight: 600 }}>缺失项目</div><AIListLines items={sec.checkup_completeness.missing} color="#D97706" /></div>}
                      {sec.checkup_completeness?.suggestion && <div style={{ fontSize: 13, lineHeight: 1.7, color: '#1A2B24', background: '#F2EDE3', borderRadius: 8, padding: '9px 12px', marginTop: 2 }}>{sec.checkup_completeness.suggestion}</div>}
                    </div>
                  )}
                </AISectionCard>
                <AISummaryDiscussionPanel patientId={id} year={curYear} recordIndex={doctorRecord._recordIndex} discussions={doctorRecord.discussions || []} staff={staff} onRefresh={load} onPreviewImage={setPreviewImageUrl} title="体检资料覆盖 · AI讨论" sectionKey="checkup_completeness" />

                {/* 板块五：需优先解决的医疗问题 */}
                <AISectionCard title="需优先关注的信息" icon="🏥" color="#DC2626">
                  <AISectionSourceButton title="需优先解决的医疗问题" ids={sourceIdsFor('medical_priority')} onOpen={openSectionSources} />
                  {renderSectionActions('medical_priority')}
                  {docEditing && (!editingAISection || editingAISection === 'medical_priority') ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {(sec.medical_priority?.items || []).map((item, i) => (
                        <div key={i} style={{ border: '1px solid #E0D9CE', borderRadius: 8, padding: '10px 12px', background: '#FAFAF8' }}>
                          <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                            <input style={{ ...inStyle, flex: 2 }} value={item.name || ''} placeholder="问题名称" onChange={e => updItem('medical_priority', i, 'name', e.target.value)} />
                            <select style={{ ...inStyle, flex: 1 }} value={item.urgency || 'low'} onChange={e => updItem('medical_priority', i, 'urgency', e.target.value)}>
                              <option value="high">高优先</option>
                              <option value="medium">中优先</option>
                              <option value="low">低优先</option>
                            </select>
                            <button onClick={() => delItem('medical_priority', i)} style={{ fontSize: 11, color: '#DC3545', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', flexShrink: 0 }}>删除</button>
                          </div>
                          <input style={{ ...inStyle, marginBottom: 4 }} value={item.current || ''} placeholder="当前数值描述" onChange={e => updItem('medical_priority', i, 'current', e.target.value)} />
                          <textarea style={{ ...inStyle, resize: 'vertical', marginBottom: 4 }} rows={2} value={item.meaning || ''} placeholder="原报告信息说明" onChange={e => updItem('medical_priority', i, 'meaning', e.target.value)} />
                          <div style={{ display: 'flex', gap: 6 }}>
                            <input style={{ ...inStyle, flex: 2 }} value={item.action || ''} placeholder="建议行动" onChange={e => updItem('medical_priority', i, 'action', e.target.value)} />
                            <input style={{ ...inStyle, flex: 1 }} value={item.department || ''} placeholder="建议科室" onChange={e => updItem('medical_priority', i, 'department', e.target.value)} />
                          </div>
                        </div>
                      ))}
                      <button onClick={() => addItem('medical_priority', { name: '', urgency: 'medium', current: '', meaning: '', action: '', department: '' })}
                        style={{ fontSize: 12, color: '#1E6B50', background: 'none', border: '1px dashed #B2D8C7', borderRadius: 6, padding: '6px', cursor: 'pointer' }}>＋ 新增问题</button>
                    </div>
                  ) : (
                    (sec.medical_priority?.items || []).length === 0 ? (
                      <div style={{ color: '#8AA89C', fontSize: 13 }}>暂无需紧急处理的医疗问题</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {sec.medical_priority.items.map((item, i) => {
                          const badge = URGENCY_BADGE[item.urgency] || URGENCY_BADGE.low
                          return (
                            <div key={i} style={{ border: '1px solid #F0EDE7', borderRadius: 8, padding: '10px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, background: badge.bg, color: badge.color, borderRadius: 4, padding: '2px 7px' }}>{badge.label}优先</span>
                                <span style={{ fontWeight: 600, fontSize: 14, color: '#1A2B24' }}>{item.name}</span>
                                {item.department && <span style={{ fontSize: 12, color: '#8AA89C', marginLeft: 'auto' }}>→ {item.department}</span>}
                              </div>
                              {item.current && <div style={{ fontSize: 12, color: '#4A6558', marginBottom: 4 }}>当前：{item.current}</div>}
                              {item.meaning && <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>信息说明：{item.meaning}</div>}
                              {item.action && <div style={{ fontSize: 12, color: '#1E6B50', fontWeight: 500 }}>建议：{item.action}</div>}
                              {item.sourceReportId && (
                                <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }}
                                  onClick={() => openAIAnalysisSource(item.sourceReportId)}>🔗 查看原始报告</button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  )}
                </AISectionCard>
                <AISummaryDiscussionPanel patientId={id} year={curYear} recordIndex={doctorRecord._recordIndex} discussions={doctorRecord.discussions || []} staff={staff} onRefresh={load} onPreviewImage={setPreviewImageUrl} title="需优先关注的信息 · AI讨论" sectionKey="medical_priority" />
                </>}

                {/* 板块六：生活方式评估（结合最近一次体检 + 膳食调查综合概述） */}
                {aiAnalysisView === 'nutrition' && hasLifestyle && (
                  <div style={{ margin: '20px 0 12px', padding: '10px 14px', borderRadius: 8, background: '#F0FDF4', color: '#16A34A', fontWeight: 800 }}>
                    营养师 · 生活方式分析
                  </div>
                )}
                {aiAnalysisView === 'nutrition' && hasLifestyle && <><AISectionCard title="生活方式评估" icon="🌿" color="#16A34A">
                  {nutEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {(sec.lifestyle_assessment?.items || []).map((item, i) => (
                        <div key={i} style={{ border: '1px solid #E0D9CE', borderRadius: 8, padding: '10px 12px', background: '#FAFAF8' }}>
                          <div style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                            <input style={{ ...inStyle, flex: 1 }} value={item.dimension || ''} placeholder="维度（如：饮食、运动、睡眠）" onChange={e => updItem('lifestyle_assessment', i, 'dimension', e.target.value)} />
                            <button onClick={() => delItem('lifestyle_assessment', i)} style={{ fontSize: 11, color: '#DC3545', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', flexShrink: 0 }}>删除</button>
                          </div>
                          <textarea style={{ ...inStyle, resize: 'vertical', marginBottom: 4 }} rows={2} value={item.finding || ''} placeholder="现状与问题（结合最近一次体检结果）" onChange={e => updItem('lifestyle_assessment', i, 'finding', e.target.value)} />
                          <input style={{ ...inStyle, marginBottom: 4 }} value={item.risk || ''} placeholder="关联健康风险" onChange={e => updItem('lifestyle_assessment', i, 'risk', e.target.value)} />
                          <input style={inStyle} value={item.suggestion || ''} placeholder="改善建议" onChange={e => updItem('lifestyle_assessment', i, 'suggestion', e.target.value)} />
                        </div>
                      ))}
                      <button onClick={() => addItem('lifestyle_assessment', { dimension: '', finding: '', risk: '', suggestion: '' })}
                        style={{ fontSize: 12, color: '#1E6B50', background: 'none', border: '1px dashed #B2D8C7', borderRadius: 6, padding: '6px', cursor: 'pointer' }}>＋ 新增维度</button>
                      <div><div style={{ fontSize: 11, color: '#4A6558', marginBottom: 3 }}>综合评估</div>
                        <textarea className="form-control" rows={2} value={sec.lifestyle_assessment?.summary || ''} onChange={e => updSec('lifestyle_assessment', 'summary', e.target.value)} style={{ fontSize: 12, resize: 'vertical', width: '100%' }} /></div>
                    </div>
                  ) : (
                    (sec.lifestyle_assessment?.items || []).length === 0 && !sec.lifestyle_assessment?.summary ? (
                      <div style={{ color: '#8AA89C', fontSize: 13 }}>暂无生活方式评估（生成时将结合最近一次体检与膳食调查综合概述）</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {(sec.lifestyle_assessment?.items || []).map((item, i) => (
                          <div key={i} style={{ border: '1px solid #F0EDE7', borderRadius: 8, padding: '10px 14px' }}>
                            <div style={{ fontWeight: 600, fontSize: 14, color: '#1A2B24', marginBottom: 4 }}>{item.dimension}</div>
                            {item.finding && <div style={{ fontSize: 12, color: '#4A6558', marginBottom: 3 }}>现状：{item.finding}</div>}
                            {item.risk && <div style={{ fontSize: 12, color: '#D97706', marginBottom: 3 }}>风险：{item.risk}</div>}
                            {item.suggestion && <div style={{ fontSize: 12, color: '#16A34A', fontWeight: 500 }}>建议：{item.suggestion}</div>}
                          </div>
                        ))}
                        {sec.lifestyle_assessment?.summary && <div style={{ fontSize: 13, color: '#4A6558', background: '#F0FDF4', borderRadius: 6, padding: '6px 10px', marginTop: 4 }}>{sec.lifestyle_assessment.summary}</div>}
                      </div>
                    )
                  )}
                </AISectionCard>
                <AISummaryDiscussionPanel patientId={id} year={curYear} recordIndex={nutritionRecord._recordIndex} discussions={nutritionRecord.discussions || []} staff={staff} onRefresh={load} onPreviewImage={setPreviewImageUrl} title="生活方式分析 · AI讨论" sectionKey="lifestyle_assessment" /></>}
              </>
            )}
          </div>
        )
      })()}

      {/* ── 健康关注提示 Tab（场景八）── */}
      {tab === 'ai-risk' && (() => {
        const byYear = riskByYearFE(user.aiRiskAssessment)
        const years = Object.keys(byYear).sort((a, b) => Number(b) - Number(a))
        const nowY = new Date().getFullYear()
        // 年度候选只展示实际已生成的年份 + 当前年（用于首次生成入口），不预设未来/往年空占位
        const yearOpts = [...new Set([...years, String(nowY)])].sort((a, b) => Number(b) - Number(a))
        const curYear = (riskYear && yearOpts.includes(riskYear)) ? riskYear : (years[0] || String(nowY))
        const ra = byYear[curYear] || {}
        const dims = Array.isArray(ra.dimensions) ? ra.dimensions : []
        const hasData = dims.length > 0
        const LV = {
          low:      { label: '一般关注',  bg: '#F0FDF4', color: '#16A34A', dot: '#22C55E' },
          medium:   { label: '持续关注',  bg: '#FEF9EC', color: '#D97706', dot: '#F59E0B' },
          high:     { label: '重点关注',  bg: '#FEF2F2', color: '#DC2626', dot: '#EF4444' },
          critical: { label: '建议尽快咨询医疗机构',  bg: '#FEE2E2', color: '#B91C1C', dot: '#B91C1C' },
        }
        const lvOf = (k) => LV[k] || LV.low
        const overall = lvOf(ra.overallLevel)
        return (
          <div>
            <AiRuleHint scene="risk_assessment" />
            {/* 年度切换 */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
              {yearOpts.map(y => (
                <button key={y} onClick={() => { setRiskYear(y); setEditingRisk(false) }}
                  style={{
                    border: 'none', borderRadius: 6, padding: '3px 10px', fontSize: 12, cursor: 'pointer',
                    background: y === curYear ? '#1E6B50' : '#F5F2EC',
                    color: y === curYear ? '#fff' : '#4A6558',
                    fontWeight: y === curYear ? 700 : 400,
                  }}>
                  {y}{byYear[y] ? ' ●' : ''}
                </button>
              ))}
            </div>
            {/* 操作栏 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              {ra.approvedAt ? (
                <div style={{ fontSize: 12, color: '#22A06B', background: '#E8F5EF', borderRadius: 6, padding: '4px 10px', flex: 1 }}>
                  ✓ 已审核确认 {ra.approvedBy && `· ${ra.approvedBy}`} · {new Date(ra.approvedAt).toLocaleDateString('zh-CN')}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#8AA89C', flex: 1 }}>
                  {hasData ? `生成时间：${new Date(ra.generatedAt).toLocaleString('zh-CN')}${ra.alerted ? ' · ⚠ 重点关注信息待核对' : ''}` : '尚未生成'}
                </div>
              )}
              {hasData && !editingRisk && (
                <button className="btn btn-secondary btn-sm" onClick={() => startEditRisk(curYear)}>✏️ 编辑</button>
              )}
              {hasData && !ra.approvedAt && !editingRisk && (
                <button className="btn btn-primary btn-sm" onClick={() => handleApproveRisk(curYear)} disabled={riskApproving}>
                  {riskApproving ? '处理中...' : '审核确认'}
                </button>
              )}
              {/* 健康关注提示仅健康顾问/超管可生成，其他角色只能查看 */}
              {!editingRisk && (staff?.role === 'familyDoctor' || staff?.role === 'superadmin') && (
                <button className="btn btn-secondary btn-sm" onClick={() => handleGenerateRisk(curYear)} disabled={riskGenerating}>
                  {riskGenerating ? 'AI整理中...' : hasData ? '重新整理' : '✨ 生成健康关注提示'}
                </button>
              )}
              {editingRisk && (
                <>
                  <button className="btn btn-primary btn-sm" onClick={() => handleSaveRisk(curYear)} disabled={riskSaving}>
                    {riskSaving ? '保存中...' : '保存修改'}
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setEditingRisk(false); setRiskForm(null) }}>取消</button>
                </>
              )}
            </div>

            {!hasData && (
              <div className="card" style={{ padding: 32, textAlign: 'center', color: '#8AA89C', fontSize: 14 }}>
                {curYear} 年度暂无健康关注提示。点击右上角生成后，系统仅整理心血管、血糖、肿瘤筛查和肾功能相关资料并标注关注程度，不作疾病诊断或患病概率判断。
              </div>
            )}

            {/* ── 编辑态：可修改各维度等级/因子/建议 + 整体概述 ── */}
            {hasData && editingRisk && riskForm && (
              <>
                <div className="card" style={{ marginBottom: 14, padding: '14px 20px' }}>
                  <label className="form-label">整体信息概述</label>
                  <textarea className="form-input" rows={2} value={riskForm.overallSummary}
                    onChange={e => setRiskForm(f => ({ ...f, overallSummary: e.target.value }))}
                    placeholder="整体关注信息概述..." />
                  <div style={{ fontSize: 11, color: '#8AA89C', marginTop: 6 }}>整体关注程度会根据各维度中的最高等级自动重算，不代表疾病概率。</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  {riskForm.dimensions.map((d, i) => (
                    <div key={d.key || i} className="card" style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: '#1A2B24', flex: 1 }}>{d.label}</span>
                        <select className="form-input" style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }}
                          value={d.level}
                          onChange={e => setRiskForm(f => { const nd = [...f.dimensions]; nd[i] = { ...nd[i], level: e.target.value }; return { ...f, dimensions: nd } })}>
                          <option value="low">低风险</option>
                          <option value="medium">中风险</option>
                          <option value="high">高风险</option>
                          <option value="critical">危急值</option>
                        </select>
                      </div>
                      <label className="form-label" style={{ fontSize: 12 }}>风险因素（每行一条）</label>
                      <textarea className="form-input" rows={3} value={d.factorsText}
                        onChange={e => setRiskForm(f => { const nd = [...f.dimensions]; nd[i] = { ...nd[i], factorsText: e.target.value }; return { ...f, dimensions: nd } })}
                        placeholder="每行一条风险因素..." style={{ fontSize: 12, marginBottom: 8 }} />
                      <label className="form-label" style={{ fontSize: 12 }}>建议</label>
                      <textarea className="form-input" rows={2} value={d.advice || ''}
                        onChange={e => setRiskForm(f => { const nd = [...f.dimensions]; nd[i] = { ...nd[i], advice: e.target.value }; return { ...f, dimensions: nd } })}
                        placeholder="干预建议..." style={{ fontSize: 12 }} />
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ── 只读态 ── */}
            {hasData && !editingRisk && (
              <>
                {/* 整体风险 */}
                <div className="card" style={{ marginBottom: 14, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#1A2B24' }}>整体风险等级</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: overall.color, background: overall.bg, borderRadius: 6, padding: '3px 12px' }}>{overall.label}</span>
                  {ra.overallSummary && <span style={{ fontSize: 13, color: '#4A6558', flex: 1 }}>{ra.overallSummary}</span>}
                </div>
                {/* 各维度 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  {dims.map((d, i) => {
                    const lv = lvOf(d.level)
                    return (
                      <div key={d.key || i} className="card" style={{ padding: 0, overflow: 'hidden', borderLeft: `4px solid ${lv.dot}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px 10px', borderBottom: '1px solid #F0EDE7' }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: '#1A2B24', flex: 1 }}>{d.label}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: lv.color, background: lv.bg, borderRadius: 6, padding: '2px 10px' }}>{lv.label}</span>
                          {typeof d.score === 'number' && <span style={{ fontSize: 12, color: '#8AA89C' }}>{d.score}分</span>}
                        </div>
                        <div style={{ padding: '10px 16px 14px' }}>
                          {Array.isArray(d.factors) && d.factors.length > 0 && (
                            <div style={{ marginBottom: 8 }}>
                              {d.factors.map((f, j) => (
                                <div key={j} style={{ fontSize: 12, color: '#4A6558', marginBottom: 3 }}>· {f}</div>
                              ))}
                            </div>
                          )}
                          {d.advice && <div style={{ fontSize: 12, color: '#1E6B50', background: '#E8F5EF', borderRadius: 6, padding: '6px 10px' }}>建议：{d.advice}</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div style={{ fontSize: 11, color: '#B0B8B3', marginTop: 12 }}>本评估由 AI 结合规则引擎生成，仅供医护参考，需健康顾问审核后生效。</div>
              </>
            )}

            {/* ── 团队讨论区（对评估有疑问可留言，并可让AI结合评估结论回应）── */}
            {hasData && !editingRisk && (() => {
              const discussions = Array.isArray(ra.discussions) ? ra.discussions : []
              return (
                <div className="card" style={{ marginTop: 16, padding: '14px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: '#1A2B24', flex: 1 }}>💬 团队讨论 / 向AI提问</span>
                    {discussions.length > 0 && (
                      <button className="btn btn-secondary btn-sm" onClick={() => handleRiskAiReply(curYear)} disabled={riskAiReplying}>
                        {riskAiReplying ? 'AI思考中…' : '✨ 让AI回应'}
                      </button>
                    )}
                  </div>
                  {discussions.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#8AA89C', marginBottom: 12 }}>对本次风险评估有疑问？在下方留言，或留言后点「让AI回应」，AI 会结合评估结论为您解答。</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                      {discussions.map((m, i) => (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2,
                          background: m.isAI ? '#EEF6FF' : '#F7F5F0', borderRadius: 8, padding: '8px 12px',
                          borderLeft: `3px solid ${m.isAI ? '#0077B6' : '#1E6B50'}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: m.isAI ? '#0077B6' : '#1E6B50' }}>
                              {m.isAI ? '🤖 AI助手' : m.staffName}{m.staffRole ? `（${m.staffRole}）` : ''}
                            </span>
                            <span style={{ fontSize: 11, color: '#aaa' }}>{new Date(m.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            {(m.isAI || String(m.staffId) === String(staff?._id) || staff?.role === 'superadmin') && (
                              <button style={{ marginLeft: 'auto', fontSize: 11, color: '#c00', background: 'none', border: 'none', cursor: 'pointer' }}
                                onClick={() => handleRiskDiscDelete(i, curYear)}>撤回</button>
                            )}
                          </div>
                          <div style={{ fontSize: 13, color: '#1A2B24', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{m.content}</div>
                          {Array.isArray(m.images) && m.images.length > 0 && (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                              {m.images.map((img, ii) => {
                                const src = img.startsWith('/') ? API_ORIGIN + img : img
                                return (
                                  <img key={ii} src={src} alt="留言图片" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, cursor: 'zoom-in', border: '1px solid #E0D9CE' }}
                                    onClick={() => setPreviewImageUrl(src)} />
                                )
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {riskDiscImages.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                      {riskDiscImages.map((img, ii) => {
                        const src = img.startsWith('/') ? API_ORIGIN + img : img
                        return (
                          <div key={ii} style={{ position: 'relative' }}>
                            <img src={src} alt="待发送图片" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid #E0D9CE' }} />
                            <span onClick={() => setRiskDiscImages(prev => prev.filter((_, x) => x !== ii))}
                              style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: '#DC3545', color: '#fff', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>✕</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <textarea className="form-input" rows={2} value={riskDiscInput}
                      onChange={e => setRiskDiscInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleRiskDiscSend(curYear) } }}
                      placeholder="输入对风险评估的疑问或补充，Enter 发送，Shift+Enter 换行...（如某检查AI认为没做，实际已做，可截图说明）"
                      style={{ flex: 1, resize: 'none', fontSize: 13 }} />
                    <label className="btn btn-secondary" style={{ cursor: riskDiscImgUploading ? 'not-allowed' : 'pointer', opacity: riskDiscImgUploading ? 0.6 : 1 }}>
                      {riskDiscImgUploading ? '上传中...' : '📷'}
                      <input type="file" accept="image/*" style={{ display: 'none' }} disabled={riskDiscImgUploading} onChange={handleRiskDiscPickImage} />
                    </label>
                    <button className="btn btn-primary" onClick={() => handleRiskDiscSend(curYear)} disabled={riskDiscBusy || (!riskDiscInput.trim() && riskDiscImages.length === 0)}>
                      {riskDiscBusy ? '…' : '发送'}
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>
        )
      })()}

      {/* ── Medications Tab ── */}
      {tab === 'medications' && (
        <div>
          {/* 子 tab 切换 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {[{ key: 'med', label: '💊 用药信息管理' }, { key: 'sup', label: '🥗 营养补充信息管理' }].map(t => (
              <button key={t.key}
                className={`btn btn-sm ${medSubTab === t.key ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setMedSubTab(t.key)}>{t.label}</button>
            ))}
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              {false && medSubTab === 'sup' && (
                <button className="btn btn-secondary btn-sm" disabled={aiSupGenerating}
                  onClick={generateAISupplement}>
                  {aiSupGenerating ? 'AI生成中…' : '✨ AI营养素建议（已停用）'}
                </button>
              )}
              <button className="btn btn-primary btn-sm"
                onClick={() => { if (medSubTab === 'med') { setMedForm({ name:'', brandName:'', specification:'', dosage:'', method:'口服', frequency:'每日1次', timing:'', startDate:'', endDate:'', purpose:'', note:'' }); setEditingMed(null); setShowMedModal(true) } else { setSupForm({ name:'', brand:'', specification:'', dosage:'', method:'随餐', frequency:'每日1次', startDate:'', endDate:'', purpose:'', note:'' }); setEditingSup(null); setEditingSupAiApprove(false); setShowSupModal(true) } }}>
                ＋ 新增{medSubTab === 'med' ? '药物' : '营养素'}
              </button>
            </div>
          </div>

          {medSubTab === 'med' && (() => {
            const pendingMeds = medications.filter(m => m.aiStatus === 'pending')
            const activeMeds = medications.filter(m => m.aiStatus !== 'pending')
            const canApproveMed = staff?.role === 'familyDoctor' || staff?.role === 'superadmin'
            return (
            <>
            {pendingMeds.length > 0 && (
              <div className="card" style={{ marginBottom: 12, border: '1.5px solid #0077B6' }}>
                <div className="card-header" style={{ background: '#EFF8FF', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>💊</span>
                  <span className="card-title" style={{ color: '#0077B6' }}>用药信息待核对·需健康顾问确认资料一致性</span>
                  <span style={{ background: '#0077B615', color: '#0077B6', fontSize: 11, fontWeight: 700, borderRadius: 99, padding: '1px 8px' }}>{pendingMeds.length}</span>
                </div>
                <table className="table" style={{ marginBottom: 0 }}>
                  <thead><tr><th>药品名称</th><th>剂量</th><th>用法/频次</th><th>服用目的</th><th>录入人</th><th>操作</th></tr></thead>
                  <tbody>
                    {pendingMeds.map(m => (
                      <tr key={m._id} style={{ background: '#F5FBFF' }}>
                        <td style={{ fontWeight: 600 }}>{m.name}{m.brandName ? <span style={{ fontSize: 11, color: '#8AA89C', marginLeft: 4 }}>({m.brandName})</span> : ''}</td>
                        <td>{m.dosage}</td>
                        <td style={{ fontSize: 12 }}>{m.method} · {m.frequency}{m.timing ? ` · ${m.timing}` : ''}</td>
                        <td style={{ fontSize: 12, color: '#4A6558' }}>{m.purpose || '-'}</td>
                        <td style={{ fontSize: 12, color: '#8AA89C' }}>{m.createdByName || '-'}</td>
                        <td>
                          {canApproveMed ? (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-sm" style={{ background: '#0077B6', color: '#fff' }} onClick={() => reviewMedication(m._id, 'approve')}>确认一致</button>
                              <button className="btn btn-secondary btn-sm" onClick={() => {
                                setMedForm({ name: m.name, brandName: m.brandName || '', specification: m.specification || '', dosage: m.dosage, method: m.method || '口服', frequency: m.frequency, timing: m.timing || '', startDate: m.startDate || '', endDate: m.endDate || '', purpose: m.purpose || '', note: m.note || '' })
                                setEditingMed(m._id); setShowMedModal(true)
                              }}>编辑</button>
                              <button className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc' }}
                                onClick={() => { if (window.confirm('确认退回并删除这条待核对记录？')) reviewMedication(m._id, 'reject') }}>退回订正</button>
                            </div>
                          ) : (staff?._id && String(m.staffId) === String(staff._id)) ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 12, color: '#8AA89C' }}>等待健康顾问核对信息</span>
                              <button className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc' }}
                                onClick={() => { if (window.confirm('确认撤回这条你提交的待核对记录？')) reviewMedication(m._id, 'withdraw') }}>撤回</button>
                            </div>
                          ) : <span style={{ fontSize: 12, color: '#8AA89C' }}>等待健康顾问核对信息</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="card" style={{ padding: 0 }}>
              {activeMeds.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无用药记录</div>
              ) : (
                <table className="table">
                  <thead><tr><th>药品名称（化学名）</th><th>商品名</th><th>规格</th><th>剂量</th><th>用法/频次</th><th>服用目的</th><th>停用原因</th><th>开始日期</th><th>录入/审核</th><th>状态</th><th>操作</th></tr></thead>
                  <tbody>
                    {activeMeds.map(m => (
                      <tr key={m._id}>
                        <td style={{ fontWeight: 600 }}>{m.name}</td>
                        <td style={{ color: '#666' }}>{m.brandName || '-'}</td>
                        <td>{m.specification || '-'}</td>
                        <td>{m.dosage}</td>
                        <td style={{ fontSize: 12 }}>{m.method} · {m.frequency}{m.timing ? ` · ${m.timing}` : ''}</td>
                        <td style={{ fontSize: 12, color: '#4A6558' }}>{m.purpose || m.note || '-'}</td>
                        <td style={{ fontSize: 12, color: m.stopped ? '#8A5A44' : '#aaa' }}>{m.stopReason || '-'}</td>
                        <td style={{ fontSize: 12, color: '#8AA89C' }}>{m.startDate || '-'}{m.endDate ? ` → ${m.endDate}` : ''}</td>
                        <td style={{ fontSize: 11, color: '#8AA89C' }}>
                          {m.createdByName ? <div>录入：{m.createdByName}</div> : null}
                          {m.reviewedByName ? <div>核对：{m.reviewedByName}</div> : null}
                          {!m.createdByName && !m.reviewedByName ? '-' : null}
                        </td>
                        <td>
                          <span style={{ fontSize: 12, fontWeight: 600, color: m.stopped ? '#aaa' : '#22A06B' }}>
                            {m.stopped ? '已停用' : '服用中'}
                          </span>
                          {m.reminder?.enabled && <div style={{ marginTop: 4, fontSize: 11, color: '#7C3AED', fontWeight: 600 }}>✨ 每{m.reminder.intervalDays}天提醒</div>}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {!m.stopped && <button className="btn btn-secondary btn-sm" onClick={() => {
                              setMedForm({ name: m.name, brandName: m.brandName || '', specification: m.specification || '', dosage: m.dosage, method: m.method || '口服', frequency: m.frequency, timing: m.timing || '', startDate: m.startDate || '', endDate: m.endDate || '', purpose: m.purpose || '', note: m.note || '' })
                              setEditingMed(m._id); setShowMedModal(true)
                            }}>编辑</button>}
                            {!m.stopped && <button className="btn btn-sm" style={{ background: '#F3EEFF', color: '#7C3AED', border: '1px solid #C4B5FD' }} onClick={() => {
                              const today = new Date().toISOString().slice(0, 10)
                              setReminderMed(m)
                              setReminderForm({
                                intervalDays: m.reminder?.intervalDays || 30,
                                startDate: m.reminder?.startDate || today,
                                endDate: m.reminder?.endDate || m.endDate || '',
                                remindTime: m.reminder?.remindTime || '09:00',
                                note: m.reminder?.note || '',
                              })
                            }}>✨ AI用药提醒</button>}
                            {!m.stopped && <button className="btn btn-sm" style={{ background: '#fff8e1', color: '#D97706', border: '1px solid #D97706' }}
                                onClick={() => setStoppingMed(m)}>
                                标记已停止使用
                              </button>}
                            <button className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc' }}
                              onClick={async () => {
                                if (!window.confirm(`确认删除「${m.name}」？此操作不可恢复，仅用于订正录入错误；如客户已按医嘱停用，请使用“标记已停止使用”。`)) return
                                try { await staffAPI.deletePatientMedication(id, m._id); loadMedications() }
                                catch (err) { toast(err.message || '删除失败') }
                              }}>
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            </>
            )
          })()}

          {medSubTab === 'sup' && (() => {
            const pendingSups = supplements.filter(s => s.aiStatus === 'pending')
            const activeSups = supplements.filter(s => s.aiStatus !== 'pending')
            const canApprove = staff?.role === 'nutritionist' || staff?.role === 'superadmin'
            return (
            <>
            {pendingSups.length > 0 && (
              <div className="card" style={{ marginBottom: 12, border: '1.5px solid #16A34A' }}>
                <div className="card-header" style={{ background: '#F0FDF4', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>🧪</span>
                  <span className="card-title" style={{ color: '#16A34A' }}>营养补充信息待核对·需营养师确认资料一致性</span>
                  <span style={{ background: '#16A34A15', color: '#16A34A', fontSize: 11, fontWeight: 700, borderRadius: 99, padding: '1px 8px' }}>{pendingSups.length}</span>
                </div>
                <table className="table" style={{ marginBottom: 0 }}>
                  <thead><tr><th>营养素名称</th><th>剂量</th><th>用法/频次</th><th>补充目的</th><th>录入人</th><th>操作</th></tr></thead>
                  <tbody>
                    {pendingSups.map(s => {
                      const isGenerator = staff?._id && String(s.staffId) === String(staff._id)
                      return (
                      <tr key={s._id} style={{ background: '#F0FFF4' }}>
                        <td style={{ fontWeight: 600 }}>{s.name}{s.brand ? <span style={{ fontSize: 11, color: '#8AA89C', marginLeft: 4 }}>({s.brand})</span> : ''}</td>
                        <td>{s.dosage}</td>
                        <td style={{ fontSize: 12 }}>{s.method} · {s.frequency}</td>
                        <td style={{ fontSize: 12, color: '#4A6558' }}>{s.purpose || '-'}</td>
                        <td style={{ fontSize: 12, color: '#8AA89C' }}>{s.createdByName || s.aiGeneratedBy || 'AI'}</td>
                        <td>
                          {canApprove ? (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-sm" style={{ background: '#16A34A', color: '#fff' }} onClick={() => reviewAISupplement(s._id, 'approve')}>采纳</button>
                              <button className="btn btn-secondary btn-sm" onClick={() => {
                                setSupForm({ name: s.name, brand: s.brand || '', specification: s.specification || '', dosage: s.dosage, method: s.method || '随餐', frequency: s.frequency, startDate: s.startDate || '', endDate: s.endDate || '', purpose: s.purpose || '', note: s.note || '' })
                                setEditingSup(s._id); setEditingSupAiApprove(true); setShowSupModal(true)
                              }}>编辑后采纳</button>
                              <button className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc' }} onClick={() => reviewAISupplement(s._id, 'reject')}>拒绝</button>
                            </div>
                          ) : isGenerator ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 12, color: '#8AA89C' }}>等待营养师审核</span>
                              <button className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc' }}
                                onClick={() => { if (window.confirm('确认撤回这条由你生成的AI营养素建议？')) reviewAISupplement(s._id, 'withdraw') }}>撤回</button>
                            </div>
                          ) : <span style={{ fontSize: 12, color: '#8AA89C' }}>等待营养师审核</span>}
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="card" style={{ padding: 0 }}>
              {activeSups.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无营养素记录</div>
              ) : (
                <table className="table">
                  <thead><tr><th>营养素名称</th><th>品牌</th><th>规格</th><th>剂量</th><th>用法/频次</th><th>补充目的</th><th>停用原因</th><th>开始日期</th><th>录入/审核</th><th>状态</th><th>操作</th></tr></thead>
                  <tbody>
                    {activeSups.map(s => (
                      <tr key={s._id}>
                        <td style={{ fontWeight: 600 }}>{s.name}</td>
                        <td style={{ color: '#666' }}>{s.brand || '-'}</td>
                        <td>{s.specification || '-'}</td>
                        <td>{s.dosage}</td>
                        <td style={{ fontSize: 12 }}>{s.method} · {s.frequency}</td>
                        <td style={{ fontSize: 12, color: '#4A6558' }}>{s.purpose || s.note || '-'}</td>
                        <td style={{ fontSize: 12, color: s.stopped ? '#8A5A44' : '#aaa' }}>{s.stopReason || '-'}</td>
                        <td style={{ fontSize: 12, color: '#8AA89C' }}>{s.startDate || '-'}{s.endDate ? ` → ${s.endDate}` : ''}</td>
                        <td style={{ fontSize: 11, color: '#8AA89C' }}>
                          {s.createdByName ? <div>录入：{s.createdByName}</div> : null}
                          {s.reviewedByName ? <div>审核：{s.reviewedByName}</div> : null}
                          {!s.createdByName && !s.reviewedByName ? '-' : null}
                        </td>
                        <td>
                          <span style={{ fontSize: 12, fontWeight: 600, color: s.stopped ? '#aaa' : '#22A06B' }}>
                            {s.stopped ? '已停用' : '补充中'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {!s.stopped && <button className="btn btn-secondary btn-sm" onClick={() => {
                              setSupForm({ name: s.name, brand: s.brand || '', specification: s.specification || '', dosage: s.dosage, method: s.method || '随餐', frequency: s.frequency, startDate: s.startDate || '', endDate: s.endDate || '', purpose: s.purpose || '', note: s.note || '' })
                              setEditingSup(s._id); setEditingSupAiApprove(false); setShowSupModal(true)
                            }}>编辑</button>}
                            {!s.stopped && <button className="btn btn-sm" style={{ background: '#fff8e1', color: '#D97706', border: '1px solid #D97706' }}
                                  onClick={() => setStoppingSup(s)}>
                                  停用
                                </button>}
                            <button className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc' }}
                              onClick={async () => {
                                if (!window.confirm(`确认删除「${s.name}」？此操作不可恢复，仅用于订正录入错误；如客户实际已停用请用"停用"。`)) return
                                try { await staffAPI.deletePatientSupplement(id, s._id); loadSupplements() }
                                catch (err) { toast(err.message || '删除失败') }
                              }}>
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            </>
            )
          })()}

          {/* 新增/编辑药物弹窗：表单字段多，鼠标移出边界误触遮罩会丢失编辑，去掉点遮罩关闭 */}
          {showMedModal && (
            <div className="modal-overlay">
              <div className="modal" style={{ maxWidth: 560 }}>
                <div className="modal-header">
                  <h3 className="modal-title">{editingMed ? '编辑药物' : '新增药物'}</h3>
                  <button className="modal-close" onClick={() => setShowMedModal(false)}>✕</button>
                </div>
                <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[
                    { k: 'name', label: '药品化学名 *', full: false, placeholder: '如：苯磺酸氨氯地平' },
                    { k: 'brandName', label: '商品名', full: false, placeholder: '如：络活喜' },
                    { k: 'specification', label: '规格', full: false, placeholder: '如：5mg×30片/盒' },
                    { k: 'dosage', label: '剂量 *', full: false, placeholder: '如：5mg' },
                    { k: 'method', label: '用药方式', full: false, placeholder: '如：口服' },
                    { k: 'frequency', label: '频次 *', full: false, placeholder: '如：每日1次' },
                    { k: 'timing', label: '服药时机', full: false, placeholder: '如：早饭后' },
                    { k: 'startDate', label: '开始日期', full: false, type: 'date' },
                    { k: 'endDate', label: '计划结束日期', full: false, type: 'date' },
                    { k: 'purpose', label: '用药目的', full: true, placeholder: '如：控制血压' },
                    { k: 'note', label: '备注', full: true, placeholder: '注意事项' },
                  ].map(({ k, label, full, placeholder, type }) => (
                    <div key={k} className="form-group" style={{ gridColumn: full ? '1/-1' : 'auto', marginBottom: 0 }}>
                      <label className="form-label">{label}</label>
                      <input className="form-input" type={type || 'text'} placeholder={placeholder} value={medForm[k] || ''}
                        onChange={e => setMedForm(f => ({ ...f, [k]: e.target.value }))} />
                    </div>
                  ))}
                </div>
                <div className="modal-footer">
                  <button className="btn btn-ghost" onClick={() => setShowMedModal(false)}>取消</button>
                  <button className="btn btn-primary" disabled={medSaving} onClick={async () => {
                    if (!medForm.name || !medForm.dosage || !medForm.frequency) { toast('请填写必填项'); return }
                    setMedSaving(true)
                    try {
                      const needReview = !editingMed && (staff?.role === 'healthManager' || staff?.role === 'medicalAssistant')
                      if (editingMed) await staffAPI.updatePatientMedication(id, editingMed, medForm)
                      else await staffAPI.createPatientMedication(id, medForm)
                      setShowMedModal(false); loadMedications()
                      toast(editingMed ? '已保存' : needReview ? '已提交，待健康顾问审核' : '添加成功')
                    } catch (err) { toast(err.message) }
                    finally { setMedSaving(false) }
                  }}>{medSaving ? '保存中...' : '保存'}</button>
                </div>
              </div>
            </div>
          )}

          {/* 新增/编辑营养素弹窗：表单字段多，鼠标移出边界误触遮罩会丢失编辑，去掉点遮罩关闭 */}
          {showSupModal && (
            <div className="modal-overlay">
              <div className="modal" style={{ maxWidth: 560 }}>
                <div className="modal-header">
                  <h3 className="modal-title">{editingSupAiApprove ? '核对遗留营养补充信息' : editingSup ? '编辑营养补充记录' : '新增营养补充记录'}</h3>
                  <button className="modal-close" onClick={() => { setShowSupModal(false); setEditingSupAiApprove(false) }}>✕</button>
                </div>
                <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[
                    { k: 'name', label: '营养素名称 *', full: false, placeholder: '如：维生素C' },
                    { k: 'brand', label: '品牌', full: false, placeholder: '如：汤臣倍健' },
                    { k: 'specification', label: '规格', full: false, placeholder: '如：60粒/瓶' },
                    { k: 'dosage', label: '剂量 *', full: false, placeholder: '如：500mg' },
                    { k: 'method', label: '使用方式', full: false, placeholder: '如：随餐' },
                    { k: 'frequency', label: '频次 *', full: false, placeholder: '如：每日1次' },
                    { k: 'startDate', label: '开始日期', full: false, type: 'date' },
                    { k: 'endDate', label: '计划结束日期', full: false, type: 'date' },
                    { k: 'purpose', label: '补充目的', full: true, placeholder: '如：提高免疫力' },
                    { k: 'note', label: '备注', full: true, placeholder: '注意事项' },
                  ].map(({ k, label, full, placeholder, type }) => (
                    <div key={k} className="form-group" style={{ gridColumn: full ? '1/-1' : 'auto', marginBottom: 0 }}>
                      <label className="form-label">{label}</label>
                      <input className="form-input" type={type || 'text'} placeholder={placeholder} value={supForm[k] || ''}
                        onChange={e => setSupForm(f => ({ ...f, [k]: e.target.value }))} />
                    </div>
                  ))}
                </div>
                <div className="modal-footer">
                  <button className="btn btn-ghost" onClick={() => { setShowSupModal(false); setEditingSupAiApprove(false) }}>取消</button>
                  <button className="btn btn-primary" disabled={medSaving} onClick={async () => {
                    if (!supForm.name || !supForm.dosage || !supForm.frequency) { toast('请填写必填项'); return }
                    setMedSaving(true)
                    try {
                      const supNeedReview = !editingSup && !editingSupAiApprove && (staff?.role === 'healthManager' || staff?.role === 'medicalAssistant')
                      if (editingSupAiApprove) await staffAPI.updatePatientSupplement(id, editingSup, { ...supForm, aiStatus: 'approved' })
                      else if (editingSup) await staffAPI.updatePatientSupplement(id, editingSup, supForm)
                      else await staffAPI.createPatientSupplement(id, supForm)
                      setShowSupModal(false); setEditingSupAiApprove(false); loadSupplements()
                      toast(editingSupAiApprove ? '已采纳并生效' : editingSup ? '已保存' : supNeedReview ? '已提交，待营养师审核' : '添加成功')
                    } catch (err) { toast(err.message) }
                    finally { setMedSaving(false) }
                  }}>{medSaving ? '保存中...' : editingSupAiApprove ? '保存并采纳' : '保存'}</button>
                </div>
              </div>
            </div>
          )}
          {stoppingMed && (
            <ConfirmStopModal
              title="停用用药"
              itemName={stoppingMed.name}
              onClose={() => setStoppingMed(null)}
              onConfirm={async (stopReason) => {
                try {
                  await staffAPI.updatePatientMedication(id, stoppingMed._id, { stopped: true, stopReason })
                  setStoppingMed(null); loadMedications()
                } catch (err) { toast(err.message || '停用失败') }
              }}
            />
          )}
          {reminderMed && (
            <div className="modal-overlay">
              <div className="modal" style={{ maxWidth: 520 }}>
                <div className="modal-header">
                  <div><h3 className="modal-title">✨ AI用药提醒</h3><div style={{ fontSize: 12, color: '#8AA89C', marginTop: 3 }}>{reminderMed.name} · 自动生成客户与健管专员的随访计划</div></div>
                  <button className="modal-close" onClick={() => setReminderMed(null)}>×</button>
                </div>
                <div className="modal-body">
                  <div style={{ padding: 12, marginBottom: 16, borderRadius: 8, background: '#F5F3FF', color: '#6D28D9', fontSize: 13 }}>
                    系统会按周期生成“服药情况、不适反应、续药需求”随访。提醒只用于健康管理，不替代医生处方或停药医嘱。
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group"><label className="form-label">提醒周期</label><select className="form-input" value={reminderForm.intervalDays} onChange={e => setReminderForm(f => ({ ...f, intervalDays: Number(e.target.value) }))}><option value={1}>每天</option><option value={3}>每3天</option><option value={7}>每周</option><option value={14}>每2周</option><option value={30}>每月</option><option value={90}>每3个月</option></select></div>
                    <div className="form-group"><label className="form-label">提醒时间</label><input className="form-input" type="time" value={reminderForm.remindTime} onChange={e => setReminderForm(f => ({ ...f, remindTime: e.target.value }))} /></div>
                    <div className="form-group"><label className="form-label">开始日期</label><input className="form-input" type="date" value={reminderForm.startDate} onChange={e => setReminderForm(f => ({ ...f, startDate: e.target.value }))} /></div>
                    <div className="form-group"><label className="form-label">结束日期（不填则生成未来一年）</label><input className="form-input" type="date" value={reminderForm.endDate} onChange={e => setReminderForm(f => ({ ...f, endDate: e.target.value }))} /></div>
                    <div className="form-group" style={{ gridColumn: '1/-1' }}><label className="form-label">提醒备注</label><textarea className="form-input" rows={3} placeholder="如：重点询问头晕、水肿等不适" value={reminderForm.note} onChange={e => setReminderForm(f => ({ ...f, note: e.target.value }))} /></div>
                  </div>
                </div>
                <div className="modal-footer">
                  {reminderMed.reminder?.enabled && <button className="btn btn-secondary" style={{ color: '#DC3545' }} disabled={reminderSaving} onClick={async () => { setReminderSaving(true); try { await staffAPI.setMedicationReminder(id, reminderMed._id, { ...reminderForm, enabled: false }); toast('已关闭提醒，未来未完成计划已取消'); setReminderMed(null); loadMedications() } catch (err) { toast(err.message) } finally { setReminderSaving(false) } }}>关闭提醒</button>}
                  <button className="btn btn-ghost" onClick={() => setReminderMed(null)}>取消</button>
                  <button className="btn btn-primary" disabled={reminderSaving || !reminderForm.startDate} onClick={async () => { setReminderSaving(true); try { const r = await staffAPI.setMedicationReminder(id, reminderMed._id, { ...reminderForm, enabled: true }); toast(r.message || '提醒已设置'); setReminderMed(null); loadMedications() } catch (err) { toast(err.message) } finally { setReminderSaving(false) } }}>{reminderSaving ? '生成中...' : '生成随访计划'}</button>
                </div>
              </div>
            </div>
          )}
          {stoppingSup && (
            <ConfirmStopModal
              title="停用营养素"
              itemName={stoppingSup.name}
              onClose={() => setStoppingSup(null)}
              onConfirm={async (stopReason) => {
                try {
                  await staffAPI.updatePatientSupplement(id, stoppingSup._id, { stopped: true, stopReason })
                  setStoppingSup(null); loadSupplements()
                } catch (err) { toast(err.message || '停用失败') }
              }}
            />
          )}
        </div>
      )}

      {/* ── Plans Tab ── */}
      {tab === 'plans' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="card-title">管理方案</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {/* 2026-07-07 用户明确规则：AI营养方案只有营养师能生成；AI体检方案/年度管理方案
                  只有健康顾问能生成（营养师能查看这些方案内容，但不该有生成入口） */}
              {['nutritionist', 'superadmin'].includes(staff?.role) && (
                <button className="btn btn-secondary btn-sm" onClick={() => setShowSelectTplModal('nutrition')}>
                  ✨ AI营养方案
                </button>
              )}
              {['familyDoctor', 'superadmin'].includes(staff?.role) && (
                <button className="btn btn-secondary btn-sm" onClick={() => setShowSelectTplModal('annual_checkup')}>
                  ✨ AI体检方案
                </button>
              )}
              {['healthPlanner', 'superadmin'].includes(staff?.role) && (
                <button className="btn btn-secondary btn-sm" disabled={aiMedicalAssistGenerating}
                  onClick={() => { setPendingMedicalAssistOrderId(''); setShowSelectTplModal('medical_assist') }}>
                  {aiMedicalAssistGenerating ? '生成中…' : '✨ AI就医协助方案'}
                </button>
              )}
              {['familyDoctor', 'superadmin'].includes(staff?.role) && (
                <button className="btn btn-secondary btn-sm" onClick={() => nav(`/patients/${id}/annual-health`)}>
                  ✨ AI年度管理方案
                </button>
              )}
            </div>
          </div>
          {plans.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无管理方案</div>
          ) : (
            <table className="table">
              <thead><tr><th>方案名称</th><th>类型</th><th>状态</th><th>已阅</th><th>已确认</th><th>项目数</th><th>完成</th><th>负责人</th><th>创建时间</th></tr></thead>
              <tbody>
                {plans.map(p => {
                  const done = p.items?.filter(i => i.status === 'completed').length || 0
                  const total = p.items?.length || 0
                  return (
                    <tr key={p._id} style={{ cursor: 'pointer' }}
                      onClick={() => p.isAnnualPlan ? nav(`/patients/${id}/annual-health`)
                        : ['nutrition', 'medical_assist'].includes(p.type) ? nav(`/plans/${p._id}/modules`)
                          : nav(`/plans/${p._id}`)}>
                      <td style={{ fontWeight: 500, color: '#1E6B50' }}>
                        {p.title}
                        {p.isAnnualPlan && <span style={{ marginLeft: 6, fontSize: 11, color: '#1E6B50', background: '#E8F5EF', padding: '1px 6px', borderRadius: 4 }}>年度</span>}
                        {/* 就医协助按模板细分服务类型，同一会员多次生成时标题常年雷同，加模板名标签区分
                            （2026-07-13 反馈"名称都一样"，与全局方案列表页/客户端保持同一套标签逻辑） */}
                        {p.type === 'medical_assist' && p.content?.templateName && (
                          <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 600, color: '#7C3AED', background: '#F2EEFF', borderRadius: 4, padding: '1px 6px' }}>
                            {p.content.templateName}
                          </span>
                        )}
                      </td>
                      <td><span className="badge badge-info">{PLAN_TYPE_LABEL[p.type] || p.type}</span></td>
                      <td><span style={{ color: PLAN_STATUS_COLOR[p.status], fontWeight: 500, fontSize: 13 }}>{PLAN_STATUS_LABEL[p.status]}</span></td>
                      <td>
                        {p.isAnnualPlan
                          ? <span style={{ fontSize: 12, color: '#8AA89C' }}>-</span>
                          : p.viewedAt
                            ? <span style={{ fontSize: 12, color: '#22A06B', fontWeight: 500 }}>✓ 已阅<br/><span style={{ color: '#aaa', fontWeight: 400 }}>{new Date(p.viewedAt).toLocaleDateString('zh-CN')}</span></span>
                            : <span style={{ fontSize: 12, color: '#D97706' }}>未查阅</span>
                        }
                      </td>
                      <td>
                        {p.confirmedAt
                          ? <span style={{ fontSize: 12, color: '#22A06B', fontWeight: 500 }}>✓ 已确认<br/><span style={{ color: '#aaa', fontWeight: 400 }}>{new Date(p.confirmedAt).toLocaleDateString('zh-CN')}</span></span>
                          : <span style={{ fontSize: 12, color: '#D97706' }}>待确认</span>
                        }
                      </td>
                      <td style={{ textAlign: 'center' }}>{total}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 60, height: 6, background: '#f0f0f0', borderRadius: 3 }}>
                            <div style={{ width: total ? `${(done/total)*100}%` : '0%', height: '100%', background: '#22A06B', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 12, color: '#666' }}>{done}/{total}</span>
                        </div>
                      </td>
                      <td style={{ fontSize: 13, color: '#666' }}>{p.staffId?.name || '-'}</td>
                      <td style={{ fontSize: 12, color: '#aaa' }}>{new Date(p.createdAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Follow-ups Tab ── */}
      {tab === 'followups' && (
        <>
        <div className="card">
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="card-title">随访记录</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => runAIHelper('followup')}>✨ AI随访建议</button>
              <button className="btn btn-secondary btn-sm" onClick={() => runAIHelper('coach')}>✨ AI教练消息</button>
              <button className="btn btn-secondary btn-sm" onClick={() => runAIHelper('content')}>✨ AI内容推荐</button>
            </div>
          </div>
          {(() => {
            // tab 划分与随访记录状态文案，均与随访管理列表页（FollowUpsPage.jsx STATUS_TABS/STATUS_MAP）保持一致：
            // 全部/待随访(planned)/随访中(in_progress+missed)/已随访(completed)/已取消(cancelled)，
            // 此前这里把"待随访"和"随访中"合并成一个"未随访"、状态文案也用的是"计划中/进行中"等另一套措辞，
            // 与随访管理页tab结构和文案不一致（2026-07-13 反馈）。
            const FOLLOWUP_LIST_STATUS_MAP = { planned: '待随访', in_progress: '随访中', missed: '随访中', completed: '已随访', cancelled: '已取消' }
            const FOLLOWUP_LIST_STATUS_COLOR = { planned: '#D97706', in_progress: '#0077B6', missed: '#0077B6', completed: '#22A06B', cancelled: '#8AA89C' }
            const PLANNED_STATUSES = ['planned']
            const IN_PROGRESS_STATUSES = ['in_progress', 'missed']
            const DONE_STATUSES = ['completed']
            const CANCELLED_STATUSES = ['cancelled']
            const filtered = followUpFilter === 'planned' ? followUps.filter(f => PLANNED_STATUSES.includes(f.status))
              : followUpFilter === 'in_progress' ? followUps.filter(f => IN_PROGRESS_STATUSES.includes(f.status))
              : followUpFilter === 'done' ? followUps.filter(f => DONE_STATUSES.includes(f.status))
              : followUpFilter === 'cancelled' ? followUps.filter(f => CANCELLED_STATUSES.includes(f.status))
              : followUps
            const plannedCount = followUps.filter(f => PLANNED_STATUSES.includes(f.status)).length
            const inProgressCount = followUps.filter(f => IN_PROGRESS_STATUSES.includes(f.status)).length
            const doneCount = followUps.filter(f => DONE_STATUSES.includes(f.status)).length
            const cancelledCount = followUps.filter(f => CANCELLED_STATUSES.includes(f.status)).length

            // 日常监测随访（sourceType=scheduled，theme形如"日常监测随访 · xxx"）按频率每天/每周生成一条占位，
            // 同一客户能连续攒出十几二十条同主题记录，把就医随访/体检提醒/订单预约等真正有意义的记录
            // 挤到分页很后面（2026-07-13 反馈：客户详情页只看到7/25之后的，7/14的记录翻不到）。
            // 这里按"主题+状态"分组折叠成一行，组内明细可展开查看，折叠行取组内最新日期用于排序，
            // 保证真实记录不再被同质占位淹没。
            const MONITOR_PREFIX = '日常监测随访 · '
            const monitorGroups = {} // key: theme+status → { theme, status, items: [] }
            const rows = [] // 最终渲染的行：{ type: 'single', item } | { type: 'group', key, theme, status, items }
            filtered.forEach(f => {
              if (f.sourceType === 'scheduled' && (f.theme || '').startsWith(MONITOR_PREFIX)) {
                const key = f.theme + '|' + f.status
                if (!monitorGroups[key]) {
                  monitorGroups[key] = { type: 'group', key, theme: f.theme, status: f.status, items: [] }
                  rows.push(monitorGroups[key])
                }
                monitorGroups[key].items.push(f)
              } else {
                rows.push({ type: 'single', item: f })
              }
            })
            // 排序方向：待随访/随访中是还没发生的未来计划，按日期从近到远（离今天最近的先处理）；
            // 已随访/已取消是历史事件，按最近发生的在前。"全部"tab混合两类，按每行自身状态各自判断方向。
            const isFutureStatus = (status) => PLANNED_STATUSES.includes(status) || IN_PROGRESS_STATUSES.includes(status)
            const rowStatus = (row) => row.type === 'group' ? row.status : row.item.status
            const rowDate = (row) => row.type === 'group'
              ? (isFutureStatus(row.status) ? Math.min(...row.items.map(i => new Date(i.date).getTime())) : Math.max(...row.items.map(i => new Date(i.date).getTime())))
              : new Date(row.item.date).getTime()
            rows.sort((a, b) => {
              const aFuture = isFutureStatus(rowStatus(a))
              const bFuture = isFutureStatus(rowStatus(b))
              const da = rowDate(a), db = rowDate(b)
              if (aFuture && bFuture) return da - db // 待随访/随访中：从近到远
              if (!aFuture && !bFuture) return db - da // 已随访/已取消：最近发生在前
              return aFuture ? -1 : 1 // 混合时（"全部"tab）：未来计划排在历史记录前面
            })

            return (
            <>
            <div style={{ display: 'flex', gap: 6, padding: '10px 16px 0' }}>
              {[
                { k: 'all', label: `全部 ${followUps.length}` },
                { k: 'planned', label: `待随访 ${plannedCount}` },
                { k: 'in_progress', label: `随访中 ${inProgressCount}` },
                { k: 'done', label: `已随访 ${doneCount}` },
                { k: 'cancelled', label: `已取消 ${cancelledCount}` },
              ].map(t => (
                <button key={t.k} className={followUpFilter === t.k ? 'btn btn-sm' : 'btn btn-secondary btn-sm'}
                  style={followUpFilter === t.k ? { background: '#1E6B50', color: '#fff' } : {}}
                  onClick={() => setFollowUpFilter(t.k)}>{t.label}</button>
              ))}
            </div>
            {filtered.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>{followUpFilter === 'all' ? '暂无随访记录' : followUpFilter === 'planned' ? '暂无待随访计划' : followUpFilter === 'in_progress' ? '暂无随访中记录' : followUpFilter === 'cancelled' ? '暂无已取消记录' : '暂无已随访记录'}</div>
            ) : (
            <table className="table">
              <thead>
                <tr><th>日期</th><th>方式</th><th>状态</th><th>随访人</th><th>随访内容</th><th>下次随访</th><th>操作</th></tr>
              </thead>
              <tbody>
                {(() => {
                  const renderRow = (f) => (
                    <tr key={f._id} style={{ cursor: 'pointer', background: f.aiStatus === 'pending' ? '#FFFBEB' : undefined }} onClick={() => setFollowUpDetail(f)}>
                      <td style={{ fontSize: 13, color: '#666' }}>{new Date(f.date).toLocaleDateString('zh-CN')}</td>
                      <td><span className="badge badge-info">{TYPE_MAP[f.type] || f.type}</span></td>
                      <td>
                        <span style={{ fontSize: 13, fontWeight: 500, color: FOLLOWUP_LIST_STATUS_COLOR[f.status] || '#666' }}>
                          {FOLLOWUP_LIST_STATUS_MAP[f.status] || f.status}
                        </span>
                        {f.aiStatus === 'pending' && (
                          <span style={{ marginLeft: 6, fontSize: 11, color: '#D97706', background: '#D9770615', padding: '1px 6px', borderRadius: 4 }}>
                            待审核{f.sourceType === 'ai_review' ? '·AI月度回顾' : f.sourceType === 'scheduled' ? '·方案排期' : ''}
                          </span>
                        )}
                        {f.status === 'completed' && f.completedBy && (
                          <span style={{ marginLeft: 6, fontSize: 11, color: f.completedBy === 'user' ? '#0077B6' : '#22A06B', background: f.completedBy === 'user' ? '#0077B615' : '#22A06B15', padding: '1px 6px', borderRadius: 4 }}>
                            {f.completedBy === 'user' ? '客户自主标记' : '健管专员执行'}
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: 13, color: '#666' }}>{f.staffId?.name || '-'}</td>
                      <td style={{ fontSize: 13, color: '#1A2B24', maxWidth: 200 }}>
                        {f.sourceType === 'order' && (
                          <div style={{ marginBottom: 2 }}>
                            <span style={{ fontSize: 11, color: '#22A06B', background: '#22A06B18', padding: '1px 6px', borderRadius: 4, marginRight: 4 }}>服务预约</span>
                            <span style={{ fontWeight: 600 }}>{f.theme}</span>
                          </div>
                        )}
                        {f.content ? (f.content.length > 60 ? f.content.slice(0, 60) + '…' : f.content) : '-'}
                      </td>
                      <td style={{ fontSize: 12, color: '#8AA89C' }}>
                        {f.nextFollowUpDate ? new Date(f.nextFollowUpDate).toLocaleDateString('zh-CN') : '-'}
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        {f.aiStatus === 'pending' ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-sm" style={{ background: '#22A06B', color: '#fff' }}
                              onClick={async () => { await staffAPI.reviewFollowUp(f._id, { action: 'approve' }); loadFollowUps() }}>通过</button>
                            <button className="btn btn-secondary btn-sm"
                              onClick={async () => { await staffAPI.reviewFollowUp(f._id, { action: 'reject' }); loadFollowUps() }}>驳回</button>
                          </div>
                        ) : f.sourceType === 'order' ? (
                          // 商城服务订单：核心动作是"选执行人转派"，不是自己执行，主按钮走详情→编辑(assignedTo)
                          <button className="btn btn-sm" onClick={() => setFollowUpDetail(f)}>查看/转派</button>
                        ) : ['planned', 'in_progress', 'missed'].includes(f.status) ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-sm" onClick={() => openExec(f)}>执行随访</button>
                            <button className="btn btn-secondary btn-sm" onClick={() => setFollowUpDetail(f)}>详情</button>
                          </div>
                        ) : (
                          <button className="btn btn-secondary btn-sm" onClick={() => setFollowUpDetail(f)}>查看详情</button>
                        )}
                      </td>
                    </tr>
                  )
                  return rows.map(row => {
                    if (row.type === 'single') return renderRow(row.item)
                    const expanded = !!expandedMonitorGroups[row.key]
                    const sortedItems = [...row.items].sort((a, b) =>
                      isFutureStatus(row.status) ? new Date(a.date) - new Date(b.date) : new Date(b.date) - new Date(a.date))
                    const nearest = sortedItems[0]
                    return (
                      <React.Fragment key={row.key}>
                        <tr style={{ cursor: 'pointer', background: '#F7F5F0' }}
                          onClick={() => setExpandedMonitorGroups(s => ({ ...s, [row.key]: !s[row.key] }))}>
                          <td style={{ fontSize: 13, color: '#666' }}>{new Date(nearest.date).toLocaleDateString('zh-CN')}{row.items.length > 1 ? ' 起' : ''}</td>
                          <td><span className="badge badge-info">{TYPE_MAP[nearest.type] || nearest.type}</span></td>
                          <td>
                            <span style={{ fontSize: 13, fontWeight: 500, color: FOLLOWUP_LIST_STATUS_COLOR[row.status] || '#666' }}>
                              {FOLLOWUP_LIST_STATUS_MAP[row.status] || row.status}
                            </span>
                          </td>
                          <td style={{ fontSize: 13, color: '#666' }}>{nearest.staffId?.name || '-'}</td>
                          <td style={{ fontSize: 13, color: '#1A2B24' }} colSpan={2}>
                            <span style={{ fontWeight: 600 }}>{row.theme.replace(MONITOR_PREFIX, '')}</span>
                            <span style={{ marginLeft: 6, fontSize: 12, color: '#8AA89C' }}>× {row.items.length}条{expanded ? ' ▲' : ' ▼'}</span>
                          </td>
                          <td />
                        </tr>
                        {expanded && sortedItems.map(f => (
                          <tr key={f._id} style={{ cursor: 'pointer', background: '#FCFBF8' }} onClick={() => setFollowUpDetail(f)}>
                            <td style={{ fontSize: 12, color: '#999', paddingLeft: 28 }}>{new Date(f.date).toLocaleDateString('zh-CN')}</td>
                            <td><span className="badge badge-info">{TYPE_MAP[f.type] || f.type}</span></td>
                            <td>
                              <span style={{ fontSize: 12, color: FOLLOWUP_LIST_STATUS_COLOR[f.status] || '#666' }}>
                                {FOLLOWUP_LIST_STATUS_MAP[f.status] || f.status}
                              </span>
                            </td>
                            <td style={{ fontSize: 12, color: '#666' }}>{f.staffId?.name || '-'}</td>
                            <td style={{ fontSize: 12, color: '#8AA89C', maxWidth: 200 }}>{f.content ? (f.content.length > 40 ? f.content.slice(0, 40) + '…' : f.content) : '-'}</td>
                            <td style={{ fontSize: 12, color: '#8AA89C' }}>{f.nextFollowUpDate ? new Date(f.nextFollowUpDate).toLocaleDateString('zh-CN') : '-'}</td>
                            <td onClick={e => e.stopPropagation()}>
                              {['planned', 'in_progress', 'missed'].includes(f.status) ? (
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button className="btn btn-sm" onClick={() => openExec(f)}>执行随访</button>
                                  <button className="btn btn-secondary btn-sm" onClick={() => setFollowUpDetail(f)}>详情</button>
                                </div>
                              ) : (
                                <button className="btn btn-secondary btn-sm" onClick={() => setFollowUpDetail(f)}>查看详情</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    )
                  })
                })()}
              </tbody>
            </table>
            )}
            </>
            )
          })()}
        </div>
        </>
      )}

      {aiSourceGroup && (
        <div className="modal-overlay" onClick={() => setAiSourceGroup(null)}>
          <div className="modal" style={{ maxWidth: 720, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{aiSourceGroup.title}</h3>
              <button className="modal-close" onClick={() => setAiSourceGroup(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ overflowY: 'auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(aiSourceGroup.missingYears || []).length > 0 && <div style={{ padding: 10, borderRadius: 8, background: '#FFF7ED', border: '1px solid #FDBA74', color: '#9A3412', fontSize: 12 }}>
                  证据链不完整：分析涉及 {aiSourceGroup.missingYears.join('、')} 年，但尚未定位到这些年份的原件。请先核对分析结论或补充原始报告。
                </div>}
                {aiSourceGroup.ids.length === 0 && <div style={{ padding: 14, color: '#8AA89C', fontSize: 13 }}>暂未关联到可打开的原始报告，请检查该年度报告文件是否仍在档案中。</div>}
                {aiSourceGroup.ids.map(reportId => (
                  <div key={reportId} style={{ padding: 10, border: '1px solid #E5E7EB', borderRadius: 8 }}>
                    <div style={{ fontSize: 13, color: '#334155', fontWeight: 600, marginBottom: 8 }}>{aiSourceGroup.reportLabel(reportId)}</div>
                    <button className="btn btn-primary btn-sm" onClick={() => openAIAnalysisSource(reportId, aiSourceGroup.focusById?.[String(reportId)] || null)}>查看并定位原件</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 报告图片灯箱：字符串=仅查看；{url,reportId}=支持旋转后保存（已审核报告不可改，不会传对象形式） */}
      {previewImageUrl && (() => {
        const isRotatable = typeof previewImageUrl === 'object'
        const imgSrc = isRotatable ? previewImageUrl.url : previewImageUrl
        const closePreview = () => { setPreviewImageUrl(null); setPreviewRotation(0) }
        const rotate = () => setPreviewRotation(r => (r + 90) % 360)
        const saveRotation = async () => {
          if (previewRotation === 0) return closePreview()
          setPreviewSaving(true)
          try {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = imgSrc })
            const swap = previewRotation === 90 || previewRotation === 270
            const canvas = document.createElement('canvas')
            canvas.width = swap ? img.height : img.width
            canvas.height = swap ? img.width : img.height
            const ctx = canvas.getContext('2d')
            ctx.translate(canvas.width / 2, canvas.height / 2)
            ctx.rotate((previewRotation * Math.PI) / 180)
            ctx.drawImage(img, -img.width / 2, -img.height / 2)
            const mimeType = imgSrc.startsWith('data:image/png') ? 'image/png' : 'image/jpeg'
            const dataUrl = canvas.toDataURL(mimeType, 0.92)
            await staffAPI.updateReport(previewImageUrl.reportId, { content: dataUrl, mimeType })
            const refreshed = await staffAPI.getReport(previewImageUrl.reportId)
            setShowReportDetail(refreshed.data)
            closePreview()
          } catch (err) {
            alert('旋转保存失败：' + (err.message || '未知错误'))
          } finally {
            setPreviewSaving(false)
          }
        }
        return (
          <div onClick={closePreview}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
            <img src={imgSrc} alt="报告" style={{ maxWidth: '80vw', maxHeight: '80vh', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', transform: `rotate(${previewRotation}deg)`, transition: 'transform 0.2s' }} onClick={e => e.stopPropagation()} />
            {isRotatable && (
              <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 10 }}>
                <button onClick={rotate} disabled={previewSaving}
                  style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 14, cursor: 'pointer', borderRadius: 20, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  ↻ 旋转
                </button>
                {previewRotation !== 0 && (
                  <button onClick={saveRotation} disabled={previewSaving}
                    style={{ background: '#22A06B', border: 'none', color: '#fff', fontSize: 14, cursor: previewSaving ? 'default' : 'pointer', borderRadius: 20, padding: '10px 18px', opacity: previewSaving ? 0.7 : 1 }}>
                    {previewSaving ? '保存中…' : '保存旋转'}
                  </button>
                )}
              </div>
            )}
            <button onClick={closePreview}
              style={{ position: 'absolute', top: 20, right: 24, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              ✕
            </button>
          </div>
        )
      })()}

      {/* 打卡数据编辑弹窗：数据有疑问时医护端修正，修改人+时间+原值自动留痕 */}
      {editingRecord && (() => {
        const meta = RECORD_VALUE_META[editingRecord.type]
        const isFreeText = editingRecord.type !== 'bloodPressure' && !meta
        return (
          <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !editRecordSaving) setEditingRecord(null) }}>
            <div className="modal" style={{ maxWidth: 420 }}>
              <div className="modal-header">
                <div className="modal-title">编辑{RECORD_TYPE_LABEL[editingRecord.type] || editingRecord.type}记录</div>
                <button className="modal-close" onClick={() => setEditingRecord(null)} disabled={editRecordSaving}>✕</button>
              </div>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {editingRecord.type === 'bloodPressure' ? (
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                      <label className="form-label">收缩压（mmHg）</label>
                      <input className="form-input" type="number" value={editRecordForm.sys}
                        onChange={e => setEditRecordForm(p => ({ ...p, sys: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                      <label className="form-label">舒张压（mmHg）</label>
                      <input className="form-input" type="number" value={editRecordForm.dia}
                        onChange={e => setEditRecordForm(p => ({ ...p, dia: e.target.value }))} />
                    </div>
                  </div>
                ) : isFreeText ? (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">记录内容</label>
                    <textarea className="form-input" rows={3} value={editRecordForm.value}
                      onChange={e => setEditRecordForm(p => ({ ...p, value: e.target.value }))} />
                  </div>
                ) : (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">{RECORD_TYPE_LABEL[editingRecord.type]}（{meta.unit}）</label>
                    <input className="form-input" type="number" step="any" value={editRecordForm.value}
                      onChange={e => setEditRecordForm(p => ({ ...p, value: e.target.value }))} />
                  </div>
                )}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">备注（可选，如异常原因）</label>
                  <input className="form-input" value={editRecordForm.note}
                    onChange={e => setEditRecordForm(p => ({ ...p, note: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setEditingRecord(null)} disabled={editRecordSaving}>取消</button>
                <button className="btn btn-primary" onClick={saveEditRecord} disabled={editRecordSaving}>
                  {editRecordSaving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Health Portrait Tab ── */}
      {tab === 'portrait' && (
        <>
          <HealthPortraitOverview user={user} reports={reports} />
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <div>
                <div className="card-title">今日健康状态 / 不适主诉</div>
                <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 3 }}>近一年不适、处理方案及后续记录集中展示</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: '#4A6558' }}>共 {healthRecords.length} 条</span>
                <button className="btn btn-primary btn-sm" onClick={() => setAddingSymptom(true)}>＋ 新增不适主诉</button>
              </div>
            </div>
            <div style={{ padding: '14px 20px' }}>
              {healthRecords.length === 0 ? (
                <div style={{ color: '#8AA89C', fontSize: 14, textAlign: 'center', padding: '20px 0' }}>近一年暂无不适主诉记录</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {healthRecords.map((record, index) => {
                    const workflow = record.symptomWorkflow || {}
                    const workflowLabel = { pending_manager: '待健管专员核实', pending_doctor: '待健康顾问判断', manager_followup: '健管专员跟进', referred: '已转介', resolved: '已处理', dismissed: '已确认为误录' }[workflow.status] || '待处理'
                    const pending = ['pending_manager', 'pending_doctor'].includes(workflow.status)
                    const source = record.recordedBy?.source === 'staff' ? (record.recordedBy.staffName || '医护人员录入') : record.recordedBy?.source === 'system' ? '系统记录' : '客户打卡'
                    const year = new Date(record.recordedAt).getFullYear()
                    const previousYear = index > 0 ? new Date(healthRecords[index - 1].recordedAt).getFullYear() : null
                    const isExpanded = expandedSymptoms.has(String(record._id))
                    const toggleExpanded = () => setExpandedSymptoms(previous => {
                      const next = new Set(previous)
                      const key = String(record._id)
                      if (next.has(key)) next.delete(key); else next.add(key)
                      return next
                    })
                    return <React.Fragment key={record._id}>
                      {year !== previousYear && <div style={{ fontSize: 13, fontWeight: 800, color: '#1E6B50', padding: '6px 2px 2px' }}>{year} 年</div>}
                      <div id={`symptom-record-${record._id}`} style={{ padding: '13px 15px', borderRadius: 11, background: pending ? '#FFF7F6' : '#F7FAF8', borderLeft: `4px solid ${pending ? '#DC3545' : '#1E6B50'}` }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                          <div style={{ minWidth: 0, flex: 1, cursor: 'pointer' }} onClick={toggleExpanded}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ color: '#1A2B24', fontSize: 14, lineHeight: 1.6, fontWeight: 700 }}>{record.value || record.note || '未填写具体内容'}</span>
                              <span style={{ color: '#4A6558', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{new Date(record.recordedAt).toLocaleDateString('zh-CN')}</span>
                              <span style={{ color: '#8AA89C', fontSize: 12 }}>{isExpanded ? '收起' : '展开详情'} {isExpanded ? '⌃' : '⌄'}</span>
                            </div>
                            {isExpanded && <>
                              {record.note && record.note !== record.value && <div style={{ fontSize: 12, color: '#4A6558', marginTop: 4 }}>{record.note}</div>}
                              <div style={{ fontSize: 11, color: '#8AA89C', marginTop: 6 }}>{new Date(record.recordedAt).toLocaleString('zh-CN')} · {source}{workflow.decidedByName ? ` · 处理人：${workflow.decidedByName}` : ''}</div>
                              <div style={{ marginTop: 9, padding: '9px 11px', background: '#fff', border: '1px solid #E5ECE8', borderRadius: 8, fontSize: 12, color: '#4A6558' }}>
                                <b style={{ color: '#1A2B24' }}>对应解决方案：</b>{workflow.decisionNote || (pending ? '等待健康管理人员核实并制定方案' : '暂无补充处置说明')}
                              </div>
                            </>}
                          </div>
                          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 360 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, color: pending ? '#B42318' : '#1E6B50', background: pending ? '#FEE4E2' : '#E8F5EE' }}>{workflowLabel}</span>
                            {['healthManager', 'superadmin'].includes(staff?.role) && ['pending_manager', 'pending_doctor'].includes(workflow.status) && !workflow.verifiedAt && <>
                              <button className="btn btn-secondary btn-sm" onClick={() => openSymptomEditor(record)}>编辑审核</button>
                              <button className="btn btn-primary btn-sm" onClick={() => referSymptomToDoctor(record)}>转健康顾问</button>
                            </>}
                            {['familyDoctor', 'superadmin'].includes(staff?.role) && workflow.status === 'pending_doctor' && !!workflow.verifiedAt && <button className="btn btn-primary btn-sm" onClick={() => handleDoctorSymptom(record)}>处理</button>}
                            {['healthManager', 'superadmin'].includes(staff?.role) && <button className="btn btn-sm" style={{ color: '#B42318', background: '#FFF', border: '1px solid #FDA29B' }} onClick={() => deleteSymptomRecord(record)}>删除</button>}
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  })}
                </div>
              )}
            </div>
          </div>
          {editingSymptom && (
            <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditingSymptom(null)}>
              <div className="modal" style={{ maxWidth: 520 }}>
                <div className="modal-header"><h3 className="modal-title">编辑并审核不适主诉</h3><button className="modal-close" onClick={() => setEditingSymptom(null)}>×</button></div>
                <div className="modal-body">
                  <label className="form-label">核实后的不适内容 *</label><textarea className="form-input" rows={3} value={symptomForm.value} onChange={e => setSymptomForm(f => ({ ...f, value: e.target.value }))} />
                  <label className="form-label" style={{ marginTop: 12 }}>补充说明</label><textarea className="form-input" rows={2} value={symptomForm.note} onChange={e => setSymptomForm(f => ({ ...f, note: e.target.value }))} placeholder="部位、持续时间、严重程度等" />
                  <label className="form-label" style={{ marginTop: 12 }}>审核意见 / 解决方案</label><textarea className="form-input" rows={2} value={symptomForm.decisionNote} onChange={e => setSymptomForm(f => ({ ...f, decisionNote: e.target.value }))} placeholder="填写核实结果、解决方案及后续安排" />
                </div>
                <div className="modal-footer">
                  <button className="btn btn-secondary" disabled={symptomActionSaving} onClick={() => submitSymptomVerification('dismiss')}>确认为误录</button>
                  <button className="btn btn-secondary" disabled={symptomActionSaving || !symptomForm.value.trim()} onClick={() => submitSymptomVerification('save')}>保存审核修改</button>
                  <button className="btn btn-primary" disabled={symptomActionSaving || !symptomForm.value.trim()} onClick={() => submitSymptomVerification('refer_doctor')}>{symptomActionSaving ? '提交中...' : '确认并转健康顾问'}</button>
                </div>
              </div>
            </div>
          )}
          {addingSymptom && (
            <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setAddingSymptom(false)}>
              <div className="modal" style={{ maxWidth: 520 }}>
                <div className="modal-header"><h3 className="modal-title">新增今日健康状态 / 不适主诉</h3><button className="modal-close" onClick={() => setAddingSymptom(false)}>×</button></div>
                <div className="modal-body">
                  <label className="form-label">不适主诉 *</label>
                  <textarea className="form-input" rows={3} value={newSymptomForm.value} onChange={e => setNewSymptomForm(f => ({ ...f, value: e.target.value }))} placeholder="请填写症状、部位、持续时间和程度" />
                  <label className="form-label" style={{ marginTop: 12 }}>随访补充说明</label>
                  <textarea className="form-input" rows={2} value={newSymptomForm.note} onChange={e => setNewSymptomForm(f => ({ ...f, note: e.target.value }))} placeholder="例如：电话随访获知、已给予的初步建议" />
                  <label className="form-label" style={{ marginTop: 12 }}>发生 / 记录时间</label>
                  <input className="form-input" type="datetime-local" value={newSymptomForm.recordedAt} onChange={e => setNewSymptomForm(f => ({ ...f, recordedAt: e.target.value }))} />
                  <div style={{ marginTop: 8, fontSize: 12, color: '#8AA89C' }}>保存后会记录录入人员，并同步展示到客户端健康档案。</div>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-secondary" onClick={() => setAddingSymptom(false)} disabled={newSymptomSaving}>取消</button>
                  <button className="btn btn-primary" onClick={createSymptomRecord} disabled={newSymptomSaving || !newSymptomForm.value.trim()}>{newSymptomSaving ? '保存中...' : '保存并同步客户端'}</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Reports Tab ── */}
      {tab === 'reports' && (() => {
        const getReportYear = (report) => {
          const dateStr = report.checkDate || report.date
          const dateYear = dateStr ? new Date(dateStr).getFullYear() : NaN
          const createdYear = report.createdAt ? new Date(report.createdAt).getFullYear() : NaN
          return String(!Number.isNaN(dateYear) ? dateYear : (report.reportYear || (!Number.isNaN(createdYear) ? createdYear : '未知')))
        }
        const reportYears = [...new Set(reports.map(getReportYear))].sort((a, b) => b.localeCompare(a, 'zh', { numeric: true }))
        const getReportTaskKey = (report) => {
          if (report.audit_status === 'audited' || report.aiStatus === 'reviewed') return 'audited'
          if (report.audit_status === 'rejected' || report.aiStatus === 'rejected') return 'rejected'
          if (report.aiStatus === 'none') return 'parse'
          if (report.aiStatus === 'processing') return 'processing'
          return 'review'
        }
        const reportTaskOptions = [
          { key: 'all', label: '全部' },
          { key: 'parse', label: '待解析' },
          { key: 'processing', label: '解析中' },
          { key: 'review', label: '待审核' },
          { key: 'audited', label: '已审核' },
        ]
        // 支持标题/机构关键词及年份筛选，结果统一进入一张总表。
        const kw = reportSearchKw.trim().toLowerCase()
        const reportsInScope = reports.filter(r => {
          const matchesKeyword = !kw || [r.title, r.hospital, r.institution].some(v => (v || '').toLowerCase().includes(kw))
          return matchesKeyword && (!reportYearFilter || getReportYear(r) === reportYearFilter)
        })
        const isReportInfoMissing = report => !(report.hospital || report.institution) || !(report.checkDate || report.date)
        const missingReportCount = reportsInScope.filter(isReportInfoMissing).length
        const taskFilterCount = key => key === 'all' ? reportsInScope.length : reportsInScope.filter(r => getReportTaskKey(r) === key).length
        const filteredReports = reportsInScope.filter(r =>
          (!reportMissingOnly || isReportInfoMissing(r))
          && (reportTaskFilter === 'all' || getReportTaskKey(r) === reportTaskFilter)
        )

        // 标题 → L1 节点映射（用 screeningTree）
        const titleToL1 = {}
        const titleL2Order = {} // title → L2 order index（用于组内排序）
        screeningTree.forEach(l1Node => {
          (l1Node.children || []).forEach((c, idx) => {
            if (!(c.label in titleToL1)) {
              titleToL1[c.label] = l1Node
              titleL2Order[c.label] = idx
            }
          })
        })

        // 按年份 → L1 分组（优先用 screeningL1 字段，旧数据 fallback 到标题匹配）
        const ANNUAL_KEY = '__annual__'
        const ROUTINE_OTHER_KEY = '__other_routine__'
        const routineOtherNode = screeningTree.find(n => n.label === '其他常规筛查')
        const yearMap = {}
        filteredReports.forEach(r => {
          // 检查日期是报告归属年份的事实来源，reportYear 仅作为历史记录兜底。
          const yr = getReportYear(r)
          if (!yearMap[yr]) yearMap[yr] = {}
          let l1Node = r.screeningL1
            ? screeningTree.find(n => String(n._id) === r.screeningL1)
            : titleToL1[r.title]
          const l1TypeMeta = !l1Node && r.type && r.type !== 'other' ? REPORT_L1_TYPES.find(t => t.key === r.type) : null
          // 历史记录可能在类型被改成“体成分”等具体类型时丢失 screeningL1。
          // 这类常规检查应回到“其他常规筛查”，不能再额外生成含义不明的“其他”分组。
          // “其他”不是业务类目。任何无法匹配当前分类树、也没有明确兼容类型的非年度历史报告，
          // 都统一归入真实的“其他常规筛查”，不再暴露内部兜底名称“其他”。
          if (!l1Node && !l1TypeMeta && r.type !== 'annual') l1Node = routineOtherNode
          // screeningL1/标题都匹配不上时（多为用户端自主上传+编辑改归类的报告），按 type 字段（REPORT_L1_TYPES）
          // 分组，而不是一律扔进"其他"——此前这里只认字面量'annual'，编辑弹窗改了报告归类却完全不影响分组展示，
          // 看起来像"改了没生效"（2026-07-17反馈）
          const key = l1Node ? String(l1Node._id) : (l1TypeMeta ? `type_${l1TypeMeta.key}` : (r.type === 'annual' ? ANNUAL_KEY : ROUTINE_OTHER_KEY))
          if (!yearMap[yr][key]) yearMap[yr][key] = { node: l1Node, label: l1TypeMeta ? l1TypeMeta.label : (key === ANNUAL_KEY ? '年度体检报告' : '其他常规筛查'), reports: [] }
          yearMap[yr][key].reports.push(r)
        })
        const years = Object.keys(yearMap).sort((a, b) => b - a)

        // 组内按 L2 顺序排序
        const sortByTree = (rows) =>
          [...rows].sort((a, b) => {
            const ia = titleL2Order[a.title] ?? 9999
            const ib = titleL2Order[b.title] ?? 9999
            return ia !== ib ? ia - ib : (a.title || '').localeCompare(b.title || '', 'zh')
          })

        // L1 显示顺序：年度体检 → screeningTree 顺序 → type分组(REPORT_L1_TYPES顺序) → 其他
        const getL1Keys = (yrData) => {
          const annualKey = yrData[ANNUAL_KEY] ? [ANNUAL_KEY] : []
          const treeKeys  = screeningTree.map(n => String(n._id)).filter(k => yrData[k])
          const typeKeys  = REPORT_L1_TYPES.map(t => `type_${t.key}`).filter(k => yrData[k])
          const otherKey  = yrData[ROUTINE_OTHER_KEY] ? [ROUTINE_OTHER_KEY] : []
          return [...annualKey, ...treeKeys, ...typeKeys, ...otherKey]
        }
        const tableRows = years.flatMap(yr => getL1Keys(yearMap[yr]).flatMap(key => {
          const group = yearMap[yr][key]
          const typeLabel = group.label || group.node?.label || '其他常规筛查'
          return sortByTree(group.reports).map(report => ({ report, typeLabel }))
        })).sort((a, b) => {
          const priority = { review: 0, parse: 1, processing: 2, audited: 3, rejected: 4 }
          const taskDiff = (priority[getReportTaskKey(a.report)] ?? 9) - (priority[getReportTaskKey(b.report)] ?? 9)
          if (taskDiff) return taskDiff
          return String(b.report.checkDate || b.report.date || b.report.createdAt || '').localeCompare(String(a.report.checkDate || a.report.date || a.report.createdAt || ''))
        })
        const REPORT_PAGE_SIZE = 20
        const totalReportPages = Math.max(1, Math.ceil(tableRows.length / REPORT_PAGE_SIZE))
        const currentReportPage = Math.min(reportPage, totalReportPages)
        const paginatedReportRows = tableRows.slice((currentReportPage - 1) * REPORT_PAGE_SIZE, currentReportPage * REPORT_PAGE_SIZE)

        return (
          <div>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div className="card-title">体检报告 <span style={{ fontSize: 12, fontWeight: 400, color: '#8AA89C', marginLeft: 6 }}>{tableRows.length} 份</span></div>
              <div className="report-filter-bar">
                <select className="form-input report-year-select" style={{ width: 132 }} value={reportYearFilter} onChange={e => { setReportYearFilter(e.target.value); setReportPage(1); setOpenReportActionId(null) }} aria-label="按年份筛选报告">
                  <option value="">全部年份</option>
                  {reportYears.map(year => <option key={year} value={year}>{year === '未知' ? '年份未知' : `${year} 年`}</option>)}
                </select>
                <input className="form-input report-search-input" style={{ width: 240 }} placeholder="搜索报告标题/医院"
                  value={reportSearchKw} onChange={e => { setReportSearchKw(e.target.value); setReportPage(1); setOpenReportActionId(null) }} />
                <button className="btn btn-primary btn-sm report-upload-btn" onClick={() => setShowUploadReport(true)}>＋ 上传报告</button>
              </div>
            </div>
            {reports.length > 0 && <div className="report-list-toolbar">
              <div className="report-task-filters" aria-label="报告任务筛选">
                {reportTaskOptions.map(option => <button key={option.key} className={reportTaskFilter === option.key ? 'active' : ''} onClick={() => { setReportTaskFilter(option.key); setReportPage(1); setOpenReportActionId(null) }}>
                  {option.label}<span>{taskFilterCount(option.key)}</span>
                </button>)}
              </div>
              <div className="report-list-controls">
                <button type="button" className={`report-missing-toggle ${reportMissingOnly ? 'active' : ''}`} onClick={() => { setReportMissingOnly(current => !current); setReportPage(1); setOpenReportActionId(null) }}>
                  仅看信息待补 <span>{missingReportCount}</span>
                </button>
                {totalReportPages > 1 && <div className="report-table-pager report-table-pager-top" aria-label="报告分页">
                  <button aria-label="上一页" title="上一页" disabled={currentReportPage <= 1} onClick={() => { setReportPage(currentReportPage - 1); setOpenReportActionId(null) }}>‹</button>
                  <span>第 {currentReportPage} / {totalReportPages} 页</span>
                  <button aria-label="下一页" title="下一页" disabled={currentReportPage >= totalReportPages} onClick={() => { setReportPage(currentReportPage + 1); setOpenReportActionId(null) }}>›</button>
                </div>}
              </div>
            </div>}
            {reports.length === 0 ? (
              <div className="card" style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无体检报告</div>
            ) : filteredReports.length === 0 ? (
              <div className="card" style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无符合当前筛选条件的报告</div>
            ) : (
              <>
                  <div style={{ borderRadius: 8, border: '1px solid #e8e4dc', overflowX: 'auto', background: '#fff' }}>
                    <table className="table report-table" style={{ marginBottom: 0, minWidth: 920 }}>
                      <thead><tr><th>报告名称</th><th>类型</th><th>机构</th><th>检查日期</th><th>状态</th><th>操作</th></tr></thead>
                      <tbody>
                      {paginatedReportRows.map(({ report: r, typeLabel }) => {
                        const auditLabel = r.audit_status === 'audited' ? '已审核'
                          : r.audit_status === 'rejected' ? '已驳回'
                          : r.aiStatus === 'none' ? '待解析'
                          : r.aiStatus === 'processing' ? '解析中'
                          : '待审核'
                        const auditColor = r.audit_status === 'audited' ? '#22A06B'
                          : r.audit_status === 'rejected' ? '#DC3545' : '#D97706'
                        const isFunctionalMedicineReport = /功能检测|功能医学/.test(typeLabel)
                        // 居家监测设备导出报告格式差异大，不走 AI 自动解析。
                        const isHomeMonitorReport = /居家监测/.test(typeLabel)
                        return (
                          <React.Fragment key={r._id}>
                          <tr>
                            <td>
                              <button type="button" onClick={() => openReportDetail(r)} className="report-table-list-title-btn">{r.title || '未命名报告'}</button>
                              {r.screeningL2 && <div style={{ fontSize: 11, color: '#8AA89C', marginTop: 3 }}>{r.screeningL2}</div>}
                            </td>
                            <td><span style={{ fontSize: 12, color: '#668277', whiteSpace: 'nowrap' }}>{typeLabel}</span></td>
                            <td style={{ color: '#60756B' }}>{r.hospital || r.institution || <span className="report-missing-field">待补</span>}</td>
                            <td style={{ color: '#8AA89C', whiteSpace: 'nowrap' }}>{r.checkDate || r.date || <span className="report-missing-field">待补</span>}</td>
                            <td><span style={{ fontSize: 11, fontWeight: 600, color: auditColor, background: `${auditColor}12`, borderRadius: 999, padding: '3px 7px', whiteSpace: 'nowrap' }}>{auditLabel}</span></td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {isFunctionalMedicineReport ? (
                                <span style={{ fontSize: 11, color: '#aaa' }}>功能医学类不支持AI解析，请人工查阅</span>
                              ) : isHomeMonitorReport ? (
                                <span style={{ fontSize: 11, color: '#aaa' }}>居家监测类不支持AI解析，请人工录入</span>
                              ) : r.aiStatus === 'none' && (r.fileUrl || r.content || r.hasContent || (r.fileUrls && r.fileUrls.length)) ? (
                                <button className="btn btn-primary btn-sm report-action-primary"
                                  disabled={parsingReportId === r._id}
                                  onClick={() => handleParseReportAI(r._id)}>
                                  {parsingReportId === r._id ? '提交中…' : 'AI解析'}
                                </button>
                              ) : r.aiStatus === 'none' ? (
                                <span style={{ fontSize: 11, color: '#D97706' }}>无报告文件，请让客户重新上传图片/PDF后再解析</span>
                              ) : null}
                              {r.aiStatus === 'processing' && (
                                <button className="btn btn-sm report-action-muted" disabled>
                                  <span style={{ display:'inline-block', width:10, height:10, border:'2px solid #7C3AED', borderTopColor:'transparent', borderRadius:'50%', marginRight:6, verticalAlign:'middle', animation:'spin 0.8s linear infinite' }} />
                                  识别中…
                                </button>
                              )}
                              {(r.aiStatus === 'pending' || r.aiStatus === 'reviewed') && (
                                <button className={`btn btn-sm ${r.aiStatus === 'reviewed' ? 'report-action-primary' : 'report-action-review'}`} style={r.aiStatus === 'reviewed' ? { background: '#22A06B' } : undefined}
                                  onClick={() => handleOpenOCRReview(r)}>
                                  {r.aiStatus === 'reviewed' ? '编辑AI结果' : `审核AI结果${r.reportItems?.length ? `（${r.reportItems.length}项）` : ''}`}
                                </button>
                              )}
                              {r.audit_status !== 'audited' && (
                                <button className="report-action-more" aria-label="更多报告操作" title="更多操作" onClick={() => setOpenReportActionId(current => current === r._id ? null : r._id)}>
                                  {openReportActionId === r._id ? '×' : '···'}
                                </button>
                              )}
                            </td>
                          </tr>
                          {openReportActionId === r._id && r.audit_status !== 'audited' && (
                            <tr>
                              <td colSpan={6} style={{ padding: '8px 14px', background: '#F8FAF9', textAlign: 'right' }}>
                                <span style={{ color: '#8AA89C', fontSize: 12, marginRight: 10 }}>更多操作</span>
                                <button className="btn btn-secondary btn-sm" style={{ marginRight: 6 }} onClick={() => {
                                  setEditingReport(r)
                                  setEditingReportForm({
                                    title: r.title || '', hospital: r.hospital || r.institution || '', date: r.date || r.checkDate || '',
                                    note: r.note || '', type: r.type || 'general_exam',
                                  })
                                  setOpenReportActionId(null)
                                }}>编辑报告</button>
                                <button className="btn btn-sm" style={{ background: '#fff0f0', color: '#c00', border: '1px solid #fcc' }}
                                  onClick={async () => {
                                    const reason = window.prompt('删除体检报告前请填写删除原因：', '')
                                    if (reason === null) return
                                    if (!reason.trim()) { toast('必须填写删除原因'); return }
                                    if (!window.confirm(`确认删除这条报告记录？\n\n删除原因：${reason.trim()}\n\n删除后不可恢复。`)) return
                                    try { await staffAPI.deleteReport(r._id, reason.trim()); toast('报告已删除并记录删除原因'); setOpenReportActionId(null); loadReports() } catch (err) { toast(err.message) }
                                  }}>删除报告</button>
                              </td>
                            </tr>
                          )}
                          </React.Fragment>
                        )
                      })}
                      </tbody>
                    </table>
                  </div>
                  <div className="report-table-footer">
                    <span>显示 {(currentReportPage - 1) * REPORT_PAGE_SIZE + 1}–{Math.min(currentReportPage * REPORT_PAGE_SIZE, tableRows.length)} 条，共 {tableRows.length} 条</span>
                  </div>
              </>
            )}
          </div>
        )
      })()}

      {/* ── Service Records Tab ── */}
      {tab === 'serviceRecords' && (() => {
        const CATS = ['营养干预', '专病管理', '医院就医', '阶段性健康评估']
        const grouped = {}
        CATS.forEach(c => { grouped[c] = [] })
        serviceRecords.forEach(r => {
          const cat = SR_CATEGORY[r.type]
          // routine / doctor_followup 等已取消的旧类型不再出现在服务记录页面。
          if (!cat || !grouped[cat]) return
          grouped[cat].push(r)
        })
        const renderTable = (records) => (
          <table className="table">
            <thead><tr><th>类型</th><th>标题</th><th>内容摘要</th><th>负责人</th><th>日期</th></tr></thead>
            <tbody>
              {records.map(r => (
                <tr key={r._id} style={{ cursor: 'pointer' }} onClick={() => r.aiStatus === 'pending' ? setReviewingDraft(r) : setShowSRDetail(r)}>
                  <td>
                    <span className="badge badge-success" style={{ background: SR_CATEGORY_COLOR[serviceRecordCategory] + '20', color: SR_CATEGORY_COLOR[serviceRecordCategory] }}>{SR_TYPE_LABEL[r.type] || r.type}</span>
                    {r.aiStatus === 'pending' && <span style={{ marginLeft: 6, fontSize: 11, padding: '2px 6px', borderRadius: 999, background: '#7C3AED20', color: '#7C3AED', fontWeight: 600 }}>AI待审</span>}
                  </td>
                  <td style={{ fontWeight: 500, color: '#1E6B50' }}>{r.title || '-'}</td>
                  <td style={{ fontSize: 13, color: '#666', maxWidth: 200 }}>{r.content ? (r.content.length > 60 ? r.content.slice(0, 60) + '...' : r.content) : '-'}</td>
                  <td style={{ fontSize: 13, color: '#666' }}>{r.staffId?.name || '-'}</td>
                  <td style={{ fontSize: 12, color: '#aaa' }}>{new Date(r.date).toLocaleDateString('zh-CN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
        return (
          <div>
            <div className="card" style={{ marginBottom: 16, padding: '0 18px' }}>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '12px 0' }}>
                {CATS.map(cat => <button key={cat} type="button" onClick={() => setServiceRecordCategory(cat)} style={{ flex: '1 0 auto', minWidth: 150, border: 0, borderBottom: serviceRecordCategory === cat ? `3px solid ${SR_CATEGORY_COLOR[cat]}` : '3px solid transparent', borderRadius: 8, padding: '12px 16px', background: serviceRecordCategory === cat ? `${SR_CATEGORY_COLOR[cat]}14` : 'transparent', color: serviceRecordCategory === cat ? SR_CATEGORY_COLOR[cat] : '#4A6558', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                  {cat}<span style={{ marginLeft: 6, fontSize: 12, fontWeight: 500 }}>({grouped[cat].length})</span>
                </button>)}
              </div>
            </div>
            {(() => {
              const cat = serviceRecordCategory
              const isDiseaseMgmt = cat === '专病管理'
              // 专病管理内部按标题二级分组（同一专病的记录只要标题写法一致就会归到一起，组内保持原有按日期倒序）
              let diseaseGroups = null
              if (isDiseaseMgmt) {
                diseaseGroups = {}
                grouped[cat].forEach(r => {
                  const dn = r.diseaseName?.trim() || r.title?.trim() || '未标注专病'
                  if (!diseaseGroups[dn]) diseaseGroups[dn] = []
                  diseaseGroups[dn].push(r)
                })
              }
              return <div className="card" key={cat}>
                <div className="card-header">
                  <div className="card-title" style={{ color: SR_CATEGORY_COLOR[cat] }}>{cat}</div>
                  <span style={{ fontSize: 13, color: '#aaa' }}>{grouped[cat].length} 条</span>
                </div>
                {grouped[cat].length === 0 ? (
                  <div style={{ padding: '16px 20px', color: '#aaa', fontSize: 13 }}>暂无{cat}记录</div>
                ) : isDiseaseMgmt ? (
                  Object.keys(diseaseGroups).map(dn => (
                    <div key={dn} style={{ borderTop: '1px solid #f5f2ec' }}>
                      <div style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, color: '#4A6558', background: '#F9F6F0' }}>
                        {dn} <span style={{ fontWeight: 400, color: '#8AA89C' }}>· {diseaseGroups[dn].length} 条</span>
                      </div>
                      {renderTable(diseaseGroups[dn])}
                    </div>
                  ))
                ) : (
                  renderTable(grouped[cat])
                )}
              </div>
            })()}
          </div>
        )
      })()}

      {/* ── 转介记录 Tab ── */}
      {tab === 'referrals' && (() => {
        const REFERRAL_CAT_MAP = {
          familyDoctor:      '健康顾问转介',
          specialist:        '专科医师转介',
          nutritionist:      '营养师转介',
          tcmDoctor:         '中医师转介',
          psychologist:      '心理咨询师转介',
          rehabSpecialist:   '运动复健师转介',
          medicalAssistant:  '就医专员转介',
          healthManager:     '健管专员转介',
        }
        const REFERRAL_CAT_COLOR = {
          '健康顾问转介':   '#1E6B50',
          '专科医师转介':   '#0077B6',
          '营养师转介':     '#22A06B',
          '中医师转介':     '#8e44ad',
          '心理咨询师转介': '#D97706',
          '运动复健师转介': '#DC3545',
          '就医专员转介':   '#4A6558',
          '健管专员转介':   '#8AA89C',
        }
        const STATUS_LABEL = { pending:'待处理', accepted:'已接受', completed:'已完成', rejected:'已拒绝' }
        const STATUS_COLOR = { pending:'#D97706', accepted:'#0077B6', completed:'#22A06B', rejected:'#DC3545' }
        const CATS = ['健康顾问转介','专科医师转介','营养师转介','中医师转介','心理咨询师转介','运动复健师转介','就医专员转介','健管专员转介']
        const grouped = {}
        CATS.forEach(c => { grouped[c] = [] })
        patientReferrals.forEach(r => {
          const role = r.toStaffId?.role
          const cat = REFERRAL_CAT_MAP[role] || '就医专员转介'
          grouped[cat].push(r)
        })
        const activeCats = CATS.filter(c => grouped[c].length > 0)
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {patientReferrals.length === 0 && (
              <div className="card" style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无转介记录</div>
            )}
            {activeCats.map(cat => {
              const isOpen = !!expandedReferralCats[cat]
              return (
              <div className="card" key={cat}>
                <div className="card-header" style={{ cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => setExpandedReferralCats(prev => ({ ...prev, [cat]: !prev[cat] }))}>
                  <div className="card-title" style={{ color: REFERRAL_CAT_COLOR[cat] }}>{cat}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 13, color: '#aaa' }}>{grouped[cat].length} 条</span>
                    <span style={{ fontSize: 12, color: '#aaa' }}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                </div>
                {isOpen && <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {grouped[cat].map((r, i) => (
                    <div key={r._id} style={{ padding: '16px 20px', borderBottom: i < grouped[cat].length - 1 ? '1px solid #f5f2ec' : 'none' }}>
                      {/* 头部：转介方向 + 状态 + 时间 */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {r.urgency === 'urgent' && (
                            <span style={{ fontSize: 11, background: '#DC3545', color: '#fff', padding: '1px 8px', borderRadius: 99, fontWeight: 600 }}>紧急</span>
                          )}
                          <span style={{ fontWeight: 600, fontSize: 14 }}>{r.reason}</span>
                          <span style={{ fontSize: 12, color: STATUS_COLOR[r.status], fontWeight: 600 }}>· {STATUS_LABEL[r.status]}</span>
                        </div>
                        <span style={{ fontSize: 12, color: '#aaa' }}>{new Date(r.createdAt).toLocaleDateString('zh-CN')}</span>
                      </div>
                      {/* 转介信息 */}
                      <div style={{ fontSize: 13, color: '#4A6558', marginBottom: 4 }}>
                        发起：<strong>{r.fromStaffId?.name}</strong> → 接收：<strong>{r.toStaffId?.name}</strong>（{r.toStaffId?.title || REFERRAL_CAT_MAP[r.toStaffId?.role] || r.toStaffId?.role}）
                      </div>
                      {r.content && <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>{r.content}</div>}
                      {r.attachedHealthInfo && <AttachedHealthInfoView info={r.attachedHealthInfo} />}
                      {/* 回复 */}
                      {(r.responseAnalysis || r.responseOpinion || r.response) && (
                        <div style={{ marginTop: 10, padding: '10px 12px', background: '#f0faf5', borderRadius: 6, borderLeft: `3px solid ${REFERRAL_CAT_COLOR[cat]}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ fontSize: 11, color: '#8AA89C' }}>
                            {r.toStaffId?.name} 回复 · {r.respondedAt ? new Date(r.respondedAt).toLocaleDateString('zh-CN') : ''}
                          </div>
                          {r.responseAnalysis && (
                            <div>
                              <div style={{ fontSize: 11, color: '#4A6558', fontWeight: 600, marginBottom: 2 }}>当前问题分析</div>
                              <div style={{ fontSize: 13, color: '#1A2B24' }}>{r.responseAnalysis}</div>
                            </div>
                          )}
                          {r.responseOpinion && (
                            <div>
                              <div style={{ fontSize: 11, color: '#4A6558', fontWeight: 600, marginBottom: 2 }}>会诊意见</div>
                              <div style={{ fontSize: 13, color: '#1A2B24' }}>{r.responseOpinion}</div>
                            </div>
                          )}
                          {r.response && !r.responseAnalysis && !r.responseOpinion && (
                            <div style={{ fontSize: 13, color: '#1A2B24' }}>{r.response}</div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>}
              </div>
            )})}
          </div>
        )
      })()}

      {/* ── Requisitions Tab ── */}
      {false && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="card-title">检查开单</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" disabled={aiExamSuggesting} onClick={async () => {
                setAiExamSuggesting(true)
                try {
                  const r = await staffAPI.generateAIExamSuggest(id)
                  const d = r.data || {}
                  // suggestions（AI建议的具体检查项目名称）不再只是拼成文字塞进备注，
                  // 改为传给弹窗自动按名称搜索项目库、命中的直接加入已选列表
                  setReqPrefill({ title: d.title || '', notes: d.notes || '', suggestions: d.suggestions || [] })
                  setShowReqModal(true)
                } catch (err) { toast('AI建议失败：' + (err.message || '未知错误')) }
                finally { setAiExamSuggesting(false) }
              }}>{aiExamSuggesting ? 'AI生成中…' : '✨ AI开单建议'}</button>
              <button className="btn btn-primary btn-sm" onClick={() => { setReqPrefill(null); setShowReqModal(true) }}>＋ 新建开单</button>
            </div>
          </div>
          {requisitions.length === 0 ? (
            <div style={{ padding: '40px 16px', textAlign: 'center', color: '#aaa' }}>暂无开单记录</div>
          ) : (
            <div style={{ padding: '0 16px 16px' }}>
              {requisitions.map(r => {
                const statusMap = { open: { label: '待上传', color: '#D97706' }, partial: { label: '部分上传', color: '#0077B6' }, completed: { label: '已完成', color: '#22A06B' }, cancelled: { label: '已取消', color: '#aaa' } }
                const sm = statusMap[r.status] || { label: r.status, color: '#aaa' }
                return (
                  <div key={r._id} style={{ marginBottom: 16, border: '1px solid #E0D9CE', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ background: '#f5f0e8', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{r.title || '检查开单'}</span>
                        <span style={{ fontSize: 12, marginLeft: 10, color: '#8AA89C' }}>
                          {new Date(r.createdAt).toLocaleDateString('zh-CN')} · {r.staffId?.name || '-'}开单
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, color: sm.color, fontWeight: 600 }}>{sm.label}</span>
                        {r.status === 'open' && (
                          <button className="btn btn-secondary btn-sm" onClick={async () => {
                            if (!window.confirm('确定取消此开单？')) return
                            try { await staffAPI.cancelRequisition(r._id); toast('已取消'); loadRequisitions() }
                            catch (e) { toast(e.message) }
                          }}>取消</button>
                        )}
                      </div>
                    </div>
                    <div style={{ padding: '10px 14px' }}>
                      {r.notes && <div style={{ fontSize: 13, color: '#4A6558', marginBottom: 8 }}>备注：{r.notes}</div>}
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: '#f8fafc' }}>
                            {['检查项目', '类型', '注意事项', '状态'].map(h => (
                              <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 12, fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(r.items || []).map((item, idx) => {
                            const iStatusMap = { pending: '待上传', uploaded: '已上传', reviewed: '已审核' }
                            const iStatusColor = { pending: '#D97706', uploaded: '#0077B6', reviewed: '#22A06B' }
                            return (
                              <tr key={idx} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                <td style={{ padding: '6px 10px', fontWeight: 500 }}>{item.itemName}</td>
                                <td style={{ padding: '6px 10px', color: '#8AA89C', fontSize: 12 }}>{item.itemType === 'labTestOrder' ? '检验医嘱' : '检查医嘱'}</td>
                                <td style={{ padding: '6px 10px', color: '#4A6558' }}>{item.notes || '-'}</td>
                                <td style={{ padding: '6px 10px', color: iStatusColor[item.status], fontWeight: 500 }}>{iStatusMap[item.status] || item.status}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Orders Tab ── */}
      {/* ── 消费记录 Tab（需求17：合并服务订单+收费管理）── */}
      {tab === 'consumption' && (() => {
        const ORDER_STATUS = { pending:'待安排', scheduled:'已安排', completed:'已完成', cancelled:'已取消' }
        const ORDER_STATUS_COLOR = { pending:'#D97706', scheduled:'#0077B6', completed:'#22A06B', cancelled:'#DC3545' }
        const thisYear = new Date().getFullYear()
        const yearOrders = patientOrders.filter(o => new Date(o.createdAt).getFullYear() === thisYear)
        const billableYearOrders = yearOrders.filter(o => o.status !== 'cancelled' && o.paymentStatus !== 'refunded' && o.tradeStatus !== 'refunded' && o.tradeStatus !== 'closed')
        const yearTotal = billableYearOrders.reduce((sum, order) => {
          const paid = Number(order.paidAmount || 0)
          return sum + (paid > 0 ? paid : Number(order.servicePrice || 0))
        }, 0)
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 账户概览 */}
            <div className="card">
              <div className="card-header"><div className="card-title">账户概览</div></div>
              <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
                {[
                  { label: '健康基金余额', value: `¥${(user.healthFundBalance || 0).toFixed(2)}`, color: '#1E6B50' },
                  { label: `${thisYear}年消费总额`, value: `¥${yearTotal.toFixed(2)}`, color: '#DC3545' },
                  { label: '服务包', value: getServicePackageLabel(user.servicePackage) || '未购买', color: '#0077B6' },
                  { label: '服务到期', value: user.serviceExpiry ? new Date(user.serviceExpiry).toLocaleDateString('zh-CN') : '-', color: '#D97706' },
                ].map(item => (
                  <div key={item.label} style={{ padding: 14, background: '#f9f7f3', borderRadius: 10, textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 服务购买记录 */}
            <div className="card">
              <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="card-title">服务购买记录</div>
                <span style={{ fontSize: 12, color: '#8AA89C' }}>待安排 {patientOrders.filter(o => o.status === 'pending').length} 条</span>
              </div>
              {patientOrders.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#aaa' }}>暂无购买记录</div>
              ) : (
                <table className="table">
                  <thead><tr><th>产品名称</th><th>金额</th><th>服务次数</th><th>下单时间</th><th>归属</th><th>状态</th><th>操作</th></tr></thead>
                  <tbody>
                    {patientOrders.map(order => {
                      // 谁推送谁获推广费(referrerId=推送时自动关联)，谁服务谁获服务费(fulfillerId)——
                      // 只有该订单的推荐人本人或超管能指定服务人，不是随便谁都能改
                      const canAssignFulfiller = staff?.role === 'superadmin' || String(order.referrerId?._id) === String(staff?._id)
                      return (
                      <tr key={order._id}>
                        <td style={{ fontWeight: 500 }}>
                          <div>{order.serviceName || order.serviceId}</div>
                          {order.specificationLabel && <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 3 }}>{order.specificationLabel}</div>}
                        </td>
                        <td style={{ color: '#D97706', fontWeight: 600 }}>
                          {order.servicePrice != null ? `¥${order.servicePrice}` : '-'}
                        </td>
                        <td style={{ fontSize: 13 }}>
                          <div style={{ fontWeight: 600, color: '#1E6B50' }}>
                            已使用 {order.usedUnits || 0}/{order.totalUnits || 1} 次
                          </div>
                          <div style={{ fontSize: 12, color: '#8AA89C' }}>
                            剩余 {Math.max(0, (order.totalUnits || 1) - (order.usedUnits || 0))} 次
                          </div>
                          {(order.serviceItemsSnapshot || []).map(item => <div key={item.key} style={{fontSize:12,color:'#4A6558',marginTop:2}}>{item.name}：{item.usedUnits || 0}/{item.units}次</div>)}
                        </td>
                        <td style={{ fontSize: 13, color: '#8AA89C' }}>{new Date(order.createdAt).toLocaleDateString('zh-CN')}</td>
                        <td style={{ fontSize: 12 }}>
                          <div style={{ color: order.referrerId ? '#1E6B50' : '#C0B8AE' }}>推 {order.referrerId?.name || '—'}</div>
                          <div style={{ color: order.fulfillerId ? '#0077B6' : '#C0B8AE' }}>
                            服 {order.fulfillerId?.name || '未指定'}
                            {canAssignFulfiller && (
                              <button className="btn btn-sm" style={{ marginLeft: 4, padding: '0 4px', fontSize: 11 }}
                                onClick={() => { setAssigningFulfillerOrder(order); setFulfillerChoice(order.fulfillerId?._id || '') }}>指定</button>
                            )}
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 99, fontWeight: 600,
                            background: (ORDER_STATUS_COLOR[order.status] || '#aaa') + '20',
                            color: ORDER_STATUS_COLOR[order.status] || '#aaa' }}>
                            {ORDER_STATUS[order.status] || order.status}
                          </span>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {order.status === 'pending' && (
                            <button className="btn btn-primary btn-sm" onClick={async () => {
                              try {
                                await staffAPI.startOrder(order._id, { action: 'schedule' })
                                setPatientOrders(prev => prev.map(o => o._id === order._id ? { ...o, status: 'scheduled', scheduledAt: new Date().toISOString() } : o))
                                toast('已安排服务')
                              } catch (err) { toast(err.message || '操作失败') }
                            }}>启动服务</button>
                          )}
                          {order.status === 'scheduled' && (order.usedUnits || 0) < (order.totalUnits || 1) && !(order.serviceItemsSnapshot || []).length && (
                            <button className="btn btn-sm" disabled={redeemingOrderId === order._id}
                              style={{ background: '#22A06B', color: '#fff', border: 'none' }} onClick={async () => {
                              const note = window.prompt(`确认核销第 ${(order.usedUnits || 0) + 1}/${order.totalUnits || 1} 次服务。\n可填写本次服务备注（可留空）：`, '')
                              if (note === null) return
                              setRedeemingOrderId(order._id)
                              try {
                                const res = await staffAPI.redeemOrder(order._id, note)
                                setPatientOrders(prev => prev.map(o => o._id === order._id ? res.data : o))
                                toast(res.message || '核销成功')
                              } catch (err) { toast(err.message || '操作失败') }
                              finally { setRedeemingOrderId(null) }
                            }}>{redeemingOrderId === order._id ? '核销中…' : '核销1次'}</button>
                          )}
                          {order.status === 'scheduled' && (order.serviceItemsSnapshot || []).filter(item => (item.usedUnits || 0) < item.units).map(item => (
                            <button key={item.key} className="btn btn-sm" disabled={redeemingOrderId === order._id}
                              style={{background:'#22A06B',color:'#fff',border:'none',margin:'2px'}} onClick={async()=>{
                                const note=window.prompt(`确认核销“${item.name}”第 ${(item.usedUnits||0)+1}/${item.units} 次。\n可填写备注（可留空）：`,'')
                                if(note===null)return
                                setRedeemingOrderId(order._id)
                                try{const res=await staffAPI.redeemOrder(order._id,note,item.key);setPatientOrders(prev=>prev.map(o=>o._id===order._id?res.data:o));toast(res.message||'核销成功')}catch(err){toast(err.message||'操作失败')}finally{setRedeemingOrderId(null)}
                              }}>核销：{item.name}</button>
                          ))}
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* 指定服务人弹窗 */}
            {assigningFulfillerOrder && (
              <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setAssigningFulfillerOrder(null) }}>
                <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
                  <div className="modal-header">
                    <h3 className="modal-title">指定服务人</h3>
                    <button className="modal-close" onClick={() => setAssigningFulfillerOrder(null)}>✕</button>
                  </div>
                  <div className="modal-body">
                    <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 12 }}>
                      谁服务谁获得服务费；不指定则该订单只产生推广费，不产生服务费
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">服务人</label>
                      <select className="form-input" value={fulfillerChoice} onChange={e => setFulfillerChoice(e.target.value)}>
                        <option value="">不指定（可以是我自己）</option>
                        {staffList.map(s => <option key={s._id} value={s._id}>{s.name}（{s.role}）</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button className="btn btn-ghost" onClick={() => setAssigningFulfillerOrder(null)}>取消</button>
                    <button className="btn btn-primary" onClick={async () => {
                      try {
                        const res = await staffAPI.setOrderFulfiller(assigningFulfillerOrder._id, fulfillerChoice || null)
                        setPatientOrders(prev => prev.map(o => o._id === assigningFulfillerOrder._id ? res.data : o))
                        toast('已设置服务人')
                        setAssigningFulfillerOrder(null)
                      } catch (err) { toast(err.message || '设置失败') }
                    }}>保存</button>
                  </div>
                </div>
              </div>
            )}

            {/* 健康基金收支 */}
            <div className="card">
              <div className="card-header"><div className="card-title">健康基金</div></div>
              <div className="card-body">
                <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                  <div style={{ flex: 1, padding: 14, background: '#E8F5EF', borderRadius: 10, textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: '#1E6B50', marginBottom: 4 }}>当前余额</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#1E6B50' }}>¥{(user.healthFundBalance || 0).toFixed(2)}</div>
                  </div>
                  <div style={{ flex: 1, padding: 14, background: '#FEF3E2', borderRadius: 10, textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: '#D97706', marginBottom: 4 }}>充值余额</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#D97706' }}>¥{(user.rechargeBalance || 0).toFixed(2)}</div>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: '#8AA89C', textAlign: 'center' }}>健康基金收支明细请在财务模块管理</div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Family Tab ── */}
      {tab === 'family' && (
        <FamilyTab patientId={id} user={user} onRefresh={load} />
      )}

      {/* ── Membership Tab ── */}
      {tab === 'membership' && (
        <MembershipPanel user={user} patientId={id} onRefresh={load} />
      )}

      {/* 随访详情弹窗 */}
      {/* ── AI 助手弹窗（场景五/六/九）── */}
      {aiHelper && (
        <div className="modal-overlay" onClick={() => !aiHelperBusy && setAiHelper(null)}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {aiHelper.type === 'followup' ? 'AI 智能随访建议' : aiHelper.type === 'coach' ? 'AI 健康教练消息' : 'AI 个性化内容推荐'}
              </h3>
              <button className="modal-close" onClick={() => setAiHelper(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <AiRuleHint scene={aiHelper.type === 'followup' ? 'followup_suggestion' : aiHelper.type === 'coach' ? 'coach_message' : 'content_recommend'} />
              {aiHelper.loading && <div style={{ padding: 30, textAlign: 'center', color: '#8AA89C' }}>AI 生成中，请稍候…</div>}
              {aiHelper.error && <div style={{ padding: 16, color: '#DC2626', background: '#FEF2F2', borderRadius: 8 }}>{aiHelper.error}</div>}

              {/* 场景六：随访建议 */}
              {!aiHelper.loading && !aiHelper.error && aiHelper.type === 'followup' && aiHelper.data && (() => {
                const d = aiHelper.data
                const T = { advance: { l: '建议提前随访', c: '#DC2626' }, keep: { l: '按原计划随访', c: '#16A34A' }, extend: { l: '可延长随访间隔', c: '#0077B6' } }[d.timing] || { l: d.timing, c: '#4A6558' }
                const setD = (patch) => setAiHelper(h => ({ ...h, data: { ...h.data, ...patch } }))
                const outline = Array.isArray(d.outline) ? d.outline : []
                return (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 13, fontWeight: 600, padding: '4px 12px', borderRadius: 99,
                        background: T.c + '15', color: T.c,
                      }}>{T.l}</span>
                    </div>

                    {d.timingReason && (
                      <div style={{ background: '#F9F6F0', border: '1px solid #E0D9CE', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#4A6558', lineHeight: 1.6 }}>
                        💡 {d.timingReason}
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12 }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">建议随访日期</label>
                        <input type="date" className="form-input"
                          value={d.suggestedDate || ''} onChange={e => setD({ suggestedDate: e.target.value })} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">随访主题</label>
                        <input className="form-input" style={{ fontWeight: 600 }}
                          value={d.theme || ''} onChange={e => setD({ theme: e.target.value })} />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">随访方式</label>
                        <select className="form-input" value={d.type || 'phone'} onChange={e => setD({ type: e.target.value })}>
                          <option value="phone">电话</option>
                          <option value="wechat">微信</option>
                          <option value="visit">上门</option>
                          <option value="video">视频</option>
                          <option value="other">其他</option>
                        </select>
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">随访人员 <span style={{ color: '#DC3545' }}>*</span></label>
                        <select className="form-input" value={d.assignedTo || ''} onChange={e => setD({ assignedTo: e.target.value })}>
                          <option value="">-- 请选择随访人员 --</option>
                          {staffList.map(s => <option key={s._id} value={s._id}>{s.name} · {s.roleLabel || s.role}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">随访提纲</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {outline.map((line, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{
                              width: 20, height: 20, borderRadius: '50%', background: '#1E6B50', color: '#fff',
                              fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0,
                            }}>{i + 1}</span>
                            <input className="form-input" style={{ flex: 1 }}
                              value={line}
                              onChange={e => {
                                const next = [...outline]; next[i] = e.target.value; setD({ outline: next })
                              }} />
                            <button type="button" onClick={() => setD({ outline: outline.filter((_, idx) => idx !== i) })}
                              style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #DC3545', background: '#fff', color: '#DC3545', cursor: 'pointer', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}
                            >−</button>
                          </div>
                        ))}
                        <button type="button" onClick={() => setD({ outline: [...outline, ''] })}
                          style={{ alignSelf: 'flex-start', width: 28, height: 28, borderRadius: 6, border: '1px solid #1E6B50', background: '#fff', color: '#1E6B50', cursor: 'pointer', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}
                        >+</button>
                      </div>
                    </div>

                    <div style={{ fontSize: 12, color: '#8AA89C' }}>💡 可编辑主题、日期、提纲后再采纳；采纳后在随访列表仍可继续编辑</div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                      <button className="btn btn-secondary" onClick={() => setAiHelper(null)}>关闭</button>
                      <button className="btn btn-primary" onClick={adoptFollowupSuggestion} disabled={aiHelperBusy || !d.assignedTo}
                        title={!d.assignedTo ? '请先选择随访人员' : ''}>{aiHelperBusy ? '创建中...' : '采纳并创建随访计划'}</button>
                    </div>
                  </>
                )
              })()}

              {/* 场景九：教练消息 */}
              {!aiHelper.loading && !aiHelper.error && aiHelper.type === 'coach' && aiHelper.data && (
                <>
                  <div style={{ fontSize: 12, color: '#8AA89C' }}>
                    依从性：{{ high: '良好', medium: '一般', low: '偏低' }[aiHelper.data.adherence] || '-'} · 连续打卡 {aiHelper.data.streak} 天{aiHelper.data.daysSinceLast != null ? ` · 距上次打卡 ${aiHelper.data.daysSinceLast} 天` : ''}
                  </div>
                  <textarea className="form-control" rows={4} value={aiHelper.data.message}
                    onChange={e => setAiHelper(h => ({ ...h, data: { ...h.data, message: e.target.value } }))} />
                  {aiHelper.data.sent ? (
                    <div style={{ fontSize: 11, color: '#22A06B' }}>✓ 已于 {new Date(aiHelper.data.sentAt).toLocaleString('zh-CN')} 发送。仍可修改内容后再次发送。</div>
                  ) : (
                    <div style={{ fontSize: 11, color: '#B0B8B3' }}>可编辑后再发送。发送将作为「健康教练」通知推送给会员。</div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button className="btn btn-secondary" onClick={() => setAiHelper(null)}>关闭</button>
                    <button className="btn btn-primary" onClick={sendCoachMessage} disabled={aiHelperBusy}>{aiHelperBusy ? '发送中...' : (aiHelper.data.sent ? '再次发送' : '发送给会员')}</button>
                  </div>
                </>
              )}

              {/* 场景五：内容推荐 */}
              {!aiHelper.loading && !aiHelper.error && aiHelper.type === 'content' && aiHelper.data && (
                <>
                  {aiHelper.data.note && <div style={{ fontSize: 13, color: '#D97706', background: '#FEF9EC', borderRadius: 8, padding: '8px 12px' }}>{aiHelper.data.note}</div>}
                  {(aiHelper.data.items || []).length === 0 && !aiHelper.data.note && (
                    <div style={{ padding: 16, textAlign: 'center', color: '#8AA89C' }}>暂无匹配的推荐内容</div>
                  )}
                  {(aiHelper.data.items || []).map(it => (
                    <div key={it.knowledgeId} style={{ border: '1px solid #F0EDE7', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{it.title}</span>
                        <button className="btn btn-primary btn-sm" disabled={aiHelperBusy || it.alreadyPushed} onClick={() => pushRecommendedContent(it.knowledgeId)}>
                          {it.alreadyPushed ? '已推送' : '推送'}
                        </button>
                      </div>
                      {it.reason && <div style={{ fontSize: 12, color: '#4A6558', marginTop: 4 }}>推荐理由：{it.reason}</div>}
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary" onClick={() => setAiHelper(null)}>关闭</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 执行随访弹窗：填写随访结果、标记完成/随访中，与 FollowUpsPage.jsx 的执行随访弹窗逻辑/UI一致 */}
      {execItem && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setExecItem(null) }}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3 className="modal-title">执行随访</h3>
              <button className="modal-close" onClick={() => setExecItem(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {execItem.taskRequirements && (
                <div style={{ background: '#EFF8F4', border: '1px solid #B2D8C7', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1E6B50', marginBottom: 8 }}>具体代办事项</div>
                  <div style={{ fontSize: 13, color: '#1A2B24', whiteSpace: 'pre-line', lineHeight: 1.7 }}>
                    {execItem.taskRequirements}
                  </div>
                </div>
              )}
              <div style={{ background: '#f9f7f3', borderRadius: 8, padding: 12, display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#8AA89C', minWidth: 70 }}>计划日期：</span>
                  <span style={{ fontSize: 13 }}>{new Date(execItem.date).toLocaleDateString('zh-CN')}</span>
                </div>
                {execItem.theme && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#8AA89C', minWidth: 70 }}>随访主题：</span>
                    <span style={{ fontSize: 13 }}>{execItem.theme}</span>
                  </div>
                )}
                {execItem.content && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#8AA89C', minWidth: 70 }}>计划内容：</span>
                    <span style={{ fontSize: 13, whiteSpace: 'pre-line', flex: 1 }}>{execItem.content}</span>
                  </div>
                )}
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>随访方式</label>
                <select className="form-control" value={execForm.type}
                  onChange={e => setExecForm(f => ({ ...f, type: e.target.value }))}>
                  {TYPE_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <label style={{ fontSize: 12, color: '#8AA89C' }}>随访结果 *</label>
                  <button type="button" className="btn btn-secondary"
                    style={{ fontSize: 12, padding: '2px 10px' }}
                    onClick={handleExecAIDraft} disabled={execDraftLoading}>
                    {execDraftLoading ? '生成中...' : '✨ AI生成草稿'}
                  </button>
                </div>
                <textarea className="form-control" rows={5}
                  placeholder="记录本次随访的实际情况、会员反馈、建议等..."
                  value={execForm.content}
                  onChange={e => setExecForm(f => ({ ...f, content: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 8 }}>随访结果状态</label>
                <div style={{ display: 'flex', gap: 16 }}>
                  {[
                    { v: 'completed',   l: '✅ 已随访（圆满完成）' },
                    { v: 'in_progress', l: '🔄 随访中（未完成/未接通）' },
                  ].map(o => (
                    <label key={o.v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
                      <input type="radio" name="execStatus" value={o.v}
                        checked={execForm.status === o.v}
                        onChange={() => setExecForm(f => ({ ...f, status: o.v }))} />
                      {o.l}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setExecItem(null)}>取消</button>
              <button className="btn btn-primary" onClick={handleExec} disabled={execSaving}>
                {execSaving ? '保存中...' : '保存随访结果'}
              </button>
            </div>
          </div>
        </div>
      )}

      {followUpDetail && (
        <div className="modal-overlay" onClick={() => setFollowUpDetail(null)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">随访详情</h3>
              <button className="modal-close" onClick={() => setFollowUpDetail(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* 基本信息 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { label: '随访日期', value: new Date(followUpDetail.date).toLocaleDateString('zh-CN') },
                  { label: '随访方式', value: TYPE_MAP[followUpDetail.type] || followUpDetail.type || '-' },
                  { label: '随访状态', value: STATUS_MAP[followUpDetail.status] || followUpDetail.status || '-' },
                  { label: '随访人员', value: followUpDetail.assignedTo?.name || followUpDetail.staffId?.name || '-' },
                  { label: '参与人员', value: followUpDetail.participants || '-' },
                  { label: '随访主题', value: followUpDetail.theme || followUpDetail.planName || '-' },
                  { label: '下次随访', value: followUpDetail.nextFollowUpDate ? new Date(followUpDetail.nextFollowUpDate).toLocaleDateString('zh-CN') : '-' },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 14, color: '#1A2B24', fontWeight: 500 }}>{value}</div>
                  </div>
                ))}
              </div>
              {/* 订单信息：sourceType='order'时展示，让健管专员知道具体是哪笔订单、金额、支付状态 */}
              {followUpDetail.sourceType === 'order' && followUpDetail.sourceOrderId && (
                <div>
                  <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 6 }}>关联订单</div>
                  <div style={{ background: '#E8F5EF', borderRadius: 8, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#1A2B24' }}>{followUpDetail.sourceOrderId.serviceName}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#DC3545' }}>¥{followUpDetail.sourceOrderId.paidAmount ?? followUpDetail.sourceOrderId.servicePrice}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#4A6558' }}>
                      支付方式：{{ wechat: '微信', alipay: '支付宝', onsite: '到店', healthFund: '健康基金抵扣', '': '未支付' }[followUpDetail.sourceOrderId.paymentMethod] || '-'}
                      <span style={{ marginLeft: 12 }}>下单时间：{new Date(followUpDetail.sourceOrderId.createdAt).toLocaleString('zh-CN')}</span>
                    </div>
                    <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start', marginTop: 4 }}
                      onClick={() => { setFollowUpDetail(null); setTab('consumption') }}>查看消费记录</button>
                  </div>
                </div>
              )}
              {/* 随访内容 */}
              {followUpDetail.taskRequirements && (
                <div>
                  <div style={{ fontSize: 11, color: '#1E6B50', marginBottom: 6, fontWeight: 700 }}>具体代办事项</div>
                  <div style={{ background: '#EFF8F4', borderRadius: 8, padding: '10px 14px', fontSize: 14, color: '#1A2B24', lineHeight: 1.7, whiteSpace: 'pre-wrap', border: '1px solid #B2D8C7' }}>
                    {followUpDetail.taskRequirements}
                  </div>
                </div>
              )}
              {followUpDetail.content && (
                <div>
                  <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 6 }}>随访内容</div>
                  <div style={{ background: '#f9f7f3', borderRadius: 8, padding: '10px 14px', fontSize: 14, color: '#1A2B24', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    {followUpDetail.content}
                  </div>
                </div>
              )}
              {/* 面谈纪要（上门/面谈时显示） */}
              {followUpDetail.interviewMinutes && (
                <div>
                  <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 6 }}>面谈纪要</div>
                  <div style={{ background: '#f0f8f4', borderRadius: 8, padding: '10px 14px', fontSize: 14, color: '#1A2B24', lineHeight: 1.7, whiteSpace: 'pre-wrap', borderLeft: '3px solid #1E6B50' }}>
                    {followUpDetail.interviewMinutes}
                  </div>
                </div>
              )}
              {/* 打卡项目 */}
              {followUpDetail.checkInItems?.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 6 }}>打卡项目</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {followUpDetail.checkInItems.map((item, i) => (
                      <span key={i} style={{ padding: '2px 10px', borderRadius: 99, background: '#E8F5EF', color: '#1E6B50', fontSize: 12, fontWeight: 500 }}>{CHECKIN_LABEL[item] || item}</span>
                    ))}
                  </div>
                </div>
              )}
              {/* 表单内容（formData） */}
              {followUpDetail.formData && Object.keys(followUpDetail.formData).length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 6 }}>表单内容</div>
                  <div style={{ background: '#f9f7f3', borderRadius: 8, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {Object.entries(followUpDetail.formData).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', gap: 8 }}>
                        <span style={{ fontSize: 12, color: '#8AA89C', minWidth: 80 }}>{k}</span>
                        <span style={{ fontSize: 13, color: '#1A2B24', flex: 1 }}>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* 备注 */}
              {followUpDetail.notes && (
                <div>
                  <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 6 }}>备注</div>
                  <div style={{ fontSize: 13, color: '#4A6558' }}>{followUpDetail.notes}</div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" style={{ color: '#DC3545' }}
                onClick={async () => {
                  if (!window.confirm('确认删除这条随访记录？删除后不可恢复。')) return
                  try {
                    const reason = window.prompt('请填写删除原因（删除后医护端和客户端均不再展示）：')
                    if (reason === null) return
                    if (!reason.trim()) { toast('请填写删除原因'); return }
                    await staffAPI.deleteFollowUp(followUpDetail._id, reason.trim())
                    toast('已删除')
                    setFollowUpDetail(null); loadFollowUps()
                  } catch (err) { toast(err.message || '删除失败') }
                }}>删除</button>
              <button className="btn btn-secondary" onClick={() => setEditingFollowUp({
                date: followUpDetail.date ? new Date(followUpDetail.date).toISOString().slice(0, 10) : '',
                type: followUpDetail.type || 'phone',
                theme: followUpDetail.theme || '',
                content: followUpDetail.content || '',
                assignedTo: followUpDetail.assignedTo?._id || followUpDetail.assignedTo || '',
                nextFollowUpDate: followUpDetail.nextFollowUpDate ? new Date(followUpDetail.nextFollowUpDate).toISOString().slice(0, 10) : '',
              })}>编辑</button>
              <button className="btn btn-secondary" onClick={() => setFollowUpDetail(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* 随访记录编辑弹窗：表单字段多，鼠标移出边界误触遮罩会丢失编辑，去掉点遮罩关闭 */}
      {editingFollowUp && followUpDetail && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3 className="modal-title">编辑随访记录</h3>
              <button className="modal-close" onClick={() => setEditingFollowUp(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">随访日期</label>
                  <input type="date" className="form-input" value={editingFollowUp.date}
                    onChange={e => setEditingFollowUp(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">随访方式</label>
                  <select className="form-input" value={editingFollowUp.type}
                    onChange={e => setEditingFollowUp(f => ({ ...f, type: e.target.value }))}>
                    <option value="phone">电话</option>
                    <option value="wechat">微信</option>
                    <option value="visit">上门</option>
                    <option value="video">视频</option>
                    <option value="other">其他</option>
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">随访人员</label>
                <select className="form-input" value={editingFollowUp.assignedTo}
                  disabled={['completed', 'cancelled'].includes(followUpDetail.status)}
                  onChange={e => setEditingFollowUp(f => ({ ...f, assignedTo: e.target.value }))}>
                  <option value="">-- 当前登录人 --</option>
                  {staffList.map(s => <option key={s._id} value={s._id}>{s.name} · {s.roleLabel || s.role}</option>)}
                </select>
                {['completed', 'cancelled'].includes(followUpDetail.status) && (
                  <div style={{ fontSize: 11, color: '#8AA89C', marginTop: 4 }}>该随访已结束，不能再转派负责人</div>
                )}
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">随访主题</label>
                <input className="form-input" value={editingFollowUp.theme}
                  onChange={e => setEditingFollowUp(f => ({ ...f, theme: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">随访内容</label>
                <textarea className="form-input" rows={4} style={{ resize: 'vertical' }} value={editingFollowUp.content}
                  onChange={e => setEditingFollowUp(f => ({ ...f, content: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">下次随访日期</label>
                <input type="date" className="form-input" value={editingFollowUp.nextFollowUpDate}
                  onChange={e => setEditingFollowUp(f => ({ ...f, nextFollowUpDate: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditingFollowUp(null)}>取消</button>
              <button className="btn btn-primary" disabled={followUpSaving} onClick={async () => {
                setFollowUpSaving(true)
                try {
                  const res = await staffAPI.updateFollowUp(followUpDetail._id, {
                    date: editingFollowUp.date, type: editingFollowUp.type, theme: editingFollowUp.theme,
                    content: editingFollowUp.content, assignedTo: editingFollowUp.assignedTo || '',
                    nextFollowUpDate: editingFollowUp.nextFollowUpDate || null,
                  })
                  toast('已保存')
                  setEditingFollowUp(null); setFollowUpDetail(res.data); loadFollowUps()
                } catch (err) { toast(err.message || '保存失败') }
                finally { setFollowUpSaving(false) }
              }}>{followUpSaving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 随访记录弹窗 */}
      {showFollowUpModal && (
        <FollowUpModal
          patientId={id}
          patientName={user.name}
          onClose={() => setShowFollowUpModal(false)}
          onSaved={handleFollowUpCreated}
        />
      )}

      {/* 体检报告编辑弹窗 */}
      {editingReport && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setEditingReport(null) }}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">编辑报告信息</h3>
              <button className="modal-close" onClick={() => setEditingReport(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">报告标题</label>
                <input className="form-input" value={editingReportForm.title || ''}
                  onChange={e => setEditingReportForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">医院 / 机构</label>
                <input className="form-input" value={editingReportForm.hospital || ''}
                  onChange={e => setEditingReportForm(f => ({ ...f, hospital: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">检查日期</label>
                <input className="form-input" type="date" value={editingReportForm.date || ''}
                  onChange={e => setEditingReportForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              {/* 报告归类（一级大类，与用户端上传保持同一套）：客户上传时可能归错，健管可在此改正 */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">报告归类</label>
                <select className="form-input" value={editingReportForm.type || ''}
                  onChange={e => setEditingReportForm(f => ({ ...f, type: e.target.value }))}>
                  {REPORT_L1_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">备注</label>
                <input className="form-input" value={editingReportForm.note || ''}
                  onChange={e => setEditingReportForm(f => ({ ...f, note: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setEditingReport(null)}>取消</button>
              <button className="btn btn-primary" disabled={editingReportSaving} onClick={async () => {
                if (!editingReportForm.title) { toast('请填写报告标题'); return }
                setEditingReportSaving(true)
                try {
                  await staffAPI.updateReport(editingReport._id, editingReportForm)
                  setEditingReport(null)
                  loadReports()
                } catch (err) { toast(err.message) }
                finally { setEditingReportSaving(false) }
              }}>{editingReportSaving ? '保存中…' : '保存'}</button>
            </div>
          </div>
        </div>
      )}

      {riskEvidenceModal && (
        <div className="modal-overlay" onClick={() => setRiskEvidenceModal(null)}>
          <div className="modal" style={{ maxWidth: 620, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">风险标签来源 · {riskEvidenceModal.tag}</h3>
                <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 3 }}>{riskEvidenceModal.categoryLabel}；标签来自已审核报告的异常诊断或检查结论，最终需健康顾问审核确认。</div>
              </div>
              <button className="modal-close" onClick={() => setRiskEvidenceModal(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ overflowY: 'auto' }}>
              {riskEvidenceModal.loading ? <div style={{ padding: 24, textAlign: 'center', color: '#8AA89C' }}>正在查找来源…</div>
                : riskEvidenceModal.error ? <div style={{ color: '#DC3545' }}>{riskEvidenceModal.error}</div>
                : riskEvidenceModal.sources.length === 0 ? <div style={{ padding: 16, background: '#FFF8E8', borderRadius: 8, color: '#8A5A00', lineHeight: 1.7 }}>未在当前报告原文中找到完全匹配项。该标签可能来自历史数据或人工编辑，请结合体检报告复核，必要时在“人工编辑标签”中修正或删除。</div>
                : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{riskEvidenceModal.sources.map((source, index) => (
                  <div key={`${source.reportId}-${index}`} style={{ padding: 12, border: '1px solid #E0D9CE', borderRadius: 8, background: '#FAFAF8' }}>
                    <div style={{ fontWeight: 700, color: '#1A2B24' }}>{source.title}{source.itemName ? ` · ${source.itemName}` : ''}</div>
                    <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 3 }}>{source.date || '日期未填写'}</div>
                    <div style={{ fontSize: 13, color: '#4A6558', lineHeight: 1.7, marginTop: 7, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{source.text}</div>
                    <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => { setRiskEvidenceModal(null); setTab('reports'); openReportDetail({ _id: source.reportId, title: source.title }) }}>查看原报告</button>
                  </div>
                ))}</div>}
            </div>
          </div>
        </div>
      )}

      {/* 健康顾问健康档案查看确认弹窗：列出待查看的新增报告，逐份点开（复用下方报告详情弹窗）
          才会记入"已查看"，全部点开过后"确认已查看"按钮才可点击，防止不看内容就假确认 */}
      {showArchiveReviewModal && (
        <div className="modal-overlay" onClick={() => setShowArchiveReviewModal(false)}>
          <div className="modal" style={{ maxWidth: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ flexShrink: 0 }}>
              <h3 className="modal-title">查看新增体检报告</h3>
              <button className="modal-close" onClick={() => setShowArchiveReviewModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ overflowY: 'auto', flex: 1 }}>
              <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 10 }}>
                请逐份点开查看，全部查看过后才能确认（{pendingDoctorAuditReports.filter(r => !!r.familyDoctorViewedAt).length}/{pendingDoctorAuditReports.length}）
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pendingDoctorAuditReports.map(r => {
                  const viewed = !!r.familyDoctorViewedAt
                  return (
                    <div key={r._id}
                      onClick={() => { markArchiveReviewViewed(r._id); openReportDetail(r) }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                        border: `1px solid ${viewed ? '#CDEBDD' : '#E0D9CE'}`,
                        background: viewed ? '#F3FAF6' : '#fafaf8',
                      }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#1A2B24' }}>{r.title}</div>
                        <div style={{ fontSize: 11, color: '#8AA89C', marginTop: 2 }}>{r.checkDate || ''} {r.hospital || r.institution || ''}</div>
                      </div>
                      <span style={{ fontSize: 12, color: viewed ? '#22A06B' : '#D97706', fontWeight: 600 }}>
                        {viewed ? '✓ 已查看' : '点击查看'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="modal-footer" style={{ flexShrink: 0 }}>
              <button className="btn btn-secondary" onClick={() => setShowArchiveReviewModal(false)}>稍后再看</button>
              <button className="btn btn-primary" disabled={!allArchiveReviewViewed || archiveReviewSaving} onClick={handleConfirmArchiveReview}>
                {archiveReviewSaving ? '确认中…' : allArchiveReviewViewed ? '确认已查看' : `还有${pendingDoctorAuditReports.filter(r => !r.familyDoctorViewedAt).length}份未查看`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 体检报告详情弹窗：审核编辑内容较多，鼠标稍微移出弹窗点到遮罩层就会误触关闭丢失未保存内容，
          去掉点遮罩关闭，只能点右上角✕关闭 */}
      {showReportDetail && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ flexShrink: 0 }}>
              <h3 className="modal-title">{showReportDetail.title}</h3>
              <button className="modal-close" onClick={() => setShowReportDetail(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ overflowY: 'auto', flex: 1 }}>
              {(() => {
                const r = showReportDetail
                const REPORT_TYPE_LABEL = { annual:'年度体检报告', blood:'血液检查', bloodTest:'血液检查', ultrasound:'超声检查', radiology:'放射检查', mri:'磁共振', ecg:'心电图', endoscopy:'内镜检查', pathology:'病理', functional:'功能医学', genetic:'基因检测', other:'其他', tumor:'肿瘤筛查', cardiovascular:'心脑血管病筛查', chronic:'慢性病筛查', health_promote:'健康促进', home_monitor:'居家监测' }
                const typeLabel = REPORT_TYPE_LABEL[r.type] || r.type || '-'
                const l1Node = r.screeningL1 ? screeningTree.find(n => String(n._id) === r.screeningL1) : null
                const categoryLabel = l1Node ? [l1Node.label, r.screeningL2].filter(Boolean).join(' › ') : (r.type === 'annual' ? '年度体检报告' : null)
                const rows = [
                  ['报告类型', typeLabel],
                  ...(categoryLabel && categoryLabel !== typeLabel ? [['分类', categoryLabel]] : []),
                  ['医院 / 机构', r.hospital || '-'],
                  ['报告日期', r.date || '-'],
                  ['审核状态', r.audit_status === 'audited' ? '已审核' : r.audit_status === 'rejected' ? '已驳回' : '待审核'],
                  ['审核人', r.audited_by || '-'],
                  ...(r.reject_reason ? [['驳回原因', r.reject_reason]] : []),
                  ['上传人', r.uploadedBy?.name || '-'],
                ]
                return rows.map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', padding: '8px 0', borderBottom: '1px solid #f5f2ec' }}>
                    <span style={{ width: 90, flexShrink: 0, color: '#8AA89C', fontSize: 13 }}>{k}</span>
                    <span style={{ flex: 1, fontSize: 13, color: '#1A2B24' }}>{v}</span>
                  </div>
                ))
              })()}
              {showReportDetail.note && (
                <div style={{ marginTop: 12, padding: 12, background: '#f9f7f3', borderRadius: 8, fontSize: 13 }}>{showReportDetail.note}</div>
              )}
              {reportSourceFocus && (() => {
                const words = reportSourceFocus.words || [reportSourceFocus.itemName]
                const rows = [...(showReportDetail.reportItems || []), ...reportScreeningData.flatMap(s => s.reportItems || [])]
                  .filter(item => words.some(word => word && [item.name, item.sourceSection, item.orderName, item.findings, item.diagnosis, item.conclusion].filter(Boolean).join(' ').includes(word)))
                return (
                  <div style={{ marginTop: 12, padding: 12, border: '2px solid #7C3AED', background: '#F5F3FF', borderRadius: 9 }}>
                    <div style={{ color: '#5B21B6', fontWeight: 800, fontSize: 13, marginBottom: 7 }}>
                      已定位：{reportSourceFocus.itemName}{reportSourceFocus.years?.length ? `（${reportSourceFocus.years.join('、')}年）` : ''}
                    </div>
                    {rows.length ? rows.map((item, index) => (
                      <div key={index} style={{ padding: '7px 0', borderTop: index ? '1px solid #DDD6FE' : 'none', fontSize: 12, lineHeight: 1.65 }}>
                        <b>{item.name || item.sourceSection}</b>{item.sourcePage ? <span style={{ color: '#7C3AED' }}> · 原报告第{item.sourcePage}页</span> : null}
                        <div>{item.findings || item.value || item.diagnosis || item.conclusion || '已匹配到该检查项目'}</div>
                      </div>
                    )) : <div style={{ color: '#64748B', fontSize: 12 }}>已定位到对应年份报告，但结构化项目中未找到精确条目，请按报告页码或原件核对。</div>}
                  </div>
                )
              })()}

              {/* 专项筛查详情 */}
              {reportScreeningData.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#1E6B50', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #e8f5ef' }}>
                    专项筛查记录（共 {reportScreeningData.length} 条）
                  </div>
                  {reportScreeningData.map((s, idx) => (
                    <div key={s._id || idx} style={{ marginBottom: 14, padding: '12px 14px', background: '#f8fcfa', borderRadius: 8, borderLeft: '3px solid #1E6B50' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: '#1A2B24' }}>{s.screeningL3 || s.title || '检查项目'}</span>
                        <span style={{ fontSize: 12, color: '#8AA89C' }}>{s.checkDate || '-'}</span>
                      </div>
                      {/* 化验/检验结果：仅数值型项目按表格展示。影像检查的结果保存在
                          findings/diagnosis/conclusion，不能只读 value，否则健康顾问看到空白结果。 */}
                      {s.reportItems?.some(item => item.itemType !== 'imaging' && !(item.findings || item.diagnosis || item.conclusion)) && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, color: '#4A6558', fontWeight: 600, marginBottom: 4 }}>检验结果</div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: '#f0f0f0' }}>
                                <th style={{ padding: '3px 8px', textAlign: 'left', color: '#666', fontWeight: 500 }}>项目</th>
                                <th style={{ padding: '3px 8px', textAlign: 'right', color: '#666', fontWeight: 500 }}>结果</th>
                                <th style={{ padding: '3px 8px', textAlign: 'right', color: '#666', fontWeight: 500 }}>参考范围</th>
                                <th style={{ padding: '3px 8px', textAlign: 'center', color: '#666', fontWeight: 500 }}>状态</th>
                              </tr>
                            </thead>
                            <tbody>
                              {s.reportItems.filter(item => item.itemType !== 'imaging' && !(item.findings || item.diagnosis || item.conclusion)).map((item, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #f0ede8' }}>
                                  <td style={{ padding: '3px 8px', color: '#1A2B24' }}>{item.name}</td>
                                  <td style={{ padding: '3px 8px', textAlign: 'right', color: item.status === 'abnormal' ? '#DC3545' : item.status === 'attention' ? '#D97706' : '#1A2B24', fontWeight: item.status === 'abnormal' ? 600 : 400 }}>
                                    {item.value || '-'}{item.unit ? ` ${item.unit}` : ''}
                                  </td>
                                  <td style={{ padding: '3px 8px', textAlign: 'right', color: '#aaa', fontSize: 11 }}>{item.referenceRange || item.reference || '-'}</td>
                                  <td style={{ padding: '3px 8px', textAlign: 'center' }}>
                                    {item.status === 'abnormal' && <span style={{ fontSize: 11, color: '#DC3545', fontWeight: 600 }}>↑↓异常</span>}
                                    {item.status === 'attention' && <span style={{ fontSize: 11, color: '#D97706', fontWeight: 600 }}>注意</span>}
                                    {item.status === 'normal' && <span style={{ fontSize: 11, color: '#22A06B' }}>正常</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {/* 超声、CT、TCT、内镜等检查项目：完整展示健管专员审核确认的所见与结论。 */}
                      {s.reportItems?.some(item => item.itemType === 'imaging' || item.findings || item.diagnosis || item.conclusion) && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, color: '#4A6558', fontWeight: 600, marginBottom: 6 }}>检查项目及结果</div>
                          {s.reportItems
                            .filter(item => item.itemType === 'imaging' || item.findings || item.diagnosis || item.conclusion)
                            .map((item, i) => (
                              <div key={i} style={{ padding: '9px 10px', marginBottom: 7, background: '#fff', border: '1px solid #e8f0ec', borderRadius: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 5 }}>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: '#1A2B24' }}>{item.name || '检查项目'}</span>
                                  <span style={{
                                    flexShrink: 0, fontSize: 11, fontWeight: 600,
                                    color: item.status === 'abnormal' ? '#DC3545' : item.status === 'attention' ? '#D97706' : '#22A06B',
                                  }}>
                                    {item.status === 'abnormal' ? '异常' : item.status === 'attention' ? '注意' : item.status === 'normal' ? '正常' : '待确认'}
                                  </span>
                                </div>
                                {(item.findings || item.value) && (
                                  <div style={{ fontSize: 12, lineHeight: 1.65, color: '#33443d', whiteSpace: 'pre-wrap', marginTop: 3 }}>
                                    <span style={{ color: '#8AA89C' }}>检查所见：</span>{item.findings || `${item.value}${item.unit ? ` ${item.unit}` : ''}`}
                                  </div>
                                )}
                                {item.diagnosis && (
                                  <div style={{ fontSize: 12, lineHeight: 1.65, color: '#1A2B24', whiteSpace: 'pre-wrap', marginTop: 3 }}>
                                    <span style={{ color: '#8AA89C' }}>诊断意见：</span>{item.diagnosis}
                                  </div>
                                )}
                                {item.conclusion && item.conclusion !== item.diagnosis && (
                                  <div style={{ fontSize: 12, lineHeight: 1.65, color: '#1E6B50', whiteSpace: 'pre-wrap', marginTop: 3 }}>
                                    <span style={{ color: '#8AA89C' }}>主要结论：</span>{item.conclusion}
                                  </div>
                                )}
                              </div>
                            ))}
                        </div>
                      )}
                      {/* 影像/功能检查 */}
                      {s.examDescription && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ fontSize: 11, color: '#4A6558', fontWeight: 600, marginBottom: 3 }}>描述</div>
                          {(s.examDescription || '').split('\n\n').filter(Boolean).map((block, bi) => {
                            const nameM = block.match(/^【(.+?)】/)
                            const name = nameM ? nameM[1] : null
                            const mainConc = name && (s.examMainConclusions || {})[name]
                            const text = block.replace(/^【.+?】\n?/, '').trim()
                            return (
                              <div key={bi} style={{ marginBottom: 4 }}>
                                {name && <span style={{ fontSize: 11, fontWeight: 600, color: '#1E40AF' }}>【{name}】</span>}
                                {mainConc && <span style={{ fontSize: 12, color: '#5B21B6', fontWeight: 600, marginLeft: 6 }}>{mainConc}</span>}
                                {text && <div style={{ fontSize: 12, color: '#1A2B24', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginTop: 2 }}>{text}</div>}
                              </div>
                            )
                          })}
                        </div>
                      )}
                      {s.examConclusion && (
                        <div>
                          <div style={{ fontSize: 11, color: '#4A6558', fontWeight: 600, marginBottom: 3 }}>结论</div>
                          <div style={{ fontSize: 12, color: '#1A2B24', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{s.examConclusion}</div>
                        </div>
                      )}
                      {s.note && (
                        <div style={{ marginTop: 6, fontSize: 12, color: '#8AA89C', fontStyle: 'italic' }}>{s.note}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, color: '#8AA89C', marginBottom: 8 }}>报告文件</div>
                {reportDetailLoading ? (
                  <div style={{ padding: '16px 0', textAlign: 'center', color: '#8AA89C', fontSize: 13 }}>加载中…</div>
                ) : (showReportDetail.content || showReportDetail.fileUrl) ? (() => {
                  // 一份报告可能关联多张照片(如"结论页"+"数据页"，见 fileUrls)。content 场景只有单个
                  // data URI，没有多图概念，仍走单文件展示；fileUrls 存在且 >1 张时逐张列出，
                  // 否则退化为单文件展示，兼容旧数据(只有fileUrl没有fileUrls的历史报告)。
                  const reportPreviewUrls = showReportDetail.previewUrls?.length ? showReportDetail.previewUrls : showReportDetail.fileUrls
                  const multiUrls = (!showReportDetail.content && reportPreviewUrls && reportPreviewUrls.length > 1)
                    ? reportPreviewUrls : null
                  if (multiUrls) {
                    const isPdf = showReportDetail.mimeType === 'application/pdf'
                    const sizeKB = showReportDetail.fileSize ? Math.round(Number(showReportDetail.fileSize) / 1024) : null
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ fontSize: 12, color: '#8AA89C' }}>
                          共 {multiUrls.length} 张照片合并为一份报告
                          {sizeKB ? `，合计 ${sizeKB >= 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`}` : ''}
                        </div>
                        {multiUrls.map((u, idx) => {
                          const src = u.startsWith('/') ? API_ORIGIN + u : u
                          return (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#F6F9F7', borderRadius: 8, border: '1px solid #D8EDE3' }}>
                              <span style={{ fontSize: 24, lineHeight: 1 }}>{isPdf ? '📄' : '🖼️'}</span>
                              <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#1A2B24' }}>第 {idx + 1} 张</div>
                              <button className="btn btn-primary btn-sm" onClick={() => isPdf ? window.open(src, '_blank') : setPreviewImageUrl(src)}>查看</button>
                            </div>
                          )
                        })}
                      </div>
                    )
                  }
                  const rawSrc = showReportDetail.content || showReportDetail.previewUrl || showReportDetail.fileUrl
                  const src = rawSrc.startsWith('/') ? API_ORIGIN + rawSrc : rawSrc
                  const isPdf = showReportDetail.mimeType === 'application/pdf' || rawSrc.includes('.pdf') || rawSrc.startsWith('data:application/pdf')
                  const isImg = showReportDetail.mimeType?.startsWith('image/') || rawSrc.startsWith('data:image')
                  const sizeKB = showReportDetail.fileSize ? Math.round(Number(showReportDetail.fileSize) / 1024) : null
                  const ext = isPdf ? '.pdf' : isImg ? (showReportDetail.mimeType === 'image/png' ? '.png' : '.jpg') : ''
                  const displayName = showReportDetail.title ? `${showReportDetail.title}${ext}` : (isPdf ? 'PDF 文件' : isImg ? '图片文件' : '附件')
                  const canRotateSave = isImg && showReportDetail.audit_status !== 'audited'
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#F6F9F7', borderRadius: 8, border: '1px solid #D8EDE3' }}>
                      <span style={{ fontSize: 28, lineHeight: 1 }}>{isPdf ? '📄' : isImg ? '🖼️' : '📎'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: 13, color: '#1A2B24', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</div>
                        {sizeKB && <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 2 }}>{sizeKB >= 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`}</div>}
                      </div>
                      <button className="btn btn-primary btn-sm" onClick={() => { setPreviewRotation(0); setPreviewImageUrl(canRotateSave ? { url: src, reportId: showReportDetail._id } : src) }}>查看</button>
                    </div>
                  )
                })() : (
                  <div style={{ padding: '12px 0' }}>
                    <div style={{ color: '#B0C4BB', fontSize: 13, marginBottom: 8 }}>暂无文件</div>
                    {showReportDetail.sharedFile && (() => {
                      const sf = showReportDetail.sharedFile
                      const sfSrc = sf.fileUrl?.startsWith('/') ? API_ORIGIN + sf.fileUrl : sf.fileUrl
                      const sfPdf = sf.mimeType === 'application/pdf' || sf.fileUrl?.includes('.pdf')
                      return (
                        <div style={{ marginBottom: 10, padding: '10px 14px', background: '#FFF8EC', borderRadius: 8, border: '1px solid #FDEEC8', display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 22 }}>{sfPdf ? '📄' : '🖼️'}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, color: '#D97706', fontWeight: 600, marginBottom: 2 }}>同日综合报告（审核参考）</div>
                            <div style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sf.title || '体检报告'}</div>
                          </div>
                          <button className="btn btn-sm" style={{ background: '#FEF3E2', color: '#D97706', border: '1px solid #FDEEC8', whiteSpace: 'nowrap' }}
                            onClick={() => sfPdf ? window.open(sfSrc, '_blank') : setPreviewImageUrl(sfSrc)}>查看</button>
                        </div>
                      )
                    })()}
                    {showReportDetail.audit_status !== 'audited' && (
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 6, border: '1px dashed #B0C4BB', color: '#4A6558', fontSize: 13, cursor: 'pointer' }}>
                        📎 补传文件
                        <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
                          onChange={async (e) => {
                            const file = e.target.files[0]
                            if (!file) return
                            try {
                              const { url, ossKey, mimeType, fileSize } = await staffAPI.uploadReportFile(file, () => {})
                              const updated = await staffAPI.updateReport(showReportDetail._id, {
                                fileUrl: url, fileUrls: [url], ossKey, ossKeys: ossKey ? [ossKey] : [], mimeType, fileSize: String(fileSize), content: ''
                              })
                              setShowReportDetail(updated.data)
                              toast('文件已上传')
                            } catch (err) { toast(err.message || '上传失败') }
                          }} />
                      </label>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer" style={{ flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
              {/* 审核操作区：仅当报告待审核时展示。2026-07-21修复：确认AI结果(aiStatus→reviewed)
                  现在会自动把audit_status一并置为audited(见PATCH /medical-reports/:id)，这里的
                  独立审核入口此前可以绕过AI结果确认、直接把audit_status设audited，导致健康顾问
                  拿到的是未经健管核对过的AI原始提取数据。收紧：走过AI解析流程(aiStatus不是none)
                  的报告必须先在"审核AI结果"弹窗确认，这里不再单独放行；居家监测/功能医学检测等
                  本就不支持AI解析的报告(aiStatus一直是none)保留原有直接审核通道，否则永远无法审核。 */}
              {showReportDetail.audit_status !== 'audited' && showReportDetail.audit_status !== 'rejected'
                && showReportDetail.aiStatus === 'none' && (
                <>
                  {showRejectInput ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <textarea
                        className="form-input"
                        rows={2}
                        placeholder="请填写驳回原因"
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        style={{ fontSize: 13 }}
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-danger btn-sm" style={{ flex: 1 }}
                          disabled={auditLoading || !rejectReason.trim()}
                          onClick={() => handleAudit('reject')}>
                          确认驳回
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => { setShowRejectInput(false); setRejectReason('') }}>取消</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary btn-sm" style={{ flex: 1 }}
                        disabled={auditLoading}
                        onClick={() => handleAudit('approve')}>
                        ✓ 审核通过
                      </button>
                      <button className="btn btn-secondary btn-sm" style={{ flex: 1 }}
                        onClick={() => setShowRejectInput(true)}>
                        ✕ 驳回
                      </button>
                    </div>
                  )}
                </>
              )}
              {showReportDetail.audit_status !== 'audited' && showReportDetail.audit_status !== 'rejected'
                && showReportDetail.aiStatus !== 'none' && (
                <div style={{ fontSize: 12, color: '#8AA89C', textAlign: 'center', padding: '4px 0' }}>
                  请在"审核AI结果"里确认检验数据，确认后自动完成审核
                </div>
              )}
              <button className="btn btn-secondary" onClick={() => { setShowReportDetail(null); setShowRejectInput(false); setRejectReason('') }}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* OCR 识别结果审核弹窗 */}
      {ocrReviewReport && (() => {
        const STATUS_OPTS = [
          { v: 'normal',    label: '正常', color: '#22A06B' },
          { v: 'abnormal',  label: '异常', color: '#DC3545' },
          { v: 'attention', label: '注意', color: '#D97706' },
          { v: 'unknown',   label: '未知', color: '#8AA89C' },
        ]
        const TYPE_OPTS = [
          { v: 'lab',     label: '检验' },
          { v: 'imaging', label: '影像/文字' },
          { v: 'data',    label: '数据曲线' },
        ]
        const updItem = (i, patch) => setOcrEditItems(arr => arr.map((it, idx) => idx === i ? { ...it, ...patch } : it))
        const delItem = (i) => setOcrEditItems(arr => arr.filter((_, idx) => idx !== i))
        const addItem = () => setOcrEditItems(arr => [...arr, { name: '', value: '', unit: '', referenceRange: '', status: 'normal', itemType: 'lab' }])
        const abnormalCount = ocrEditItems.filter(it => it.status === 'abnormal' || it.status === 'attention').length
        const sourcePages = [...new Set(ocrEditItems.map(it => Number(it.sourcePage)).filter(Number.isFinite).filter(n => n > 0))].sort((a, b) => a - b)
        const firstSourcePage = sourcePages[0] || 1
        const lastSourcePage = sourcePages[sourcePages.length - 1] || firstSourcePage
        const expectedPages = Array.from({ length: Math.max(1, lastSourcePage - firstSourcePage + 1) }, (_, i) => firstSourcePage + i)
        const activePage = ocrReviewPage || firstSourcePage
        const activePageParse = Number(ocrReviewReport.pageParseStatus?.pageNum) === activePage ? ocrReviewReport.pageParseStatus : null
        const pageParsing = activePageParse?.status === 'processing'
        const missingPages = expectedPages.filter(page => !sourcePages.includes(page))
        // 专项筛查归类：选项分组 + 手动归类
        // screeningCatalog 来自后端 /screening-catalog，数据源为 admin 配置的「专项筛查项目」（LabTestPackage）
        // 格式：[{ label: 'L1分类名', opts: [{value: 'L1|packageName|itemName', label: '...', groupLabel: 'L1分类名'}] }]
        const classifyGroups = screeningCatalog.map(cat => ({
          label: cat.label,
          opts: (cat.opts || []),
        }))
        const setClassify = (i, key) => {
          // 2026-07-09修复：医护手动改归类时必须同步 screeningKeys 数组。
          // 后端展示层(GET screening)和写入层(syncScreeningItems)都优先读 screeningKeys 数组，
          // 只改单值 screeningKey 而不动数组，会导致「人工改了归类但仍按 AI 二次模糊匹配的旧错值展示/写入」
          // ——正是金娟反馈的"尿转铁蛋白改了没用还归到肿瘤铁蛋白"的根因。清空归类时数组也一并清空。
          if (!key) return updItem(i, { screeningKey: '', screeningKeys: [], screeningCategory: '', screeningParent: '', matchStatus: 'unclassified', matchConfidence: 0 })
          const parts = key.split('|')
          updItem(i, { screeningKey: key, screeningKeys: [key], screeningCategory: parts[0], screeningParent: parts[1], matchStatus: 'matched', matchConfidence: 1 })
        }
        const matchedN = ocrEditItems.filter(it => it.matchStatus === 'matched' && it.screeningKey).length
        const unclassifiedN = ocrEditItems.length - matchedN
        // 所有可选归类项打平，供搜索用
        const allClassifyOpts = classifyGroups.flatMap(g => g.opts.map(o => ({ ...o, groupLabel: g.label })))
        const classifyCell = (it, i) => {
          const isOpen = !!ocrClassifyOpen[i]
          const q = (ocrClassifySearch[i] ?? (it.screeningKey ? allClassifyOpts.find(o => o.value === it.screeningKey)?.label || '' : '')).toLowerCase()
          const filtered = q.length >= 1
            ? allClassifyOpts.filter(o => o.label.toLowerCase().includes(q) || o.groupLabel.toLowerCase().includes(q))
            : allClassifyOpts
          const displayText = it.screeningKey ? (allClassifyOpts.find(o => o.value === it.screeningKey)?.label || it.screeningKey) : ''
          // 2026-07-21修复(第二版)：第一版用 window.innerHeight 判断可用空间，但下拉框真正的裁切边界
          // 是表格所在的 modal-body(overflow:auto 滚动容器)，不是浏览器视口——modal 顶部本身离视口
          // 顶部可能还有一截空白，靠视口空间判断会误判"上方空间充足"，实际早被 modal-body 顶部裁切。
          // 改成用 ocrModalBodyRef(滚动容器)的边界计算该行上下实际可用空间。
          if (!ocrClassifyWrapRefs.current[i]) ocrClassifyWrapRefs.current[i] = { current: null }
          const wrapRef = ocrClassifyWrapRefs.current[i]
          const dropUp = ocrClassifyDropUp[i] !== false
          const handleFocus = () => {
            const el = wrapRef.current
            const container = ocrModalBodyRef.current
            if (el && container) {
              const r = el.getBoundingClientRect()
              const c = container.getBoundingClientRect()
              const spaceAbove = r.top - c.top
              const spaceBelow = c.bottom - r.bottom
              setOcrClassifyDropUp(p => ({ ...p, [i]: spaceAbove >= 160 || spaceAbove >= spaceBelow }))
            }
            setOcrClassifyOpen(p => ({ ...p, [i]: true }))
            setOcrClassifySearch(p => ({ ...p, [i]: '' }))
          }
          return (
            <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${it.screeningKey ? '#A7F3D0' : '#FCD34D'}`, borderRadius: 4, background: it.screeningKey ? '#F0FDF4' : '#FFFBEB', overflow: 'hidden' }}>
                <input
                  style={{ flex: 1, padding: '3px 4px', fontSize: 11, border: 'none', background: 'transparent', outline: 'none', color: it.screeningKey ? '#1E6B50' : '#D97706', minWidth: 0 }}
                  placeholder="⚠ 待归类（可搜索）"
                  value={ocrClassifySearch[i] !== undefined ? ocrClassifySearch[i] : displayText}
                  onFocus={handleFocus}
                  onBlur={() => setTimeout(() => { setOcrClassifyOpen(p => ({ ...p, [i]: false })); setOcrClassifySearch(p => { const n = { ...p }; delete n[i]; return n }) }, 180)}
                  onChange={e => setOcrClassifySearch(p => ({ ...p, [i]: e.target.value }))}
                />
                {it.screeningKey && (
                  <button onClick={() => setClassify(i, '')} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', padding: '0 4px', fontSize: 12, lineHeight: 1, flexShrink: 0 }}>✕</button>
                )}
              </div>
              {isOpen && (
                // 表格外层容器(modal-body)是 overflow:auto 的滚动区域，下拉列表无论往上或往下弹，
                // 只要固定方向就可能被 modal 边界裁切。dropUp 由 handleFocus 里实测的上下可用空间决定。
                <div style={{ position: 'absolute', ...(dropUp ? { bottom: '100%', marginBottom: 2 } : { top: '100%', marginTop: 2 }), left: 0, right: 0, zIndex: 1000, background: '#fff', border: '1px solid #E0D9CE', borderRadius: 4, boxShadow: dropUp ? '0 -4px 16px rgba(0,0,0,0.12)' : '0 4px 16px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto' }}>
                  <div onMouseDown={() => setClassify(i, '')} style={{ padding: '5px 8px', fontSize: 11, color: '#D97706', cursor: 'pointer', borderBottom: '1px solid #f5f2ec' }}>⚠ 清除归类</div>
                  {filtered.length === 0 && <div style={{ padding: '8px', fontSize: 11, color: '#aaa', textAlign: 'center' }}>无匹配结果</div>}
                  {filtered.map(o => (
                    <div key={o.value} onMouseDown={() => { setClassify(i, o.value); setOcrClassifyOpen(p => ({ ...p, [i]: false })) }}
                      style={{ padding: '5px 8px', fontSize: 11, cursor: 'pointer', color: o.value === it.screeningKey ? '#1E6B50' : '#1A2B24', background: o.value === it.screeningKey ? '#F0FDF4' : 'transparent', borderBottom: '1px solid #f9f7f4' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#F0FDF4'}
                      onMouseLeave={e => e.currentTarget.style.background = o.value === it.screeningKey ? '#F0FDF4' : 'transparent'}>
                      <span style={{ fontSize: 10, color: '#8AA89C', marginRight: 4 }}>{o.groupLabel}</span>{o.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        }
        return (
          // 审核内容多且耗时，鼠标稍微移出弹窗点到遮罩层就会误触关闭丢失未保存的编辑，去掉点遮罩关闭，
          // 只能点右上角✕关闭（2026-07-13 反馈：之前只改了纯查看用的"体检报告详情弹窗"，这个才是真正
          // 审核AI识别结果、会长时间编辑的弹窗，之前漏改了）
          <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: 1120, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
              <div className="modal-header" style={{ flexShrink: 0 }}>
                <h3 className="modal-title">审核AI识别结果 · {ocrReviewReport.title}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', marginRight: 12 }}>
                  <button className="btn btn-secondary btn-sm" disabled={activePage <= firstSourcePage} onClick={() => setOcrReviewPage(p => Math.max(firstSourcePage, (p || firstSourcePage) - 1))}>上一页</button>
                  <select value={activePage} onChange={e => setOcrReviewPage(Number(e.target.value))} style={{ padding: '5px 8px', border: '1px solid #D8EDE3', borderRadius: 6 }}>
                    {expectedPages.map(page => <option key={page} value={page}>第 {page} 页{missingPages.includes(page) ? '（无提取数据）' : ''}</option>)}
                  </select>
                  <button className="btn btn-secondary btn-sm" disabled={activePage >= lastSourcePage} onClick={() => setOcrReviewPage(p => Math.min(lastSourcePage, (p || firstSourcePage) + 1))}>下一页</button>
                </div>
                <button className="modal-close" onClick={() => setOcrReviewReport(null)}>✕</button>
              </div>
              <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
                {/* 左：原始报告预览 */}
                {(() => {
                  const paneStyle = { width: '40%', borderRight: '1px solid #E0D9CE', overflow: 'auto', flexShrink: 0, background: '#F6F9F7', padding: 8 }
                  // 一份报告可能关联多张照片(fileUrls，如"结论页"+"数据页")。content 场景没有多图概念，
                  // 仍走单文件预览；fileUrls 有多张时全部展示，不再只取第一张，避免审核时看不到其余照片。
                  const reportPreviewUrls = ocrReviewReport.previewUrls?.length ? ocrReviewReport.previewUrls : ocrReviewReport.fileUrls
                  const multiUrls = (!ocrReviewReport.content && reportPreviewUrls && reportPreviewUrls.length > 1)
                    ? reportPreviewUrls : null
                  if (multiUrls) {
                    const isPdf = ocrReviewReport.mimeType === 'application/pdf'
                    return (
                      <div style={paneStyle}>
                        <div style={{ fontSize: 11, color: '#8AA89C', padding: '2px 4px 6px' }}>原始报告（共{multiUrls.length}张，对照核对）</div>
                        {multiUrls.map((u, idx) => {
                          if (idx + 1 !== activePage) return null
                          const s = u.startsWith('/') ? API_ORIGIN + u : u
                          return isPdf ? (
                            <div key={idx} style={{ marginBottom: 8 }}>
                              <div style={{ fontSize: 10, color: '#8AA89C', margin: '4px 0' }}>第 {idx + 1} 张</div>
                              <iframe src={`${s}#page=${activePage}`} title={`报告${idx + 1}`} style={{ width: '100%', height: '74vh', border: 'none', borderRadius: 6, background: '#fff' }} />
                            </div>
                          ) : (
                            <div key={idx} style={{ marginBottom: 8 }}>
                              <div style={{ fontSize: 10, color: '#8AA89C', margin: '4px 0' }}>第 {idx + 1} 张</div>
                              <img src={s} alt={`报告${idx + 1}`} style={{ width: '100%', borderRadius: 6, cursor: 'zoom-in' }} onClick={() => setPreviewImageUrl(s)} />
                            </div>
                          )
                        })}
                      </div>
                    )
                  }
                  const rawSrc = ocrReviewReport.content || ocrReviewReport.previewUrl || ocrReviewReport.fileUrl || (ocrReviewReport.fileUrls && ocrReviewReport.fileUrls[0]) || ''
                  if (!rawSrc) return <div style={{ ...paneStyle, color: '#B0C4BB', fontSize: 13, padding: 16 }}>无原始文件可预览</div>
                  const src = rawSrc.startsWith('/') ? API_ORIGIN + rawSrc : rawSrc
                  const isPdf = ocrReviewReport.mimeType === 'application/pdf' || rawSrc.includes('.pdf') || rawSrc.startsWith('data:application/pdf')
                  const isImg = ocrReviewReport.mimeType?.startsWith('image/') || rawSrc.startsWith('data:image') || /\.(png|jpe?g|webp|gif)$/i.test(rawSrc)
                  return (
                    <div style={paneStyle}>
                      <div style={{ fontSize: 11, color: '#8AA89C', padding: '2px 4px 6px' }}>原始报告（对照核对）</div>
                      {isImg ? (
                        <img src={src} alt="报告" style={{ width: '100%', borderRadius: 6, cursor: 'zoom-in' }} onClick={() => setPreviewImageUrl(src)} />
                      ) : isPdf ? (
                        <iframe src={`${src}#page=${activePage}`} title={`报告PDF第${activePage}页`} style={{ width: '100%', height: '74vh', border: 'none', borderRadius: 6, background: '#fff' }} />
                      ) : (
                        <button className="btn btn-primary btn-sm" onClick={() => window.open(src, '_blank')}>打开文件</button>
                      )}
                    </div>
                  )
                })()}
              <div className="modal-body" ref={ocrModalBodyRef} style={{ overflowY: 'auto', flex: 1, minWidth: 0 }}>
                {activePageParse && (
                  <div style={{ margin: '10px 12px 0', padding: '9px 12px', borderRadius: 7, fontSize: 12, background: pageParsing ? '#FFF8E6' : activePageParse.status === 'success' ? '#F0FDF4' : '#FFF0F0', color: pageParsing ? '#9A6700' : activePageParse.status === 'success' ? '#1E6B50' : '#B42318' }}>
                    {pageParsing ? `第${activePage}页正在补提，请稍候，完成后本页会自动刷新。` : activePageParse.message}
                  </div>
                )}
                {(() => {
                  const inp = { width: '100%', padding: '4px 6px', border: '1px solid #E0D9CE', borderRadius: 4, fontSize: 12, boxSizing: 'border-box' }
                  // 后端已经按报告页码和页内位置保存顺序；审核层只按该顺序展示，不再按类型重排。
                  const indexedAll = ocrEditItems.map((it, i) => ({ it, i }))
                  const indexed = indexedAll.filter(({ it }) => !it.sourcePage || Number(it.sourcePage) === activePage)
                  const reviewedCount = indexedAll.filter(({ it }) => it.manualReviewStatus === 'reviewed').length
                  const pageAllReviewed = indexed.length > 0 && indexed.every(({ it }) => it.manualReviewStatus === 'reviewed')
                  // 影像/描述判定：标了 imaging，或数值是长文本（>40字，基本是诊断描述而非检验值）
                  const isImaging = (it) => it.itemType === 'imaging' || (it.value || '').length > 40
                  const labRows = indexed.filter(({ it }) => !isImaging(it))
                  const imgRows = indexed.filter(({ it }) => isImaging(it))
                  const abn = labRows.map(x => x.it).filter(it => it.status === 'abnormal' || it.status === 'attention')
                  const abnN = abn.filter(it => it.status === 'abnormal').length
                  const attN = abn.filter(it => it.status === 'attention').length
                  return (
                    <>
                      {/* 异常快览：只看检验数值类异常，短标签一眼可见 */}
                      <div style={{ padding: '12px 14px', background: abn.length ? '#FFF7F5' : '#F3FAF6', borderRadius: 8, marginBottom: 12, border: `1px solid ${abn.length ? '#FAD9D2' : '#CDEBDD'}` }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1A2B24', marginBottom: abn.length ? 8 : 0 }}>
                          检验指标 {labRows.length} 项{imgRows.length > 0 ? ` · 影像/检查 ${imgRows.length} 项` : ''}
                          {abnN > 0 && <span style={{ color: '#DC3545', marginLeft: 8 }}>异常 {abnN}</span>}
                          {attN > 0 && <span style={{ color: '#D97706', marginLeft: 8 }}>注意 {attN}</span>}
                          {abn.length === 0 && <span style={{ color: '#22A06B', marginLeft: 8, fontWeight: 400 }}>· 检验值未见异常</span>}
                          <span style={{ marginLeft: 8, fontWeight: 400, color: '#1E6B50' }}>· 已自动归类 {matchedN} 项（将写入专项筛查）</span>
                          <span style={{ marginLeft: 8, fontWeight: 400, color: reviewedCount === indexedAll.length ? '#16A34A' : '#D97706' }}>· 人工已核对 {reviewedCount}/{indexedAll.length}</span>
                        </div>
                        {abn.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {abn.map((it, k) => (
                              <span key={k} style={{ fontSize: 12, padding: '3px 9px', borderRadius: 12, background: it.status === 'abnormal' ? '#FDE5E2' : '#FEF1E0', color: it.status === 'abnormal' ? '#DC3545' : '#D97706', fontWeight: 500 }}>
                                {it.name}{it.value ? ` ${it.value}${it.unit || ''}` : ''}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* AI文字分析：折叠收起 */}
                      {ocrReviewReport.aiSummary && (
                        <details style={{ marginBottom: 14 }}>
                          <summary style={{ cursor: 'pointer', fontSize: 12, color: '#7C3AED', userSelect: 'none', padding: '4px 0' }}>📄 展开 AI 文字分析（含影像/超声诊断意见）</summary>
                          <div style={{ marginTop: 6, padding: '10px 14px', background: '#F3EFFB', borderRadius: 8, fontSize: 12, color: '#4A3A6B', lineHeight: 1.7, maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                            {ocrReviewReport.aiSummary}
                          </div>
                        </details>
                      )}


                      {/* 严格按 reportItems 原序渲染，检验和检查不再拆区 */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E6B50' }}>报告原序（{indexed.length} 项）</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => {
                            const pageIndexes = new Set(indexed.map(({ i }) => i))
                            setOcrEditItems(items => items.map((item, i) => pageIndexes.has(i) ? {
                              ...item,
                              manualReviewStatus: pageAllReviewed ? 'pending' : 'reviewed',
                              manualReviewedAt: pageAllReviewed ? null : (item.manualReviewedAt || new Date().toISOString()),
                            } : item))
                          }}>{pageAllReviewed ? '撤销本页已核对' : '✓ 标记本页已核对'}</button>
                          <button className="btn btn-secondary btn-sm" onClick={addItem}>＋ 新增检验项</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => setOcrEditItems(arr => [...arr, { name: '', itemType: 'imaging', bodyPart: '', findings: '', diagnosis: '', conclusion: '', status: 'unknown' }])}>＋ 新增检查项</button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                        {indexed.map(({ it, i }) => {
                          const sc = STATUS_OPTS.find(s => s.v === it.status)?.color || '#8AA89C'
                          const isFocusedItem = ocrFocusItemIndex === i
                          return (
                            <div key={i} ref={node => { if (node) ocrItemRefs.current[i] = node; else delete ocrItemRefs.current[i] }}
                              style={{ border: isFocusedItem ? '2px solid #7C3AED' : '1px solid #E0D9CE', borderRadius: 8, padding: '10px 12px', background: isFocusedItem ? '#F5F3FF' : (isImaging(it) ? '#fafaf8' : '#fff'), boxShadow: isFocusedItem ? '0 0 0 3px rgba(124,58,237,.12)' : 'none' }}>
                              {isFocusedItem && <div style={{ fontSize: 11, color: '#7C3AED', fontWeight: 800, marginBottom: 6 }}>已定位到需要核对归属的项目</div>}
                              <div style={{ fontSize: 10, color: isImaging(it) ? '#0369A1' : '#7C3AED', fontWeight: 700, marginBottom: 6 }}>
                                {it.sourcePage ? `原报告 P${it.sourcePage} · ` : ''}第 {i + 1} 项 · {isImaging(it) ? '检查/影像' : '检验/数值'}{it.sourceSection ? ` · ${it.sourceSection}` : ''}{it.orderName ? ` · ${it.orderName}` : ''}
                                <button onClick={() => updItem(i, {
                                  manualReviewStatus: it.manualReviewStatus === 'reviewed' ? 'pending' : 'reviewed',
                                  manualReviewedAt: it.manualReviewStatus === 'reviewed' ? null : (it.manualReviewedAt || new Date().toISOString()),
                                })} style={{ marginLeft: 8, padding: '2px 7px', borderRadius: 999, border: `1px solid ${it.manualReviewStatus === 'reviewed' ? '#86EFAC' : '#FCD34D'}`, background: it.manualReviewStatus === 'reviewed' ? '#F0FDF4' : '#FFFBEB', color: it.manualReviewStatus === 'reviewed' ? '#15803D' : '#A16207', cursor: 'pointer', fontSize: 10, fontWeight: 700 }}>
                                  {it.manualReviewStatus === 'reviewed' ? '✓ 已核对' : '待核对'}
                                </button>
                              </div>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                                <div style={{ flex: 2 }}>
                                  {isImaging(it) && <div style={{ fontSize: 10, color: '#8AA89C', marginBottom: 2 }}>原报告项目</div>}
                                  <input style={{ ...inp, fontWeight: 600, width: '100%' }} value={it.name || ''} placeholder="项目名称" onChange={e => updItem(i, { name: e.target.value })} />
                                </div>
                                {isImaging(it) ? (
                                  <div style={{ width: 110 }}>
                                    <div style={{ fontSize: 10, color: '#8AA89C', marginBottom: 2 }}>检查部位</div>
                                    <input style={{ ...inp, width: '100%' }} value={it.bodyPart || ''} placeholder="可留空" onChange={e => updItem(i, { bodyPart: e.target.value })} />
                                  </div>
                                ) : <>
                                  <input style={{ ...inp, flex: 1, color: sc }} value={it.value || ''} placeholder="数值" onChange={e => updItem(i, { value: e.target.value })} />
                                  <input style={{ ...inp, width: 70 }} value={it.unit || ''} placeholder="单位" onChange={e => updItem(i, { unit: e.target.value })} />
                                  <input style={{ ...inp, flex: 1 }} value={it.referenceRange || ''} placeholder="参考范围" onChange={e => updItem(i, { referenceRange: e.target.value })} />
                                </>}
                                <select style={{ ...inp, width: 80, color: sc, fontWeight: 600 }} value={it.status || 'unknown'} onChange={e => updItem(i, { status: e.target.value })}>{STATUS_OPTS.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}</select>
                                <button
                                  title={`在“${it.name || '当前项目'}”下方新增${isImaging(it) ? '检查' : '检验'}项`}
                                  onClick={() => setOcrEditItems(arr => [
                                    ...arr.slice(0, i + 1),
                                    isImaging(it)
                                      ? { name: '', itemType: 'imaging', bodyPart: '', findings: '', diagnosis: '', conclusion: '', status: 'unknown' }
                                      : { name: '', value: '', unit: '', referenceRange: '', status: 'normal', itemType: it.itemType === 'data' ? 'data' : 'lab', orderName: it.orderName || '' },
                                    ...arr.slice(i + 1),
                                  ])}
                                  style={{ whiteSpace: 'nowrap', padding: '4px 7px', border: `1px solid ${isImaging(it) ? '#BAE6FD' : '#C4B5FD'}`, borderRadius: 4, background: isImaging(it) ? '#F0F9FF' : '#F3EFFB', color: isImaging(it) ? '#0369A1' : '#7C3AED', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                                  下方新增
                                </button>
                                <button onClick={() => delItem(i)} style={{ background: 'none', border: 'none', color: '#DC3545', cursor: 'pointer', fontSize: 14 }}>✕</button>
                              </div>
                              {isImaging(it) && <>
                                <div style={{ fontSize: 11, color: '#4A6558', fontWeight: 600, margin: '2px 0' }}>检查结果（原报告同行内容）</div>
                                <textarea style={{ ...inp, minHeight: 58, lineHeight: 1.6, resize: 'vertical', marginBottom: 6 }} value={it.findings || ''} placeholder="该项目对应的完整原文结果" onChange={e => updItem(i, { findings: e.target.value })} />
                                <textarea style={{ ...inp, minHeight: 42, lineHeight: 1.6, resize: 'vertical', marginBottom: 6 }} value={it.diagnosis || ''} placeholder="诊断意见" onChange={e => updItem(i, { diagnosis: e.target.value })} />
                                <input style={{ ...inp, background: '#F3EFFB', borderColor: '#C4B5FD', marginBottom: 6 }} value={it.conclusion || ''} placeholder="主要结论" onChange={e => updItem(i, { conclusion: e.target.value })} />
                              </>}
                              {classifyCell(it, i)}
                            </div>
                          )
                        })}
                      </div>

                      {/* 旧的类型分区保留代码但不再展示 */}
                      <div style={{ display: 'none' }}>
                      {/* 区一：检验 / 数值指标 → 表格 */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 6px' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#1E6B50' }}>检验 / 数值指标（{labRows.length}）</span>
                        <button className="btn btn-secondary btn-sm" onClick={addItem}>＋ 新增检验项</button>
                      </div>
                      <div style={{ border: '1px solid #E0D9CE', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: '#f5f2ec', color: '#4A6558' }}>
                              <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, minWidth: 120 }}>项目名称</th>
                              <th style={{ padding: '6px 6px', textAlign: 'left', fontWeight: 600, width: 80 }}>数值</th>
                              <th style={{ padding: '6px 6px', textAlign: 'left', fontWeight: 600, width: 60 }}>单位</th>
                              <th style={{ padding: '6px 6px', textAlign: 'left', fontWeight: 600, width: 100 }}>参考范围</th>
                              <th style={{ padding: '6px 6px', textAlign: 'center', fontWeight: 600, width: 70 }}>状态</th>
                              <th style={{ padding: '6px 6px', textAlign: 'left', fontWeight: 600, minWidth: 110, color: '#7C3AED' }}>专项筛查归类</th>
                              <th style={{ padding: '6px 4px', width: 32 }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {labRows.length === 0 ? (
                              <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#aaa' }}>无检验数值项，可点「新增检验项」手动录入</td></tr>
                            ) : labRows.map(({ it, i }) => {
                              const sc = STATUS_OPTS.find(s => s.v === it.status)?.color || '#8AA89C'
                              return (
                                <React.Fragment key={i}>
                                <tr style={{ borderTop: '1px solid #f0ede8' }}>
                                  <td style={{ padding: '4px 8px' }}><input style={inp} value={it.name || ''} onChange={e => updItem(i, { name: e.target.value })} /></td>
                                  <td style={{ padding: '4px 6px' }}><input style={{ ...inp, color: sc, fontWeight: it.status === 'abnormal' ? 600 : 400 }} value={it.value || ''} onChange={e => updItem(i, { value: e.target.value })} /></td>
                                  <td style={{ padding: '4px 6px' }}><input style={inp} value={it.unit || ''} onChange={e => updItem(i, { unit: e.target.value })} /></td>
                                  <td style={{ padding: '4px 6px' }}><input style={inp} value={it.referenceRange || ''} onChange={e => updItem(i, { referenceRange: e.target.value })} /></td>
                                  <td style={{ padding: '4px 6px' }}>
                                    <select style={{ ...inp, color: sc, fontWeight: 600 }} value={it.status || 'unknown'} onChange={e => updItem(i, { status: e.target.value })}>
                                      {STATUS_OPTS.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
                                    </select>
                                  </td>
                                  <td style={{ padding: '4px 6px' }}>{classifyCell(it, i)}</td>
                                  <td style={{ padding: '4px 4px', textAlign: 'center' }}>
                                    <button onClick={() => delItem(i)} style={{ background: 'none', border: 'none', color: '#DC3545', cursor: 'pointer', fontSize: 14 }}>✕</button>
                                  </td>
                                </tr>
                                {/* 2026-07-09：普通检验项(血红蛋白/钾/氯/肌酐等)不应有"诊断意见"——那是影像/检查类项目
                                    才有的字段。AI 会给每条检验项编一句"未见异常"这类冗余诊断，用户明确反馈检验类不需要。
                                    诊断意见的展示统一收敛到下方"影像/检查描述"区(imgRows)，此处 lab 检验项区不再渲染。 */}
                                </React.Fragment>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* 区二：影像 / 检查描述 → 文本卡片（不挤进窄表格） */}
                      {(imgRows.length > 0 || true) && (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 6px' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1E6B50' }}>影像 / 检查描述（{imgRows.length}）</div>
                            <button className="btn btn-secondary btn-sm" onClick={() => setOcrEditItems(arr => [...arr, { name: '', itemType: 'imaging', bodyPart: '', findings: '', diagnosis: '', conclusion: '', status: 'unknown' }])}>＋ 新增检查项</button>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
                            {imgRows.map(({ it, i }) => {
                              const sc = STATUS_OPTS.find(s => s.v === it.status)?.color || '#8AA89C'
                              return (
                                <div key={i} style={{ border: '1px solid #E0D9CE', borderRadius: 8, padding: '10px 12px', background: '#fafaf8' }}>
                                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                                    <input style={{ ...inp, fontWeight: 600, flex: 1 }} value={it.name || ''} placeholder="检查名称（如 胸部CT、肠镜）" onChange={e => updItem(i, { name: e.target.value })} />
                                    <input style={{ ...inp, width: 110 }} value={it.bodyPart || ''} placeholder="检查部位" onChange={e => updItem(i, { bodyPart: e.target.value })} />
                                    <select style={{ ...inp, width: 80, color: sc, fontWeight: 600 }} value={it.status || 'unknown'} onChange={e => updItem(i, { status: e.target.value })}>
                                      {STATUS_OPTS.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
                                    </select>
                                    <button
                                      title="在此项之后插入一条新检查项（如从超声报告里截取单独部位，紧跟在原条目后方便复制粘贴）"
                                      onClick={() => setOcrEditItems(arr => [
                                        ...arr.slice(0, i + 1),
                                        { name: '', itemType: 'imaging', bodyPart: '', findings: '', diagnosis: '', conclusion: '', status: 'unknown' },
                                        ...arr.slice(i + 1),
                                      ])}
                                      style={{ background: 'none', border: 'none', color: '#1E6B50', cursor: 'pointer', fontSize: 14 }}>⏎+</button>
                                    <button onClick={() => delItem(i)} style={{ background: 'none', border: 'none', color: '#DC3545', cursor: 'pointer', fontSize: 14 }}>✕</button>
                                  </div>
                                  <div style={{ fontSize: 11, color: '#8AA89C', margin: '2px 0' }}>检查所见（完整原文）</div>
                                  <textarea style={{ ...inp, minHeight: 64, lineHeight: 1.6, resize: 'vertical' }} value={it.findings || ''} placeholder="检查所见，如：右肺上叶见磨玻璃结节，直径约5mm…" onChange={e => updItem(i, { findings: e.target.value })} />
                                  <div style={{ fontSize: 11, color: '#8AA89C', margin: '6px 0 2px' }}>诊断意见</div>
                                  <textarea style={{ ...inp, minHeight: 44, lineHeight: 1.6, resize: 'vertical' }} value={it.diagnosis || ''} placeholder="诊断意见，如：右肺上叶磨玻璃结节，建议3个月后复查" onChange={e => updItem(i, { diagnosis: e.target.value })} />
                                  <div style={{ fontSize: 11, color: '#7C3AED', margin: '6px 0 2px', fontWeight: 600 }}>主要结论（展示在专项筛查）</div>
                                  <input style={{ ...inp, background: '#F3EFFB', borderColor: '#C4B5FD' }} value={it.conclusion || ''} placeholder="如：右肺小结节，建议随访复查" onChange={e => updItem(i, { conclusion: e.target.value })} />
                                  <div style={{ fontSize: 11, color: '#7C3AED', margin: '6px 0 2px', fontWeight: 600 }}>专项筛查归类</div>
                                  {classifyCell(it, i)}
                                </div>
                              )
                            })}
                          </div>
                        </>
                      )}
                      </div>
                      <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 8 }}>
                        提示：AI识别可能有误，请重点核对<span style={{ color: '#DC3545' }}>异常项</span>的数值与单位。已自动归类项提交后将写入专项筛查，其余体检指标保留在报告中供查阅。
                      </div>
                    </>
                  )
                })()}
              </div>
              </div>
              <div className="modal-footer" style={{ flexShrink: 0, display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" style={{ flex: 0.7 }}
                  disabled={ocrSaving || pageParsing} onClick={handleParseCurrentPage}
                  title={`只重新提取原报告第${activePage}页，其他页保持不变`}>
                  {pageParsing ? `第${activePage}页补提中…` : ocrSaving ? '处理中…' : `补提第${activePage}页`}
                </button>
                <button className="btn btn-secondary" style={{ flex: 0.6 }}
                  disabled={ocrSaving} onClick={handleReclassifyOCR}
                  title="用最新专项筛查目录仅对待归类项目重新自动归类，已有及人工归类不受影响">
                  {ocrSaving ? '处理中…' : '🔄 重新归类'}
                </button>
                <button className="btn btn-secondary" style={{ flex: 0.6 }}
                  disabled={ocrSaving} onClick={handleSaveOCRDraft}>
                  {ocrSaving ? '保存中…' : '💾 保存草稿'}
                </button>
                <button className="btn btn-primary" style={{ flex: 1, background: '#22A06B', border: 'none' }}
                  disabled={ocrSaving} onClick={handleApproveOCR}>
                  {ocrSaving ? '保存中…' : '✓ 提交审核（写入专项筛查）'}
                </button>
                <button className="btn btn-sm" style={{ flex: 0.4, background: '#fff0f0', color: '#c00', border: '1px solid #fcc' }}
                  disabled={ocrSaving} onClick={handleRejectOCR}>
                  驳回
                </button>
                <button className="btn btn-secondary" onClick={() => setOcrReviewReport(null)}>取消</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* 问卷自动填档 · 审核写入弹窗 */}
      {archiveDraftOpen && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setArchiveDraftOpen(false) }}>
          <div className="modal" style={{ maxWidth: 860, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ flexShrink: 0 }}>
              <h3 className="modal-title">问卷自动填档 · 审核写入</h3>
              <button className="modal-close" onClick={() => setArchiveDraftOpen(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ overflowY: 'auto', flex: 1 }}>
              <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 10 }}>勾选要写入档案的字段；与已有档案冲突的已标黄并默认不勾，请人工确认。写入值可直接编辑（数组字段多个值用「、」分隔）。</div>
              {archiveDraftItems.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#aaa' }}>无可导入字段</div>
              ) : archiveDraftItems.map((it, i) => (
                <div key={i} style={{ border: `1px solid ${it.conflict ? '#FDE9B8' : '#E0D9CE'}`, background: it.conflict ? '#FFFBEB' : '#fff', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <input type="checkbox" checked={it.apply} onChange={e => setArchiveDraftItems(arr => arr.map((x, idx) => idx === i ? { ...x, apply: e.target.checked } : x))} />
                    <span style={{ fontWeight: 600, fontSize: 13, color: '#1A2B24' }}>{it.label}</span>
                    <span style={{ fontSize: 11, color: '#8AA89C' }}>{it.group}</span>
                    {it.conflict && <span style={{ fontSize: 11, color: '#D97706', background: '#FEF3E2', borderRadius: 4, padding: '1px 6px', marginLeft: 'auto' }}>与现有档案不同</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>
                    问卷题：{it.questionText} → 答：{Array.isArray(it.answer) ? it.answer.join('、') : (typeof it.answer === 'object' ? JSON.stringify(it.answer) : String(it.answer))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: '#8AA89C', flexShrink: 0 }}>写入值</span>
                    <input className="form-control" style={{ fontSize: 13 }} value={it.valueStr}
                      onChange={e => setArchiveDraftItems(arr => arr.map((x, idx) => idx === i ? { ...x, valueStr: e.target.value } : x))} />
                  </div>
                  {it.conflict && <div style={{ fontSize: 11, color: '#B45309', marginTop: 4 }}>现有档案：{it.existing}</div>}
                </div>
              ))}
            </div>
            <div className="modal-footer" style={{ flexShrink: 0 }}>
              <button className="btn btn-secondary" onClick={() => setArchiveDraftOpen(false)}>取消</button>
              <button className="btn btn-primary" disabled={archiveBusy} onClick={handleApplyArchiveDraft}>
                {archiveBusy ? '写入中…' : `写入档案（${archiveDraftItems.filter(x => x.apply).length}）`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI随访草稿审核弹窗 */}
      {reviewingDraft && (() => {
        const isDoctorDraft = reviewingDraft.type === 'doctor_followup'
        const DraftReviewModal = () => {
          const [form, setForm] = React.useState({
            title: reviewingDraft.title || '', content: reviewingDraft.content || '',
            result: reviewingDraft.result || '',
            nextDate: reviewingDraft.nextDate ? new Date(reviewingDraft.nextDate).toISOString().slice(0, 10) : '',
          })
          const [saving, setSaving] = React.useState(false)

          const handleApprove = async () => {
            setSaving(true)
            try {
              await staffAPI.reviewRoutineDraft(reviewingDraft._id, { action: 'approve', edits: { ...form, nextDate: form.nextDate || null } })
              toast('已确认入档'); setReviewingDraft(null); loadServiceRecords()
            } catch (err) { toast(err.message || '保存失败') }
            finally { setSaving(false) }
          }

          const handleDiscard = async () => {
            if (!window.confirm('确定丢弃这条AI草稿？')) return
            setSaving(true)
            try {
              await staffAPI.reviewRoutineDraft(reviewingDraft._id, { action: 'discard' })
              toast('已丢弃'); setReviewingDraft(null); loadServiceRecords()
            } catch (err) { toast(err.message || '操作失败') }
            finally { setSaving(false) }
          }

          return (
            // 审核内容含可编辑文本框，鼠标稍微移出弹窗点到遮罩层会误触关闭丢失未保存的编辑，
            // 与体检报告审核弹窗是同一类问题（2026-07-13已修两处，这处漏改），去掉点遮罩关闭
            <div className="modal-overlay">
              <div className="modal" style={{ maxWidth: 520 }}>
                <div className="modal-header">
                  <h3 className="modal-title">核对AI生成的{isDoctorDraft ? '健康顾问跟进' : '随访'}记录</h3>
                  <button className="modal-close" onClick={() => setReviewingDraft(null)}>×</button>
                </div>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {isDoctorDraft ? (
                    <div style={{ fontSize: 12, color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FCA5A5', padding: '8px 10px', borderRadius: 6 }}>
                      ⚠️ 涉及医疗沟通内容，AI仅客观提炼聊天记录，不构成诊疗建议，请医生本人核实内容准确性后再确认入档
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: '#7C3AED', background: '#7C3AED10', padding: '6px 10px', borderRadius: 6 }}>
                      此内容由AI根据与会员的聊天记录自动提炼，请核实后再确认入档
                    </div>
                  )}
                  <div>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>标题</label>
                    <input className="form-control" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>{isDoctorDraft ? '沟通要点' : '随访要点'}</label>
                    <textarea className="form-control" rows={5} value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>结论/评估</label>
                    <textarea className="form-control" rows={2} value={form.result} onChange={e => setForm(f => ({ ...f, result: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>下次随访日期（可选）</label>
                    <input type="date" className="form-control" value={form.nextDate} onChange={e => setForm(f => ({ ...f, nextDate: e.target.value }))} />
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-secondary" disabled={saving} onClick={handleDiscard}>丢弃</button>
                  <button className="btn btn-primary" disabled={saving} onClick={handleApprove}>{saving ? '保存中…' : '确认入档'}</button>
                </div>
              </div>
            </div>
          )
        }
        return <DraftReviewModal />
      })()}

      {/* 服务记录详情弹窗 */}
      {showSRDetail && (() => {
        const SRDetailModal = () => {
          const [mode, setMode] = React.useState('view') // view | edit | supplement
          const [editForm, setEditForm] = React.useState({ title: showSRDetail.title || '', content: showSRDetail.content || '', result: showSRDetail.result || '', nextDate: showSRDetail.nextDate ? new Date(showSRDetail.nextDate).toISOString().slice(0,10) : '', diseaseName: showSRDetail.diseaseName || '' })
          const [editAttachments, setEditAttachments] = React.useState(showSRDetail.attachments || [])
          const [attachUploading, setAttachUploading] = React.useState(false)
          const [suppContent, setSuppContent] = React.useState('')
          const [suppDate, setSuppDate] = React.useState(new Date().toISOString().slice(0,10))
          const [saving, setSaving] = React.useState(false)
          const [editingSuppId, setEditingSuppId] = React.useState(null)
          const [editSuppContent, setEditSuppContent] = React.useState('')
          const [editSuppDate, setEditSuppDate] = React.useState('')

          const handleEditAttachFile = async (e) => {
            const files = Array.from(e.target.files || [])
            e.target.value = ''
            if (!files.length) return
            setAttachUploading(true)
            try {
              for (const f of files) {
                const res = await staffAPI.uploadReportFile(f, () => {})
                setEditAttachments(prev => [...prev, { url: res.url, ossKey: res.ossKey || '', name: f.name, mimeType: res.mimeType, fileSize: String(res.fileSize || '') }])
              }
            } catch (err) { toast(err.message || '附件上传失败') }
            finally { setAttachUploading(false) }
          }

          const handleDeleteSupp = async (suppId) => {
            if (!window.confirm('确定删除这条补充记录？')) return
            setSaving(true)
            try {
              const res = await staffAPI.deleteServiceSupplement(showSRDetail._id, suppId)
              toast('已删除'); setShowSRDetail(res.data); loadServiceRecords()
            } catch (err) { toast(err.message || '删除失败') }
            finally { setSaving(false) }
          }

          const handleSaveSupp = async () => {
            if (!editSuppContent.trim()) { toast('内容不能为空'); return }
            setSaving(true)
            try {
              const res = await staffAPI.editServiceSupplement(showSRDetail._id, editingSuppId, { content: editSuppContent, date: editSuppDate })
              toast('已更新'); setShowSRDetail(res.data); setEditingSuppId(null); loadServiceRecords()
            } catch (err) { toast(err.message || '保存失败') }
            finally { setSaving(false) }
          }

          const handleEdit = async () => {
            setSaving(true)
            try {
              await staffAPI.updateServiceRecord(showSRDetail._id, { title: editForm.title, content: editForm.content, result: editForm.result, nextDate: editForm.nextDate || null, diseaseName: editForm.diseaseName, attachments: editAttachments })
              toast('记录已更新'); setShowSRDetail(null); loadServiceRecords()
            } catch (err) { toast(err.message || '保存失败') }
            finally { setSaving(false) }
          }

          const handleSupplement = async () => {
            if (!suppContent.trim()) { toast('请填写补充内容'); return }
            setSaving(true)
            try {
              await staffAPI.addServiceSupplement(showSRDetail._id, { content: suppContent, date: suppDate })
              toast('补充记录已添加'); setShowSRDetail(null); loadServiceRecords()
            } catch (err) { toast(err.message || '添加失败') }
            finally { setSaving(false) }
          }

          return (
            <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowSRDetail(null) }}>
              <div className="modal" style={{ maxWidth: 520 }}>
                <div className="modal-header">
                  <h3 className="modal-title">{showSRDetail.title || '服务记录详情'}</h3>
                  <button className="modal-close" onClick={() => setShowSRDetail(null)}>✕</button>
                </div>
                <div className="modal-body">
                  {mode === 'view' && (
                    <>
                      {[
                        ['服务类型', SR_TYPE_LABEL[showSRDetail.type] || showSRDetail.type],
                        ...(showSRDetail.type === 'disease_mgmt' && showSRDetail.diseaseName ? [['专病名称', showSRDetail.diseaseName]] : []),
                        ['负责人', showSRDetail.staffId?.name || '-'],
                        ['服务日期', showSRDetail.date ? new Date(showSRDetail.date).toLocaleDateString('zh-CN') : '-'],
                      ].map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', padding: '8px 0', borderBottom: '1px solid #f5f2ec' }}>
                          <span style={{ width: 80, color: '#8AA89C', fontSize: 13 }}>{k}</span>
                          <span style={{ flex: 1, fontSize: 13 }}>{v}</span>
                        </div>
                      ))}
                      {showSRDetail.content && (
                        <div style={{ marginTop: 12, padding: 12, background: '#f9f7f3', borderRadius: 8, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                          {showSRDetail.content}
                        </div>
                      )}
                      {showSRDetail.result && (
                        <div style={{ marginTop: 8, padding: 12, background: '#EFF6FF', borderRadius: 8, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                          <div style={{ fontSize: 11, color: '#0077B6', marginBottom: 4, fontWeight: 600 }}>结果/建议</div>
                          {showSRDetail.result}
                        </div>
                      )}
                      {(showSRDetail.attachments || []).length > 0 && (
                        <div style={{ marginTop: 12 }}>
                          <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 6 }}>附件（{showSRDetail.attachments.length}）</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {showSRDetail.attachments.map((a, i) => {
                              const s = a.url.startsWith('/') ? API_ORIGIN + a.url : a.url
                              return (
                                <a key={i} href={s} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#1E6B50', display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                                  {a.mimeType === 'application/pdf' ? '📄' : '🖼'} {a.name}
                                </a>
                              )
                            })}
                          </div>
                        </div>
                      )}
                      {(showSRDetail.supplements || []).length > 0 && (
                        <div style={{ marginTop: 12 }}>
                          <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 6 }}>补充记录</div>
                          {showSRDetail.supplements.map((s, i) => {
                            const isOwn = staff && s.staffId && String(s.staffId) === String(staff._id)
                            const isEditing = editingSuppId === String(s._id)
                            return (
                              <div key={i} style={{ padding: '8px 12px', background: '#F9F6F0', borderRadius: 6, marginBottom: 6, fontSize: 13 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
                                  <span style={{ fontSize: 11, color: '#8AA89C' }}>{s.staffName}</span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: 11, color: '#8AA89C' }}>{s.date ? new Date(s.date).toLocaleDateString('zh-CN') : '-'}</span>
                                    {isOwn && !isEditing && (
                                      <>
                                        <button onClick={() => { setEditingSuppId(String(s._id)); setEditSuppContent(s.content); setEditSuppDate(s.date ? new Date(s.date).toISOString().slice(0,10) : '') }} style={{ fontSize: 11, color: '#1E6B50', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}>编辑</button>
                                        <button onClick={() => handleDeleteSupp(String(s._id))} style={{ fontSize: 11, color: '#DC3545', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}>删除</button>
                                      </>
                                    )}
                                  </div>
                                </div>
                                {isEditing ? (
                                  <div>
                                    <textarea value={editSuppContent} onChange={e => setEditSuppContent(e.target.value)} rows={3} style={{ width: '100%', padding: '6px 8px', border: '1px solid #E0D9CE', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', resize: 'vertical', marginBottom: 6, fontFamily: 'inherit' }} />
                                    <input type="date" value={editSuppDate} onChange={e => setEditSuppDate(e.target.value)} style={{ padding: '4px 8px', border: '1px solid #E0D9CE', borderRadius: 6, fontSize: 12, marginBottom: 8 }} />
                                    <div style={{ display: 'flex', gap: 6 }}>
                                      <button onClick={handleSaveSupp} disabled={saving} style={{ fontSize: 12, color: '#fff', background: '#1E6B50', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer' }}>{saving ? '保存中...' : '保存'}</button>
                                      <button onClick={() => setEditingSuppId(null)} style={{ fontSize: 12, color: '#666', background: '#EDEDEB', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>取消</button>
                                    </div>
                                  </div>
                                ) : (
                                  <div style={{ whiteSpace: 'pre-wrap' }}>{s.content}</div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </>
                  )}
                  {mode === 'edit' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {showSRDetail.type === 'disease_mgmt' && (
                        <div><label className="form-label">专病名称</label><input className="form-input" placeholder="如：巧克力囊肿" value={editForm.diseaseName} onChange={e => setEditForm(f => ({ ...f, diseaseName: e.target.value }))} /></div>
                      )}
                      <div><label className="form-label">标题</label><input className="form-input" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} /></div>
                      <div><label className="form-label">详细内容</label><textarea className="form-input" rows={4} value={editForm.content} onChange={e => setEditForm(f => ({ ...f, content: e.target.value }))} /></div>
                      <div><label className="form-label">结果/建议</label><textarea className="form-input" rows={3} value={editForm.result} onChange={e => setEditForm(f => ({ ...f, result: e.target.value }))} /></div>
                      <div><label className="form-label">下次计划日期</label><input className="form-input" type="date" value={editForm.nextDate} onChange={e => setEditForm(f => ({ ...f, nextDate: e.target.value }))} /></div>
                      {(showSRDetail.type === 'disease_mgmt' || showSRDetail.type === 'medical_visit') && (
                        <div>
                          <label className="form-label">附件 <span style={{ color: '#8AA89C', fontWeight: 400, fontSize: 12 }}>（就医病历/检查单，图片或PDF）</span></label>
                          <input type="file" accept="image/*,.pdf" multiple style={{ display: 'none' }} id="sr-edit-attach-input" onChange={handleEditAttachFile} />
                          <label htmlFor="sr-edit-attach-input" style={{ cursor: 'pointer', padding: '6px 14px', borderRadius: 8, border: '1px solid #E0D9CE', background: '#fff', fontSize: 13, color: '#4A6558', display: 'inline-block' }}>
                            {attachUploading ? '上传中…' : '+ 添加附件'}
                          </label>
                          {editAttachments.length > 0 && (
                            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {editAttachments.map((a, i) => (
                                <span key={i} style={{ fontSize: 12, color: '#1E6B50', display: 'flex', alignItems: 'center', gap: 6 }}>
                                  {a.mimeType === 'application/pdf' ? '📄' : '🖼'} {a.name}
                                  <button onClick={() => setEditAttachments(prev => prev.filter((_, j) => j !== i))}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC3545', fontSize: 12, padding: 0 }}>✕</button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {mode === 'supplement' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ fontSize: 13, color: '#8AA89C', marginBottom: 4 }}>为此记录追加补充，不影响原始内容</div>
                      <div><label className="form-label">补充日期</label><input className="form-input" type="date" value={suppDate} onChange={e => setSuppDate(e.target.value)} /></div>
                      <div><label className="form-label">补充内容</label><textarea className="form-input" rows={5} placeholder="如：1周后随访，专病方案调整情况..." value={suppContent} onChange={e => setSuppContent(e.target.value)} /></div>
                    </div>
                  )}
                </div>
                <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {mode === 'view' && <button className="btn btn-secondary btn-sm" onClick={() => setMode('edit')}>编辑</button>}
                    {mode === 'view' && <button className="btn btn-secondary btn-sm" onClick={() => setMode('supplement')}>补充记录</button>}
                    {mode !== 'view' && <button className="btn btn-secondary btn-sm" onClick={() => setMode('view')}>返回</button>}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary" onClick={() => setShowSRDetail(null)}>关闭</button>
                    {mode === 'edit' && <button className="btn btn-primary" disabled={saving} onClick={handleEdit}>{saving ? '保存中...' : '保存'}</button>}
                    {mode === 'supplement' && <button className="btn btn-primary" disabled={saving} onClick={handleSupplement}>{saving ? '添加中...' : '添加补充'}</button>}
                  </div>
                </div>
              </div>
            </div>
          )
        }
        return <SRDetailModal />
      })()}

      {/* 转介弹窗 */}
      {showReferralModal && (
        <ReferralModal
          patientId={id}
          patientName={user.name}
          patientUser={user}
          staffList={staffList}
          onClose={() => setShowReferralModal(false)}
          onSaved={() => { setShowReferralModal(false); toast('转介已发送') }}
        />
      )}

      {/* 发消息弹窗 */}
      {showMessageModal && (
        <SendMessageModal
          patientId={id}
          patientName={user.name}
          onClose={() => setShowMessageModal(false)}
        />
      )}

      {/* AI方案生成前先选模板弹窗（体检/营养/就医协助三类通用） */}
      {showSelectTplModal && (
        <SelectTemplateAndGenerateModal
          planType={showSelectTplModal}
          patientId={id}
          title={showSelectTplModal === 'annual_checkup' ? 'AI体检方案' : showSelectTplModal === 'nutrition' ? 'AI营养方案' : 'AI就医协助方案'}
          onClose={() => { setShowSelectTplModal(null); setPendingMedicalAssistOrderId('') }}
          onGenerate={async (templateId, briefNote) => {
            if (showSelectTplModal === 'annual_checkup') {
              await staffAPI.generateAIAnnualCheckupPlan(id, templateId, briefNote)
              toast('AI体检方案已生成，待健管专员审核')
            } else if (showSelectTplModal === 'nutrition') {
              await staffAPI.generateAINutritionPlan(id, templateId, briefNote)
              toast('AI营养方案已生成，待营养师审核')
            } else {
              await staffAPI.generateAIMedicalAssistPlan(id, pendingMedicalAssistOrderId, templateId, briefNote)
              toast('AI就医协助方案已生成，待健康规划师审核')
            }
            loadPlans()
          }}
        />
      )}

      {/* 上传体检报告弹窗 */}
      {showUploadReport && (
        <UploadReportModal
          patientId={id}
          screeningTree={screeningTree}
          onClose={() => setShowUploadReport(false)}
          onSaved={() => { setShowUploadReport(false); toast('报告已上传'); loadReports() }}
        />
      )}


      {/* 新建开单弹窗 */}
      {false && showReqModal && (
        <RequisitionModal
          patientId={id}
          prefillTitle={reqPrefill?.title || ''}
          prefillNotes={reqPrefill?.notes || ''}
          prefillSuggestions={reqPrefill?.suggestions || []}
          onClose={() => { setShowReqModal(false); setReqPrefill(null) }}
          onSaved={() => {
            setShowReqModal(false)
            setReqPrefill(null)
            toast('开单已创建，请上传对应报告')
            loadRequisitions()
            setTab('requisitions')
          }}
        />
      )}
    </div>
  )
}

function MembershipPanel({ user, patientId, onRefresh }) {
  const toast = useToast()
  const [membership, setMembership] = useState(user)
  const [cardNumber, setCardNumber] = useState(user.cardNumber || '')
  const [pointsDelta, setPointsDelta] = useState('')
  const [rechargeDelta, setRechargeDelta] = useState('')
  const [saving, setSaving] = useState(false)

  const loadMembership = useCallback(async () => {
    try {
      const res = await staffAPI.getPatientMembership(patientId)
      if (res.success && res.data) {
        setMembership(current => ({ ...current, ...res.data }))
        setCardNumber(res.data.cardNumber || '')
      }
    } catch (err) { toast(err.message) }
  }, [patientId])

  useEffect(() => { loadMembership() }, [loadMembership])

  const save = async () => {
    setSaving(true)
    try {
      const payload = { cardNumber }
      if (pointsDelta) payload.pointsDelta = parseInt(pointsDelta)
      if (rechargeDelta) payload.rechargeDelta = parseFloat(rechargeDelta)
      await staffAPI.updatePatientMembership(patientId, payload)
      toast('已更新')
      setPointsDelta(''); setRechargeDelta('')
      await loadMembership()
      onRefresh()
    } catch (err) { toast(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      {/* 会员基本信息 */}
      <div className="card">
        <div className="card-header"><div className="card-title">会员基本信息</div></div>
        <div className="card-body">
          <InfoRow label="手机号" value={user.phone} />
          <InfoRow label="会员类型" value={user.memberType || (user.patientType === 'vip' ? 'VIP会员' : user.patientType === 'trial' ? '试用会员' : '普通会员')} />
          <InfoRow label="服务包" value={getServicePackageLabel(user.servicePackage)} />
          <InfoRow label="服务开始" value={user.serviceStartDate ? new Date(user.serviceStartDate).toLocaleDateString('zh-CN') : '-'} />
          <InfoRow label="服务到期" value={user.serviceExpiry ? new Date(user.serviceExpiry).toLocaleDateString('zh-CN') : '-'} />
          <InfoRow label="会员来源" value={user.source || '-'} />
        </div>
      </div>

      {/* 会员卡 & 积分管理 */}
      <div className="card">
        <div className="card-header"><div className="card-title">卡号 & 积分 & 余额</div></div>
        <div className="card-body">
          {/* 当前状态 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            {[
              { label: '健康基金', value: `¥${(membership.healthFundBalance || 0).toFixed(2)}`, color: '#1E6B50' },
              { label: '充值余额', value: `¥${(membership.rechargeBalance || 0).toFixed(2)}`, color: '#0077B6' },
              { label: '积分', value: (membership.pointsBalance || 0).toString(), color: '#D97706' },
            ].map(s => (
              <div key={s.label} style={{ background: '#f9f7f3', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: '#8AA89C', marginTop: -8, marginBottom: 16 }}>每满100积分自动兑换¥1自有健康基金</div>

          {/* 编辑区 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label className="form-label" style={{ fontSize: 12 }}>会员卡号</label>
              <input className="form-input" value={cardNumber} onChange={e => setCardNumber(e.target.value)} placeholder="如：JY-2025-001" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label className="form-label" style={{ fontSize: 12 }}>积分变动（+/-）</label>
                <input className="form-input" type="number" value={pointsDelta} onChange={e => setPointsDelta(e.target.value)} placeholder="如：100 或 -50" />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: 12 }}>充值余额变动（元）</label>
                <input className="form-input" type="number" value={rechargeDelta} onChange={e => setRechargeDelta(e.target.value)} placeholder="如：500 或 -100" />
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>{saving ? '保存中...' : '保存更新'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f5f2ec', fontSize: 14 }}>
      <span style={{ color: '#8AA89C' }}>{label}</span>
      <span style={{ color: '#1A2B24', fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>{value}</span>
    </div>
  )
}

const RECORD_TYPE_LABEL = {
  bloodPressure: '血压', bloodSugar: '血糖', heartRate: '心率',
  weight: '体重', height: '身高', bmi: 'BMI', temperature: '体温', respiratoryRate: '呼吸', oxygenSaturation: '血氧饱和度', painScore: '疼痛评分',
  leftVision: '左眼视力', rightVision: '右眼视力', axialLength: '眼轴', waistCircumference: '腰围', hipCircumference: '臀围', waistHipRatio: '腰臀比', sleep: '睡眠', mood: '情绪',
  diet: '饮食', exercise: '运动', water: '饮水',
  alcohol: '饮酒', bowel: '排便', smoking: '吸烟',
  symptom: '症状自评',
}

// 按"类型+归属日期"分组：同一天同类型的多次打卡（如运动打3次、饮食4餐）归到一起展示，
// 而不是与其他类型混在同一条时间线里逐条散落（2026-07-18 反馈）
function groupRecordsByTypeAndDate(records) {
  const groups = []
  const indexByKey = {}
  records.forEach(r => {
    const d = r.recordedAt ? new Date(r.recordedAt) : null
    const dateKey = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '未知日期'
    const groupKey = `${r.type}_${dateKey}`
    if (indexByKey[groupKey] == null) {
      indexByKey[groupKey] = groups.length
      const label = RECORD_TYPE_LABEL[r.type] || r.type
      groups.push({ groupKey, groupLabel: `${label} · ${dateKey}`, count: 0, records: [] })
    }
    const g = groups[indexByKey[groupKey]]
    g.records.push(r)
    g.count = g.records.length
  })
  return groups
}

// 编辑弹窗用：数值类型有单位，生活方式类是自由文本描述（如"跑步10分钟"），字段含义不同，编辑表单要分开呈现
const RECORD_VALUE_META = {
  bloodSugar: { unit: 'mmol/L', freeText: false },
  heartRate:  { unit: '次/分', freeText: false },
  weight:     { unit: 'kg', freeText: false },
  height:     { unit: 'cm', freeText: false },
  bmi:        { unit: '', freeText: false },
  temperature: { unit: '℃', freeText: false },
  respiratoryRate: { unit: '次/分', freeText: false },
  oxygenSaturation: { unit: '%', freeText: false },
  painScore: { unit: '分', freeText: false },
  leftVision: { unit: '', freeText: false },
  rightVision: { unit: '', freeText: false },
  axialLength: { unit: 'mm', freeText: false },
  waistCircumference: { unit: 'cm', freeText: false },
  hipCircumference: { unit: 'cm', freeText: false },
  waistHipRatio: { unit: '', freeText: false },
  sleep:      { unit: '小时', freeText: false },
  mood:       { unit: '分（1-10）', freeText: false },
}

function formatRecordValue(r) {
  let base
  if (r.type === 'bloodPressure' && r.extra) {
    base = `${r.extra.sys}/${r.extra.dia} mmHg`
  } else if (r.type === 'bloodSugar') base = `${r.value} mmol/L`
  else if (r.type === 'heartRate') base = `${r.value} 次/分`
  else if (r.type === 'weight') base = `${r.value} kg`
  else if (r.type === 'height') base = `${r.value} cm`
  else if (r.type === 'sleep') base = `${r.value} h`
  else if (r.type === 'mood') base = `${r.value} / 10`
  else base = r.value == null ? '-' : `${r.value}${r.unit ? ` ${r.unit}` : ''}`

  if (r.type === 'sleep' && r.extra?.sleepTime && r.extra?.wakeTime) {
    base += `（${r.extra.sleepTime}入睡→${r.extra.wakeTime}醒）`
  }
  if (r.note) base += `，${r.note}`
  return base
}

// ── 聊天对话弹窗 ──────────────────────────────────────────────
function SendMessageModal({ patientId, patientName, onClose }) {
  const { staff } = useStaff()
  const chatRole = staff?.role === 'familyDoctor' ? 'doctor' : staff?.role === 'nutritionist' ? 'nutritionist' : staff?.role === 'medicalAssistant' ? 'medicalAssistant' : 'manager'
  const toast = useToast()
  const [msgs, setMsgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [humanActive, setHumanActive] = useState(false)
  const [switchingMode, setSwitchingMode] = useState(false)
  const [recording, setRecording] = useState(false)
  const scrollRef = useRef(null)
  const recorderRef = useRef(null)
  const recordStreamRef = useRef(null)
  const recordStartedRef = useRef(0)
  const msgCountRef = useRef(0) // 上次渲染的消息条数，用于判断是否真的有新消息（而不是轮询刷新了同样内容）
  const isNearBottomRef = useRef(true) // 用户是否停留在底部附近；往上翻看历史时轮询不应打断

  const loadThread = async () => {
    try {
      const res = await staffAPI.getChatThread(patientId, chatRole)
      setMsgs(res.data || [])
      setHumanActive(!!res.humanActive)
      setTimeout(() => scrollRef.current?.scrollTo({ top: 99999, behavior: 'auto' }), 80)
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => { loadThread() }, [patientId])
  useEffect(() => () => { recorderRef.current?.state === 'recording' && recorderRef.current.stop(); recordStreamRef.current?.getTracks?.().forEach(track => track.stop()) }, [])

  // 轮询获取新消息（3秒一次）
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await staffAPI.getChatThread(patientId, chatRole)
        setMsgs(res.data || [])
        setHumanActive(!!res.humanActive)
      } catch {}
    }, 3000)
    return () => clearInterval(interval)
  }, [patientId])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  useEffect(() => {
    // 只有真的新增了消息、且用户当前停留在底部附近时，才自动滚动到底部；
    // 用户正在往上翻看历史记录时，不能被轮询强制拽回底部（此前的bug）
    const hasNewMessage = msgs.length > msgCountRef.current
    msgCountRef.current = msgs.length
    if (hasNewMessage && isNearBottomRef.current) {
      scrollRef.current?.scrollTo({ top: 99999, behavior: 'smooth' })
    }
  }, [msgs])

  const send = async () => {
    if (!input.trim() || sending) return
    setSending(true)
    try {
      const res = await staffAPI.replyChatMessage(patientId, input.trim())
      setHumanActive(true)
      setInput('')
      isNearBottomRef.current = true // 自己发消息后，无论之前翻到哪，都应该跟到底部
      if (res.data) setMsgs(prev => [...prev, res.data])
      setTimeout(() => scrollRef.current?.scrollTo({ top: 99999, behavior: 'smooth' }), 80)
    } catch {}
    finally { setSending(false) }
  }

  const handleKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }

  const startVoice = async () => {
    if (recording || sending) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(type => window.MediaRecorder?.isTypeSupported?.(type)) || ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const chunks = []
      recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data) }
      recorder.onstop = () => {
        const duration = Math.max(1, Math.min(60, Math.ceil((Date.now() - recordStartedRef.current) / 1000)))
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        const reader = new FileReader()
        reader.onload = async () => {
          setSending(true)
          try {
            const res = await staffAPI.replyChatMessage(patientId, '', { data: reader.result, mimeType: blob.type || 'audio/webm', duration })
            setHumanActive(true)
            if (res.data) setMsgs(prev => [...prev, res.data])
          } catch (err) { toast(err.message || '语音发送失败') }
          finally { setSending(false) }
        }
        reader.readAsDataURL(blob)
        stream.getTracks().forEach(track => track.stop())
        setRecording(false)
      }
      recorderRef.current = recorder; recordStreamRef.current = stream; recordStartedRef.current = Date.now()
      recorder.start(); setRecording(true)
      setTimeout(() => { if (recorder.state === 'recording') recorder.stop() }, 60000)
    } catch { toast('无法使用麦克风，请检查浏览器权限') }
  }

  const stopVoice = () => { if (recorderRef.current?.state === 'recording') recorderRef.current.stop() }

  const toggleHumanMode = async () => {
    if (switchingMode) return
    setSwitchingMode(true)
    try {
      const res = await staffAPI.setChatHumanActive(patientId, !humanActive, chatRole)
      setHumanActive(!!res.humanActive)
      toast(res.humanActive ? '已接手，AI助理暂停回复' : '已退出接手，AI助理恢复承接')
    } catch (err) { toast(err.message || '切换失败') }
    finally { setSwitchingMode(false) }
  }

  const fmtTime = (t) => new Date(t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  const fmtDateDivider = (t) => {
    const date = new Date(t), today = new Date(), yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    const sameDay = (a, b) => a.toDateString() === b.toDateString()
    if (sameDay(date, today)) return '今天'
    if (sameDay(date, yesterday)) return '昨天'
    return date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })
  }
  const recallMessage = async (m) => {
    if (!window.confirm('确定要撤回这条消息吗？')) return
    try {
      await staffAPI.recallChatMessage(m._id)
      setMsgs(prev => prev.filter(item => item._id !== m._id))
    } catch (err) {
      toast(err.message || '撤回失败，可能已超过2分钟')
    }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 520, height: '70vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
        {/* 顶栏 */}
        <div className="modal-header" style={{ borderBottom: '1px solid #E0D9CE', flexShrink: 0 }}>
          <div>
            <h3 className="modal-title">与 {patientName} 对话</h3>
            <div style={{ fontSize: 11, color: humanActive ? '#D97706' : '#22A06B', marginTop: 3 }}>{humanActive ? '● 人工已接手，AI静默' : '● AI助理承接中'}</div>
          </div>
          <div style={{ marginLeft: 'auto', marginRight: 8, fontSize: 11, color: '#8AA89C' }}>发送回复后自动转人工</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* 消息列表 */}
        <div ref={scrollRef} onScroll={handleScroll} style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12, backgroundColor: '#F2EDE3' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: '#8AA89C', padding: 40 }}>加载中…</div>
          ) : msgs.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#8AA89C', padding: 40 }}>暂无消息，发送第一条吧</div>
          ) : msgs.filter(m => !m.recalled).map((m, i, arr) => {
            const isStaff = m.type !== 'user' && m.type !== 'system'
            const prevMsg = arr[i - 1]
            const showTime = i === 0 || (new Date(m.createdAt) - new Date(prevMsg.createdAt)) > 300000
            const showDateDivider = i === 0 || new Date(m.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString()
            // 撤回：仅限医护自己发的消息（isStaff），2分钟内可撤回，与用户端 messages.js 规则一致
            const canRecall = isStaff && (Date.now() - new Date(m.createdAt).getTime() <= 2 * 60 * 1000)
            if (m.type === 'system') {
              return (
                <div key={m._id}>
                  {showDateDivider && <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#8AA89C', margin: '8px 0 4px' }}>{fmtDateDivider(m.createdAt)}</div>}
                  {showTime && !showDateDivider && <div style={{ textAlign: 'center', fontSize: 11, color: '#8AA89C', margin: '4px 0' }}>{fmtTime(m.createdAt)}</div>}
                  <div style={{
                    background: '#FFF8E6', border: '1px solid #F3E0A8', borderRadius: 10,
                    padding: '10px 13px', fontSize: 12.5, lineHeight: 1.6, color: '#7A5C00', whiteSpace: 'pre-wrap',
                  }}>
                    {m.title && <div style={{ fontWeight: 700, marginBottom: 4 }}>🔔 {m.title}</div>}
                    {m.content}
                  </div>
                </div>
              )
            }
            return (
              <div key={m._id}>
                {showDateDivider && <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#8AA89C', margin: '8px 0 4px' }}>{fmtDateDivider(m.createdAt)}</div>}
                {showTime && !showDateDivider && <div style={{ textAlign: 'center', fontSize: 11, color: '#8AA89C', margin: '4px 0' }}>{fmtTime(m.createdAt)}</div>}
                <div style={{ display: 'flex', justifyContent: isStaff ? 'flex-end' : 'flex-start', gap: 8 }}>
                  {!isStaff && (
                    <div style={{ width: 32, height: 32, borderRadius: 16, background: '#1E6B50', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                      {(patientName || '用')[0]}
                    </div>
                  )}
                  <div style={{ maxWidth: '68%' }}>
                    {!isStaff && <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 3 }}>{m.sender || patientName}</div>}
                    <div style={{
                      padding: '9px 13px', borderRadius: isStaff ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                      background: isStaff ? '#1E6B50' : '#fff',
                      color: isStaff ? '#fff' : '#1A2B24',
                      fontSize: 14, lineHeight: 1.5,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                      position: 'relative',
                    }}>
                      {m.audioUrl && <audio controls preload="none" src={m.audioUrl} style={{ display: 'block', width: 230, maxWidth: '100%', marginBottom: 4 }} />}
                      {m.audioUrl && m.audioTranscript && <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #E0D9CE', fontSize: 12 }}>转写：{m.audioTranscript}</div>}
                      {(!m.audioUrl || m.content !== '[语音消息]') && m.content}
                      {canRecall && (
                        <span
                          onClick={() => recallMessage(m)}
                          style={{ display: 'block', marginTop: 4, fontSize: 10, textAlign: 'right', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          撤回
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* 输入栏 */}
        <div style={{ borderTop: '1px solid #E0D9CE', padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0, backgroundColor: '#fff' }}>
          <textarea
            style={{ flex: 1, border: '1px solid #E0D9CE', borderRadius: 10, padding: '8px 12px', fontSize: 14, resize: 'none', outline: 'none', maxHeight: 100, lineHeight: 1.5, fontFamily: 'inherit' }}
            rows={1}
            placeholder="输入消息，Enter 发送，Shift+Enter 换行"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            style={{ padding: '8px 16px', borderRadius: 10, background: '#1E6B50', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, opacity: (sending || !input.trim()) ? 0.5 : 1 }}
          >
            {sending ? '…' : '发送'}
          </button>
          <button type="button" onMouseDown={startVoice} onMouseUp={stopVoice} onMouseLeave={stopVoice} onTouchStart={startVoice} onTouchEnd={stopVoice} disabled={sending} style={{ padding: '8px 12px', borderRadius: 10, background: recording ? '#DC3545' : '#E8F5EF', color: recording ? '#fff' : '#1E6B50', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            {recording ? '松开发送' : '按住说话'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 上传体检报告弹窗 ───────────────────────────────────────
const ANNUAL_L1_ID = '__annual__'

function UploadReportModal({ patientId, screeningTree = [], onClose, onSaved }) {
  const [form, setForm] = useState({ title: '', l1Id: '', l2Label: '', hospital: '', date: '', note: '' })
  const [fileDatas, setFileDatas] = useState([])
  // 一份报告有时被拍成多张照片(如"结论页"+"数据页")，默认合并为一条记录、AI一次性识别全部图片；
  // 取消勾选则保持原有行为——每个文件各自拆成一条独立报告(如确实是几份不同的检查报告一起选的场景)
  const [mergeFiles, setMergeFiles] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStep, setUploadStep] = useState('')
  const [error, setError] = useState('')

  const isAnnual = form.l1Id === ANNUAL_L1_ID
  const currentL1 = isAnnual ? null : screeningTree.find(n => String(n._id) === form.l1Id)
  const selectedReportType = isAnnual ? 'annual' : (REPORT_L1_LABEL_TO_TYPE[currentL1?.label] || 'other')
  const l2Options = currentL1?.children || []

  const handleL1Change = (l1Id) => {
    const isAnn = l1Id === ANNUAL_L1_ID
    setForm(f => ({
      ...f, l1Id,
      l2Label: '',
      // 之前无条件清空 title，如果专员先选文件(自动填了文件名做标题)、再点分类按钮，
      // 标题会被静默清空且无提示，点上传时才报错"请填写报告标题"——已有标题（不论是
      // 手填还是文件名自动填的）就保留，只在真的还没标题时才按类型给默认值。
      title: isAnn ? (f.title || '年度体检报告') : f.title,
    }))
  }

  const handleL2Change = (l2Label) => {
    setForm(f => ({ ...f, l2Label, title: l2Label ? `${l2Label} 报告` : f.title }))
  }

  const [metaDetecting, setMetaDetecting] = useState(false)
  // 单文件自动识别时会先上传拿URL，缓存下来给 handleSubmit 复用，避免同一个文件传两次
  const preUploadedRef = useRef(null) // { file, url, mimeType, fileSize }
  const handleFile = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setFileDatas(files.map(f => ({ file: f, mimeType: f.type, fileSize: f.size, name: f.name })))
    if (!form.title && files.length === 1) setForm(f => ({ ...f, title: files[0].name.replace(/\.[^.]+$/, '') }))
    setError('')
    preUploadedRef.current = null

    // 单份上传时，自动识别报告上印刷的机构名/日期回填表单，专员不用每次手动重复填写
    // （2026-07-21需求：单份上传是主流场景，报告原文本来就印着这两项）；多文件一次选择时
    // 语义不明确（可能是多页同一份报告，也可能是多份不同报告），不做自动识别，交回手动填写
    if (files.length === 1 && (files[0].type.startsWith('image/') || files[0].type === 'application/pdf')) {
      setMetaDetecting(true)
      try {
        const uploaded = await staffAPI.uploadReportFile(files[0], () => {})
        preUploadedRef.current = { file: files[0], url: uploaded.url, ossKey: uploaded.ossKey || '', mimeType: uploaded.mimeType, fileSize: uploaded.fileSize }
        const meta = await staffAPI.quickMetaFromReportFile(uploaded.url, uploaded.mimeType)
        setForm(f => ({
          ...f,
          hospital: f.hospital || meta.data?.institution || '',
          date: f.date || meta.data?.checkDate || '',
        }))
      } catch (err) { /* 识别失败静默忽略，专员仍可手动填写，不阻塞上传流程 */ }
      finally { setMetaDetecting(false) }
    }
  }

  const handleSubmit = async () => {
    if (!form.title) { setError('请填写报告标题'); return }
    if (!fileDatas.length) { setError('请选择报告文件（图片或PDF）'); return }
    try {
      setSaving(true); setError(''); setUploadProgress(0)
      const total = fileDatas.length
      if (mergeFiles && total > 1) {
        // 合并模式：全部文件先各自上传拿到url，最后只建一条报告记录、fileUrls存全部url，
        // AI解析时会把这些图片一次性传给模型合并识别（详见后端 runReportParse）
        const urls = []
        const ossKeys = []
        let mimeType = '', totalSize = 0
        for (let i = 0; i < total; i++) {
          const fd = fileDatas[i]
          setUploadStep(`上传第 ${i + 1}/${total} 个文件...`)
          const res = await staffAPI.uploadReportFile(fd.file, (p) => setUploadProgress(Math.round(((i + p) / total) * 90)))
          urls.push(res.url)
          if (res.ossKey) ossKeys.push(res.ossKey)
          mimeType = mimeType || res.mimeType
          totalSize += Number(res.fileSize) || 0
        }
        await staffAPI.uploadReport({
          patientId,
          title: form.title,
          type: selectedReportType,
          screeningL1: isAnnual ? '' : form.l1Id,
          screeningL2: isAnnual ? '' : form.l2Label,
          hospital: form.hospital,
          date: form.date,
          note: form.note,
          fileUrl: urls[0],
          fileUrls: urls,
          ossKey: ossKeys[0] || '',
          ossKeys,
          mimeType,
          fileSize: String(totalSize),
        })
      } else {
        for (let i = 0; i < total; i++) {
          const fd = fileDatas[i]
          const titleSuffix = total > 1 ? ` (${i + 1}/${total})` : ''
          // 单文件且已在选择时预上传过（用于自动识别机构/日期），直接复用那次的URL，
          // 避免同一个文件重复上传一遍浪费流量和等待时间
          const cached = (total === 1 && preUploadedRef.current?.file === fd.file) ? preUploadedRef.current : null
          let url, ossKey, mimeType, fileSize
          if (cached) {
            ({ url, ossKey, mimeType, fileSize } = cached)
            setUploadProgress(90)
          } else {
            setUploadStep(total > 1 ? `上传第 ${i + 1}/${total} 个文件...` : '上传中...')
            ;({ url, ossKey, mimeType, fileSize } = await staffAPI.uploadReportFile(
              fd.file,
              (p) => setUploadProgress(Math.round(((i + p) / total) * 90))
            ))
          }
          await staffAPI.uploadReport({
            patientId,
            title: form.title + titleSuffix,
            type: selectedReportType,
            screeningL1: isAnnual ? '' : form.l1Id,
            screeningL2: isAnnual ? '' : form.l2Label,
            hospital: form.hospital,
            date: form.date,
            note: form.note,
            fileUrl: url,
            fileUrls: [url],
            ossKey: ossKey || '',
            ossKeys: ossKey ? [ossKey] : [],
            mimeType,
            fileSize: String(fileSize),
          })
        }
      }
      setUploadProgress(100)
      onSaved()
    } catch (err) {
      setError(err.message || '上传失败')
    } finally {
      setSaving(false)
      setUploadProgress(0)
      setUploadStep('')
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <h3 className="modal-title">上传体检报告</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* L1 大类 */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">报告大类（可不选）</label>
            <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 6 }}>
              若报告涉及多个类目，可不选或只选最主要的一个——具体归类以AI解析结果为准
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[{ id: ANNUAL_L1_ID, label: '年度体检报告' }, ...screeningTree.map(n => ({ id: String(n._id), label: n.label }))].map(opt => (
                <button key={opt.id} type="button"
                  onClick={() => handleL1Change(opt.id)}
                  style={{
                    padding: '5px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer', border: '1.5px solid',
                    background: form.l1Id === opt.id ? '#1E6B50' : '#fff',
                    color: form.l1Id === opt.id ? '#fff' : '#4A6558',
                    borderColor: form.l1Id === opt.id ? '#1E6B50' : '#C8D5CE',
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 二级具体分类已按需求移除：上传时只归一级大类，与用户端一致，避免设了二级标签又不做归类。
              精细归类统一交给 AI 解析后由健管在报告详情里调整。 */}

          {/* 当前分类提示（仅一级大类） */}
          {form.l1Id && (
            <div style={{ fontSize: 12, color: '#1E6B50', background: '#E8F5EF', borderRadius: 6, padding: '5px 10px' }}>
              {isAnnual ? '年度体检报告（整份报告）' : (currentL1?.label || '')}
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">报告标题 *</label>
            <input className="form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="如：2024年年度体检报告" />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
              <label className="form-label">医院 / 机构 {metaDetecting && <span style={{ fontSize: 11, color: '#8AA89C', fontWeight: 400 }}>识别中…</span>}</label>
              <input className="form-input" value={form.hospital} onChange={e => setForm(f => ({ ...f, hospital: e.target.value }))} placeholder={metaDetecting ? '正在自动识别...' : '如：协和医院'} />
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
              <label className="form-label">报告日期 {metaDetecting && <span style={{ fontSize: 11, color: '#8AA89C', fontWeight: 400 }}>识别中…</span>}</label>
              <input className="form-input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">报告文件（图片/PDF，每个≤100MB，可多选）</label>
            <input type="file" accept="image/*,.pdf" multiple onChange={handleFile} style={{ fontSize: 13, padding: '6px 0' }} />
            {fileDatas.length > 0 && (
              <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {fileDatas.map((fd, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#22A06B' }}>✓ {fd.name}</div>
                ))}
                {fileDatas.length > 1 && (
                  <>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, color: '#4A6558', cursor: 'pointer' }}>
                      <input type="checkbox" checked={mergeFiles} onChange={e => setMergeFiles(e.target.checked)} />
                      这些文件是同一份报告的多张照片（如结论页+数据页），合并为一条记录
                    </label>
                    <div style={{ fontSize: 11, color: '#8AA89C' }}>
                      {mergeFiles
                        ? `共 ${fileDatas.length} 个文件将合并为一条报告，AI会一次性识别全部图片`
                        : `共 ${fileDatas.length} 个文件，每个文件将分别创建一条报告记录`}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">备注</label>
            <textarea className="form-input" rows={2} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="补充说明（可选）" />
          </div>
        </div>
        <div className="modal-footer" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          {error && <div className="alert alert-error" style={{ margin: 0 }}>{error}</div>}
          {saving && (
            <div style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#4A6558', marginBottom: 4 }}>
                <span>{uploadProgress < 100 ? (uploadStep || '正在上传...') : '服务器处理中，请稍候...'}</span>
                {uploadProgress < 100 && <span>{uploadProgress}%</span>}
              </div>
              <div style={{ width: '100%', height: 6, background: '#E0D9CE', borderRadius: 99, overflow: 'hidden' }}>
                {uploadProgress < 100
                  ? <div style={{ height: '100%', width: `${uploadProgress}%`, background: '#1E6B50', borderRadius: 99, transition: 'width 0.2s ease' }} />
                  : <div style={{ height: '100%', width: '100%', background: 'linear-gradient(90deg, #1E6B50 0%, #4CAF8A 50%, #1E6B50 100%)', backgroundSize: '200% 100%', borderRadius: 99, animation: 'progressPulse 1.2s linear infinite' }} />
                }
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={onClose} disabled={saving}>取消</button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
              {saving ? (uploadProgress < 100 ? `上传中 ${uploadProgress}%` : '处理中...') : '确认上传'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 赠送权益弹窗（供 MarketingPage 导出使用）───────────────────────
const SERVICE_OPTIONS = ['就医协助服务', '居家监测套餐', '专家咨询', '陪诊服务', '上门采血', '营养咨询', '其他服务']

export function GiftModal({ patientId, patientName, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState({
    giftType: 'service', serviceName: '', serviceCount: 1, fundAmount: 0, fundType: 'enterprise',
    validFrom: '', validTo: '', remark: '',
    couponType: 'amount', couponValue: '', couponTitle: '', couponMinSpend: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async () => {
    if (form.giftType === 'service' && !form.serviceName) { setError('请选择赠送服务'); return }
    if (form.giftType === 'fund' && (!form.fundAmount || Number(form.fundAmount) <= 0)) { setError('请输入有效金额'); return }
    if (form.giftType === 'coupon') {
      if (!form.couponValue || Number(form.couponValue) <= 0) { setError('请输入有效面额/折扣'); return }
      if (form.couponType === 'percent' && Number(form.couponValue) >= 100) { setError('折扣值需小于100（如90表示9折）'); return }
    }
    setSaving(true); setError('')
    try {
      if (form.giftType === 'coupon') {
        await staffAPI.giveCoupon(patientId, {
          type: form.couponType, value: Number(form.couponValue), title: form.couponTitle,
          minSpend: form.couponMinSpend ? Number(form.couponMinSpend) : 0,
          validTo: form.validTo, remark: form.remark,
        })
      } else {
        await staffAPI.giftToPatient(patientId, { ...form, serviceCount: Number(form.serviceCount), fundAmount: Number(form.fundAmount) })
      }
      onSaved()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <h3 className="modal-title">赠送权益 — {patientName}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {error && <div className="login-err" style={{ margin: '0 20px 8px' }}>⚠️ {error}</div>}
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">赠送类型</label>
            <div style={{ display: 'flex', gap: 12 }}>
              {[['service', '🎁 赠送服务'], ['fund', '💰 健康基金'], ['coupon', '🎫 优惠券']].map(([v, l]) => (
                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: form.giftType === v ? 700 : 400, color: form.giftType === v ? '#1E6B50' : '#666' }}>
                  <input type="radio" value={v} checked={form.giftType === v} onChange={set('giftType')} /> {l}
                </label>
              ))}
            </div>
          </div>

          {form.giftType === 'service' ? (
            <>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">服务类型 *</label>
                <select className="form-input" value={form.serviceName} onChange={set('serviceName')}>
                  <option value="">-- 请选择 --</option>
                  {SERVICE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">赠送次数</label>
                <input className="form-input" type="number" min={1} max={99} value={form.serviceCount} onChange={set('serviceCount')} />
              </div>
            </>
          ) : form.giftType === 'fund' ? (
            <>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">金额（元）*</label>
                <input className="form-input" type="number" min={1} placeholder="如：500" value={form.fundAmount || ''} onChange={set('fundAmount')} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">基金类型</label>
                <select className="form-input" value={form.fundType} onChange={set('fundType')}>
                  <option value="enterprise">企业派送</option>
                  <option value="promotion">促销赠送</option>
                  <option value="other">其他</option>
                </select>
              </div>
            </>
          ) : (
            <>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">券类型</label>
                <div style={{ display: 'flex', gap: 12 }}>
                  {[['amount', '满减面额'], ['percent', '折扣']].map(([v, l]) => (
                    <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: form.couponType === v ? 700 : 400, color: form.couponType === v ? '#1E6B50' : '#666' }}>
                      <input type="radio" value={v} checked={form.couponType === v} onChange={set('couponType')} /> {l}
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">{form.couponType === 'amount' ? '抵扣金额（元）*' : '折扣值（如90表示9折）*'}</label>
                <input className="form-input" type="number" min={1} max={form.couponType === 'percent' ? 99 : undefined}
                  placeholder={form.couponType === 'amount' ? '如：50' : '如：90'} value={form.couponValue} onChange={set('couponValue')} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">券名称（可选）</label>
                <input className="form-input" placeholder="如：新客立减券" value={form.couponTitle} onChange={set('couponTitle')} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">最低消费门槛（可选）</label>
                <input className="form-input" type="number" min={0} placeholder="不填则无门槛" value={form.couponMinSpend} onChange={set('couponMinSpend')} />
              </div>
            </>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: form.giftType === 'coupon' ? '1fr' : '1fr 1fr', gap: 12 }}>
            {form.giftType !== 'coupon' && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">有效期开始</label>
                <input className="form-input" type="date" value={form.validFrom} onChange={set('validFrom')} />
              </div>
            )}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">有效期结束</label>
              <input className="form-input" type="date" value={form.validTo} onChange={set('validTo')} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">备注</label>
            <input className="form-input" placeholder="赠送原因或说明..." value={form.remark} onChange={set('remark')} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving ? '赠送中...' : '确认赠送'}</button>
        </div>
      </div>
    </div>
  )
}

// ── 转介弹窗 ───────────────────────────────────────────────
const ROLE_LABEL_MAP = {
  familyDoctor:'健康顾问', nutritionist:'营养师', healthManager:'健管专员',
  medicalAssistant:'就医专员', psychologist:'心理咨询师', rehabSpecialist:'运动复健师',
  tcmDoctor:'中医师', specialist:'专科医师', healthPlanner:'健康规划师', superadmin:'超级管理员',
}

function ReferralModal({ patientId, patientName, patientUser, staffList, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState({ toStaffId: '', reason: '', content: '', urgency: 'normal' })
  const [selectedHealthSections, setSelectedHealthSections] = useState(['basicInfo'])
  const [extraData, setExtraData] = useState({ medications: [], supplements: [], healthRecords: [] })
  const [saving, setSaving] = useState(false)
  const [aiDraftLoading, setAiDraftLoading] = useState(false)
  const [error, setError] = useState('')
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  // 打开时拉取用药、营养补剂、近期打卡记录
  useEffect(() => {
    Promise.allSettled([
      staffAPI.getPatientMedications(patientId),
      staffAPI.getPatientSupplements(patientId),
      staffAPI.getPatientHealthRecords(patientId, { limit: 20 }),
    ]).then(([medsR, supsR, recsR]) => {
      setExtraData({
        medications:   medsR.status === 'fulfilled' ? (medsR.value.data || []) : [],
        supplements:   supsR.status === 'fulfilled' ? (supsR.value.data || []) : [],
        healthRecords: recsR.status === 'fulfilled' ? (recsR.value.data || []) : [],
      })
    })
  }, [patientId])

  const REASON_PRESETS = ['需要就医协助', '营养干预评估', '心理咨询介入', '运动康复指导', '中医体质评估', '专科会诊', '健康方案制定', '体检报告解读']

  // 计算年龄
  const calcAge = (birthDate) => {
    if (!birthDate) return null
    return Math.floor((Date.now() - new Date(birthDate)) / (365.25 * 24 * 3600 * 1000))
  }

  // 提取最近一次各类打卡数据
  const buildLatestVitals = (records) => {
    const VITAL_LABEL = { weight:'体重', bloodPressure:'血压', bloodSugar:'血糖', heartRate:'心率', sleep:'睡眠' }
    const seen = {}
    const result = []
    records.forEach(r => {
      if (VITAL_LABEL[r.type] && !seen[r.type]) {
        seen[r.type] = true
        let valStr = r.value ? `${r.value}${r.unit || ''}` : ''
        if (r.type === 'bloodPressure' && r.extra) valStr = `${r.extra.sys || ''}/${r.extra.dia || ''} mmHg`
        result.push(`${VITAL_LABEL[r.type]}：${valStr}（${new Date(r.recordedAt || r.createdAt).toLocaleDateString('zh-CN')}）`)
      }
    })
    return result.length ? result.join('；') : null
  }

  // 可附带的健康档案区块（固定全量，按有无数据过滤）
  const buildSections = () => {
    const u = patientUser
    const ed = extraData
    const age = calcAge(u?.birthDate)
    const basicInfoVal = [
      u?.name ? `姓名：${u.name}` : '',
      u?.gender ? `性别：${u.gender}` : '',
      age ? `年龄：${age}岁` : '',
      u?.height ? `身高：${u.height}cm` : '',
    ].filter(Boolean).join('，')

    const dietSummary = u?.lifestyle_data?.summaryOverride
      || (u?.lifestyle_data?.autoSummaryFlags?.length ? u.lifestyle_data.autoSummaryFlags.join('；') : null)
      || u?.lifestyle?.diet || null

    const latestVitals = buildLatestVitals(ed.healthRecords)

    return [
      { key: 'basicInfo',        label: '基本信息',     val: basicInfoVal || null },
      { key: 'foodAllergy',      label: '食物过敏',     val: u?.healthProfile?.foodAllergy || null },
      { key: 'drugAllergy',      label: '药物过敏',     val: u?.healthProfile?.drugAllergy || null },
      { key: 'medicalHistory',   label: '既往病史',     val: (() => { const v = u?.healthProfile?.medicalHistory; return Array.isArray(v) && v.length ? v : (v || null) })() },
      { key: 'specialDiseases',  label: '特殊疾病史',   val: u?.healthProfile?.pastHistory || (u?.chronicDiseases?.length ? u.chronicDiseases.join('；') : null) },
      { key: 'familyHistory',    label: '家族史',       val: (() => { const v = u?.healthProfile?.familyHistory; return Array.isArray(v) && v.length ? v : (v || null) })() },
      { key: 'longTermMeds',     label: '长期用药',     val: ed.medications.length ? ed.medications.map(m => `${m.name}${m.dosage ? ` ${m.dosage}` : ''}`).join('；') : null },
      { key: 'longTermSups',     label: '长期营养补剂', val: ed.supplements.length ? ed.supplements.map(s => s.name).join('；') : null },
      { key: 'dietSummary',      label: '膳食调查概述', val: dietSummary },
      { key: 'latestVitals',     label: '近期打卡数据', val: latestVitals },
    ].filter(s => s.val !== null && s.val !== '' && !(Array.isArray(s.val) && s.val.length === 0))
  }

  const HEALTH_SECTIONS = buildSections()

  const toggleSection = (key) => {
    setSelectedHealthSections(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  const buildAttachedHealthInfo = () => {
    if (selectedHealthSections.length === 0) return null
    const result = {}
    HEALTH_SECTIONS.forEach(s => {
      if (selectedHealthSections.includes(s.key)) result[s.key] = s.val
    })
    return Object.keys(result).length ? result : null
  }

  // 供AI生成使用：附带信息的 {label, val} 列表，比 buildAttachedHealthInfo 多带上中文标签
  const buildAttachedHealthInfoForAI = () => {
    return HEALTH_SECTIONS.filter(s => selectedHealthSections.includes(s.key))
      .map(s => ({ label: s.label, val: s.val }))
  }

  const handleSubmit = async () => {
    if (!form.toStaffId || !form.reason) { setError('接收人和转介原因不能为空'); return }
    setSaving(true); setError('')
    try {
      await staffAPI.createReferral({ patientId, ...form, attachedHealthInfo: buildAttachedHealthInfo() })
      onSaved()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <h3 className="modal-title">🔀 转介 — {patientName}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {error && <div className="login-err" style={{ margin: '0 20px 8px' }}>⚠️ {error}</div>}
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">接收人 *</label>
            <select className="form-input" value={form.toStaffId} onChange={set('toStaffId')}>
              <option value="">-- 请选择接收医护人员 --</option>
              {staffList.map(s => (
                <option key={s._id} value={s._id}>
                  {s.name} · {ROLE_LABEL_MAP[s.role] || s.role}{s.title ? ` (${s.title})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">转介原因 *</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {REASON_PRESETS.map(r => (
                <button key={r} type="button" className="btn btn-secondary btn-sm"
                  style={{ fontSize: 12, padding: '3px 10px', background: form.reason === r ? '#E8F5EF' : '', border: form.reason === r ? '1px solid #1E6B50' : '' }}
                  onClick={() => setForm(f => ({ ...f, reason: r }))}>{r}</button>
              ))}
            </div>
            <input className="form-input" placeholder="或手动输入原因..." value={form.reason} onChange={set('reason')} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <label className="form-label" style={{ marginBottom: 0 }}>详细说明</label>
              <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: 12 }}
                disabled={aiDraftLoading || !form.toStaffId || !form.reason}
                title={(!form.toStaffId || !form.reason) ? '请先选择接收人并填写转介原因' : ''}
                onClick={async () => {
                  setAiDraftLoading(true)
                  try {
                    const toStaff = staffList.find(s => s._id === form.toStaffId)
                    const r = await staffAPI.generateAIReferralDraft(patientId, toStaff?.roleLabel, toStaff?.name, form.reason, buildAttachedHealthInfoForAI())
                    if (r.data.content) setForm(f => ({ ...f, content: r.data.content }))
                    toast('AI已根据接收人、转介原因和附带信息生成说明，可直接修改')
                  } catch (err) { toast(err.message || 'AI生成失败') }
                  finally { setAiDraftLoading(false) }
                }}>
                {aiDraftLoading ? '生成中…' : '✨ AI生成'}
              </button>
            </div>
            <textarea className="form-input" rows={3} placeholder="病情描述、需要协助的具体内容..." value={form.content} onChange={set('content')} />
          </div>
          {/* 健康档案附件选择 */}
          {HEALTH_SECTIONS.length > 0 && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">附带健康档案（供接收方参考）</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {HEALTH_SECTIONS.map(s => {
                  const selected = selectedHealthSections.includes(s.key)
                  return (
                    <button key={s.key} type="button" className="btn btn-secondary btn-sm"
                      style={{ fontSize: 12, padding: '3px 12px',
                        background: selected ? '#E8F5EF' : '',
                        border: selected ? '1px solid #1E6B50' : '',
                        color: selected ? '#1E6B50' : '' }}
                      onClick={() => toggleSection(s.key)}>
                      {selected ? '✓ ' : ''}{s.label}
                    </button>
                  )
                })}
              </div>
              {selectedHealthSections.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#8AA89C' }}>
                  已选 {selectedHealthSections.length} 项，接收方可在转介信中查看
                </div>
              )}
            </div>
          )}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">紧急程度</label>
            <div style={{ display: 'flex', gap: 16 }}>
              {[['normal', '普通'], ['urgent', '🚨 紧急']].map(([v, l]) => (
                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: form.urgency === v && v === 'urgent' ? '#DC3545' : form.urgency === v ? '#1E6B50' : '#666', fontWeight: form.urgency === v ? 700 : 400 }}>
                  <input type="radio" value={v} checked={form.urgency === v} onChange={set('urgency')} /> {l}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving ? '发送中...' : '发送转介'}</button>
        </div>
      </div>
    </div>
  )
}

// ── 家庭成员 Tab ────────────────────────────────────────────────────
function FamilyTab({ patientId, user, onRefresh }) {
  const toast = useToast()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [addResults, setAddResults] = useState([])
  const [addRelation, setAddRelation] = useState('')
  const [addTarget, setAddTarget] = useState(null)
  const [saving, setSaving] = useState(false)
  const searchTimer = useRef(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await staffAPI.getPatientFamilyLinks(patientId)
      setMembers(res.data || [])
    } catch { setMembers([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [patientId])

  const handleSearch = (kw) => {
    setAddSearch(kw)
    setAddTarget(null)
    clearTimeout(searchTimer.current)
    if (!kw.trim()) { setAddResults([]); return }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await staffAPI.getPatients({ search: kw, limit: 20 })
        setAddResults((res.data.patients || []).filter(p => p._id !== patientId))
      } catch { setAddResults([]) }
    }, 300)
  }

  const handleAdd = async () => {
    if (!addTarget) { toast('请先搜索并选择会员'); return }
    if (!addRelation.trim()) { toast('请填写关系'); return }
    setSaving(true)
    try {
      await staffAPI.addFamilyLink(patientId, { linkedUserId: addTarget._id, relation: addRelation })
      toast('已添加家庭成员')
      setShowAdd(false); setAddSearch(''); setAddResults([]); setAddTarget(null); setAddRelation('')
      load()
    } catch (err) { toast(err.message || '添加失败') }
    finally { setSaving(false) }
  }

  const handleRemove = async (linkId) => {
    if (!window.confirm('确定移除此家庭成员关联？')) return
    try {
      await staffAPI.removeFamilyLink(patientId, linkId)
      toast('已移除')
      load()
    } catch (err) { toast(err.message || '移除失败') }
  }

  const calcAge = (birthDate) => {
    if (!birthDate) return '-'
    const birth = new Date(birthDate)
    if (isNaN(birth)) return '-'
    const today = new Date()
    let age = today.getFullYear() - birth.getFullYear()
    if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--
    return age >= 0 ? `${age}岁` : '-'
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      {/* 家庭联系人 */}
      <div className="card">
        <div className="card-header"><div className="card-title">紧急联系人</div></div>
        <div className="card-body">
          <InfoRow label="联系人" value={user.contactName || '-'} />
          <InfoRow label="联系电话" value={user.contactPhone2 || user.contactPhone3 || '-'} />
          <InfoRow label="健康顾问" value={user.assignedFamilyDoctor?.name || '-'} />
          <InfoRow label="健康顾问职称" value={user.assignedFamilyDoctor?.title || '-'} />
        </div>
      </div>

      {/* 系统内家庭成员 */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">家庭成员（系统内客户）</div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(v => !v)}>＋ 添加成员</button>
        </div>
        <div className="card-body">
          {showAdd && (
            <div style={{ background: '#f9f7f3', borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <div className="form-group">
                <label className="form-label">搜索会员（姓名/手机号）</label>
                <input className="form-input" value={addSearch} onChange={e => handleSearch(e.target.value)} placeholder="输入姓名或手机号..." autoComplete="off" />
                {addResults.length > 0 && !addTarget && (
                  <div style={{ border: '1px solid #E0D9CE', borderRadius: 8, marginTop: 4, maxHeight: 160, overflowY: 'auto', background: '#fff' }}>
                    {addResults.map(p => (
                      <div key={p._id} onClick={() => { setAddTarget(p); setAddSearch(`${p.name}  ${p.phone}`) }}
                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f5f2ec' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f9f7f3'}
                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                        <strong>{p.name}</strong><span style={{ color: '#8AA89C', marginLeft: 8 }}>{p.phone}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">关系</label>
                <input className="form-input" value={addRelation} onChange={e => setAddRelation(e.target.value)} placeholder="如：配偶、父亲、母亲、子女..." />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => { setShowAdd(false); setAddSearch(''); setAddResults([]); setAddTarget(null); setAddRelation('') }}>取消</button>
                <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={saving}>{saving ? '添加中...' : '确认添加'}</button>
              </div>
            </div>
          )}

          {loading ? <div style={{ color: '#aaa', padding: '12px 0', fontSize: 13 }}>加载中...</div>
          : members.length === 0 ? <div style={{ color: '#aaa', fontSize: 13, padding: '8px 0' }}>暂无关联家庭成员</div>
          : members.map(m => {
            const linked = m.linkedUser
            return (
              <div key={m._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f5f2ec' }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{linked?.name || '-'}</span>
                  <span style={{ color: '#8AA89C', fontSize: 12, marginLeft: 8 }}>{m.relation}</span>
                  <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>
                    {linked?.gender || ''}{linked?.gender ? ' · ' : ''}{linked?.birthDate ? calcAge(linked.birthDate) : ''}{linked?.phone ? ' · ' + linked.phone : ''}
                  </div>
                </div>
                <button className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc', fontSize: 12 }}
                  onClick={() => handleRemove(m._id)}>移除</button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}


const HEALTH_IMPORT_HEADERS = ['身份证号码', '姓名', '添加时间', '身高(CM)', '体重(KG)', 'BMI', '体温(℃)', '呼吸(次/分)', '脉搏(次/分)', '收缩压', '舒张压', '血糖(mmol/L)', '氧饱和度(%)', '疼痛评分(0-10)', '左眼视力', '右眼视力', '眼轴(mm)', '腰围(cm)', '臀围(cm)', '腰臀比', '备注']
const WIDE_HEALTH_COLUMNS = [
  ['身高(cm)', '身高'], ['体重(kg)', '体重'], ['BMI', 'BMI'], ['体温(℃)', '体温'], ['呼吸(次/分)', '呼吸'], ['脉搏(次/分)', '脉搏'],
  ['血糖(mmol/L)', '血糖'], ['血氧饱和度(%)', '血氧饱和度'], ['疼痛评分(0-10)', '疼痛评分'], ['左眼视力', '左眼视力'], ['右眼视力', '右眼视力'],
  ['眼轴(mm)', '眼轴'], ['腰围(cm)', '腰围'], ['臀围(cm)', '臀围'], ['腰臀比', '腰臀比'],
]

function parseHealthImportCsv(text) {
  const rows = []
  let row = [], cell = '', quoted = false
  const source = String(text || '').replace(/^\uFEFF/, '')
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '"' && quoted && source[i + 1] === '"') { cell += '"'; i += 1 }
    else if (ch === '"') quoted = !quoted
    else if (ch === ',' && !quoted) { row.push(cell.trim()); cell = '' }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && source[i + 1] === '\n') i += 1
      row.push(cell.trim()); cell = ''
      if (row.some(Boolean)) rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row)
  if (!rows.length) return []
  const headers = rows[0].map(x => x.trim()
    .replace(/^添加时间$/, '测量时间')
    .replace(/\(CM\)/i, '(cm)')
    .replace(/\(KG\)/i, '(kg)')
    .replace(/^氧饱和度\(%\)$/, '血氧饱和度(%)'))
  const isWide = !headers.includes('数据类型')
  const required = isWide ? ['身份证号码', '姓名', '测量时间'] : ['身份证号码', '姓名', '测量时间', '数据类型']
  if (required.some(x => !headers.includes(x))) throw new Error(`模板缺少必填列：${required.join('、')}`)
  let inheritedId = '', inheritedName = ''
  const parsed = []
  rows.slice(1).forEach((cols, rowIndex) => {
    const get = name => cols[headers.indexOf(name)] || ''
    inheritedId = get('身份证号码') || inheritedId
    inheritedName = get('姓名') || inheritedName
    const common = { idNumber: inheritedId, name: inheritedName, recordedAt: get('测量时间'), note: get('备注'), sourceRowNumber: rowIndex + 2 }
    if (!isWide) {
      parsed.push({ ...common, type: get('数据类型'), systolic: get('收缩压'), diastolic: get('舒张压'), value: get('数值') })
      return
    }
    const systolic = get('收缩压'), diastolic = get('舒张压')
    if (systolic || diastolic) parsed.push({ ...common, type: '血压', systolic, diastolic, value: '' })
    WIDE_HEALTH_COLUMNS.forEach(([column, type]) => {
      const value = get(column)
      if (value !== '') parsed.push({ ...common, type, systolic: '', diastolic: '', value })
    })
  })
  return parsed.filter(x => x.recordedAt || x.type || x.value || x.systolic || x.diastolic)
}

function BatchHealthRecordImport({ patient, onSaved, toast: toastFn }) {
  const inputRef = useRef(null)
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState([])
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const canImport = patient.idType !== 'passport' && !!patient.idNumber

  const downloadTemplate = () => {
    if (!canImport) return toastFn('请先在基本信息中登记客户身份证号码')
    const sample = [patient.idNumber, patient.name || '', '2024-01-15 08:30', '170', '70.2', '24.3', '36.5', '16', '74', '101', '68', '5.8', '98', '0', '1.0', '1.0', '24.1', '82', '96', '0.85', '早晨测量']
    const csv = [HEALTH_IMPORT_HEADERS, sample].map(row => row.map(value => `"${String(value || '').replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `历史健康数据导入模板_${patient.name || '客户'}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  const chooseFile = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const parsed = parseHealthImportCsv(await file.text())
      if (!parsed.length) throw new Error('文件中没有数据')
      setLoading(true); setFileName(file.name); setRows(parsed); setPreview(null)
      const res = await staffAPI.importPatientHealthRecords(patient._id, { rows: parsed, fileName: file.name, preview: true })
      setPreview(res.data)
    } catch (error) { setRows([]); setPreview(null); toastFn(error.message || '文件解析失败') }
    finally { setLoading(false) }
  }

  const confirmImport = async () => {
    if (!preview?.summary?.ready) return
    setLoading(true)
    try {
      const res = await staffAPI.importPatientHealthRecords(patient._id, { rows, fileName, preview: false })
      toastFn(`成功导入 ${res.data.imported} 条历史健康数据`)
      setRows([]); setPreview(null); setFileName(''); onSaved()
    } catch (error) { toastFn(error.message || '导入失败') }
    finally { setLoading(false) }
  }

  const downloadFailures = () => {
    const failed = preview?.rows?.filter(row => row.status !== 'ready') || []
    const csv = [['原文件行号', '状态', '原因'], ...failed.map(row => [row.rowNumber, row.status === 'duplicate' ? '重复' : '错误', row.message])]
      .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })); a.download = `导入失败明细_${patient.name || '客户'}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header"><div className="card-title">历史健康数据批量导入</div></div>
      <div className="card-body">
        <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 12 }}>横向模板每个测量时间一行、各指标分列，空白指标自动跳过；身份证号码精准匹配当前客户，姓名二次校验。同一客户后续行可留空身份证和姓名，系统会自动沿用上一行；旧版纵向模板仍可继续导入，单次最多1000条健康记录。</div>
        {!canImport && <div style={{ padding: '9px 12px', marginBottom: 12, borderRadius: 8, color: '#B45309', background: '#FFF7E8', fontSize: 13 }}>该客户尚未登记身份证号码，请先完善基本信息后再导入。</div>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={downloadTemplate} disabled={!canImport}>下载CSV模板</button>
          <button className="btn btn-primary btn-sm" onClick={() => inputRef.current?.click()} disabled={!canImport || loading}>{loading ? '处理中…' : '上传并预检'}</button>
          <input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={chooseFile} />
        </div>
        {preview && <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: '#F7FAF8' }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{fileName}</div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 13 }}><span style={{ color: '#1E6B50' }}>可导入 {preview.summary.ready}</span><span style={{ color: '#D97706' }}>重复 {preview.summary.duplicate}</span><span style={{ color: '#DC3545' }}>错误 {preview.summary.error}</span></div>
          {preview.rows.some(row => row.status !== 'ready') && <div style={{ marginTop: 8, maxHeight: 140, overflow: 'auto', fontSize: 12, color: '#6B7280' }}>{preview.rows.filter(row => row.status !== 'ready').slice(0, 20).map(row => <div key={row.rowNumber}>第{row.rowNumber}行：{row.message}</div>)}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button className="btn btn-primary btn-sm" disabled={!preview.summary.ready || loading} onClick={confirmImport}>确认导入 {preview.summary.ready} 条</button>{(preview.summary.error + preview.summary.duplicate) > 0 && <button className="btn btn-secondary btn-sm" onClick={downloadFailures}>下载失败明细</button>}</div>
        </div>}
      </div>
    </div>
  )
}

// -- InitialHealthRecordForm component
function InitialHealthRecordForm({ patientId, onSaved, toast: toastFn }) {
  const [open, setOpen] = React.useState(false)
  const [type, setType] = React.useState('bloodPressure')
  const [saving, setSaving] = React.useState(false)

  const TYPES = [
    { key: 'bloodPressure', label: '血压',  unit: 'mmHg',   kind: 'bp' },
    { key: 'bloodSugar',    label: '血糖',  unit: 'mmol/L', kind: 'num', placeholder: '如 5.8' },
    { key: 'heartRate',     label: '心率',  unit: '次/分',  kind: 'num', placeholder: '如 72' },
    { key: 'weight',        label: '体重',  unit: 'kg',     kind: 'num', placeholder: '如 65.0' },
    { key: 'sleep',         label: '睡眠',  unit: '小时',   kind: 'sleep' },
    { key: 'mood',          label: '情绪',  unit: '分(1-10)', kind: 'num', placeholder: '如 7' },
    { key: 'diet',          label: '饮食',  unit: '',       kind: 'text', placeholder: '如：三餐规律，以主食蔬菜为主，少油少盐' },
    { key: 'exercise',      label: '运动',  unit: '',       kind: 'text', placeholder: '如：跑步，每周3次，每次30分钟' },
    { key: 'water',         label: '饮水',  unit: '',       kind: 'text', placeholder: '如：白水为主，每日约2000毫升' },
    { key: 'bowel',         label: '排便',  unit: '',       kind: 'text', placeholder: '如：1次/日，成形，无特殊' },
    { key: 'smoking',       label: '吸烟',  unit: '',       kind: 'text', placeholder: '如：不吸烟 / 每日10支，2010年起' },
    { key: 'alcohol',       label: '饮酒',  unit: '',       kind: 'text', placeholder: '如：红酒，每次100ml，每周1次' },
  ]

  const initVals = () => Object.fromEntries(TYPES.map(t =>
    [t.key, t.kind === 'bp' ? { sys: '', dia: '' } : t.kind === 'sleep' ? { sleepTime: '', wakeTime: '' } : { val: '' }]
  ))

  const [vals, setVals] = React.useState(initVals)
  // 归属日期：支持老客户历史数据补录（默认今天，可选任意过去日期）（2026-07-10 金娟）
  const todayISO = new Date().toISOString().slice(0, 10)
  const [recordDate, setRecordDate] = React.useState(todayISO)
  const setField = (field, v) => setVals(p => ({ ...p, [type]: { ...p[type], [field]: v } }))
  const reset = () => { setVals(initVals()); setRecordDate(todayISO) }

  const curType = TYPES.find(t => t.key === type)

  // 把某一类型的当前输入解析成 { value, extra }；未填写返回 null（跳过，不提交）
  const buildPayload = (t) => {
    const cur = vals[t.key]
    if (t.kind === 'bp') {
      if (!cur.sys || !cur.dia) return null
      return { value: cur.sys + '/' + cur.dia, extra: { sys: Number(cur.sys), dia: Number(cur.dia) } }
    }
    if (t.kind === 'sleep') {
      if (!cur.sleepTime || !cur.wakeTime) return null
      const [sh, sm] = cur.sleepTime.split(':').map(Number)
      const [wh, wm] = cur.wakeTime.split(':').map(Number)
      const dur = ((wh * 60 + wm) - (sh * 60 + sm) + 1440) % 1440 / 60
      return { value: dur.toFixed(1), extra: { sleepTime: cur.sleepTime, wakeTime: cur.wakeTime } }
    }
    if (!cur.val) return null
    return { value: cur.val, extra: {} }
  }

  // 2026-07-09：首次建档一次性罗列全部打卡项，医护填了几项就批量提交几项。
  // 此前是单选类型逐条录入(一次只提交当前选中那条)，医护以为填了多项、实际只存了最后确认的一条(金娟只剩"饮酒")。
  // 2026-07-11修复：①血压类要求sys/dia都填才提交，漏填一项会被buildPayload静默过滤掉，之前完全没提示——
  // 现在提交前单独检查"填了一半"的项，明确告知哪项不完整。②逐条await的循环里任何一条失败就会用throw中断
  // 后续未提交的项，但外层只提示"录入失败"，医护完全不知道前面几条是否已经成功、更不知道哪项丢了——
  // 这正是金娟案例的根因：血压这项因为以上任一原因没能真正落库，医护端却显示过"已录入"，用户端自然看不到。
  // 现在改为逐条独立捕获错误，全部提交完后汇总成功/失败清单，不再用一句话笼统提示。
  const handleSave = async () => {
    // 检测"只填了一半"的项（如血压只填收缩压），避免被buildPayload静默丢弃却毫无提示
    const partial = TYPES.filter(t => {
      const cur = vals[t.key]
      if (t.kind === 'bp') return (cur.sys && !cur.dia) || (!cur.sys && cur.dia)
      if (t.kind === 'sleep') return (cur.sleepTime && !cur.wakeTime) || (!cur.sleepTime && cur.wakeTime)
      return false
    })
    if (partial.length > 0) {
      toastFn(`${partial.map(t => t.label).join('、')} 只填了一半，请补全后再提交（否则会被跳过不录入）`)
      return
    }

    const toSubmit = TYPES.map(t => ({ t, payload: buildPayload(t) })).filter(x => x.payload)
    if (!toSubmit.length) { toastFn('请至少填写一项数据'); return }
    setSaving(true)
    // 归属日期非今天时传 recordedAt（补录历史数据），设为当天中午避免时区错算一天
    const recordedAt = recordDate === todayISO ? undefined : `${recordDate}T12:00:00`
    const succeeded = []
    const failed = []
    for (const { t, payload } of toSubmit) {
      try {
        await staffAPI.createPatientHealthRecord(patientId, { type: t.key, value: payload.value, extra: payload.extra, recordedAt })
        succeeded.push(t.label)
      } catch (e) {
        failed.push(`${t.label}(${e.message || '失败'})`)
      }
    }
    setSaving(false)
    if (failed.length === 0) {
      toastFn(`已录入 ${succeeded.length} 项健康数据（${recordDate === todayISO ? '今日' : recordDate}），已同步到用户端`)
      reset(); onSaved()
    } else if (succeeded.length === 0) {
      toastFn(`录入全部失败：${failed.join('；')}`)
    } else {
      // 部分成功：明确告知哪些成功哪些失败，不用笼统的"录入失败"掩盖已成功的部分
      toastFn(`成功 ${succeeded.join('、')}；失败 ${failed.join('；')}，请重新提交失败项`)
      onSaved()
    }
  }

  if (!open) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>初始健康数据录入</div>
            <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 2 }}>录入后直接同步到用户端，格式与用户打卡完全一致</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>+ 录入数据</button>
        </div>
      </div>
    )
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header">
        <div className="card-title">初始健康数据录入</div>
        <button className="btn btn-secondary btn-sm" onClick={() => { setOpen(false); reset() }}>取消</button>
      </div>
      <div className="card-body">
        <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 12 }}>
          罗列全部打卡项，填写哪些就录入哪些（留空的不提交），一次性作为首次建档基础数据同步到用户端。
        </div>

        {/* 归属日期：老客户历史数据补录用，默认今天，可选任意过去日期（2026-07-10 金娟） */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '10px 12px', background: '#F0FAF5', borderRadius: 8 }}>
          <span style={{ fontSize: 13, color: '#1A2B24', fontWeight: 600 }}>数据归属日期</span>
          <input type="date" value={recordDate} max={todayISO}
            onChange={e => e.target.value && setRecordDate(e.target.value)}
            style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #D0E0D8', fontSize: 13 }} />
          {recordDate !== todayISO && (
            <span style={{ fontSize: 12, color: '#D97706' }}>补录历史数据（{recordDate}）</span>
          )}
          <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto', fontSize: 12 }} onClick={() => setRecordDate(todayISO)}>今天</button>
        </div>

        {/* 2026-07-09：所有打卡项平铺，各自独立填写，一次确认批量提交，不再单选逐条录入 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {TYPES.map(t => {
            const setFieldFor = (field, v) => setVals(p => ({ ...p, [t.key]: { ...p[t.key], [field]: v } }))
            return (
              <div key={t.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, borderBottom: '1px solid #f2efe9', paddingBottom: 10 }}>
                <div style={{ width: 56, fontSize: 13, color: '#1A2B24', fontWeight: 600, paddingTop: 8, flexShrink: 0 }}>{t.label}</div>
                <div style={{ flex: 1 }}>
                  {t.kind === 'bp' && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input className="form-control" type="number" placeholder="高压 如120" value={vals[t.key].sys}
                        onChange={e => setFieldFor('sys', e.target.value)} style={{ width: 110 }} />
                      <span style={{ color: '#8AA89C' }}>/</span>
                      <input className="form-control" type="number" placeholder="低压 如80" value={vals[t.key].dia}
                        onChange={e => setFieldFor('dia', e.target.value)} style={{ width: 110 }} />
                      <span style={{ color: '#8AA89C', fontSize: 13 }}>mmHg</span>
                    </div>
                  )}
                  {t.kind === 'sleep' && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input className="form-control" type="time" value={vals[t.key].sleepTime}
                        onChange={e => setFieldFor('sleepTime', e.target.value)} style={{ width: 130 }} />
                      <span style={{ color: '#8AA89C', fontSize: 12 }}>入睡 →</span>
                      <input className="form-control" type="time" value={vals[t.key].wakeTime}
                        onChange={e => setFieldFor('wakeTime', e.target.value)} style={{ width: 130 }} />
                      <span style={{ color: '#8AA89C', fontSize: 12 }}>起床</span>
                    </div>
                  )}
                  {t.kind === 'num' && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input className="form-control" type="number" step="0.1" value={vals[t.key].val}
                        onChange={e => setFieldFor('val', e.target.value)} style={{ width: 150 }}
                        placeholder={t.placeholder} />
                      <span style={{ color: '#8AA89C', fontSize: 13 }}>{t.unit}</span>
                    </div>
                  )}
                  {t.kind === 'text' && (
                    <textarea className="form-control" rows={1} value={vals[t.key].val}
                      onChange={e => setFieldFor('val', e.target.value)}
                      placeholder={t.placeholder} style={{ width: '100%', resize: 'vertical' }} />
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <button className="btn btn-primary" style={{ marginTop: 14 }}
          onClick={handleSave} disabled={saving}>
          {saving ? '录入中...' : '确认录入'}
        </button>
      </div>
    </div>
  )
}

// ── 附带健康档案展示组件（转介记录tab共用）──────────────────────
const REFERRAL_HEALTH_LABELS = {
  basicInfo:       '基本信息',
  foodAllergy:     '食物过敏',
  drugAllergy:     '药物过敏',
  medicalHistory:  '既往病史',
  specialDiseases: '特殊疾病史',
  familyHistory:   '家族史',
  longTermMeds:    '长期用药',
  longTermSups:    '长期营养补剂',
  dietSummary:     '膳食调查概述',
  latestVitals:    '近期打卡数据',
  allergies:       '过敏史',
  medications:     '当前用药',
  surgeries:       '手术史',
  recentSymptoms:  '近期症状',
}

function AttachedHealthInfoView({ info }) {
  if (!info) return null
  const sections = Object.keys(info).filter(k => {
    const v = info[k]
    return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)
  })
  if (sections.length === 0) return null
  return (
    <div style={{ marginTop: 8, padding: '10px 12px', background: '#f0f6ff', borderRadius: 6, borderLeft: '3px solid #0077B6' }}>
      <div style={{ fontSize: 11, color: '#0077B6', fontWeight: 600, marginBottom: 6 }}>附带健康档案</div>
      {sections.map(k => {
        const v = info[k]
        const label = REFERRAL_HEALTH_LABELS[k] || k
        let display = ''
        if (Array.isArray(v)) {
          display = v.map(item => typeof item === 'object' ? Object.values(item).filter(Boolean).join(' · ') : item).join('；')
        } else if (typeof v === 'object') {
          display = Object.entries(v).map(([kk, vv]) => `${kk}：${vv}`).join('；')
        } else {
          display = String(v)
        }
        return (
          <div key={k} style={{ fontSize: 12, color: '#1A2B24', marginBottom: 3 }}>
            <span style={{ color: '#4A6558', marginRight: 4 }}>{label}：</span>{display}
          </div>
        )
      })}
    </div>
  )
}

// ── AI方案生成前先选模板弹窗（体检方案/营养方案/就医协助方案通用）───────────────────
// 2026-07-13：三类方案都是"AI只在模板骨架基础上定制"，不该让AI自由发明。此前AI一点即生成，
// 完全跳过模板；改为先弹出模板选择，选定后才真正调用AI生成，模板骨架部分由后端原样锁定。
function SelectTemplateAndGenerateModal({ planType, title, patientId, onClose, onGenerate }) {
  const toast = useToast()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [generating, setGenerating] = useState(false)
  // 就医协助方案：模板本身是固定骨架(SOP)，不像体检/营养方案有结构化的"标准项目"可锁定，
  // 就医场景每次的具体情况差异很大（去哪家医院/是否加急/会员状况等），需要专员当场填一句
  // 简要说明，AI结合这句话+模板类型生成初稿，而不是完全靠AI自己猜（2026-07-13需求）
  const [briefNote, setBriefNote] = useState('')

  useEffect(() => {
    staffAPI.getPlanTemplates(planType, patientId)
      .then(res => setTemplates(res.data || []))
      .catch(err => setError(err.message || '加载失败'))
      .finally(() => setLoading(false))
  }, [planType, patientId])

  const handleGenerate = async () => {
    if (!selectedId) { toast('请先选择模板'); return }
    setGenerating(true)
    try {
      await onGenerate(selectedId, briefNote.trim())
      onClose()
    } catch (err) { toast('AI生成失败：' + (err.message || '未知错误')) }
    finally { setGenerating(false) }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <h3 className="modal-title">{title} — 选择模板</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {/* 服务目标固定在模板列表之前，不随列表滚动，选模板前就能先看到并填写 */}
        <div style={{ flexShrink: 0, padding: '14px 20px 0' }}>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">服务目标（可选，AI会结合目标更有方向地生成初稿）</label>
            <textarea className="form-input" rows={2} placeholder={
              planType === 'medical_assist' ? '如：这次去北京协和看内分泌科，会员行动不便需要轮椅，希望尽快安排'
                : planType === 'nutrition' ? '如：控制血糖、三个月内减重5公斤'
                  : '如：重点排查心血管风险——会影响AI在加项库里的选择倾向'
            } value={briefNote} onChange={e => setBriefNote(e.target.value)} />
          </div>
        </div>
        <div className="modal-body" style={{ overflowY: 'auto', flex: 1 }}>
          <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 12 }}>
            方案的标准内容以模板为准，AI只会结合会员情况在模板基础上做定制，不会脱离模板另起一套。
          </div>
          {loading && <div style={{ padding: 20, textAlign: 'center', color: '#aaa' }}>加载模板中...</div>}
          {error && <div style={{ color: '#DC3545', fontSize: 13, padding: '8px 12px', background: '#FEF2F2', borderRadius: 8 }}>⚠️ {error}</div>}
          {!loading && !error && templates.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: '#aaa' }}>暂无可用模板，请先在超管后台创建方案模板</div>
          )}
          {templates.map(tpl => {
            const c = tpl.content || {}
            const name = c.packageName || tpl.name
            const desc = c.packageDesc || c.description || ''
            const isSel = selectedId === tpl._id
            return (
              <div key={tpl._id} onClick={() => setSelectedId(tpl._id)}
                style={{
                  border: isSel ? '1.5px solid #1E6B50' : '1px solid #E0D9CE', borderRadius: 10, padding: '12px 16px',
                  marginBottom: 8, cursor: 'pointer', background: isSel ? '#F0F9F4' : '#fff',
                }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#1A2B24' }}>{name}</div>
                {desc && <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 2 }}>{desc}</div>}
              </div>
            )
          })}
        </div>
        <div className="modal-footer" style={{ flexShrink: 0 }}>
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" disabled={!selectedId || generating} onClick={handleGenerate}>
            {generating ? 'AI生成中…' : '✨ 确认生成'}
          </button>
        </div>
      </div>
    </div>
  )
}
