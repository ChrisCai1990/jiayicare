const mongoose = require('mongoose');
const Card = require('../models/CardCustody');
const User = require('../models/User');
const ServiceRecord = require('../models/ServiceRecord');
const { patientEditScope } = require('../utils/patientEditScope');
const { prepare } = require('../utils/cardCustody');

module.exports = function mount(router, staffAuth, checkPermission, getVisibleStaffIds) {
  async function access(req, res, next) {
    const staff = req.staff;
    if (!staff.tenantId || !mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: '会员不存在' });
    const visible = staff.role === 'superadmin' ? [] : await getVisibleStaffIds(staff);
    const scope = patientEditScope(staff, visible, id => new mongoose.Types.ObjectId(String(id)));
    if (!await User.exists({ ...scope, _id: req.params.id })) return res.status(403).json({ message: '无权操作该会员' });
    req.cardFilter = { _id: req.params.id, tenantId: staff.tenantId };
    next();
  }
  const path = '/patients/:id/card-custody';
  router.get(path, staffAuth, checkPermission('patients', 'view'), access, async (req, res) => {
    const card = await Card.findOne(req.cardFilter).lean();
    res.json({ success: true, data: card || { state: 'none', revision: 0, history: [] } });
  });
  router.post(path, staffAuth, checkPermission('patients', 'edit'), access, async (req, res) => {
    const previous = await Card.findOne(req.cardFilter).select('state revision current').lean();
    const conflict = () => res.status(409).json({ message: '记录已更新，请刷新后核对' });
    if (req.body.revision !== (previous?.revision || 0)) return conflict();
    let change;
    try { change = prepare(req.body, previous, req.staff); }
    catch (error) { return res.status(400).json({ message: error.message }); }
    const { state, event } = change;
    if (event.action === 'lend' && req.body.serviceId) {
      const service = mongoose.isValidObjectId(req.body.serviceId) && await ServiceRecord.findOne({
        _id: req.body.serviceId, patientId: req.params.id, tenantId: req.staff.tenantId,
      }).select('title date').lean();
      if (!service) return res.status(400).json({ message: '关联服务不存在' });
      event.serviceId = service._id;
      event.serviceLabel = service.title || '服务记录';
    }
    try {
      if (!previous) await Card.create({ ...req.cardFilter, state, current: event, revision: 1, history: [event] });
      else {
        const update = await Card.updateOne({ ...req.cardFilter, revision: previous.revision },
          { $set: { state, current: event }, $inc: { revision: 1 }, $push: { history: event } });
        if (!update.modifiedCount) return conflict();
      }
    } catch (err) { if (err.code === 11000) return conflict(); throw err; }
    res.json({ success: true });
  });
};

module.exports.list = async function list(req, res, filter, isMentor) {
  const views = { active: { $in: ['stored', 'lent'] }, stored: 'stored', lent: 'lent', overdue: 'lent', released: 'released' };
  const mode = req.query.custody;
  if (!req.staff.tenantId || !Object.hasOwn(views, mode)) return res.status(400).json({ message: '无效的台账查询' });
  const tenantId = new mongoose.Types.ObjectId(String(req.staff.tenantId));
  const match = { tenantId, state: views[mode] };
  if (mode === 'overdue') match['current.dueAt'] = { $lt: new Date() };
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const memberFilter = User.find({ ...filter, tenantId }).cast(User);
  const [result] = await Card.aggregate([
    { $match: match },
    { $project: { state: 1, current: 1 } },
    { $lookup: { from: User.collection.name, localField: '_id', foreignField: '_id',
      pipeline: [{ $match: memberFilter }, { $project: { name: 1 } }], as: 'member' } },
    { $unwind: '$member' }, { $sort: { 'current.at': -1, _id: 1 } },
    { $facet: { patients: [{ $skip: (page - 1) * limit }, { $limit: limit }], count: [{ $count: 'total' }] } },
  ]);
  res.json({ success: true, data: { patients: result.patients, total: result.count[0]?.total || 0, isMentor } });
};
