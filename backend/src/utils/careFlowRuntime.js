const crypto = require('crypto');
const config = require('../../../shared/careFlow.cjs');
const { advance, fail, text } = require('./careFlowState');
const id = value => String(value?._id || value || '');
const hash = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 24);
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
function runtime(injected = {}) {
  const Flow = injected.Flow || require('../models/CareFlow'), Task = injected.Task || require('../models/FollowUp');
  const User = injected.User || require('../models/User'), Admin = injected.Admin || require('../models/Admin'), Report = injected.Report || require('../models/MedicalReport');
  const enabled = injected.enabled || require('./healthManagementRollout').enabledForPatient;
  const tenant = actor => actor.tenantId || null;
  async function view(flowId, actor) {
    const flow = await Flow.findOne({ _id: flowId, tenantId: tenant(actor) }).lean();
    if (!flow || !enabled(flow.patientId)) fail('未找到已开放的本次服务', 404);
    if (actor.staffStatus === 'inactive' || (actor.role !== 'superadmin' && !Object.values(flow.state.people).some(p => id(p.id) === id(actor._id) && p.role === actor.role))) fail('无本次服务权限', 403);
    return flow;
  }
  async function resolve(taskId, actor) {
    const task = await Task.findById(taskId).lean();
    if (!task) fail('任务不存在', 404);
    if (task.careFlowId) {
      const exists = await Flow.findOne({ _id: task.careFlowId, tenantId: tenant(actor) }).lean();
      if (exists) return view(task.careFlowId, actor);
      if (id(task._id) !== id(task.careFlowId)) fail('流程初始化未完成，请由规划师重试接入');
    }
    if (id(task.assignedTo) !== id(actor._id) && actor.role !== 'superadmin') fail('仅本任务负责人可接入', 403);
    if (!enabled(task.patientId)) fail('该客户未开放本流程', 403);
    if (!await User.findOne({ _id: task.patientId, tenantId: tenant(actor) }).lean()) fail('客户归属不一致',403);
    return { task, unstarted: true };
  }
  async function sync(flow) {
    const latest = await Flow.findOne({ _id: flow._id, tenantId: flow.tenantId }).lean();
    if (!latest || latest.state.sequence !== flow.state.sequence) return;
    const s = flow.state;
    const activeId = hash(`care:${flow._id}:${s.sequence}`);
    const bookedDates = (s.data.booking?.entries || [s.data.booking]).filter(e => e?.status === 'booked' && e.date).map(e => new Date(`${e.date}T${e.time || '09:00'}:00+08:00`)).filter(d => Number.isFinite(+d)).sort((a,b) => a-b);
    const due = !s.returns?.length && s.stage === 'booking' && s.sequence === 0 && s.initialDueAt ? new Date(s.initialDueAt) : !s.returns?.length && s.stage === 'execute' && bookedDates[0] ? bookedDates[0] : new Date();
    if (s.stage !== 'closed') {
      const person = s.people[config.roles[s.stage]];
      if (!person?.id) fail('当前环节缺少负责人');
      await Task.updateOne({ _id: activeId }, { $setOnInsert: { patientId: flow.patientId, staffId: person.id, assignedTo: person.id,
        sourceType: 'annual_service', sourceId: flow._id, sourceAnnualPlanId: flow.annualPlanId, careFlowId: flow._id,
        workflowKey: `care_flow:${s.stage}`, taskRole: 'executor', coordinationGroupId: `care:${flow._id}`, formData: { careFlowSequence: s.sequence },
        theme: `${config.labels[s.stage]}${s.returns?.length ? ' · 退回修订' : ''} · ${s.title}`, status: 'planned', aiStatus: 'approved',
        date: due, remindAt: due, plannedContent: '仅处理本次服务交接；年度方案不覆盖。请打开专用流程查看要求与修订记录。',
      } }, { upsert: true });
    } else {
      const review = s.data.review;
      if (!review?.content || !validDate(review.date)) fail('缺少顾问最终审核的随访计划');
      await Task.updateOne({ _id: hash(`care-followup:${flow._id}`) }, { $setOnInsert: {
        patientId: flow.patientId, staffId: s.people.familyDoctor.id, assignedTo: s.people.healthManager.id,
        sourceType: 'scheduled', sourceId: flow._id, sourceScheduleKey: `care-followup:${flow._id}`,
        theme: `就医后随访 · ${s.title}`, date: new Date(`${review.date}T09:00:00+08:00`), remindAt: new Date(`${review.date}T09:00:00+08:00`),
        content: review.content, plannedContent: review.content, aiStatus: 'approved', status: 'planned',
      } }, { upsert: true });
      // Only the service coordination closes here. Original clinical follow-up and annual plan remain intact.
      await Task.updateOne({ _id: flow._id, careFlowId: flow._id }, { $set: { status: 'completed', completedAt: new Date() } });
      await Flow.updateOne({ _id: flow._id, tenantId: flow.tenantId, 'state.stage': 'closed' }, { $set: { 'state.finalized': true } });
    }
    await Task.updateMany({ careFlowId: flow._id, workflowKey: /^care_flow:/, 'formData.careFlowSequence': { $lt: s.sequence }, status: { $in: ['planned', 'in_progress'] } }, { $set: { status: 'completed', completedAt: new Date() } });
    const after = await Flow.findOne({ _id: flow._id, tenantId: flow.tenantId }).lean();
    if (after && after.state.sequence !== s.sequence) {
      await Task.updateOne({ _id: activeId, careFlowId: flow._id }, { $set: { status: 'completed', completedAt: new Date() } });
    }
  }
  async function start(taskId, actor) {
    const found = await resolve(taskId, actor);
    if (!found.unstarted) { await sync(found); return found; }
    let request = found.task;
    if(require('../../../shared/annualServiceItem.cjs').isAssistance(request)) {
      const candidates=await Task.find({patientId:request.patientId,sourceAnnualPlanId:request.sourceAnnualPlanId,sourceType:'annual_service',workflowKey:'service_request'}).lean();
      const matches=candidates.filter(r=>require('../../../shared/annualServiceItem.cjs').followUpKey(r)===request.sourceScheduleKey);
      if(matches.length!==1)fail('未找到唯一服务需求，请规划师核对');
      request=matches[0];
    }
    if (require('../../../shared/annualDispatch.cjs').isExecution(request)) request = await Task.findById(request.sourceId).lean();
    if (!require('../../../shared/annualDispatch.cjs').isRequest(request) || request.formData?.serviceRequest?.mode !== 'single') fail('本次仅支持年度单项就医协助接入');
    if (request.serviceTracking?.linkId || ['completed', 'cancelled'].includes(request.status)) fail('已承接或已结束的服务不重复接入');
    if (request.status === 'in_progress' && !request.annualDispatch) fail('事项已由原服务流程启动，不能重复接入');
    const patient = await User.findOne({ _id: request.patientId, tenantId: tenant(actor) }).lean();
    if (!patient) fail('客户归属不一致', 403);
    const key = require('../../../shared/annualServiceItem.cjs').followUpKey(request);
    const parents = await Task.find({ patientId: request.patientId, sourceAnnualPlanId: request.sourceAnnualPlanId, sourceType: 'scheduled', sourceScheduleKey: key, status: { $nin: ['cancelled', 'completed'] } }).lean();
    if (parents.length !== 1 || parents[0].deliveryMode !== 'single' || parents[0].serviceTracking?.linkId) fail('未找到唯一未结束的单项顾问事项');
    const parent = parents[0], people = {};
    const requested = { familyDoctor: patient.assignedFamilyDoctor, healthManager: parent.assignedTo, healthPlanner: request.assignedTo, medicalAssistant: request.annualDispatch?.assigneeId || patient.assignedMedicalAssistant };
    for (const [role, personId] of Object.entries(requested)) {
      if (!personId && role === 'medicalAssistant') continue;
      const person = await Admin.findOne({ _id: personId, role, staffStatus: 'active', tenantId: tenant(actor) }).lean();
      if (!person) fail(`客户缺少有效的${({familyDoctor:'健康顾问',healthManager:'健管专员',healthPlanner:'健康规划师'})[role] || '就医专员'}`);
      people[role] = { id: id(person._id), name: person.name, role };
    }
    const stage = request.annualDispatch?.status === 'pending_review' ? 'upload' : request.annualDispatch ? 'execute' : require('../../../shared/annualBookingPlan.cjs').bookingReady(parent.annualBooking) ? 'planner' : 'booking';
    const plan = request.annualDispatch?.advisorPlanText || parent.plannedContent || parent.content;
    const state = { stage, sequence: 0, title: request.formData.serviceRequest.itemSnapshot?.items || request.theme,
      people, returns: [], initialDueAt: parent.remindAt || parent.date || null, data: { advisor: { text: plan }, booking: parent.annualBooking || null, planner: request.annualDispatch || null,
        execute: request.annualDispatch?.result || null, upload: { reportIds: [] } }, sourceScheduleKey: parent.sourceScheduleKey };
    // Claim first; an interrupted start can be retried without reviving the legacy writer.
    const claimed = await Task.updateOne({ _id: request._id, updatedAt: request.updatedAt, 'serviceTracking.linkId': null, status: { $in: ['planned', 'in_progress', 'missed'] } }, { $set: { careFlowId: request._id } });
    if (!claimed.matchedCount) fail('任务已更新，请刷新核对');
    const parentClaim = await Task.updateOne({ _id: parent._id, updatedAt: parent.updatedAt, 'serviceTracking.linkId': null }, { $set: { careFlowId: request._id } });
    if (!parentClaim.matchedCount) fail('预约交接已更新，请刷新后由规划师重试接入');
    const flow = await Flow.findOneAndUpdate({ _id: request._id, tenantId: tenant(actor) }, { $setOnInsert: { patientId: request.patientId, parentId: parent._id,
      annualPlanId: request.sourceAnnualPlanId, revision: 0, state, events: [{ action: 'start', stage, at: new Date(), by: id(actor._id), name: actor.name, sourceSnapshot: state.data }] } }, { upsert: true, new: true }).lean();
    if (request.annualDispatch?.executionId) await Task.updateOne({ _id: request.annualDispatch.executionId, patientId: request.patientId }, { $set: { careFlowId: flow._id } });
    await Task.updateOne({ _id: parent._id }, { $set: { careFlowId: flow._id } });
    await sync(flow); return flow;
  }
  async function reports(flow) {
    const ids = flow.state.data.upload?.reportIds || [];
    const rows = await Report.find({ _id: { $in: ids }, user: flow.patientId, tenantId: flow.tenantId }).lean();
    if (rows.length !== ids.length) fail('关联资料缺失，请退回上传环节补齐');
    return rows;
  }
  async function validate(flow, actor, body) {
    const s = flow.state, input = body.value || {};
    if(s.bookingStale && ['planner','execute'].includes(s.stage)) fail('顾问要求已修订，请定向退回健管预约核对，再直返本环节');
    switch (s.stage) {
      case 'advisor': return { text: text(input.text) };
      case 'booking': return require('./annualBookingReceipt').receipt(input, actor._id, { plannedContent: s.data.advisor.text, sourceScheduleKey: s.sourceScheduleKey });
      case 'planner': {
        const p = await Admin.findOne({ _id: input.assigneeId, role: 'medicalAssistant', staffStatus: 'active', tenantId: flow.tenantId }).lean();
        if (!p) fail('请选择本机构有效就医专员', 400);
        s.people.medicalAssistant = { id: id(p._id), name: p.name, role: p.role };
        return { assigneeId: id(p._id), note: typeof input.note === 'string' ? input.note.slice(0,2000) : '' };
      }
      case 'execute': {
        if (typeof input.text !== 'string' || !input.text.trim()) fail('请填写上方“专家沟通与实际办理结果”后再提交',400);
        const result = text(input.text, 5000), entries = s.data.booking?.entries || [];
        if (input.examinations !== undefined) return { text: result, onsite: require('./careFlowExaminations').examinations(input.examinations, entries, actor._id) };
        const onsite = entries.filter(e => e.mode === 'onsite');
        const outcomes = onsite.map(e => {
          const v = (input.onsite || []).find(v => v.id === e.id);
          if (!v) fail('请逐项填写现场预约结果');
          const receipt = require('./annualBookingReceipt').receipt(v, actor._id, { plannedContent: `医院：${e.hospital}\n科室：${e.department}\n专家：${e.expert}` });
          return { id: e.id, ...receipt };
        });
        return { text: result, onsite: outcomes };
      }
      case 'upload': {
        if (!(s.data.upload?.reportIds || []).length) fail('请先上传本次报告或病历');
        if(!Array.isArray(input.reportIds) || !input.reportIds.length || input.reportIds.some(v => !(s.data.upload.reportIds || []).map(String).includes(String(v)))) fail('请选择本次已上传的有效资料');
        return { reportIds: [...new Set(input.reportIds.map(String))], note: text(input.note, 3000) };
      }
      case 'audit': {
        const rows = await reports(flow);
        if (!rows.length || rows.some(r => r.audit_status !== 'audited')) fail('请先在报告管理中完成每份资料的审核');
        return { note: text(input.note, 5000), reports: rows.map(r => ({ id: id(r._id), title: r.title, checkDate: r.checkDate, hospital: r.hospital, reportItems: r.reportItems, aiSummary: r.aiSummary, audited_at: r.audited_at })) };
      }
      case 'review': {
        if (s.draftStale || !s.data.draft?.content) fail('上游已修订或尚无草稿，请先重新生成随访草稿');
        const rows = await reports(flow);
        if (rows.some(r => r.audit_status !== 'audited')) fail('报告审核状态已变化，请退回核查');
        if (!validDate(input.date) || input.date < new Date().toISOString().slice(0,10)) fail('请填写有效的未来随访日期', 400);
        return { content: text(input.content), date: input.date, note: text(input.note,3000), approvedBy: id(actor._id), approvedAt: new Date() };
      }
      default: fail('当前环节不支持该操作');
    }
  }
  async function action(flowId, actor, body) {
    const flow = await view(flowId, actor);
    if (body.action === 'sync') { await sync(flow); return view(flowId,actor); }
    if (body.revision !== flow.revision) fail('内容已更新，请刷新后核对');
    const payload = { ...body };
    // Check ownership before reading/validating clinical mutations.
    const role = config.roles[flow.state.stage];
    if (actor.role !== 'superadmin' && (actor.role !== role || id(actor._id) !== id(flow.state.people[role]?.id))) fail('仅当前环节负责人可处理',403);
    if (body.action === 'complete') payload.value = await validate(flow,actor,body);
    const result = advance(flow.state, actor, body.action, payload);
    const saved = await Flow.updateOne({ _id: flow._id, tenantId: flow.tenantId, revision: flow.revision }, { $set: { state: result.state }, $inc: { revision: 1 }, $push: { events: result.event } });
    if (!saved.modifiedCount) fail('其他人员已更新本次服务，请刷新');
    const current = await view(flowId,actor); await sync(current);
    return view(flowId,actor);
  }
  return { view, resolve, start, sync, reports, action, models: { Flow, Task, Report } };
}
module.exports = { runtime, hash, validDate };
