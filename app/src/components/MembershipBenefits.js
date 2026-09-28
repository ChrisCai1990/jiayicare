import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { userAPI } from '../services/api';
export default function MembershipBenefits() {
  const [data,setData]=useState(null),[error,setError]=useState('');
  const load=async()=>{setError('');try{const r=await userAPI.getMembershipBenefits();if(!r.success)throw Error();setData(r.data);}catch{setError('会员计划权益加载失败，请重试');}};
  useEffect(()=>{load();},[]);
  return <View style={{margin:20,padding:16,backgroundColor:'#fff',borderRadius:16}}>
    <Text style={{fontSize:16,fontWeight:'700'}}>我的会员计划与使用情况</Text>
    <TouchableOpacity onPress={load}><Text style={{color:'#1E6B50',marginVertical:10}}>{error||'刷新权益'}</Text></TouchableOpacity>
    {!data&&!error&&<Text>正在加载会员计划…</Text>}
    {!!data?.message&&<Text>{data.message}</Text>}
    {(data?.plans||[]).map(plan=><View key={plan.id} style={{marginTop:12}}>
      <Text style={{fontWeight:'700'}}>{plan.name}</Text>
      <Text>有效期：{String(plan.validFrom||'待核对').slice(0,10)} 至 {String(plan.validUntil||'待核对').slice(0,10)}</Text>
      <Text style={{fontSize:12,color:'#876B38'}}>{plan.notice}</Text>
      {plan.items.map((item,i)=><View key={i} style={{marginTop:10}}><Text style={{fontWeight:'600'}}>{item.label}</Text><Text>{item.value}</Text></View>)}
      {plan.usage.map((item,i)=><Text key={i}>使用记录：{item.name} · {String(item.usedAt).slice(0,10)}</Text>)}
    </View>)}
  </View>;
}
