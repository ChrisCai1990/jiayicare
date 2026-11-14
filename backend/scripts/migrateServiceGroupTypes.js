const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { inferLegacyType } = require('../src/utils/serviceGroupTypes');
async function migrate(db, backupDir) {
 const groups = db.collection('inappservicegroups');
 const rows = await groups.find({ serviceType: { $exists: false } }).toArray();
 const indexes = await groups.indexes();
 fs.mkdirSync(backupDir, { recursive: true });
 const backup = path.join(backupDir, `group-types-${Date.now()}.json`);
 fs.writeFileSync(backup, JSON.stringify({ indexes, groups: rows.map(g => ({ _id:g._id, tenantId:g.tenantId, patientId:g.patientId, memberIds:g.memberIds })) }));
 const counts = {};
 for (const group of rows) {
  const patient = await db.collection('users').findOne({ _id:group.patientId,tenantId:group.tenantId });
  const serviceType = inferLegacyType(group,patient);
  await groups.updateOne({ _id:group._id,serviceType:{$exists:false} },{$set:{serviceType}});
  counts[serviceType]=(counts[serviceType]||0)+1;
 }
 await groups.createIndex({tenantId:1,patientId:1,serviceType:1},{unique:true,partialFilterExpression:{status:'active'},name:'one_active_service_type'});
 const old = indexes.find(i=>i.unique && Object.keys(i.key).length===2 && i.key.tenantId===1 && i.key.patientId===1);
 if(old) await groups.dropIndex(old.name);
 return {backup,classified:counts,indexes:(await groups.indexes()).map(i=>({name:i.name,key:i.key,unique:i.unique,partialFilterExpression:i.partialFilterExpression}))};
}
if(require.main===module){require('dotenv').config();mongoose.set('autoIndex',false);mongoose.set('autoCreate',false);(async()=>{await mongoose.connect(process.env.MONGODB_URI);console.log(JSON.stringify(await migrate(mongoose.connection.db,process.env.GROUP_TYPES_BACKUP_DIR || '/var/backups/jiayicare-service-group-types')));await mongoose.disconnect();})().catch(e=>{console.error(e.message);process.exitCode=1});}
module.exports={migrate};
