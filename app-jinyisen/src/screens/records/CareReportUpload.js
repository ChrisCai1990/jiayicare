import React,{useState,useEffect,useRef} from 'react';
import {View,Text,ScrollView,TouchableOpacity,TextInput,Platform} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import {tasksAPI,reportsAPI} from '../../services/api';

const kinds=[['exam_report','检查报告'],['outpatient_record','门诊病历'],['prescription_order','处方/医嘱单']];
const button={padding:14,borderRadius:12,backgroundColor:'#E8F5EF',marginVertical:8};
const field={borderWidth:1,borderColor:'#CDDCD5',borderRadius:10,padding:12,minHeight:48,marginVertical:8};
export default function CareReportUpload({flowId,navigation}){
  const [data,setData]=useState(null),[rows,setRows]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirmed,setConfirmed]=useState(false);
  const lock=useRef(false);
  useEffect(()=>{let active=true;tasksAPI.careReports(flowId).then(r=>{if(active)setData(r.data)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[flowId]);
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
      setData((await tasksAPI.completeCareReports(flowId)).data);
    }catch(e){setError((e.message||'上传未完成')+'。成功项已保留，请重试未完成项。')}
    finally{lock.current=false;setBusy(false)}
  }
  return <ScrollView style={{flex:1,backgroundColor:'#fff'}} contentContainerStyle={{padding:20,paddingTop:48}}>
    <TouchableOpacity disabled={busy} onPress={()=>navigation.goBack()} style={button}><Text>返回</Text></TouchableOpacity>
    <Text style={{fontSize:22,fontWeight:'700'}}>本次就医安排与资料上传</Text>
    {error!==''&&<Text accessibilityRole="alert" style={{color:'#B91C1C',marginVertical:12}}>{error}</Text>}
    {!data&&<Text>正在加载…</Text>}
    {data?.plans?.map(p=><View key={p._id} style={{backgroundColor:'#F2F8F4',padding:16,borderRadius:12,marginTop:12}}><Text style={{fontWeight:'700',fontSize:17}}>{p.title}</Text><Text style={{lineHeight:24,marginTop:8}}>{p.description}</Text></View>)}
    {data?.completed?<View style={{padding:20}}><Text>本次资料已提交，上传提醒已结束。健管专员将继续审核。</Text><Text>如需追加，请从常规报告上传入口进入。</Text></View>:data?.canUpload?<>
      <Text style={{marginTop:16}}>可同时提交多份、不同类目的资料。全部上传成功后才结束本次提醒。</Text>
      {data.reports.map(r=><Text key={r._id} style={{marginTop:8}}>已留存：{r.title}</Text>)}
      <TouchableOpacity disabled={busy} onPress={pick} style={button}><Text>＋ 选择报告、病历或医嘱（可多选）</Text></TouchableOpacity>
      {rows.map(r=><View key={r.id} style={{borderWidth:1,borderColor:'#CDDCD5',padding:12,borderRadius:12,marginVertical:8}}>
        <TextInput accessibilityLabel="资料名称" style={field} editable={!busy&&!r.saved} value={r.title} onChangeText={title=>change(r.id,{title})}/>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{kinds.map(([key,label])=><TouchableOpacity key={key} disabled={busy||r.saved} style={{...button,backgroundColor:r.category===key?'#BEDDCC':'#F3F3F3'}} onPress={()=>change(r.id,{category:key})}><Text>{label}</Text></TouchableOpacity>)}</View>
        {r.saved?<Text>已上传</Text>:<TouchableOpacity disabled={busy} onPress={()=>{setRows(old=>old.filter(v=>v.id!==r.id));setConfirmed(false)}}><Text style={{color:'#B91C1C'}}>移除未上传项</Text></TouchableOpacity>}
      </View>)}
      <TouchableOpacity disabled={busy} style={button} onPress={()=>setConfirmed(!confirmed)}><Text>{confirmed?'☑':'☐'} 我确认本次资料已选择齐全，上传成功后结束本次提醒</Text></TouchableOpacity>
      <TouchableOpacity disabled={busy||!confirmed||(!rows.length&&!data.reports.length)||rows.some(r=>!r.title.trim())} style={{...button,opacity:busy||!confirmed?0.5:1}} onPress={submit}><Text>{busy?'正在上传，请勿离开…':'提交全部资料，完成本次上传'}</Text></TouchableOpacity>
    </>:data&&<Text>本次资料已转入后续处理；追加资料请使用常规上传入口。</Text>}
  </ScrollView>;
}

