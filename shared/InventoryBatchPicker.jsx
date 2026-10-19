import React from 'react'
import SearchableProductSelect from './SearchableProductSelect'
import DateField from './DateField'

export default function InventoryBatchPicker({ batches, value, onChange }) {
  const options = batches.map(row => ({ ...row, name:row.batchNo || '未登记批次号' }))
  return <div>
    <label className="form-label">发放批次 / 有效期</label>
    <SearchableProductSelect products={options} value={value.sourceReceiptId || ''} placeholder="搜索并选择历史入库批次" optionLabel={row => `${row.name} · ${row.expiresAt ? `有效期至 ${new Date(row.expiresAt).toLocaleDateString('zh-CN', { timeZone:'Asia/Shanghai' })}` : '效期未录入'}`} onChange={id => {
      const row = batches.find(item => item._id === id)
      onChange({ sourceReceiptId:id, batchNo:row?.batchNo || '', expiresAt:row?.expiresAt ? new Date(row.expiresAt).toISOString().slice(0,10) : '' })
    }} />
    {value.sourceReceiptId ? <p>本次批次：{value.batchNo || '未登记'} · {value.expiresAt ? `有效期至 ${value.expiresAt}` : '效期未录入，请核对实物'}<button type="button" className="btn btn-secondary" onClick={() => onChange({sourceReceiptId:'', batchNo:'', expiresAt:''})}>重新选择 / 手工填写</button></p> : <>
      <input className="form-input" aria-label="实物批次号" placeholder="未找到批次时，按实物填写批次号" value={value.batchNo} onChange={e => onChange({batchNo:e.target.value})} />
      <label>实物有效期<DateField className="form-input" type="date" value={value.expiresAt || ''} onChange={e => onChange({expiresAt:e.target.value})} /></label>
    </>}
    <small>列表为历史入库批次，发放前请核对实物批次和有效期；各批次剩余数量尚未核实。</small>
  </div>
}
