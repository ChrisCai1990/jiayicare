const mongoose = require("mongoose");
const oid = mongoose.Schema.Types.ObjectId;
const schema = new mongoose.Schema(
  {
    groupId: { type: oid, ref: "ServiceGroup", required: true, index: true },
    kind: {
      type: String,
      enum: ["task", "record", "summary", "command", "notification"],
      required: true,
    },
    patientId: { type: oid, ref: "User", default: null },
    title: { type: String, required: true, maxlength: 160 },
    content: { type: String, default: "", maxlength: 20000 },
    sourceText: { type: String, default: "", maxlength: 20000, select: false },
    sourceMessageId: { type: String, default: "" },
    requestKey: { type: String, required: true, maxlength: 100 },
    status: {
      type: String,
      enum: [
        "draft",
        "planned",
        "in_progress",
        "completed",
        "cancelled",
        "confirmed",
      ],
      default: "draft",
    },
    assignedTo: { type: oid, ref: "Admin", required: true },
    dueAt: { type: Date, default: null },
    createdBy: { type: oid, ref: "Admin", required: true },
    confirmedBy: { type: oid, ref: "Admin", default: null },
    confirmedAt: Date,
    nativeId: { type: oid, default: null },
    relatedFollowUpId: { type: oid, ref: "FollowUp", default: null },
    aiGenerated: { type: Boolean, default: false },
    result: { type: String, default: "", maxlength: 20000 },
    suggestions: [
      {
        title: { type: String, maxlength: 160 },
        content: { type: String, maxlength: 2000 },
        sourceQuote: { type: String, maxlength: 2000 },
        _id: false,
      },
    ],
    delivery: {
      type: String,
      enum: ["unsent", "shared", "manually_confirmed"],
      default: "unsent",
    },
    history: [
      {
        at: { type: Date, default: Date.now },
        actor: { type: oid, ref: "Admin" },
        action: String,
        _id: false,
      },
    ],
  },
  { timestamps: true, optimisticConcurrency: true }
);
schema.index({ groupId: 1, requestKey: 1 }, { unique: true });
module.exports = mongoose.model("ServiceGroupEntry", schema);
