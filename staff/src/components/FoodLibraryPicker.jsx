import React, { useState } from 'react'
import { FOOD_LIBRARY, parseFoodSelections, serializeFoodSelections } from '../data/foodLibrary.mjs'

export default function FoodLibraryPicker({ value, onChange }) {
  const [search, setSearch] = useState('')
  const selected = parseFoodSelections(value)
  const matches = FOOD_LIBRARY.map(([category, ...foods]) => [category, foods.filter(food => food.includes(search.trim()))])
    .filter(([, foods]) => foods.length)
  const add = food => {
    if (!food || selected.includes(food)) return
    onChange(serializeFoodSelections([...selected, food]))
    setSearch('')
  }
  const remove = food => onChange(serializeFoodSelections(selected.filter(item => item !== food)))
  const exactMatch = FOOD_LIBRARY.some(([, ...foods]) => foods.includes(search.trim()))

  return <div style={{ fontSize: 13 }}>
    <div style={{ color: '#62776A', marginBottom: 8 }}>从食物库选择禁忌食物；方案原有内容会保留，可逐项移除。</div>
    {selected.length > 0 && <div aria-label="已选禁忌食物" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
      {selected.map(food => <span key={food} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px', background: '#FCEFED', borderRadius: 14, color: '#803E35' }}>
        {food}<button type="button" aria-label={`移除${food}`} onClick={() => remove(food)} style={{ border: 0, background: 'none', color: 'inherit', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
      </span>)}
    </div>}
    <input aria-label="搜索禁忌食物" value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索食物名称" style={{ width: '100%', padding: '8px 10px', border: '1px solid #E0D9CE', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
    {search.trim() && !exactMatch && !selected.includes(search.trim()) && <button type="button" onClick={() => add(search.trim())} style={{ marginTop: 7, padding: '5px 10px', border: '1px solid #B2D8C7', borderRadius: 8, background: '#E8F5EF', color: '#1E6B50', cursor: 'pointer' }}>＋ 添加“{search.trim()}”</button>}
    <div style={{ maxHeight: 220, overflowY: 'auto', marginTop: 9, padding: 8, border: '1px solid #ECE6DE', borderRadius: 8 }}>
      {matches.length ? matches.map(([category, foods]) => <div key={category} style={{ marginBottom: 8 }}>
        <div style={{ fontWeight: 600, color: '#4A6558', marginBottom: 5 }}>{category}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {foods.map(food => <button key={food} type="button" aria-pressed={selected.includes(food)} onClick={() => selected.includes(food) ? remove(food) : add(food)} style={{ padding: '4px 9px', border: selected.includes(food) ? '1px solid #1E6B50' : '1px solid #DCE4DD', borderRadius: 14, background: selected.includes(food) ? '#E8F5EF' : '#fff', color: selected.includes(food) ? '#1E6B50' : '#34443B', cursor: 'pointer' }}>{selected.includes(food) ? '✓ ' : ''}{food}</button>)}
        </div>
      </div>) : <div style={{ color: '#789087' }}>食物库中未找到，可按上方按钮添加。</div>}
    </div>
  </div>
}
