const { fail, assertUsableOrder } = require('./rehabService');
async function redeem(order, staff, recordId, models) {
  const {Order,ServiceRecord}=models;
  if(!['rehabSpecialist','superadmin'].includes(staff.role)) fail('由运动复健师确认本次服务完成',403);
  const record=await ServiceRecord.findOne({_id:recordId,patientId:order.user,type:'rehab'}).lean();
  const entry=record?.structuredContent?.rehab;
  if(!record || entry?.status!=='published' || String(entry.orderId)!==String(order._id) || entry.kind==='guidance') fail('请先发布关联本订单的评估或训练记录',409);
  if(staff.role!=='superadmin' && String(record.staffId)!==String(staff._id)) fail('只能核销本人实际完成的服务',403);
  const existing=(order.redemptions || []).find(r=>String(r.rehabRecordId)===String(recordId));
  if(existing) return {already:true,order,redemption:existing};
  assertUsableOrder(order);
  const initial=order.skuCode==='rehab_initial';
  if(initial !== (entry.kind==='initial')) fail('首次评估与后续训练须使用对应订单',409);
  const used=Number(order.usedUnits || 0),total=Number(order.totalUnits || 1);
  if(used>=total) fail('服务次数已用完',409);
  const complete=used+1>=total;
  const redemption={sequence:used+1,redeemedAt:new Date(),redeemedBy:staff._id,rehabRecordId:record._id,note:`${entry.mode==='online'?'线上':'线下'}｜${record.title}｜${entry.date}`};
  const saved=await Order.findOneAndUpdate({_id:order._id,updatedAt:order.updatedAt,usedUnits:used,'redemptions.rehabRecordId':{$ne:record._id}},{$inc:{usedUnits:1},$push:{redemptions:redemption},$set:{status:complete?'completed':'scheduled',tradeStatus:complete?'completed':'fulfilling',fulfillmentStatus:complete?'completed':'in_service',...(!order.serviceStartedAt?{serviceStartedAt:new Date(),serviceStartedBy:staff._id,serviceStartEvidence:redemption.note}:{}),...(complete?{completedAt:new Date()}:{}),currentStage:complete?'completed':'rehab_booking'}},{new:true});
  if(!saved) fail('订单已变化，请刷新核对，本次未重复扣次',409);
  return {already:false,order:saved,redemption};
}
module.exports={redeem};
