import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as espree from 'espree';
const source=fs.readFileSync('src/components/AdminPortal.jsx','utf8');
const tree=espree.parse(source,{ecmaVersion:'latest',sourceType:'module',ecmaFeatures:{jsx:true},range:true});
const nodes=new Map();
function walk(n){if(!n||typeof n!=='object')return;if(n.type==='VariableDeclarator'&&n.id.type==='Identifier')nodes.set(n.id.name,n.init);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}
walk(tree);
function value(name,ctx){return vm.runInNewContext(source.slice(...nodes.get(name).range),ctx);}
const item={studentId:'s1',studentName:'Ana',reason:'En espera de apertura',row:{id:'origin',subject:'Guitarra',dayOfWeek:2,time:'18:00',sede:'Reus'}};
const option={id:'alternative',subject:'Guitarra',capacity:4,seats:{freeSpots:1,pendingStartCount:0,students:[{id:'s2'}]}};
const eligible=value('locatorAlternativeEligible',{getCommercialSeatDataForClass:c=>c.seats,isPunctualClass:c=>c.isPunctual});
test('alternativas: solo grupos operativos compatibles con plaza',()=>{
 assert.equal(eligible(option,item),true);
 for(const patch of [{id:'origin'},{subject:'Canto'},{capacity:1},{autoAdvanceStartDate:true},{isPunctual:true},{seats:{...option.seats,freeSpots:0}},{seats:{...option.seats,pendingStartCount:1}}])assert.equal(eligible({...option,...patch},item),false);
 for(const student of [{id:'s2',isMaintenance:true},{id:'s2',isFutureStart:true},{id:'s1'}])assert.equal(eligible({...option,seats:{...option.seats,students:[student]}},item),false);
});
test('plazas: mantenimiento, futuro y espera reservan; recolocación temporal no consume plaza fija',()=>{
 const calc=value('getCommercialSeatDataForClass',{students:[],todayStr:'2026-10-21',isFixedClassStudent:s=>!s.isTemporaryRelocation,hasStudentClassEndedBeforeDate:()=>false,getStudentClassStartDate:s=>s.start||'',getStudentClassEndDate:()=>'',isPendingClassStartEntry:s=>s.pending,isStudentInMaintenance:id=>id==='maintenance'});
 const seats=calc({capacity:4,students:[{id:'active'},{id:'maintenance'},{id:'future',start:'2026-11-01'},{id:'pending',pending:true},{id:'temporary',isTemporaryRelocation:true}]});
 assert.equal(seats.committedCount,4);assert.equal(seats.freeSpots,0);
});
test('riesgo: solo pérdida operativa; excluye hibernación, margen positivo y coste docente cero',()=>{
 const rows=[{id:'empty',ingresos:0,coste:0,isClassOperative:false},{id:'loss',ingresos:70,coste:103,isClassOperative:true},{id:'profit',ingresos:115,coste:103,isClassOperative:true},{id:'paco',ingresos:70,coste:0,isClassOperative:true}];
 const result=value('dangerRowsForView',{dangerViewMode:'actual',recurringClassesOnly:rows,locatorFinancials:{clasesRentabilidad:rows},buildDangerClassAnalysis:()=>({activeCount:1})});
 assert.deepEqual(Array.from(result,r=>r.id),['loss']);
});
test('inactivas: vacías sin oferta ni reservas',()=>{
 const rows=[{id:'empty'},{id:'web',isWebVisible:true},{id:'reserved',committed:1}];
 const result=value('locatorRowsForView',{useMemo:f=>f(),dangerViewMode:'actual',recurringClassesOnly:rows,projectedPlanningClasses:[],sortDangerRows:r=>r,buildDangerClassAnalysis:()=>({}),getClassStudentPlanningData:()=>[],getCommercialCommittedSeatCount:c=>c.committed||0,students:[],maintenancePeriods:[],todayStr:'2026-10-21'});
 assert.deepEqual(Array.from(result.filter(r=>r.isInactive),r=>r.id),['empty']);
});
test('plantillas: espera voluntaria y confirmación antes de cambiar horario',()=>{
 const compose=value('locatorEmailText',{getDayName:()=> 'martes',getClassCenterName:c=>c.sede,locatorClassLine:()=> 'Guitarra · jueves 18:00 · 70 €/mes'});
 const waiting=compose(item,[option]);assert.match(waiting.body,/Seguir esperando/);assert.match(waiting.body,/no tienes que hacer nada/);assert.match(waiting.body,/jueves 18:00/);
 assert.match(compose({...item,reason:'Único alumno del grupo'},[option]).body,/No modificaremos tu horario sin tu confirmación/);
});
const script=fs.readFileSync('instalacion-localizador/Localizador.gs','utf8');
function environment(aliases=['gestiones@escuelalosmitos.com']){
 const sent=[],original=[],props={};
 const ctx={console,GmailApp:{getAliases:()=>aliases,sendEmail:(...a)=>sent.push(a)},MailApp:{sendEmail(){}},Session:{getEffectiveUser:()=>({getEmail:()=> 'admin@escuelalosmitos.com'})},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>props[k]=v,getProperties:()=>props,deleteProperty:k=>delete props[k]})},ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})},doPostOriginal:e=>{original.push(e);return 'original';}};
 vm.createContext(ctx);vm.runInContext(script,ctx);return{ctx,sent,original};
}
const payload={type:'contacto_localizador',to:'alumno@example.com',subject:'Opciones',body:'Texto',requestId:'abcdefghijklmnopqrst'};
const post=data=>({postData:{contents:JSON.stringify(data)}});
test('Apps Script preserva todos los tipos originales',()=>{
 const {ctx,original,sent}=environment();for(const type of ['tablon_alumnos','recordatorio_encuesta','notificacion_profesor','confirmacion_alumno','notificacion_email','reporte_diario'])assert.equal(ctx.doPost(post({type})),'original');assert.equal(original.length,6);assert.equal(sent.length,0);
});
test('Apps Script fija Gestiones e impide repetir una misma solicitud',()=>{
 const {ctx,sent}=environment();assert.equal(ctx.doPost(post({...payload,from:'otro@example.com'})).ok,true);assert.equal(sent[0][3].from,'gestiones@escuelalosmitos.com');assert.equal(sent[0][3].replyTo,'gestiones@escuelalosmitos.com');assert.equal(ctx.doPost(post(payload)).duplicate,true);assert.equal(sent.length,1);
});
test('Apps Script rechaza alias ausente y destinatarios múltiples, sin caer en informes',()=>{
 const {ctx,sent,original}=environment([]);assert.equal(ctx.doPost(post(payload)).ok,false);assert.equal(sent.length,0);assert.equal(original.length,0);
 const env=environment();assert.equal(env.ctx.doPost(post({...payload,to:'a@example.com,b@example.com'})).ok,false);assert.equal(env.sent.length,0);
});
test('Gestiones como cuenta principal no necesita alias de sí misma',()=>{
 const {ctx,sent}=environment([]);ctx.Session.getEffectiveUser=()=>({getEmail:()=> 'gestiones@escuelalosmitos.com'});assert.equal(ctx.doPost(post(payload)).ok,true);assert.equal(sent[0][3].from,undefined);
});
