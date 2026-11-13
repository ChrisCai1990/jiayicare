import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminAPI } from '../api'

const card = { background: '#fff', border: '1px solid #dbe5de', borderRadius: 10, padding: 18, marginBottom: 16 }
const label = { display: 'block', fontWeight: 600, marginBottom: 6 }
const round = value => Math.round(Number(value || 0) * 100) / 100
const lineName = { consumer365: '365会员', annualAdvisor: '年度顾问', premiumAdvisor: '高端顾问',
  weightManagement: '体重管理', chronicManagement: '慢病管理', medicalAssist: '单次就医',
  oneStopMedical: '一站式就医', assessment: '评估', psychology: '心理咨询', rehabilitation: '运动复健',
  testing: '检测', supplements: '营养素补充' }

export default function PersonCommissionRulesPage() {
  const [tab, setTab] = useState('staff')
  const [staff, setStaff] = useState([])
  const [partners, setPartners] = useState([])
  const [products, setProducts] = useState([])
  const [packages, setPackages] = useState([])
  const [staffRules, setStaffRules] = useState([])
  const [partnerRules, setPartnerRules] = useState([])
  const [personId, setPersonId] = useState('')
  const [personSearch, setPersonSearch] = useState('')
  const [category, setCategory] = useState('')
  const [selected, setSelected] = useState([])
  const [search, setSearch] = useState('')
  const [referrerRate, setReferrerRate] = useState('0')
  const [fulfillerRate, setFulfillerRate] = useState('0')
  const [kind, setKind] = useState('first')
  const [renewal2, setRenewal2] = useState('10')
  const [renewal35, setRenewal35] = useState('5')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const [employees, partnerRows, productRows, packageRows, employeeRules, externalRules] = await Promise.all([
      adminAPI.employees({ limit: 500 }), adminAPI.marketPartners(), adminAPI.products(),
      adminAPI.marketPartnerEligiblePackages(), adminAPI.staffCommissionRules(),
      adminAPI.partnerPersonCommissionRules(),
    ])
    setStaff((employees.data || []).filter(row => row.staffStatus === 'active'))
    setPartners((partnerRows.data || []).filter(row => row.status !== 'closed'))
    setProducts((productRows.data || []).filter(row => row.status === 'on'))
    setPackages(packageRows.data || [])
    setStaffRules(employeeRules.data || [])
    setPartnerRules(externalRules.data || [])
  }
  useEffect(() => { load().catch(error => setMessage(error.message)).finally(() => setLoading(false)) }, [])

  const people = tab === 'staff' ? staff : partners
  const person = people.find(row => String(row._id) === personId)
  const matchingPeople = people.filter(row => {
    const keyword = personSearch.trim().toLowerCase()
    return !keyword || `${row.name || ''} ${row.username || ''} ${row.phone || ''} ${row.role || ''} ${lineName[row.productLine] || row.productLine || ''}`
      .toLowerCase().includes(keyword) || String(row._id) === personId
  })
  const availableCategories = useMemo(() => {
    const names = [...new Set(products.map(row => row.category).filter(Boolean))].sort()
    if (packages.length) names.unshift('365会员')
    return names
  }, [products, packages])
  const items = category === '365会员' ? packages : products.filter(row => row.category === category)
  const visibleItems = items.filter(row => `${row.name} ${row.category || ''}`.toLowerCase().includes(search.trim().toLowerCase()))
  const activeStaff = staffRules.find(row => String(row.staffId) === personId && row.category === category && !row.effectiveUntil)
  const activePartner = partnerRules.filter(row => String(row.partnerId) === personId && row.category === category
    && row.status === 'active' && !row.effectiveUntil)

  const loadExisting = (id, nextCategory, nextTab = tab) => {
    const row = nextTab === 'staff'
      ? staffRules.find(item => String(item.staffId) === id && item.category === nextCategory && !item.effectiveUntil)
      : partnerRules.find(item => String(item.partnerId) === id && item.category === nextCategory
        && item.status === 'active' && !item.effectiveUntil)
    const rows = nextTab === 'staff' ? row?.productIds?.map(String) || []
      : partnerRules.filter(item => String(item.partnerId) === id && item.category === nextCategory
        && item.status === 'active' && !item.effectiveUntil).map(item => String(item.productId))
    setSelected(rows)
    setReferrerRate(nextTab === 'staff' ? String(row?.referrerRate ?? 0)
      : String((row?.firstBasisPoints || 0) / 100))
    setFulfillerRate(nextTab === 'staff' ? String(row?.fulfillerRate ?? 0) : '0')
    setKind(row?.kind || 'first')
    const renewal = Object.fromEntries((row?.renewalBasisPoints || []).map(item => [item.year, item.basisPoints / 100]))
    setRenewal2(String(renewal[2] ?? 10))
    setRenewal35(String(renewal[3] ?? 5))
  }
  const changePerson = id => {
    setPersonId(id); setCategory(''); setSelected([]); setSearch(''); setMessage('')
  }
  const changeCategory = value => {
    setCategory(value); setSearch(''); setMessage(''); loadExisting(personId, value)
    if (tab === 'partner' && !partnerRules.some(item => String(item.partnerId) === personId
      && item.category === value && item.status === 'active' && !item.effectiveUntil)) {
      setKind(value === '365会员' || value.includes('年度') ? 'annual' : 'first')
    }
  }
  const changeTab = value => {
    setTab(value); setPersonId(''); setPersonSearch(''); setCategory(''); setSelected([]); setSearch(''); setMessage('')
  }
  const toggle = id => setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  const selectVisible = () => setSelected(current => [...new Set([...current, ...visibleItems.map(item => String(item._id))])])
  const clearVisible = () => setSelected(current => current.filter(id => !visibleItems.some(item => String(item._id) === id)))
  const save = async () => {
    if (!personId || !category || !selected.length) { setMessage('请选择人员、类别和适用项目'); return }
    if ([referrerRate, ...(tab === 'staff' ? [fulfillerRate] : kind === 'annual' ? [renewal2, renewal35] : [])]
      .some(value => !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100)) {
      setMessage('比例须为 0–100%'); return
    }
    setBusy(true); setMessage('')
    try {
      if (tab === 'staff') await adminAPI.saveStaffCommissionRule({ staffId: personId, category,
        productIds: selected, referrerRate: Number(referrerRate), fulfillerRate: Number(fulfillerRate) })
      else await adminAPI.savePartnerPersonCommissionRule({ partnerId: personId,
        productLine: person.productLine, category, productIds: selected, kind,
        firstPercent: Number(referrerRate), renewals: kind === 'annual'
          ? [{ year: 2, percent: Number(renewal2) }, ...[3, 4, 5].map(year => ({ year, percent: Number(renewal35) }))] : [] })
      await load(); setMessage('规则已保存，新订单按新版计算；历史订单保持原版本')
    } catch (error) { setMessage(error.message || '保存失败') }
    finally { setBusy(false) }
  }
  const preview = round(1000 * Number(referrerRate || 0) / 100)

  return <div className="page">
    <div className="page-header"><div><div className="page-title">佣金规则</div>
      <div className="page-subtitle">按人员和业务类别设置，勾选适用项目后统一生效</div></div></div>
    <div style={card}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={tab === 'staff' ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => changeTab('staff')}>员工</button>
        <button className={tab === 'partner' ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => changeTab('partner')}>市场合伙人</button>
        {tab === 'partner' && <Link className="btn btn-ghost" to="/market-partners">合伙人资料与结算</Link>}
      </div>
      {loading ? <p>加载中...</p> : <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
          <div><label style={label}>选择{tab === 'staff' ? '员工' : '合伙人'}</label>
            <input className="form-input" type="search" aria-label={`搜索${tab === 'staff' ? '员工' : '合伙人'}`}
              value={personSearch} onChange={event => setPersonSearch(event.target.value)}
              placeholder="搜索姓名、账号或手机号" style={{ marginBottom: 8 }} />
            <select className="form-input" value={personId} onChange={event => changePerson(event.target.value)}>
              <option value="">{matchingPeople.length ? '请选择' : '无匹配人员'}</option>{matchingPeople.map(row => <option key={row._id} value={row._id}>{row.name}{tab === 'staff' ? ` · ${row.role}` : ` · ${lineName[row.productLine] || row.productLine}`}</option>)}
            </select></div>
          <div><label style={label}>业务类别</label><select className="form-input" value={category}
            disabled={!personId} onChange={event => changeCategory(event.target.value)}><option value="">请选择</option>
            {availableCategories.filter(name => tab === 'staff' || (person?.productLine === 'consumer365'
              ? name === '365会员' : name !== '365会员'))
              .map(name => <option key={name} value={name}>{name}</option>)}
          </select></div>
        </div>
        {!!category && <>
          <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <strong>适用项目（已选 {selected.length} 项）</strong>
            <div><button className="btn btn-sm btn-ghost" onClick={selectVisible}>勾选当前结果</button>{' '}
              <button className="btn btn-sm btn-ghost" onClick={clearVisible}>取消当前结果</button></div>
          </div>
          <input className="form-input" type="search" value={search} onChange={event => setSearch(event.target.value)}
            placeholder="搜索项目名称" style={{ margin: '10px 0', maxWidth: 360 }} />
          <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #e5ebe7', borderRadius: 8, padding: 8 }}>
            {visibleItems.map(row => <label key={row._id} style={{ display: 'block', padding: 7 }}>
              <input type="checkbox" checked={selected.includes(String(row._id))} onChange={() => toggle(String(row._id))} />{' '}{row.name}
            </label>)}
            {!visibleItems.length && <span style={{ color: '#667a6d' }}>该类别暂无匹配的在售项目</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginTop: 18 }}>
            {tab === 'partner' && <div><label style={label}>计佣方式</label><select className="form-input" value={kind} onChange={event => setKind(event.target.value)}>
              <option value="first">仅首次</option><option value="annual">年度首续</option><option value="every">每次</option></select></div>}
            <div><label style={label}>{tab === 'partner' && kind === 'annual' ? '首年推广比例 %' : '推广比例 %'}</label>
              <input className="form-input" type="number" min="0" max="100" step="0.01" value={referrerRate}
                onChange={event => setReferrerRate(event.target.value)} /></div>
            {tab === 'staff' && <div><label style={label}>服务比例 %</label><input className="form-input" type="number"
              min="0" max="100" step="0.01" value={fulfillerRate} onChange={event => setFulfillerRate(event.target.value)} /></div>}
            {tab === 'partner' && kind === 'annual' && <><div><label style={label}>第 2 年推广比例 %</label>
              <input className="form-input" type="number" min="0" max="100" step="0.01" value={renewal2}
                onChange={event => setRenewal2(event.target.value)} /></div><div><label style={label}>第 3–5 年推广比例 %</label>
                <input className="form-input" type="number" min="0" max="100" step="0.01" value={renewal35}
                  onChange={event => setRenewal35(event.target.value)} /></div></>}
          </div>
          <p style={{ color: '#667a6d', fontSize: 13 }}>示例：实收 ¥1,000，按当前推广比例约 ¥{preview.toFixed(2)}。
            {tab === 'staff' ? '服务费须有实际履约证据后计提。' : kind === 'annual' ? '第 6 年起为 0。' : ''}
          </p>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? '保存中...' : '保存该人员规则'}</button>
        </>}
        {message && <p role="status" style={{ color: message.startsWith('规则已') ? '#1E6B50' : '#b42318' }}>{message}</p>}
      </>}
    </div>
    <div style={card}><strong>已设置</strong><p style={{ color: '#667a6d' }}>选择人员和类别后显示生效规则；修改时保存为新版本，旧订单不回算。</p>
      {category && personId && <div>{tab === 'staff'
        ? activeStaff ? `员工规则 v${activeStaff.version} · ${activeStaff.productIds.length} 项 · 推广 ${activeStaff.referrerRate}% · 服务 ${activeStaff.fulfillerRate}%` : '尚未设置员工规则'
        : activePartner.length ? `合伙人规则 · ${activePartner.length} 项 · ${activePartner[0].kind === 'annual' ? '年度首续' : activePartner[0].kind === 'every' ? '每次' : '仅首次'} · 首次 ${activePartner[0].firstBasisPoints / 100}%` : '尚未设置合伙人规则'}</div>}
      {category && personId && <details style={{ marginTop: 12 }}><summary>历史版本</summary>
        {(tab === 'staff' ? staffRules.filter(row => String(row.staffId) === personId && row.category === category && row.effectiveUntil)
          : partnerRules.filter(row => String(row.partnerId) === personId && row.category === category && row.effectiveUntil))
          .map(row => <div key={row._id} style={{ padding: 6, borderBottom: '1px solid #edf0ed' }}>
            v{row.version} · {tab === 'staff' ? `${row.productIds?.length || 0} 项 · 推广 ${row.referrerRate}% · 服务 ${row.fulfillerRate}%`
              : `${row.kind} · 推广 ${row.firstBasisPoints / 100}%`} · {row.effectiveFrom?.slice(0, 10)} 至 {row.effectiveUntil?.slice(0, 10)}
          </div>)}
      </details>}
    </div>
  </div>
}
