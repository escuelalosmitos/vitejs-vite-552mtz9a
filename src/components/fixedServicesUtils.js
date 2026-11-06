// Shared catalogue for entitlements, cancellation scope and recurring income.
export const MITOLOCKER_MODES = {
  compartido: { name: 'Mitolocker compartido', monthlyFee: 0, description: 'Dejas tu instrumento en la escuela y permites que otros alumnos lo utilicen.' },
  exclusivo: { name: 'Mitolocker exclusivo', monthlyFee: 5, description: 'Tu instrumento queda reservado exclusivamente para ti. Nadie más puede utilizarlo.' }
};

export const FIXED_SERVICES = [
  { key: 'mitobox', name: 'Mitobox', flag: 'hasMitobox', monthlyFee: 35 },
  { key: 'mitoverso', name: 'Mitoverso', flag: 'hasMitoverso', monthlyFee: 15 },
  { key: 'gymusik', name: 'Gymusik', flag: 'hasGymusik' },
  { key: 'mitolocker', name: 'Mitolocker', flag: 'hasMitolocker' }
];

export const getMitolockerMode = value => Object.hasOwn(MITOLOCKER_MODES, value) ? value : '';
export const mitolockerPatch = value => ({ hasMitolocker: Boolean(getMitolockerMode(value)), mitolockerMode: getMitolockerMode(value) });
export const activeFixedServices = (student = {}) => FIXED_SERVICES
  .filter(service => student[service.flag] === true)
  .map(service => service.key === 'mitolocker'
    ? { ...service, ...(MITOLOCKER_MODES[student.mitolockerMode] || { name: 'Mitolocker (modalidad pendiente)', monthlyFee: 0 }) }
    : service);
export const hasFixedServices = (student = {}) => activeFixedServices(student).length > 0;
export const hasIndependentServices = (student = {}) => activeFixedServices(student).some(service => service.key !== 'mitolocker');

// Explicit empty selection means keep every service. Legacy total withdrawals
// retain their original scope; legacy partial withdrawals affect classes only.
export const cancelledServiceKeys = (gestion = {}, student = {}, losesLastClass = false) => {
  const dependentKeys = losesLastClass && student.hasMitolocker === true ? ['mitolocker'] : [];
  if (gestion.serviceSelectionVersion === 1 || gestion.type === 'baja_servicios') {
    return [...new Set([...(Array.isArray(gestion.cancelledServiceKeys) ? gestion.cancelledServiceKeys : []), ...dependentKeys])]
      .filter(key => FIXED_SERVICES.some(service => service.key === key));
  }
  const scope = gestion.bajaScopeResolved || gestion.bajaScope || gestion.scope || gestion.bajaType || gestion.scheduledAction;
  const legacyTotal = gestion.type === 'baja' && (gestion.bajaTotal === true || gestion.isTotalBaja === true
    || gestion.totalBaja === true || ['total', 'baja_total', 'todas'].includes(scope)
    || (!gestion.sourceClassId && !gestion.sourceClassLine));
  return [...new Set([...(legacyTotal ? activeFixedServices(student).map(service => service.key) : []), ...dependentKeys])];
};
export const serviceCancellationPatch = (gestion = {}, student = {}, losesLastClass = false) => {
  const patch = {};
  cancelledServiceKeys(gestion, student, losesLastClass).forEach(key => {
    const service = FIXED_SERVICES.find(item => item.key === key);
    patch[service.flag] = false;
    if (key === 'mitolocker') patch.mitolockerMode = '';
    if (key === 'gymusik') patch.gymusikStatus = 'cancelled';
  });
  return patch;
};
export const fixedServiceSummary = (gestion = {}, student = {}) => cancelledServiceKeys(gestion, student)
  .map(key => activeFixedServices(student).find(service => service.key === key)?.name || FIXED_SERVICES.find(service => service.key === key)?.name)
  .join(', ');

export const mitolockerMetrics = (students = [], entitledStudentIds = null) => {
  const eligible = students.filter(student => student.globalStatus !== 'baja' && student.hasMitolocker === true && (!entitledStudentIds || entitledStudentIds.has(student.id)));
  const alumnosMitolockerCompartido = eligible.filter(student => student.mitolockerMode === 'compartido').length;
  const alumnosMitolockerExclusivo = eligible.filter(student => student.mitolockerMode === 'exclusivo').length;
  return { alumnosMitolockerCompartido, alumnosMitolockerExclusivo, ingresosMitolocker: alumnosMitolockerExclusivo * 5 };
};
