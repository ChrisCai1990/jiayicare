const Feedback = require('../models/Feedback');
const Admin = require('../models/Admin');
const { STAFF_ROLES } = require('../middleware/staffAuth');

const MANAGER_ROLES = ['superadmin', 'manager'];
const state = row => row.status === 'resolved' ? 'closed' : row.workflowState || 'unassigned';
const fail = (status, message) => { const error = new Error(message); error.status = status; throw error; };
const validId = value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
function text(value, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(400, '请填写有效内容，并检查字数限制');
  return value.trim();
}
function manager(actor) {
  if (!actor?.tenantId || !MANAGER_ROLES.includes(actor.role)) fail(403, '仅本机构管理员可分派和审核反馈');
}
function scope(actor) {
  if (!actor?.tenantId || !actor?._id) fail(403, '账号未归属机构');
  return { tenantId: actor.tenantId };
}
function versionFilter(version) {
  if (!Number.isSafeInteger(version) || version < 0) fail(400, '缺少有效的记录版本，请刷新后重试');
  return version === 0 ? { $or: [{ workflowVersion: 0 }, { workflowVersion: { $exists: false } }] } : { workflowVersion: version };
}
function recordFilter(actor, id, version) {
  if (!validId(id)) fail(400, '反馈编号无效');
  return { ...scope(actor), _id: id, status: 'pending', ...versionFilter(version) };
}
async function update(filter, fields, event) {
  // State, revision and audit event are committed in one atomic document update.
  const row = await Feedback.findOneAndUpdate(filter, {
    $set: fields, $inc: { workflowVersion: 1 }, $push: { workflowHistory: event },
  }, { new: true, runValidators: true }).lean();
  if (!row) fail(409, '记录已更新、已转交或不属于你，请刷新后重试');
  return row;
}
function event(action, actor, note, extra = {}) {
  return { action, actor: actor._id, actorName: actor.name || '', note, at: new Date(), ...extra };
}
async function assign(actor, id, body) {
  manager(actor);
  const filter = recordFilter(actor, id, body.version);
  if (!validId(body.assignedTo)) fail(400, '请选择负责人');
  const note = text(body.note ?? '', 2000);
  const person = await Admin.findOne({ ...scope(actor), _id: body.assignedTo, staffStatus: { $ne: 'inactive' }, role: { $in: STAFF_ROLES } }).select('name').lean();
  if (!person) fail(400, '负责人必须是本机构已启用、可登录医护端的员工');
  return update(filter, { assignedTo: person._id, assignedName: person.name,
    assignedAt: new Date(), assignmentNote: note, workflowState: 'assigned', handlingResult: '', resultAt: null },
  event('assign', actor, note, { assignee: person._id, assigneeName: person.name }));
}
async function submit(actor, id, body) {
  const filter = { ...recordFilter(actor, id, body.version), assignedTo: actor._id, workflowState: 'assigned' };
  const result = text(body.result, 5000, true);
  return update(filter, { handlingResult: result, resultAt: new Date(), workflowState: 'submitted' }, event('submit', actor, result));
}
async function close(actor, id, body) {
  manager(actor);
  const filter = { ...recordFilter(actor, id, body.version), workflowState: 'submitted' };
  const reply = text(body.reply, 5000, true);
  return update(filter, { reply, repliedBy: actor._id, repliedAt: new Date(), status: 'resolved', workflowState: 'closed' }, event('close', actor, reply));
}
async function candidates(actor) {
  manager(actor);
  return Admin.find({ ...scope(actor), staffStatus: { $ne: 'inactive' }, role: { $in: STAFF_ROLES } })
    .select('name title department').sort({ name: 1 }).lean();
}
async function loadTodos(actor) {
  const rows = await Feedback.find({ ...scope(actor), assignedTo: actor._id, status: 'pending', workflowState: 'assigned' })
    .select('type assignedAt assignedTo').lean();
  return rows.map(row => ({ id: 'feedback_' + row._id, type: 'feedback_assigned', label: '用户反馈待处理',
    assignedTo: String(row.assignedTo), priority: 2, summary: `${row.type} · 请处理后提交管理员核对`,
    createdAt: row.assignedAt, overdue: false, link: `/feedback?item=${row._id}` }));
}
const staffFields = 'type content status workflowState workflowVersion assignedName assignedAt assignmentNote handlingResult resultAt reply createdAt updatedAt';
module.exports = { MANAGER_ROLES, state, manager, scope, versionFilter, assign, submit, close, candidates, loadTodos, staffFields };
