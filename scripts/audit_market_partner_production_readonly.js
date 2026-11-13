// Run on the production host from backend/ with `node -`. Outputs schema
// counts and product catalog candidates, never credentials or customer records.
const { execFileSync } = require('node:child_process');
const { MongoClient } = require('mongodb');

async function main() {
  const processes = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' }));
  const backend = processes.find(process => process.name === 'jiayicare-backend');
  if (!backend) throw new Error('Production backend process not found');
  const env = backend.pm2_env || {};
  const uri = env.MONGODB_URI || env.env?.MONGODB_URI;
  if (!uri) throw new Error('Production database connection not configured');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  try {
    const db = client.db();
    const tenant = await db.collection('tenants').findOne({ code: 'jiayihui' },
      { projection: { _id: 1 } });
    if (!tenant) throw new Error('Jiayihui tenant not found');
    const names = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map(row => row.name));
    const partnerCollections = ['marketpartners', 'marketpartnerrules', 'marketpartnerattributions',
      'marketpartnercommissions', 'marketpartnerreceipts', 'marketpartnercustomerhistories',
      'teamincentives', 'teamincentiverules'];
    console.log('partner_collections_present=' + partnerCollections.filter(name => names.has(name)).join(','));
    for (const [name, field] of [['orders', 'marketPartnerContractReference'],
      ['refunds', 'marketPartnerOfflineReference']]) {
      const indexes = names.has(name) ? await db.collection(name).listIndexes().toArray() : [];
      console.log(`${name}_${field}_unique_index=` + indexes.some(index => index.unique &&
        Object.hasOwn(index.key, field)));
      console.log(`${name}_${field}_populated_count=` + (names.has(name)
        ? await db.collection(name).countDocuments({ [field]: { $type: 'string' } }) : 0));
    }
    for (const channel of ['wechat_pay', 'offline']) {
      console.log(`${channel}_active_products=` + await db.collection('products').countDocuments({
        tenantId: tenant._id, status: 'on', paymentChannel: channel }));
    }
    const candidates = await db.collection('products').find({ tenantId: tenant._id,
      status: 'on', name: /365|家庭医生|营养|慢病|陪诊|检测|咨询|体重|健康管理|营养素/ },
    { projection: { _id: 1, name: 1, originalPrice: 1, paymentChannel: 1 } })
      .sort({ name: 1 }).limit(50).toArray();
    console.log('candidate_products=' + JSON.stringify(candidates));
    const packages = await db.collection('servicepackages').find({ active: true,
      'activation.enabled': true, 'configuration.membershipTier': 'consumer365' },
    { projection: { _id: 1, name: 1, clientBrand: 1, 'activation.price': 1,
      'activation.durationMonths': 1, 'configuration.includes365': 1 } }).toArray();
    console.log('consumer365_packages=' + JSON.stringify(packages));
    console.log('market_partner_enabled=' + (env.MARKET_PARTNER_ENABLED || env.env?.MARKET_PARTNER_ENABLED || 'unset'));
    console.log('startup_schema_writes_enabled=' + (env.STARTUP_SCHEMA_WRITES_ENABLED || env.env?.STARTUP_SCHEMA_WRITES_ENABLED || 'unset'));
  } finally {
    await client.close();
  }
}

main().catch(error => { console.error('Preflight failed: ' + error.message); process.exitCode = 1; });
