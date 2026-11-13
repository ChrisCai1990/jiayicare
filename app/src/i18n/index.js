import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'jy_language';
const translations = {
  '首页': 'Home', '健康档案': 'Health Records', '健康管家': 'Care Team', '随访': 'Follow-ups', '消息': 'Messages', '我的': 'Profile',
  '语言': 'Language', '简体中文': '简体中文', 'English': 'English',
  '退出登录': 'Log out', '确定要退出当前账号吗？': 'Are you sure you want to log out?', '取消': 'Cancel', '确定退出': 'Log out',
  '用户': 'User', '健康评分': 'Health score', '服务天数': 'Service days', '本月记录': 'Records this month',
  '家庭成员': 'Family members', '添加': 'Add', '添加成员': 'Add member', '健康管理': 'Health management',
  '查看全部': 'View all', '体检报告': 'Medical reports', '用药记录': 'Medication records', '提醒管理': 'Reminders',
  '我的服务': 'My services', '我的订单': 'My orders', '服务群组': 'Care group', '即将开放': 'Coming soon',
  '预约随访': 'Book a follow-up', '服务商城': 'Services', '评价服务': 'Rate a service',
  '账号设置': 'Account settings', '编辑资料': 'Edit profile', '消息通知': 'Notifications',
  '账号安全': 'Account security', '帮助与反馈': 'Help and feedback', '关于与法律': 'About and legal',
  '用户协议': 'Terms of service', '隐私政策': 'Privacy policy', '免责声明': 'Disclaimer',
  '已全部关闭': 'All off', '已开启': 'On', '续约': 'Renew', '开通专属服务包': 'Choose a care plan',
  '获得健康顾问跟进、健管服务与专属权益': 'Get follow-ups, health services and member benefits',
  '了解详情': 'Learn more', '嘉医管家': 'Jiayi Care', '您的数字化健康管理服务平台': 'Your digital health management platform',
  '手机号登录': 'Sign in with phone', '新用户自动注册，无需等待': 'New users are registered automatically',
  '请输入手机号': 'Enter your phone number', '输入验证码': 'Enter verification code',
  '获取验证码': 'Get code', '立即登录': 'Sign in', '或': 'or', '演示体验': 'Try demo',
  '微信登录': 'Sign in with WeChat', '登录代表同意': 'By signing in, you agree to',
  '嘉医汇': 'Jiayi Care', '数字化健康管理，全周期服务陪伴': 'Digital care throughout your health journey',
  '健康评分 / 100': 'Health score / 100', '开始您的健康管理之旅': 'Start your health journey',
  '完成以下步骤，激活个人健康档案': 'Complete these steps to activate your health record',
  '健康指标': 'Health measures', '血压': 'Blood pressure', '血糖': 'Blood glucose',
  '完善身高体重': 'Add height and weight', '睡眠': 'Sleep', '入睡时间': 'Bedtime',
  '晨起时间': 'Wake time', '睡眠时长': 'Sleep duration', '点击录入': 'Add reading',
  '情绪': 'Mood', '点击录入血压': 'Add blood pressure', '点击录入血糖': 'Add blood glucose',
  '健康报告分享 · 访客查看': 'Shared health report · Guest view', '登录/注册': 'Log in / Sign up',
  '报告中的医疗结论保留原文。': 'Medical findings in this report are shown in their original language.',
  '编辑健康档案': 'Edit health record', '保存档案': 'Save record', '加载中…': 'Loading…',
  '录入': 'Add reading', '个人健康档案': 'Personal health record', '编辑': 'Edit',
  '最新健康指标': 'Latest health measures', '+ 立即录入': '+ Add now', '暂无数据': 'No data yet',
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
  '正常': 'Normal', '异常': 'Abnormal', '关注': 'Attention', '未知': 'Unknown',
  '体成分': 'Body composition', '人体成分分析': 'Body composition analysis',
  '阴道超声': 'Transvaginal ultrasound', '肾功能': 'Kidney function',
};

const LanguageContext = createContext(null);
export function LanguageProvider({ children }) {
  const [preference, setPreference] = useState('zh-CN');
  useEffect(() => { AsyncStorage.getItem(KEY).then(value => {
    if (value === 'en-US' || value === 'zh-CN') setPreference(value);
  }).catch(() => {}); }, []);
  const setLanguage = value => {
    const next = value === 'en-US' ? 'en-US' : 'zh-CN';
    setPreference(next);
    AsyncStorage.setItem(KEY, next).catch(() => {});
  };
  const language = preference;
  const t = key => language === 'en-US' ? (translations[key] || key) : key;
  return <LanguageContext.Provider value={{ language, preference, setLanguage, t }}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);
