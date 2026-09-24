const Admin = require('../models/Admin');
const FollowUp = require('../models/FollowUp');
const Order = require('../models/Order');
const User = require('../models/User');
const RecurringSupplyPlan = require('../models/RecurringSupplyPlan');
const { calculateMedicationSupply, numberOf } = require('./medicationSupplyCalculation');

const PREFIX = 'medication_proxy:';
const isMedicationProxyOrder = order => {
  if (!order) return false;
  if (typeof order === 'string') return /代配药|代取药/.test(order);
  return /代配药|代取药/.test([order.serviceName, order.specificationLabel, order.note, order.serviceRequirements].filter(Boolean).join(' '));
};
const stageOf = task => task?.sourceType === 'order' && String(task.workflowKey || '').startsWith(PREFIX)
  ? task.workflowKey.slice(PREFIX.length) : '';
const value = input => String(input || '').trim();

async function createStage(order, stage, assignee, previous, data = {}) {
  if (!assignee) throw Object.assign(new Error('下一环节负责人未分配，请先完成客户人员分配'), { status: 409 });
  const labels = { intake: '规划师核对配药信息', advisor: '健康顾问评估科室与专家', review: '规划师确认顾问评估结果', booking: '健管专员预约配药门诊', planner: '健康规划师分配配药执行人员', execute: '就医专员配药、确认与配送', progress: '规划师查看代配药订单进度' };
  return FollowUp.findOneAndUpdate(
    { sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}${stage}` },
    { $setOnInsert: {
      patientId: order.user, staffId: assignee, assignedTo: assignee, type: 'other', status: 'planned',
      date: new Date(), remindAt: new Date(), sourceType: 'order', sourceOrderId: order._id,
      workflowKey: `${PREFIX}${stage}`, taskRole: 'executor', dependsOnTaskId: previous?._id || null,
      theme: `代配药：${labels[stage]} · ${order.serviceName}`,
      plannedContent: labels[stage], formData: data,
    } }, { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function start(order, plannerId, formData = {}) {
  const existing = await FollowUp.exists({ sourceType: 'order', sourceOrderId: order._id, workflowKey: /^medication_proxy:/ });
  if (existing) throw Object.assign(new Error('该订单已进入代配药流程'), { status: 409 });
  const task = await createStage(order, 'intake', plannerId, null, formData);
  await FollowUp.updateMany({ sourceType: 'order', sourceOrderId: order._id, _id: { $ne: task._id }, workflowKey: { $in: ['', null] }, status: { $in: ['planned', 'in_progress'] } }, { $set: { status: 'cancelled', cancelReason: '已进入代配药分阶段流程' } });
  await Order.updateOne({ _id: order._id }, { $set: {
    supervisorId: plannerId, currentStage: 'intake', currentAssignee: plannerId,
    closureMode: 'automatic', supervisionStatus: 'in_progress',
  } });
  return task;
}

async function validate(task, body, staff) {
  const stage = stageOf(task);
  if (!stage || body.status !== 'completed') return '';
  if (staff.role !== 'superadmin' && String(task.assignedTo) !== String(staff._id)) return '仅当前环节负责人可完成任务';
  const data = body.formData || {};
  if (stage === 'progress') return '订单进度由系统自动更新，无需手工完成';
  if (stage === 'intake') {
    data.institution = data.institutionType === 'hospital' ? [data.hospitalName, data.campus].filter(Boolean).join(' · ')
      : data.institutionType === 'pharmacy' ? data.pharmacyName : data.platformName;
    const supply = calculateMedicationSupply(data);
    data.dailyQuantity = supply?.dailyUnits || '';
    data.supplyDays = supply?.supplyDays || '';
    if (['brandName', 'chemicalName', 'specification', 'singleDose', 'dailyFrequency', 'totalQuantity', 'paymentMethod'].some(key => !value(data[key]))) return '请核对药品商品名、化学名、规格、单次服用剂量、每日服用次数、配备总量和支付方式';
    if (!(numberOf(data.singleDose) > 0) || !(numberOf(data.dailyFrequency) > 0) || !(numberOf(data.totalQuantity) > 0)) return '单次服用剂量、每日服用次数和配备总量必须包含大于0的数值';
    if (!['self_pay', 'medical_insurance', 'commercial_insurance'].includes(data.paymentMethod)) return '请选择有效的支付方式';
    if (data.paymentMethod === 'medical_insurance' && !['electronic', 'physical'].includes(data.medicalInsuranceCardType)) return '请确认使用电子医保卡还是实体医保卡';
    if (!['hospital', 'pharmacy', 'online'].includes(data.institutionType)) return '请选择医院、药房或线上采购渠道';
    if (data.institutionType === 'hospital' && (!value(data.hospitalName) || !value(data.campus))) return '医院配药请填写医院名称和院区';
    if (data.institutionType === 'pharmacy' && !value(data.pharmacyName)) return '线下药房配药请填写药房名称';
    if (data.institutionType === 'online' && !value(data.platformName)) return '线上采购请填写平台名称';
    if (!value(data.medicalAssistantId)) return '请由健康规划师先指定本单就医专员';
    const selectedAssistant = await Admin.findOne({ _id: data.medicalAssistantId, role: 'medicalAssistant', staffStatus: 'active' }).select('_id name').lean();
    if (!selectedAssistant) return '本单就医专员无效或已停用，请重新选择';
    data.medicalAssistantName = selectedAssistant.name;
    if (data.institutionType === 'hospital' && !data.needsAdvisor && !value(data.department)) return '医院配药请填写科室，或转健康顾问评估';
    if (data.institutionType === 'hospital' && !data.needsAdvisor && data.expertRequired && !value(data.expert)) return '需要专家开方时请填写专家，或转健康顾问评估';
    if (data.regularSupply && !supply) return '定期配药需要可换算的规格、单次服用剂量、每日服用次数和配备总量';
  }
  if (stage === 'advisor' && (!value(data.department) || (data.expertRequired && !value(data.expert)) || !value(data.assessment))) return '请填写科室、所需专家和评估结论';
  if (stage === 'review' && (!value(data.department) || (data.expertRequired && !value(data.expert)) || !data.plannerConfirmed)) return '请确认健康顾问建议的科室与专家';
  if (stage === 'booking' && (!value(data.department) || !value(data.appointmentDate) || !value(data.appointmentTime) || (data.expertRequired && !value(data.expert)))) return '请确认配药医生的科室、专家和预约时间';
  if (stage === 'booking') {
    // The planner owns assignment. Booking only confirms the appointment and hands off.
    if (task.formData?.intakeSnapshot) data.intakeSnapshot = task.formData.intakeSnapshot;
    const plannedAssistantId = value(task.formData?.intakeSnapshot?.medicalAssistantId || task.formData?.medicalAssistantId);
    data.medicalAssistantId = plannedAssistantId;
    if (plannedAssistantId) {
      const selectedAssistant = await Admin.findOne({ _id: plannedAssistantId, role: 'medicalAssistant', staffStatus: 'active' }).select('_id name').lean();
      if (!selectedAssistant) return '规划师指定的就医专员无效或已停用，请联系规划师调整';
      data.medicalAssistantId = plannedAssistantId;
      data.medicalAssistantName = selectedAssistant.name;
    }
  }
  if (stage === 'planner') {
    if (!value(data.medicalAssistantId)) return '请指定本单就医专员后再流转执行';
    const selectedAssistant = await Admin.findOne({ _id: data.medicalAssistantId, role: 'medicalAssistant', staffStatus: 'active' }).select('_id name').lean();
    if (!selectedAssistant) return '本单就医专员无效或已停用，请重新选择';
    data.medicalAssistantName = selectedAssistant.name;
  }
  if (stage === 'execute' && (!value(data.dispensingResult) || !data.customerConfirmed || !value(data.deliveryArrangement) || !value(data.expectedDeliveryDate))) return '请记录采购或配药结果、客户确认、配送安排和预计送达日期';
  if (stage === 'execute' && data.intakeSnapshot?.institutionType === 'online' && (!value(data.purchaseChannel) || !value(data.purchasePrice) || !value(data.paymentConfirmation))) return '线上采购请核对购买渠道、价格和支付结果';
  if (stage !== 'execute') {
    const patient = await User.findById(task.patientId).select('assignedHealthPlanner assignedHealthManager assignedFamilyDoctor assignedMedicalAssistant').lean();
    const nextAssignee = stage === 'intake'
      ? (data.institutionType === 'hospital'
        ? (data.needsAdvisor ? patient?.assignedFamilyDoctor : patient?.assignedHealthManager)
        : (data.medicalAssistantId || patient?.assignedHealthPlanner))
      : stage === 'advisor' || stage === 'review' ? patient?.assignedHealthManager
        : stage === 'booking' ? (data.medicalAssistantId || patient?.assignedHealthPlanner)
          : data.medicalAssistantId;
    if (!nextAssignee) return '下一环节负责人未分配，请先完成客户人员分配';
  }
  return '';
}

async function advance(task) {
  const stage = stageOf(task);
  if (!stage || task.status !== 'completed') return;
  const order = await Order.findById(task.sourceOrderId);
  if (!order) return;
  const patient = await User.findById(task.patientId).select('assignedHealthPlanner assignedHealthManager assignedFamilyDoctor assignedMedicalAssistant').lean();
  const data = task.formData || {};
  if (stage === 'execute') {
    const intake = data.intakeSnapshot || {};
    const days = Number(intake.supplyDays) || calculateMedicationSupply(intake)?.supplyDays;
    if (intake.regularSupply && days > 0) {
      const nextDueDate = new Date(data.expectedDeliveryDate);
      nextDueDate.setDate(nextDueDate.getDate() + days);
      const deliveryLeadDays = Math.min(60, Math.max(3, Math.ceil(Number(data.deliveryLeadDays) || 3)));
      await RecurringSupplyPlan.findOneAndUpdate(
        { sourceOrderId: order._id },
        { $setOnInsert: { patientId: task.patientId, sourceOrderId: order._id, planType: 'medication', itemName: intake.brandName, dosage: intake.singleDose, frequency: `每${days}天一次`, cycleDays: days, institution: intake.institution, notes: `由代配药订单${order.orderNo || order._id}生成；首次送达日${data.expectedDeliveryDate}，下次预计用完前${deliveryLeadDays}天启动配药`, nextDueDate, leadDays: deliveryLeadDays, workflowStatus: 'idle', fulfillmentMode: intake.institutionType === 'hospital' ? 'hospital_assisted' : 'online_assisted', intake: { sourceOrderId: String(order._id), firstDeliveryDate: data.expectedDeliveryDate, deliveryLeadDays, ...intake }, createdBy: task.assignedTo } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    }
    await Order.updateOne(
      { _id: order._id, status: { $nin: ['completed', 'cancelled'] } },
      { $set: { status: 'completed', completedAt: new Date(), serviceStartedAt: order.serviceStartedAt || task.completedAt || new Date() }, $max: { usedUnits: Math.max(1, Number(order.totalUnits) || 1) } },
    );
    await Order.updateOne({ _id: order._id }, { $set: {
      currentStage: 'completed', currentAssignee: null, supervisionStatus: 'completed',
    } });
    await FollowUp.updateMany(
      { sourceType: 'order', sourceOrderId: order._id, status: { $in: ['planned', 'in_progress', 'missed'] } },
      { $set: { status: 'completed', completedAt: new Date(), completedBy: 'staff' } },
    );
    return;
  }
  let next;
  let assignee;
  if (stage === 'intake') {
    next = data.institutionType === 'hospital' ? (data.needsAdvisor ? 'advisor' : 'booking') : (data.medicalAssistantId ? 'execute' : 'planner');
  } else if (stage === 'advisor') next = 'booking';
  else if (stage === 'review') next = 'booking';
  // Older in-flight orders without an assignment still need the legacy planner fallback.
  else if (stage === 'booking') next = data.medicalAssistantId ? 'execute' : 'planner';
  else if (stage === 'planner') next = 'execute';
  assignee = next === 'advisor' ? patient?.assignedFamilyDoctor : next === 'review' || next === 'planner' ? patient?.assignedHealthPlanner : next === 'booking' ? patient?.assignedHealthManager : data.medicalAssistantId;
  const intakeSnapshot = stage === 'intake' ? data : data.intakeSnapshot;
  if (stage === 'intake') await createStage(order, 'progress', patient?.assignedHealthPlanner, task, { intakeSnapshot, currentStage: next });
  const progressLabels = { advisor: '健康顾问评估中', booking: '健管专员预约中', planner: '健康规划师分配配药执行人员', execute: '就医专员配药及配送中' };
  await FollowUp.updateOne(
    { sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}progress`, status: { $in: ['planned', 'in_progress'] } },
    { $set: { status: 'in_progress', content: `当前进度：${progressLabels[next] || next}`, 'formData.currentStage': next, 'formData.intakeSnapshot': intakeSnapshot } },
  );
  await createStage(order, next, assignee, task, { ...intakeSnapshot, ...data, intakeSnapshot, ...(['advisor', 'review'].includes(stage) ? { department: data.department, expert: data.expert, expertRequired: data.expertRequired, advisorAssessment: data.assessment || data.advisorAssessment } : {}), ...(stage === 'booking' ? { bookingSnapshot: data } : {}) });
  await Order.updateOne({ _id: order._id }, { $set: {
    currentStage: next, currentAssignee: assignee, supervisionStatus: 'in_progress',
  } });
}

module.exports = { isMedicationProxyOrder, stageOf, start, validate, advance };
