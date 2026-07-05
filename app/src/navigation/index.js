import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';
import { messagesAPI } from '../services/api';

import LoginScreen from '../screens/auth/LoginScreen';
import OnboardingScreen from '../screens/onboarding/OnboardingScreen';
import HomeScreen from '../screens/home/HomeScreen';
import RecordsScreen from '../screens/records/RecordsScreen';
import AddRecordScreen from '../screens/records/AddRecordScreen';
import HealthReportScreen from '../screens/records/HealthReportScreen';
import AiHealthScreen from '../screens/records/AiHealthScreen';
import ReportUploadScreen from '../screens/records/ReportUploadScreen';
import TasksScreen from '../screens/tasks/TasksScreen';
import MessagesScreen from '../screens/messages/MessagesScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import ChatScreen from '../screens/chat/ChatScreen';
import MedicationScreen from '../screens/medication/MedicationScreen';
import NutritionScreen from '../screens/nutrition/NutritionScreen';
import QuestionnaireScreen from '../screens/questionnaire/QuestionnaireScreen';
import RemindersScreen from '../screens/reminders/RemindersScreen';
import ServiceMallScreen from '../screens/services/ServiceMallScreen';
import ServicePlansScreen from '../screens/services/ServicePlansScreen';
import EditProfileScreen from '../screens/profile/EditProfileScreen';
import AccountSecurityScreen from '../screens/profile/AccountSecurityScreen';
import HelpFeedbackScreen from '../screens/profile/HelpFeedbackScreen';
import NotificationSettingsScreen from '../screens/profile/NotificationSettingsScreen';
import ComingSoonScreen from '../screens/common/ComingSoonScreen';
import OrdersScreen from '../screens/orders/OrdersScreen';
import RenewalScreen from '../screens/services/RenewalScreen';
import BenefitsScreen from '../screens/profile/BenefitsScreen';
import PublicReportScreen from '../screens/records/PublicReportScreen';
import LegalScreen from '../screens/legal/LegalScreen';
import FamilyMembersScreen from '../screens/profile/FamilyMembersScreen';
import SpecialScreeningScreen from '../screens/records/SpecialScreeningScreen';
import MedicalReportsScreen from '../screens/records/MedicalReportsScreen';
import Member365Screen from '../screens/services/Member365Screen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TAB_CONFIG = [
  { name: 'Home',         label: '首页',    icon: 'home',         component: HomeScreen },
  { name: 'Records',      label: '健康档案', icon: 'heart',        component: RecordsScreen },
  { name: 'ReportUpload', label: '上传报告', icon: 'cloud-upload', component: ReportUploadScreen },
  { name: 'Messages',     label: '消息',    icon: 'chatbubble',   component: MessagesScreen },
  { name: 'Profile',      label: '我的',    icon: 'person',       component: ProfileScreen },
];

function MainTabs() {
  const { token } = useAuth();
  const [unreadCount, setUnreadCount] = React.useState(0);

  React.useEffect(() => {
    if (!token) return;
    let mounted = true;
    const fetch = () => messagesAPI.unreadCount().then(r => { if (mounted) setUnreadCount(r.count || 0); }).catch(() => {});
    fetch();
    const timer = setInterval(fetch, 60000); // 每分钟刷新
    return () => { mounted = false; clearInterval(timer); };
  }, [token]);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.borderLight,
          borderTopWidth: 1,
          height: 66,
          paddingBottom: 10,
          paddingTop: 6,
          elevation: 0,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: 2 },
        tabBarIcon: ({ focused }) => {
          const conf = TAB_CONFIG.find(t => t.name === route.name);
          // 选中用实心图标，未选中用线框图标
          const iconName = focused ? conf.icon : `${conf.icon}-outline`;
          // 显式传颜色，避免 React Navigation 在 web 端 CSS 变量传色失效
          return <Ionicons name={iconName} size={22} color={focused ? colors.primary : colors.textMuted} />;
        },
      })}
    >
      {TAB_CONFIG.map(tab => (
        <Tab.Screen
          key={tab.name}
          name={tab.name}
          component={tab.component}
          options={{
            tabBarLabel: tab.label,
            ...(tab.name === 'Messages' && unreadCount > 0
              ? { tabBarBadge: unreadCount > 99 ? '99+' : unreadCount }
              : {}),
          }}
          listeners={tab.name === 'Messages' ? {
            tabPress: () => setUnreadCount(0),
          } : undefined}
        />
      ))}
    </Tab.Navigator>
  );
}

export default function Navigation() {
  const { token, user, loading } = useAuth();

  // 检测分享链接（仅 web）
  const shareToken = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('share')
    : null;

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // 已登录但未完成 onboarding → 首屏是 Onboarding
  const needsOnboarding = !!token && !user?.onboardingCompleted;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        {/* 优先：?share=TOKEN → 公开报告页（无需登录） */}
        {shareToken ? (
          <Stack.Screen
            name="PublicReport"
            component={PublicReportScreen}
            initialParams={{ token: shareToken }}
          />
        ) : !token ? (
          // 未登录
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen name="Legal" component={LegalScreen} />
          </>
        ) : (
          // 已登录：onboarding 未完成时排首位
          <>
            {needsOnboarding && (
              <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            )}
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="AddRecord" component={AddRecordScreen} />
            <Stack.Screen name="HealthReport" component={HealthReportScreen} />
            <Stack.Screen name="AiHealth" component={AiHealthScreen} />
            <Stack.Screen name="Tasks" component={TasksScreen} />
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen name="Medication" component={MedicationScreen} />
            <Stack.Screen name="Nutrition" component={NutritionScreen} />
            <Stack.Screen name="Questionnaire" component={QuestionnaireScreen} />
            <Stack.Screen name="Reminders" component={RemindersScreen} />
            <Stack.Screen name="ServiceMall" component={ServiceMallScreen} />
            <Stack.Screen name="ServicePlans" component={ServicePlansScreen} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} />
            <Stack.Screen name="AccountSecurity" component={AccountSecurityScreen} />
            <Stack.Screen name="HelpFeedback" component={HelpFeedbackScreen} />
            <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} />
            <Stack.Screen name="ComingSoon" component={ComingSoonScreen} />
            <Stack.Screen name="Orders" component={OrdersScreen} />
            <Stack.Screen name="Renewal" component={RenewalScreen} />
            <Stack.Screen name="Legal" component={LegalScreen} />
            <Stack.Screen name="Benefits" component={BenefitsScreen} />
            <Stack.Screen name="FamilyMembers" component={FamilyMembersScreen} />
            <Stack.Screen name="SpecialScreening" component={SpecialScreeningScreen} />
            <Stack.Screen name="MedicalReports" component={MedicalReportsScreen} />
            <Stack.Screen name="Member365" component={Member365Screen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
