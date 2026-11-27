import React, { useEffect, useRef, useState } from 'react'
import { adminAPI } from '../api'
import { EvidenceDetails, exportEvidence, cohortLabel, day } from './WoncaEvidence'
import './ResearchCareJourneysPage.css'

const STATE = { enrolled: '进行中', withdrawn: '已撤回', locked: '已锁定', unknown:'历史状态待核实' }
const pageCount = (total, size) => Math.max(1, Math.ceil(total / size))

function Pagination({ label, total, size, onSizeChange, page, onPageChange }) {
  if (!total) return null
  const pages = pageCount(total, size)
  const current = Math.min(page, pages)
  return <div className="research-pagination">
    <span>{label}：第 {(current - 1) * size + 1}–{Math.min(current * size, total)} 位，共 {total} 位</span>
    <label>每页 <select aria-label={`${label}每页人数`} value={size} onChange={event => { onSizeChange(Number(event.target.value)); onPageChange(1) }}><option value={5}>5 人</option><option value={10}>10 人</option></select></label>
    <div className="research-pagination-actions"><button type="button" className="btn btn-secondary" disabled={current === 1} onClick={() => onPageChange(current - 1)}>上一页</button><span>{current} / {pages}</span><button type="button" className="btn btn-secondary" disabled={current === pages} onClick={() => onPageChange(current + 1)}>下一页</button></div>
  </div>
}

export default function ResearchCareJourneysPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [cutoff,setCutoff]=useState('')
  const [observedAt,setObservedAt]=useState('')
  const requestId=useRef(0)
  const [journeys, setJourneys] = useState([])
  const [expandedJourney, setExpandedJourney] = useState(null)
  const [candidateList, setCandidateList] = useState([])
  const [candidatePage, setCandidatePage] = useState(1)
  const [candidatePageSize, setCandidatePageSize] = useState(5)
  const [journeyPage, setJourneyPage] = useState(1)
  const [journeyPageSize, setJourneyPageSize] = useState(5)
  const [setting, setSetting] = useState(null)
  const [settingLoaded, setSettingLoaded] = useState(false)
  const [showSetting, setShowSetting] = useState(false)
  const [governanceReference, setGovernanceReference] = useState('')
  const [governanceConfirmed, setGovernanceConfirmed] = useState(false)
  const [settingError, setSettingError] = useState('')
  const [savingSetting, setSavingSetting] = useState(false)
  const [error, setError] = useState('')
  const [modalError, setModalError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState(null)
  const [enrollTarget, setEnrollTarget] = useState(null)
  const [authorizationReference, setAuthorizationReference] = useState('')
  const [authorizationConfirmed, setAuthorizationConfirmed] = useState(false)
  const [note, setNote] = useState('')

  const enrolledCount = journeys.filter(row => row.status === 'enrolled').length
  const researchPlans = journeys.flatMap(row=>row.snapshot.evidence.plans)
  const currentPrompts = journeys.flatMap(row=>row.snapshot.evidence.items.filter(item=>item.source==='已审核健康分析'))
  const complaints = journeys.flatMap(row=>row.snapshot.evidence.items.filter(item=>item.source==='客户主诉' && item.state==='顾问已纳入'))
  const canEnroll = enrollTarget && setting && authorizationReference.trim() && authorizationConfirmed
  const currentCandidatePage = Math.min(candidatePage, pageCount(candidateList.length, candidatePageSize))
  const currentJourneyPage = Math.min(journeyPage, pageCount(journeys.length, journeyPageSize))
  const visibleCandidates = candidateList.slice((currentCandidatePage - 1) * candidatePageSize, currentCandidatePage * candidatePageSize)
  const visibleJourneys = journeys.slice((currentJourneyPage - 1) * journeyPageSize, currentJourneyPage * journeyPageSize)

  const loadJourneys = async () => {
    const id=++requestId.current
    setLoading(true)
    setObservedAt('')
    setJourneys([])
    setError('')
    try {
      const result = await adminAPI.researchJourneys(year,cutoff)
      if(id!==requestId.current) return
      setObservedAt(result.observedAt)
      setJourneys(result.data || [])
    } catch (e) {
      if(id===requestId.current) setError(e.message)
    } finally {
      if(id===requestId.current) setLoading(false)
    }
  }

  const loadCandidates = async () => {
    try {
      const result = await adminAPI.researchCandidateList()
      setCandidateList(result.data || [])
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => { loadJourneys() }, [year,cutoff])
  useEffect(() => {
    loadCandidates()
    adminAPI.researchStudySetting()
      .then(result => setSetting(result.data))
      .catch(e => setSettingError(e.message))
      .finally(() => setSettingLoaded(true))
  }, [])
  useEffect(() => {
    if (!searchOpen || query.trim().length < 2) {
      setSearchResults([])
      setSearching(false)
      return
    }
    let active = true
    const timer = setTimeout(async () => {
      setSearching(true)
      setModalError('')
      try {
        const result = await adminAPI.researchCandidates(query.trim())
        if (active) setSearchResults(result.data || [])
      } catch (e) {
        if (active) setModalError(e.message)
      } finally {
        if (active) setSearching(false)
      }
    }, 300)
    return () => { active = false; clearTimeout(timer) }
  }, [query, searchOpen])

  const saveSetting = async () => {
    if (!governanceReference.trim() || !governanceConfirmed || savingSetting) return
    setSavingSetting(true)
    setSettingError('')
    try {
      const result = await adminAPI.saveResearchStudySetting({ governanceReference, governanceConfirmed })
      setSetting(result.data)
      setShowSetting(false)
    } catch (e) {
      setSettingError(e.message)
    } finally {
      setSavingSetting(false)
    }
  }

  const startSearch = () => {
    setSearchOpen(true)
    setQuery('')
    setSearchResults([])
    setSelected(null)
    setModalError('')
  }

  const addCandidate = async () => {
    if (!selected?.patientId || selected.listed || selected.enrolled || saving) return
    setSaving(true)
    setModalError('')
    try {
      await adminAPI.addResearchCandidate(selected.patientId)
      setSearchOpen(false)
      await loadCandidates()
    } catch (e) {
      setModalError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const removeCandidate = async row => {
    if (!window.confirm(`从候选名单移除 ${row.name}？这不会删除客户档案。`)) return
    setError('')
    try {
      await adminAPI.removeResearchCandidate(row._id)
      await loadCandidates()
    } catch (e) {
      setError(e.message)
    }
  }

  const startEnroll = row => {
    if (!setting) {
      setShowSetting(true)
      setError('正式纳入前，请先登记并核验一次项目依据。候选名单可继续维护。')
      return
    }
    setEnrollTarget(row)
    setAuthorizationReference('')
    setAuthorizationConfirmed(false)
    setNote('')
    setModalError('')
  }

  const enroll = async () => {
    if (!canEnroll || saving) return
    setSaving(true)
    setModalError('')
    try {
      await adminAPI.enrollResearchJourney({
        patientId: enrollTarget.patientId,
        authorizationReference,
        authorizationConfirmed,
        inclusionNote: note,
      })
      setEnrollTarget(null)
      await Promise.all([loadCandidates(), loadJourneys()])
    } catch (e) {
      setModalError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return <div className="research-page">
    <div className="page-header research-page-header">
      <div>
        <h1 className="page-title">WONCA 服务流程研究</h1>
        <p className="page-sub">先维护候选名单；完成项目与个人授权核验后，再正式纳入研究队列</p>
      </div>
      <button className="btn btn-primary research-add-button" onClick={startSearch}>+ 添加候选客户</button>
    </div>

    <div className="research-notice">
      <span className="research-notice-icon">⌁</span>
      <div><strong>候选名单与正式纳入分开</strong><p>添加候选客户只记录内部名单，不生成研究旅程分析数据、不计入正式样本，也不改变客户服务。仅超级管理员可搜索和维护姓名、手机号；正式研究列表只显示参与者编码和流程进度。</p></div>
    </div>

    <section className="card research-toolbar">
      <div className="research-filter"><label className="form-label" htmlFor="research-year">流程观察年度</label>
        <div className="research-filter-controls"><input id="research-year" className="form-input research-year-input" type="number" value={year} onChange={e => { setJourneyPage(1); setExpandedJourney(null); setYear(Number(e.target.value) || new Date().getFullYear()) }} /><button className="btn btn-secondary" onClick={() => { loadCandidates(); loadJourneys() }} disabled={loading}>{loading ? '加载中…' : '刷新'}</button></div>
      </div>
      <div className="research-counts"><div className="research-count-card"><span>候选名单</span><strong>{candidateList.length}</strong><em>位</em></div><div className="research-count-card"><span>正式纳入</span><strong>{enrolledCount}</strong><em>位</em></div></div>
    </section>

    {error && <div className="research-error" role="alert">{error}</div>}

    <section className="card research-list-card">
      <div className="research-list-heading"><div><h2>候选名单</h2><p>内部核对名单；不计入正式研究样本。已完成服务流程的年度客户也可先添加。</p></div><span className="research-total">共 {candidateList.length} 位</span></div>
      {candidateList.length === 0 ? <div className="research-empty"><div className="research-empty-icon">⌘</div><strong>尚无候选客户</strong><p>按姓名或手机号搜索你们选定的年度管理客户，先加入候选名单。</p><button className="btn btn-primary" onClick={startSearch}>添加候选客户</button></div>
        : <div className="research-table-wrap"><table className="research-table research-candidate-table">
          <thead><tr>{['序号', '客户', '手机号', '服务包', '加入日期', '进度', '操作'].map(x => <th key={x}>{x}</th>)}</tr></thead>
          <tbody>{visibleCandidates.map((row, index) => <tr key={row._id}>
            <td>{(currentCandidatePage - 1) * candidatePageSize + index + 1}</td><td>{row.name}</td><td>{row.phone || '—'}</td><td>{row.servicePackage || '—'}</td>
            <td>{new Date(row.addedAt).toLocaleDateString('zh-CN')}</td>
            <td>{row.enrolled ? <span className="research-status">已正式纳入</span> : row.isDeleted ? '客户已归档' : row.isAnnual ? '待核验授权' : '年度身份待核对'}</td>
            <td>{row.enrolled ? '—' : <div className="research-row-actions"><button className="btn btn-primary" onClick={() => startEnroll(row)} disabled={row.isDeleted || !row.isAnnual} title={!row.isAnnual ? '请核对年度服务包或年度管理身份' : ''}>正式纳入</button><button className="btn btn-secondary" onClick={() => removeCandidate(row)}>移除</button></div>}</td>
          </tr>)}</tbody>
        </table></div>}
      <Pagination label="候选名单" total={candidateList.length} size={candidatePageSize} onSizeChange={setCandidatePageSize} page={currentCandidatePage} onPageChange={setCandidatePage} />
    </section>

    <section className="card research-setting-shell" id="research-setting">
      <div><h2>正式纳入准备</h2><p>维护候选名单无需填写。开始正式纳入前，再登记一次机构资料使用依据，并逐人核验授权。</p></div>
      {settingLoaded && setting ? <span className="research-status" title={setting.governanceReference}>项目依据已记录：{setting.governanceReference}</span>
        : <button className="btn btn-secondary" onClick={() => setShowSetting(value => !value)}>{showSetting ? '收起' : '登记项目依据'}</button>}
      {!settingLoaded && <span>正在核对项目设置…</span>}
      {showSetting && settingLoaded && !setting && <div className="research-setting-form">
        {settingError && <div className="research-error" role="alert">{settingError}</div>}
        <div className="form-group"><label className="form-label" htmlFor="research-governance">机构依据记录位置或编号</label><input id="research-governance" className="form-input" value={governanceReference} onChange={e => setGovernanceReference(e.target.value)} maxLength={200} placeholder="例如内部项目确认记录的编号或存放位置" /></div>
        <label className="research-check"><input type="checkbox" checked={governanceConfirmed} onChange={e => setGovernanceConfirmed(e.target.checked)} /><span>我已核对该依据适用于本项目的资料使用</span></label>
        <button className="btn btn-primary" disabled={!governanceReference.trim() || !governanceConfirmed || savingSetting} onClick={saveSetting}>{savingSetting ? '保存中…' : '保存项目依据'}</button>
      </div>}
    </section>

    <section className="card research-list-card">
      <div className="research-list-heading"><div><h2>正式纳入的服务旅程</h2><p>按上海时间统计。资料和报告建议稿取截至观察日的历年记录；年度方案及关联随访按所选年度。截止日后被改写且无法还原的状态标为历史无可核实记录。点击研究编号查看明细。</p></div><span className="research-total">共 {journeys.length} 条</span></div>
      <div className="research-filter-controls wonca-tools">
        <label>统计截止日 <input type="date" value={cutoff} max={day(new Date())} onChange={event=>{setCutoff(event.target.value);setJourneyPage(1);setExpandedJourney(null)}} /></label>
        <button className="btn btn-secondary" disabled={loading || !observedAt || !journeys.length} onClick={()=>exportEvidence(journeys,year,observedAt)}>导出全部研究明细 CSV</button>
        {observedAt && <span>既往在管 {journeys.filter(r=>r.cohort==='existing').length} 人 · 新进入管理 {journeys.filter(r=>r.cohort==='new').length} 人 · 分组待核实 {journeys.filter(r=>r.cohort==='unknown').length} 人</span>}
        {observedAt && <span>纳入记录 {journeys.length} 人 · 年度方案 {journeys.reduce((n,r)=>n+r.snapshot.evidence.plans.length,0)} 份 · 可追溯管理来源的方案 {journeys.reduce((n,r)=>n+r.snapshot.evidence.plans.filter(p=>p.traceable).length,0)} 份</span>}
      </div>
      {observedAt && <details className="wonca-summary"><summary>年度研究指标与分母</summary>
        <p>已保存待沟通议题的方案 {researchPlans.filter(p=>p.consensus>0).length} 份；能核实共识栏数量的方案 {researchPlans.filter(p=>p.consensus!==null).length} 份。</p>
        <p>已纳入的主诉决定 {complaints.length} 项，其中能追到方案“安排就医”的 {complaints.filter(item=>item.position.includes('安排就医')).length} 项。</p>
        <p>已审核健康分析的当前提示 {currentPrompts.length} 项（来源可核对 {journeys.filter(r=>r.snapshot.evidence.promptEvidence).length} 人）。需完善检查 {currentPrompts.filter(i=>i.state==='需完善检查').length}，无需纳入 {currentPrompts.filter(i=>i.state==='无需纳入').length}，需补资料 {currentPrompts.filter(i=>i.state==='需补资料').length}，已关联既有事项 {currentPrompts.filter(i=>i.state==='已关联既有事项').length}，待顾问处置 {currentPrompts.filter(i=>i.state==='待顾问处置').length}，仅有系统建议 {currentPrompts.filter(i=>i.state.startsWith('系统建议')).length}。</p>
      </details>}
      {loading ? <div className="research-empty"><strong>正在加载研究旅程</strong></div>
        : journeys.length === 0 ? <div className="research-empty"><strong>尚未正式纳入客户</strong><p>候选名单建好后，可逐人核验并纳入。</p></div>
        : <div className="research-table-wrap"><table className="research-table">
          <thead><tr>{['研究编号','参与者 / 分组','资料处理','报告建议稿','年度方案','年度关联随访','纳入状态'].map(x => <th key={x}>{x}</th>)}</tr></thead>
          <tbody>{visibleJourneys.map(row => {const e=row.snapshot.evidence; return <React.Fragment key={row._id}><tr>
            <td><button type="button" className="research-code research-expand" aria-expanded={expandedJourney === row._id} onClick={() => setExpandedJourney(expandedJourney === row._id ? null : row._id)}>{row.researchNumber} {expandedJourney === row._id ? '▴' : '▾'}</button></td>
            <td><span className="research-participant">{row.participantCode}</span><div>{cohortLabel[row.cohort]}</div></td>
            <td>资料 {e.docs.length} 份<div>专员已审 {e.docs.filter(d=>d.manager==='已审核').length} · 顾问待查看 {e.pendingViews ?? '历史不可还原'}</div></td>
            <td>已批准 {e.drafts.filter(d=>d.state==='已批准').length} · 生成失败 {e.drafts.filter(d=>d.generation==='生成失败').length}<div>共 {e.drafts.length} 条流程记录</div></td>
            <td>{e.plans.length} 份 · 已有推送记录 {e.plans.filter(p=>p.pushed).length}</td>
            <td>完成 {e.follow.filter(f=>f.state==='已完成').length}/{e.follow.length} 项<div>逾期 {e.follow.filter(f=>f.overdue).length} · 跟进记录 {e.follow.reduce((n,f)=>n+f.contacts,0)} 条</div></td>
            <td><span className={`research-status ${row.status}`}>{STATE[row.status]}</span></td>
          </tr>{expandedJourney === row._id && <tr><td colSpan={7} className="research-detail-cell"><EvidenceDetails row={row} canGroup={!cutoff || cutoff===day(new Date())} onGroup={async(id,cohort,previous)=>{try{await adminAPI.researchCohort(id,cohort,previous);await loadJourneys()}catch(err){setError(err.message)}}}/></td></tr>}</React.Fragment>})}</tbody>
        </table></div>}
      <Pagination label="正式纳入" total={journeys.length} size={journeyPageSize} onSizeChange={setJourneyPageSize} page={currentJourneyPage} onPageChange={page => { setExpandedJourney(null); setJourneyPage(page) }} />
    </section>

    {searchOpen && <div className="modal-overlay" onClick={() => !saving && setSearchOpen(false)}><section className="modal research-modal" onClick={event => event.stopPropagation()}>
      <div className="modal-header"><div><h2 className="modal-title">添加候选客户</h2><p className="research-modal-subtitle">这一步只建立内部名单</p></div><button className="modal-close" onClick={() => !saving && setSearchOpen(false)} aria-label="关闭">×</button></div>
      <div className="modal-body">
        {modalError && <div className="research-error" role="alert">{modalError}</div>}
        <div className="form-group"><label className="form-label" htmlFor="research-candidate-search">姓名或手机号</label><input id="research-candidate-search" className="form-input" autoFocus value={query} onChange={e => { setQuery(e.target.value); setSelected(null) }} placeholder="输入至少两个字符搜索现有客户" /></div>
        {query.trim().length >= 2 && <div className="research-candidates">
          {searching ? <p>正在查找…</p> : searchResults.length === 0 ? <p>未找到客户，请核对姓名或手机号。</p>
            : searchResults.map(candidate => <button type="button" key={candidate.patientId} className={`research-candidate ${selected?.patientId === candidate.patientId ? 'selected' : ''}`} onClick={() => setSelected(candidate)} disabled={candidate.listed || candidate.enrolled}>
              <span><strong>{candidate.name}</strong><small>{candidate.phone || '无手机号'} · {candidate.servicePackage || '未标注服务包'}</small></span>
              <em>{candidate.enrolled ? '已正式纳入' : candidate.listed ? '已在名单' : candidate.isAnnual ? '年度客户' : '身份待核对'}</em>
            </button>)}
        </div>}
        {selected && <div className="research-selected">已选择：{selected.name}（{selected.phone || '无手机号'}）</div>}
      </div>
      <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setSearchOpen(false)} disabled={saving}>取消</button><button className="btn btn-primary" onClick={addCandidate} disabled={!selected || saving}>{saving ? '添加中…' : '加入候选名单'}</button></div>
    </section></div>}

    {enrollTarget && <div className="modal-overlay" onClick={() => !saving && setEnrollTarget(null)}><section className="modal research-modal" onClick={event => event.stopPropagation()}>
      <div className="modal-header"><div><h2 className="modal-title">正式纳入研究队列</h2><p className="research-modal-subtitle">{enrollTarget.name} · 核验该客户授权记录</p></div><button className="modal-close" onClick={() => !saving && setEnrollTarget(null)} aria-label="关闭">×</button></div>
      <div className="modal-body">
        {modalError && <div className="research-error" role="alert">{modalError}</div>}
        <div className="form-group"><span className="form-label">项目依据（已登记，自动关联）</span><div className="form-input research-project-reference" aria-label="项目依据">{setting?.governanceReference}</div></div>
        <div className="form-group"><label className="form-label" htmlFor="research-authorization">该客户授权文件的存放位置</label><input id="research-authorization" className="form-input" value={authorizationReference} onChange={e => setAuthorizationReference(e.target.value)} maxLength={200} placeholder="例如：客户档案/资料使用授权书/文件名或签署日期" /><p className="research-modal-subtitle">填写能够找到这位客户实际授权文件的位置；上方项目编号无需重复填写。</p></div>
        <label className="research-check"><input type="checkbox" checked={authorizationConfirmed} onChange={e => setAuthorizationConfirmed(e.target.checked)} /><span>我已核验该客户的数据使用授权覆盖本项目</span></label>
        <div className="form-group"><label className="form-label" htmlFor="research-note">纳入说明（可选）</label><textarea id="research-note" className="form-input research-note" value={note} onChange={e => setNote(e.target.value)} maxLength={1000} /></div>
      </div>
      <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setEnrollTarget(null)} disabled={saving}>取消</button><button className="btn btn-primary" onClick={enroll} disabled={!canEnroll || saving}>{saving ? '正在纳入…' : '确认正式纳入'}</button></div>
    </section></div>}
  </div>
}
