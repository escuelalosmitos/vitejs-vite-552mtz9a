import { collection, doc, getDocsFromServer, query, where, runTransaction } from 'firebase/firestore';
import { buildGymusikReservationId, getGymusikMonth, canCancelGymusikReservationWithCredit } from './gymusikUtils.js';

export const gymusikCreditRef = (db, appId, studentId, month) => doc(db, 'artifacts', appId, 'gymusikCredits', String(studentId), 'months', month);
const committed = row => ['confirmed', 'waitlist', 'attended', 'no_show'].includes(row.status) || (row.status === 'cancelled' && row.creditConsumed === true);
const creditData = (studentId, email, month, previous, ids, lastReservationId) => ({
  studentId: String(studentId), studentEmail: String(email || '').trim().toLowerCase(), month,
  reservationIds: [...new Set(ids)].sort(), lastReservationId,
  revision: Number(previous?.revision || 0) + 1, updatedAt: new Date().toISOString()
});

// Solo Administración prepara el saldo antiguo. Hasta terminar esta transacción
// las reglas bloquean nuevas reservas, de modo que no puede aparecer una reserva
// concurrente omitida por la consulta inicial de migración.
export async function initializeGymusikCredits({ db, appId, member }) {
  const rows = await getDocsFromServer(query(collection(db, 'artifacts', appId, 'gymusikReservations'), where('studentId', '==', String(member.id || member.studentId))));
  const studentId = String(member.id || member.studentId);
  const memberRef = doc(db, 'artifacts', appId, 'gymusikMembers', studentId);
  return runTransaction(db, async transaction => {
    const [membership, ...reservations] = await Promise.all([transaction.get(memberRef), ...rows.docs.map(row => transaction.get(row.ref))]);
    if (!membership.exists() || membership.data().creditLedgerVersion === 1) return;
    const byMonth = new Map();
    reservations.filter(row => row.exists()).forEach(snapshot => {
      const row = snapshot.data(), month = getGymusikMonth(row.sessionDate || row.date);
      if (!/^\d{4}-\d{2}$/.test(month) || !committed(row)) return;
      if (!byMonth.has(month)) byMonth.set(month, []);
      byMonth.get(month).push(snapshot.id);
    });
    for (const [month, ids] of byMonth) transaction.set(gymusikCreditRef(db, appId, studentId, month), creditData(studentId, membership.data().studentEmail, month, null, ids, ''));
    transaction.update(memberRef, { creditLedgerVersion: 1, creditsPreparedAt: new Date().toISOString() });
  });
}

export async function reserveGymusik({ db, appId, profile, session }) {
  const studentId = String(profile.id), reservationId = buildGymusikReservationId(session.id, studentId);
  const sessionRef = doc(db, 'artifacts', appId, 'gymusikSessions', session.id);
  const reservationRef = doc(db, 'artifacts', appId, 'gymusikReservations', reservationId);
  return runTransaction(db, async transaction => {
    const [sessionSnapshot, reservationSnapshot, member, config] = await Promise.all([
      transaction.get(sessionRef), transaction.get(reservationRef),
      transaction.get(doc(db, 'artifacts', appId, 'gymusikMembers', studentId)),
      transaction.get(doc(db, 'artifacts', appId, 'gymusikSettings', 'main'))
    ]);
    if (!sessionSnapshot.exists() || sessionSnapshot.data().status !== 'published') throw new Error('La sesión ya no admite reservas.');
    if (!member.exists() || member.data().status !== 'active' || config.data()?.active !== true) throw new Error('Gymusik no está activo para realizar esta reserva.');
    if (member.data().creditLedgerVersion !== 1) throw new Error('Administración debe sincronizar tus créditos antes de la primera reserva.');
    const live = sessionSnapshot.data(), previous = reservationSnapshot.data();
    if (previous && ['confirmed', 'waitlist', 'attended', 'no_show'].includes(previous.status)) throw new Error('Ya tienes una reserva para esta sesión.');
    const month = getGymusikMonth(live.date), budgetRef = gymusikCreditRef(db, appId, studentId, month);
    const budget = await transaction.get(budgetRef), ids = budget.data()?.reservationIds || [];
    const limit = Math.max(1, Number(config.data().monthlyCredits) || 4);
    if (!ids.includes(reservationId) && ids.length >= limit) throw new Error(`Ya has comprometido tus ${limit} créditos de ${month}.`);
    const reservedCount = Math.max(0, Number(live.reservedCount || 0)), waitlistCount = Math.max(0, Number(live.waitlistCount || 0));
    const status = reservedCount < Math.max(1, Number(live.capacity) || 1) ? 'confirmed' : 'waitlist';
    const now = new Date().toISOString();
    transaction.set(reservationRef, {
      sessionId: session.id, sessionDate: live.date, sessionTime: live.time, instrument: live.instrument,
      centerId: live.centerId || '', sede: live.sede || '', roomId: live.roomId || '', sala: live.sala || '',
      teacherName: live.teacherName || '', teacherEmail: String(live.teacherEmail || '').trim().toLowerCase(),
      studentId, studentName: profile.name || '', studentEmail: String(profile.email || '').trim().toLowerCase(),
      status, creditMonth: month, creditConsumed: false, creditReturned: false,
      createdAt: previous?.createdAt || now, updatedAt: now, createdBy: 'student'
    }, { merge: true });
    transaction.set(budgetRef, creditData(studentId, profile.email, month, budget.data(), [...ids, reservationId], reservationId));
    transaction.update(sessionRef, {
      reservedCount: reservedCount + (status === 'confirmed' ? 1 : 0), waitlistCount: waitlistCount + (status === 'waitlist' ? 1 : 0),
      lastReservationId: reservationId, updatedAt: now
    });
    return status;
  });
}

export async function cancelGymusik({ db, appId, reservation, admin = false }) {
  const reservationRef = doc(db, 'artifacts', appId, 'gymusikReservations', reservation.id);
  const sessionRef = doc(db, 'artifacts', appId, 'gymusikSessions', reservation.sessionId);
  return runTransaction(db, async transaction => {
    const [snapshot, sessionSnapshot, config] = await Promise.all([transaction.get(reservationRef), transaction.get(sessionRef), transaction.get(doc(db, 'artifacts', appId, 'gymusikSettings', 'main'))]);
    if (!snapshot.exists() || !sessionSnapshot.exists() || !['confirmed', 'waitlist'].includes(snapshot.data().status)) return false;
    const current = snapshot.data(), session = sessionSnapshot.data();
    const month = getGymusikMonth(current.sessionDate), budgetRef = gymusikCreditRef(db, appId, current.studentId, month);
    const budget = await transaction.get(budgetRef);
    const returnsCredit = admin || current.status === 'waitlist' || canCancelGymusikReservationWithCredit({ session, cancellationHours: config.data()?.cancellationHours ?? 24 });
    const ids = budget.data()?.reservationIds || [];
    transaction.set(budgetRef, creditData(current.studentId, current.studentEmail, month, budget.data(), returnsCredit ? ids.filter(id => id !== reservation.id) : [...ids, reservation.id], reservation.id));
    const now = new Date().toISOString();
    transaction.update(reservationRef, { status: 'cancelled', cancelledAt: now, cancelledBy: admin ? 'admin' : 'student', creditConsumed: !returnsCredit, creditReturned: returnsCredit, updatedAt: now });
    transaction.update(sessionRef, {
      reservedCount: Math.max(0, Number(session.reservedCount || 0) - (current.status === 'confirmed' ? 1 : 0)),
      waitlistCount: Math.max(0, Number(session.waitlistCount || 0) - (current.status === 'waitlist' ? 1 : 0)),
      promotionPending: current.status === 'confirmed' && Number(session.waitlistCount || 0) > 0,
      lastReservationId: reservation.id, updatedAt: now
    });
    return returnsCredit;
  });
}
