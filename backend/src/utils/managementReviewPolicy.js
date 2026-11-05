const fields = { familyDoctor:'assignedFamilyDoctor', nutritionist:'assignedNutritionist', healthManager:'assignedHealthManager', rehabSpecialist:'assignedRehabSpecialist', psychologist:'assignedPsychologist', tcmDoctor:'assignedTcmDoctor' };
const labels = { familyDoctor:'健康顾问', nutritionist:'营养师', healthManager:'健管专员', rehabSpecialist:'运动复健师', psychologist:'心理咨询师', tcmDoctor:'中医师' };
const id = x => String(x?._id || x || '');
const day = date => new Date(new Date(date).getTime()+8*3600000).toISOString().slice(0,10);
function enabled(patientId, env=process.env) { return env.MANAGEMENT_REVIEW_MODE === 'allowlist' && String(env.MANAGEMENT_REVIEW_PATIENT_IDS||'').split(',').map(x=>x.trim()).filter(x=>/^[a-f\d]{24}$/i.test(x)).includes(id(patientId)); }
function assigned(user, staff, role=staff.role) { return staff.role===role && id(user[fields[role]])===id(staff._id); }
function canRead(user, staff) { return staff.role==='superadmin'||Object.keys(fields).some(role=>assigned(user,staff,role)); }
function advisor(user, staff) { return staff.role==='superadmin'||assigned(user,staff,'familyDoctor'); }
function addMonths(value, count) { const [y,m,d]=value.split('-').map(Number); const end=new Date(Date.UTC(y,m+count,0)).getUTCDate(); return new Date(Date.UTC(y,m-1+count,Math.min(d,end))).toISOString().slice(0,10); }
function previousDay(value) { return new Date(Date.parse(value+'T00:00:00Z')-86400000).toISOString().slice(0,10); }
function periods(user, now=new Date(), env=process.env) {
 const start=String(user.serviceStartDate||'').slice(0,10), end=String(user.serviceExpiry||'').slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||end<start) return [];
 const today=day(now), eligible=!!user.createdAt && today>=addMonths(day(user.createdAt),1);
 const floor=env.MANAGEMENT_REVIEW_FIRST_MONTH || start.slice(0,7);
 const rows=[]; let month=start.slice(0,7)+'-01';
 for(let i=0;i<24&&month<=end;i++,month=addMonths(month,1)) {
  if(month.slice(0,7)<floor) continue;
  const from=month<start?start:month, until=[previousDay(addMonths(month,1)),end].sort()[0];
  rows.push({key:'M:'+month.slice(0,7),kind:'monthly',label:month.slice(0,7)+' 月度复盘',start:from,end:until,due:eligible&&today>until});
 }
 for(let i=0;i<4;i++){const from=addMonths(start,i*3), until=[previousDay(addMonths(start,(i+1)*3)),end].sort()[0];if(from>end)break; rows.push({key:'Q:'+start+':'+(i+1),kind:'quarterly',label:'服务第'+(i+1)+'季度评估',start:from,end:until,due:eligible&&today>until});}
 rows.push({key:'Y:'+start,kind:'annual',label:'年度团队总评与下年度计划',start,end,due:eligible&&today>end});return rows;
}
function pendingRole(row, role) { return row.status==='collecting' && row.roles.includes(role) && row.contributions?.[role]?.status!=='submitted'; }
module.exports={fields,labels,id,day,enabled,assigned,canRead,advisor,periods,pendingRole,addMonths};
