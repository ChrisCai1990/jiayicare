const id = value => String(value?._id || value || '');
function canRead(actor, care, patient) {
  if (!actor || !care || !patient || !id(actor.tenantId) || patient.isDeleted || id(actor.tenantId) !== id(care.tenantId) || id(patient.tenantId) !== id(care.tenantId)) return false;
  if (actor.role === 'familyDoctor') return id(actor._id) === id(care.advisorId) && id(actor._id) === id(patient.assignedFamilyDoctor);
  return actor.role === 'psychologist' && care.status !== 'ended' && id(actor._id) === id(care.psychologistId);
}
function allowedPsychologistPath(method, url) {
  const path = String(url).split('?')[0];
  return /^\/api\/staff\/psychology(?:\/|$)/.test(path)
    || (method === 'GET' && /^\/api\/staff\/cooperation(?:\/|$)/.test(path))
    || (method === 'GET' && /^\/api\/staff\/commission\/(?:me|my-overview)$/.test(path))
    || (method === 'GET' && path === '/api/staff/ai-workspace/status')
    || (method === 'POST' && path === '/api/staff/ai-workspace/chat')
    || (method === 'GET' && path === '/api/staff/me')
    || (method === 'PUT' && path === '/api/staff/me/password');
}
module.exports = { canRead, allowedPsychologistPath };
