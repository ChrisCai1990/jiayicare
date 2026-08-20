import {
  BarChart3, Bell, Brain, Building2, CheckSquare, ChevronDown, ClipboardList,
  CircleDollarSign, FileText, FlaskConical, HeartPulse, Home, MessageCircle,
  Microscope, Send, ShoppingBag, Stethoscope, Target, UserCog, UserRound, Users,
} from 'lucide-react'

const icons = {
  home: Home,
  patients: Users,
  followups: ClipboardList,
  plans: FileText,
  reports: Microscope,
  services: Building2,
  knowledge: Send,
  questionnaires: ClipboardList,
  products: ShoppingBag,
  commission: CircleDollarSign,
  marketing: Target,
  team: UserCog,
  operations: BarChart3,
  checkin: CheckSquare,
  notifications: Bell,
  profile: UserRound,
  brain: Brain,
  heart: HeartPulse,
  message: MessageCircle,
  lab: FlaskConical,
  care: Stethoscope,
  chevronDown: ChevronDown,
}

/** 全站统一的线性图标入口：默认 18px、1.75px 线宽，避免 emoji 的色彩与字体差异。 */
export default function AppIcon({ name, size = 18, strokeWidth = 1.75, ...props }) {
  const Icon = icons[name] || FileText
  return <Icon size={size} strokeWidth={strokeWidth} aria-hidden="true" {...props} />
}

