// Older custom roles predate the read-only medical resource module. Keep those
// roles able to use the directory until an administrator explicitly denies it.
export function hasModulePermission(staff, moduleKey, action = 'view') {
  if (!moduleKey || !staff?.customPermissions) return true
  const setting = staff.customPermissions[moduleKey]?.[action]
  if (moduleKey === 'medical_resources' && action === 'view' && setting === undefined) return true
  return !!setting
}
