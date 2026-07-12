const StaffRole = require('../models/StaffRole');

// 超管后台"角色管理"页面配置的自定义角色权限(StaffRole.permissions)此前只存数据库、
// 从未被任何接口读取执行——员工选了自定义角色，实际访问不受限制，等同于形同虚设。
// 2026-07-07 排查确认：Admin.customRoleId 早已存在关联字段，前端EmployeePage也早有选择入口，
// 唯独缺这一步执行校验。用中间件方式接入，不动业务代码里 role==='familyDoctor' 这类
// 角色专属逻辑分支（那是业务角色区分，跟"模块开关权限"是两回事）。
//
// 兼容策略：员工没有设置 customRoleId（走固定内置角色，多数老员工）时不做限制，直接放行——
// 自定义角色是叠加的可选限制层，不影响未启用这套功能的员工。superadmin 始终放行。
//
// 用法：router.get('/plans', staffAuth, checkPermission('plans', 'view'), handler)
function checkPermission(moduleKey, action) {
  return async (req, res, next) => {
    try {
      if (req.staff.role === 'superadmin' || req.staff.role === 'platformSuper') return next();
      if (!req.staff.customRoleId) return next();

      const role = await StaffRole.findById(req.staff.customRoleId).select('permissions').lean();
      if (!role) return next(); // 角色被删了，不因数据不一致挡住正常使用

      const allowed = !!role.permissions?.[moduleKey]?.[action];
      if (!allowed) {
        return res.status(403).json({ success: false, message: '当前角色无此操作权限' });
      }
      next();
    } catch (err) {
      // 权限查询本身出错不应该导致整个功能不可用，记录但放行
      console.error('[checkPermission] 权限校验异常：', err.message);
      next();
    }
  };
}

// 健康方案按「方案类型」细分授权：管理员在角色管理里可对某角色关闭某类方案（如只让营养师管营养干预方案）。
// getType(req) 返回本次操作的方案 type（create 从 body.type、edit/delete 从已加载的 plan）。
// 兼容：①superadmin/无自定义角色 放行 ②角色没存过 planTypes（旧角色或该类型键缺失）默认放行，
//        只有管理员显式把某类型设为 false 才拦截——避免升级后老角色突然管不了方案。
// 注意：本函数只管「类型维度」，模块级 view/create/edit/delete 仍由 checkPermission('plans', …) 把关，两者叠加。
function checkPlanType(getType) {
  return async (req, res, next) => {
    try {
      if (req.staff.role === 'superadmin' || req.staff.role === 'platformSuper') return next();
      if (!req.staff.customRoleId) return next();

      const type = typeof getType === 'function' ? getType(req) : null;
      if (!type) return next(); // 拿不到类型时不拦（交由业务层处理）

      const StaffRole = require('../models/StaffRole');
      const role = await StaffRole.findById(req.staff.customRoleId).select('permissions').lean();
      if (!role) return next();

      const planTypes = role.permissions?.plans?.planTypes;
      // 没配置 planTypes（旧角色）或该类型键未显式设置：默认放行
      if (!planTypes || planTypes[type] === undefined) return next();
      if (planTypes[type] === false) {
        return res.status(403).json({ success: false, message: '当前角色无权管理该类型的健康方案' });
      }
      next();
    } catch (err) {
      console.error('[checkPlanType] 权限校验异常：', err.message);
      next();
    }
  };
}

module.exports = checkPermission;
module.exports.checkPlanType = checkPlanType;
