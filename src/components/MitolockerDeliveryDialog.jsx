import { useEffect, useState } from 'react';
import { doc, getDocFromServer, runTransaction, serverTimestamp } from 'firebase/firestore';
import { getSchoolDate } from './vacationChallengeUtils.js';
import { MITOLOCKER_DELIVERY_FIELDS, downloadMitolockerContract, downloadMitolockerDelivery } from './mitolockerContractUtils.js';

export default function MitolockerDeliveryDialog({ student, db, appId, onClose }) {
  const gestionId = student.mitolockerContractGestionId;
  const [draft, setDraft] = useState({ date: getSchoolDate(), instrument: '', condition: '' });
  const [request, setRequest] = useState(null);
  const [delivery, setDelivery] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let open = true;
    const requestRef = doc(db, 'artifacts', appId, 'gestiones', gestionId);
    const deliveryRef = doc(requestRef, 'mitolockerDelivery', 'record');
    Promise.all([getDocFromServer(requestRef), getDocFromServer(deliveryRef)])
      .then(([requestSnapshot, deliverySnapshot]) => {
        if (!open) return;
        const saved = requestSnapshot.data();
        if (!saved?.mitolockerContract || saved.studentId !== student.id) throw new Error('No se encuentra el contrato asociado a esta ficha.');
        setRequest(saved);
        setDelivery(deliverySnapshot.data() || null);
        setDraft(previous => ({ ...previous, instrument: saved.mitolockerContract.instrument }));
      })
      .catch(problem => { if (open) setError(problem.message); })
      .finally(() => { if (open) setLoading(false); });
    return () => { open = false; };
  }, [appId, db, gestionId, student.id]);

  const save = async event => {
    event.preventDefault();
    if (saving || !draft.confirmed || !draft.instrument.trim() || !draft.condition.trim() || !draft.date || draft.date > getSchoolDate()) return;
    setSaving(true);
    setError('');
    try {
      const requestRef = doc(db, 'artifacts', appId, 'gestiones', gestionId);
      const deliveryRef = doc(requestRef, 'mitolockerDelivery', 'record');
      const studentRef = doc(db, 'artifacts', appId, 'students', student.id);
      const fields = Object.fromEntries(MITOLOCKER_DELIVERY_FIELDS.map(([key]) => [key, String(draft[key] || '').trim()]));
      const receipt = await runTransaction(db, async transaction => {
        const [studentSnapshot, requestSnapshot, deliverySnapshot] = await Promise.all([
          transaction.get(studentRef), transaction.get(requestRef), transaction.get(deliveryRef)
        ]);
        if (deliverySnapshot.exists()) return deliverySnapshot.data();
        const current = studentSnapshot.data(), saved = requestSnapshot.data();
        if (!current?.hasMitolocker || current.globalStatus === 'baja' || current.mitolockerContractGestionId !== gestionId
          || saved?.studentId !== student.id || saved.status !== 'completado' || current.mitolockerMode !== saved.mitolockerContract?.mode) {
          throw new Error('La modalidad activa y el contrato deben coincidir antes de registrar la entrega.');
        }
        const record = { ...fields, date: draft.date, mode: current.mitolockerMode };
        transaction.set(deliveryRef, { ...record, recordedAt: serverTimestamp() });
        return record;
      });
      setDelivery(receipt);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setSaving(false);
    }
  };

  return <div className="fixed inset-0 z-[110] bg-black/60 flex items-center justify-center p-3">
    <div role="dialog" aria-modal="true" aria-labelledby="mitolocker-delivery-title" className="w-full max-w-2xl bg-white rounded-3xl p-5 max-h-[92vh] overflow-y-auto space-y-4">
      <div className="flex justify-between gap-3 items-start">
        <h3 id="mitolocker-delivery-title" className="text-lg font-black">Entrega Mitolocker · {student.name}</h3>
        <button type="button" onClick={onClose} disabled={saving} className="font-bold text-sm underline">Cerrar</button>
      </div>
      {loading && <p role="status">Cargando contrato y resguardo…</p>}
      {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
      {request && <button type="button" onClick={() => downloadMitolockerContract(request.mitolockerContract, gestionId)} className="text-sm font-bold underline">Descargar contrato aceptado</button>}
      {request && (delivery ? <div className="space-y-3">
        <p className="text-sm">Entrega registrada el {delivery.date}. Puedes descargar el resguardo para firmarlo con el titular.</p>
        <button type="button" onClick={() => downloadMitolockerDelivery(delivery, request.mitolockerContract, gestionId)} className="px-4 py-3 rounded-xl bg-black text-white text-sm font-bold">Descargar resguardo</button>
      </div> : <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-zinc-600">Completa el resguardo cuando tengas el instrumento en el centro.</p>
        <fieldset disabled={saving} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm font-bold">Fecha de entrega
            <input type="date" required max={getSchoolDate()} value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} className="block w-full border rounded-lg p-2"/>
          </label>
          {MITOLOCKER_DELIVERY_FIELDS.map(([key, label]) => <label key={key} className="text-sm font-bold">{label}
            <input value={draft[key] || ''} maxLength={key === 'condition' || key === 'accessories' ? 500 : 160} required={key === 'instrument' || key === 'condition'} onChange={event => setDraft({ ...draft, [key]: event.target.value })} className="block w-full border rounded-lg p-2 font-normal"/>
          </label>)}
        </fieldset>
        <label className="flex gap-2 text-sm"><input type="checkbox" disabled={saving} checked={draft.confirmed === true} onChange={event => setDraft({ ...draft, confirmed: event.target.checked })}/>Confirmo que he recibido el instrumento descrito.</label>
        <button type="submit" disabled={saving || !draft.confirmed} className="px-4 py-3 rounded-xl bg-black text-white text-sm font-bold disabled:opacity-50">{saving ? 'Guardando…' : 'Registrar entrega'}</button>
      </form>)}
    </div>
  </div>;
}
