require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, {
    autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000,
  });
  try {
    const db = mongoose.connection.db;
    const indexes = [
      ['inappservicegroups', { tenantId: 1, patientId: 1 }, { unique: true }],
      ['inappservicegroups', { tenantId: 1, lastMessageAt: -1, createdAt: -1 }, {}],
      ['inappservicegroupmessages', { tenantId: 1, groupId: 1, createdAt: -1 }, {}],
      ['inappservicegroupviews', { tenantId: 1, groupId: 1, viewedAt: -1 }, {}],
    ];
    for (const [collection, keys, options] of indexes) {
      const name = await db.collection(collection).createIndex(keys, options);
      console.log(`${collection}: ${name}`);
    }
  } finally { await mongoose.disconnect(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
