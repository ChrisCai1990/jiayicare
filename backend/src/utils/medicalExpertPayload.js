const cleanList = value => [...new Set((Array.isArray(value) ? value : String(value || '').split(/[、,，;；\n]+/)).map(item => String(item).trim()).filter(Boolean))];

// The directory GET returns populated references and metadata. Only editable
// fields may be written back; in particular tenantId must never reach updates.
function medicalExpertPayload(body) {
  const fields = ['name', 'title', 'institutionId', 'departmentId', 'campus', 'introduction', 'licenseNumber', 'outpatientSchedule', 'contactNote', 'status'];
  const payload = Object.fromEntries(fields.filter(key => Object.prototype.hasOwnProperty.call(body, key)).map(key => [key, body[key]]));
  if (payload.name !== undefined) payload.name = String(payload.name || '').trim();
  for (const key of ['expertise', 'diseaseTags', 'serviceModes']) payload[key] = cleanList(body[key]);
  payload.linkedStaffId = body.linkedStaffId || null;
  return payload;
}

module.exports = { medicalExpertPayload };
