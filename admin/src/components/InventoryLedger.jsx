import React, { useState } from 'react'
import './InventoryLedger.css'

const labels = { opening:'期初', receipt:'入库', issue:'领用', use:'实际使用', return:'退回', loss:'报损', count:'盘点', manual_sale:'医护录入消费' }

export default function InventoryLedger({ products, records, onCorrect }) {
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [expanded, setExpanded] = useState(null)
  const rows = records.filter(row => {
    const product = products.find(p => p._id === row.productId)
    return (!type || row.type === type) && (!search.trim() || `${product?.name || ''} ${row.batchNo || ''} ${row.serialNo || ''}`.toLowerCase().includes(search.trim().toLowerCase()))
  })
  return <section className="card inventory-ledger">
    <h2>最近流水</h2>
    <p className="inventory-ledger-hint">查看入库、盘点及使用记录。需要调整现有数量时，点击该商品的“校正库存”。</p>
    <div className="inventory-ledger-filters">
      <input className="form-input" aria-label="搜索流水" placeholder="搜索商品名称、批次或设备编号" value={search} onChange={e => setSearch(e.target.value)} />
      <select className="form-input" aria-label="流水类型" value={type} onChange={e => setType(e.target.value)}>
        <option value="">全部类型</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <span className="inventory-ledger-hint">显示 {rows.length} / {records.length} 条</span>
    </div>
    <div className="inventory-ledger-scroll"><table className="inventory-ledger-table">
      <thead><tr><th>时间</th><th>商品 / 类型</th><th>本次数量</th><th>操作后结存</th><th>操作</th></tr></thead>
      <tbody>{rows.map(row => {
        const product = products.find(p => p._id === row.productId)
        const unit = product?.inventoryTracking?.unit || '件'
        const legacy = row.type === 'opening' && row.note?.startsWith('启用台账时的期初库存')
        const delta = Number(row.quantity)
        const change = delta === 0 ? '库存不变' : `${delta > 0 ? '增加' : '减少'} ${Math.abs(delta)} ${unit}`
        const stamp = new Date(row.createdAt)
        return <React.Fragment key={row._id}>
          <tr>
            <td className="inventory-ledger-time">{stamp.toLocaleDateString('zh-CN')}<small>{stamp.toLocaleTimeString('zh-CN', { hour12:false })}</small></td>
            <td className="inventory-ledger-product"><strong>{product?.name || '未知商品'}</strong><span className={`inventory-ledger-tag ${legacy ? 'legacy' : row.type}`}>{legacy ? '旧商城库存 · 未核实' : labels[row.type] || row.type}</span></td>
            <td className="inventory-ledger-quantity"><strong>{row.type === 'count' ? `实盘 ${row.balanceAfter} ${unit}` : `${row.units} ${unit}`}</strong><small className={legacy ? '' : delta > 0 ? 'increase' : delta < 0 ? 'decrease' : ''}>{legacy ? '历史展示值' : row.type === 'count' ? (delta === 0 ? '账实一致' : `${delta > 0 ? '调增' : '调减'} ${Math.abs(delta)} ${unit}`) : change}</small></td>
            <td className="inventory-ledger-balance">{legacy ? '未核实' : `${row.balanceAfter} ${unit}`}</td>
            <td><div className="inventory-ledger-actions"><button type="button" aria-expanded={expanded === row._id} aria-controls={`ledger-detail-${row._id}`} onClick={() => setExpanded(expanded === row._id ? null : row._id)}>{expanded === row._id ? '收起' : '详情'}</button><button type="button" onClick={() => onCorrect(row.productId)}>校正库存</button></div></td>
          </tr>
          {expanded === row._id && <tr id={`ledger-detail-${row._id}`} className="inventory-ledger-detail"><td colSpan="5"><dl>
            <div><dt>经办人</dt><dd>{row.actorId?.name || '-'}</dd></div>
            <div><dt>使用客户</dt><dd>{row.userId?.name || '-'}</dd></div>
            <div><dt>批次号</dt><dd>{row.batchNo || '-'}</dd></div>
            <div><dt>设备编号</dt><dd>{row.serialNo || '-'}</dd></div>
            <div className="inventory-ledger-note"><dt>备注 / 依据</dt><dd>{row.note || '无备注'}</dd></div>
          </dl></td></tr>}
        </React.Fragment>
      })}{!rows.length && <tr><td colSpan="5" className="inventory-ledger-empty">{records.length ? '没有符合条件的流水' : '暂无流水记录'}</td></tr>}</tbody>
    </table></div>
  </section>
}
