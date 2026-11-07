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
  '点击登录 / 注册 ›': 'Log in / Sign up ›', '点击完善个人资料 ›': 'Complete your profile ›',
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
};

const LanguageContext = createContext(null);
export const syncTabBarLanguage = language => {
  const labels = language === 'en-US' ? ['Home', 'Health Records', 'Care Team', 'Profile'] : ['首页', '健康档案', '健康管家', '我的'];
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
