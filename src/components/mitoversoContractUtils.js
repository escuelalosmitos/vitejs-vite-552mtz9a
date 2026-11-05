import { MITOVERSO_CONTRACT_TEMPLATE } from './mitoversoContractContent.js';
export { MITOVERSO_CONTRACT_TEMPLATE } from './mitoversoContractContent.js';
export const MITOVERSO_CONTRACT_VERSION = 'mitoverso-2026-11-05-v1';
export const MITOVERSO_ACCEPTANCE_TEXT = 'He leído y acepto el contrato MITOVERSO y la cuota indicada. Confirmo que soy mayor de edad y que los datos del Contratante y, en su caso, de su representación son correctos.';

const cleanName = value => String(value || '').replace(/\s+/g, ' ').trim();
export const mitoversoMonthlyFee = hasTeachingSeat => hasTeachingSeat ? 10 : 20;
export const createMitoversoContractDraft = (profile = {}, user = {}, monthlyFee = 10, now = new Date().toISOString()) => ({
  version: MITOVERSO_CONTRACT_VERSION,
  signerFullName: cleanName(profile.name), studentFullName: cleanName(profile.name),
  role: 'adult', studentId: String(profile.id || ''),
  accountEmail: String(user.email || profile.email || '').trim().toLowerCase(),
  authUid: String(user.uid || ''), monthlyFee, presentedAt: now,
  accepted: false, immediateStart: false
});
export const mitoversoDraftError = draft => {
  if (!draft || draft.version !== MITOVERSO_CONTRACT_VERSION) return 'Vuelve a abrir el contrato actualizado.';
  if (!['adult', 'guardian'].includes(draft.role)) return 'Indica si actúas en nombre propio o como representante legal.';
  if (cleanName(draft.signerFullName).split(' ').length < 2 || cleanName(draft.signerFullName).length > 160) return 'Confirma el nombre y apellidos completos del Contratante.';
  if (cleanName(draft.studentFullName).split(' ').length < 2 || cleanName(draft.studentFullName).length > 160) return 'Confirma el nombre y apellidos completos del usuario.';
  if (draft.role === 'adult' && cleanName(draft.signerFullName) !== cleanName(draft.studentFullName)) return 'Si actúas en nombre propio, el Contratante y el usuario deben ser la misma persona.';
  if (!draft.accountEmail || !draft.studentId || !draft.authUid || ![10,20].includes(draft.monthlyFee)) return 'No se ha podido identificar la cuenta o la tarifa. Vuelve a entrar en la plataforma.';
  if (!Number.isFinite(Date.parse(draft.presentedAt))) return 'Vuelve a abrir el contrato para actualizar la fecha.';
  if (draft.accepted !== true) return 'Debes marcar la casilla de lectura y aceptación del contrato.';
  return '';
};
export const buildMitoversoContractText = (draft = {}) => {
  const date = new Date(draft.presentedAt || Date.now());
  const values = {
    signerFullName: cleanName(draft.signerFullName) || '[Nombre y apellidos del Contratante]',
    studentFullName: cleanName(draft.studentFullName) || '[Nombre y apellidos del usuario]',
    representation: draft.role === 'guardian' ? 'actuando como padre, madre o representante legal del usuario menor de edad identificado a continuación' : 'actuando en nombre propio',
    accountEmail: String(draft.accountEmail || ''), studentId: String(draft.studentId || ''),
    monthlyFee: [10,20].includes(draft.monthlyFee) ? String(draft.monthlyFee) : '[Cuota pendiente]',
    tariffLabel: draft.monthlyFee === 10 ? 'alumno con plaza de clases' : 'usuario externo, sin plaza de clases',
    documentDate: Number.isFinite(date.getTime()) ? (() => { const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(part => [part.type, part.value])); return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second} (Europe/Madrid)`; })() : '[Fecha pendiente]',
    startChoice: draft.immediateStart === true ? 'solicita expresamente que el servicio pueda comenzar durante los primeros 14 días, una vez aprobado por el Centro' : 'no solicita inicio durante los primeros 14 días'
  };
  // Callback replacement keeps literal dollar signs in user names safe.
  const template = MITOVERSO_CONTRACT_TEMPLATE;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? '');
};
export const sha256Contract = async text => {
  if (!globalThis.crypto?.subtle) throw new Error('Tu navegador no permite registrar el contrato de forma segura. Usa un navegador actualizado.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2,'0')).join('');
};
export const createMitoversoAcceptance = async (draft, acceptedAtClient = new Date().toISOString()) => {
  const error = mitoversoDraftError(draft);
  if (error) throw new Error(error);
  const normalized = { ...draft, signerFullName: cleanName(draft.signerFullName), studentFullName: cleanName(draft.studentFullName) };
  const text = buildMitoversoContractText(normalized);
  return {...normalized, acceptedAtClient, acceptanceText: MITOVERSO_ACCEPTANCE_TEXT, text, sha256: await sha256Contract(text)};
};
export const verifyMitoversoAcceptance = async acceptance => {
  const supportedVersion = acceptance?.version === MITOVERSO_CONTRACT_VERSION;
  const draftForValidation = acceptance ? { ...acceptance, version: MITOVERSO_CONTRACT_VERSION } : null;
  if (!supportedVersion || mitoversoDraftError(draftForValidation) || acceptance.acceptanceText !== MITOVERSO_ACCEPTANCE_TEXT) return false;
  if (acceptance.text !== buildMitoversoContractText(acceptance)) return false;
  return acceptance.sha256 === await sha256Contract(acceptance.text);
};
export const contractAcceptedMillis = acceptance => {
  const value = acceptance?.acceptedAt;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (Number.isFinite(value?.seconds)) return value.seconds * 1000;
  return 0; // The browser timestamp is not a substitute for the server receipt.
};
export const mitoversoEarliestActivation = acceptance => {
  const millis = contractAcceptedMillis(acceptance);
  if (!millis) return '';
  if (acceptance.immediateStart === true) return new Date(millis).toISOString();
  // Allow the full fourteen calendar days following acceptance to elapse in
  // Madrid, including on daylight-saving transitions; activate on day fifteen.
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(millis)).map(part => [part.type,part.value]));
  const target = Date.UTC(Number(parts.year), Number(parts.month)-1, Number(parts.day)+15);
  let instant = target;
  for (let index=0; index<3; index++) {
    const local = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant)).map(part => [part.type,part.value]));
    const represented = Date.UTC(Number(local.year),Number(local.month)-1,Number(local.day),Number(local.hour),Number(local.minute),Number(local.second));
    instant += target - represented;
  }
  return new Date(instant).toISOString();
};
export const buildMitoversoContractCopy = (acceptance = {}, gestionId = '') => {
  const serverMillis = contractAcceptedMillis(acceptance);
  return `${acceptance.text || ''}\n\nREGISTRO DE ACEPTACIÓN\nVersión: ${acceptance.version || ''}\nGestión: ${gestionId}\nCuenta: ${acceptance.accountEmail || ''}\nUsuario de autenticación: ${acceptance.authUid || ''}\nRecepción del servidor: ${serverMillis ? new Date(serverMillis).toISOString() : 'Consulta el registro guardado en la plataforma'}\nFecha indicada por el navegador: ${acceptance.acceptedAtClient || ''}\nAceptación: ${acceptance.acceptanceText || ''}\nHuella SHA-256: ${acceptance.sha256 || ''}\n\nLa recepción de esta solicitud no activa por sí sola el servicio.\n`;
};
export const downloadMitoversoContract = (acceptance, gestionId = '') => {
  const text = acceptance?.text ? buildMitoversoContractCopy(acceptance, gestionId) : buildMitoversoContractText(acceptance);
  const url = URL.createObjectURL(new Blob([text], {type:'text/plain;charset=utf-8'}));
  const link = document.createElement('a');link.href=url;link.download=`Contrato_Mitoverso${gestionId ? `_${String(gestionId).replace(/[^a-zA-Z0-9_-]/g,'')}` : ''}.txt`;
  document.body.appendChild(link);link.click();link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
};

export const mitoversoEvidenceError = async (gestion = {}, student = {}) => {
  const acceptance = gestion.mitoversoContract;
  if (!acceptance || !await verifyMitoversoAcceptance(acceptance)) return 'Falta un contrato Mitoverso válido. Solicita al alumno que lo acepte desde Extras.';
  if (acceptance.studentId !== gestion.studentId || String(acceptance.accountEmail).toLowerCase() !== String(gestion.studentEmail || student.email || '').toLowerCase()) return 'El contrato no corresponde a la cuenta de esta solicitud.';
  if (student.authUid && acceptance.authUid !== student.authUid) return 'La cuenta que aceptó el contrato no coincide con la ficha. Revisa su identidad.';
  if (!contractAcceptedMillis(acceptance)) return 'No se ha recibido todavía la fecha del servidor para esta aceptación. Actualiza la bandeja.';
  return '';
};
