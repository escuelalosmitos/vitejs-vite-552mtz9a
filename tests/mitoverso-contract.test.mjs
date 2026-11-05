import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { parse } from 'espree';
import * as contract from '../src/components/mitoversoContractUtils.js';
import { canReserveMitoboxAt } from '../src/components/mitoboxUtils.js';
const profile={id:'student',name:'Ana López Pérez',email:'ana@example.com',authUid:'user'},user={uid:'user',email:profile.email};
const draft=(patch={})=>({...contract.createMitoversoContractDraft(profile,user,10,'2026-11-05T10:00:00Z'),accepted:true,immediateStart:true,...patch});
const noop=()=>{};
async function load(file,name,context){const source=await readFile(file,'utf8'),tree=parse(source,{ecmaVersion:'latest',sourceType:'module',range:true,ecmaFeatures:{jsx:true}});let node;function walk(n){if(!n||typeof n!=='object')return;if(n.type==='VariableDeclarator'&&n.id.name===name)node=n.init;for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}walk(tree);assert.ok(node);return vm.runInNewContext(`(${source.slice(...node.range)})`,context);}

test('Mitoverso conserva las 28 cláusulas y personaliza contratante, menor, cuota y fecha sin pedir DNI del usuario',()=>{
  const text=contract.buildMitoversoContractText(draft({role:'guardian',signerFullName:'Pedro López García',monthlyFee:20}));
  assert.equal((text.match(/^## \d+\./gm)||[]).length,28);
  for(const value of ['Pedro López García','Ana López Pérez',profile.email,'representante legal','20 €/mes','soporte@escuelalosmitos.com','alumnos.escuelalosmitos.com','Carrer Assalt, 1','no acredita por sí solo','firma electrónica cualificada'])assert.ok(text.includes(value),value);
  assert.doesNotMatch(text,/\{\{|\[DNI\/NIE\]|\[NOMBRE DEL USUARIO\]|\[LOCALIDAD\]|\[FECHA\]/);
  assert.equal(contract.createMitoversoContractDraft(profile,user).accepted,false);
  assert.equal(contract.mitoversoMonthlyFee(true),10);assert.equal(contract.mitoversoMonthlyFee(false),20);
});

test('el contrato Mitoverso conserva texto, versión y huella y rechaza alteraciones',async()=>{
  const accepted=await contract.createMitoversoAcceptance(draft());
  assert.equal(await contract.verifyMitoversoAcceptance(accepted),true);
  for(const patch of [{text:accepted.text+'alterado'},{monthlyFee:20},{sha256:'0'.repeat(64)},{signerFullName:'Otra Persona'}])assert.equal(await contract.verifyMitoversoAcceptance({...accepted,...patch}),false);
  for(const patch of [{accepted:false},{signerFullName:'Ana'},{role:'other'},{authUid:''},{monthlyFee:15}])assert.ok(contract.mitoversoDraftError(draft(patch)));
  assert.equal(contract.mitoversoEarliestActivation(accepted),'');
});

test('la solicitud real de Mitoverso exige aceptación y guarda la cuota aceptada sin activar el servicio',async()=>{
  for(const fee of [10,20]){
    const writes=[],mail=[],context={...contract,profile,user,db:{},appId:'demo',extraSignupModal:'mitoverso',isSendingExtraSignup:false,mitoversoContractDraft:draft({monthlyFee:fee}),fixedMyClasses:fee===10?[{id:'class'}]:[],hasPendingExtraSignup:()=>false,getExtraServiceConfig:()=>({key:'mitoverso',type:'alta_mitoverso',name:'Mitoverso'}),doc:(_, ...parts)=>parts.join('/'),setDoc:async(path,data)=>writes.push({path,data}),serverTimestamp:()=>({server:true}),ADMIN_COPY_GESTION_TYPES:new Set(),APPS_SCRIPT_URL:'mock',fetch:async(_,options)=>mail.push(JSON.parse(options.body)),showToast:noop,setIsSendingExtraSignup:noop,setExtraSignupModal:noop};
    const send=await load('src/components/StudentPortal.jsx','sendExtraSignupRequest',context);
    context.mitoversoContractDraft.accepted=false;await send();assert.equal(writes.length,0);
    context.mitoversoContractDraft.accepted=true;await send();assert.equal(writes.length,1);
    const payload=writes[0].data;assert.equal(payload.status,'pendiente');assert.equal(payload.extraMonthlyFee,fee);assert.equal(payload.hasMitoverso,undefined);
    assert.deepEqual(payload.mitoversoContract.acceptedAt,{server:true});assert.ok(mail[0].body.includes(payload.mitoversoContract.sha256));assert.match(mail[0].subject,/Mitoverso/);
  }
});

test('activar Mitoverso con contrato requiere identidad contrastada, Tadosi, tarifa y fecha válidos',async()=>{
  const accepted={...await contract.createMitoversoAcceptance(draft()),acceptedAt:{seconds:Math.floor(Date.now()/1000)-3600}};
  for(const invalid of ['identity','tadosi','hash','fee','waiting','valid']){
    const writes=[],request={id:'g',studentId:profile.id,studentName:profile.name,studentEmail:profile.email,type:'alta_mitoverso',status:'pendiente',mitoversoContract:{...accepted},tadosiDone:true,mitoversoIdentityVerifiedAt:'checked'};
    if(invalid==='identity')request.mitoversoIdentityVerifiedAt='';if(invalid==='tadosi')request.tadosiDone=false;if(invalid==='hash')request.mitoversoContract.sha256='0'.repeat(64);if(invalid==='fee')request.mitoversoContract= {...await contract.createMitoversoAcceptance(draft({monthlyFee:20})),acceptedAt:accepted.acceptedAt};if(invalid==='waiting')request.mitoversoContract={...await contract.createMitoversoAcceptance(draft({immediateStart:false})),acceptedAt:accepted.acceptedAt};
    const context={...contract,db:{},appId:'demo',user:{email:'admin@example.com'},students:[profile],isGestionReadyForExecution:()=>true,window:{confirm:()=>true},resolveStudentEmail:()=>profile.email,isExtraServiceGestion:()=>true,getExtraServiceConfigForGestion:()=>({key:'mitoverso',name:'Mitoverso',studentFlag:'hasMitoverso',monthlyFee:request.mitoversoContract.monthlyFee}),doc:(_, ...parts)=>parts.join('/'),getDocFromServer:async()=>({exists:()=>true,data:()=>request}),updateDoc:async(path,data)=>writes.push(data),sendStudentNotification:async()=>{},finalizeGestionStatus:async()=>{},getFixedStudentClasses:()=>[{id:'class'}],isGestionTadosiDone:g=>g.tadosiDone===true,formatDateSpanish:s=>s,alert:noop};
    const execute=await load('src/components/AdminPortal.jsx','updateGestionStatus',context);const result=await execute('g','completado',request,{skipConfirm:true,silent:true});
    assert.equal(result.ok,invalid==='valid',invalid);assert.equal(writes.length,invalid==='valid'?1:0,invalid);
    if(invalid==='valid'){assert.equal(writes[0].mitoversoMonthlyFee,10);assert.equal(writes[0].mitoversoContractSha256,accepted.sha256);}
  }
});

test('cambiar los nombres o el inicio exige aceptar de nuevo el formulario Mitoverso',async()=>{
  const {transformWithOxc}=await import('vite'),runtime=await import('react/jsx-runtime');const source=await readFile('src/components/MitoversoContractForm.jsx','utf8');
  const fn=source.slice(source.indexOf('export default function MitoversoContractForm')).replace('export default ','');const code=(await transformWithOxc(fn,'MitoversoContractForm.jsx')).code,changes=[];
  const Form=vm.runInNewContext(`${code};MitoversoContractForm`,{...contract,require:()=>runtime,MitoversoContractDocument:noop});const tree=Form({draft:draft(),onChange:value=>changes.push(value)}),controls=[];
  function walk(n){if(!n||typeof n!=='object')return;if(['input','select'].includes(n.type))controls.push(n);const children=n.props?.children;(Array.isArray(children)?children:[children]).forEach(walk);}walk(tree);
  assert.equal(controls.filter(n=>n.type==='input'&&n.props.type!=='checkbox').length,1);
  controls.find(n=>n.type==='input'&&n.props.type!=='checkbox').props.onChange({target:{value:'Ana García Pérez'}});assert.equal(changes[0].accepted,false);
  controls.find(n=>n.props.type==='checkbox').props.onChange({target:{checked:false}});assert.equal(changes[1].accepted,false);
});

test('Mitobox exige 24 horas exactas en Madrid y conserva el mes corriente, incluso en cambios de hora',()=>{
  const now=Date.parse('2026-11-05T18:00:00+01:00');assert.equal(canReserveMitoboxAt('2026-11-06','17:59',now),false);assert.equal(canReserveMitoboxAt('2026-11-06','18:00',now),true);assert.equal(canReserveMitoboxAt('2026-12-01','18:00',now),false);
  assert.equal(canReserveMitoboxAt('2027-03-28','12:00',Date.parse('2027-03-27T12:00:00+01:00')),false);
  assert.equal(canReserveMitoboxAt('2027-03-28','13:00',Date.parse('2027-03-27T12:00:00+01:00')),true);
});
