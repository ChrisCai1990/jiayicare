import React from 'react'
import { View, Text } from '@tarojs/components'
import supply from '../../../shared/supplyCardRows.cjs'

export default function SupplyDayCard({card, onSelect}) {
  const {day, details} = card.supplyCard
  return <View style={{background:'#fff',border:'1px solid #dce8e1',borderRadius:'14px',padding:'14px',marginBottom:'10px'}}>
    <Text style={{display:'block',fontSize:'16px',fontWeight:700,color:'#204936'}}>配取提醒</Text>
    <Text style={{fontSize:'12px',color:'#587365'}}>{day} · 已完成 {details.filter(item => item.done).length}/{details.length}</Text>
    {supply.sections(card).map(section=><View key={section.kind} style={{marginTop:'8px'}}>
      <Text style={{fontSize:'12px',fontWeight:600,color:'#38745a'}}>{section.kind}</Text>
      {section.items.map(item=>{
        const member=card.members.find(row=>String(row._id)===item.id)
        return <View key={item.id} onClick={()=>member && onSelect(member)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 0',borderTop:'1px solid #e5ede8'}}>
          <Text>{item.name}{item.quantity ? ' · '+item.quantity : ''}</Text><Text style={{fontSize:'12px',color:'#587365'}}>{item.done?'已完成':'查看 ›'}</Text>
        </View>
      })}
    </View>)}
  </View>
}
