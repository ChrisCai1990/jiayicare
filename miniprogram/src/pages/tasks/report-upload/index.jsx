import React,{useState,useEffect,useRef} from 'react';
import {View,Text,Input,Picker,Button as NativeButton,Textarea} from '@tarojs/components';
import Taro from '@tarojs/taro';
import {tasksAPI,reportsAPI} from '../../../services/api';
import useNavBar from '../../../hooks/useNavBar';
import {chooseImageWithPrivacy,readSelectedImage,isImagePickerCancelled,showImagePickerError} from '../../../utils/imagePicker';

const categories=['exam_report','outpatient_record','prescription_order'];
const labels=['检查报告','门诊病历','处方/医嘱单'];
const absenceReasons=['暂未拿到资料，后续补传','已就医，未做检查且无资料','未打印或未取得病历','其他情况'];
const absenceKinds=['pending','no_exam','no_print','other'];
const Button=props=><NativeButton {...props} style={{fontSize:'14px',lineHeight:'22px',padding:'11px 14px',margin:'8px 0',borderRadius:'12px',color:'#274838',backgroundColor:'#fff',...props.style}}/>;
const formatSubmittedAt=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?'未记录':`${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;};
const card={padding:'16px',marginTop:'12px',borderRadius:'16px',backgroundColor:'#fff'};
export default function CareReportUpload(){
  const flowId=Taro.getCurrentInstance().router?.params?.flowId;
  const {statusBarHeight,navBarHeight=44}=useNavBar();
  const [data,setData]=useState(null),[rows,setRows]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirmed,setConfirmed]=useState(false);
  const [absence,setAbsence]=useState(false),[reason,setReason]=useState(absenceReasons[0]),[note,setNote]=useState(''),[notice,setNotice]=useState('');
  const lock=useRef(false);
  const pickLock=useRef(false);
  const [picking,setPicking]=useState(false),[progress,setProgress]=useState(''),[showPlans,setShowPlans]=useState(false);
  const submitHint=!rows.length&&!data?.reports?.length?'请先选择至少一份报告、病历或医嘱':rows.some(r=>!r.title.trim())?'请填写每份资料的名称':!confirmed?'请确认本次资料已选择齐全':'';
  const submitDisabled=busy||picking||!!submitHint||!data?.canUpload||!!data?.completed;
  const [loading,setLoading]=useState(true);
  const loadGeneration=useRef(0);
  async function load(){
    const generation=++loadGeneration.current;setLoading(true);setError('');
    try{const r=await tasksAPI.careReports(flowId);if(generation!==loadGeneration.current)return;
      if(r?.success===false||!r?.data)throw new Error(r?.message||'暂时无法加载反馈');
      setData(r.data);if(r.data.declaration){setAbsence(true);setReason(absenceReasons[absenceKinds.indexOf(r.data.declaration.kind)]||absenceReasons[0]);setNote(r.data.declaration.note||'');}
    }catch(e){if(generation===loadGeneration.current)setError(e.message||'服务暂时不可用，请稍后重试');}
    finally{if(generation===loadGeneration.current)setLoading(false);}
  }
  useEffect(()=>{load();return()=>{loadGeneration.current++}},[flowId]);
  const change=(id,patch)=>{setConfirmed(false);setRows(old=>old.map(r=>r.id===id?{...r,...patch}:r))};
  async function pick(){
    if(lock.current||pickLock.current)return;pickLock.current=true;setPicking(true);
    try{const result=await chooseImageWithPrivacy({count:9,sizeType:['compressed'],sourceType:['album','camera']});
      setRows(old=>[...old,...(result.tempFilePaths||[]).map((uri,i)=>({id:Date.now()+'-'+i,uri,selection:result,index:i,title:'检查报告 '+(old.length+i+1),category:'exam_report'}))]);setConfirmed(false);
    }catch(e){if(!isImagePickerCancelled(e))showImagePickerError(e)}finally{pickLock.current=false;setPicking(false)}
  }
  async function submitAbsence(){
    if(lock.current||pickLock.current||notice||!data?.canUpload||data.completed)return;
    if(reason==='其他情况'&&!note.trim()){setError('请补充具体情况');return;}
    lock.current=true;setBusy(true);setError('');
    try{
      const response=await tasksAPI.declareCareReports(flowId,{kind:absenceKinds[absenceReasons.indexOf(reason)],note:note.trim()});
      if(!response?.success||!response.data?.declaration)throw new Error(response?.message||'说明未提交成功');
      setData(response.data);setNotice('已反馈，待专员核实。首页将不再提示你上传；拿到资料后仍可补传。');
    }catch(e){setError((e.message||'说明提交结果未确认')+'。请刷新核对后重试。')}

    finally{lock.current=false;setBusy(false)}
  }
  async function submit(){
    if(lock.current||pickLock.current||submitDisabled)return;lock.current=true;setBusy(true);setError('');
    try{
      for(const r of rows){
        if(r.saved)continue;
        setProgress(`正在上传第 ${rows.indexOf(r)+1}/${rows.length} 项资料`);
        if(!r.uploadToken){
          const {data,mimeType}=await readSelectedImage(r.selection||{tempFilePaths:[r.uri]},r.index||0);
          const result=await reportsAPI.uploadBase64(data,mimeType);
          r.uploadToken=result.data.uploadToken;setRows(old=>old.map(v=>v.id===r.id?{...v,uploadToken:r.uploadToken}:v));
        }
        const linked=await tasksAPI.addCareReport(flowId,{uploadToken:r.uploadToken,title:r.title,category:r.category});
        r.saved=true;setRows(old=>old.map(v=>v.id===r.id?{...v,saved:true}:v));setData(linked.data);
      }
      setProgress('资料已上传，正在确认本次提交');
      setData((await tasksAPI.completeCareReports(flowId)).data);
    }catch(e){setError((e.message||'上传未完成')+'。成功项已保留，请重试未完成项。')}
    finally{lock.current=false;setBusy(false);setProgress('')}
  }
  return <View style={{minHeight:'100vh',padding:`${statusBarHeight}px 18px 32px`,backgroundColor:'#F2EDE3',color:'#203C32',fontSize:'14px',lineHeight:'22px'}}>
    <View style={{height:navBarHeight+'px',display:'flex',alignItems:'center',paddingRight:'100px'}}><Text onClick={()=>{if(!busy)Taro.navigateBack()}} style={{color:'#1E6B50',fontSize:'14px'}}>‹ 返回</Text></View>
    <Text style={{fontSize:'22px',lineHeight:'30px',fontWeight:700,display:'block',margin:'16px 0 6px'}}>本次就医反馈</Text>
    <Text style={{fontSize:'13px',color:'#66796F'}}>上传已有资料，或说明本次实际情况</Text>
    {!!error&&<View style={{...card,color:'#B91C1C'}}>{error}</View>}
    {loading&&!data&&<Text>正在加载…</Text>}{!loading&&!data&&<Button onClick={load}>重新加载反馈</Button>}
    {data&&<View style={card}><Text style={{display:'block',fontWeight:600}}>{data.serviceTitle}</Text><Text style={{display:'block',marginTop:'6px'}}>{data.visitDate||'日期待核对'} · 服务编号 {data.serviceCode}</Text></View>}
    {!!data?.plans?.length&&<Text onClick={()=>setShowPlans(!showPlans)} style={{display:'block',fontSize:'13px',color:'#1E6B50',margin:'10px 4px'}}>{showPlans?'收起就医安排 ∧':'查看就医安排 ›'}</Text>}
    {showPlans&&data?.plans?.map(p=><View key={p._id} style={card}><Text style={{fontWeight:700,display:'block'}}>{p.title}</Text><Text style={{display:'block',whiteSpace:'pre-wrap',lineHeight:'24px',marginTop:'8px'}}>{p.description}</Text></View>)}
    {data?.declaration&&!data.completed&&!data.noDocumentsVerified&&<View style={{...card,backgroundColor:'#E6F1EB'}}><Text style={{display:'block',fontWeight:600}}>已反馈，待专员核实</Text><Text style={{display:'block',marginTop:'6px',color:'#52695D'}}>{data.declaration.label}</Text><Text style={{display:'block',marginTop:'8px'}}>补充说明：{data.declaration.note||'未填写'}</Text><Text style={{display:'block',fontSize:'12px',color:'#66796F',marginTop:'8px'}}>提交时间：{formatSubmittedAt(data.declaration.submittedAt)} · 待专员核实</Text></View>}
    {data?.noDocumentsVerified?<View style={card}>专员已核实本次无可提供资料，你无需继续上传。</View>:data?.completed?<View style={card}>本次资料已提交，上传提醒已结束。健管专员继续审核。需要追加时，请使用常规报告上传入口。</View>:data?.canUpload?<>
      <View style={{display:'flex',gap:'10px',marginTop:'18px'}}>{[['上传资料',false],['没有可上传资料',true]].map(([label,value])=><Button key={label} disabled={busy||picking} style={{flex:1,backgroundColor:absence===value?'#1E6B50':'#fff',color:absence===value?'#fff':'#274838'}} onClick={()=>setAbsence(value)}>{label}</Button>)}</View>
      {!absence&&<View style={card}>
      <View style={{fontSize:'13px',color:'#66796F',marginBottom:'12px'}}>有哪类资料就上传哪类，不要求报告、病历和医嘱三类齐全。{data.reports.map(r=><Text key={r._id} style={{display:'block',marginTop:'8px'}}>已留存：{r.title}</Text>)}</View>
      <Button disabled={busy||picking} onClick={pick}>{picking?'正在选择…':'＋ 选择报告、病历或医嘱（可多选）'}</Button>
      {!!progress&&<Text style={{display:'block',padding:'12px 0',color:'#1E6B50'}}>{progress}</Text>}
      {rows.map(r=><View key={r.id} style={card}><Text>资料名称</Text><Input disabled={busy||r.saved} value={r.title} onInput={e=>change(r.id,{title:e.detail.value})} style={{height:'48px',borderBottom:'1px solid #ddd'}}/><Picker disabled={busy||r.saved} mode="selector" range={labels} value={categories.indexOf(r.category)} onChange={e=>change(r.id,{category:categories[Number(e.detail.value)]})}><View style={{padding:'16px 0'}}>资料类型：{labels[categories.indexOf(r.category)]} ▾</View></Picker>{r.saved?<Text>已上传</Text>:<Button disabled={busy} onClick={()=>{setRows(old=>old.filter(v=>v.id!==r.id));setConfirmed(false)}}>移除未上传项</Button>}</View>)}
      <Button disabled={busy} onClick={()=>setConfirmed(!confirmed)}>{confirmed?'☑':'☐'} 我确认现有资料已选齐</Button>
      <View style={{marginTop:'12px',paddingBottom:'env(safe-area-inset-bottom)'}}>
        {!!submitHint&&<Text style={{display:'block',fontSize:'13px',color:'#5E6E66',marginBottom:'8px'}}>{submitHint}</Text>}
        <Button disabled={submitDisabled} style={{backgroundColor:submitDisabled?'#DCE5DF':'#1E6B50',color:submitDisabled?'#465B50':'#fff',fontSize:'16px',fontWeight:600,borderRadius:'12px',padding:'6px 0'}} onClick={submit}>{busy?'正在上传，请勿离开…':'提交全部资料'}</Button>
      </View>
      </View>}
      {absence&&<View style={card}>
        <Text style={{display:'block',fontWeight:600}}>本次是什么情况？</Text>
        {absence&&<View>
          <Text style={{display:'block',fontSize:'13px',margin:'12px 0',color:'#5E6E66'}}>可以稍后补传；如果本次没有产生资料，请说明情况，由专员核实。</Text>
          {absenceReasons.map(item=><Button key={item} disabled={busy||!!notice} onClick={()=>setReason(item)} style={{fontSize:'14px',marginBottom:'6px',backgroundColor:reason===item?'#EDF6F1':'#fff',color:'#274838'}}>{reason===item?'✓ ':''}{item}</Button>)}
          <Textarea disabled={busy||!!notice} maxlength={500} value={note} onInput={e=>setNote(e.detail.value)} placeholder="补充说明（其他情况必填，其余选填）" style={{width:'100%',height:'90px',padding:'10px',backgroundColor:'#F2EDE3',margin:'12px 0',boxSizing:'border-box'}}/>
          <Button disabled={busy||!!notice||(reason==='其他情况'&&!note.trim())} onClick={submitAbsence} style={{backgroundColor:'#EDF6F1',color:'#1E6B50',fontWeight:600}}>{notice?'反馈已提交':busy?'正在处理…':'提交情况反馈'}</Button>
        </View>}
        {!!notice&&<Text style={{display:'block',fontSize:'13px',lineHeight:'22px',marginTop:'10px',color:'#1E6B50'}}>{notice}</Text>}
      </View>}
    </>:data&&<View style={card}>本次资料已转入后续处理，追加资料请使用常规入口。</View>}
  </View>;
}
