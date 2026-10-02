// 配置阶段的机构菜单以 Admin 岗位权限为唯一来源。
// 不包含嘉医汇专用入口；未配置或未授予 view 的模块不展示。
export const SETUP_NAV = [
  { label: '工作台', icon: 'home', path: '/home' },
  { label: '家庭服务助手', icon: 'services', path: '/service-assistant', moduleKey: 'service_assistant' },
  { label: '我的会员', icon: 'patients', path: '/patients', moduleKey: 'patients' },
  { label: '随访管理', icon: 'followups', path: '/followups', moduleKey: 'followups' },
  { label: '服务方案', icon: 'plans', path: '/plans', moduleKey: 'plans' },
  { label: '就医资源', icon: 'knowledge', path: '/medical-resource-knowledge', moduleKey: 'medical_resources' },
  { label: '报告管理', icon: 'reports', path: '/reports', moduleKey: 'reports' },
  { label: '服务记录', icon: 'services', path: '/service-records', moduleKey: 'service_records' },
  { label: '科普推送', icon: 'knowledge', path: '/knowledge', moduleKey: 'knowledge' },
  { label: '问卷推送', icon: 'questionnaires', path: '/questionnaires', moduleKey: 'questionnaires' },
  { label: '产品推送', icon: 'products', path: '/products', moduleKey: 'products' },
  { label: '分佣中心', icon: 'commission', path: '/commission', moduleKey: 'commission' },
  { label: '会员营销', icon: 'marketing', path: '/marketing', moduleKey: 'marketing' },
  { label: '官网线索', icon: 'marketing', path: '/visitor-leads', moduleKey: 'leads' },
  { label: '团队管理', icon: 'team', path: '/team', moduleKey: 'team' },
  { label: '运营看板', icon: 'operations', path: '/operations', moduleKey: 'operations' },
  { label: '日常健康数据', icon: 'checkin', path: '/daily-checkin', moduleKey: 'daily_checkin' },
  { label: '消息通知', icon: 'notifications', path: '/notifications' },
  { label: '个人中心', icon: 'profile', path: '/profile' },
]

export function getSetupNav(staff) {
  return SETUP_NAV.filter(item => !item.moduleKey || !!staff?.customPermissions?.[item.moduleKey]?.view)
}
