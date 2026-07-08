const { AsyncLocalStorage } = require('async_hooks');
const mongoose = require('mongoose');

// 多租户数据隔离核心：用 AsyncLocalStorage 在一次请求的整个异步调用链里携带当前 tenantId，
// 不用把 tenantId 当参数层层传递到每个路由/查询里，也不会像全局变量一样被并发请求互相污染。
const als = new AsyncLocalStorage();

// 用于"平台超管"或系统内部任务（如定时任务、脚本）需要跨机构查询时的哨兵值
const BYPASS = Symbol('tenantScope:bypass');

// Express中间件：在 staffAuth/auth 等鉴权中间件之后挂载，把当前请求的 tenantId 放进上下文
// req.staff 或 req.user 上没有 tenantId（如未来平台超管角色）时，视为 bypass，不做过滤
function tenantContext(req, res, next) {
  const actor = req.staff || req.user || req.admin;
  const tenantId = actor?.tenantId || null;
  const isPlatformSuper = actor?.role === 'platformSuper'; // 预留：平台超管角色可跨机构查看全部数据
  als.run({ tenantId: isPlatformSuper ? BYPASS : tenantId }, () => next());
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
  const queryMiddlewareNames = ['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'countDocuments', 'updateMany', 'deleteMany'];

  queryMiddlewareNames.forEach(name => {
    schema.pre(name, function () {
      const tenantId = getCurrentTenantId();
      if (tenantId === BYPASS || tenantId === undefined) return; // 平台超管/内部脚本：不加过滤，查全量
      // tenantId 为 null（未登录上下文、或该请求方尚未关联任何机构，如历史遗留数据迁移期）：
      // 同样不强制加 tenantId:null 过滤，避免把"暂未打标"的存量数据（现有嘉医汇数据）意外查漏。
      // 这是有意的宽松策略：第一阶段只做"能力具备"，不做"强制生效"，等存量数据回填 tenantId 后
      // 再收紧为"必须显式指定 tenantId 才能查询"。
      if (!tenantId) return;
      const cond = this.getQuery ? this.getQuery() : this._conditions;
      if (cond.tenantId === undefined) this.where({ tenantId });
    });
  });

  schema.pre('save', function (next) {
    const tenantId = getCurrentTenantId();
    if (tenantId && tenantId !== BYPASS && !this.tenantId) this.tenantId = tenantId;
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
  'familyDoctor',      // 家庭医生
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
  rate: { type: Number, default: 0 }, // 该岗位绩效比例（%，占产品实付价）
  // 可选：产品维度预设的默认服务人（推送时可改）。不设则推送/核销时再指定具体人。
  defaultStaffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
};

module.exports = {
  tenantContext, tenantScopePlugin, getCurrentTenantId, runWithoutTenantScope, BYPASS,
  performanceRuleSchema, servicePerformerRoleSchema, SERVICE_PERFORMER_ROLES,
};
