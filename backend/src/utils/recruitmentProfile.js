function recruitmentProfile(response = {}) {
  const patch = {};
  for (const field of ['title', 'profession', 'education']) if (response[field]?.trim()) patch[field] = response[field].trim();
  const expertise = response.registrationScope?.trim() ? [response.registrationScope.trim()] : response.expertise?.filter(Boolean);
  if (expertise?.length) patch.expertise = expertise;
  if (Number.isFinite(response.experienceYears)) patch.experienceYears = response.experienceYears;
  if (response.languages?.length) patch.languages = response.languages;
  return patch;
}
module.exports = { recruitmentProfile };
