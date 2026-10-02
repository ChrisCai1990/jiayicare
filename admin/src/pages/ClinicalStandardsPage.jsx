import React, { useEffect, useState } from 'react'
import { adminAPI } from '../api'
import { useAdmin } from '../App'
import './ClinicalStandardsPage.css'

const kindName = { guideline: '临床指南', instrument: '量表工具', internal: '内部规则' }
const statusName = { pending: '待医学审核', clinically_reviewed: '待实施发布', dismissed: '无需更新' }
const dateText = value => value ? new Date(value).toLocaleString('zh-CN') : '尚未检查'
const PAGE_SIZE = 25

function Pagination({ page, total, onPageChange }) {
  const pages = Math.ceil(total / PAGE_SIZE)
  if (pages <= 1) return null
  return <nav className="clinical-pagination" aria-label="分页">
    <span>第 {page} / {pages} 页 · 每页 {PAGE_SIZE} 项</span>
    <div>
      <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>上一页</button>
      <button type="button" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>下一页</button>
    </div>
  </nav>
}

export default function ClinicalStandardsPage() {
  const { admin } = useAdmin()
  const platform = admin?.role === 'platformSuper'
  const [data, setData] = useState(null)
  const [tenantId, setTenantId] = useState('')
  const [reviewerId, setReviewerId] = useState('')
  const [error, setError] = useState('')
  const [checkResult, setCheckResult] = useState('')
  const [busy, setBusy] = useState(false)
  const [standardsPage, setStandardsPage] = useState(1)
  const [updatePage, setUpdatePage] = useState(1)
  const [activeList, setActiveList] = useState('standards')
  const load = (page = updatePage) => adminAPI.clinicalStandards(page).then(r => {
    setData(r.data)
    setTenantId(r.data.delegatedTenantId || '')
    setReviewerId(r.data.reviewerId || '')
  }).catch(e => setError(e.message))
  useEffect(() => { load(updatePage) }, [updatePage])
  const act = async fn => { setBusy(true); setError(''); try { await fn(); await load() } catch (e) { setError(e.message) } finally { setBusy(false) } }
  const confirmDelegation = () => act(() => adminAPI.delegateClinicalStandards(tenantId))
  const confirmReviewer = () => act(() => adminAPI.setClinicalStandardReviewer(reviewerId))
  const check = () => act(async () => {
    const result = await adminAPI.checkClinicalStandards()
    const rows = result.data || []
    const failures = rows.filter(row => row.outcome === 'error')
    setCheckResult(`已检查 ${rows.length} 项；${failures.length ? `${failures.length} 项检查失败，请查看目录状态` : '无检查异常'}`)
  })
  const standards = data?.standards || []
  const updates = data?.updates || []
  const updateTotal = data?.updateTotal ?? updates.length
  const pending = data?.pendingCount ?? updates.filter(row => row.status === 'pending').length
  const visibleStandards = standards.slice((standardsPage - 1) * PAGE_SIZE, standardsPage * PAGE_SIZE)
  const automatic = standards.filter(row => row.monitor === 'source').length
  const selectedTenantName = data?.tenants?.find(row => row._id === tenantId)?.name || ''
  const selectedReviewerName = data?.reviewers?.find(row => row._id === reviewerId)?.name || ''

  return <div className="clinical-page">
    <header className="clinical-hero">
      <div className="clinical-hero-copy">
        <span className="clinical-eyebrow">标准治理 · STANDARD GOVERNANCE</span>
        <h1>临床标准管理</h1>
        <p>国内指南与规范优先，国际分类作补充。平台监测来源并委托机构审核；结论留痕后再评估规则发布。</p>
      </div>
      {platform && <button className="clinical-check-button" disabled={busy} onClick={check}><span aria-hidden="true">↻</span>{busy ? '检查中…' : '立即检查来源'}</button>}
    </header>

    {error && <div className="clinical-alert clinical-alert-error" role="alert">{error}</div>}
    {checkResult && <div className="clinical-alert clinical-alert-info" role="status">{checkResult}</div>}

    <div className="clinical-summary" aria-label="标准概况">
      <div className="clinical-summary-item"><span>纳入管理</span><strong>{data ? standards.length : '—'}</strong><small>项标准与规则</small></div>
      <div className="clinical-summary-item"><span>自动监测</span><strong>{data ? automatic : '—'}</strong><small>项外部来源</small></div>
      <div className="clinical-summary-item"><span>待医学审核</span><strong>{data ? pending : '—'}</strong><small>项变更或复核</small></div>
    </div>

    <section className="clinical-panel clinical-assignment">
      <div className="clinical-section-heading"><div><span className="clinical-step">{platform ? '流程 01 / 02' : '流程 02 / 02'}</span><h2>{platform ? '委托审核机构' : '指派审核健康顾问'}</h2><p>{platform ? '选定受托机构，由该机构负责内部医学审核安排。' : '从本机构在职健康顾问中选择一位，承接标准更新待办。'}</p></div><span className={`clinical-state ${platform ? (data?.delegatedTenantId ? 'is-ready' : '') : (data?.reviewerId ? 'is-ready' : '')}`}>{platform ? (data?.delegatedTenantId ? '已委托' : '待委托') : (data?.reviewerId ? '已指派' : '待指派')}</span></div>
      <div className="clinical-assignment-body">
        <div className="clinical-assignment-form">
          {platform ? <><label htmlFor="clinical-tenant">受托机构</label><div className="clinical-control-row"><select id="clinical-tenant" value={tenantId} disabled={busy} onChange={e => setTenantId(e.target.value)}><option value="">请选择机构</option>{(data?.tenants || []).map(row => <option key={row._id} value={row._id}>{row.name}</option>)}</select><button className="clinical-primary-button" disabled={busy || !tenantId || tenantId === data?.delegatedTenantId} onClick={confirmDelegation}>确认委托</button></div><p className="clinical-form-note">{tenantId && tenantId !== data?.delegatedTenantId ? `确认后，${selectedTenantName}的机构管理员可指定审核人。` : '更换机构需要重新确认；不会自动变更线上临床规则。'}</p></>
            : data?.canAssign ? <><label htmlFor="clinical-reviewer">审核健康顾问</label><div className="clinical-control-row"><select id="clinical-reviewer" value={reviewerId} disabled={busy} onChange={e => setReviewerId(e.target.value)}><option value="">请选择健康顾问</option>{(data?.reviewers || []).map(row => <option key={row._id} value={row._id}>{row.name}{row.title ? ` · ${row.title}` : ''}</option>)}</select><button className="clinical-primary-button" disabled={busy || !reviewerId || reviewerId === data?.reviewerId} onClick={confirmReviewer}>确认指派</button></div><p className="clinical-form-note">{reviewerId && reviewerId !== data?.reviewerId ? `确认后，待审任务会进入${selectedReviewerName}的工作台。` : '仅选择人员不会保存，点击确认后才会指派。'}</p></> : <div className="clinical-empty-assignment">本机构尚未受平台委托审核。{data?.delegatedTenantName && `当前受托机构：${data.delegatedTenantName}`}</div>}
        </div>
        <div className="clinical-current"><span>当前安排</span><strong>{platform ? (data?.delegatedTenantName || '尚未委托机构') : data?.canAssign ? (data?.reviewers?.find(row => row._id === data?.reviewerId)?.name || '尚未指派健康顾问') : '等待平台委托'}</strong><small>{platform ? '下一步：机构管理员指定审核人' : '待办将在指定顾问工作台展示'}</small></div>
      </div>
    </section>

    <div className="clinical-list-tabs" role="tablist" aria-label="标准列表">
      <button type="button" role="tab" aria-selected={activeList === 'standards'} className={activeList === 'standards' ? 'is-active' : ''} onClick={() => setActiveList('standards')}>标准目录 <span>{standards.length}</span></button>
      <button type="button" role="tab" aria-selected={activeList === 'updates'} className={activeList === 'updates' ? 'is-active' : ''} onClick={() => setActiveList('updates')}>审核记录 <span>{updateTotal}</span></button>
    </div>

    {activeList === 'standards' && <section className="clinical-panel">
      <div className="clinical-section-heading"><div><span className="clinical-step">标准目录</span><h2>已纳入的标准与规则</h2><p>国内依据优先。季度检查仅核对已登记来源的变化；新版国内指南仍需年度人工检索与医学复核。</p></div><span className="clinical-count">共 {standards.length} 项</span></div>
      <div className="clinical-table-wrap"><table className="clinical-table"><thead><tr><th>标准名称</th><th>类别与版本</th><th>监测方式</th><th>最近检查</th><th>状态</th></tr></thead><tbody>{visibleStandards.map(row => <tr key={row.id}><td><strong>{row.title}</strong><span>{row.domesticNote || row.origin || '出处待核对'}</span><span>{row.domesticSourceUrl ? <a href={row.domesticSourceUrl} target="_blank" rel="noopener noreferrer">国内依据 ↗</a> : '国内依据待补'}{row.originalUrl && row.originalUrl !== row.domesticSourceUrl && <> · <a href={row.originalUrl} target="_blank" rel="noopener noreferrer">国际原版 ↗</a></>}</span></td><td><span className={`clinical-kind clinical-kind-${row.kind}`}>{kindName[row.kind]}</span><span className="clinical-version">{row.version}</span></td><td>{row.monitor === 'source' ? '每季度自动检查' : '年度人工复核'}</td><td>{dateText(row.watch?.checkedAt)}</td><td><span className={`clinical-table-status ${row.watch?.lastError ? 'has-error' : row.watch?.checkedAt ? 'is-ok' : ''}`}>{row.watch?.lastError ? '检查失败' : row.watch?.checkedAt ? '已检查' : '待首次检查'}</span>{row.watch?.lastError && <small title={row.watch.lastError}>{row.watch.lastError}</small>}</td></tr>)}</tbody></table></div>
      <Pagination page={standardsPage} total={standards.length} onPageChange={setStandardsPage} />
    </section>}

    {activeList === 'updates' && <section className="clinical-panel">
      <div className="clinical-section-heading"><div><span className="clinical-step">审核记录</span><h2>来源变化与定期复核</h2><p>来源变化只生成审核任务，不会自动修改客户分级。</p></div><span className="clinical-count">共 {updateTotal} 项</span></div>
      {updates.length ? <div className="clinical-table-wrap"><table className="clinical-table"><thead><tr><th>标准</th><th>发现时间</th><th>进度</th><th>审核记录</th></tr></thead><tbody>{updates.map(row => <tr key={row._id}><td><strong>{standards.find(item => item.id === row.standardId)?.title || row.standardId}</strong></td><td>{dateText(row.detectedAt)}</td><td><span className={`clinical-table-status ${row.status === 'pending' ? '' : 'is-ok'}`}>{statusName[row.status] || row.status}</span></td><td>{row.reviewedByName || '尚未审核'}{row.note && <span className="clinical-review-note">{row.note}</span>}</td></tr>)}</tbody></table></div> : <div className="clinical-empty-records">暂无来源变化记录。首次检查后，需核对的项目会显示在这里。</div>}
      <Pagination page={updatePage} total={updateTotal} onPageChange={setUpdatePage} />
    </section>}
  </div>
}
