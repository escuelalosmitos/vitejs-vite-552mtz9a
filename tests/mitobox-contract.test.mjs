import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { parse } from 'espree';
import * as contract from '../src/components/mitoboxContractUtils.js';
import * as services from '../src/components/fixedServicesUtils.js';
const sources=await Promise.all(['StudentPortal.jsx','AdminPortal.jsx'].map(name=>readFile(`src/components/${name}`,'utf8')));
const asts=sources.map(source=>parse(source,{ecmaVersion:'latest',sourceType:'module',range:true,ecmaFeatures:{jsx:true}}));
const noop=()=>{};
const profile={id:'student-1',name:'Ana López Pérez',email:'ana@example.com',authUid:'user-1'};
const user={uid:'user-1',email:'ana@example.com'};
const draft=(patch={})=>({...contract.createMitoboxContractDraft(profile,user,35,'2026-11-04T10:00:00.000Z'),accepted:true,immediateStart:true,...patch});
function expression(index,name) {let result;const walk=node=>{if(!node||typeof node!=='object')return;if(node.type==='VariableDeclarator'&&node.id.name===name)result=sources[index].slice(...node.init.range);for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);};walk(asts[index]);assert.ok(result,name);return result;}
const load=(index,name,context)=>vm.runInNewContext(`(${expression(index,name)})`,context);
const plain=value=>JSON.parse(JSON.stringify(value));
const withServerTime=acceptance=>({...acceptance,acceptedAt:{seconds:Math.floor(Date.now()/1000)-3600}});

test('contrato completo: las 25 cláusulas se personalizan sin DNI del solicitante ni marcadores pendientes',()=>{
  const text=contract.buildMitoboxContractText(draft());
  assert.equal((text.match(/^## \d+\./gm)||[]).length,25);
  assert.match(text,/Ana López Pérez/);assert.match(text,/ana@example.com/);assert.match(text,/student-1/);
  assert.match(text,/Tarifa de esta solicitud: 35 €\/mes/);assert.match(text,/44049942C/); // Centro, supplied in the original contract.
  assert.doesNotMatch(text,/Nombre del cliente|NIF del cliente|Población del cliente|Dia actual|\{\{/);
  for (const clause of ['tres horas','suscripción MITOBOX activa','Volumen y convivencia acústica','Carácter personal','Conocimiento y aceptación'])assert.ok(text.includes(clause),clause);
  assert.match(text,/14 días naturales/);assert.match(text,/no equivale a una firma electrónica cualificada/);
});
test('identidad: se usa el nombre principal, se separa al representante y se impide aceptar identidades incompletas',()=>{
  const value=contract.createMitoboxContractDraft({...profile,alias:'Ninja',useAlias:true},user,50);
  assert.equal(value.signerFullName,profile.name);assert.equal(value.monthlyFee,50);
  const guardian=draft({role:'guardian',signerFullName:'Pedro López García'});
  assert.equal(contract.mitoboxDraftError(guardian),'');
  const text=contract.buildMitoboxContractText(guardian);assert.match(text,/Pedro López García/);assert.match(text,/representante legal/);assert.match(text,/Ana López Pérez/);
  for(const patch of [{accepted:false},{signerFullName:''},{signerFullName:'Ana'},{role:'adult',studentFullName:'Otra Persona'},{authUid:''}])assert.ok(contract.mitoboxDraftError(draft(patch)));
});
test('el registro conserva el texto exacto y rechaza alteraciones del texto, firmante o huella',async()=>{
  const accepted=await contract.createMitoboxAcceptance(draft());
  assert.equal(await contract.verifyMitoboxAcceptance(accepted),true);assert.match(accepted.sha256,/^[a-f0-9]{64}$/);
  for(const patch of [{text:accepted.text+' cambia'},{signerFullName:'Otra Persona'},{sha256:'0'.repeat(64)},{accepted:false}])assert.equal(await contract.verifyMitoboxAcceptance({...accepted,...patch}),false);
  const literal=await contract.createMitoboxAcceptance(draft({signerFullName:'Ana $& López',studentFullName:'Ana $& López'}));assert.ok(literal.text.includes('Ana $& López'));
});
test('fecha de activación: usa recepción del servidor y no la fecha declarada por el navegador',async()=>{
  const accepted=await contract.createMitoboxAcceptance(draft());
  assert.equal(contract.mitoboxEarliestActivation(accepted),'');
  const known={...accepted,acceptedAt:{seconds:1793786400}};
  assert.equal(contract.mitoboxEarliestActivation(known),new Date(1793786400*1000).toISOString());
  assert.ok(Date.parse(contract.mitoboxEarliestActivation({...known,immediateStart:false}))>=1793786400*1000+14*86400000);
  assert.match(contract.buildMitoboxContractCopy(known,'g1'),/REGISTRO DE ACEPTACIÓN/);
});
function studentContext(patch={}){
 const writes=[],toasts=[],mail=[];
 const context={...contract,...services,console,profile,user,db:{},appId:'app',extraSignupModal:'mitobox',isSendingExtraSignup:false,
  mitoboxContractDraft:draft(),fixedMyClasses:[{id:'class-1'}],hasPendingExtraSignup:()=>false,
  getExtraServiceConfig:()=>({key:'mitobox',type:'alta_mitobox',name:'Mitobox',title:'Alta Mitobox',monthlyFee:35}),
  doc:(...parts)=>parts.slice(1).join('/'),setDoc:async(ref,data)=>writes.push({ref,data}),serverTimestamp:()=>({serverTimestamp:true}),
  ADMIN_COPY_GESTION_TYPES:new Set(),APPS_SCRIPT_URL:'mock',fetch:async(url,options)=>mail.push(JSON.parse(options.body)),
  showToast:(...args)=>toasts.push(args),setIsSendingExtraSignup:noop,setExtraSignupModal:noop,...patch};
 return {context,writes,toasts,mail};
}
test('solicitud real: bloquea el envío sin aceptar y sin crear gestión ni activar Mitobox',async()=>{
 for(const patch of [{mitoboxContractDraft:null},{mitoboxContractDraft:draft({accepted:false})},{mitoboxContractDraft:draft({authUid:'other'})},{mitoboxContractDraft:draft({monthlyFee:50})}]){
  const {context,writes,toasts}=studentContext(patch);await load(0,'sendExtraSignupRequest',context)();assert.equal(writes.length,0);assert.equal(toasts.at(-1)[1],'error');
 }
});
test('solicitud real: conserva aceptación y sello del servidor, tarifa de alumno o externo y copia para su cuenta',async()=>{
 for(const fee of [35,50]){
  const {context,writes,mail}=studentContext({mitoboxContractDraft:draft({monthlyFee:fee}),fixedMyClasses:fee===35?[{id:'class-1'}]:[]});
  await load(0,'sendExtraSignupRequest',context)();assert.equal(writes.length,1);const payload=writes[0].data;
  assert.equal(payload.status,'pendiente');assert.equal(payload.extraMonthlyFee,fee);assert.equal(payload.mitoboxContract.signerFullName,profile.name);
  assert.deepEqual(payload.mitoboxContract.acceptedAt,{serverTimestamp:true});assert.equal(payload.hasMitobox,undefined);
  assert.equal(mail[0].to,user.email);assert.ok(mail[0].body.includes(payload.mitoboxContract.sha256));
 }
});
function adminContext(acceptance,patch={}){
 const writes=[],mails=[],finals=[];
 const request={id:'g1',studentId:profile.id,studentName:profile.name,studentEmail:profile.email,type:'alta_mitobox',status:'pendiente',mitoboxContract:acceptance,tadosiDone:true,mitoboxIdentityVerifiedAt:'2026-11-04T10:00:00Z'};
 const ctx={...contract,...services,console,db:{},appId:'app',user:{email:'admin@example.com'},students:[profile],
  isGestionReadyForExecution:()=>true,window:{confirm:()=>true},resolveStudentEmail:()=>profile.email,isExtraServiceGestion:()=>true,
  getExtraServiceConfigForGestion:()=>({key:'mitobox',name:'Mitobox',studentFlag:'hasMitobox',monthlyFee:acceptance?.monthlyFee||35}),
  doc:(...parts)=>parts.slice(1).join('/'),getDocFromServer:async()=>({exists:()=>true,data:()=>request}),
  updateDoc:async(ref,data)=>writes.push({ref,data:plain(data)}),sendStudentNotification:async data=>mails.push(data),finalizeGestionStatus:async(...args)=>finals.push(args),
  getFixedStudentClasses:()=>[{id:'class-1'}],isGestionTadosiDone:g=>g.tadosiDone===true,formatDateSpanish:value=>value,alert:noop,...patch};
 return {ctx,request,writes,mails,finals};
}
test('admin no activa sin contrato, con identidad sin contrastar, tarifa distinta o inicio prematuro',async()=>{
 const accepted=withServerTime(await contract.createMitoboxAcceptance(draft()));
 for(const change of [request=>{request.mitoboxContract=null;},request=>{request.mitoboxContract={...accepted,sha256:'0'.repeat(64)};},request=>{request.mitoboxIdentityVerifiedAt='';},request=>{request.mitoboxContract.immediateStart=false;}]){
  const sample=adminContext(structuredClone(accepted));change(sample.request);
  const result=await load(1,'updateGestionStatus',sample.ctx)('g1','completado',sample.request,{skipConfirm:true,silent:true});
  assert.equal(result.ok,false);assert.equal(sample.writes.length,0);
 }
 const outside=adminContext(accepted,{getFixedStudentClasses:()=>[]});
 const result=await load(1,'updateGestionStatus',outside.ctx)('g1','completado',outside.request,{skipConfirm:true,silent:true});assert.equal(result.ok,false);assert.equal(outside.writes.length,0);
});
test('admin activa con evidencia válida y conserva referencia al contrato y cuota aceptada',async()=>{
 const accepted=withServerTime(await contract.createMitoboxAcceptance(draft()));
 const {ctx,request,writes,mails,finals}=adminContext(accepted);
 const result=await load(1,'updateGestionStatus',ctx)('g1','completado',request,{skipConfirm:true,silent:true});
 assert.equal(result.ok,true);assert.equal(writes[0].data.hasMitobox,true);assert.equal(writes[0].data.mitoboxMonthlyFee,35);assert.equal(writes[0].data.mitoboxContractSha256,accepted.sha256);
 assert.equal(finals.length,1);assert.ok(mails[0].body.includes(accepted.text));
});
test('Mitolocker conserva su posición después de Mitobox y muestra ambas modalidades en una sola tarjeta',async()=>{
 const section=sources[0].slice(sources[0].indexOf('Servicios permanentes'));
 assert.ok(section.indexOf('>Mitoverso</h3>')<section.indexOf('>Mitobox</h3>'));
 const block=section.slice(section.indexOf('>Mitobox</h3>'),section.indexOf('<GymusikStudent'));
 assert.equal((block.match(/>Mitolocker<\/h3>/g)||[]).length,1);
 assert.match(block,/Compartido · Gratis/);assert.match(block,/Exclusivo · 5 €\/mes/);
 assert.match(block,/openExtraSignupModal\('mitolocker'\)/);
 assert.ok(block.indexOf('<DoorOpen')<block.indexOf('>Mitolocker'));
});
test('el formulario de contrato obliga a aceptar de nuevo tras cambiar identidad o inicio anticipado',async()=>{
 const {transformWithOxc}=await import('vite');const runtime=await import('react/jsx-runtime');
 const source=await readFile('src/components/MitoboxContractForm.jsx','utf8');
 const fn=source.slice(source.indexOf('export default function MitoboxContractForm')).replace('export default ','');
 const code=(await transformWithOxc(fn,'MitoboxContractForm.jsx')).code;
 const changes=[];const context={...contract,require:()=>runtime,MitoboxContractDocument:noop};
 const Form=vm.runInNewContext(`${code};MitoboxContractForm`,context);
 const tree=Form({draft:draft(),onChange:value=>changes.push(value)});const controls=[];
 const walk=node=>{if(!node||typeof node!=='object')return;if(['input','select'].includes(node.type))controls.push(node);const c=node.props?.children;(Array.isArray(c)?c:[c]).forEach(walk);};walk(tree);
 const name=controls.find(node=>node.type==='input'&&node.props.type!=='checkbox');name.props.onChange({target:{value:'Ana García Pérez'}});
 assert.equal(changes[0].accepted,false);assert.equal(changes[0].signerFullName,'Ana García Pérez');
 const immediate=controls.find(node=>node.props.type==='checkbox');immediate.props.onChange({target:{checked:false}});assert.equal(changes[1].accepted,false);
 const accept=controls.filter(node=>node.props.type==='checkbox').at(-1);accept.props.onChange({target:{checked:true}});assert.equal(changes[2].accepted,true);
});

test('sin inicio anticipado admin respeta el plazo completo y permite activar después de su vencimiento',async()=>{
 const waiting=withServerTime(await contract.createMitoboxAcceptance(draft({immediateStart:false})));
 const sample=adminContext(waiting);const result=await load(1,'updateGestionStatus',sample.ctx)('g1','completado',sample.request,{skipConfirm:true,silent:true});
 assert.equal(result.ok,false);assert.match(result.message,/no pidió inicio anticipado/);assert.equal(sample.writes.length,0);
 const elapsed={...waiting,acceptedAt:{seconds:Math.floor(Date.now()/1000)-20*86400}};
 const ready=adminContext(elapsed);const activated=await load(1,'updateGestionStatus',ready.ctx)('g1','completado',ready.request,{skipConfirm:true,silent:true});assert.equal(activated.ok,true);
 const inNovember={...waiting,acceptedAt:{seconds:Date.parse('2026-11-04T10:00:00Z')/1000}};
 assert.equal(contract.mitoboxEarliestActivation(inNovember),'2026-11-18T23:00:00.000Z');
});
test('la comprobación de identidad queda ligada a la confirmación de Tadosi y al administrador',async()=>{
 const accepted=withServerTime(await contract.createMitoboxAcceptance(draft()));const {ctx,request,writes}=adminContext(accepted);
 request.tadosiDone=false;let prompt='';Object.assign(ctx,{isGestionTadosiDone:()=>false,gestionRequiresTadosi:()=>true,window:{confirm:text=>(prompt=text,true)}});
 await load(1,'markGestionTadosiDone',ctx)(request);
 assert.equal(writes.length,1);assert.equal(writes[0].data.tadosiDone,true);assert.equal(writes[0].data.mitoboxIdentityVerifiedBy,'admin@example.com');
 assert.match(prompt,/Ana López Pérez/);assert.match(prompt,/contrasta en Tadosi/);assert.ok(writes[0].data.mitoboxIdentityVerifiedAt);
});


test('domicilio del prestador en v2: nuevas aceptaciones y verificación de contratos v1 ya guardados', async () => {
  const fresh = await contract.createMitoboxAcceptance(draft());
  assert.equal(fresh.version, 'mitobox-2026-11-04-v2');
  assert.match(fresh.text, /con domicilio en \*\*Carrer Assalt, 1 \(Tarragona\)\*\*/);
  const previous = { ...draft(), version: 'mitobox-2026-11-04-v1', acceptedAtClient: '2026-11-04T10:01:00.000Z', acceptanceText: contract.MITOBOX_ACCEPTANCE_TEXT,
    text: contract.buildMitoboxContractText({ ...draft(), version: 'mitobox-2026-11-04-v1' }), sha256: "ce966829203cb9397cb762540ec8af6cbc133efbcf09e2594b9df7bfa43b1e7a" };
  assert.doesNotMatch(previous.text, /Carrer Assalt/);
  assert.equal(await contract.verifyMitoboxAcceptance(previous), true);
  assert.ok(contract.mitoboxDraftError(previous)); // Legacy text cannot be accepted as a new request.
  assert.ok(contract.buildMitoboxContractCopy(previous, 'old').includes(previous.text));
});
