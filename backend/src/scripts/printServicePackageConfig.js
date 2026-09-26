/* eslint-disable no-console */
// Read-only service-package configuration export for operational review.
require('dotenv').config();
const mongoose = require('mongoose');
const ServicePackage = require('../models/ServicePackage');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const rows = await ServicePackage.find({})
    .select('name clientBrand active sortOrder entitlements configuration activation')
    .sort({ clientBrand: 1, sortOrder: 1, name: 1 }).lean();
  console.log(JSON.stringify(rows, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
