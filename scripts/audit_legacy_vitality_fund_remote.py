"""Read-only inventory for legacy points and health fund reclassification."""

import json

from ssh_config import connect


COMMAND = r'''cd /var/www/jiayicare && node <<'NODE'
const fs = require('fs');
const mongoose = require('mongoose');
const crypto = require('crypto');
const env = require('dotenv').parse(fs.readFileSync('backend/.env'));
(async () => {
  await mongoose.connect(env.MONGODB_URI, {autoIndex:false, autoCreate:false, serverSelectionTimeoutMS:10000});
  const db = mongoose.connection.db;
  const hello = await db.admin().command({hello:1});
  const points = db.collection('pointslogs');
  const funds = db.collection('healthfundtransactions');
  const users = db.collection('users');
  const legacyPoints = await points.aggregate([
    {$match:{source:{$in:['checkin','consumption']}}},
    {$group:{_id:{source:'$source', pool:{$ifNull:['$pool','missing']}}, records:{$sum:1}, points:{$sum:'$amount'}, users:{$addToSet:'$user'}}},
    {$project:{_id:1, records:1, points:1, users:{$size:'$users'}}}
  ]).toArray();
  const oldConversions = await funds.aggregate([
    {$match:{type:'grant', source:{$in:['enterprise','promotion']}, remark:/积分自动兑换.*元健康基金/}},
    {$group:{_id:'$status', records:{$sum:1}, amount:{$sum:'$amount'}, users:{$addToSet:'$userId'}}},
    {$project:{_id:1, records:1, amount:1, users:{$size:'$users'}}}
  ]).toArray();
  const vitality = await funds.aggregate([
    {$match:{source:'vitality', status:'active', type:'grant'}},
    {$group:{_id:null, records:{$sum:1}, amount:{$sum:'$amount'}, users:{$addToSet:'$userId'}}},
    {$project:{_id:0, records:1, amount:1, users:{$size:'$users'}}}
  ]).toArray();
  const balances = await users.aggregate([
    {$match:{pointsBalance:{$gt:0}}},
    {$group:{_id:null, users:{$sum:1}, points:{$sum:'$pointsBalance'}}},
    {$project:{_id:0, users:1, points:1}}
  ]).toArray();
  const pointRows = await points.aggregate([
    {$match:{source:{$in:['checkin','consumption']}, pool:{$exists:false}}},
    {$group:{_id:{user:'$user', source:'$source'}, points:{$sum:'$amount'}}}
  ]).toArray();
  const perUser = new Map();
  for (const row of pointRows) {
    const key = String(row._id.user);
    const current = perUser.get(key) || {checkin:0, consumption:0};
    current[row._id.source] = row.points;
    perUser.set(key,current);
  }
  const conversionRows = await funds.aggregate([
    {$match:{type:'grant', status:'active', source:{$in:['enterprise','promotion']}, remark:/积分自动兑换.*元健康基金/}},
    {$group:{_id:'$userId', amount:{$sum:'$amount'}}}
  ]).toArray();
  const overlaps = {checkinOnly:{users:0, checkinPoints:0, convertedYuan:0}, mixed:{users:0, checkinPoints:0, purchasePoints:0, convertedYuan:0}, purchaseOnly:{users:0, purchasePoints:0, convertedYuan:0}, noSource:{users:0, convertedYuan:0}};
  const fundMath = require('./backend/src/utils/healthFundPayment');
  const User = require('./backend/src/models/User');
  const perConvertedUser = [];
  for (const row of conversionRows) {
    const source = perUser.get(String(row._id)) || {checkin:0, consumption:0};
    const bucket = source.checkin > 0 ? (source.consumption > 0 ? overlaps.mixed : overlaps.checkinOnly) : (source.consumption > 0 ? overlaps.purchaseOnly : overlaps.noSource);
    bucket.users++;
    bucket.convertedYuan += row.amount;
    if ('checkinPoints' in bucket) bucket.checkinPoints += source.checkin;
    if ('purchasePoints' in bucket) bucket.purchasePoints += source.consumption;
    const user = await User.findById(row._id).select('healthFundBalance pointsBalance vitalityPointsBalance rewardPointsBalance').lean();
    const [corporateAvailable, vitalityAvailable, personalAvailable] = await Promise.all([
      fundMath.getCorporateFundAvailable(user), fundMath.getVitalityFundAvailable(user), fundMath.getPersonalFundAvailable(user)
    ]);
    const pointFlow = await points.aggregate([
      {$match:{user:row._id}},
      {$project:{source:1,pool:1,amount:1,createdAt:1,kind:{$cond:[{$regexMatch:{input:{$ifNull:['$remark','']},regex:'积分自动兑换'}},'conversion',{$cond:[{$regexMatch:{input:{$ifNull:['$remark','']},regex:'订单取消|退款'}},'refund','other']}]}}},
      {$group:{_id:{source:'$source', pool:{$ifNull:['$pool','missing']}, kind:'$kind'}, records:{$sum:1}, amount:{$sum:'$amount'}, first:{$min:'$createdAt'}, last:{$max:'$createdAt'}}}
    ]).toArray();
    perConvertedUser.push({key:crypto.createHash('sha256').update(String(row._id)).digest('hex').slice(0,8),
      legacyCheckinPoints:source.checkin, legacyPurchasePoints:source.consumption, legacyConversionYuan:row.amount,
      legacyPointsBalance:user.pointsBalance||0, totalFund:user.healthFundBalance||0,
      corporateAvailable, vitalityAvailable, personalAvailable, pointFlow});
  }
  const noConversionCheckinUsers = [];
  const conversionIds = new Set(conversionRows.map(row=>String(row._id)));
  for (const [id, source] of perUser) {
    if (!source.checkin || conversionIds.has(id)) continue;
    const user = await User.findById(id).select('healthFundBalance pointsBalance vitalityPointsBalance rewardPointsBalance').lean();
    noConversionCheckinUsers.push({key:crypto.createHash('sha256').update(id).digest('hex').slice(0,8),
      legacyCheckinPoints:source.checkin, legacyPurchasePoints:source.consumption,
      legacyPointsBalance:user?.pointsBalance||0, totalFund:user?.healthFundBalance||0});
  }
  const migrationBackups = await db.collection('maintenance_backups').find({migrationKey:'legacy-vitality-20261023-v1'}).toArray();
  const migration = [];
  for (const row of migrationBackups) {
    const current = await User.findById(row.userId).select('healthFundBalance pointsBalance vitalityPointsBalance rewardPointsBalance').lean();
    const [corporate, vitality, personal, adjustments] = await Promise.all([
      fundMath.getCorporateFundAvailable(current), fundMath.getVitalityFundAvailable(current), fundMath.getPersonalFundAvailable(current),
      funds.find({userId:row.userId,migrationKey:'legacy-vitality-20261023-v1'}).project({source:1,type:1,amount:1}).toArray()
    ]);
    migration.push({key:crypto.createHash('sha256').update(String(row.userId)).digest('hex').slice(0,8),
      applied:!!row.appliedAt, original:row.original, plan:row.plan,
      actual:{healthFundBalance:current.healthFundBalance,pointsBalance:current.pointsBalance,
        vitalityPointsBalance:current.vitalityPointsBalance,corporateAvailable:corporate,
        vitalityAvailable:vitality,personalAvailable:personal}, adjustments});
  }
  console.log(JSON.stringify({database:{replicaSet:hello.setName||null}, legacyPoints, oldConversions, vitality:vitality[0]||{}, legacyBalances:balances[0]||{}, conversionSourceOverlap:overlaps, perConvertedUser, noConversionCheckinUsers, migration}));
  await mongoose.disconnect();
})().catch(e => {console.error(e.name+': '+e.message); process.exitCode=1});
NODE'''


if __name__ == '__main__':
    client = connect()
    try:
        _, stdout, stderr = client.exec_command(COMMAND, timeout=45)
        output = stdout.read().decode('utf-8')
        error = stderr.read().decode('utf-8')
        if stdout.channel.recv_exit_status():
            raise RuntimeError('Read-only fund audit failed: ' + error[:500])
        print(json.dumps(json.loads(output), ensure_ascii=False, indent=2))
    finally:
        client.close()
