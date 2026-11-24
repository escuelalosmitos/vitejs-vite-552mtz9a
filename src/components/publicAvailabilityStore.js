import { doc, runTransaction } from 'firebase/firestore';
import { buildPublicClassSelectionId } from './classExpansionUtils.js';

const firestore = { doc, runTransaction };

export async function saveClassWebSettings({ db, classPath, changes, signatureFor, sdk = firestore }) {
  const classRef = sdk.doc(db, classPath);
  const publicRef = sdk.doc(db, 'publicData', 'classAvailability');
  return sdk.runTransaction(db, async transaction => {
    let needsRepublish = false;
    let removedFromWeb = false;
    if (changes.isWebVisible === false) {
      const published = (await transaction.get(publicRef)).data();
      const previous = published?.classes;
      if (Array.isArray(previous)) {
        needsRepublish = previous.some(row => !row.selectionId);
        const selectionId = buildPublicClassSelectionId(classPath);
        const classes = previous.filter(row => row.selectionId !== selectionId);
        removedFromWeb = classes.length !== previous.length;
        if (removedFromWeb) {
          transaction.update(publicRef, {
            classes,
            signature: signatureFor([classes, published.campaigns || []]),
            updatedAt: new Date().toISOString()
          });
        }
      }
    }
    transaction.update(classRef, changes);
    return { needsRepublish, removedFromWeb };
  });
}

export async function publishWebAvailability({
  db, appId, publication, schemaVersion, generatedForDate, signatureFor, isCenterOpen, force = false, sdk = firestore
}) {
  const publicRef = sdk.doc(db, 'publicData', 'classAvailability');
  const settingsRef = sdk.doc(db, 'artifacts', appId, 'settings', 'global');
  return sdk.runTransaction(db, async transaction => {
    const [publicSnapshot, settingsSnapshot] = await Promise.all([transaction.get(publicRef), transaction.get(settingsRef)]);
    const remote = publicSnapshot.data() || {};
    const centers = settingsSnapshot.data()?.centers;
    const publishedIds = new Set((Array.isArray(remote.classes) ? remote.classes : []).map(row => row.selectionId));
    // Si otra pestaña retiró un turno, una copia antigua no puede volver a
    // añadirlo. Releer solo las filas nuevas evita consultar todos los grupos.
    const eligible = await Promise.all(publication.classes.map(async row => {
      if (!isCenterOpen(centers, publication.sourceCenters.get(row.selectionId) || row.escuela)) return null;
      if (publishedIds.has(row.selectionId)) return row;
      const path = publication.sourcePaths.get(row.selectionId);
      if (!path) return null;
      const clase = (await transaction.get(sdk.doc(db, path))).data();
      return clase?.isWebVisible === true && !clase.date && clase.isRecurring !== false
        && isCenterOpen(centers, clase.centerId || clase.sede) ? row : null;
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

export async function saveCenterAvailability({
  db, appId, patch, expectedCenters, normalizeCenters, legacySettingsFor, isCenterOpen, signatureFor, sdk = firestore
}) {
  const settingsRef = sdk.doc(db, 'artifacts', appId, 'settings', 'global');
  const publicRef = sdk.doc(db, 'publicData', 'classAvailability');
  const studentSettingsRef = sdk.doc(db, 'artifacts', appId, 'roleData', 'studentSettings');
  return sdk.runTransaction(db, async transaction => {
    const [settingsSnapshot, publicSnapshot] = await Promise.all([transaction.get(settingsRef), transaction.get(publicRef)]);
    const current = settingsSnapshot.data() || {};
    if (JSON.stringify(normalizeCenters(current.centers, current)) !== JSON.stringify(expectedCenters)) {
      throw new Error('La configuración de sedes cambió mientras la editabas. Vuelve a abrir la ficha.');
    }
    const published = publicSnapshot.data();
    const rows = Array.isArray(published?.classes) ? published.classes : [];
    const classes = rows.filter(row => isCenterOpen(patch.centers, row.escuela));
    if (classes.length !== rows.length) {
      transaction.update(publicRef, {
        classes,
        signature: signatureFor([classes, published.campaigns || []]),
        updatedAt: new Date().toISOString()
      });
    }
    const settingsPatch = { ...legacySettingsFor(patch.centers, current), ...patch };
    transaction.set(settingsRef, settingsPatch, { mergeFields: Object.keys(settingsPatch) });
    transaction.set(studentSettingsRef, {
      centers: patch.centers,
      mitoboxRoomCapacities: patch.mitoboxRoomCapacities
    }, { mergeFields: ['centers', 'mitoboxRoomCapacities'] });
  });
}
