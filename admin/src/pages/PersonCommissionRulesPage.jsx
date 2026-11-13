import React, { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { adminAPI } from '../api'

const card = { background: '#fff', border: '1px solid #dbe5de', borderRadius: 10, padding: 18, marginBottom: 16 }
const label = { display: 'block', fontWeight: 600, marginBottom: 6 }
const round = value => Math.round(Number(value || 0) * 100) / 100
const lineName = { consumer365: '365会员', annualAdvisor: '年度顾问', premiumAdvisor: '高端顾问',
  weightManagement: '体重管理', chronicManagement: '慢病管理', medicalAssist: '单次就医',
  oneStopMedical: '一站式就医', assessment: '评估', psychology: '心理咨询', rehabilitation: '运动复健',
  testing: '检测', supplements: '营养素补充', medical: '就医板块', nutrition: '营养板块',
  annual: '年度管理板块', consultation: '咨询板块' }

export default function PersonCommissionRulesPage() {
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState(searchParams.get('tab') === 'partner' ? 'partner' : 'staff')
  const [staff, setStaff] = useState([])
  const [partners, setPartners] = useState([])
  const [products, setProducts] = useState([])
  const [packages, setPackages] = useState([])
  const [allProducts, setAllProducts] = useState([])
  const [allPackages, setAllPackages] = useState([])
  const [staffRules, setStaffRules] = useState([])
  const [serviceThresholds, setServiceThresholds] = useState([])
  const [thresholdYuan, setThresholdYuan] = useState('0')
  const [monthlyVolume, setMonthlyVolume] = useState(null)
  const [partnerRules, setPartnerRules] = useState([])
  const [personId, setPersonId] = useState(searchParams.get('tab') === 'partner' ? searchParams.get('partnerId') || '' : '')
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
  const [rowEdit, setRowEdit] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const [employees, partnerRows, productRows, packageRows, allPackageRows, employeeRules, externalRules, thresholds] = await Promise.all([
      adminAPI.employees({ limit: 500 }), adminAPI.marketPartners(), adminAPI.products(),
      adminAPI.marketPartnerEligiblePackages(), adminAPI.servicePackages(), adminAPI.staffCommissionRules(),
      adminAPI.partnerPersonCommissionRules(),
      adminAPI.staffServiceThresholds(),
    ])
    setStaff((employees.data || []).filter(row => row.staffStatus === 'active'))
    setPartners((partnerRows.data || []).filter(row => row.status !== 'closed'))
    setAllProducts(productRows.data || [])
    setProducts((productRows.data || []).filter(row => row.status === 'on'))
    setPackages(packageRows.data || [])
    setAllPackages(allPackageRows.data || [])
    setStaffRules(employeeRules.data || [])
    setServiceThresholds(thresholds.data || [])
    setPartnerRules(externalRules.data || [])
  }
  useEffect(() => { load().catch(error => setMessage(error.message)).finally(() => setLoading(false)) }, [])
  useEffect(() => {
    if (tab !== 'staff' || !personId) { setMonthlyVolume(null); return }
    let cancelled = false
    adminAPI.staffServiceVolume(personId).then(response => {
      if (!cancelled) setMonthlyVolume(response.data)
    }).catch(error => { if (!cancelled) setMessage(error.message) })
    return () => { cancelled = true }
  }, [tab, personId])

  const people = tab === 'staff' ? staff : partners
  const person = people.find(row => String(row._id) === personId)
  const matchingPeople = people.filter(row => {
    const keyword = personSearch.trim().toLowerCase()
    return !keyword || `${row.name || ''} ${row.username || ''} ${row.phone || ''} ${row.role || ''} ${lineName[row.segment || row.productLine] || row.segment || row.productLine || ''}`
      .toLowerCase().includes(keyword) || String(row._id) === personId
  })
  const availableCategories = useMemo(() => {
    const names = [...new Set(products.map(row => row.category).filter(Boolean))].sort()
    if (packages.length) names.unshift('365会员')
    return names
  }, [products, packages])
  const items = category === '365会员' ? packages : products.filter(row => row.category === category)
  const visibleItems = items.filter(row => `${row.name} ${row.category || ''}`.toLowerCase().includes(search.trim().toLowerCase()))
  const productId = selected[0]
  const activeStaff = staffRules.find(row => String(row.staffId) === personId && row.category === category
    && row.productIds?.some(id => String(id) === productId) && !row.effectiveUntil)
  const activePartner = partnerRules.find(row => String(row.partnerId) === personId && row.category === category
    && String(row.productId) === productId && row.status === 'active' && !row.effectiveUntil)
  const currentPromotionRows = useMemo(() => {
    if (!personId) return []
    const now = new Date()
    const rows = tab === 'staff'
      ? staffRules.filter(rule => String(rule.staffId) === personId
        && (!rule.effectiveUntil || new Date(rule.effectiveUntil) > now)
        && new Date(rule.effectiveFrom) <= now)
        .flatMap(rule => (rule.productIds || []).map(id => ({ rule, id: String(id) })))
      : partnerRules.filter(rule => String(rule.partnerId) === personId && rule.status === 'active'
        && (!rule.effectiveUntil || new Date(rule.effectiveUntil) > now)
        && new Date(rule.effectiveFrom) <= now)
        .map(rule => ({ rule, id: String(rule.productId) }))
    const latest = new Map()
    for (const item of rows) {
      const previous = latest.get(item.id)
      if (!previous || new Date(item.rule.effectiveFrom) > new Date(previous.rule.effectiveFrom)
        || (item.rule.version > previous.rule.version && item.rule.effectiveFrom === previous.rule.effectiveFrom))
        latest.set(item.id, item)
    }
    return [...latest.values()].filter(item => tab === 'staff' ? Number(item.rule.referrerRate) > 0
      : !item.rule.disabled && (Number(item.rule.firstBasisPoints) > 0
        || (item.rule.renewalBasisPoints || []).some(year => year.basisPoints > 0)))
      .map(item => {
      const catalog = [...allProducts, ...allPackages].find(row => String(row._id) === item.id)
      const onSale = allProducts.some(row => String(row._id) === item.id && row.status === 'on')
        || packages.some(row => String(row._id) === item.id)
      return { ...item, name: catalog?.name || `已移除产品（${item.id}）`, onSale,
        category: item.rule.category || catalog?.category || '未分类' }
    }).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  }, [personId, tab, staffRules, partnerRules, allProducts, allPackages, packages])

  const loadExisting = (id, nextCategory, nextProductId, nextTab = tab) => {
    const row = nextTab === 'staff'
      ? staffRules.find(item => String(item.staffId) === id && item.category === nextCategory
        && item.productIds?.some(product => String(product) === nextProductId) && !item.effectiveUntil)
      : partnerRules.find(item => String(item.partnerId) === id && item.category === nextCategory
        && String(item.productId) === nextProductId && item.status === 'active' && !item.effectiveUntil)
    setSelected(nextProductId ? [nextProductId] : [])
    setReferrerRate(nextTab === 'staff' ? String(row?.referrerRate ?? 0)
      : String((row?.firstBasisPoints || 0) / 100))
    setFulfillerRate(nextTab === 'staff' ? String(row?.fulfillerRate ?? 0) : '0')
    setKind(row?.kind || 'first')
    const renewal = Object.fromEntries((row?.renewalBasisPoints || []).map(item => [item.year, item.basisPoints / 100]))
    setRenewal2(String(renewal[2] ?? 10))
    setRenewal35(String(renewal[3] ?? 5))
  }
  const changePerson = id => {
    setPersonId(id); setCategory(''); setSelected([]); setSearch(''); setMessage(''); setRowEdit(null)
    const current = serviceThresholds.find(row => String(row.staffId) === id && !row.effectiveUntil)
    setThresholdYuan(String((current?.thresholdCents || 0) / 100))
  }
  const changeCategory = value => {
    setCategory(value); setSearch(''); setMessage(''); loadExisting(personId, value, '')
    if (tab === 'partner' && !partnerRules.some(item => String(item.partnerId) === personId
      && item.category === value && item.status === 'active' && !item.effectiveUntil)) {
      setKind(value === '365会员' || value.includes('年度') ? 'annual' : 'first')
    }
  }
  const changeTab = value => {
    setTab(value); setPersonId(''); setPersonSearch(''); setCategory(''); setSelected([]); setSearch(''); setMessage(''); setRowEdit(null)
    setThresholdYuan('0')
  }
  const saveThreshold = async () => {
    if (!personId || !Number.isFinite(Number(thresholdYuan)) || Number(thresholdYuan) < 0) {
      setMessage('请选择员工并填写有效的月度基础服务业务量'); return
    }
    setBusy(true); setMessage('')
    try {
      await adminAPI.saveStaffServiceThreshold({ staffId: personId, thresholdYuan: Number(thresholdYuan) })
      await load(); setMonthlyVolume((await adminAPI.staffServiceVolume(personId)).data)
      setMessage('月度门槛已保存，新完成的服务按新版规则核算')
    } catch (error) { setMessage(error.message || '保存门槛失败') }
    finally { setBusy(false) }
  }
  const chooseProduct = id => { loadExisting(personId, category, id); setMessage('') }
  const save = async () => {
    if (!personId || !category || selected.length !== 1) { setMessage('请选择人员、类别和一个产品'); return }
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
      await load(); setMessage('规则已保存，该产品的新订单按新版计算；其他产品设置不变')
    } catch (error) { setMessage(error.message || '保存失败') }
    finally { setBusy(false) }
  }
  const preview = round(1000 * Number(referrerRate || 0) / 100)
  const editPromotion = item => setRowEdit({ id: item.id, rate: String(tab === 'staff'
    ? item.rule.referrerRate : item.rule.firstBasisPoints / 100),
    serviceRate: String(item.rule.fulfillerRate ?? 0), kind: item.rule.kind || 'first',
    renewals: Object.fromEntries((item.rule.renewalBasisPoints || []).map(year =>
      [year.year, String(year.basisPoints / 100)])) })
  const savePromotionRow = async item => {
    const rate = Number(rowEdit?.rate)
    const years = Object.entries(rowEdit?.renewals || {}).map(([year, percent]) =>
      ({ year: Number(year), percent: Number(percent) }))
    if (!Number.isFinite(rate) || rate < 0 || rate > 100
      || years.some(year => !Number.isFinite(year.percent) || year.percent < 0 || year.percent > 100)) {
      setMessage('比例须为 0–100%'); return
    }
    setBusy(true); setMessage('')
    try {
      if (tab === 'staff') await adminAPI.saveStaffCommissionRule({ staffId: personId,
        category: item.category, productIds: [item.id], referrerRate: rate,
        fulfillerRate: item.rule.fulfillerRate })
      else await adminAPI.savePartnerPersonCommissionRule({ partnerId: personId,
        productLine: person.productLine, category: item.category, productIds: [item.id],
        kind: rowEdit.kind, firstPercent: rate, renewals: rowEdit.kind === 'annual' ? years : [] })
      await load(); setRowEdit(null)
      setMessage('推广佣金已更新，新订单按新版规则计算')
    } catch (error) { setMessage(error.message || '保存失败') }
    finally { setBusy(false) }
  }
  const removePromotionRow = async item => {
    if (!window.confirm(`移除 ${item.name} 的推广佣金？历史订单仍保留原规则。`)) return
    setBusy(true); setMessage('')
    try {
      if (tab === 'staff') await adminAPI.removeStaffPromotionRule(item.rule._id, item.id)
      else await adminAPI.removePartnerPromotionRule(item.rule._id)
      await load(); setRowEdit(null)
      setMessage('推广佣金已移除，新订单不再计提；历史订单保留原规则')
    } catch (error) { setMessage(error.message || '移除失败') }
    finally { setBusy(false) }
  }

  return <div className="page">
    <div className="page-header"><div><div className="page-title">佣金规则</div>
      <div className="page-subtitle">选择人员与产品，逐个设置推广和服务佣金；类别只用于查找</div></div></div>
    <div style={card}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={tab === 'staff' ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => changeTab('staff')}>员工</button>
        <button className={tab === 'partner' ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => changeTab('partner')}>市场合伙人</button>
        {tab === 'partner' && <Link className="btn btn-ghost" to="/market-partners">合伙人档案与团队</Link>}
      </div>
      {loading ? <p>加载中...</p> : <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
          <div><label style={label}>选择{tab === 'staff' ? '员工' : '合伙人'}</label>
            <input className="form-input" type="search" aria-label={`搜索${tab === 'staff' ? '员工' : '合伙人'}`}
              value={personSearch} onChange={event => setPersonSearch(event.target.value)}
              placeholder="搜索姓名、账号或手机号" style={{ marginBottom: 8 }} />
            <select className="form-input" value={personId} onChange={event => changePerson(event.target.value)}>
              <option value="">{matchingPeople.length ? '请选择' : '无匹配人员'}</option>{matchingPeople.map(row => <option key={row._id} value={row._id}>{row.name}{tab === 'staff' ? ` · ${row.role}` : ` · ${lineName[row.segment || row.productLine] || row.segment || row.productLine}`}</option>)}
            </select></div>
          <div><label style={label}>业务类别</label><select className="form-input" value={category}
            disabled={!personId} onChange={event => changeCategory(event.target.value)}><option value="">请选择</option>
            {availableCategories.filter(name => tab === 'staff' || person?.segment || (person?.productLine === 'consumer365'
              ? name === '365会员' : name !== '365会员'))
              .map(name => <option key={name} value={name}>{name}</option>)}
          </select></div>
        </div>
        {tab === 'staff' && personId && <div style={{ ...card, marginTop: 16, background: '#f8fbf9' }}>
          <strong>本人全部服务的月度与季度业务量门槛</strong>
          <p style={{ color: '#667a6d' }}>所有产品、所有类别的已完成服务业务量合并计算，每名员工只设一个月度门槛，季度门槛为月度的 3 倍。单月超额须抵扣季度内其他月份的不足；季度最终可计提业务量不超过季度合计超额。季度结束且订单支付满 30 天后才可审核发放。设置 0 表示不设门槛。</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>每月 ¥</span><input className="form-input" type="number" min="0" step="0.01"
              aria-label="员工月度基础服务业务量" value={thresholdYuan}
              onChange={event => setThresholdYuan(event.target.value)} style={{ maxWidth: 170 }} />
            <button className="btn btn-primary" disabled={busy} onClick={saveThreshold}>保存员工门槛</button>
            <span>当前 v{serviceThresholds.find(row => String(row.staffId) === personId && !row.effectiveUntil)?.version || '—'}</span>
          </div>
          {monthlyVolume && <p style={{ marginBottom: 0 }}>本月（{monthlyVolume.month}）已完成服务业务量 ¥{(monthlyVolume.volumeCents / 100).toFixed(2)}；
            月门槛 ¥{(monthlyVolume.thresholdCents / 100).toFixed(2)}；本月超出 ¥{(monthlyVolume.excessCents / 100).toFixed(2)}。<br />
            本季度累计 ¥{(monthlyVolume.quarterVolumeCents / 100).toFixed(2)}；季度门槛 ¥{(monthlyVolume.quarterThresholdCents / 100).toFixed(2)}；
            季度净超出 ¥{(monthlyVolume.quarterExcessCents / 100).toFixed(2)}。季度结算前金额仅为预估。</p>}
        </div>}
        {!!category && <>
          <div style={{ marginTop: 18 }}><strong>选择产品</strong></div>
          <input className="form-input" type="search" value={search} onChange={event => setSearch(event.target.value)}
            placeholder="搜索项目名称" style={{ margin: '10px 0', maxWidth: 360 }} />
          <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #e5ebe7', borderRadius: 8, padding: 8 }}>
            {visibleItems.map(row => <label key={row._id} style={{ display: 'block', padding: 7 }}>
              <input type="radio" name="commissionProduct" checked={productId === String(row._id)}
                onChange={() => chooseProduct(String(row._id))} />{' '}{row.name}
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
          <button className="btn btn-primary" disabled={busy || !productId} onClick={save}>{busy ? '保存中...' : '保存该产品规则'}</button>
        </>}
        {message && <p role="status" style={{ color: /^(规则已|推广佣金已)/.test(message) ? '#1E6B50' : '#b42318' }}>{message}</p>}
      </>}
    </div>
    <div style={card}><strong>{person ? `${person.name} · 有推广佣金的产品（${currentPromotionRows.length}）` : '人员推广佣金总览'}</strong>
      <p style={{ color: '#667a6d' }}>选择人员后直接查看当前有推广佣金的产品，并在此编辑或移除。修改只影响新订单，历史订单保留原规则。</p>
      {person && <><div style={{ overflowX: 'auto' }}><table className="table"><thead><tr>
        <th>产品／服务包</th><th>类别</th><th>推广佣金</th><th>销售状态</th><th>操作</th>
      </tr></thead><tbody>{currentPromotionRows.map(item => <tr key={item.id}>
        <td>{item.name}</td><td>{item.category}</td>
        <td>{tab === 'staff' ? `${item.rule.referrerRate}%` : item.rule.kind === 'annual'
          ? `首年 ${item.rule.firstBasisPoints / 100}%${(item.rule.renewalBasisPoints || []).length
            ? `；${item.rule.renewalBasisPoints.map(year => `第${year.year}年 ${year.basisPoints / 100}%`).join('；')}` : ''}`
          : `${item.rule.firstBasisPoints / 100}% · ${item.rule.kind === 'every' ? '每次' : '仅首次'}`}</td>
        <td>{item.onSale ? '在售' : '已下架／不可售'}</td>
        <td><button className="btn btn-sm" disabled={busy || !item.onSale} onClick={() => editPromotion(item)}>直接编辑</button>{' '}
          <button className="btn btn-sm" disabled={busy} onClick={() => removePromotionRow(item)}>移除推广佣金</button></td>
      </tr>).flatMap((entry, index) => {
        const item = currentPromotionRows[index]
        if (rowEdit?.id !== item.id) return [entry]
        return [entry, <tr key={`${item.id}:edit`}><td colSpan="5"><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {tab === 'partner' && <label>计佣方式 <select className="form-input" value={rowEdit.kind}
            onChange={event => setRowEdit({ ...rowEdit, kind: event.target.value,
              renewals: event.target.value === 'annual' && !Object.keys(rowEdit.renewals).length
                ? { 2: '10', 3: '5', 4: '5', 5: '5' } : rowEdit.renewals })}>
            <option value="first">仅首次</option><option value="annual">年度首续</option><option value="every">每次</option>
          </select></label>}
          <label>推广比例 % <input className="form-input" type="number" min="0" max="100" step="0.01"
            value={rowEdit.rate} onChange={event => setRowEdit({ ...rowEdit, rate: event.target.value })}
            style={{ maxWidth: 130 }} /></label>
          {tab === 'partner' && rowEdit.kind === 'annual' && Object.entries(rowEdit.renewals)
            .sort(([a], [b]) => Number(a) - Number(b)).map(([year, percent]) =>
              <label key={year}>第 {year} 年 % <input className="form-input" type="number" min="0" max="100" step="0.01"
                value={percent} onChange={event => setRowEdit({ ...rowEdit,
                  renewals: { ...rowEdit.renewals, [year]: event.target.value } })} style={{ maxWidth: 110 }} /></label>)}
          <button className="btn btn-primary" disabled={busy} onClick={() => savePromotionRow(item)}>保存新版</button>
          <button className="btn btn-ghost" onClick={() => setRowEdit(null)}>取消</button>
        </div></td></tr>]
      })}</tbody></table></div>
        {!currentPromotionRows.length && <p>该人员当前没有生效且比例大于 0 的推广佣金产品。</p>}</>}
    </div>
    <div style={card}><strong>当前选中产品规则</strong><p style={{ color: '#667a6d' }}>选择产品后查看；修改保存为新版本，旧订单不回算。</p>
      {productId && personId && <div>{tab === 'staff'
        ? activeStaff ? `员工规则 v${activeStaff.version} · 推广 ${activeStaff.referrerRate}% · 服务 ${activeStaff.fulfillerRate}%` : '该产品尚未设置员工规则'
        : activePartner ? `合伙人规则 v${activePartner.version} · ${activePartner.kind === 'annual' ? '年度首续' : activePartner.kind === 'every' ? '每次' : '仅首次'} · 首次 ${activePartner.firstBasisPoints / 100}%` : '该产品尚未设置合伙人规则'}</div>}
      {productId && personId && <details style={{ marginTop: 12 }}><summary>该产品历史版本</summary>
        {(tab === 'staff' ? staffRules.filter(row => String(row.staffId) === personId && row.category === category
          && row.productIds?.some(id => String(id) === productId) && row.effectiveUntil)
          : partnerRules.filter(row => String(row.partnerId) === personId && row.category === category
            && String(row.productId) === productId && row.effectiveUntil))
          .map(row => <div key={row._id} style={{ padding: 6, borderBottom: '1px solid #edf0ed' }}>
            v{row.version} · {tab === 'staff' ? `${row.productIds?.length || 0} 项 · 推广 ${row.referrerRate}% · 服务 ${row.fulfillerRate}%`
              : `${row.kind} · 推广 ${row.firstBasisPoints / 100}%`} · {row.effectiveFrom?.slice(0, 10)} 至 {row.effectiveUntil?.slice(0, 10)}
          </div>)}
      </details>}
    </div>
  </div>
}
