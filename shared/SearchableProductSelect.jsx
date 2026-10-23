import React, { useId, useRef, useState } from 'react'

export default function SearchableProductSelect({ products, value, onChange, placeholder = '选择物资', optionLabel = product => product.name }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(-1)
  const inputRef = useRef(null)
  const listId = useId()
  const selected = products.find(product => product._id === value)
  const search = query.trim().toLocaleLowerCase()
  const matches = products.filter(product => {
    const terms = [product.name, product.category, product.sku, optionLabel(product)]
    return !search || terms.some(term => String(term || '').toLocaleLowerCase().includes(search))
  })

  const choose = product => {
    onChange(product._id)
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
  }

  const handleKeyDown = event => {
    if (event.key === 'Escape') {
      if (open) event.preventDefault()
      setOpen(false)
      setQuery('')
      inputRef.current?.blur()
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setActive(index => Math.max(0, Math.min(matches.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))))
    } else if (event.key === 'Enter' && open) {
      event.preventDefault()
      if (matches[Math.max(0, active)]) choose(matches[Math.max(0, active)])
    }
  }

  return <div style={{ position:'relative' }}>
    <input
      ref={inputRef}
      className="form-input"
      type="text"
      role="combobox"
      aria-label={placeholder}
      aria-autocomplete="list"
      aria-expanded={open}
      aria-controls={listId}
      aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
      autoComplete="off"
      placeholder={open ? `搜索${placeholder.replace(/^选择/, '')}名称` : placeholder}
      value={open ? query : (selected ? optionLabel(selected) : '')}
      onFocus={() => { setQuery(''); setActive(-1); setOpen(true) }}
      onBlur={() => { setOpen(false); setQuery('') }}
      onChange={event => { setQuery(event.target.value); setActive(0); setOpen(true) }}
      onKeyDown={handleKeyDown}
    />
    {open && <div id={listId} role="listbox" style={{ position:'absolute', zIndex:20, top:'100%', left:0, right:0, maxHeight:240, overflowY:'auto', background:'#fff', border:'1px solid #d1d5db', borderRadius:8, boxShadow:'0 8px 20px rgba(0,0,0,.12)' }}>
      {matches.length ? matches.map((product, index) => <div
        key={product._id}
        id={`${listId}-${index}`}
        role="option"
        aria-selected={product._id === value}
        onMouseEnter={() => setActive(index)}
        onMouseDown={event => { event.preventDefault(); choose(product) }}
        style={{ padding:'10px 12px', cursor:'pointer', background:index === active ? '#eff6ff' : 'transparent' }}
      >{optionLabel(product)}</div>) : <div style={{ padding:'10px 12px', color:'#6b7280' }}>{products.length ? '没有匹配的商品' : '暂无可选商品'}</div>}
    </div>}
  </div>
}
