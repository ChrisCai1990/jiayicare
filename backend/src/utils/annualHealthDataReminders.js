const {normalize,KINDS}=require('../../../shared/healthDataPlan.cjs');
async function sync(plan) {
  const Reminder=require('../models/Reminder');
  const rows=plan.moduleData?.personalized_followups?.enabled===false?[]:plan.moduleData?.personalized_followups?.records||[];
  const keys=[];
  for(const row of rows) {
    if(row.directNutritionAssessment || !row.healthDataPlan?.enabled) continue;
    const config=normalize(row.healthDataPlan), sourceKey=`health-data:${plan._id}:${config.id}`;
    keys.push(sourceKey);
    const previous=await Reminder.findOne({user:plan.patientId,sourceKey,systemManaged:true}).lean();
    await Reminder.updateOne({user:plan.patientId,sourceKey,systemManaged:true},{$set:{
      category:'monitoring',title:`记录健康数据 · ${KINDS[config.kind]}`,
      description:'按已确认的方案记录实际情况，可在健康数据中查看历史记录。',
      scheduleType:'recurring',reminderTime:config.reminderTime,customEveryNDays:config.reminderDays,daysOfWeek:[],
      startDate:new Date(`${config.startDate}T00:00:00+08:00`),endDate:new Date(`${config.endDate}T23:59:59+08:00`),
      enabled:!previous?.userDisabled,sourceAnnualPlanId:plan._id,
    }},{upsert:true});
  }
  await Reminder.updateMany({user:plan.patientId,sourceAnnualPlanId:plan._id,systemManaged:true,sourceKey:{$regex:'^health-data:',$nin:keys}},{$set:{enabled:false}});
}
module.exports={sync};
