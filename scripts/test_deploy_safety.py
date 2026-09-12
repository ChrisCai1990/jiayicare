"""Offline tests: never connects to production or invokes a migration."""
import ast
import pathlib
import unittest


class DeploymentSafetyTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = pathlib.Path(__file__).with_name('deploy.py').read_text(encoding='utf-8')
        cls.tree = ast.parse(cls.source)

    def test_all_data_migration_commands_use_skip_aware_dispatch(self):
        calls = []
        for node in ast.walk(self.tree):
            if not isinstance(node, ast.Call) or not node.args:
                continue
            command = ast.get_source_segment(self.source, node.args[0]) or ''
            if '/backend/src/scripts/' not in command:
                continue
            calls.append(node)
            self.assertIsInstance(node.func, ast.Name)
            self.assertEqual(node.func.id, 'run_migration', f'unguarded migration at line {node.lineno}')
        self.assertGreater(len(calls), 10)

    def test_skip_dispatch_executes_no_remote_command(self):
        function = next(node for node in ast.walk(self.tree) if isinstance(node, ast.FunctionDef) and node.name == 'run_migration')
        code = compile(ast.Module(body=[function], type_ignores=[]), '<isolated migration dispatch>', 'exec')
        calls = []
        namespace = {'skip_data_migrations': True, 'remote': lambda command, **options: calls.append(command) or (0, 'executed')}
        exec(code, namespace)
        self.assertEqual(namespace['run_migration']('must-not-run', timeout=1), (0, ''))
        self.assertEqual(calls, [])
        namespace['skip_data_migrations'] = False
        self.assertEqual(namespace['run_migration']('approved-migration'), (0, 'executed'))
        self.assertEqual(calls, ['approved-migration'])

    def test_revision_checked_before_restart_and_before_success(self):
        before_restart = self.source.index('重启前确认线上版本未被其他发布修改')
        restart = self.source.index('remote("pm2 restart')
        final_check = self.source.index('验收时再次确认线上 commit')
        success = self.source.index('print("部署完成")')
        self.assertLess(before_restart, restart)
        self.assertLess(restart, final_check)
        self.assertLess(final_check, success)


if __name__ == '__main__':
    unittest.main()
