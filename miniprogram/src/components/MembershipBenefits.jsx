import React, { useEffect, useState } from 'react';
import { View, Text } from '@tarojs/components';
import { userAPI } from '../services/api';
import { useLanguage } from '../i18n';
const Tap=View;
const style=value=>Object.fromEntries(Object.entries({display:'block',...value}).map(([k,v])=>[k,typeof v==='number'&&!['flex','fontWeight'].includes(k)?v+'px':v]));
const raw = {
root:{backgroundColor:'#fff',borderRadius:20,overflow:'hidden',marginBottom:16},
top:{display:'flex',flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:18},
title:{fontSize:17,fontWeight:'700',color:'#193C30'},
hero:{backgroundColor:'#193C30',borderRadius:14,padding:20,marginBottom:20},
plan:{fontSize:21,fontWeight:'700',color:'#fff',marginBottom:8},
muted:{fontSize:12,color:'#718579',lineHeight:19},
section:{fontSize:14,fontWeight:'700',color:'#193C30',marginBottom:10,marginTop:16},
tags:{display:'flex',flexDirection:'row',flexWrap:'wrap'},
tag:{backgroundColor:'#EDF4F0',borderRadius:8,padding:9,marginRight:7,marginBottom:8},
card:{backgroundColor:'#F6F8F5',borderRadius:12,padding:15,marginBottom:10},
row:{display:'flex',flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
name:{fontSize:15,fontWeight:'600',color:'#244C3B',flex:1},
count:{fontSize:20,fontWeight:'700',color:'#1E6B50',marginLeft:10},
body:{fontSize:12,lineHeight:19,color:'#718579',marginTop:7},
};
const s=Object.fromEntries(Object.entries(raw).map(([key,value])=>[key,style(value)]));
function Action({onPress,children}) {return <Tap onClick={onPress} style={style({padding:10})}><Text style={style({fontSize:13,color:'#1E6B50'})}>{children}</Text></Tap>;}
function QuotaCard({item,shared}) {
const {t,language}=useLanguage();
return <View style={s.card}><View style={s.row}><Text style={s.name}>{t(item.name)}</Text><Text style={s.count}>{item.total==null?t('待核对'):item.total+' '+t('次')}</Text></View>
{shared && <Text style={s.body}>{t('可用于：')}{item.services.map(t).join(language==='en-US'?', ':'、')||t('适用服务待核对')}</Text>}
{shared && <Text style={s.body}>{t('以上服务合计共用，并非每项各有此次数')}</Text>}
<Text style={s.body}>{item.usageKnown?item.detail:t('使用情况待核对 · 暂不显示剩余次数')}</Text></View>;
}
function Plan({plan}) {
const {t}=useLanguage();
const [expanded,setExpanded]=useState(false),g=plan.groups;
return <View style={style({padding:18,paddingTop:0})}>
<View style={s.hero}><Text style={s.plan}>{t(plan.name)}</Text><Text style={style({fontSize:12,color:'#C5D9CE'})}>{String(plan.validFrom||t('待核对')).slice(0,10)} — {String(plan.validUntil||t('待核对')).slice(0,10)}</Text></View>
{g ? <>
{!!g.features.length && <><Text style={s.section}>{t('健康管理服务')}</Text>{(g.serviceStages||[{name:'计划服务',services:g.features.map(name=>({name,frequency:'已包含 · 频次待确认'}))}]).map(stage=>({...stage,services:stage.services.filter(item=>!item.internal)})).filter(stage=>stage.services.length).map(stage=><View key={stage.name} style={s.card}><Text style={s.name}>{t(stage.name)}</Text>{stage.services.map(item=><View key={item.name} style={style({display:'flex',flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:12})}><Text style={style({fontSize:13,color:'#365E4D',flex:1})}>{t(item.name)}</Text><Text style={style({fontSize:11,color:'#718579',marginLeft:8})}>{t(item.frequency)}</Text></View>)}</View>)}</>}
</> : (plan.items||[]).map((item,i)=><View key={i} style={s.card}><Text style={s.name}>{t(item.label)}</Text><Text style={s.body}>{item.value}</Text></View>)}
{!!g?.shared.length && <><Text style={s.section}>{t('服务共用次数')}</Text>{g.shared.map((item,i)=><QuotaCard key={i} item={item} shared/>)}<Text style={s.muted}>{t('不同服务共用同一额度，不代表自动开放家庭共享。')}</Text></>}
{!!g?.independent.length && <><Text style={s.section}>{t('独立次数权益')}</Text>{g.independent.map((item,i)=><QuotaCard key={i} item={item}/>)}</>}
<View style={s.row}><Text style={s.section}>{t('使用记录')}</Text><Action onPress={()=>setExpanded(v=>!v)}>{t(expanded?'收起':'查看')}</Action></View>
{expanded && <>{(plan.usage||[]).map((item,i)=><View key={i} style={s.card}><Text style={s.name}>{item.name}</Text><Text style={s.body}>{String(item.usedAt||'待核对').slice(0,10)}</Text></View>)}{!plan.usage?.length && <Text style={s.muted}>{plan.source==='configuration'?'历史记录待核对，不代表尚未使用。':'暂无本人使用记录；共用额度可能包含其他成员使用。'}</Text>}</>}
<Text style={s.body}>{plan.source==='configuration'?'按当前计划配置展示，历史已用及剩余次数待核对。':plan.notice}</Text></View>;
}
function GiftServices({gifts,loading,error,onRefresh}) {
const {t}=useLanguage();
const services=(gifts||[]).filter(gift=>gift.giftType==='service');
const now=new Date(),today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
return <View style={style({padding:18,paddingTop:0})}>
<Text style={s.section}>{t('单独赠送的服务')}</Text>
{loading ? <Text style={s.muted}>{t('加载赠送记录中…')}</Text> : error ? <><Text style={s.muted}>{error}</Text><Action onPress={onRefresh}>{t('重试')}</Action></> : !services.length ? <Text style={s.muted}>{t('暂无单独赠送的服务')}</Text> : services.map(gift=>{
const from=String(gift.validFrom||'').slice(0,10),to=String(gift.validTo||'').slice(0,10);
const remaining=Math.max(0,Number(gift.serviceCount||0)-Number(gift.usedCount||0));
const status=gift.status==='used'||remaining===0?'已使用':gift.status==='expired'||(to&&to<today)?'已过期':from&&from>today?'未生效':'有效';
return <View key={gift._id} style={s.card}><View style={s.row}><Text style={s.name}>{t(gift.serviceName||'服务权益')}</Text><Text style={s.count}>{t('可用')} {remaining} {t('次')}</Text></View>
<Text style={s.body}>{t(status)} · {from||t('赠送日起')} — {to||t('长期有效')}</Text>
{!!gift.remark&&<Text style={s.body}>{gift.remark}</Text>}
<Text style={s.body}>{t('使用时须匹配对应服务流程；服务团队会核对具体履约记录。')}</Text></View>;
})}
</View>;
}
export default function MembershipBenefits({gifts,giftsLoading,giftsError,onRefreshGifts}){
const {t,language}=useLanguage();
const [data,setData]=useState(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),[loading,setLoading]=useState(true);
useEffect(()=>{let live=true;setLoading(true);setError('');userAPI.getMembershipBenefits().then(r=>{if(!r.success)throw Error();if(live)setData(r.data);}).catch(()=>{if(live)setError('加载失败，请刷新重试');}).finally(()=>{if(live)setLoading(false);});return()=>{live=false};},[refresh]);
return <View style={s.root}><View style={s.top}><Text style={s.title}>{t('我的会员权益')}</Text><Action onPress={()=>{if(!loading)setRefresh(v=>v+1)}}>{t(loading?'加载中':'刷新')}</Action></View>
{language==='en-US' && <Text style={style({fontSize:11,color:'#718579',paddingLeft:18,paddingRight:18,marginBottom:10})}>Plan names and custom service terms may appear in their original language.</Text>}
{!!error && <Text style={s.body}>{error}</Text>}{!!data?.message && <Text style={s.body}>{(gifts||[]).some(gift=>gift.giftType==='service')?'暂无会员计划权益；单独赠送的服务见下方。':data.message}</Text>}{(data?.plans||[]).map(plan=><Plan key={plan.id} plan={plan}/>)}
<GiftServices gifts={gifts} loading={giftsLoading} error={giftsError} onRefresh={onRefreshGifts}/></View>;
}
