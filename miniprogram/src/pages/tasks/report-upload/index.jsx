import React,{useState,useEffect,useRef} from 'react';
import {View,Text,Input,Picker,Button,Textarea} from '@tarojs/components';
import Taro from '@tarojs/taro';
import {tasksAPI,reportsAPI,messagesAPI,userAPI} from '../../../services/api';
import useNavBar from '../../../hooks/useNavBar';
import {chooseImageWithPrivacy,isImagePickerCancelled,showImagePickerError} from '../../../utils/imagePicker';

const categories=['exam_report','outpatient_record','prescription_order'];
const labels=['检查报告','门诊病历','处方/医嘱单'];
const absenceReasons=['暂未拿到资料，后续补传','本次没有报告或病历','其他情况'];
const card={padding:'16px',marginTop:'12px',border:'1px solid #CDDCD5',borderRadius:'12px',backgroundColor:'#fff'};
export default function CareReportUpload(){
  const flowId=Taro.getCurrentInstance().router?.params?.flowId;
  const {statusBarHeight}=useNavBar();
  const [data,setData]=useState(null),[rows,setRows]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirmed,setConfirmed]=useState(false);
  const [absence,setAbsence]=useState(false),[reason,setReason]=useState(absenceReasons[0]),[note,setNote]=useState(''),[notice,setNotice]=useState('');
  const lock=useRef(false);
  const pickLock=useRef(false);
  const [picking,setPicking]=useState(false),[progress,setProgress]=useState(''),[showPlans,setShowPlans]=useState(false);
  const submitHint=!rows.length&&!data?.reports?.length?'请先选择至少一份报告、病历或医嘱':rows.some(r=>!r.title.trim())?'请填写每份资料的名称':!confirmed?'请确认本次资料已选择齐全':'';
  const submitDisabled=busy||picking||!!submitHint||!data?.canUpload||!!data?.completed;
  useEffect(()=>{tasksAPI.careReports(flowId).then(r=>setData(r.data)).catch(e=>setError(e.message))},[flowId]);
  const change=(id,patch)=>{setConfirmed(false);setRows(old=>old.map(r=>r.id===id?{...r,...patch}:r))};
  async function pick(){
    if(lock.current||pickLock.current)return;pickLock.current=true;setPicking(true);
    try{const result=await chooseImageWithPrivacy({count:9,sizeType:['compressed'],sourceType:['album','camera']});
      setRows(old=>[...old,...(result.tempFilePaths||[]).map((uri,i)=>({id:Date.now()+'-'+i,uri,title:'检查报告 '+(old.length+i+1),category:'exam_report'}))]);setConfirmed(false);
    }catch(e){if(!isImagePickerCancelled(e))showImagePickerError(e)}finally{pickLock.current=false;setPicking(false)}
  }
  async function submitAbsence(){
    if(lock.current||pickLock.current||notice||!data?.canUpload||data.completed)return;
    if(reason==='其他情况'&&!note.trim()){setError('请补充具体情况');return;}
    lock.current=true;setBusy(true);setError('');
    try{
      const me=await userAPI.getMe();
      if(!me?.success||!me.data?.careTeam?.some(member=>member.kind==='healthManager'))throw new Error('暂未找到所属健管专员，请在“我的”中核对服务团队');
      const content=`【就医资料情况说明】\n服务：${data.serviceTitle||'本次就医'}\n日期：${data.visitDate||'待核对'}\n服务编号：${data.serviceCode||flowId}\n情况：${reason}${note.trim()?'\n补充：'+note.trim():''}\n请健管专员核实并跟进资料收集。`;
      const response=await messagesAPI.send('manager',content,{suppressAI:true});
      if(!response?.success)throw new Error(response?.message||'说明未发送成功');
      setNotice('说明已发送给健管专员，等待核实。上传提醒暂时保留；拿到资料后仍可补传。');
    }catch(e){setError((e.message||'说明提交结果未确认')+'。如遇网络中断，请先到健康管家核对消息，避免重复发送。')}
    finally{lock.current=false;setBusy(false)}
  }
  async function submit(){
    if(lock.current||pickLock.current||submitDisabled)return;lock.current=true;setBusy(true);setError('');
    try{
      for(const r of rows){
        if(r.saved)continue;
        setProgress(`正在上传第 ${rows.indexOf(r)+1}/${rows.length} 项资料`);
        if(!r.uploadToken){
          const content=Taro.getFileSystemManager().readFileSync(r.uri,'base64');
          const ext=r.uri.split('.').pop().toLowerCase(),mime=['png','webp','heic','heif'].includes(ext)?'image/'+ext:'image/jpeg';
          const result=await reportsAPI.uploadBase64('data:'+mime+';base64,'+content,mime);
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
  return <View style={{minHeight:'100vh',padding:`${statusBarHeight+12}px 16px 32px`,backgroundColor:'#F2EDE3'}}>
    <Button disabled={busy} onClick={()=>Taro.navigateBack()}>返回</Button><Text style={{fontSize:'20px',fontWeight:700,display:'block',marginTop:'16px'}}>上传报告及病历 · {data?.serviceTitle||'本次就医'}</Text>
    {!!error&&<View style={{...card,color:'#B91C1C'}}>{error}</View>}
    {!data&&<Text>正在加载…</Text>}
    {data&&<View style={card}>对应就医：{data.serviceTitle}<Text style={{display:'block',marginTop:'6px'}}>日期：{data.visitDate||'待核对'} · 服务编号：{data.serviceCode}</Text></View>}
    {!!data?.plans?.length&&<Button onClick={()=>setShowPlans(!showPlans)}>{showPlans?'收起就医安排':'查看就医安排'}</Button>}
    {showPlans&&data?.plans?.map(p=><View key={p._id} style={card}><Text style={{fontWeight:700,display:'block'}}>{p.title}</Text><Text style={{display:'block',whiteSpace:'pre-wrap',lineHeight:'24px',marginTop:'8px'}}>{p.description}</Text></View>)}
    {data?.completed?<View style={card}>本次资料已提交，上传提醒已结束。健管专员继续审核。需要追加时，请使用常规报告上传入口。</View>:data?.canUpload?<>
      <View style={card}>有哪类资料就上传哪类，不要求报告、病历和医嘱三类齐全。没有资料时，可向健管专员提交情况说明。{data.reports.map(r=><Text key={r._id} style={{display:'block',marginTop:'8px'}}>已留存：{r.title}</Text>)}</View>
      <Button disabled={busy||picking} onClick={pick}>{picking?'正在选择…':'＋ 选择报告、病历或医嘱（可多选）'}</Button>
      {!!progress&&<Text style={{display:'block',padding:'12px 0',color:'#1E6B50'}}>{progress}</Text>}
      {rows.map(r=><View key={r.id} style={card}><Text>资料名称</Text><Input disabled={busy||r.saved} value={r.title} onInput={e=>change(r.id,{title:e.detail.value})} style={{height:'48px',borderBottom:'1px solid #ddd'}}/><Picker disabled={busy||r.saved} mode="selector" range={labels} value={categories.indexOf(r.category)} onChange={e=>change(r.id,{category:categories[Number(e.detail.value)]})}><View style={{padding:'16px 0'}}>资料类型：{labels[categories.indexOf(r.category)]} ▾</View></Picker>{r.saved?<Text>已上传</Text>:<Button disabled={busy} onClick={()=>{setRows(old=>old.filter(v=>v.id!==r.id));setConfirmed(false)}}>移除未上传项</Button>}</View>)}
      <Button disabled={busy} onClick={()=>setConfirmed(!confirmed)}>{confirmed?'☑':'☐'} 我确认现有可提供的资料已选择齐全</Button>
      <View style={{marginTop:'12px',paddingBottom:'env(safe-area-inset-bottom)'}}>
        {!!submitHint&&<Text style={{display:'block',fontSize:'13px',color:'#5E6E66',marginBottom:'8px'}}>{submitHint}</Text>}
        <Button disabled={submitDisabled} style={{backgroundColor:submitDisabled?'#DCE5DF':'#1E6B50',color:submitDisabled?'#465B50':'#fff',fontSize:'16px',fontWeight:600,borderRadius:'12px',padding:'6px 0'}} onClick={submit}>{busy?'正在上传，请勿离开…':'提交全部资料'}</Button>
      </View>
      <View style={card}>
        <Text style={{display:'block',fontWeight:600,color:'#274838'}}>暂时没有可上传的资料？</Text>
        <Button disabled={busy||picking} style={{marginTop:'10px',color:'#1E6B50'}} onClick={()=>setAbsence(!absence)}>{absence?'收起情况说明':'说明情况给健管专员'}</Button>
        {absence&&<View>
          <Text style={{display:'block',fontSize:'13px',margin:'12px 0',color:'#5E6E66'}}>可以稍后补传；如果本次没有产生资料，请说明情况，由专员核实。</Text>
          {absenceReasons.map(item=><Button key={item} disabled={busy||!!notice} onClick={()=>setReason(item)} style={{fontSize:'14px',marginBottom:'6px',backgroundColor:reason===item?'#EDF6F1':'#fff',color:'#274838'}}>{reason===item?'✓ ':''}{item}</Button>)}
          <Textarea disabled={busy||!!notice} maxlength={500} value={note} onInput={e=>setNote(e.detail.value)} placeholder="补充说明（其他情况必填，其余选填）" style={{width:'100%',height:'90px',padding:'10px',backgroundColor:'#F2EDE3',margin:'12px 0',boxSizing:'border-box'}}/>
          <Button disabled={busy||!!notice||(reason==='其他情况'&&!note.trim())} onClick={submitAbsence} style={{backgroundColor:'#EDF6F1',color:'#1E6B50',fontWeight:600}}>{notice?'说明已发送':busy?'正在处理…':'提交说明给健管专员'}</Button>
        </View>}
        {!!notice&&<Text style={{display:'block',fontSize:'13px',lineHeight:'22px',marginTop:'10px',color:'#1E6B50'}}>{notice}</Text>}
      </View>
    </>:data&&<View style={card}>本次资料已转入后续处理，追加资料请使用常规入口。</View>}
  </View>;
}
