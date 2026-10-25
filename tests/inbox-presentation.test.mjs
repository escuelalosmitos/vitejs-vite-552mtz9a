import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile('src/components/AdminPortal.jsx', 'utf8');
const start = source.indexOf('  const selectInboxGestion = async gestion => {');
const end = source.indexOf('\n  };', start) + 5;
function setup(getDoc) {
  const state = {};
  const context = { inboxDetailRequestRef: { current: 0 }, setInboxSelectedId: id => state.id = id, setInboxPrivateDetail: value => state.detail = value, getDoc, doc: (...args) => args, db: {}, appId: 'demo' };
  return { state, select: vm.runInNewContext(source.slice(start, end) + '\nselectInboxGestion;', context) };
}
test('seleccionar una solicitud pública no realiza lecturas privadas', async () => {
  const {state, select} = setup(() => { throw Error('lectura inesperada'); });
  await select({id:'publica'});
  assert.equal(state.id,'publica'); assert.equal(state.detail.loading,false);
});
test('una respuesta privada tardía no sustituye la selección más reciente', async () => {
  const pending = {};
  const {state, select} = setup(path => new Promise(resolve => pending[path.at(-1)] = resolve));
  const first = select({id:'A',hasPrivateDetails:true});
  const second = select({id:'B',hasPrivateDetails:true});
  pending.B({exists:()=>true,data:()=>({details:'Notas B'})}); await second;
  pending.A({exists:()=>true,data:()=>({details:'Notas A'})}); await first;
  assert.equal(state.id,'B'); assert.equal(state.detail.details,'Notas B');
});
test('un error al cargar notas permite reintentar la misma selección', async () => {
  let calls = 0;
  const {state, select} = setup(async () => { if (++calls === 1) throw Error('sin conexión'); return {exists:()=>true,data:()=>({details:'Recuperadas'})}; });
  const g = {id:'A',hasPrivateDetails:true};
  await select(g); assert.equal(state.detail.error,true);
  await select(g); assert.equal(state.detail.details,'Recuperadas'); assert.equal(state.detail.error,undefined);
});
