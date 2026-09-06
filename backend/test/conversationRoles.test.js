const test = require('node:test');
const assert = require('node:assert/strict');
const { conversationRoleKeys, getConversationRole, getConversationRoleForStaff, staffCanAccessConversation } = require('../src/utils/conversationRoles');

test('所有现有服务角色共用统一会话配置', () => {
  assert.deepEqual(conversationRoleKeys, ['doctor', 'manager', 'planner', 'nutritionist', 'medicalAssistant']);
  for (const role of conversationRoleKeys) {
    assert.equal(typeof getConversationRole(role).label, 'string');
    assert.equal(typeof getConversationRole(role).aiEnabled, 'boolean');
    assert.equal(staffCanAccessConversation(getConversationRole(role).staffRole, role), true);
  }
});

test('就医专员纯人工，其他现有角色允许AI承接', () => {
  assert.equal(getConversationRole('medicalAssistant').aiEnabled, false);
  for (const role of ['doctor', 'manager', 'planner', 'nutritionist']) {
    assert.equal(getConversationRole(role).aiEnabled, true);
  }
});

test('不同岗位不能访问彼此会话', () => {
  assert.equal(staffCanAccessConversation('familyDoctor', 'planner'), false);
  assert.equal(staffCanAccessConversation('healthPlanner', 'doctor'), false);
  assert.equal(staffCanAccessConversation('superadmin', 'planner'), true);
});

test('医护登录角色映射到唯一会话频道', () => {
  assert.equal(getConversationRoleForStaff('familyDoctor'), 'doctor');
  assert.equal(getConversationRoleForStaff('healthManager'), 'manager');
  assert.equal(getConversationRoleForStaff('healthPlanner'), 'planner');
  assert.equal(getConversationRoleForStaff('nutritionist'), 'nutritionist');
  assert.equal(getConversationRoleForStaff('medicalAssistant'), 'medicalAssistant');
});
