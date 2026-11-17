import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';

export async function sendPersonalMessages({ db, appId, studentIds, messageId, title, body, sender }) {
  const ids = [...new Set(studentIds.map(String).filter(Boolean))];
  if (!ids.length || !messageId || !title.trim() || title.length > 100 || !body.trim() || body.length > 1000) {
    throw new Error('Revisa los destinatarios, el asunto y el mensaje.');
  }
  for (let offset = 0; offset < ids.length; offset += 100) {
    const recipients = ids.slice(offset, offset + 100);
    await runTransaction(db, async transaction => {
      const refs = recipients.map(id => doc(db, 'artifacts', appId, 'students', id, 'inboxMessages', messageId));
      const snapshots = await Promise.all(refs.map(ref => transaction.get(ref)));
      snapshots.forEach((snapshot, index) => {
        if (snapshot.exists()) return;
        transaction.set(refs[index], {
          studentId: recipients[index], title: title.trim(), body: body.trim(),
          createdAt: serverTimestamp(), createdBy: sender, readAt: null
        });
      });
    });
  }
}
