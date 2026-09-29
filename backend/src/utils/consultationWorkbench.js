const { responseDueAt } = require('./serviceIntake');
async function consultationTodos(staff, visibleIds, { Lead, Intake }, now = new Date()) {
  const scope = { tenantId: staff.tenantId || null };
  const isSuper = staff.role === 'superadmin';
  const leads = await Lead.find({ ...scope, status: 'new',
    ...(isSuper ? {} : { $or: [{ assignedTo: null }, { assignedTo: staff._id }] }) }).sort({ createdAt: 1 }).lean();
  // Linked service intakes own follow-up reminders, including historical reopened leads.
  const linked = await Intake.find({ ...scope, _id: { $in: leads.map(l => l._id) } }).select('_id').lean();
  const linkedIds = new Set(linked.map(row => String(row._id)));
  const intakes = await Intake.find({ ...scope, status: 'open', ...(isSuper ? {} : { ownerId: staff._id }),
    ...(visibleIds ? { patientId: { $in: visibleIds } } : {}) }).sort({ nextContactAt: 1 }).lean();
  const rows = leads.filter(row => !linkedIds.has(String(row._id))).map(row => ({
    id: `lead_${row._id}`, label: '官网咨询待联系', kind: 'lead',
    name: row.name, summary: row.topic || '服务咨询', consultation: row.summary || '', createdAt: row.createdAt,
    dueAt: responseDueAt(row.createdAt),
    link: `/visitor-leads?workbench=leads&status=${row.status}&itemId=${row._id}`,
  }));
  rows.push(...intakes.map(row => ({ id: `intake_${row._id}`, kind: 'intake', label: '服务承接待跟进', name: '已确认服务需求', createdAt: row.createdAt,
    summary: row.need, dueAt: row.nextContactAt, link: `/visitor-leads?workbench=intakes&status=open&itemId=${row._id}` })));
  return rows.map(row => ({ ...row, overdue: !!row.dueAt && +new Date(row.dueAt) < +now })).sort((a, b) => (a.dueAt ? +new Date(a.dueAt) : Infinity) - (b.dueAt ? +new Date(b.dueAt) : Infinity));
}
module.exports = { consultationTodos };
