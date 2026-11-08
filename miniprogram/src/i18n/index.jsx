import React, { createContext, useContext, useEffect, useState } from 'react';
import Taro from '@tarojs/taro';

const KEY = 'jy_language';
const translations = {
  '首页': 'Home', '健康档案': 'Health Records', '健康管家': 'Care Team', '我的': 'Profile',
  '语言': 'Language', '简体中文': '简体中文', 'English': 'English',
  '用户': 'User', '点击登录 / 注册 ›': 'Log in / Sign up ›', '点击完善个人资料 ›': 'Complete your profile ›',
  '会员类型': 'Membership', '服务天数': 'Service days', '到期日': 'Expires',
  '未开通': 'Not active', '标准会员': 'Standard member', '年度会员': 'Annual membership',
  '半年会员': 'Six-month membership', '季度会员': 'Quarterly membership',
  '健康预防计划': 'Prevention plan', '慢病维稳计划': 'Chronic care plan',
  '健康年轻态计划': 'Healthy aging plan', '健康重塑计划': 'Health reset plan',
  '退出登录': 'Log out', '确定要退出当前账号吗？': 'Are you sure you want to log out?',
  '取消': 'Cancel', '确定退出': 'Log out',
  '账号设置': 'Account settings', '关于与法律': 'About and legal',
  '用户协议': 'Terms of service', '隐私政策': 'Privacy policy', '免责声明': 'Disclaimer',
  '手机号登录': 'Sign in with phone', '手机号验证码登录，新用户自动注册': 'Sign in with a code; new users register automatically',
  '请输入手机号': 'Enter your phone number', '输入验证码': 'Enter verification code',
  '获取验证码': 'Get code', '立即登录': 'Sign in', '或': 'or',
  '暂不登录，先浏览': 'Browse without signing in', '手机号快捷登录': 'Quick phone sign in',
  '可先浏览公开服务；购买或使用个人健康服务时再登录。': 'Browse public services now. Sign in when you purchase or use personal care services.',
  '会员权益': 'Member benefits', '邀请好友': 'Invite a friend', '分享专属邀请链接': 'Share your invitation link',
  '通知设置': 'Notification settings', '账号安全': 'Account security',
  'AI与语音授权': 'AI and voice consent', '本人授权、查看或撤回': 'Manage your consent',
  '帮助与反馈': 'Help and feedback', '健康方案': 'Care plans', '用药管理': 'Medications',
  '营养管理': 'Nutrition', '家庭成员': 'Family members', '我的服务': 'My services',
  '我的订单': 'My orders', '服务商城': 'Services', '消息中心': 'Messages',
  '全部订单 ›': 'All orders ›', '待支付': 'To pay', '待服务': 'Upcoming', '进行中': 'In progress',
  '退款/售后': 'Refunds', '常用功能': 'Quick access', '续约服务': 'Renew',
  '嘉医汇 · 嘉医管家': 'Jiayi Care', '健康有人管，生活更安心': 'Care for your health, peace of mind for life',
  '照顾好今天的你': 'Take care of yourself today', '记录汇总 ›': 'Record summary ›',
  '健康概览暂未更新': 'Health overview is unavailable', '查看已记录的数值与变化': 'View your readings and trends',
  '重试 ›': 'Retry ›', '查看趋势 ›': 'View trends ›', '记录健康数据': 'Record health data',
  '每一次记录，都多一份了解': 'Every record helps you understand your health',
  '近期安排': 'Upcoming care', '查看全部': 'View all', '登录后查看你的健康安排 ›': 'Sign in to see your care plan ›',
  '加载中...': 'Loading...', '暂无健康计划': 'No care plans yet', '我的权益': 'My benefits',
  '查看计划、使用情况与健康基金': 'View plans, usage and health funds',
  '更多健康服务': 'More health services', '全部商城 ›': 'All services ›',
  '健康报告分享 · 访客查看': 'Shared health report · Guest view', '登录/注册': 'Log in / Sign up',
  '报告中的医疗结论保留原文。': 'Medical findings in this report are shown in their original language.',
  '当前健康档案': 'Current health record', '档案工具': 'Record tools',
  '健康数据趋势': 'Health trends', '身体成分': 'Body composition',
  '家庭成员档案加载中…': 'Loading family health record…',
  'IBD · 粪便钙卫蛋白趋势': 'IBD · Fecal calprotectin trend',
  '查看 FC 曲线与检测记录，录入新的检查结果 →': 'View FC trends and results, or add a new result →',
  '暂无身体成分数据': 'No body composition data yet',
  '健康基金': 'Health fund', '自有': 'Personal', '活力': 'Wellness', '奖励': 'Rewards',
  '天': 'days', '岁': 'years old', '男': 'Male', '女': 'Female', '未知': 'Unknown',
  '早上好': 'Good morning', '下午好': 'Good afternoon', '晚上好': 'Good evening',
  '紧急': 'Urgent', '今天': 'Today', '即将': 'Upcoming', '详情 ›': 'Details ›',
  '提醒': 'Reminder', '查看 ›': 'View ›',
  '上传报告': 'Upload report', '拍照或相册': 'Camera or album', '报告记录': 'Reports',
  '查看原始资料': 'View original files', '健康报告': 'Health report', '汇总与趋势': 'Summary and trends',
  '血压': 'Blood pressure', '血糖': 'Blood glucose', '腰围': 'Waist', '睡眠': 'Sleep',
  '心率': 'Heart rate', '体重': 'Weight', '左臂': 'Left arm', '右臂': 'Right arm',
  '未标注': 'Unspecified', '收缩压': 'Systolic pressure', '舒张压': 'Diastolic pressure',
  '体成分体重': 'Body weight', '骨骼肌': 'Skeletal muscle', '体脂率': 'Body fat',
  '内脏脂肪': 'Visceral fat', '未记录': 'Not recorded', '未录入': 'Not entered',
  '健康服务团队': 'Your care team', '服务中': 'Active', '消息与提醒': 'Messages and reminders',
  '待填问卷': 'Questionnaires', '每日关怀': 'Daily care', '系统通知': 'Notifications',
  '健康顾问': 'Health advisor', '健管专员': 'Care coordinator', '健康规划师': 'Health planner',
  '营养师': 'Nutritionist', '就医专员': 'Medical assistant', '副主任医师': 'Associate chief physician',
  '公共营养师': 'Public nutritionist', '专科医师': 'Specialist', '中医师': 'TCM physician',
  '心理咨询师': 'Counselor', '运动复健师': 'Rehabilitation specialist',
  '暂无消息': 'No messages yet', '已加入您的服务团队，可在这里查看沟通与服务消息': 'Joined your care team. View messages here.',
  '开通相应服务后为您配置专属人员': 'Your care team will be assigned after activation',
  '仅对年度会员开放，开通后为您配置专属服务团队': 'Available to annual members after activation',
  '今日健康数据': "Today's health data", '多日快速补录': 'Add past records',
  '按需记录': 'Record as needed', '饮食': 'Meals', '运动': 'Exercise',
  '排便': 'Bowel movement', '饮水': 'Water', '吸烟': 'Smoking', '饮酒': 'Alcohol',
  '情绪': 'Mood', '今天有不适吗？': 'Any symptoms today?',
  '今天已记录不适情况': 'Symptoms recorded today',
  '点击选择症状或描述不适（可选）': 'Select symptoms or describe how you feel (optional)',
  '体型照片 查看与存档 ›': 'Progress photos · View and save ›',
  '消息': 'Messages', '返回': 'Back', '全部': 'All',
  '今日核心指标已完成！保持健康好习惯': 'Core health records complete today. Keep it up!',
  '体型照片': 'Progress photos', '收起': 'Collapse', '查看与存档 ›': 'View and save ›',
  '仅供本人和负责医护进行健康管理对比，不自动判断效果。': 'For comparison by you and your care team only. Photos do not determine treatment results.',
  '所属营养方案': 'Nutrition plan', '暂不关联': 'No plan', '阶段': 'Stage', '角度': 'View',
  '管理前': 'Before', '阶段记录': 'Progress', '管理后': 'After',
  '正面': 'Front', '侧面': 'Side', '背面': 'Back', '拍摄日期': 'Photo date',
  '已选择照片，重新选择': 'Choose another photo', '选择照片': 'Choose photo',
  '我同意存档体型照片用于健康管理对比': 'I agree to save my progress photos for health management comparison',
  '保存中…': 'Saving…', '保存照片': 'Save photo', '历史照片': 'Photo history',
  '暂无照片': 'No photos yet', '未关联方案': 'No plan', '左侧': 'Left', '右侧': 'Right',
  '移除': 'Remove', '移除照片': 'Remove photo', '确认移除这张照片？': 'Remove this photo?',
  '已反馈，待专员核实': 'Submitted, awaiting review', '需要你处理': 'Action needed',
  '就医后提交资料或说明情况': 'Upload documents or describe your visit',
  '查看反馈': 'View response', '提交资料': 'Submit documents',
  '体检报告': 'Medical reports', '所属档案': 'Record owner', '本人': 'Self',
  '搜索报告标题': 'Search report titles', '暂无体检报告': 'No medical reports yet',
  '上传报告后，将按年度和类目自动归类展示': 'Uploaded reports appear by year and category',
  '日期待核对': 'Date to verify', '常见肿瘤筛查': 'Cancer screening',
  '心血管筛查': 'Cardiovascular screening', '脑血管病筛查': 'Cerebrovascular screening',
  '慢性病筛查': 'Chronic disease screening', '其他常规筛查': 'Other routine screening',
  '健康促进筛查': 'Preventive screening', '待审核': 'Pending review',
  '查看原始报告文件': 'View original report', 'AI 趋势分析': 'AI trend analysis',
  '（已审核）': ' (reviewed)', '（待审核）': ' (pending review)',
  '检查项目': 'Test items', '暂无解析数据，请联系健管专员': 'No extracted data. Contact your care coordinator.',
  '检查所见': 'Findings', '诊断意见': 'Diagnostic opinion', '参考范围': 'Reference range',
  '正常': 'Normal', '异常': 'Abnormal', '关注': 'Attention',
  '体成分': 'Body composition', '人体成分分析': 'Body composition analysis',
  '阴道超声': 'Transvaginal ultrasound', '肾功能': 'Kidney function',
};

const LanguageContext = createContext(null);
export const syncTabBarLanguage = language => {
  const labels = language === 'en-US' ? ['Home', 'Records', 'Care Team', 'Profile'] : ['首页', '健康档案', '健康管家', '我的'];
  labels.forEach((text, index) => {
    try { Promise.resolve(Taro.setTabBarItem({ index, text })).catch(() => {}); } catch {}
  });
};

export function LanguageProvider({ children }) {
  const [preference, setPreference] = useState(() => {
    try { return Taro.getStorageSync(KEY) === 'en-US' ? 'en-US' : 'zh-CN'; } catch { return 'zh-CN'; }
  });
  const language = preference;
  const setLanguage = value => {
    const next = value === 'en-US' ? 'en-US' : 'zh-CN';
    setPreference(next);
    try { Taro.setStorageSync(KEY, next); } catch {}
  };
  useEffect(() => {
    syncTabBarLanguage(language);
  }, [language]);
  const t = key => language === 'en-US' ? (translations[key] || key) : key;
  return <LanguageContext.Provider value={{ language, preference, setLanguage, t }}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);
