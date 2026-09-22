// Explicit, narrowly authorized template-only update. Never run on startup.
require('dotenv').config({ quiet: true });
const { MongoClient, ObjectId } = require('mongoose').mongo;
const { TARGETS, additions } = require('../src/utils/careQuestionnaire');
(async () => {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  try {
    const collection = client.db().collection('dynamicquestionnaires');
    const planned = [];
    for (const id of Object.keys(TARGETS)) {
      const old = await collection.findOne({ _id: new ObjectId(id), deletedAt: null });
      if (!old) throw new Error('目标问卷不存在');
      planned.push({ old, added: additions(old) });
    }
    for (const { old, added } of planned) {
      if (process.argv.includes('--apply') && added.length) {
        const result = await collection.updateOne({ _id: old._id, title: old.title, questions: old.questions }, { $push: { questions: { $each: added } }, $set: { updatedAt: new Date() } });
        if (result.modifiedCount !== 1) throw new Error('问卷并发变化，停止更新');
      }
      console.log(JSON.stringify({ id: String(old._id), added: added.map(q => q.id), applied: process.argv.includes('--apply') }));
    }
  } finally { await client.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
