// Regresiones de los arreglos autorizados. L04 y L08 documentan decisiones conservadas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { parse } from 'espree';
import { getMatchingAbsenceGestiones } from '../src/components/absenceAttendanceUtils.js';
import { buildMitoboxReservationId, buildMitoboxSlotId, buildMitoboxReservationGroupId, canReserveMitoboxAt, sortMitoboxSlots, isMitoboxSlotSelectionConsecutive } from '../src/components/mitoboxUtils.js';

const admin = await readFile('src/components/AdminPortal.jsx','utf8');
const tree = parse(admin,{ecmaVersion:'latest',sourceType:'module',ecmaFeatures:{jsx:true},range:true});
const nodes = new Map();
function walk(n) { if(!n||typeof n!=='object')return; if(n.type==='VariableDeclarator'&&n.id.type==='Identifier')nodes.set(n.id.name,n.init);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v); }
walk(tree);
const extract = (name,context={}) => vm.runInNewContext(`(${admin.slice(...nodes.get(name).range)})`, context);

test('L01: el cambio temporal no se aplica a otra ruta con el mismo ID', () => {
  const matches=extract('doesTemporaryChangeBelongToClass');
  const change={classId:'same',classRefPath:'artifacts/default-app-id/users/teacher-a/recurringClasses/same'};
  const other={id:'same',refPath:'artifacts/default-app-id/users/teacher-b/recurringClasses/same'};
  assert.equal(matches(change,other),false);
});

test('L02: la conciliación separa rutas y asignaturas con ID coincidente', () => {
  const notice={id:'notice',type:'aviso_ausencia',studentId:'student',absenceDate:'2026-11-12',requestedClass:'same',requestedClassRefPath:'users/a/recurringClasses/same',absenceSubject:'Piano',absenceTime:'18:00'};
  const other={classId:'same',refPath:'users/b/recurringClasses/same',subject:'Canto',time:'19:00'};
  assert.equal(getMatchingAbsenceGestiones([notice],'student',other,'2026-11-12').length,0);
});

test('L03: la baja selectiva prioriza la ruta y bloquea un ID ambiguo', () => {
  const a={id:'same',refPath:'users/a/recurringClasses/same'},b={id:'same',refPath:'users/b/recurringClasses/same'};
  const getSource=extract('getGestionSourceClass',{allClasses:[a,b]});
  assert.equal(getSource({sourceClassId:'same',sourceClassRefPath:b.refPath}).refPath,b.refPath);
  assert.equal(getSource({sourceClassId:'same'}),null);
});

test('L04: el alta directa manual conserva el circuito Tadosi autorizado por Paco', async () => {
  const saved=[];
  const create=extract('createServiceOnlyStudent',{
    serviceStudentDraft:{name:'Externo ficticio',email:'external@example.com',hasMitobox:true},students:[],
    normalizeEmail:s=>s.toLowerCase(),alert:()=>{},user:{email:'admin@example.com'},db:{},appId:'default-app-id',
    doc:(...parts)=>parts.slice(1).join('/'),setDoc:async(path,data)=>saved.push({path,data}),
    setSavingServiceStudent:()=>{},setServiceStudentModal:()=>{},setServiceStudentDraft:()=>{},setFilterStatus:()=>{},setSearchStudent:()=>{}
  });
  await create();
  assert.equal(saved.length,1);
  const student=saved[0].data;
  assert.equal(student.hasMitobox,true);assert.equal(student.classes.length,0);
  assert.equal(student.mitoboxMonthlyFee,undefined);assert.equal(student.mitoboxContractGestionId,undefined);
  assert.equal([35,50].includes(student.mitoboxMonthlyFee)?student.mitoboxMonthlyFee:35,35);
});

test('L05: la baja parcial conserva la otra plaza aunque comparta ID', async () => {
  const a={id:'same',refPath:'users/a/recurringClasses/same',students:[{id:'student'}]},b={id:'same',refPath:'users/b/recurringClasses/same',students:[{id:'student'}]};
  const removed=[];
  const consolidate=extract('consolidateScheduledBajaGestion',{
    students:[{id:'student',name:'Alumno ficticio',hasMitoverso:true}],allClasses:[a,b],todayStr:'2026-11-05',
    getDocFromServer:async()=>({exists:()=>true,data:()=>({id:'student',name:'Alumno ficticio',hasMitoverso:true})}),
    isTotalBajaGestion:()=>false,getGestionSourceClass:()=>a,getScheduledGestionEndDate:()=> '2026-11-04',getScheduledGestionEffectiveDate:()=> '2026-11-05',
    getScheduledEntryEndDate:()=>'',isEntryScheduledByGestion:()=>false,isFixedClassStudent:()=>true,
    db:{},appId:'default-app-id',user:{email:'admin@example.com'},doc:(_, ...parts)=>parts.join('/'),
    updateDoc:async(path,data)=>{if(path.startsWith('users/'))removed.push({path,data});},withClassStudentIndex:students=>({students}),formatClassLine:c=>c.refPath,
    hasRemainingCommittedFixedSeat:()=>false,cancelledServiceKeys:()=>[],serviceCancellationPatch:()=>({}),hasIndependentServices:()=>true,
    fixedServiceSummary:()=>'',buildConsolidatedGestionUpdate:()=>({})
  });
  await consolidate({id:'partial',studentId:'student',sourceClassId:'same',sourceClassRefPath:a.refPath});
  assert.equal(removed.length,1);assert.equal(removed[0].path,a.refPath);assert.ok(removed.every(row=>row.data.students.length===0));
});

test('L06: Mitobox bloquea mañana si faltan menos de 24 horas reales', async () => {
  const source=await readFile('src/components/StudentPortal.jsx','utf8');
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'module',ecmaFeatures:{jsx:true},range:true});
  let fn;function find(n){if(!n||typeof n!=='object')return;if(n.type==='VariableDeclarator'&&n.id.name==='sendMitoboxReservation')fn=n.init;for(const v of Object.values(n))if(Array.isArray(v))v.forEach(find);else if(v&&typeof v==='object')find(v);}
  find(ast);assert.ok(fn);
  const instant=Date.parse('2026-11-05T22:00:00+01:00');
  class FrozenDate extends Date { constructor(...args){super(...(args.length?args:[instant]));}static now(){return instant;} }
  let reached=false;const notices=[];
  const send=vm.runInNewContext(`(${source.slice(...fn.range)})`,{
    canReserveMitoboxAt:(date,time)=>canReserveMitoboxAt(date,time,instant),Date:FrozenDate,profile:{id:'student',hasMitobox:true},mboxDate:'2026-11-06',mboxSede:'Sede ficticia',mboxInst:'Piano',
    mboxSelectedSlots:[{time:'18:00',slotId:'slot',roomId:'room'}],sortMitoboxSlots,isMitoboxSlotSelectionConsecutive,
    formatLocalDateString:d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
    showToast:message=>notices.push(message),setIsSendingGestion:()=>{},getCenterForValue:()=>({id:'center',name:'Sede ficticia'}),findRoomByValue:()=>({id:'room',name:'Sala ficticia'}),
    buildMitoboxReservationId,buildMitoboxReservationGroupId,db:{},appId:'default-app-id',doc:(...args)=>args,
    runTransaction:async()=>{reached=true;throw new Error('Fin del doble: no se escribe ninguna reserva');}
  });
  await send();
  assert.equal((Date.parse('2026-11-06T18:00:00+01:00')-instant)/3600000,20);
  assert.equal(reached,false);assert.ok(notices.some(s=>s.includes('24 horas')));
});

test('L07: una reserva histórica aprobada no eleva el aforo de una sala llena', async () => {
  let effect;
  function find(n){if(!n||typeof n!=='object')return;if(n.type==='CallExpression'&&n.callee.name==='useEffect'&&n.arguments[0]?.range&&admin.slice(...n.arguments[0].range).includes('const legacyReservations'))effect=n.arguments[0];for(const v of Object.values(n))if(Array.isArray(v))v.forEach(find);else if(v&&typeof v==='object')find(v);}
  find(tree);assert.ok(effect);
  const writes=[], errors=[];let complete;const done=new Promise(resolve=>{complete=resolve;});
  const room={id:'room',name:'Sala ficticia',capacity:1},center={id:'center',name:'Sede ficticia'};
  const migrate=vm.runInNewContext(`(${admin.slice(...effect.range)})`,{
    activeTab:'mitobox',settingsLoaded:true,gestiones:[{id:'legacy',type:'reserva_mitobox',status:'completado',reservationDate:'2026-11-20',reservationTime:'18:00',legacyMitoboxMigrationApprovedAt:'2026-11-05',legacyMitoboxMigrationApprovedBy:'paco@escuelalosmitos.com',studentId:'student-without-mitobox',studentEmail:'no-service@example.com',centerId:'center',roomId:'room'}],
    getTodayLocalString:()=> '2026-11-05',mitoboxLegacyMigrationRef:{current:{inFlight:false,signature:''}},getCenterForValue:()=>center,findRoomByValue:()=>room,
    buildMitoboxReservationId,buildMitoboxSlotId,normalizeEmail:s=>s.toLowerCase(),db:{},appId:'default-app-id',doc:(_, ...parts)=>parts.join('/'),
    runTransaction:async(_,callback)=>callback({get:async path=>path.includes('/students/')?{exists:()=>true,data:()=>({hasMitobox:true})}:path.includes('/mitoboxSlots/')?{exists:()=>true,data:()=>({reservedCount:1,capacity:1})}:{exists:()=>false},set:(path,data)=>writes.push({path,data})}),
    updateDoc:async()=>complete(),console:{error:(message,error)=>{errors.push(error);complete();}}
  });
  migrate();let timer;
  try {await Promise.race([done,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('La migración simulada no terminó')),2000);})]);}finally{clearTimeout(timer);}
  assert.equal(writes.length,0);assert.match(errors[0].message,/aforo/);
});

test('L08: la reforma del CRM familiar queda pendiente por decisión de Paco', () => {
  const matches=extract('matchesStudent',{student:{id:'child-a'},studentEmail:'family@example.com'});
  assert.equal(matches({studentId:'child-b',studentEmail:'family@example.com'}),true);
  assert.equal(matches({studentId:'child-b',studentEmail:'different@example.com'}),false);
});
