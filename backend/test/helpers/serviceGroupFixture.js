// In-memory persistence double for route integration tests. Never loads .env or connects to MongoDB/OSS.
const mongoose = require("mongoose");
const id = (n) => n.toString(16).padStart(24, "0");
const ids = {
  staff: id(1),
  other: id(2),
  patient: id(3),
  outsider: id(4),
  tenant: id(5),
  group: id(6),
};
const plain = (x) => (x?.toObject ? x.toObject() : x);
const eq = (a, b) => String(a?._id || a || "") === String(b?._id || b || "");
function matches(row, filter = {}) {
  return Object.entries(filter).every(([k, v]) => {
    if (k === "$or") return v.some((q) => matches(row, q));
    const actual = row[k];
    if (
      v &&
      typeof v === "object" &&
      !(v instanceof mongoose.Types.ObjectId) &&
      !(v instanceof Date)
    ) {
      if ("$in" in v)
        return v.$in.some((x) =>
          Array.isArray(actual) ? actual.some((y) => eq(y, x)) : eq(actual, x)
        );
      if ("$gt" in v) return actual > v.$gt;
    }
    return Array.isArray(actual) ? actual.some((x) => eq(x, v)) : eq(actual, v);
  });
}
function installModel(name) {
  const Model = require("../../src/models/" + name),
    rows = [];
  const prepare = (doc) => {
    doc.save = async function () {
      this.__v = (this.__v || 0) + 1;
      const error = this.validateSync();
      if (error) throw error;
      return this;
    };
    doc.populate = async function () {
      if (name === "ServiceGroup")
        for (const m of this.members) {
          const u = models.User.rows.find((x) => eq(x._id, m.patientId));
          if (u) m.patientId = u;
        }
      return this;
    };
    return doc;
  };
  const query = (filter, single = false) => {
    let limit = Infinity,
      sort;
    const result = () => {
      let found = rows.filter((r) => matches(r, filter));
      if (sort) {
        const [k, d] = Object.entries(sort)[0];
        found.sort((a, b) => (a[k] > b[k] ? d : a[k] < b[k] ? -d : 0));
      }
      found = found.slice(0, limit);
      return single ? found[0] || null : found;
    };
    const q = {
      select() {
        return q;
      },
      sort(v) {
        sort = v;
        return q;
      },
      limit(v) {
        limit = v;
        return q;
      },
      lean() {
        const r = result();
        return Promise.resolve(
          Array.isArray(r) ? r.map(plain) : r ? plain(r) : null
        );
      },
      then(resolve, reject) {
        return Promise.resolve(result()).then(resolve, reject);
      },
    };
    return q;
  };
  Model.find = (f) => query(f);
  Model.findOne = (f) => query(f, true);
  Model.findById = (x) => query({ _id: x }, true);
  Model.create = async (value) => {
    const doc = prepare(new Model(value));
    doc.__v = 0;
    const error = doc.validateSync();
    if (error) throw error;
    if (
      name === "ServiceGroupEntry" &&
      rows.some(
        (r) => eq(r.groupId, doc.groupId) && r.requestKey === doc.requestKey
      )
    )
      throw Object.assign(new Error("duplicate"), { code: 11000 });
    if (
      name === "MedicalReport" &&
      rows.some(
        (r) => eq(r.user, doc.user) && r.sourceSha256 === doc.sourceSha256
      )
    )
      throw Object.assign(new Error("duplicate"), { code: 11000 });
    if (name === 'ServiceGroupReceipt' && rows.some(r=>eq(r.groupId,doc.groupId)&&eq(r.messageId,doc.messageId)))
      throw Object.assign(new Error('duplicate'),{code:11000});
    rows.push(doc);
    return doc;
  };
  Model.updateOne = async (filter, update, options = {}) => {
    let doc = rows.find((r) => matches(r, filter)),
      created = false;
    if (!doc && options.upsert) {
      doc = await Model.create({
        ...filter,
        ...update.$setOnInsert,
        ...update.$set,
      });
      created = true;
    } else if (doc && update.$set) {
      Object.assign(doc, update.$set);
    }
    return { upsertedCount: created ? 1 : 0, modifiedCount: doc ? 1 : 0 };
  };
  Model.findOneAndUpdate = async (filter, update) => {
    const doc=rows.find(r=>matches(r,filter));
    if(!doc)return null;
    Object.assign(doc,update.$set);return doc;
  };
  return {
    Model,
    rows,
    seed: (value) => {
      const doc = prepare(new Model(value));
      doc.__v = 0;
      rows.push(doc);
      return doc;
    },
  };
}
const models = {};
for (const name of [
  "ServiceGroup",
  "ServiceGroupEntry",
  "ServiceGroupMessage",
  "ServiceGroupReceipt",
  "User",
  "Admin",
  "FollowUp",
  "ServiceRecord",
  "MedicalReport",
  "StaffRole",
])
  models[name] = installModel(name);
function buildFixture() {
  for (const v of Object.values(models)) v.rows.length = 0;
  const staff = models.Admin.seed({
    _id: ids.staff,
    name: "测试健管师",
    role: "healthManager",
    tenantId: ids.tenant,
  });
  const other = models.Admin.seed({
    _id: ids.other,
    name: "无权限人员",
    role: "healthManager",
    tenantId: ids.tenant,
  });
  models.User.seed({
    _id: ids.patient,
    name: "演示客户甲",
    phone: "13900000001",
    tenantId: ids.tenant,
    assignedHealthManager: ids.staff,
  });
  models.User.seed({
    _id: ids.outsider,
    name: "其他客户",
    phone: "13900000002",
    tenantId: ids.tenant,
    assignedHealthManager: ids.other,
  });
  models.ServiceGroup.seed({
    _id: ids.group,
    name: "演示家庭服务群",
    tenantId: ids.tenant,
    owner: ids.staff,
    staffIds: [ids.staff],
    members: [{ patientId: ids.patient, relation: "本人" }],
  });
  const authPath = require.resolve("../../src/middleware/staffAuth");
  require.cache[authPath] = {
    id: authPath,
    filename: authPath,
    loaded: true,
    exports: (req, res, next) => {
      if (!req.get("authorization"))
        return res.status(401).json({ message: "请登录" });
      req.staff = req.get("x-test-other") ? other : staff;
      next();
    },
  };
  const oss = require("../../src/utils/oss");
  let uploadCount = 0;
  const stored = new Map();
  oss.uploadBuffer = async (buffer, mime, folder = "reports") => {
    uploadCount++;
    const key = `${folder}/fixture-${uploadCount}.pdf`;
    stored.set(key, buffer);
    return {
      key,
      url: "https://fixture.invalid/report.pdf",
      mimeType: mime,
      size: buffer.length,
    };
  };
  oss.getObjectStream = async (key) => ({
    stream: require("node:stream").Readable.from([stored.get(key)]),
  });
  oss.deleteFile = async () => {};
  oss.getSignedUrl = () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+afoUAAAAASUVORK5CYII=';
  const express = require("express"),
    app = express();
  app.use(
    express.json({
      verify: (req, res, b) => {
        req.rawBody = b.toString();
      },
    })
  );
  delete require.cache[require.resolve("../../src/routes/serviceGroups")];
  app.use(
    "/api/staff/service-groups",
    require("../../src/routes/serviceGroups")
  );
  app.use(
    "/api/integrations/service-groups",
    require("../../src/routes/serviceGroupBridge")
  );
  app.get("/api/staff/me", (req, res) => res.json({ data: staff }));
  app.get("/api/staff/patients", (req, res) =>
    res.json({
      data: {
        patients: models.User.rows.filter((x) =>
          eq(x.assignedHealthManager, ids.staff)
        ),
      },
    })
  );
  app.get("/api/staff/notifications", (req, res) =>
    res.json({ data: { summary: {} } })
  );
  return { app, models, ids, staff, getUploadCount: () => uploadCount };
}
module.exports = { buildFixture, ids };
