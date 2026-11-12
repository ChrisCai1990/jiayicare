// Run through `node -` in production backend. Reads product and service package
// configuration only; does not access orders or customer information.
const { execFileSync } = require('node:child_process');
const { MongoClient } = require('mongodb');

const inspect = (name, price, rows) => {
  const percent = (rows || []).reduce((sum, row) => sum + Number(row.revenueSharePercent || 0), 0);
  return { name, price: Number(price || 0), percent,
    status: !rows?.length ? 'missing' : Math.abs(percent - 100) < 0.001
      ? 'complete' : 'mismatch' };
};

async function main() {
  const processes = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' }));
  const env = processes.find(row => row.name === 'jiayicare-backend')?.pm2_env || {};
  const uri = env.MONGODB_URI || env.env?.MONGODB_URI;
  if (!uri) throw new Error('Production database connection not configured');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  try {
    const db = client.db();
    const tenant = await db.collection('tenants').findOne({ code: 'jiayihui' }, { projection: { _id: 1 } });
    if (!tenant) throw new Error('Jiayihui tenant not found');
    const products = await db.collection('products').find({ tenantId: tenant._id, status: 'on' },
      { projection: { name: 1, category: 1, originalPrice: 1, paymentChannel: 1,
        servicePrices: 1, businessAllocations: 1 } }).sort({ name: 1 }).toArray();
    const results = products.flatMap(product => (product.servicePrices || []).length
      ? product.servicePrices.map(price => ({ category: product.category || '未分类', channel: product.paymentChannel || '默认',
        ...inspect(`${product.name} / ${price.label || '未命名规格'}`, price.price, price.businessAllocations) }))
      : [{ category: product.category || '未分类', channel: product.paymentChannel || '默认',
        ...inspect(product.name, product.originalPrice, product.businessAllocations) }]);
    const packages = await db.collection('servicepackages').find({ active: true, 'activation.enabled': true },
      { projection: { name: 1, clientBrand: 1, 'activation.price': 1, 'configuration.businessAllocations': 1 } })
      .sort({ name: 1 }).toArray();
    const packageResults = packages.map(row => inspect(`${row.name} [${row.clientBrand || '服务包'}]`,
      row.activation?.price, row.configuration?.businessAllocations));
    const counts = list => ({ total: list.length, complete: list.filter(row => row.status === 'complete').length,
      missing: list.filter(row => row.status === 'missing').length,
      mismatch: list.filter(row => row.status === 'mismatch').length });
    console.log(JSON.stringify({ auditedAt: new Date().toISOString(),
      productionRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      activeProductCount: products.length, products: counts(results), packages: counts(packageResults),
      productIssues: results.filter(row => row.status !== 'complete'),
      packageIssues: packageResults.filter(row => row.status !== 'complete') }));
  } finally { await client.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
