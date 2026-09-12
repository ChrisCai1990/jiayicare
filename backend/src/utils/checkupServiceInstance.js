const HealthPlan = require('../models/HealthPlan')
const Product = require('../models/Product')
const PushRecord = require('../models/PushRecord')
const { DynamicQuestionnaire } = require('../models/DynamicQuestionnaire')

const CHECKUP_WORKFLOW_KEY = 'checkup'

function workflowModules(workflow = {}) {
  const source = Array.isArray(workflow.modules) && workflow.modules.length
    ? workflow.modules
    : (workflow.followUpPlanIds || []).map((planId, sequence) => ({ planId, mode: 'fixed', trigger: '', sequence }))
  return source.filter(item => !item.planId?.status || (item.planId.status === 'active' && item.planId.reviewStatus !== 'pending_review')).map((item, sequence) => ({
    id: String(item.planId?._id || item.planId || item.id || item._id || ''),
    name: item.planId?.name || item.name || '',
    mode: item.mode || 'fixed',
    trigger: item.trigger || '',
    sequence: item.sequence ?? sequence,
    reviewerRole: item.mode === 'conditional' ? 'familyDoctor' : '',
  })).filter(item => item.id).sort((a, b) => a.sequence - b.sequence)
}

async function getCheckupWorkflowProduct(productId) {
  if (!productId) return null
  const filter = { status: 'on', 'serviceWorkflow.key': CHECKUP_WORKFLOW_KEY }
  if (productId) filter._id = productId
  const product = await Product.findOne(filter)
    .populate('serviceWorkflow.modules.planId', 'name status reviewStatus')
    .lean()
  if (!product) return null
  const modules = workflowModules(product.serviceWorkflow)
  if (!modules.length) return null
  return { product, modules }
}

async function ensureStaffInitiatedCheckupService({ patient, staff, productId, desiredServiceDate = '', serviceRequirements = '' }) {
  const active = await HealthPlan.find({
    patientId: patient._id,
    type: 'medical_assist',
    status: { $in: ['draft', 'active'] },
  }).sort({ createdAt: -1 })
  const existing = active.find(plan => plan.content?.serviceDomain === 'annual_checkup')
  if (existing) return { servicePlan: existing, reused: true }

  const resolved = await getCheckupWorkflowProduct(productId)
  if (!resolved) {
    const error = new Error('Admin 尚未给该体检产品发布完整的一站式服务流程')
    error.statusCode = 409
    throw error
  }
  const { product, modules } = resolved
  const workflowSnapshot = {
    ...(product.serviceWorkflow || {}),
    modules: modules.map(item => ({ planId: item.id, mode: item.mode, trigger: item.trigger, sequence: item.sequence })),
    capturedAt: new Date(),
  }
  const servicePlan = await HealthPlan.create({
    patientId: patient._id,
    staffId: staff._id,
    type: 'medical_assist',
    title: `${patient.name || ''}${product.name}服务`,
    description: '由医护端主动发起，执行 Admin 已发布的体检一站式流程。',
    year: new Date().getFullYear(),
    items: [],
    content: {
      serviceDomain: 'annual_checkup',
      serviceScene: 'checkup_one_stop',
      serviceMode: 'one_stop',
      templateName: product.name,
      sourceType: 'staff_initiated',
      sourceProductId: product._id,
      sourceProductName: product.name,
      initiatedBy: staff._id,
      initiatedAt: new Date(),
      serviceDate: desiredServiceDate,
      serviceRequirements,
      tasks: serviceRequirements,
      serviceWorkflowSnapshot: workflowSnapshot,
      followUpPlanId: modules[0]?.id || '',
      followUpPlans: modules,
      workflowModules: modules,
      workflowModuleDecisions: modules.filter(item => item.mode === 'conditional')
        .map(item => ({ ...item, decision: 'pending', decidedAt: null, decidedBy: null })),
      reviewerId: patient.assignedFamilyDoctor || (staff.role === 'familyDoctor' ? staff._id : null),
      bookingPlannerId: patient.assignedHealthPlanner || null,
      escortStaffId: patient.assignedMedicalAssistant || null,
      notes: product.serviceWorkflow?.notes || '',
    },
    status: 'draft',
  })
  const questionnaireId = product.serviceWorkflow?.questionnaireId
  if (questionnaireId) {
    try {
      const questionnaire = await DynamicQuestionnaire.findOne({ _id: questionnaireId, status: 'active', deletedAt: null }).select('title')
      if (questionnaire) {
        const assignment = await PushRecord.create({
          staffId: staff._id,
          patientId: patient._id,
          type: 'questionnaire',
          questionnaireId: questionnaire._id,
          sourceHealthPlanId: servicePlan._id,
          title: questionnaire.title,
          content: `体检服务已发起，请填写《${questionnaire.title}》，提交后由健康顾问定制体检方案。`,
        })
        servicePlan.content.checkupIntake = { questionnaireId: questionnaire._id, assignmentId: assignment._id, status: 'pending', pushedAt: new Date() }
        servicePlan.markModified('content')
        await servicePlan.save()
      }
    } catch (error) {
      servicePlan.content.checkupIntake = { questionnaireId, status: 'push_failed', failedAt: new Date() }
      servicePlan.markModified('content')
      await servicePlan.save()
      console.error('[checkup-questionnaire] staff-initiated automatic push failed', { servicePlanId: String(servicePlan._id), error: error.message })
    }
  }
  return { servicePlan, reused: false, product }
}

module.exports = { CHECKUP_WORKFLOW_KEY, workflowModules, getCheckupWorkflowProduct, ensureStaffInitiatedCheckupService }
