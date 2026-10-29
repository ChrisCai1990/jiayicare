const { authorize } = require('./accountDeletionArchiveAccess');
const PENDING = ['requested', 'processing', 'needs_review', 'failed'];
const PROJECTION = { _id: 1, status: 1, requestedAt: 1, completionDays: 1, completedAt: 1 };

async function listDeletionQueue({ actor, query = {}, requests, env = process.env, now = Date.now() }) {
  // Reuse the already configured responsible administrator; never accept a tenant from the URL.
  authorize(actor, env);
  const status = query.status || 'pending';
  if (!['pending', 'completed', 'all', ...PENDING].includes(status)) {
    throw Object.assign(new Error('无效的注销状态'), { status: 400 });
  }
  const page = Number(query.page || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) {
    throw Object.assign(new Error('无效的页码'), { status: 400 });
  }
  const tenant = { tenantId: actor.tenantId };
  const pendingFilter = { ...tenant, status: { $in: PENDING } };
  const filter = status === 'pending' ? pendingFilter : status === 'all' ? tenant : { ...tenant, status };
  const [rows, total, pending] = await Promise.all([
    requests.find(filter, { projection: PROJECTION }).sort({ requestedAt: 1, _id: 1 }).skip((page - 1) * 25).limit(25).toArray(),
    requests.countDocuments(filter), requests.countDocuments(pendingFilter),
  ]);
  return { page, pageSize: 25, total, pending, items: rows.map(row => {
    const start = new Date(row.requestedAt).getTime();
    const days = Number(row.completionDays);
    const due = Number.isFinite(start) && Number.isInteger(days) && days >= 1 && days <= 30
      ? start + days * 86400000 : null;
    // Explicit output fields also prevent accidental disclosure if a DB adapter ignores projection.
    return { id: String(row._id), status: row.status, requestedAt: row.requestedAt,
      dueAt: due === null ? null : new Date(due), completedAt: row.completedAt || null,
      overdue: PENDING.includes(row.status) && due !== null && due < now };
  }) };
}
module.exports = { listDeletionQueue };
