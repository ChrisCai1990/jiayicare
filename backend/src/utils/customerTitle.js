// Shared by personal AI greetings and service-group introductions.
function resolveTitle(user) {
  const preferred = typeof user?.preferredTitle === 'string' ? user.preferredTitle.trim() : '';
  if (preferred) return preferred;
  const name = typeof user?.name === 'string' ? user.name.trim() : '';
  const surname = name.charAt(0);
  if (surname && user?.gender === '男') return `${surname}先生`;
  if (surname && user?.gender === '女') return `${surname}女士`;
  return name || '您';
}
module.exports = { resolveTitle };
