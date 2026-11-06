import { MITOLOCKER_MODES, getMitolockerMode } from './fixedServicesUtils.js';
import { MITOLOCKER_CONTRACT_TEMPLATE } from './mitolockerContractContent.js';
import { sha256Contract, contractAcceptedMillis } from './mitoversoContractUtils.js';

export const MITOLOCKER_CONTRACT_VERSION = 'mitolocker-2026-11-06-v1';
const clean = value => String(value || '').trim().replace(/\s+/g, ' ');
const fullName = name => name.length <= 160 && name.split(' ').length >= 2;

export const mitolockerModeLabel = mode => {
  if (mode === 'compartido') return 'Mitolocker Compartido · Gratis';
  if (mode === 'exclusivo') return 'Mitolocker Exclusivo · 5 €/mes';
  return '';
};

export const mitolockerAcceptanceText = mode => mode === 'compartido'
  ? 'He leído y acepto el contrato de Mitolocker Compartido, gratuito. Autorizo expresamente el uso del instrumento por otros alumnos autorizados y acepto las condiciones de uso y desgaste descritas.'
  : 'He leído y acepto el contrato de Mitolocker Exclusivo y la cuota de 5 € al mes. El instrumento queda reservado para su titular.';

export const createMitolockerContractDraft = (student = {}, user = {}, now = new Date().toISOString()) => ({
  version: MITOLOCKER_CONTRACT_VERSION,
  studentId: String(student.id || ''),
  accountEmail: clean(user.email || student.email).toLowerCase(),
  authUid: String(user.uid || ''),
  signerFullName: clean(student.name),
  studentFullName: clean(student.name),
  role: 'adult',
  mode: '',
  instrument: '',
  presentedAt: now,
  accepted: false
});

export const mitolockerDraftError = draft => {
  if (!draft || draft.version !== MITOLOCKER_CONTRACT_VERSION) return 'Vuelve a abrir el contrato actualizado.';
  if (!getMitolockerMode(draft.mode)) return 'Elige Mitolocker Compartido o Exclusivo.';
  if (!['adult', 'guardian'].includes(draft.role)) return 'Indica quién acepta el contrato.';
  const signer = clean(draft.signerFullName), student = clean(draft.studentFullName);
  if (!fullName(signer) || !fullName(student)) return 'Confirma los nombres y apellidos completos.';
  if (draft.role === 'adult' && signer !== student) return 'Si actúas en nombre propio, el titular y el alumno deben coincidir.';
  if (!clean(draft.instrument) || clean(draft.instrument).length > 160) return 'Indica el instrumento o equipo que quieres dejar.';
  if (!draft.studentId || !draft.accountEmail || !draft.authUid || !Number.isFinite(Date.parse(draft.presentedAt))) return 'Vuelve a entrar en la plataforma para identificar la cuenta.';
  return draft.accepted === true ? '' : 'Lee y acepta el contrato para enviar la solicitud.';
};

export const buildMitolockerContractText = draft => {
  const values = {
    signerFullName: clean(draft.signerFullName) || '[Nombre del contratante]',
    studentFullName: clean(draft.studentFullName) || '[Nombre del usuario]',
    representation: draft.role === 'guardian' ? 'actuando como padre, madre o representante legal del menor' : 'actuando en nombre propio',
    accountEmail: draft.accountEmail,
    studentId: draft.studentId,
    instrument: clean(draft.instrument) || '[Instrumento o equipo]',
    modeLabel: mitolockerModeLabel(draft.mode) || '[Modalidad pendiente]',
    documentDate: Number.isFinite(Date.parse(draft.presentedAt))
      ? new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'long' }).format(new Date(draft.presentedAt))
      : '[Fecha pendiente]'
  };
  return MITOLOCKER_CONTRACT_TEMPLATE.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? '');
};

export const createMitolockerAcceptance = async (draft, acceptedAtClient = new Date().toISOString()) => {
  const error = mitolockerDraftError(draft);
  if (error) throw new Error(error);
  const accepted = {
    ...draft,
    signerFullName: clean(draft.signerFullName),
    studentFullName: clean(draft.studentFullName),
    instrument: clean(draft.instrument),
    monthlyFee: MITOLOCKER_MODES[draft.mode].monthlyFee,
    acceptedAtClient,
    acceptanceText: mitolockerAcceptanceText(draft.mode)
  };
  const text = buildMitolockerContractText(accepted);
  return { ...accepted, text, sha256: await sha256Contract(text) };
};

export const mitolockerEvidenceError = async (gestion = {}, student = {}) => {
  const contract = gestion.mitolockerContract;
  if (mitolockerDraftError(contract) || !contractAcceptedMillis(contract)) return 'Falta una aceptación Mitolocker válida con fecha del servidor.';
  if (contract.studentId !== gestion.studentId || contract.accountEmail !== clean(gestion.studentEmail).toLowerCase() || (student.authUid && contract.authUid !== student.authUid)) return 'El contrato no corresponde a la cuenta de la solicitud.';
  if (contract.mode !== gestion.mitolockerMode || contract.monthlyFee !== gestion.extraMonthlyFee || contract.monthlyFee !== MITOLOCKER_MODES[contract.mode].monthlyFee) return 'La modalidad o cuota no coincide con lo aceptado.';
  if (contract.acceptanceText !== mitolockerAcceptanceText(contract.mode) || contract.text !== buildMitolockerContractText(contract) || contract.sha256 !== await sha256Contract(contract.text)) return 'El texto o la huella del contrato no coincide con lo aceptado.';
  return '';
};

export const buildMitolockerContractCopy = (contract, gestionId = '') => {
  const received = contractAcceptedMillis(contract);
  return `${contract.text}\n\nREGISTRO DE ACEPTACIÓN\nVersión: ${contract.version}\nGestión: ${gestionId}\nModalidad: ${mitolockerModeLabel(contract.mode)}\nCuenta: ${contract.accountEmail}\nRecepción del servidor: ${received ? new Date(received).toISOString() : 'Consulta el registro en la plataforma'}\nFecha indicada por el navegador: ${contract.acceptedAtClient}\nAceptación: ${contract.acceptanceText}\nHuella SHA-256: ${contract.sha256}\n\nLa solicitud queda pendiente de aprobación. La entrega física se acredita por separado.\n`;
};

function downloadText(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const downloadMitolockerContract = (contract, gestionId = '') => downloadText(
  contract.text ? buildMitolockerContractCopy(contract, gestionId) : buildMitolockerContractText(contract),
  'Contrato_Mitolocker.txt'
);

export const MITOLOCKER_DELIVERY_FIELDS = [
  ['instrument', 'Instrumento o equipo'], ['brand', 'Marca'], ['model', 'Modelo'],
  ['serial', 'Número de serie'], ['finish', 'Color o acabado'], ['case', 'Estuche o funda'],
  ['accessories', 'Accesorios entregados'], ['condition', 'Estado aparente'], ['declaredValue', 'Valor declarado (€)']
];

export const downloadMitolockerDelivery = (delivery, contract, gestionId) => downloadText(
  `RESGUARDO DE ENTREGA MITOLOCKER\n\nGestión: ${gestionId}\nContratante: ${contract.signerFullName}\nAlumno: ${contract.studentFullName}\nFecha de entrega: ${delivery.date}\nModalidad al recibirlo: ${mitolockerModeLabel(delivery.mode)}\n\n${MITOLOCKER_DELIVERY_FIELDS.map(([key, label]) => `${label}: ${delivery[key] || '—'}`).join('\n')}\n\nFirma del titular o representante: __________________\nFirma del Centro: __________________\n`,
  'Resguardo_Entrega_Mitolocker.txt'
);
