// SSH-only operator tool: no public endpoint, no reviewer impersonation or publishing.
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
const mongoose = require('mongoose');
const { revisionToken, resubmitRevision } = require('../utils/contentReviewRevision');

async function main() {
  const command = process.argv[2] || 'list';
  if (!['list', 'resubmit', 'status'].includes(command)) throw new Error('命令仅支持 list / resubmit / status');
  await mongoose.connect(process.env.MONGODB_URI);
  const collection = mongoose.connection.collection('contentreviews');
  if (command === 'list') {
    const rows = await collection.find({ status: 'changes_requested' }).sort({ updatedAt: 1 }).toArray();
    console.log(JSON.stringify(rows.map(row => ({ ...row, expectedToken: revisionToken(row) }))));
  } else if (command === 'status') {
    const slug = process.argv[3];
    if (!/^[a-z0-9-]+$/.test(slug || '')) throw new Error('需要稿件 slug');
    const row = await collection.findOne({ slug });
    console.log(JSON.stringify(row ? { slug, status: row.status, currentRole: row.currentRole,
      title: row.title, sourceContent: row.sourceContent, revisions: row.revisions,
      nutritionReview: row.nutritionReview, doctorReview: row.doctorReview, auditLog: row.auditLog } : null));
  } else {
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    if (!/^[a-z0-9-]+$/.test(input.slug || '')) throw new Error('需要稿件 slug');
    const row = await collection.findOne({ slug: input.slug });
    if (!row) throw new Error('稿件不存在');
    console.log(JSON.stringify(await resubmitRevision(collection, row, input)));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
