export default defineAppConfig({
  pages: [
    'pages/home/index',
    // 用户可先浏览首页与服务商城；购买、健康档案等需要身份的功能再主动登录。
    'pages/auth/login/index',
    'pages/records/index/index',
    'pages/tasks/index',
    'pages/messages/index',
    'pages/profile/index/index',

    'pages/onboarding/index',
    'pages/checkin/index',
    'pages/records/add/index',
    'pages/records/report/index',
    'pages/records/upload/index',
    'pages/chat/index',
    'pages/medication/index',
    'pages/reminders/index',
    'pages/services/mall/index',
    'pages/services/renewal/index',
    'pages/profile/edit/index',
    'pages/profile/security/index',
    'pages/profile/feedback/index',
    'pages/profile/notifications/index',
    'pages/orders/index',
    'pages/legal/index',
    'pages/common/coming-soon/index',

    'pages/nutrition/index',
    'pages/profile/benefits/index',
    'pages/profile/family/index',
    'pages/questionnaire/index',
    'pages/records/ai-health/index',
    'pages/records/medical-reports/index',
    'pages/records/screening/index',
    'pages/services/plans/index',
    'pages/records/public-report/index',
    'pages/records/profile-archive/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    // 2026-07-19 对齐app端所有页面headerShown:false：隐藏微信原生导航栏，页面自绘标题栏。
    // 胶囊按钮本身无法隐藏（微信平台限制），各页面用 src/hooks/useNavBar.js 计算安全区适配。
    navigationStyle: 'custom',
    backgroundColor: '#F2EDE3',
  },
  tabBar: {
    color: '#8AA89C',
    selectedColor: '#1E6B50',
    backgroundColor: '#FFFFFF',
    borderStyle: 'black',
    // 2026-07-18 对齐app端Tab结构：Home/Records/ReportUpload/Messages/Profile，
    // "随访"已从Tab移除（app端Tasks已改为Stack内独立页，靠首页待办卡片"全部"链接进入）
    list: [
      {
        pagePath: 'pages/home/index',
        text: '首页',
        iconPath: 'assets/tab/home.png',
        selectedIconPath: 'assets/tab/home-active.png',
      },
      {
        pagePath: 'pages/records/index/index',
        text: '健康档案',
        iconPath: 'assets/tab/records.png',
        selectedIconPath: 'assets/tab/records-active.png',
      },
      {
        pagePath: 'pages/chat/index',
        text: '健康规划',
        iconPath: 'assets/tab/report.png',
        selectedIconPath: 'assets/tab/report-active.png',
      },
      {
        pagePath: 'pages/messages/index',
        text: '消息',
        iconPath: 'assets/tab/messages.png',
        selectedIconPath: 'assets/tab/messages-active.png',
      },
      {
        pagePath: 'pages/profile/index/index',
        text: '我的',
        iconPath: 'assets/tab/profile.png',
        selectedIconPath: 'assets/tab/profile-active.png',
      },
    ],
  },
});
