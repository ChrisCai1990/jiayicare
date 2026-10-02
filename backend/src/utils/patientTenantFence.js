const mongoose = require('mongoose');
const { getCurrentTenantId, BYPASS } = require('./tenantScope');

async function patientTenant(patientId) {
  if (!mongoose.isValidObjectId(patientId)) throw new Error('客户 ID 无效');
  const id = new mongoose.Types.ObjectId(String(patientId));
  const patient = await mongoose.connection.db.collection('users').findOne({ _id: id }, { projection: { tenantId: 1 } });
  if (!patient?.tenantId) throw new Error('客户不存在或尚未归属机构');
  const actorTenant = getCurrentTenantId();
  if (actorTenant && actorTenant !== BYPASS && String(actorTenant) !== String(patient.tenantId)) {
    throw new Error('不能写入其他机构客户的记录');
  }
  return patient.tenantId;
}

function patientTenantFence(schema) {
  schema.pre('save', async function () {
    if (!this.isNew && !this.isModified('patientId') && this.tenantId) return;
    const tenantId = await patientTenant(this.patientId);
    if (this.tenantId && String(this.tenantId) !== String(tenantId)) throw new Error('记录与客户机构不一致');
    this.tenantId = tenantId;
  });

  schema.pre('insertMany', function (next, docs) {
    Promise.all(docs.map(async doc => {
      const tenantId = await patientTenant(doc.patientId);
      if (doc.tenantId && String(doc.tenantId) !== String(tenantId)) throw new Error('记录与客户机构不一致');
      doc.tenantId = tenantId;
    })).then(() => next(), next);
  });

  for (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace']) {
    schema.pre(operation, async function () {
      const update = this.getUpdate();
      const patientId = update?.patientId || update?.$set?.patientId || update?.$setOnInsert?.patientId || this.getQuery().patientId;
      if (!this.getOptions().upsert && !update?.patientId && !update?.$set?.patientId) return;
      if (!patientId) throw new Error('新增客户记录必须指定客户');
      const tenantId = await patientTenant(patientId);
      if (update?.tenantId && String(update.tenantId) !== String(tenantId)) throw new Error('记录与客户机构不一致');
      if (this.getOptions().upsert && update && !Array.isArray(update)) {
        update.$setOnInsert = { ...(update.$setOnInsert || {}), tenantId };
        this.setUpdate(update);
      }
    });
  }
}

module.exports = { patientTenantFence };
