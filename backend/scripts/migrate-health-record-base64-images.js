/**
 * Move legacy HealthRecord.extra.imageUrl data URLs to private OSS.
 * Defaults to preview. Apply mode requires an explicit user, limit and confirmation.
 * A record is changed only after its image upload succeeds; failed uploads leave MongoDB untouched.
 */
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || undefined });
const mongoose = require('mongoose');
const HealthRecord = require('../src/models/HealthRecord');
const { uploadBase64, deleteFile } = require('../src/utils/oss');
const { isEmbeddedImage, withoutLegacyImageExtra } = require('../src/utils/healthRecordImages');

const apply = process.argv.includes('--apply');
const arg = name => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
};
const userId = arg('--user');
const requestedLimit = Number(arg('--limit'));
const limit = Number.isFinite(requestedLimit) && requestedLimit >= 1 ? Math.min(Math.floor(requestedLimit), 100) : 0;

if (!mongoose.isValidObjectId(userId)) throw new Error('必须通过 --user 指定有效客户 ID');
if (!limit) throw new Error('必须通过 --limit 指定 1-100 条上限');
if (apply && process.env.MIGRATION_CONFIRM !== 'health-record-base64-to-oss-v1') {
  throw new Error('实际迁移需设置 MIGRATION_CONFIRM=health-record-base64-to-oss-v1');
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const candidates = await HealthRecord.find({
    user: userId,
    'extra.imageUrl': /^data:image\/[a-z0-9.+-]+;base64,/i,
  }).sort({ _id: 1 }).limit(limit).lean();
  const result = { mode: apply ? 'apply' : 'preview', selected: candidates.length, migrated: [], failed: [] };

  for (const record of candidates) {
    const embedded = record.extra?.imageUrl;
    if (!isEmbeddedImage(embedded)) continue;
    const mimeType = embedded.match(/^data:([^;]+);base64,/i)?.[1] || 'image/jpeg';
    const bytes = Buffer.byteLength(embedded, 'utf8');
    if (!apply) {
      result.migrated.push({ recordId: String(record._id), type: record.type, bytes, preview: true });
      continue;
    }

    let stored;
    try {
      stored = await uploadBase64(embedded, mimeType, 'health-records/legacy');
      const existingUrls = record.imageUrls?.length ? record.imageUrls : (record.imageUrl ? [record.imageUrl] : []);
      const nextUrls = [...new Set([...existingUrls, stored.url])];
      const write = await HealthRecord.updateOne(
        { _id: record._id, 'extra.imageUrl': embedded },
        {
          $set: {
            extra: withoutLegacyImageExtra(record.extra),
            imageUrl: nextUrls[0] || stored.url,
            imageUrls: nextUrls,
          },
        },
      );
      if (write.modifiedCount !== 1) throw new Error('record_changed_or_not_updated');
      result.migrated.push({ recordId: String(record._id), type: record.type, bytes, key: stored.key });
    } catch (error) {
      if (stored?.key) await deleteFile(stored.key);
      result.failed.push({ recordId: String(record._id), reason: error.message });
    }
  }

  console.log(JSON.stringify({ ...result, migrated: result.migrated.length, failed: result.failed.length }));
  await mongoose.disconnect();
  if (result.failed.length) process.exitCode = 2;
}

main().catch(error => { console.error(error.message); process.exit(1); });
