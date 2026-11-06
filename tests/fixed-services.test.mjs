import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { parse } from 'espree';
import * as utils from '../src/components/fixedServicesUtils.js';
import * as locker from '../src/components/mitolockerContractUtils.js';
const sources = await Promise.all(['AdminPortal.jsx', 'StudentPortal.jsx', '../App.jsx'].map(name => readFile(`src/components/${name}`, 'utf8')));
const asts = sources.map(source => parse(source, {ecmaVersion:'latest',sourceType:'module',range:true,ecmaFeatures:{jsx:true}}));
function expression(index, name) {
  let result;
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && node.id.name === name) result = sources[index].slice(...node.init.range);
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value);
  };
  walk(asts[index]); assert.ok(result, name); return result;
}
function load(index, name, context) { return vm.runInNewContext(`(${expression(index,name)})`, context); }
const clean = value => JSON.parse(JSON.stringify(value));
const noop = () => {};
const profile = {id:'s1', name:'Alumna',email:'alumna@example.com',globalStatus:'activo',hasMitobox:true,hasMitoverso:true,hasMitolocker:true,mitolockerMode:'exclusivo'};
const biClasses = [{id:'c1',teacher:'Paco',subject:'Guitarra',dayOfWeek:1,time:'18:00',students:[{id:'s1'},{id:'s2'}]}];
const selection = {serviceSelectionVersion:1,cancelledServiceKeys:['mitolocker']};

test('una baja explícita conserva los servicios no marcados y el modo compartido no añade ingresos', () => {
  const student = {...profile, ...utils.serviceCancellationPatch(selection,profile)};
  assert.equal(student.hasMitobox,true); assert.equal(student.hasMitoverso,true); assert.equal(student.hasMitolocker,false); assert.equal(student.mitolockerMode,'');
  assert.deepEqual(utils.serviceCancellationPatch({...selection,cancelledServiceKeys:[]},profile),{});
  assert.deepEqual(utils.mitolockerMetrics([
    {...profile,mitolockerMode:'compartido'}, {...profile,id:'s2'}, {...profile,id:'s3',globalStatus:'baja'}
  ]), {alumnosMitolockerCompartido:1,alumnosMitolockerExclusivo:1,ingresosMitolocker:5});
  assert.deepEqual(utils.cancelledServiceKeys({type:'baja',bajaScope:'total'},profile),['mitobox','mitoverso','mitolocker']);
  assert.deepEqual(utils.cancelledServiceKeys({...selection,type:'baja',bajaScope:'total',cancelledServiceKeys:[]},profile),[]);
});

function studentContext(overrides={}) {
  const writes=[], toasts=[];
  const context={...utils,console,profile:{...profile,hasMitolocker:false},user:{email:profile.email},db:{},appId:'app',
    gestionModal:{type:'baja'},bajaClassesRequested:true,bajaServiceKeys:['mitobox'],isServiceOnlyStudent:false,fixedMyClasses:[{id:'c1'}],isMultiSeatStudent:false,bajaTotalRequested:false,
    getGestionUiCopy:()=>({title:'Baja'}),getAvailableFixedSeatClassesForGestion:()=>[{id:'c1'}],selectedSourceClass:null,gestionText:'Motivo',
    isStudentFrozen:false,frozenRestrictedGestionTypes:[],hasPendingGestionForClass:()=>false,timeRules:{isLate:false,next:'diciembre'},
    selectedNewClass:null,selectedRecoveryTicket:null,globalSettings:{teacherEmails:{}},normalizeTeacherKey:()=>'',getTeacherOperationalEmail:()=>'',uniqueStrings:values=>values.filter(Boolean),
    formatClassLineForAdminCopy:()=> 'Guitarra · lunes',getClassCenterName:()=> 'Reus',getClassRoomName:()=> 'Sala 1',getClassCenter:()=>null,getClassRoom:()=>null,
    writeBatch:()=>({set:(ref,payload)=>writes.push(clean(payload)),commit:async()=>{}}),doc:(...parts)=>parts.slice(1).join('/'),
    ADMIN_COPY_GESTION_TYPES:new Set(),showToast:(...args)=>toasts.push(args),myGestiones:[],
    setIsSendingGestion:noop,setGestionModal:noop,setGestionText:noop,setSelectedNewClass:noop,setSelectedSourceClass:noop,setSelectedRecoveryTicketId:noop,setSelectedRecoverySubject:noop,setBajaTotalRequested:noop,setSelectedRecoveryDate:noop,setMaintenanceMonths:noop,setAcceptLatePenalty:noop,setSelectedInst:noop,
    ...overrides};
  return {context,writes,toasts};
}
test('el envío real de alumno distingue baja de servicio, combinada y última plaza sin extras',async()=>{
  for (const scenario of [
    {bajaClassesRequested:false,bajaServiceKeys:['mitobox'],type:'baja_servicios',source:null},
    {bajaClassesRequested:true,bajaServiceKeys:['mitobox'],type:'baja',source:'c1'},
    {bajaClassesRequested:true,bajaServiceKeys:[],type:'baja',source:'c1'},
  ]) {
    const {context,writes,toasts}=studentContext(scenario);
    await load(1,'sendGestion',context)();
    assert.equal(writes.length,1,JSON.stringify(toasts));
    assert.equal(writes[0].type,scenario.type); assert.equal(writes[0].sourceClassId,scenario.source);
    assert.equal(writes[0].serviceSelectionVersion,1);assert.deepEqual(writes[0].cancelledServiceKeys,scenario.bajaServiceKeys);
    assert.equal(writes[0].status,'pendiente');
  }
});
test('una selección vacía o una segunda baja del mismo servicio no genera gestiones',async()=>{
  for (const overrides of [
    {bajaClassesRequested:false,bajaServiceKeys:[]},
    {bajaClassesRequested:false,bajaServiceKeys:['mitobox'],myGestiones:[{status:'pendiente',cancelledServiceKeys:['mitobox']}]},
    {bajaClassesRequested:false,bajaServiceKeys:['mitolocker']},
  ]) {
    const {context,writes,toasts}=studentContext(overrides);await load(1,'sendGestion',context)();
    assert.equal(writes.length,0);assert.equal(toasts.at(-1)[1],'error');
  }
});
test('ambas altas reales exigen contrato y guardan la modalidad y el precio aceptados',async()=>{
  for (const mode of ['compartido','exclusivo']) {
    const student={...profile,name:'Alumna Ficticia',hasMitolocker:false},user={uid:'student-uid',email:student.email};
    const draft={...locker.createMitolockerContractDraft(student,user),mode,instrument:'Guitarra de prueba'};
    const writes=[],context={...utils,...locker,DoorOpen:noop,console,EXTRA_SERVICES:{},fixedMyClasses:[{id:'c1'}],extraSignupModal:'mitolocker',profile:student,isSendingExtraSignup:false,mitolockerContractDraft:draft,
      hasPendingExtraSignup:()=>false,user,db:{},appId:'app',doc:(...p)=>p.join('/'),setDoc:async(ref,data)=>writes.push(clean(data)),ADMIN_COPY_GESTION_TYPES:new Set(),
      serverTimestamp:()=> 'sello-servidor',fetch:async()=>{},APPS_SCRIPT_URL:'https://example.invalid/',
      showToast:noop,setIsSendingExtraSignup:noop,setExtraSignupModal:noop};
    context.getExtraServiceConfig=load(1,'getExtraServiceConfig',context);
    const send=load(1,'sendExtraSignupRequest',context);
    await send();
    assert.equal(writes.length,0);
    context.mitolockerContractDraft={...draft,accepted:true};
    await send();
    assert.equal(writes.length,1);const request=writes[0];
    assert.equal(request.type,'alta_mitolocker');assert.equal(request.mitolockerMode,mode);assert.equal(request.extraMonthlyFee,mode==='compartido'?0:5);
    assert.equal(request.requiresTadosiSetup,mode==='exclusivo');assert.equal(request.status,'pendiente');
    assert.equal(request.hasMitolocker,undefined);
    assert.equal(request.mitolockerContract.mode,mode);
    assert.equal(request.mitolockerContract.acceptedAt,'sello-servidor');
    assert.equal(request.mitolockerContract.instrument,'Guitarra de prueba');
    assert.match(request.mitolockerContract.sha256,/^[a-f0-9]{64}$/);
    assert.match(request.mitolockerContract.text,/## 29\. Conocimiento y aceptación/);
    assert.doesNotMatch(request.mitolockerContract.text,/DNI\/NIE:/);
    if(mode==='compartido') assert.doesNotMatch(request.details,/Acepta la parte proporcional/);
  }
});
function adminContext(overrides={}) {
  const writes=[],mail=[],finals=[],context={...utils,console,db:{},appId:'app',user:{email:'admin@example.com'},students:[profile],todayStr:'2026-11-06',
    getFixedStudentClasses:()=>[{id:'c1'}],recurringClassesOnly:[],TADOSI_REQUIRED_GESTION_TYPES:new Set(['alta_mitolocker','baja_servicios','baja']),EXTRA_SERVICE_CONFIG_BY_TYPE:{},
    window:{confirm:()=>true},alert:noop,doc:(...p)=>p.slice(1).join('/'),updateDoc:async(ref,data)=>writes.push({ref,data:clean(data)}),
    resolveStudentEmail:()=>profile.email,isExtraServiceGestion:g=>g.type==='alta_mitolocker',
    finalizeGestionStatus:async(...args)=>finals.push(args),sendStudentNotification:async data=>mail.push(data),promptScheduledClassEndDate:()=> '2026-11-30',getScheduledClassStartAfterEndDate:()=> '2026-12-01',
    buildScheduledExecutionUpdate:(date,extra)=>({scheduledClassEndDate:date,scheduledEffectiveDate:'2026-12-01',...extra}),formatDateSpanish:date=>date,
    ...overrides};
  context.getExtraServiceConfigByType=load(0,'getExtraServiceConfigByType',context);
  context.getExtraServiceConfigForGestion=g=>context.getExtraServiceConfigByType(g.type,g);
  context.gestionRequiresTadosi=load(0,'gestionRequiresTadosi',context);
  context.isGestionReadyForExecution=g=>!context.gestionRequiresTadosi(g)||g.tadosiDone===true;
  return {context,writes,mail,finals};
}
test('admin activa la modalidad solicitada; gratis no exige Tadosi y exclusivo exige prepararlo',async()=>{
  for (const mode of ['compartido','exclusivo']) {
    const {context,writes,mail,finals}=adminContext({students:[{...profile,hasMitolocker:false}]});
    const request={studentId:profile.id,studentName:profile.name,type:'alta_mitolocker',mitolockerMode:mode};
    const execute=load(0,'updateGestionStatus',context);
    if(mode==='exclusivo') {
      const blocked=await execute('g1','completado',request,{skipConfirm:true,silent:true});assert.equal(blocked.ok,false);assert.equal(writes.length,0);
      request.tadosiDone=true;
    }
    const result=await execute('g1','completado',request,{skipConfirm:true,silent:true});
    assert.equal(result.ok,true);assert.equal(writes[0].data.hasMitolocker,true);assert.equal(writes[0].data.mitolockerMode,mode);assert.equal(finals.length,1);
    assert.match(mail[0].body,mode==='compartido'?/Modalidad gratuita/:/5 €\/mes/);assert.doesNotMatch(mail[0].body,/Ya puedes reservar sala/);
  }
});
test('admin aplica el contrato y cierra el alta juntos tras comprobar la solicitud del servidor', async () => {
  const student = {...profile, name: 'Alumna Ficticia', classes: ['c1'], hasMitolocker: false};
  const draft = {...locker.createMitolockerContractDraft(student, {uid: 'student-uid', email: student.email}), mode: 'exclusivo', instrument: 'Guitarra ficticia', accepted: true};
  const contract = {...await locker.createMitolockerAcceptance(draft), acceptedAt: {seconds: 1793955600}};
  const request = {type: 'alta_mitolocker', studentId: student.id, studentName: student.name, studentEmail: student.email, status: 'pendiente', mitolockerMode: 'exclusivo', extraMonthlyFee: 5, tadosiDone: true, mitolockerContract: contract};
  const commits = [];
  let saved = {...request, tadosiDone: false};
  const {context, mail} = adminContext({
    students: [student], mitolockerEvidenceError: locker.mitolockerEvidenceError,
    isGestionTadosiDone: gestion => gestion.tadosiDone === true,
    runTransaction: async (_, callback) => {
      const writes = [];
      await callback({get: async ref => ({data: () => ref.endsWith('/g1') ? saved : student}), update: (ref, data) => writes.push({ref, data: clean(data)})});
      commits.push(writes);
    }
  });
  const execute = load(0, 'updateGestionStatus', context);
  const options = {skipConfirm: true, silent: true};
  assert.match((await execute('g1', 'completado', request, options)).message, /Tadosi/);
  saved = {...request, mitolockerContract: {...contract, text: contract.text + ' alterado'}};
  assert.match((await execute('g1', 'completado', request, options)).message, /huella/);
  assert.equal(commits.length, 0);
  assert.equal(mail.length, 0);
  saved = request;
  const result = await execute('g1', 'completado', request, options);
  assert.equal(result.ok, true, result.message);
  assert.equal(commits.length, 1);
  assert.equal(commits[0][0].data.mitolockerContractGestionId, 'g1');
  assert.equal(commits[0][0].data.mitolockerMode, 'exclusivo');
  assert.equal(commits[0][1].data.status, 'completado');
});

test('el selector Mitolocker empieza vacío y desmarca la aceptación al cambiar la modalidad', async () => {
  const {transformWithOxc} = await import('vite');
  const runtime = await import('react/jsx-runtime');
  const source = await readFile('src/components/MitolockerContractForm.jsx', 'utf8');
  const fn = source.slice(source.indexOf('export default function')).replace('export default ', '');
  const code = (await transformWithOxc(fn, 'MitolockerContractForm.jsx')).code;
  const Form = vm.runInNewContext(`${code};MitolockerContractForm`, {...locker, ...utils, require: () => runtime, MitoversoContractDocument: noop});
  const inputs = tree => {
    const found = [];
    function visit(node) {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node || typeof node !== 'object') return;
      if (node.type === 'input') found.push(node.props);
      visit(node.props?.children);
    }
    visit(tree);
    return found;
  };
  const draft = locker.createMitolockerContractDraft(profile, {uid: 'student-uid', email: profile.email});
  const changes = [];
  const first = inputs(Form({draft, onChange: value => changes.push(value)}));
  assert.deepEqual(first.map(input => input.checked), [false, false]);
  const selected = inputs(Form({draft: {...draft, mode: 'compartido', accepted: true}, onChange: value => changes.push(value)}));
  selected.find(input => input.value === 'exclusivo').onChange();
  assert.equal(changes[0].mode, 'exclusivo');
  assert.equal(changes[0].accepted, false);
});
test('admin rechaza cambiar a otra modalidad por una solicitud antigua y programa las bajas de servicios',async()=>{
  const {context,writes,finals}=adminContext();const execute=load(0,'updateGestionStatus',context);
  const conflict=await execute('g1','completado',{studentId:profile.id,type:'alta_mitolocker',mitolockerMode:'compartido'},{skipConfirm:true,silent:true});assert.equal(conflict.ok,false);assert.equal(writes.length,0);
  const request={...selection,type:'baja_servicios',studentId:profile.id,studentName:profile.name,tadosiDone:true};
  const scheduled=await execute('g2','completado',request,{skipConfirm:true,silent:true});
  assert.equal(scheduled.ok,true);assert.equal(writes.length,0);assert.equal(finals[0][4].scheduledAction,'baja_servicios');assert.equal(finals[0][4].scheduledEffectiveDate,'2026-12-01');
});
function consolidationContext(student,hasClasses) {
  const writes=[],effects=[],context={...utils,db:{},appId:'app',todayStr:'2026-12-01',user:{email:'admin'},allClasses:[],
    doc:(...p)=>p.slice(1).join('/'),getDocFromServer:async()=>({exists:()=>true,data:()=>({...student})}),updateDoc:async(ref,data)=>writes.push({ref,data:clean(data)}),
    hasRemainingCommittedFixedSeat:()=>hasClasses,cancelStudentGymusikForFinalBaja:async()=>effects.push('gymusik'),cancelStudentMitoboxFromDate:async()=>effects.push('mitobox'),
    resetStudentTrivia:async()=>effects.push('trivia'),voidStudentTickets:async()=>effects.push('tickets'),cancelStudentStatesForFinalBaja:async()=>effects.push('states'),
    getScheduledGestionEffectiveDate:()=> '2026-12-01',buildConsolidatedGestionUpdate:(g,summary,extra)=>({summary,...extra}),
    isTotalBajaGestion:g=>g.bajaScope==='total',getGestionSourceClass:()=>null,getScheduledGestionEndDate:()=> '2026-11-30',formatClassLine:()=> 'Guitarra',};
  return {context,writes,effects};
}
test('consolidar solo un servicio conserva clases, otros servicios, tickets y puntos',async()=>{
  const {context,writes,effects}=consolidationContext(profile,true);
  const result=await load(0,'consolidateScheduledServiceBajaGestion',context)({...selection,id:'g1',studentId:profile.id,type:'baja_servicios'});
  assert.equal(result.ok,true);assert.equal(result.finalizedGlobalBaja,false);
  assert.deepEqual(writes[0].data,{hasMitolocker:false,mitolockerMode:''});assert.deepEqual(effects,[]);
});
test('ejecutar una baja de servicios efectiva hoy o antes aplica la selección en la misma acción', async () => {
  for (const [endDate, effectiveDate] of [['2026-11-05', '2026-11-06'], ['2026-11-04', '2026-11-05']]) {
    const {context: consolidation, writes, effects} = consolidationContext(profile, true);
    const {context, mail, finals} = adminContext({
      promptScheduledClassEndDate: () => endDate,
      getScheduledClassStartAfterEndDate: () => effectiveDate,
      buildScheduledExecutionUpdate: (date, extra) => ({scheduledClassEndDate: date, scheduledEffectiveDate: effectiveDate, ...extra}),
      consolidateScheduledServiceBajaGestion: load(0, 'consolidateScheduledServiceBajaGestion', {
        ...consolidation, getScheduledGestionEffectiveDate: gestion => gestion.bajaEffectiveDate
      })
    });
    const request = {...selection, cancelledServiceKeys: ['mitobox', 'mitolocker'], type: 'baja_servicios', studentId: profile.id, studentName: profile.name, tadosiDone: true};
    const result = await load(0, 'updateGestionStatus', context)('g1', 'completado', request, {skipConfirm: true, silent: true});
    assert.equal(result.ok, true, result.message);
    assert.equal(finals[0][4].scheduledEffectiveDate, effectiveDate);
    assert.equal(writes[0]?.ref, 'artifacts/app/students/s1');
    assert.deepEqual(writes[0].data, {hasMitobox: false, hasMitolocker: false, mitolockerMode: ''});
    assert.equal(writes[1].ref, 'artifacts/app/gestiones/g1');
    assert.deepEqual(effects, ['mitobox']);
    assert.match(mail[0].subject, /aplicada/i);
  }
});
test('una baja vencida que no se puede aplicar queda programada para reintentar sin confirmar al alumno', async () => {
  const {context, mail, finals} = adminContext({
    promptScheduledClassEndDate: () => '2026-11-05',
    getScheduledClassStartAfterEndDate: () => '2026-11-06',
    buildScheduledExecutionUpdate: (date, extra) => ({scheduledClassEndDate: date, scheduledEffectiveDate: '2026-11-06', ...extra}),
    consolidateScheduledServiceBajaGestion: async () => { throw new Error('Conexión interrumpida'); }
  });
  const request = {...selection, type: 'baja_servicios', studentId: profile.id, studentName: profile.name, tadosiDone: true};
  const result = await load(0, 'updateGestionStatus', context)('g1', 'completado', request, {skipConfirm: true, silent: true});
  assert.equal(result.ok, false);
  assert.match(result.message, /Programadas/);
  assert.equal(finals[0][4].scheduledAction, 'baja_servicios');
  assert.equal(finals[0][4].scheduledEffectiveDate, '2026-11-06');
  assert.deepEqual(mail, []);
});
test('cancelar el último servicio sin clases desactiva la cuenta; conservar otro mantiene el acceso',async()=>{
  for(const keepsOther of [false,true]) {
    const student={...profile,hasMitobox:keepsOther,hasMitoverso:false};
    const {context,writes,effects}=consolidationContext(student,false);
    const result=await load(0,'consolidateScheduledServiceBajaGestion',context)({...selection,id:'g1',studentId:profile.id,type:'baja_servicios'});
    assert.equal(result.finalizedGlobalBaja,!keepsOther);
    assert.equal(writes[0].data.globalStatus,keepsOther?undefined:'baja');
    assert.deepEqual(effects,keepsOther?[]:['states','trivia','tickets']);
  }
});
test('la baja de todas las clases conserva los servicios independientes no seleccionados',async()=>{
  const {context,writes,effects}=consolidationContext({...profile,scheduledBaja:true},false);
  const result=await load(0,'consolidateScheduledBajaGestion',context)({...selection,cancelledServiceKeys:[],id:'g1',studentId:profile.id,type:'baja',bajaScope:'total'});
  assert.equal(result.finalizedGlobalBaja,false);assert.deepEqual(effects,[]);
  assert.ok(writes.some(write=>write.data.scheduledBaja===false));assert.ok(writes.every(write=>write.data.globalStatus!=='baja'));
});
test('la baja combinada cancela lo marcado y Mitolocker dependiente, liberando reservas',async()=>{
  const {context,writes,effects}=consolidationContext({...profile,scheduledBaja:true},false);
  const result=await load(0,'consolidateScheduledBajaGestion',context)({...selection,cancelledServiceKeys:['mitobox'],id:'g1',studentId:profile.id,type:'baja',bajaScope:'total'});
  assert.equal(result.finalizedGlobalBaja,false);assert.deepEqual(effects,['mitobox']);
  assert.deepEqual(writes[0].data,{hasMitobox:false,hasMitolocker:false,mitolockerMode:''});
});
test('Mitolocker solo no permite acceder; la plaza o un servicio independiente son necesarios',()=>{
  const entitled=load(2,'hasStudentPortalEntitlement',{});
  assert.equal(entitled({classes:[],hasMitolocker:true,globalStatus:'activo'}),false);
  assert.equal(entitled({classes:['c1'],hasMitolocker:true,globalStatus:'activo'}),true);
  assert.equal(entitled({classes:[],hasMitolocker:true,globalStatus:'baja'}),false);
  assert.equal(entitled({classes:[],hasMitolocker:false}),false);
});

function biContext(gestiones=[]) {
  return {...utils,console,todayStr:'2026-11-04',currentMonthStartStr:'2026-11-01',currentMonthEndStr:'2026-11-30',
    temporaryRelocations:[],temporaryClassChanges:[],isPunctualClass:()=>false,isFixedClassStudent:()=>true,isStudentClassCommittedOnDate:()=>true,hasStudentClassEndedBeforeDate:()=>false,getStudentClassStartDate:()=>'',getStudentClassEndDate:()=>'',isPendingClassStartEntry:()=>false,getClassCenterName:()=> 'Reus',centerNamesForReporting:['Reus'],settings:{gastosFijos:{}},centers:[],gestiones,
    normalizeGestionDateString:value=>value,normalizeTeacherKey:value=>String(value).toLowerCase(),getOfficialTeacherName:value=>value,
    MAINTENANCE_MONTHLY_FEE:15,BI_WEEKS_PER_MONTH:4.33,
    EXTRA_SERVICE_CONFIG_BY_TYPE:{alta_mitobox:{monthlyFee:35},alta_mitoverso:{monthlyFee:15}}
  };
}
test('BI real incorpora exclusivos a ingresos y mantiene compartidos gratuitos en el recuento',()=>{
  const calculate=load(0,'buildBusinessIntelligence',biContext());
  const result=calculate({classesSnapshot:biClasses,studentsSnapshot:[profile,{...profile,id:'s2',hasMitobox:false,hasMitoverso:false,mitolockerMode:'compartido'}]});
  assert.equal(result.ingresosMitolocker,5);assert.equal(result.alumnosMitolockerCompartido,1);assert.equal(result.alumnosMitolockerExclusivo,1);
  assert.equal(result.ingresosExtras,55);assert.equal(result.totalIngresos,55);assert.equal(result.beneficioNeto,55);
});
test('BI respeta la fecha de baja, conserva otros ingresos y no reaplica bajas históricas consolidadas',()=>{
  for (const effectiveDate of ['2026-11-01','2026-12-01']) {
    const calculate=load(0,'buildBusinessIntelligence',biContext([{...selection,type:'baja_servicios',studentId:profile.id,status:'completado',scheduledEffectiveDate:effectiveDate}]));
    const result=calculate({classesSnapshot:biClasses,studentsSnapshot:[profile]});
    assert.equal(result.ingresosMitolocker,effectiveDate==='2026-11-01'?0:5);assert.equal(result.ingresosMitobox,35);assert.equal(result.ingresosMitoverso,15);
  }
  const calculate=load(0,'buildBusinessIntelligence',biContext([{...selection,type:'baja',bajaScope:'total',studentId:profile.id,status:'completado',scheduledEffectiveDate:'2026-10-01',consolidatedAt:'2026-10-01'}]));
  assert.equal(calculate({classesSnapshot:biClasses,studentsSnapshot:[profile]}).ingresosMitolocker,5);
});

test('cancelación de Mitobox libera el aforo una sola vez al reintentar',async()=>{
  const reservation={studentId:'s1',slotId:'slot1',status:'confirmed',reservationDate:'2026-12-05'};
  const slot={reservedCount:2};const data={'artifacts/app/mitoboxReservations/r1':reservation,'artifacts/app/mitoboxSlots/slot1':slot};
  const ctx={db:{},appId:'app',collection:(...p)=>p.slice(1).join('/'),where:noop,query:noop,doc:(...p)=>p.slice(1).join('/'),
    getDocs:async()=>({docs:[{id:'r1',data:()=>reservation}]}),isActiveMitoboxReservation:r=>r.status==='confirmed',
    runTransaction:async(db,callback)=>callback({get:async ref=>({exists:()=>Boolean(data[ref]),data:()=>data[ref]}),update:(ref,patch)=>Object.assign(data[ref],patch)})};
  const cancel=load(0,'cancelStudentMitoboxFromDate',ctx);
  await cancel('s1','2026-12-01');await cancel('s1','2026-12-01');
  assert.equal(slot.reservedCount,1);assert.equal(reservation.status,'cancelled');
});

test('la ventana de baja muestra casillas solo para servicios activos; sin extras conserva la opción habitual',async()=>{
  const {transformWithOxc}=await import('vite');
  const runtime=await import('react/jsx-runtime');
  const {renderToStaticMarkup}=await import('react-dom/server');
  const code=(await transformWithOxc(`const render = ${expression(1,'renderGestionModal')};`, 'GestionModal.jsx')).code;
  for (const hasExtras of [true,false]) {
    const {context}=studentContext({profile:hasExtras?profile:{...profile,hasMitolocker:false,hasMitoverso:false,hasMitobox:false}});
    Object.assign(context,{require:()=>runtime,gestionModal:{type:'baja',icon:noop},fixedSeatClasses:[{id:'c1'}],isSendingGestion:false,
      resolvedRecoverySubject:'',selectedInst:'',classCatalogError:'',classCatalogLoaded:true,classCatalogLoading:false,
      activeServicesForBaja:utils.activeFixedServices(context.profile),setBajaClassesRequested:noop,setBajaServiceKeys:noop,
      sendGestion:noop,Send:noop,X:noop,CheckCircle:noop,AlertCircle:noop,getDayName:()=> 'Lunes',hasAvailableSeatForGestion:()=>true,
    });
    context.getGestionUiCopy=load(1,'getGestionUiCopy',context);
    const render=vm.runInNewContext(`${code}; render`,context);
    const html=renderToStaticMarkup(render());
    const count=(html.match(/type="checkbox"/g)||[]).length;
    assert.equal(count,hasExtras?4:0);
    if(hasExtras) {assert.match(html,/Mitolocker exclusivo/);assert.match(html,/Mitobox/);assert.match(html,/Mitoverso/);assert.doesNotMatch(html,/Gymusik/);}
    else {assert.match(html,/Solicita la baja de tu plaza actual/);assert.doesNotMatch(html,/Qué quieres dar de baja/);}
  }
});

test('proyección BI incluye ambas altas y respeta el alcance de bajas futuras sin reaplicar históricos',()=>{
  const cases=[
    {gestiones:[{type:'alta_mitolocker',mitolockerMode:'compartido',studentId:profile.id,status:'pendiente'}],student:{...profile,hasMitolocker:false},mode:'compartido'},
    {gestiones:[{type:'alta_mitolocker',mitolockerMode:'exclusivo',studentId:profile.id,status:'pendiente'}],student:{...profile,hasMitolocker:false},mode:'exclusivo'},
    {gestiones:[{type:'alta_mitolocker',mitolockerMode:'exclusivo',studentId:profile.id,status:'pendiente'}],student:{...profile,hasMitolocker:false,mitolockerMode:''},mode:'',hasSeat:false},
    {gestiones:[{...selection,type:'baja_servicios',studentId:profile.id,status:'pendiente'}],student:profile,mode:''},
    {gestiones:[{...selection,cancelledServiceKeys:[],type:'baja',bajaScope:'total',studentId:profile.id,status:'completado',scheduledEffectiveDate:'2026-12-01'}],student:profile,mode:'exclusivo'},
    {gestiones:[{...selection,type:'baja_servicios',studentId:profile.id,status:'completado',scheduledEffectiveDate:'2026-10-01',consolidatedAt:'2026-10-01'}],student:profile,mode:'exclusivo'}
  ];
  for (const scenario of cases) {
    const ctx={...utils,useMemo:fn=>fn(),recurringClassesOnly:scenario.hasSeat===false?[]:biClasses,students:[scenario.student],maintenancePeriods:[],gestiones:scenario.gestiones,nextMonthStartStr:'2026-12-01',nextMonthEndStr:'2026-12-31',
      normalizeGestionDateString:value=>value,EXTRA_SERVICE_GESTION_TYPES:new Set(['alta_mitolocker']),PROJECTABLE_GESTION_TYPES:new Set(['baja','baja_servicios']),
      isPunctualClass:()=>false,isFixedClassStudent:()=>true,isStudentClassCommittedOnDate:()=>true,
      isExtraServiceGestionType:type=>type==='alta_mitolocker',getMonthStartFromGestionTarget:()=> '2026-12-01'};
    ctx.getExtraServiceConfigByType=load(0,'getExtraServiceConfigByType',ctx);
    // Ejecuta ambas declaraciones en el orden real de render. Inyectar la función
    // como un doble oculta un ReferenceError si el useMemo la llama demasiado pronto.
    const declarations = ['biProjectionInputs', 'getFixedStudentClasses']
      .sort((a, b) => sources[0].indexOf(`const ${a} =`) - sources[0].indexOf(`const ${b} =`))
      .map(name => `const ${name} = ${expression(0, name)};`)
      .join('\n');
    const projection=vm.runInNewContext(`${declarations}\nbiProjectionInputs`,ctx);
    const student=projection.potential.students[0];
    assert.equal(student.mitolockerMode,scenario.mode);assert.equal(student.hasMitolocker,Boolean(scenario.mode));assert.equal(student.hasMitobox,true);
  }
});

test('al dejar la última plaza ambas modalidades de Mitolocker se cancelan aunque no estén marcadas',async()=>{
  for(const mode of ['compartido','exclusivo']) {
    const {context,writes}=consolidationContext({...profile,mitolockerMode:mode,scheduledBaja:true},false);
    const result=await load(0,'consolidateScheduledBajaGestion',context)({...selection,cancelledServiceKeys:[],id:'g1',studentId:profile.id,type:'baja',bajaScope:'total'});
    assert.equal(result.finalizedGlobalBaja,false); // Mitobox/Mitoverso remain independent.
    assert.equal(writes[0].data.hasMitolocker,false);assert.equal(writes[0].data.mitolockerMode,'');
    assert.ok(writes.every(write=>write.data.hasMitobox!==false&&write.data.hasMitoverso!==false));
    const student={...profile,hasMitobox:false,hasMitoverso:false,hasGymusik:false,mitolockerMode:mode};
    const solo=consolidationContext(student,false);
    const final=await load(0,'consolidateScheduledBajaGestion',solo.context)({...selection,cancelledServiceKeys:[],id:'g1',studentId:profile.id,type:'baja',bajaScope:'total'});
    assert.equal(final.finalizedGlobalBaja,true);assert.ok(solo.writes.some(write=>write.data.globalStatus==='baja'));
  }
});
test('el alumno ve y envía la cancelación automática de Mitolocker junto a la última clase',async()=>{
  const {context,writes,toasts}=studentContext({profile,bajaServiceKeys:[]});
  await load(1,'sendGestion',context)();
  assert.equal(writes.length,1,JSON.stringify(toasts));assert.deepEqual(writes[0].cancelledServiceKeys,['mitolocker']);assert.equal(writes[0].cancelClasses,true);
});
test('sin plaza no se puede solicitar ni activar Mitolocker desde alumno, bandeja o ficha',async()=>{
  const writes=[],context={...utils,DoorOpen:noop,console,EXTRA_SERVICES:{},fixedMyClasses:[],extraSignupModal:'mitolocker_compartido',profile:{...profile,hasMitolocker:false},isSendingExtraSignup:false,
    hasPendingExtraSignup:()=>false,user:{email:profile.email},db:{},appId:'app',setDoc:async()=>writes.push('signup'),showToast:noop,setIsSendingExtraSignup:noop,setExtraSignupModal:noop};
  context.getExtraServiceConfig=load(1,'getExtraServiceConfig',context);
  await load(1,'sendExtraSignupRequest',context)();assert.deepEqual(writes,[]);
  const admin=adminContext({getFixedStudentClasses:()=>[],students:[{...profile,hasMitolocker:false}]});
  const result=await load(0,'updateGestionStatus',admin.context)('g1','completado',{studentId:profile.id,type:'alta_mitolocker',mitolockerMode:'compartido'},{skipConfirm:true,silent:true});
  assert.equal(result.ok,false);assert.equal(admin.writes.length,0);
  await load(0,'changeStudentMitolocker',admin.context)(profile.id,'exclusivo');assert.equal(admin.writes.length,0);
});
test('BI no cuenta ni cobra Mitolocker si no queda ninguna plaza de clases',()=>{
  const result=load(0,'buildBusinessIntelligence',biContext())({studentsSnapshot:[profile]});
  assert.equal(result.ingresosMitolocker,0);assert.equal(result.alumnosMitolockerExclusivo,0);assert.equal(result.ingresosExtras,50);
});

test('el panel de alumno carga con el modal de Extras cerrado y admite claves nulas', async () => {
  const context={...utils,EXTRA_SERVICES:{mitobox:{name:'Mitobox'},mitoverso:{name:'Mitoverso'}},DoorOpen:noop};
  const config=load(1,'getExtraServiceConfig',context);
  for(const key of [null,undefined,'',false,{},'desconocido']) assert.equal(config(key),null);
  assert.equal(config('mitobox').name,'Mitobox');assert.equal(config('mitoverso').name,'Mitoverso');
  assert.equal(config('mitolocker_compartido').monthlyFee,0);assert.equal(config('mitolocker_exclusivo').monthlyFee,5);
  const {transformWithOxc}=await import('vite');
  const runtime=await import('react/jsx-runtime');
  const code=(await transformWithOxc(`const render = ${expression(1,'renderExtraSignupModal')};`,'ExtraSignupModal.jsx')).code;
  for(const key of [null,undefined,'']) {
    const render=vm.runInNewContext(`${code};render`,{...context,require:()=>runtime,getExtraServiceConfig:config,extraSignupModal:key});
    assert.equal(render(),null);
  }
});
