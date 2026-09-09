// Only copies owned by this feature are eligible; archived MedicalReport objects use reports/.
async function cleanExpiredMessages() {
  const Message = require("../models/ServiceGroupMessage");
  const { getClient } = require("./oss");
  const rows = await Message.find({ expiresAt: { $lt: new Date() } })
    .select("+attachment.ossKey")
    .limit(100);
  for (const row of rows) {
    if (row.attachment?.ossKey) {
      if (!row.attachment.ossKey.startsWith("service-group-staging/")) continue;
      // Do not remove metadata if OSS deletion failed; retry at the next run.
      await getClient().delete(row.attachment.ossKey);
    }
    await Message.deleteOne({ _id: row._id });
  }
}
function startServiceGroupCleanup() {
  if (process.env.SERVICE_GROUP_ARCHIVE_ENABLED !== "true") return;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await cleanExpiredMessages();
    } catch {
      console.error("[service-groups] staging cleanup failed; will retry");
    } finally {
      running = false;
    }
  };
  const timer = setInterval(run, 3600000);
  timer.unref();
  run();
}
module.exports = { cleanExpiredMessages, startServiceGroupCleanup };
