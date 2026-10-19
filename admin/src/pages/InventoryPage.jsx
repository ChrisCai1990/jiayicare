import React, { useEffect, useState } from 'react'
import { adminAPI } from '../api'
import SearchableProductSelect from '../../../shared/SearchableProductSelect'

const labels = { opening:'期初', receipt:'入库', issue:'领用', use:'实际使用', return:'退回', loss:'报损', count:'盘点', manual_sale:'医护录入消费' }
const money = value => `¥${Number(value || 0).toFixed(2)}`
const date = value => value ? new Date(value).toLocaleString('zh-CN') : '-'

export default function InventoryPage() {
  const [data, setData] = useState({ products: [], recent: [] })
  const [catalog, setCatalog] = useState([])
  const [people, setPeople] = useState([])
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [consumption, setConsumption] = useState({ manual: [], orders: [] })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [enable, setEnable] = useState({ productId:'', kind:'consumable', unit:'件', minStock:0, defaultCost:0, location:'', openingQuantity:'', openingNote:'' })
  const [entry, setEntry] = useState({ productId:'', type:'receipt', units:1, batchNo:'', serialNo:'', expiresAt:'', location:'', userId:'', assigneeId:'', unitCost:'', unitPrice:'', note:'' })
  const [count, setCount] = useState({ productId:'', counted:'', note:'' })
  const [settings, setSettings] = useState({ productId:'', minStock:0, defaultCost:0, location:'' })
  const load = async () => {
    const [inventory, products, usage, staff] = await Promise.all([adminAPI.inventory(), adminAPI.products(), adminAPI.inventoryConsumption(), adminAPI.inventoryPeople()])
    setData(inventory.data)
    setCatalog(products.data || [])
    setConsumption(usage.data)
    setPeople(staff.data)
  }
  useEffect(() => { load().catch(e => setError(e.message)) }, [])
  const submit = async (operation) => {
    setBusy(true); setError(''); setMessage('')
    try { await operation(); await load(); setMessage('已保存') }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  const selected = data.products.find(p => p._id === entry.productId)
  const tracked = new Set(data.products.map(p => p._id))
  const unavailable = catalog.filter(p => !tracked.has(p._id))
  const enableProduct = unavailable.find(p => p._id === enable.productId)
  const countProduct = data.products.find(p => p._id === count.productId)
  const actualValue = data.products.filter(p => !p.needsOpeningCount).reduce((sum, p) => sum + Number(p.stock || 0) * Number(p.inventoryTracking?.defaultCost || 0), 0)
  const unverifiedCount = data.products.filter(p => p.needsOpeningCount).length
  const manualSales = consumption.manual.filter(x => x.type === 'manual_sale').reduce((sum, x) => sum + x.units * x.unitPrice, 0)
  const mallSales = consumption.orders.reduce((sum, x) => sum + Number(x.paidAmount || x.servicePrice || 0), 0)
  return <div style={{ padding:24, maxWidth:1400, margin:'0 auto' }}>
    <h1>物资与设备管理</h1>
    <p>商城售价在「商城产品」维护；这里维护成本参考、出入库、人员使用及实物盘点。商城订单沿用原订单和库存逻辑。</p>
    {error && <div role="alert" style={{ color:'#b91c1c', marginBottom:12 }}>{error}</div>}
    {message && <div role="status" style={{ color:'#166534', marginBottom:12 }}>{message}</div>}
    <section className="card" style={{ padding:20, marginBottom:18 }}>
      <h2>库存概览</h2>
      <p>跟踪商品 {data.products.length} 项 · 已核实商品按参考成本估算库存 {money(actualValue)} · 待实盘核实 {unverifiedCount} 项 · 近 500 条记录中的商城订单 {money(mallSales)} / 医护录入消费 {money(manualSales)}</p>
      <div style={{ overflowX:'auto' }}><table className="table"><thead><tr><th>商品</th><th>类别</th><th>可用</th><th>预警</th><th>售价</th><th>参考成本</th><th>存放地点</th></tr></thead><tbody>
        {data.products.map(p => <tr key={p._id}><td>{p.name}</td><td>{p.inventoryTracking?.kind === 'reusable' ? '可重复使用设备' : '耗材/商品'}</td><td>{p.needsOpeningCount ? `待核实（旧账面 ${p.stock}）` : `${p.stock} ${p.inventoryTracking?.unit || ''}`}</td><td>{p.needsOpeningCount ? '待实盘核实' : Number(p.stock) <= Number(p.inventoryTracking?.minStock || 0) ? '低库存' : '-'}</td><td>{money(p.originalPrice)}</td><td>{money(p.inventoryTracking?.defaultCost)}</td><td>{p.inventoryTracking?.location || '-'}</td></tr>)}
      </tbody></table></div>
    </section>
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))', gap:18 }}>
      <form className="card" style={{ padding:20 }} onSubmit={e => { e.preventDefault(); if (enable.productId) submit(async () => { await adminAPI.enableInventoryProduct(enable.productId, enable); setEnable(current => ({ ...current, productId:'', openingQuantity:'', openingNote:'' })) }) }}>
        <h2>启用商品台账</h2><p>先清点实物，填写真实期初数量。商城原有库存可能只是展示数字，不会作为期初。</p>
        <SearchableProductSelect products={unavailable} value={enable.productId} onChange={productId => setEnable({ ...enable, productId })} placeholder="选择商城商品" optionLabel={p => `${p.name}（原商城 ${p.stock}）`} />
        {enableProduct && <p style={{ color:'#92400e' }}>商城原显示 {enableProduct.stock}，请勿直接照抄；以实物清点为准。</p>}
        <label>实盘期初数量<input className="form-input" type="number" min="0" step="1" required placeholder="填写实际清点数量" value={enable.openingQuantity} onChange={e => setEnable({ ...enable, openingQuantity:e.target.value })} /></label>
        <label>清点依据<input className="form-input" required placeholder="如清点日期、地点及核对人" value={enable.openingNote} onChange={e => setEnable({ ...enable, openingNote:e.target.value })} /></label>
        <select className="form-input" value={enable.kind} onChange={e => setEnable({ ...enable, kind:e.target.value })}><option value="consumable">耗材/商品</option><option value="reusable">可重复使用设备</option></select>
        <input className="form-input" placeholder="单位，如盒、片、台" value={enable.unit} onChange={e => setEnable({ ...enable, unit:e.target.value })} />
        <label>最低库存<input className="form-input" type="number" min="0" value={enable.minStock} onChange={e => setEnable({ ...enable, minStock:e.target.value })} /></label>
        <label>参考成本价<input className="form-input" type="number" min="0" step="0.01" value={enable.defaultCost} onChange={e => setEnable({ ...enable, defaultCost:e.target.value })} /></label>
        <input className="form-input" placeholder="存放地点" value={enable.location} onChange={e => setEnable({ ...enable, location:e.target.value })} />
        <button className="btn btn-primary" disabled={busy || !enable.productId || enable.openingQuantity === '' || !enable.openingNote.trim()}>按实盘数量启用</button>
      </form>
      <form className="card" style={{ padding:20 }} onSubmit={e => { e.preventDefault(); submit(() => adminAPI.updateInventorySettings(settings.productId, settings)) }}>
        <h2>成本与预警设置</h2><p>对外售价请到「商城产品」维护；这里的参考成本用于估算库存价值。每笔流水保存当时的成本快照。</p>
        <SearchableProductSelect products={data.products} value={settings.productId} onChange={productId => { const p = data.products.find(x => x._id === productId); setSettings({ productId, minStock:p?.inventoryTracking?.minStock ?? 0, defaultCost:p?.inventoryTracking?.defaultCost ?? 0, location:p?.inventoryTracking?.location ?? '' }) }} />
        <label>最低库存<input className="form-input" type="number" min="0" value={settings.minStock} onChange={e => setSettings({ ...settings, minStock:e.target.value })} /></label>
        <label>参考成本价<input className="form-input" type="number" min="0" step="0.01" value={settings.defaultCost} onChange={e => setSettings({ ...settings, defaultCost:e.target.value })} /></label>
        <input className="form-input" placeholder="存放地点" value={settings.location} onChange={e => setSettings({ ...settings, location:e.target.value })} />
        <button className="btn btn-primary" disabled={busy || !settings.productId}>保存设置</button>
      </form>
      <form className="card" style={{ padding:20 }} onSubmit={e => { e.preventDefault(); submit(() => adminAPI.inventoryEntry(entry)) }}>
        <h2>登记出入库</h2>
        <SearchableProductSelect products={data.products} value={entry.productId} onChange={productId => setEntry({ ...entry, productId, unitPrice:data.products.find(p => p._id === productId)?.originalPrice ?? '' })} optionLabel={p => `${p.name} · 现有 ${p.stock}`} />
        <select className="form-input" value={entry.type} onChange={e => setEntry({ ...entry, type:e.target.value })}>{['receipt','issue','use','return','loss','manual_sale'].map(type => <option key={type} value={type}>{labels[type]}</option>)}</select>
        <label>数量<input className="form-input" type="number" min="1" required value={entry.units} onChange={e => setEntry({ ...entry, units:e.target.value })} /></label>
        <input className="form-input" placeholder="批次号" value={entry.batchNo} onChange={e => setEntry({ ...entry, batchNo:e.target.value })} />
        {selected?.inventoryTracking?.kind === 'reusable' && <input className="form-input" placeholder="设备序列号" value={entry.serialNo} onChange={e => setEntry({ ...entry, serialNo:e.target.value })} />}
        <label>有效期<input className="form-input" type="date" value={entry.expiresAt} onChange={e => setEntry({ ...entry, expiresAt:e.target.value })} /></label>
        {entry.type === 'receipt' && <label>本批实际成本单价（留空用参考成本）<input className="form-input" type="number" min="0" step="0.01" value={entry.unitCost} onChange={e => setEntry({ ...entry, unitCost:e.target.value })} /></label>}
        {['use','manual_sale'].includes(entry.type) && <><div style={{ display:'flex', gap:6 }}><input className="form-input" placeholder="客户姓名或手机号" value={search} onChange={e => setSearch(e.target.value)} /><button className="btn btn-secondary" type="button" onClick={() => adminAPI.inventoryUsers(search).then(r => setUsers(r.data)).catch(e => setError(e.message))}>查找</button></div><select className="form-input" required value={entry.userId} onChange={e => setEntry({ ...entry, userId:e.target.value })}><option value="">选择客户</option>{users.map(u => <option key={u._id} value={u._id}>{u.name} · {u.phone || u.patientNo || ''}</option>)}</select></>}
        {['issue','return'].includes(entry.type) && <select className="form-input" required value={entry.assigneeId} onChange={e => setEntry({ ...entry, assigneeId:e.target.value })}><option value="">选择领用/归还人员</option>{people.map(person => <option key={person._id} value={person._id}>{person.name}</option>)}</select>}
        {entry.type === 'manual_sale' && <label>本次成交单价<input className="form-input" type="number" min="0" step="0.01" required value={entry.unitPrice} onChange={e => setEntry({ ...entry, unitPrice:e.target.value })} /></label>}
        <input className="form-input" placeholder="备注/凭据" value={entry.note} onChange={e => setEntry({ ...entry, note:e.target.value })} />
        <button className="btn btn-primary" disabled={busy || !entry.productId}>保存流水</button>
      </form>
      <form className="card" style={{ padding:20 }} onSubmit={e => { e.preventDefault(); if (count.productId) submit(async () => { await adminAPI.inventoryCount(count); setCount(current => ({ ...current, counted:'', note:'' })) }) }}>
        <h2>实物盘点与库存校正</h2><p>已启用商品若沿用了虚拟商城库存，请在这里填写当前实盘数量和原因。系统会更新结存并保留校正流水，不会把差额当作销售或消耗。</p>
        <SearchableProductSelect products={data.products} value={count.productId} onChange={productId => setCount({ ...count, productId })} optionLabel={p => `${p.name} · 账面 ${p.stock}`} />
        {countProduct && <p>当前账面结存：{countProduct.stock} {countProduct.inventoryTracking?.unit || '件'}{countProduct.needsOpeningCount ? '；原商城库存尚未实盘核实' : ''}</p>}
        <label>当前实盘数量<input className="form-input" type="number" min="0" step="1" required placeholder="填写实际清点数量" value={count.counted} onChange={e => setCount({ ...count, counted:e.target.value })} /></label>
        <textarea className="form-input" required placeholder="差异原因或盘点依据；如原商城库存为虚拟数字" value={count.note} onChange={e => setCount({ ...count, note:e.target.value })} />
        <button className="btn btn-primary" disabled={busy || !count.productId || count.counted === '' || !count.note.trim()}>按实盘数量校正</button>
      </form>
    </div>
    <section className="card" style={{ padding:20, marginTop:18 }}><h2>最近流水</h2><p>旧版启用时从商城带入的期初未经实盘核实，仅保留为历史记录；请以上方实盘校正后的当前结存为准。</p><div style={{ overflowX:'auto' }}><table className="table"><thead><tr><th>时间</th><th>物资</th><th>类型</th><th>数量</th><th>结存</th><th>批次/设备</th><th>使用客户</th><th>经办人</th><th>备注/依据</th></tr></thead><tbody>
      {data.recent.map(x => <tr key={x._id}><td>{date(x.createdAt)}</td><td>{data.products.find(p => p._id === x.productId)?.name || '-'}</td><td>{x.type === 'opening' && x.note?.startsWith('启用台账时的期初库存') ? '旧商城库存（未核实）' : labels[x.type]}</td><td>{x.units}（库存 {x.quantity >= 0 ? '+' : ''}{x.quantity}）</td><td>{x.balanceAfter}</td><td>{x.batchNo || x.serialNo || '-'}</td><td>{x.userId?.name || '-'}</td><td>{x.actorId?.name || '-'}</td><td>{x.note || '-'}</td></tr>)}
    </tbody></table></div></section>
    <section className="card" style={{ padding:20, marginTop:18 }}><h2>客户消费来源</h2><p>商城订单自动读取已支付订单；医护录入消费来自物资流水。实际使用与销售分列，避免重复计算收入。</p><div style={{ overflowX:'auto' }}><table className="table"><thead><tr><th>时间</th><th>来源</th><th>客户</th><th>产品</th><th>金额</th><th>凭据</th></tr></thead><tbody>
      {consumption.orders.map(x => <tr key={`o${x._id}`}><td>{date(x.createdAt)}</td><td>商城</td><td>{x.user?.name || '-'}</td><td>{x.serviceName}</td><td>{money(x.paidAmount || x.servicePrice)}</td><td>{x.orderNo}</td></tr>)}
      {consumption.manual.map(x => <tr key={`m${x._id}`}><td>{date(x.createdAt)}</td><td>{x.type === 'manual_sale' ? '医护录入消费' : '实际使用（不计收入）'}</td><td>{x.userId?.name || '-'}</td><td>{x.productId?.name || '-'}</td><td>{x.type === 'manual_sale' ? money(x.units * x.unitPrice) : '-'}</td><td>{x.note || '-'}</td></tr>)}
    </tbody></table></div></section>
  </div>
}
