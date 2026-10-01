import React,{useState,useEffect,useRef} from 'react';
import {View,Text,ScrollView,TouchableOpacity,TextInput,Platform} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import {tasksAPI,reportsAPI} from '../../services/api';

const kinds=[['exam_report','检查报告'],['outpatient_record','门诊病历'],['prescription_order','处方/医嘱单']];
const absenceReasons=[['pending','暂未拿到资料，后续补传'],['no_exam','已就医，未做检查且无资料'],['no_print','未打印或未取得病历'],['other','其他情况']];
const button={padding:14,borderRadius:12,backgroundColor:'#E8F5EF',marginVertical:8};
const field={borderWidth:1,borderColor:'#CDDCD5',borderRadius:10,padding:12,minHeight:48,marginVertical:8};
export default function CareReportUpload({flowId,navigation}){
  const [data,setData]=useState(null),[rows,setRows]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirmed,setConfirmed]=useState(false);
  const [absence,setAbsence]=useState(false),[reason,setReason]=useState('pending'),[note,setNote]=useState(''),[notice,setNotice]=useState(''),[progress,setProgress]=useState(''),[showPlans,setShowPlans]=useState(false);
  const lock=useRef(false);
  useEffect(()=>{let active=true;tasksAPI.careReports(flowId).then(r=>{if(active){setData(r.data);if(r.data?.declaration){setAbsence(true);setReason(r.data.declaration.kind||'pending');setNote(r.data.declaration.note||'')}}}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[flowId]);
  const change=(id,patch)=>{setConfirmed(false);setRows(old=>old.map(r=>r.id===id?{...r,...patch}:r))};
  async function pick(){
    try{const result=await DocumentPicker.getDocumentAsync({type:['image/*','application/pdf'],multiple:true,copyToCacheDirectory:true});if(result.canceled)return;
      setRows(old=>[...old,...result.assets.map((a,i)=>({...a,id:Date.now()+'-'+i,title:a.name||'检查报告',category:'exam_report'}))]);setConfirmed(false);
    }catch(e){setError(e.message)}
  }
  async function submit(){
    if(lock.current||!confirmed)return;lock.current=true;setBusy(true);setError('');
    try{
      for(const r of rows){
        if(r.saved)continue;
        setProgress(`正在上传第 ${rows.indexOf(r)+1}/${rows.length} 项资料`);
        if(!r.uploadToken){
          let content;
          if(Platform.OS==='web')content=await new Promise(async(resolve,reject)=>{try{const blob=await (await fetch(r.uri)).blob();const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)}catch(e){reject(e)}});
          else content='data:'+(r.mimeType||'image/jpeg')+';base64,'+await FileSystem.readAsStringAsync(r.uri,{encoding:'base64'});
          const result=await reportsAPI.uploadBase64(content,r.mimeType||'image/jpeg');
          r.uploadToken=result.data.uploadToken;setRows(old=>old.map(v=>v.id===r.id?{...v,uploadToken:r.uploadToken}:v));
        }
        const linked=await tasksAPI.addCareReport(flowId,{uploadToken:r.uploadToken,title:r.title,category:r.category});
        r.saved=true;setRows(old=>old.map(v=>v.id===r.id?{...v,saved:true}:v));setData(linked.data);
      }
      setProgress('正在确认本次提交');
      setData((await tasksAPI.completeCareReports(flowId)).data);
    }catch(e){setError((e.message||'上传未完成')+'。成功项已保留，请重试未完成项。')}
    finally{lock.current=false;setBusy(false);setProgress('')}
  }
  async function submitAbsence(){
    if(lock.current||busy||notice||!data?.canUpload||data.completed)return;
    if(reason==='other'&&!note.trim()){setError('请补充具体情况');return}
    lock.current=true;setBusy(true);setError('');
    try{const response=await tasksAPI.declareCareReports(flowId,{kind:reason,note:note.trim()});
      if(response?.success===false||!response?.data?.declaration)throw new Error(response?.message||'说明未提交成功');
      setData(response.data);setNotice('已反馈，待专员核实。拿到资料后仍可补传。');
    }catch(e){setError((e.message||'说明提交结果未确认')+'。请刷新核对后重试。')}
    finally{lock.current=false;setBusy(false)}
  }
  const submitHint=!rows.length&&!data?.reports?.length?'请先选择至少一份报告、病历或医嘱':rows.some(r=>!r.title.trim())?'请填写每份资料的名称':!confirmed?'请确认现有资料已选齐':'';
  return <ScrollView style={{flex:1,backgroundColor:'#F2EDE3'}} contentContainerStyle={{padding:20,paddingTop:48,paddingBottom:48}}>
    <TouchableOpacity disabled={busy} onPress={()=>navigation.goBack()} style={button}><Text>返回</Text></TouchableOpacity>
    <Text style={{fontSize:22,fontWeight:'700'}}>本次就医反馈</Text><Text style={{color:'#66796F',marginTop:4}}>上传已有资料，或说明本次实际情况</Text>
    {error!==''&&<Text accessibilityRole="alert" style={{color:'#B91C1C',marginVertical:12}}>{error}</Text>}
    {!data&&<Text>正在加载…</Text>}
    {data&&<View style={{backgroundColor:'#fff',padding:16,borderRadius:14,marginTop:12}}><Text style={{fontWeight:'700'}}>{data.serviceTitle}</Text><Text style={{marginTop:6,color:'#66796F'}}>{data.visitDate||'日期待核对'} · 服务编号 {data.serviceCode}</Text></View>}
    {!!data?.plans?.length&&<TouchableOpacity onPress={()=>setShowPlans(!showPlans)} style={button}><Text>{showPlans?'收起就医安排 ∧':'查看就医安排 ›'}</Text></TouchableOpacity>}
    {showPlans&&data?.plans?.map(p=><View key={p._id} style={{backgroundColor:'#fff',padding:16,borderRadius:12,marginTop:12}}><Text style={{fontWeight:'700',fontSize:17}}>{p.title}</Text><Text style={{lineHeight:24,marginTop:8}}>{p.description}</Text></View>)}
    {data?.declaration&&!data.completed&&!data.noDocumentsVerified&&<View style={{backgroundColor:'#E6F1EB',padding:16,borderRadius:14,marginTop:12}}><Text style={{fontWeight:'700'}}>已反馈，待专员核实</Text><Text style={{marginTop:6}}>{data.declaration.label}</Text><Text style={{marginTop:6}}>补充说明：{data.declaration.note||'未填写'}</Text></View>}
    {data?.noDocumentsVerified?<View style={button}><Text>专员已核实本次无可提供资料，你无需继续上传。</Text></View>:data?.completed?<View style={{padding:20}}><Text>本次资料已提交，上传提醒已结束。健管专员将继续审核。</Text><Text>如需追加，请从常规报告上传入口进入。</Text></View>:data?.canUpload?<>
      <View style={{flexDirection:'row',gap:8,marginTop:12}}>{[['上传资料',false],['没有可上传资料',true]].map(([label,value])=><TouchableOpacity key={label} disabled={busy} onPress={()=>setAbsence(value)} style={{...button,flex:1,backgroundColor:absence===value?'#1E6B50':'#fff'}}><Text style={{textAlign:'center',color:absence===value?'#fff':'#274838'}}>{label}</Text></TouchableOpacity>)}</View>
      {!absence&&<><Text style={{marginTop:16}}>有哪类资料就上传哪类，不要求报告、病历和医嘱三类齐全。</Text>
      {data.reports.map(r=><Text key={r._id} style={{marginTop:8}}>已留存：{r.title}</Text>)}
      <TouchableOpacity disabled={busy} onPress={pick} style={button}><Text>＋ 选择报告、病历或医嘱（可多选）</Text></TouchableOpacity>
      {!!progress&&<Text style={{color:'#1E6B50'}}>{progress}</Text>}
      {rows.map(r=><View key={r.id} style={{borderWidth:1,borderColor:'#CDDCD5',padding:12,borderRadius:12,marginVertical:8}}>
        <TextInput accessibilityLabel="资料名称" style={field} editable={!busy&&!r.saved} value={r.title} onChangeText={title=>change(r.id,{title})}/>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{kinds.map(([key,label])=><TouchableOpacity key={key} disabled={busy||r.saved} style={{...button,backgroundColor:r.category===key?'#BEDDCC':'#F3F3F3'}} onPress={()=>change(r.id,{category:key})}><Text>{label}</Text></TouchableOpacity>)}</View>
        {r.saved?<Text>已上传</Text>:<TouchableOpacity disabled={busy} onPress={()=>{setRows(old=>old.filter(v=>v.id!==r.id));setConfirmed(false)}}><Text style={{color:'#B91C1C'}}>移除未上传项</Text></TouchableOpacity>}
      </View>)}
      <TouchableOpacity disabled={busy} style={button} onPress={()=>setConfirmed(!confirmed)}><Text>{confirmed?'☑':'☐'} 我确认现有资料已选齐</Text></TouchableOpacity>
      {!!submitHint&&<Text style={{color:'#66796F'}}>{submitHint}</Text>}
      <TouchableOpacity disabled={busy||!!submitHint} style={{...button,opacity:busy||!!submitHint?0.5:1,backgroundColor:'#1E6B50'}} onPress={submit}><Text style={{color:'#fff'}}>{busy?'正在上传，请勿离开…':'提交全部资料'}</Text></TouchableOpacity></>}
      {absence&&<View style={{backgroundColor:'#fff',padding:16,borderRadius:14,marginTop:12}}><Text style={{fontWeight:'700'}}>本次是什么情况？</Text><Text style={{marginVertical:8}}>可以稍后补传；如果本次没有产生资料，请说明情况，由专员核实。</Text>{absenceReasons.map(([key,label])=><TouchableOpacity key={key} disabled={busy||!!notice} onPress={()=>setReason(key)} style={{...button,backgroundColor:reason===key?'#EDF6F1':'#F7F7F7'}}><Text>{reason===key?'✓ ':''}{label}</Text></TouchableOpacity>)}<TextInput multiline maxLength={500} value={note} editable={!busy&&!notice} onChangeText={setNote} placeholder="补充说明（其他情况必填，其余选填）" style={{...field,minHeight:90,textAlignVertical:'top'}}/><TouchableOpacity disabled={busy||!!notice||(reason==='other'&&!note.trim())} onPress={submitAbsence} style={{...button,backgroundColor:'#1E6B50',opacity:busy||!!notice?0.5:1}}><Text style={{color:'#fff'}}>{notice?'反馈已提交':busy?'正在处理…':'提交情况反馈'}</Text></TouchableOpacity>{!!notice&&<Text style={{color:'#1E6B50'}}>{notice}</Text>}</View>}
    </>:data&&<Text>本次资料已转入后续处理；追加资料请使用常规上传入口。</Text>}
  </ScrollView>;
}

