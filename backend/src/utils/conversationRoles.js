const CONVERSATION_ROLES = Object.freeze({
  doctor: { label: '健康顾问', staffRole: 'familyDoctor', aiEnabled: true },
  manager: { label: '健管专员', staffRole: 'healthManager', aiEnabled: true },
  planner: { label: '健康规划师', staffRole: 'healthPlanner', aiEnabled: true, assignedField: 'assignedHealthPlanner' },
  nutritionist: { label: '营养师', staffRole: 'nutritionist', aiEnabled: true, assignedField: 'assignedNutritionist' },
  medicalAssistant: { label: '就医专员', staffRole: 'medicalAssistant', aiEnabled: false, assignedField: 'assignedMedicalAssistant' },
});

const conversationRoleKeys = Object.freeze(Object.keys(CONVERSATION_ROLES));
const getConversationRole = (key) => CONVERSATION_ROLES[key] || null;
const getConversationRoleForStaff = (staffRole) =>
  conversationRoleKeys.find(key => CONVERSATION_ROLES[key].staffRole === staffRole) || null;

function staffCanAccessConversation(staffRole, channelRole) {
  return staffRole === 'superadmin' || getConversationRole(channelRole)?.staffRole === staffRole;
}

module.exports = { CONVERSATION_ROLES, conversationRoleKeys, getConversationRole, getConversationRoleForStaff, staffCanAccessConversation };
