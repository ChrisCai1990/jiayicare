import React, { useRef, useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { inAppServiceGroupAPI } from '../services/api';
import { chooseImageWithPrivacy, isImagePickerCancelled } from '../utils/imagePicker';
import { ensureAiDataConsent } from '../utils/aiDataConsent';

export default function GroupMaterialUpload({ groupId, onSent }) {
  const [busy,setBusy]=useState(false);
  const [pending,setPending]=useState(null);
  const lock=useRef(false);
  const upload=async()=>{
    if(lock.current)return;
    lock.current=true;setBusy(true);
    try {
      let data=pending;
      if(!data){
        await ensureAiDataConsent('health',{cancelText:'仅保存原件'});
        const source=await Taro.showActionSheet({itemList:['拍照 / 相册图片','PDF文件']});
        let result;
        if(source.tapIndex===1&&process.env.TARO_ENV==='h5') {
          const file=await new Promise(resolve=>{
            const input=document.createElement('input');input.type='file';input.accept='application/pdf';
            input.onchange=()=>{resolve(input.files?.[0]||null);input.remove();};
            input.oncancel=()=>{resolve(null);input.remove();};input.click();
          });
          if(!file)return;
          if(file.size>15*1024*1024)throw new Error('PDF不能超过15MB');
          const content=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
          result={contents:[content]};
        }else if(source.tapIndex===1){
          const picked=await Taro.chooseMessageFile({count:1,type:'file',extension:['pdf']});
          result={tempFilePaths:(picked.tempFiles||[]).map(f=>f.path)};
        }else result=await chooseImageWithPrivacy({count:9,sizeType:['compressed'],sourceType:['album','camera']});
        const files=result.contents || [];
        for(const path of result.tempFilePaths || []) {
          if(process.env.TARO_ENV==='h5'){
            const blob=await(await fetch(path)).blob();
            if(blob.size>15*1024*1024)throw new Error('资料总大小不能超过15MB');
            files.push(await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);}));
          }else{
            const raw=Taro.getFileSystemManager().readFileSync(path,'base64');
            files.push((source.tapIndex===1?'data:application/pdf;base64,':'data:image/jpeg;base64,')+raw);
          }
        }
        if(!files.length)return;
        if(files.reduce((n,f)=>n+f.length,0)>21*1024*1024)throw new Error('资料总大小不能超过15MB，请减少图片数量');
        data={category:'auto',files,requestId:'material_'+Date.now()+'_'+Math.random().toString(36).slice(2)};
        setPending(data);
      }
      await inAppServiceGroupAPI.uploadMaterial(groupId,data);
      setPending(null);
      Taro.showToast({title:'资料已提交',icon:'success'});
      onSent?.();
    }catch(error){if(!isImagePickerCancelled(error)&&!/cancel/i.test(error.errMsg||''))Taro.showModal({title:'资料未确认提交',content:error.message||'请重试，重复提交不会重复建档',showCancel:false});}
    finally{lock.current=false;setBusy(false);}
  };
  return <View style={{flexShrink:0,padding:'6px 12px',background:'#fff',borderTop:'1px solid #eee'}}>
    <Text onClick={upload} style={{color:'#187e87',fontSize:'13px'}}>{busy?'正在提交资料…':pending?'重试提交医疗资料':'＋ 上传医疗资料'}</Text>
    {!busy&&pending&&<Text onClick={()=>setPending(null)} style={{marginLeft:'20px',fontSize:'12px'}}>重新选择</Text>}
  </View>;
}
