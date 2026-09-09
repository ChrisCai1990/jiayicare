const mongoose = require("mongoose");
const oid = mongoose.Schema.Types.ObjectId;
const schema = new mongoose.Schema(
  {
    tenantId: { type: oid, default: null },
    name: { type: String, required: true, maxlength: 120 },
    chatId: { type: String, default: "" },
    owner: { type: oid, ref: "Admin", required: true },
    staffIds: [{ type: oid, ref: "Admin" }],
    members: [
      {
        patientId: { type: oid, ref: "User", required: true },
        relation: { type: String, maxlength: 40 },
        _id: false,
      },
    ],
    archiveConsent: { type: Boolean, default: false },
    lastMessageAt: Date,
    aiConsent: { type: Boolean, default: false },
    revisions: [
      {
        at: { type: Date, default: Date.now },
        actor: { type: oid, ref: "Admin" },
        action: String,
      },
    ],
  },
  { timestamps: true, optimisticConcurrency: true }
);
schema.index(
  { tenantId: 1, chatId: 1 },
  { unique: true, partialFilterExpression: { chatId: { $gt: "" } } }
);
schema.index({ tenantId: 1, staffIds: 1 });
module.exports = mongoose.model("ServiceGroup", schema);
