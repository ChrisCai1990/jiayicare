const { AsyncLocalStorage } = require('async_hooks');
const mongoose = require('mongoose');

// 多租户数据隔离核心：用 AsyncLocalStorage 在一次请求的整个异步调用链里携带当前 tenantId，
// 不用把 tenantId 当参数层层传递到每个路由/查询里，也不会像全局变量一样被并发请求互相污染。
const als = new AsyncLocalStorage();

// 用于"平台超管"或系统内部任务（如定时任务、脚本）需要跨机构查询时的哨兵值
const BYPASS = Symbol('tenantScope:bypass');

function changesTenantId(update, tenantId) {
  if (!update) return false;
  if (Array.isArray(update)) return update.some(stage => /"tenantId(?:\.[^"]*)?"\s*:/.test(JSON.stringify(stage)));
  if (Object.prototype.hasOwnProperty.call(update, 'tenantId')) return true;
  return Object.entries(update).some(([operator, fields]) => operator.startsWith('$') &&
    fields && typeof fields === 'object' && Object.entries(fields).some(([field, value]) => {
      if (field !== 'tenantId' && !field.startsWith('tenantId.')) return false;
      return !(operator === '$setOnInsert' && field === 'tenantId' && String(value) === String(tenantId));
    }));
}

// Express中间件：在 staffAuth/auth 等鉴权中间件之后挂载，把当前请求的 tenantId 放进上下文
// 历史未标机构的账号只能访问历史未标机构数据；平台超管可看汇总。
function tenantContext(req, res, next) {
  const actor = req.staff || req.user || req.admin;
  const tenantId = actor?.tenantId || null;
  const isPlatformSuper = actor?.role === 'platformSuper';
  als.run({ tenantId: isPlatformSuper || !actor ? BYPASS : tenantId }, () => require('./aiBudget').withAiContext({ actorId: actor?._id ? String(actor._id) : '', tenantId: tenantId ? String(tenantId) : '' }, next));
}

function getCurrentTenantId() {
  const store = als.getStore();
  return store ? store.tenantId : null;
}

// 供内部脚本/定时任务临时以"跨机构"身份执行一段逻辑（如夜间巡检、跨机构统计）
function runWithoutTenantScope(fn) {
  return als.run({ tenantId: BYPASS }, fn);
}

// Mongoose 插件：挂载到需要按机构隔离的 Schema 上，自动在 find/findOne/findById/count/update 等
// 查询前注入 tenantId 过滤条件；写入（save/create）前自动补上当前 tenantId
function tenantScopePlugin(schema) {
  const queryMiddlewareNames = [
    'find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace',
    'countDocuments', 'distinct', 'updateOne', 'updateMany', 'replaceOne', 'deleteOne', 'deleteMany',
  ];

  queryMiddlewareNames.forEach(name => {
    schema.pre(name, function () {
      const tenantId = getCurrentTenantId();
      if (!als.getStore() || tenantId === BYPASS) return;
      if (name === 'replaceOne' || name === 'findOneAndReplace') {
        throw new Error('机构业务请求不能整体替换记录');
      }
      // The filter alone cannot protect ownership if an update moves a document
      // to another tenant. Keep tenantId immutable for authenticated requests.
      const update = typeof this.getUpdate === 'function' ? this.getUpdate() : null;
      if (changesTenantId(update, tenantId)) {
        throw new Error('机构归属不可通过业务请求修改');
      }
      // A caller-supplied tenantId must never disable the authenticated tenant
      // boundary. Mongoose merges this into the query, replacing any foreign
      // tenantId that came from a route parameter or request body.
      this.where({ tenantId: tenantId || null });
    });
  });

  schema.pre('aggregate', function () {
    const tenantId = getCurrentTenantId();
    if (!als.getStore() || tenantId === BYPASS) return;
    const pipeline = this.pipeline();
    const firstStageMustRemainFirst = pipeline[0]?.$geoNear || pipeline[0]?.$search || pipeline[0]?.$vectorSearch;
    pipeline.splice(firstStageMustRemainFirst ? 1 : 0, 0, { $match: { tenantId: tenantId || null } });
  });

  schema.pre('save', function (next) {
    const tenantId = getCurrentTenantId();
    if (tenantId && tenantId !== BYPASS) {
      if (this.tenantId && String(this.tenantId) !== String(tenantId)) return next(new Error('不能保存其他机构的数据'));
      this.tenantId = tenantId;
    }
    next();
  });

  schema.pre('insertMany', function (next, docs) {
    const tenantId = getCurrentTenantId();
    if (tenantId && tenantId !== BYPASS) {
      for (const doc of docs) {
        if (doc.tenantId && String(doc.tenantId) !== String(tenantId)) return next(new Error('不能写入其他机构的数据'));
        doc.tenantId = tenantId;
      }
    }
    next();
  });
}

// 绩效分配规则字段片段：挂在定价类模型（Product/Service/ServiceItem等）上，供后续"自动分配绩效"功能使用。
// 目前只做字段占位——"谁是引流人/谁是服务人"的识别方式和自动分配触发链路待设计明确后再接入，
// 现在先统一好每个产品/服务自身携带的规则结构，避免后续每个模型分别改一遍。
const performanceRuleSchema = {
  ruleType:        { type: String, enum: ['none', 'percentage', 'fixedAmount'], default: 'none' },
  referrerRate:    { type: Number, default: 0 },   // 引流人比例（%）
  fulfillerRate:   { type: Number, default: 0 },   // 服务人比例（%）
  referrerAmount:  { type: Number, default: 0 },   // 引流人固定金额
  fulfillerAmount: { type: Number, default: 0 },   // 服务人固定金额
};

// 服务岗位枚举：一个产品可能由多个岗位协同提供服务（如"轻享健康管理"涉及家医+营养师+AI）。
// 与 Admin.role 的一线岗位保持一致，供多服务人员绩效分配使用。
const SERVICE_PERFORMER_ROLES = [
  'familyDoctor',      // 健康顾问
  'nutritionist',      // 营养师
  'healthManager',     // 健管专员
  'medicalAssistant',  // 就医专员
  'psychologist',      // 心理咨询师
  'rehabSpecialist',   // 运动复健师
  'specialist',        // 专科医师
  'tcmDoctor',         // 中医师
];

// 多服务岗位绩效配置：产品维度配置"这个产品由哪些岗位提供服务，每岗位绩效占产品实付价的百分比"。
// 具体是哪个人由推送/核销时指定（fulfillerId 按岗位落到具体员工），比例来自这里（个人比例可再覆盖，
// 见 Admin.personalPerformanceRule）。比例制为主：rate 为占产品实付价的百分比。
const servicePerformerRoleSchema = {
  role: { type: String, enum: SERVICE_PERFORMER_ROLES, required: true },
  ruleType: { type: String, enum: ['none', 'percentage', 'fixedAmount'], default: 'percentage' },
  rate: { type: Number, default: 0 }, // 该岗位绩效比例（%，占产品实付价）
  amount: { type: Number, default: 0 }, // 该岗位固定绩效金额（元）
  // 可选：产品维度预设的默认服务人（推送时可改）。不设则推送/核销时再指定具体人。
  defaultStaffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
};

module.exports = {
  tenantContext, tenantScopePlugin, getCurrentTenantId, runWithoutTenantScope, BYPASS,
  performanceRuleSchema, servicePerformerRoleSchema, SERVICE_PERFORMER_ROLES,
};
