import React from 'react'
import SearchableProductSelect from './SearchableProductSelect'

export default function ProductLinksEditor({ products, value, onChange }) {
  return <div style={{ margin:'12px 0' }}>
    <label>关联商城产品 / 服务（可多选）</label>
    <SearchableProductSelect products={products.filter(p => !value.includes(p._id))} value="" onChange={id => onChange([...value, id])} placeholder="选择关联服务" />
    <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:8 }}>{value.map(id => <span key={id} style={{ padding:'4px 8px', background:'#eff6ff', borderRadius:4 }}>{products.find(p => p._id === id)?.name || '已关联服务'} <button type="button" aria-label={`移除${products.find(p => p._id === id)?.name || '服务'}`} onClick={() => onChange(value.filter(x => x !== id))}>×</button></span>)}</div>
  </div>
}
