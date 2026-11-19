const User = require('../models/User');
const Message = require('../models/Message');
const Group = require('../models/InAppServiceGroup');
const Order = require('../models/Order');
const { CHANNELS } = require('./staffPushCore');
const { assignmentFields, canStaffAccess, needsStaffReply } = require('./inAppServiceGroupPolicy');

async function unreadCount(staff) {
  const entry = Object.entries(CHANNELS).find(([, channel]) => channel.role === staff.role);
  let direct = 0;
  if (entry) {
    const [recipient, channel] = entry;
    const patients = await User.find({ tenantId: staff.tenantId, [channel.field]: staff._id }).select('_id').lean();
    direct = await Message.countDocuments({ user: { $in: patients.map(patient => patient._id) },
      type: 'user', recipient, staffReadAt: null, recalled: { $ne: true } });
  }
  const groups = await Group.find({ tenantId: staff.tenantId, status: 'active', memberIds: staff._id,
    lastCustomerMessageAt: { $exists: true } }).select('tenantId patientId status memberIds lastCustomerMessageAt lastStaffMessageAt').lean();
  const patients = await User.find({ _id: { $in: groups.map(group => group.patientId) }, tenantId: staff.tenantId,
    isDeleted: { $ne: true } }).select(`_id tenantId isDeleted ${assignmentFields.join(' ')}`).lean();
  const byId = new Map(patients.map(patient => [String(patient._id), patient]));
  const pendingGroups = groups.filter(group => needsStaffReply(group) &&
    canStaffAccess(group, byId.get(String(group.patientId)), staff)).length;
  let pendingOrders = 0;
  if (staff.role === 'healthPlanner') {
    const ownedPatients = await User.find({ tenantId: staff.tenantId, assignedHealthPlanner: staff._id,
      isDeleted: { $ne: true } }).select('_id').lean();
    pendingOrders = await Order.countDocuments({ user: { $in: ownedPatients.map(patient => patient._id) }, tenantId: staff.tenantId,
      initiationSource: 'customer', paymentStatus: 'paid', status: { $in: ['pending', 'scheduled'] },
      tradeStatus: { $nin: ['closed', 'refunded'] } });
  }
  return Math.min(99, direct + pendingGroups + pendingOrders);
}

module.exports = { unreadCount };
