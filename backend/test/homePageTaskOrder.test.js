const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const homePage = fs.readFileSync(path.join(__dirname, '../../staff/src/pages/HomePage.jsx'), 'utf8')
const aiTodos = fs.readFileSync(path.join(__dirname, '../../staff/src/components/AiTodosPanel.jsx'), 'utf8')

test('temporary service tasks stay above AI review tasks', () => {
  assert.ok(homePage.indexOf('<ServiceTasksPanel />') < homePage.indexOf('<AiTodosPanel />'))
})

test('AI task panel keeps review-specific wording', () => {
  assert.match(aiTodos, /AI 待审核任务/)
  assert.match(aiTodos, /仅显示本人可审核项/)
  assert.match(aiTodos, /暂无待审核任务/)
})
