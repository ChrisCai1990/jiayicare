const mongoose = require("mongoose");
const schema = new mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceGroup",
      required: true,
    },
    messageId: { type: String, required: true, maxlength: 200 },
    sender: { type: String, required: true, maxlength: 200 },
    sentAt: { type: Date, required: true },
    sealedText: { type: String, required: true, select: false },
    attachment: {
      name: { type: String, maxlength: 200 },
      ossKey: { type: String, select: false },
      sha256: String,
      mimeType: String,
      size: Number,
    },
    commandKind: { type: String, default: "" },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);
schema.index({ groupId: 1, messageId: 1 }, { unique: true });
// Cleanup first removes the owned staging object, then this row; TTL alone would orphan files.
schema.index({ expiresAt: 1 });
module.exports = mongoose.model("ServiceGroupMessage", schema);
