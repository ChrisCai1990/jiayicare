import sys
from scripts.ssh_config import connect
sys.stdout.reconfigure(encoding='utf-8')
c = connect()

# Find user by phone and check their health data
cmd = '''mongosh jiayicare --quiet --eval "
const u = db.users.findOne({phone: '13958025666'});
if (!u) { print('USER NOT FOUND'); } else {
  print('name:', u.name);
  print('healthScore:', u.healthScore);
  print('healthProfile keys:', u.healthProfile ? Object.keys(u.healthProfile).join(',') : 'NONE');
  print('archiveDraft:', u.archiveDraft ? JSON.stringify(u.archiveDraft).slice(0,200) : 'NONE');
  print('full healthProfile:', JSON.stringify(u.healthProfile));
}"
'''
i, o, e = c.exec_command(cmd)
print(o.read().decode('utf-8', errors='replace'))
print(e.read().decode('utf-8', errors='replace'))
c.close()
