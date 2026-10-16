function directExpertAppointment(staff, body = {}) {
  return staff?.role === 'familyDoctor' && body.appointmentOnly === true
    && body.medicationProxy !== true && body.medicalEscort !== true;
}

module.exports = { directExpertAppointment };
