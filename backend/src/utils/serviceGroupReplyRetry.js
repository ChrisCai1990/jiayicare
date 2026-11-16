const Group=require('../models/InAppServiceGroup');
const Message=require('../models/InAppServiceGroupMessage');
const assistant=require('./serviceGroupAssistant');
let running=false;
async function retryPendingReplies() {
  if(running)return;running=true;
  try {
    const now=new Date();
    const groups=await Group.find({status:'active',lastCustomerMessageAt:{$gte:new Date(+now-86400000),$lte:new Date(+now-5000)},
      $and:[{$or:[{humanActiveUntil:{$exists:false}},{humanActiveUntil:{$lte:now}}]},
        {$or:[{aiReplyRetryAt:{$exists:false}},{aiReplyRetryAt:{$lte:now}}]}],
      $expr:{$and:[{$gt:['$lastCustomerMessageAt',{$ifNull:['$lastStaffMessageAt',new Date(0)]}]},
        {$gt:['$lastCustomerMessageAt',{$ifNull:['$aiReplyDoneAt',new Date(0)]}]}]}
    }).sort({lastCustomerMessageAt:1}).limit(50).lean();
    for(const group of groups) {
      const claimed=await Group.updateOne({_id:group._id,lastCustomerMessageAt:group.lastCustomerMessageAt,
        $or:[{aiReplyRetryAt:{$exists:false}},{aiReplyRetryAt:{$lte:now}}]},{$set:{aiReplyRetryAt:new Date(Date.now()+180000)}});
      if(!claimed.modifiedCount)continue;
      const message=await Message.findOne({groupId:group._id,tenantId:group.tenantId,senderType:'customer'}).sort({createdAt:-1,_id:-1}).lean();
      if(!message)continue;
      const scope={_id:group._id,lastCustomerMessageAt:message.createdAt};
      if(!await Message.exists({replyTo:message._id}))await assistant.reply(group._id,{...message,id:message._id});
      // A renewed human presence is a deferral, not a failed AI attempt.
      const current=await Group.findById(group._id).lean();
      const answered=await Message.exists({replyTo:message._id});
      const attempts=String(group.aiReplyTriggerId)===String(message._id)?(group.aiReplyAttempts||0)+1:1;
      if(answered)await Group.updateOne(scope,{$set:{aiReplyDoneAt:message.createdAt},$unset:{aiReplyRetryAt:1}});
      else if(current?.humanActiveUntil>new Date())await Group.updateOne(scope,{$set:{aiReplyRetryAt:current.humanActiveUntil}});
      else await Group.updateOne(scope,{$set:{aiReplyTriggerId:message._id,aiReplyAttempts:attempts,
        ...(attempts>=3?{aiReplyDoneAt:message.createdAt}:{aiReplyRetryAt:new Date(Date.now()+60000)})},...(attempts>=3?{$unset:{aiReplyRetryAt:1}}:{})});
    }
  }catch(error){console.error('[service-group-ai-retry]',error.code||'RETRY_FAILED');}
  finally{running=false;}
}
function startReplyRetry(){void retryPendingReplies();setInterval(()=>void retryPendingReplies(),15000).unref();}
module.exports={retryPendingReplies,startReplyRetry};
