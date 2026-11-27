const mongoose = require('mongoose');
const { Schema } = mongoose;
const event = new Schema({
  action: String, at: Date, recordedAt: Date, actorId: Schema.Types.ObjectId, actor: String,
  person: String, location: String, purpose: String, dueAt: Date,
  serviceId: Schema.Types.ObjectId, serviceLabel: String,
}, { _id: false });
const schema = new Schema({
  _id: Schema.Types.ObjectId, // One custody history per patient.
  tenantId: { type: Schema.Types.ObjectId, required: true },
  state: String, revision: Number, current: event, history: [event],
});
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);
schema.index({ tenantId: 1, state: 1, 'current.dueAt': 1 });
module.exports = mongoose.model('CardCustody', schema);
