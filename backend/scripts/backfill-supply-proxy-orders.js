/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const FollowUp = require('../src/models/FollowUp');
const Medication = require('../src/models/Medication');
const Order = require('../src/models/Order');
const User = require('../src/models/User');
const { startStaffMedicalProxyWorkflow } = require('../src/utils/medicalProxyWorkflow');

const APPLY = process.argv.includes('--apply');
const shanghaiDate = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('缺少 MONGODB_URI');
  await mongoose.connect(process.env.MONGODB_URI);
  const since = new Date(); since.setDate(since.getDate() - 1);
  const reminders = await FollowUp.find({
    sourceType: 'supply_reminder', status: { $in: ['planned', 'in_progress'] }, date: { $gte: since },
    $or: [{ theme: /我方代配|代配药/ }, { tags: { $in: ['我方代配', '代配药'] } }],
  }).sort({ date: 1 }).lean();
  const results = [];
  for (const reminder of reminders) {
    const medication = await Medication.findOne({ _id: reminder.sourceId, user: reminder.patientId, stopped: { $ne: true }, 'supplyReminder.enabled': true, 'supplyReminder.mode': 'proxy' });
    if (!medication) continue;
    const patient = await User.findById(reminder.patientId).select('name tenantId assignedFamilyDoctor assignedHealthPlanner assignedHealthManager').lean();
    if (!patient?.assignedHealthPlanner || !patient?.assignedHealthManager) {
      results.push({ reminderId: reminder._id, patient: patient?.name || '', status: 'skipped_missing_assignment' });
      continue;
    }
    const expectedDeliveryDate = reminder.formData?.expectedDeliveryDate || shanghaiDate(reminder.date);
    const existing = await Order.findOne({
      user: patient._id, status: { $nin: ['completed', 'cancelled'] },
      $or: [
        { 'medicalProxyPlan.sourceSupplyReminderTaskId': reminder._id },
        { 'medicalProxyPlan.sourceMedicationId': medication._id, 'medicalProxyPlan.preferredDateStart': expectedDeliveryDate },
      ],
    }).select('_id').lean();
    if (existing) {
      results.push({ reminderId: reminder._id, patient: patient.name, status: 'already_exists', orderId: existing._id });
      continue;
    }
    results.push({ reminderId: reminder._id, patient: patient.name, medication: medication.name, expectedDeliveryDate, status: APPLY ? 'created' : 'would_create' });
    if (!APPLY) continue;
    const supply = medication.supplyReminder || {};
    const workflow = await startStaffMedicalProxyWorkflow({
      patient, advisorId: patient.assignedFamilyDoctor || reminder.staffId,
      plan: {
        medicationProxy: true, sourceMedicationId: medication._id, sourceSupplyReminderTaskId: reminder._id,
        hospital: supply.hospitalName || reminder.formData?.hospitalName || '', campus: supply.campus || '', department: supply.department || '', expert: supply.expert || '',
        institutionType: supply.institutionType || reminder.formData?.institutionType || 'hospital', platformName: supply.platformName || '', pharmacyName: supply.pharmacyName || '', pharmacyAddress: supply.pharmacyAddress || '', purchasePath: supply.purchasePath || '',
        medicationName: medication.name || '', medicationBrand: medication.brandName || medication.name || '', medicationSpecification: medication.specification || '', medicationQuantity: supply.quantity || reminder.formData?.quantity || '',
        paymentMethod: supply.paymentMethod || reminder.formData?.paymentMethod || '', expectedDeliveryDate, deliveryTime: supply.deliveryTime || reminder.formData?.deliveryTime || '', leadDays: 7,
        preferredDateStart: expectedDeliveryDate, preferredDateEnd: expectedDeliveryDate, notes: supply.note || '',
      },
    });
    await FollowUp.updateOne({ _id: reminder._id }, { $set: { 'formData.linkedOrderId': workflow.order._id } });
    medication.supplyReminder.sourceOrderId = workflow.order._id;
    await medication.save();
    results[results.length - 1].orderId = workflow.order._id;
  }
  console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', count: results.length, results }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
