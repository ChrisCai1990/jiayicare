import React,{useState,useEffect,useRef} from 'react';
import {View,Text,Input,Picker,Button} from '@tarojs/components';
import Taro from '@tarojs/taro';
import {tasksAPI,reportsAPI} from '../../../services/api';
import useNavBar from '../../../hooks/useNavBar';
import {chooseImageWithPrivacy,isImagePickerCancelled,showImagePickerError} from '../../../utils/imagePicker';

const categories=['exam_report','outpatient_record','prescription_order'];
const labels=['检查报告','门诊病历','处方/医嘱单'];
const card={padding:'16px',marginTop:'12px',border:'1px solid #CDDCD5',borderRadius:'12px',backgroundColor:'#fff'};
export default function CareReportUpload(){
  const flowId=Taro.getCurrentInstance().router?.params?.flowId;
  const {statusBarHeight}=useNavBar();
  const [data,setData]=useState(null),[rows,setRows]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirmed,setConfirmed]=useState(false);
  const lock=useRef(false);
  useEffect(()=>{tasksAPI.careReports(flowId).then(r=>setData(r.data)).catch(e=>setError(e.message))},[flowId]);
  const change=(id,patch)=>{setConfirmed(false);setRows(old=>old.map(r=>r.id===id?{...r,...patch}:r))};
  async function pick(){
    try{const result=await chooseImageWithPrivacy({count:9,sizeType:['compressed'],sourceType:['album','camera']});
      setRows(old=>[...old,...(result.tempFilePaths||[]).map((uri,i)=>({id:Date.now()+'-'+i,uri,title:'检查报告 '+(old.length+i+1),category:'exam_report'}))]);setConfirmed(false);
    }catch(e){if(!isImagePickerCancelled(e))showImagePickerError(e)}
  }
  async function submit(){
    if(lock.current||!confirmed)return;lock.current=true;setBusy(true);setError('');
    try{
      for(const r of rows){
        if(r.saved)continue;
        if(!r.uploadToken){
          const content=Taro.getFileSystemManager().readFileSync(r.uri,'base64');
          const ext=r.uri.split('.').pop().toLowerCase(),mime=['png','webp','heic','heif'].includes(ext)?'image/'+ext:'image/jpeg';
          const result=await reportsAPI.uploadBase64('data:'+mime+';base64,'+content,mime);
          r.uploadToken=result.data.uploadToken;setRows(old=>old.map(v=>v.id===r.id?{...v,uploadToken:r.uploadToken}:v));
        }
        const linked=await tasksAPI.addCareReport(flowId,{uploadToken:r.uploadToken,title:r.title,category:r.category});
        r.saved=true;setRows(old=>old.map(v=>v.id===r.id?{...v,saved:true}:v));setData(linked.data);
      }
      setData((await tasksAPI.completeCareReports(flowId)).data);
    }catch(e){setError((e.message||'上传未完成')+'。成功项已保留，请重试未完成项。')}
    finally{lock.current=false;setBusy(false)}
  }
  return <View style={{minHeight:'100vh',padding:`${statusBarHeight+12}px 16px 32px`,backgroundColor:'#F2EDE3'}}>
    <Button disabled={busy} onClick={()=>Taro.navigateBack()}>返回</Button><Text style={{fontSize:'20px',fontWeight:700,display:'block',marginTop:'16px'}}>本次就医安排与资料上传</Text>
    {!!error&&<View style={{...card,color:'#B91C1C'}}>{error}</View>}
    {!data&&<Text>正在加载…</Text>}
    {data?.plans?.map(p=><View key={p._id} style={card}><Text style={{fontWeight:700,display:'block'}}>{p.title}</Text><Text style={{display:'block',whiteSpace:'pre-wrap',lineHeight:'24px',marginTop:'8px'}}>{p.description}</Text></View>)}
    {data?.completed?<View style={card}>本次资料已提交，上传提醒已结束。健管专员继续审核。需要追加时，请使用常规报告上传入口。</View>:data?.canUpload?<>
      <View style={card}>可同时上传多个类目的资料，每张分别分类。全部上传成功后才结束本次提醒。{data.reports.map(r=><Text key={r._id} style={{display:'block',marginTop:'8px'}}>已留存：{r.title}</Text>)}</View>
      <Button disabled={busy} onClick={pick}>＋ 选择报告、病历或医嘱（可多选）</Button>
      {rows.map(r=><View key={r.id} style={card}><Text>资料名称</Text><Input disabled={busy||r.saved} value={r.title} onInput={e=>change(r.id,{title:e.detail.value})} style={{height:'48px',borderBottom:'1px solid #ddd'}}/><Picker disabled={busy||r.saved} mode="selector" range={labels} value={categories.indexOf(r.category)} onChange={e=>change(r.id,{category:categories[Number(e.detail.value)]})}><View style={{padding:'16px 0'}}>资料类型：{labels[categories.indexOf(r.category)]} ▾</View></Picker>{r.saved?<Text>已上传</Text>:<Button disabled={busy} onClick={()=>{setRows(old=>old.filter(v=>v.id!==r.id));setConfirmed(false)}}>移除未上传项</Button>}</View>)}
      <Button disabled={busy} onClick={()=>setConfirmed(!confirmed)}>{confirmed?'☑':'☐'} 我确认本次资料已选择齐全</Button>
      <Button disabled={busy||!confirmed||(!rows.length&&!data.reports.length)||rows.some(r=>!r.title.trim())} onClick={submit}>{busy?'正在上传，请勿离开…':'提交全部资料，完成本次上传'}</Button>
    </>:data&&<View style={card}>本次资料已转入后续处理，追加资料请使用常规入口。</View>}
  </View>;
}
