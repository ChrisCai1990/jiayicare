import React, { useEffect, useState } from 'react';
import { View, Text } from '@tarojs/components';
import { userAPI } from '../services/api';

export default function MembershipBenefits() {
  const [data,setData]=useState(null), [error,setError]=useState('');
  const load=async()=>{ setError(''); try { const r=await userAPI.getMembershipBenefits(); if(!r.success)throw Error(); setData(r.data); } catch { setError('会员计划权益加载失败，请点击重试'); } };
  useEffect(()=>{load();},[]);
  return <View style={{padding:'16px',backgroundColor:'#fff',borderRadius:'16px',marginBottom:'16px'}}>
    <Text style={{fontSize:'16px',fontWeight:700,display:'block'}}>我的会员计划与使用情况</Text>
    <Text onClick={load} style={{color:'#1E6B50',display:'block',padding:'10px 0'}}>{error || '刷新权益'}</Text>
    {!data&&!error&&<Text>正在加载会员计划…</Text>}
    {!!data?.message&&<Text>{data.message}</Text>}
    {(data?.plans||[]).map(plan=><View key={plan.id} style={{padding:'12px 0',borderTop:'1px solid #E0D9CE'}}>
      <Text style={{fontWeight:700,display:'block'}}>{plan.name}</Text>
      <Text style={{fontSize:'12px',display:'block',margin:'6px 0'}}>有效期：{String(plan.validFrom||'待核对').slice(0,10)} 至 {String(plan.validUntil||'待核对').slice(0,10)}</Text>
      <Text style={{fontSize:'12px',color:'#876B38',display:'block'}}>{plan.notice}</Text>
      {plan.items.map((item,i)=><View key={i} style={{marginTop:'12px'}}><Text style={{display:'block',fontWeight:600}}>{item.label}</Text><Text style={{display:'block',fontSize:'13px',color:'#4A6558'}}>{item.value}</Text></View>)}
      {plan.usage.map((item,i)=><Text key={i} style={{display:'block',fontSize:'12px',marginTop:'8px'}}>使用记录：{item.name} · {String(item.usedAt).slice(0,10)}</Text>)}
    </View>)}
  </View>;
}
