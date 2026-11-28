import React from 'react'
import view from '../../../shared/supplyCardRows.cjs'

export default function SupplyDayCard({ card, onSelect }) {
  const { details, day } = card.supplyCard
  return <section className="card" style={{ padding: '14px 18px', borderLeft: '3px solid #36765d' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
      <strong>{card.members[0].patientId?.name} · 配取提醒</strong>
      <span style={{ color: '#52685d' }}>{day} · 已完成 {details.filter(item => item.done).length}/{details.length}</span>
    </div>
    {view.sections(card).map(({ kind, items }) => <div key={kind} style={{ marginTop: 12 }}>
      <b style={{ fontSize: 12, color: '#39654f' }}>{kind}</b>
      {items.map(item => {
        const task = card.members.find(member => String(member._id) === item.id)
        return <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, borderTop: '1px solid #e1eae5', padding: '7px 0' }}>
          <span style={{ flex: 1 }}>{item.name}{item.quantity && ' · ' + item.quantity}</span>
          {task ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => onSelect(task)}>{item.done ? '查看记录' : '查看并办理'}</button> : <span>已完成</span>}
        </div>
      })}
    </div>)}
  </section>
}
