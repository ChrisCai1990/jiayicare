const mongoose=require('mongoose');

// sync_msg 的游标按客服账号持久化；仅在本批消息成功处理后推进，失败时允许平台重推。
const schema=new mongoose.Schema({
  corpId:{type:String,required:true,index:true},
  openKfId:{type:String,required:true,index:true},
  cursor:{type:String,default:''},
},{timestamps:true});
schema.index({corpId:1,openKfId:1},{unique:true});
module.exports=mongoose.model('WecomKfCursor',schema);
