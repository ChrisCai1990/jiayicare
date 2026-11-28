import React from 'react'
import { Text, View, TouchableOpacity } from 'react-native'
import supply from './supplyCardRows.cjs'

export default function SupplyDayNative({ card, onSelect }) {
  const { day, details } = card.supplyCard
  return <View style={{ backgroundColor: '#fff', borderColor: '#d7e6df', borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 10 }}>
    <Text style={{ color: '#193c30', fontSize: 17, fontWeight: '700' }}>配取提醒</Text>
    <Text style={{ color: '#53695f', marginTop: 3 }}>{day} · 已完成 {details.filter(item => item.done).length}/{details.length}</Text>
    {supply.sections(card).map(({ kind, items }) => <View key={kind} style={{ marginTop: 10 }}>
      <Text style={{ color: '#347457', fontWeight: '600', fontSize: 12 }}>{kind}</Text>
      {items.map(item => {
        const task = card.members.find(member => String(member._id) === item.id)
        return <TouchableOpacity disabled={!task} key={item.id} onPress={() => onSelect(task)} accessibilityRole="button"
          style={{ paddingVertical: 9, flexDirection: 'row', borderBottomColor: '#e8eeeb', borderBottomWidth: 1, alignItems: 'center' }}>
          <Text style={{ flex: 1, color: '#203e31' }}>{item.name}{item.quantity ? ' · ' + item.quantity : ''}</Text>
          <Text style={{ color: '#527367' }}>{item.done ? '已完成' : '查看 ›'}</Text>
        </TouchableOpacity>
      })}
    </View>)}
  </View>
}
