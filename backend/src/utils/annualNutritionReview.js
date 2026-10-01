const {isTask}=require('../../../shared/annualNutrition.cjs');
async function transition({task,review=false}) {
 if(!isTask(task))throw Object.assign(new Error('不是营养评估任务'),{statusCode:404});
 throw Object.assign(new Error(review?'生活方式评估由营养师确认完成，无需健康顾问审核':'请通过生活方式问卷核实并提交评估'),{statusCode:400});
}
module.exports={transition};
