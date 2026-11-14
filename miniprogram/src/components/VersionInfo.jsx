import React, { useEffect, useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { isNativeApp, callNative } from '../utils/appBridge';

const pageBuild = process.env.JIAYICARE_PAGE_BUILD || '未生成页面版本';
export async function readVersionInfo() {
  if (process.env.TARO_ENV !== 'h5') {
    try {
      const info = Taro.getAccountInfoSync().miniProgram || {};
      return { channel: '微信小程序', version: info.version || '开发/体验版未提供版本号', build: info.envVersion || '未知', pageBuild };
    } catch { return { channel: '微信小程序', version: '暂无法读取', build: '未知', pageBuild }; }
  }
  if (!isNativeApp()) return { channel: '网页端', version: '不适用', build: '不适用', pageBuild };
  try {
    const injected = window.__JIAYICARE_APP_INFO__;
    const info = injected?.source === 'native-application' ? injected : await callNative('get-app-info', {}, 4000);
    if (info?.source !== 'native-application' || !info.version || !info.build) throw Error('unavailable');
    return { channel: info.platform === 'ios' ? '苹果 App' : '安卓 App', version: String(info.version), build: String(info.build), pageBuild, systemVersion: info.systemVersion || '' };
  } catch { return { channel: 'App', version: '当前安装包暂不支持读取', build: '暂无法读取', pageBuild, needsUpdate: true }; }
}
export default function VersionInfo() {
  const [info, setInfo] = useState(null);
  const [copyError, setCopyError] = useState('');
  useEffect(() => { let active=true; readVersionInfo().then(value=>{if(active)setInfo(value);});return()=>{active=false;}; }, []);
  const copy = async () => {
    if(!info)return;
    const text = `嘉医汇健康管家\n客户端：${info.channel}\n安装版本：${info.version}\n构建号：${info.build}\n页面版本：${info.pageBuild}${info.systemVersion ? '\n系统版本：'+info.systemVersion : ''}`;
    try { await Taro.setClipboardData({ data:text });setCopyError(''); }
    catch { setCopyError('复制未成功，请截取此处版本信息。'); }
  };
  return <View style={{marginTop:'16px',padding:'14px',borderRadius:'10px',background:'#fff',color:'#4A6558',fontSize:'12px',wordBreak:'break-all'}}>
    <Text style={{display:'block',fontWeight:600}}>版本信息</Text>
    {info ? <>
      <Text style={{display:'block',marginTop:'6px'}}>{info.channel} · 安装版本：{info.version}</Text>
      <Text style={{display:'block',marginTop:'4px'}}>构建号：{info.build}</Text>
      <Text style={{display:'block',marginTop:'4px'}}>页面版本：{info.pageBuild}</Text>
      {info.needsUpdate && <Text style={{display:'block',marginTop:'6px'}}>更新至支持版本读取的新安装包后，可显示安装版本。</Text>}
      <Text onClick={copy} style={{display:'block',padding:'10px 0 0',color:'#187e87'}}>复制版本信息</Text>
      {!!copyError && <Text style={{display:'block',color:'#B42318'}}>{copyError}</Text>}
    </> : <Text>正在读取版本信息…</Text>}
  </View>;
}
