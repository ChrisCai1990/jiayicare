import React, { useEffect, useRef, useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { inAppServiceGroupAPI } from '../services/api';
import { chooseImageWithPrivacy, isImagePickerCancelled } from '../utils/imagePicker';
import { ensureAiDataConsent } from '../utils/aiDataConsent';
import { chooseBrowserFile } from '../utils/chooseBrowserFile';

export default function GroupMaterialUpload({ groupId, onSent }) {
  const [busy,setBusy]=useState(false);
  const [pending,setPending]=useState(null);
  const lock=useRef(false);
  const picker=useRef(null);
  const [choosing,setChoosing]=useState(false);
  const [phase,setPhase]=useState('');
  const [showSources,setShowSources]=useState(false);
  useEffect(()=>()=>picker.current?.abort(),[]);
  const upload=async(sourceIndex)=>{
    if(lock.current)return;
    lock.current=true;
    try {
      let data=pending;
      if(!data){
        setShowSources(false);
        setChoosing(true);
        let result;
        if(sourceIndex===1&&process.env.TARO_ENV==='h5') {
          picker.current=new AbortController();
          const file=await chooseBrowserFile({accept:'application/pdf',signal:picker.current.signal});
          picker.current=null;setChoosing(false);
          if(!file)return;
          if(file.size>15*1024*1024)throw new Error('PDF不能超过15MB');
          const content=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
          result={contents:[content]};
        }else if(sourceIndex===1){
          const picked=await Taro.chooseMessageFile({count:1,type:'file',extension:['pdf']});
          result={tempFilePaths:picked.tempFilePaths?.length?picked.tempFilePaths:(picked.tempFiles||[]).map(f=>f.path||f.tempFilePath).filter(Boolean)};
        }else result=await chooseImageWithPrivacy({count:9,sizeType:['compressed'],sourceType:['album','camera']});
        setChoosing(false);
        setPhase('正在读取资料…');
        const files=[...(result.contents||[])];
        const selected=result.tempFilePaths?.length?result.tempFilePaths:(result.tempFiles||[]).map(f=>f.path||f.tempFilePath).filter(Boolean);
        const sizes=(result.tempFiles||[]).map(file=>Number(file.size)||0);
        if(sizes.length && sizes.reduce((sum,size)=>sum+size,0)>15*1024*1024)throw new Error('资料总大小不能超过15MB，请减少图片数量');
        for(let index=0;index<selected.length;index++) {
          const path=selected[index];
          setPhase(`正在读取资料 ${index+1}/${selected.length}…`);
          if(process.env.TARO_ENV==='h5'){
            const blob=await(await fetch(path)).blob();
            if(blob.size>15*1024*1024)throw new Error('资料总大小不能超过15MB');
            files.push(await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);}));
          }else{
            const raw=await new Promise((resolve,reject)=>Taro.getFileSystemManager().readFile({
              filePath:path,encoding:'base64',success:response=>resolve(response.data),
              fail:error=>reject(new Error(error?.errMsg||'图片读取失败，请重新选择')),
            }));
            files.push((sourceIndex===1?'data:application/pdf;base64,':'data:image/jpeg;base64,')+raw);
          }
          if(files.reduce((sum,file)=>sum+file.length,0)>21*1024*1024)throw new Error('资料总大小不能超过15MB，请减少图片数量');
        }
        if(!files.length)throw new Error('未读取到所选资料，请重新选择');
        setBusy(true);
        setPhase('正在确认资料处理方式…');
        await ensureAiDataConsent('health',{cancelText:'仅保存原件'});
        data={category:'auto',files,requestId:'material_'+Date.now()+'_'+Math.random().toString(36).slice(2)};
        setPending(data);
      }
      setBusy(true);
      setPhase('正在上传资料…');
      await inAppServiceGroupAPI.uploadMaterial(groupId,data);
      setPending(null);
      Taro.showToast({title:'资料已提交',icon:'success'});
      onSent?.();
    }catch(error){if(!isImagePickerCancelled(error)&&!/cancel/i.test(error.errMsg||''))Taro.showModal({title:'资料未确认提交',content:error.message||'请重试，重复提交不会重复建档',showCancel:false});}
    finally{picker.current=null;lock.current=false;setChoosing(false);setBusy(false);setPhase('');}
  };
  return <View style={{flexShrink:0,padding:'6px 12px',background:'#fff',borderTop:'1px solid #eee'}}>
    <View onClick={()=>{if(lock.current)return;pending?upload():setShowSources(value=>!value);}} style={{minHeight:'44px',display:'flex',alignItems:'center',color:'#187e87',fontSize:'14px'}}>
      {phase|| (choosing?'正在准备选择资料…':pending?'重试提交医疗资料':showSources?'收起上传选项':'＋ 上传医疗资料')}
    </View>
    {showSources&&!pending&&!choosing&&<View style={{display:'flex',gap:'10px',padding:'4px 0 10px'}}>
      <View onClick={()=>upload(0)} style={{flex:1,minHeight:'44px',display:'flex',alignItems:'center',justifyContent:'center',border:'1px solid #B7D7C9',borderRadius:'10px',color:'#1E6B50'}}>拍照 / 相册图片</View>
      <View onClick={()=>upload(1)} style={{flex:1,minHeight:'44px',display:'flex',alignItems:'center',justifyContent:'center',border:'1px solid #B7D7C9',borderRadius:'10px',color:'#1E6B50'}}>选择 PDF 文件</View>
    </View>}
    {choosing&&<Text onClick={()=>picker.current?.abort()} style={{marginLeft:'20px',color:'#187e87',fontSize:'12px'}}>取消选择</Text>}
    {!busy&&pending&&<Text onClick={()=>setPending(null)} style={{marginLeft:'20px',fontSize:'12px'}}>重新选择</Text>}
  </View>;
}
