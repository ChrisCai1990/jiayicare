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
      if (req.staff.role === 'superadmin') return next();
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

module.exports = checkPermission;
