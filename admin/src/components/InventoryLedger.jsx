import React, { useState } from 'react'
import './InventoryLedger.css'

const labels = { opening:'期初', receipt:'入库', issue:'领用', use:'实际使用', return:'退回', loss:'报损', count:'盘点', manual_sale:'医护录入消费' }
const isLegacy = row => row.type === 'opening' && row.note?.startsWith('启用台账时的期初库存')
const time = value => new Date(value).toLocaleString('zh-CN', { hour12:false })

export default function InventoryLedger({ products, records, onCorrect }) {
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [expanded, setExpanded] = useState(null)
  const query = search.trim().toLowerCase()
  const groups = products.map(product => {
    const all = records.filter(row => row.productId === product._id)
    const rows = all.filter(row => (!type || row.type === type) && (!query || `${product.name} ${row.batchNo || ''} ${row.serialNo || ''}`.toLowerCase().includes(query)))
    return { product, all, rows }
  }).filter(group => (!type && !query) || group.rows.length || (!type && group.product.name.toLowerCase().includes(query)))
  return <section className="card inventory-ledger">
    <h2>物资库存与流水</h2>
    <p className="inventory-ledger-hint">每种实物一行，展开后查看入库、盘点和使用明细。流水范围为最近加载的 {records.length} 条记录。</p>
    <div className="inventory-ledger-filters">
      <input className="form-input" aria-label="搜索商品流水" placeholder="搜索商品名称、批次或设备编号" value={search} onChange={e => setSearch(e.target.value)} />
      <select className="form-input" aria-label="流水类型" value={type} onChange={e => setType(e.target.value)}>
        <option value="">全部类型</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <span className="inventory-ledger-hint">{groups.length} 种物资</span>
    </div>
    <div className="inventory-ledger-scroll"><table className="inventory-ledger-table">
      <thead><tr><th>物资 / 关联服务</th><th>当前库存</th><th>最近操作</th><th>操作</th></tr></thead>
      <tbody>{groups.map(({ product, all, rows }) => {
        const unit = product.inventoryTracking?.unit || '件'
        const latest = all[0]
        return <React.Fragment key={product._id}>
          <tr>
            <td className="inventory-ledger-product"><strong>{product.name}</strong><small>{(product.linkedProducts || []).map(p => p.name).join('、') || '未关联服务'}</small></td>
            <td className="inventory-ledger-quantity"><strong>{product.needsOpeningCount ? '待实盘核实' : `${product.stock} ${unit}`}</strong>{product.needsOpeningCount && <small>旧账面 {product.stock} {unit}</small>}</td>
            <td>{latest ? <><span className={`inventory-ledger-tag ${latest.type}`}>{isLegacy(latest) ? '旧商城库存' : labels[latest.type] || latest.type}</span><small>{time(latest.createdAt)}</small></> : '暂无记录'}</td>
            <td><div className="inventory-ledger-actions"><button type="button" aria-expanded={expanded === product._id} aria-controls={`ledger-product-${product._id}`} onClick={() => setExpanded(expanded === product._id ? null : product._id)}>{expanded === product._id ? '收起流水' : `查看流水（${rows.length}）`}</button><button type="button" onClick={() => onCorrect(product._id)}>校正库存</button></div></td>
          </tr>
          {expanded === product._id && <tr id={`ledger-product-${product._id}`} className="inventory-ledger-detail"><td colSpan="4">
            <table className="inventory-ledger-table inventory-ledger-history"><thead><tr><th>时间</th><th>类型</th><th>本次数量</th><th>批次 / 有效期</th><th>操作后结存</th><th>详情</th></tr></thead><tbody>
              {rows.map(row => {
                const legacy = isLegacy(row)
                const delta = Number(row.quantity)
                return <tr key={row._id}>
                  <td className="inventory-ledger-time">{time(row.createdAt)}</td>
                  <td><span className={`inventory-ledger-tag ${legacy ? 'legacy' : row.type}`}>{legacy ? '旧商城库存 · 未核实' : labels[row.type] || row.type}</span></td>
                  <td className="inventory-ledger-quantity"><strong>{row.type === 'count' ? `实盘 ${row.balanceAfter} ${unit}` : `${row.units} ${unit}`}</strong><small>{legacy ? '历史展示值' : delta === 0 ? '库存不变' : `${row.type === 'count' ? (delta > 0 ? '调增' : '调减') : (delta > 0 ? '增加' : '减少')} ${Math.abs(delta)} ${unit}`}</small></td>
                  <td><span>{row.batchNo || '无批次号'}</span><small>{row.expiresAt ? `有效期至 ${new Date(row.expiresAt).toLocaleDateString('zh-CN', { timeZone:'Asia/Shanghai' })}` : row.type === 'receipt' ? '效期未录入' : '—'}</small></td>
                  <td className="inventory-ledger-balance">{legacy ? '未核实' : `${row.balanceAfter} ${unit}`}</td>
                  <td><details><summary>详情</summary><div className="inventory-ledger-record-detail"><p>用于服务：{row.serviceProductId?.name || '-'}</p><p>经办人：{row.actorId?.name || '-'}</p><p>使用客户：{row.userId?.name || '-'}</p><p>批次：{row.batchNo || '-'}</p><p>设备编号：{row.serialNo || '-'}</p><p>备注：{row.note || '无备注'}</p></div></details></td>
                </tr>
              })}
              {!rows.length && <tr><td colSpan="6" className="inventory-ledger-empty">暂无符合条件的流水</td></tr>}
            </tbody></table>
          </td></tr>}
        </React.Fragment>
      })}{!groups.length && <tr><td colSpan="4" className="inventory-ledger-empty">没有符合条件的商品</td></tr>}</tbody>
    </table></div>
  </section>
}
