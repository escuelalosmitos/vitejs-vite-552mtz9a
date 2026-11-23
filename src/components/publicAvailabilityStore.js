import { doc, runTransaction } from 'firebase/firestore';
import { buildPublicClassSelectionId } from './classExpansionUtils.js';

const firestore = { doc, runTransaction };

export async function saveClassWebSettings({ db, classPath, changes, signatureFor, sdk = firestore }) {
  const classRef = sdk.doc(db, classPath);
  const publicRef = sdk.doc(db, 'publicData', 'classAvailability');
  return sdk.runTransaction(db, async transaction => {
    let needsRepublish = false;
    if (changes.isWebVisible === false) {
      const published = (await transaction.get(publicRef)).data();
      const previous = published?.classes;
      if (Array.isArray(previous)) {
        needsRepublish = previous.some(row => !row.selectionId);
        const selectionId = buildPublicClassSelectionId(classPath);
        const classes = previous.filter(row => row.selectionId !== selectionId);
        if (classes.length !== previous.length) {
          transaction.update(publicRef, {
            classes,
            signature: signatureFor([classes, published.campaigns || []]),
            updatedAt: new Date().toISOString()
          });
        }
      }
    }
    transaction.update(classRef, changes);
    return { needsRepublish };
  });
}

export async function publishWebAvailability({
  db, publication, schemaVersion, generatedForDate, signatureFor, force = false, sdk = firestore
}) {
  const publicRef = sdk.doc(db, 'publicData', 'classAvailability');
  return sdk.runTransaction(db, async transaction => {
    const remote = (await transaction.get(publicRef)).data() || {};
    const publishedIds = new Set((Array.isArray(remote.classes) ? remote.classes : []).map(row => row.selectionId));
    // Si otra pestaña retiró un turno, una copia antigua no puede volver a
    // añadirlo. Releer solo las filas nuevas evita consultar todos los grupos.
    const eligible = await Promise.all(publication.classes.map(async row => {
      if (publishedIds.has(row.selectionId)) return row;
      const path = publication.sourcePaths.get(row.selectionId);
      if (!path) return null;
      const clase = (await transaction.get(sdk.doc(db, path))).data();
      return clase?.isWebVisible === true && !clase.date && clase.isRecurring !== false ? row : null;
    }));
    const classes = eligible.filter(Boolean);
    const signature = signatureFor([classes, publication.campaigns]);
    if (!force && remote.schemaVersion === schemaVersion && remote.signature === signature) {
      return { changed: false, updatedAt: remote.updatedAt || '', classesCount: classes.length };
    }
    const updatedAt = new Date().toISOString();
    transaction.set(publicRef, { schemaVersion, updatedAt, generatedForDate, signature, classes, campaigns: publication.campaigns });
    return { changed: true, updatedAt, classesCount: classes.length };
  });
}
