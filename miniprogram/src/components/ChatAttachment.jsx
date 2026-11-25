import React from 'react';
import { View, Text } from '@tarojs/components';
import Icon from './Icon';

export default function ChatAttachment({icon, label, onClick}) {
  return <View onClick={onClick} style={{width:'25%',textAlign:'center'}}>
    <View style={{width:'54px',height:'54px',margin:'0 auto 4px',borderRadius:'12px',backgroundColor:'#fff',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <Icon name={icon} size={28} color="#26332F"/>
    </View>
    <Text style={{fontSize:'12px',color:'#65756F'}}>{label}</Text>
  </View>;
}
