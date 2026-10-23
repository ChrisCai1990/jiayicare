// Read-only by default. Run on the production host with APPLY=1 only after reviewing preview.
// Reclassifies the remaining value of old health-checkin points without changing total funds
// or total points. Old source rows are preserved; paired adjustment rows document the transfer.
const fs = require('fs');
const crypto = require('crypto');
const mongoose = require('mongoose');
const path = require('path');
const env = require('dotenv').parse(fs.readFileSync(path.resolve('.env')));
const { getCorporateFundAvailable, getPersonalFundAvailable, getVitalityFundAvailable } = require('./src/utils/healthFundPayment');
const User = require('./src/models/User');

const KEY = 'legacy-vitality-20261023-v1';
const APPLY = process.env.APPLY === '1';
const marker = 'legacyVitalityMigration20261023';
const oldGrant = { type:'grant', status:'active', source:{$in:['enterprise','promotion']}, remark:/积分自动兑换.*元健康基金/ };
const round = value => Math.round((Number(value) || 0) * 100) / 100;
const fixedId = (userId, kind) => new mongoose.Types.ObjectId(crypto.createHash('sha256').update(`${KEY}:${userId}:${kind}`).digest('hex').slice(0,24));
const anonymous = userId => crypto.createHash('sha256').update(String(userId)).digest('hex').slice(0,8);

async function insertOnce(collection, document) {
  try { await collection.insertOne(document); }
  catch (error) { if (error.code !== 11000) throw error; }
  const actual = await collection.findOne({_id:document._id});
  if (!actual || actual.migrationKey !== KEY || actual.amount !== document.amount || actual.source !== document.source)
    throw new Error(`Migration document conflict: ${document._id}`);
}

async function main() {
  await mongoose.connect(env.MONGODB_URI, {autoIndex:false, autoCreate:false, serverSelectionTimeoutMS:10000});
  const db = mongoose.connection.db;
  const users = db.collection('users');
  const points = db.collection('pointslogs');
  const funds = db.collection('healthfundtransactions');
  const backups = db.collection('maintenance_backups');
  const checkins = await points.aggregate([
    {$match:{source:'checkin', pool:{$exists:false}, amount:{$gt:0}}},
    {$group:{_id:'$user', points:{$sum:'$amount'}, records:{$sum:1}}}
  ]).toArray();
  const summary = {mode:APPLY?'apply':'dry-run', key:KEY, eligible:[], skipped:[], totals:{users:0, pointsMoved:0, fundMoved:0}};
  for (const checkin of checkins) {
    const id = checkin._id;
    const user = await User.findById(id).select('healthFundBalance pointsBalance vitalityPointsBalance rewardPointsBalance').lean();
    if (!user) { summary.skipped.push({key:anonymous(id), reason:'user_missing'}); continue; }
    const backupId = `${KEY}:${id}`;
    let backup = await backups.findOne({_id:backupId});
    if (backup?.appliedAt) {
      summary.skipped.push({key:anonymous(id), reason:'already_applied'});
      continue;
    }
    const [purchaseRows, grantRows, corporateAvailable, vitalityAvailable, personalAvailable] = await Promise.all([
      points.aggregate([{$match:{user:id, source:'consumption', pool:{$exists:false}, amount:{$gt:0}}}, {$group:{_id:null, total:{$sum:'$amount'}}}]).toArray(),
      funds.aggregate([{$match:{userId:id, ...oldGrant}}, {$group:{_id:null, total:{$sum:'$amount'}, count:{$sum:1}}}]).toArray(),
      getCorporateFundAvailable(user), getVitalityFundAvailable(user), getPersonalFundAvailable(user)
    ]);
    const earned = backup?.source.checkinPoints ?? checkin.points;
    const purchased = backup?.source.purchasePoints ?? (purchaseRows[0]?.total || 0);
    const grants = backup?.source.oldConversionYuan ?? (grantRows[0]?.total || 0);
    const legacy = backup?.original.pointsBalance ?? (Number(user.pointsBalance) || 0);
    const movePoints = backup?.plan.movePoints ?? Math.min(earned, legacy);
    const moveFund = backup?.plan.moveFund ?? round((earned - movePoints) / 100);
    const originalCorporate = backup?.original.corporateAvailable ?? round(corporateAvailable);
    const originalTotal = backup?.original.healthFundBalance ?? round(user.healthFundBalance);
    // A mixed legacy balance can still be attributed when all debits predate
    // the first health check-in: those later check-in points have not been spent.
    let checkinUnspent = false;
    if (!grants && purchased > 0 && legacy !== earned + purchased) {
      const firstCheckin = await points.find({user:id, source:'checkin', pool:{$exists:false}})
        .sort({createdAt:1}).limit(1).next();
      if (firstCheckin && legacy >= earned) {
        checkinUnspent = !(await points.countDocuments({user:id, amount:{$lt:0},
          createdAt:{$gte:firstCheckin.createdAt}, migrationKey:{$ne:KEY}}));
      }
    }
    const row = {key:anonymous(id), checkinPoints:earned, purchasePoints:purchased, oldConversionYuan:grants,
      legacyPoints:legacy, totalFund:round(user.healthFundBalance), corporateAvailable:round(corporateAvailable),
      vitalityAvailable:round(vitalityAvailable), personalAvailable:round(personalAvailable),
      checkinUnspent, movePoints, moveFund};
    let reason = '';
    if (!Number.isSafeInteger(earned) || !Number.isSafeInteger(legacy) || earned <= 0 || legacy < 0) reason='invalid_points';
    else if (!grants && purchased > 0 && legacy !== earned + purchased && !checkinUnspent) reason='mixed_points_unreconciled';
    else if (moveFund > grants + 0.001) reason='fund_exceeds_old_conversion';
    else if (moveFund > originalCorporate + 0.001) reason='insufficient_corporate_fund';
    else if (moveFund > originalTotal + 0.001) reason='insufficient_total_fund';
    else if (movePoints === 0 && moveFund === 0) reason='nothing_to_move';
    if (reason) { summary.skipped.push({...row, reason}); continue; }
    summary.eligible.push(row);
    summary.totals.users++;
    summary.totals.pointsMoved += movePoints;
    summary.totals.fundMoved = round(summary.totals.fundMoved + moveFund);
    if (!APPLY) continue;

    if (!backup) {
      const original = {pointsBalance:legacy, vitalityPointsBalance:Number(user.vitalityPointsBalance)||0,
        rewardPointsBalance:Number(user.rewardPointsBalance)||0, healthFundBalance:round(user.healthFundBalance),
        corporateAvailable:round(corporateAvailable), vitalityAvailable:round(vitalityAvailable), personalAvailable:round(personalAvailable)};
      const candidate = {_id:backupId, migrationKey:KEY, userId:id, createdAt:new Date(),
        reason:'历史健康记录积分转活力基金与活力积分；基金和积分总额不变', original,
        source:{checkinPoints:earned, purchasePoints:purchased, oldConversionYuan:grants, checkinRecords:checkin.records},
        plan:{movePoints, moveFund}};
      try { await backups.insertOne(candidate); backup=candidate; }
      catch(error) { if(error.code!==11000) throw error; backup=await backups.findOne({_id:backupId}); }
    }
    if (!backup || backup.plan.movePoints !== movePoints || backup.plan.moveFund !== moveFund)
      throw new Error(`Backup plan differs: ${row.key}`);
    const current = await users.findOne({_id:id});
    if (!current[marker]) {
      if ((Number(current.pointsBalance)||0) !== backup.original.pointsBalance
        || round(current.healthFundBalance) !== backup.original.healthFundBalance)
        throw new Error(`Balance changed since backup: ${row.key}`);
      const fundField = Object.prototype.hasOwnProperty.call(current,'healthFundBalance')
        ? current.healthFundBalance : {$exists:false};
      const pointsField = Object.prototype.hasOwnProperty.call(current,'pointsBalance')
        ? current.pointsBalance : {$exists:false};
      const changed = await users.updateOne({_id:id, [marker]:{$exists:false},
        pointsBalance:pointsField, healthFundBalance:fundField},
      {$inc:{pointsBalance:-movePoints, vitalityPointsBalance:movePoints}, $set:{[marker]:KEY}});
      if (changed.modifiedCount !== 1) throw new Error(`Balance changed since preview: ${row.key}`);
    }
    const now = new Date();
    if (movePoints) {
      await insertOnce(points, {_id:fixedId(id,'legacy-points'), user:id, source:'adjust', pool:'legacy',
        amount:-movePoints, refType:'HealthFund', refId:null, migrationKey:KEY,
        remark:'历史健康记录积分转入活力积分', createdAt:now, updatedAt:now});
      await insertOnce(points, {_id:fixedId(id,'vitality-points'), user:id, source:'adjust', pool:'vitality',
        amount:movePoints, refType:'HealthFund', refId:null, migrationKey:KEY,
        remark:'历史健康记录积分转入活力积分', createdAt:now, updatedAt:now});
    }
    if (moveFund) {
      await insertOnce(funds, {_id:fixedId(id,'vitality-fund'), userId:id, type:'adjustment', source:'vitality',
        amount:moveFund, balanceAfter:backup.original.healthFundBalance, status:'active', migrationKey:KEY,
        remark:'历史健康记录积分兑换基金转入活力基金', createdAt:now, updatedAt:now});
      await insertOnce(funds, {_id:fixedId(id,'corporate-fund'), userId:id, type:'adjustment', source:'enterprise',
        amount:-moveFund, balanceAfter:backup.original.healthFundBalance, status:'active', migrationKey:KEY,
        remark:'历史健康记录积分兑换基金转出奖励基金', createdAt:now, updatedAt:now});
    }
    const verified = await User.findById(id).select('healthFundBalance pointsBalance vitalityPointsBalance rewardPointsBalance').lean();
    const [corporateAfter, vitalityAfter, personalAfter] = await Promise.all([
      getCorporateFundAvailable(verified), getVitalityFundAvailable(verified), getPersonalFundAvailable(verified)
    ]);
    if (round(verified.healthFundBalance) !== backup.original.healthFundBalance
      || (Number(verified.pointsBalance)||0) + (Number(verified.vitalityPointsBalance)||0)
          !== backup.original.pointsBalance + backup.original.vitalityPointsBalance
      || round(corporateAfter) !== round(backup.original.corporateAvailable - moveFund)
      || round(vitalityAfter) !== round(backup.original.vitalityAvailable + moveFund)
      || round(personalAfter) !== backup.original.personalAvailable)
      throw new Error(`Post-migration reconciliation failed: ${row.key} ${JSON.stringify({
        original:backup.original, plan:backup.plan,
        actual:{healthFundBalance:verified.healthFundBalance, pointsBalance:verified.pointsBalance,
          vitalityPointsBalance:verified.vitalityPointsBalance, corporateAvailable:corporateAfter,
          vitalityAvailable:vitalityAfter, personalAvailable:personalAfter}
      })}`);
    await backups.updateOne({_id:backupId}, {$set:{appliedAt:new Date(), verified:{
      pointsBalance:verified.pointsBalance, vitalityPointsBalance:verified.vitalityPointsBalance,
      healthFundBalance:verified.healthFundBalance, corporateAvailable:round(corporateAfter),
      vitalityAvailable:round(vitalityAfter), personalAvailable:round(personalAfter)}}});
  }
  console.log(JSON.stringify(summary));
  await mongoose.disconnect();
}

main().catch(error => {console.error(error.stack||error.message); process.exitCode=1; mongoose.disconnect().catch(()=>{});});
