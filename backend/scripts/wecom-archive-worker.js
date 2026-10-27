require('dotenv').config();
const guard = require('../src/utils/accountDeletionStartupGuard');
guard.assertStartupAllowed();
const mongoose = require('mongoose');
async function main() {
  if (process.env.SERVICE_GROUP_ARCHIVE_ENABLED !== 'true' || process.env.WECOM_ARCHIVE_COLLECTOR_ENABLED !== 'true') throw Error('collector_disabled');
  for (const key of ['WECOM_CORP_ID', 'WECOM_ARCHIVE_SECRET', 'SERVICE_GROUP_BRIDGE_SECRET', 'SERVICE_GROUP_MESSAGE_KEY', 'MONGODB_URI']) if (!process.env[key]) throw Error('collector_config_missing');
  mongoose.set('autoIndex', false);
  mongoose.set('autoCreate', false);
  await mongoose.connect(process.env.MONGODB_URI);
  await guard.verifyRestoredDatabase({db:mongoose.connection.db,objectId:id=>new mongoose.Types.ObjectId(id)});
  const { tick } = require('../src/utils/wecomArchiveCollector');
  let stopping = false;
  process.on('SIGTERM', () => { stopping = true; });
  process.on('SIGINT', () => { stopping = true; });
  while (!stopping) {
    try { await tick(); } catch (e) { console.error('[wecom-archive]', e.message); }
    try { await require('../src/utils/groupProfessionalDraft').refreshProfessionalDraft(); } catch { console.error('[wecom-archive] draft_refresh_failed'); }
    if (process.argv.includes('--once')) break;
    await new Promise(resolve => setTimeout(resolve, 15000));
  }
  await mongoose.disconnect();
}
main().catch(() => { console.error('[wecom-archive] worker_start_failed'); process.exitCode = 1; });
