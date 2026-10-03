const humanTypes = new Set(['doctor', 'manager', 'planner', 'nutritionist', 'medicalAssistant']);
function eligible(message) {
  return !!message && humanTypes.has(message.type) && message.unread === true
    && !message.recalled && !message.isAI && !message.aiGenerated
    && !['draft', 'pending', 'rejected'].includes(message.aiReviewStatus);
}
function createNativePushDispatch({ enabled, Job, Message, User, registry, transport, unreadCount = async () => 0, now = () => new Date() }) {
  return {
    async enqueue(message) {
      if (!enabled() || !eligible(message)) return;
      await Job.updateOne({ _id: String(message._id) }, { $setOnInsert: {
        messageId: message._id, state: 'pending', attempts: 0, dueAt: now(),
        expiresAt: new Date(now().getTime() + 24 * 60 * 60 * 1000),
      } }, { upsert: true });
    },
    async tick() {
      if (!enabled()) return;
      const current = now();
      const job = await Job.findOneAndUpdate({
        expiresAt: { $gt: current }, dueAt: { $lte: current }, attempts: { $lt: 3 },
        $or: [{ state: 'pending' }, { state: 'working', leaseUntil: { $lte: current } }],
      }, { $set: { state: 'working', leaseUntil: new Date(current.getTime() + 120000) }, $inc: { attempts: 1 } }, { new: true });
      if (!job) return;
      try {
        const message = await Message.findById(job.messageId).lean();
        if (eligible(message)) {
          const user = await User.findById(message.user).lean();
          const count = user && !user.isDeleted ? await unreadCount(user._id) : 0;
          // Fresh session lookup for each attempt, never reuse a cached recipient list.
          for (const device of await registry.destinations(user)) {
            if (!enabled()) break;
            await transport.send({ token: device.token, messageId: String(message._id), count });
          }
        }
        await Job.updateOne({ _id: job._id, attempts: job.attempts }, { $set: { state: 'done', leaseUntil: null } });
      } catch {
        await Job.updateOne({ _id: job._id, attempts: job.attempts }, { $set: {
          state: job.attempts >= 3 ? 'failed' : 'pending', leaseUntil: null,
          dueAt: new Date(now().getTime() + 30000 * job.attempts),
        } });
      }
    },
  };
}
module.exports = { createNativePushDispatch, eligible };
