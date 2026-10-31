require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
  try {
    const cases = mongoose.connection.db.collection('expertconsultationcases');
    const schedule = mongoose.connection.db.collection('staffavailabilities');
    console.log(JSON.stringify({ cases: await cases.createIndex({ tenantId: 1, orderId: 1 }, { unique: true, name: 'tenant_order_unique' }) }));
    console.log(JSON.stringify({ schedule: await schedule.createIndex({ tenantId: 1, staffId: 1, startAt: 1, endAt: 1 }, { name: 'tenant_staff_period' }) }));
  } finally { await mongoose.disconnect(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
