export const RECOVERY_CAPACITY_VERSION = 1;
export const recoveryAvailabilityId = (classPath) =>
  encodeURIComponent(String(classPath || "").trim());
export const addRecoveryDays = (date, count) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + count * 86400000)
    .toISOString()
    .slice(0, 10);
const entryId = (entry) => String(entry.id || entry.studentId || "");
const isRecovery = (entry) =>
  entry.isRecovery === true ||
  entry.type === "recovery" ||
  entry.status === "recovery";
const closed = (status) =>
  [
    "cancelled",
    "cancelado",
    "cancelada",
    "expired",
    "finalizada",
    "inactive",
    "deleted",
  ].includes(String(status || "").toLowerCase());
const matchingClass = (item, prefix, clase) =>
  item[`${prefix}ClassRefPath`]
    ? item[`${prefix}ClassRefPath`] === clase.refPath
    : String(item[`${prefix}ClassId`] || "") === String(clase.id || "");
export const recoveryClassOccurs = (clase = {}, date = "") => {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    closed(clase.status) ||
    clase.cancelled === true ||
    clase.autoCancelled?.[date] === true ||
    (clase.cancelledDates || []).includes(date) ||
    clase.exceptions?.[date]?.cancelled === true
  )
    return false;
  if (clase.startDate && clase.startDate > date) return false;
  if (
    clase.isRecurring === false ||
    (clase.isRecurring !== true && (clase.date || clase.specificDate))
  )
    return String(clase.date || clase.specificDate).slice(0, 10) === date;
  return Number(clase.dayOfWeek) === new Date(`${date}T12:00:00Z`).getUTCDay();
};
export const recoveryEntryActive = (
  entry = {},
  profile = {},
  date = "",
  periods = [],
) => {
  if (
    profile.globalStatus === "baja" ||
    entry.pendingStart === true ||
    entry.enrollmentStatus === "pending_start"
  )
    return false;
  if (isRecovery(entry)) return entry.recoveryDate === date;
  if (entry.isPunctual || entry.isTemporary)
    return (
      String(
        entry.date || entry.specificDate || entry.recoveryDate || "",
      ).slice(0, 10) === date
    );
  const from =
    entry.classStartDate ||
    entry.scheduledStartDate ||
    entry.startDate ||
    profile.classStartDate ||
    "";
  const until =
    entry.classEndDate ||
    entry.scheduledEndDate ||
    entry.endDate ||
    entry.until ||
    (profile.scheduledBaja ? profile.scheduledBajaClassEndDate : "") ||
    profile.classEndDate ||
    "";
  if ((from && from > date) || (until && until < date)) return false;
  return !periods.some(
    (period) =>
      period.studentId === entryId(entry) &&
      !closed(period.status) &&
      period.from <= date &&
      period.until >= date,
  );
};
// Counts people rather than raw rows; recoveries on other dates never consume
// this session. An absence notice alone does not free a fixed student's place.
export const recoverySessionOccupancy = (
  clase = {},
  date = "",
  options = {},
) => {
  const byId = new Map(
    (options.students || []).map((student) => [String(student.id), student]),
  );
  const periods = options.maintenancePeriods || [];
  const relocations = (options.temporaryRelocations || []).filter(
    (item) =>
      !closed(item.status) &&
      item.from <= date &&
      (!item.until || item.until >= date),
  );
  const people = new Map();
  (clase.students || []).forEach((entry, index) => {
    const id = entryId(entry) || `row-${index}`;
    if (!recoveryEntryActive(entry, byId.get(id) || {}, date, periods)) return;
    if (
      !isRecovery(entry) &&
      relocations.some(
        (item) =>
          String(item.studentId) === id && matchingClass(item, "source", clase),
      )
    )
      return;
    if (!people.has(id) || !isRecovery(entry))
      people.set(id, { id, recovery: isRecovery(entry) });
  });
  relocations
    .filter((item) => matchingClass(item, "target", clase))
    .forEach((item) => {
      const id = String(item.studentId || "");
      if (id && recoveryEntryActive({ id }, byId.get(id) || {}, date, periods))
        people.set(id, { id, recovery: false });
    });
  const rows = [...people.values()];
  return {
    baseCount: rows.filter((row) => !row.recovery).length,
    recoveryCount: rows.filter((row) => row.recovery).length,
    count: rows.length,
    studentIds: rows.map((row) => row.id),
  };
};
export const recoverySessionState = (availability, date, excludeHold = "") => {
  const session = availability?.sessions?.[date];
  if (
    !availability ||
    availability.enabled !== true ||
    !session ||
    session.cancelled
  )
    return { ready: false, free: 0, occupied: 0, pending: 0 };
  const pending = new Set(
    (session.holds || []).filter((id) => id !== excludeHold),
  ).size;
  const occupied =
    Number(session.baseCount || 0) + Number(session.recoveryCount || 0);
  return {
    ready: true,
    free: Math.max(0, Number(availability.capacity || 0) - occupied - pending),
    occupied,
    pending,
  };
};
export const recoveryDates = (
  clase,
  today,
  {
    ticket,
    blockedDates = [],
    availability,
    limit = 4,
    horizon = 120,
    requireFree = true,
    includeToday = false,
  } = {},
) => {
  const dates = [];
  const blocked = new Set(blockedDates);
  for (
    let day = includeToday ? 0 : 1;
    day <= horizon && dates.length < limit;
    day++
  ) {
    const date = addRecoveryDays(today, day);
    if (
      !recoveryClassOccurs(clase, date) ||
      blocked.has(date) ||
      (ticket?.validFrom && date < ticket.validFrom) ||
      (ticket?.validUntil && date > ticket.validUntil)
    )
      continue;
    if (requireFree && recoverySessionState(availability, date).free <= 0)
      continue;
    dates.push(date);
  }
  return dates;
};
export const recoveryTargetsClass = (gestion = {}, clase = {}) =>
  gestion.requestedClassRefPath
    ? gestion.requestedClassRefPath === clase.refPath
    : String(gestion.requestedClass || "") === String(clase.id || "");
export const recoveryPublicationSignature = (
  clase,
  options,
  gestiones,
  today,
  enabled,
) =>
  JSON.stringify({
    clase,
    today,
    enabled,
    profiles: (options.students || [])
      .filter((student) =>
        (clase.students || []).some(
          (entry) => entryId(entry) === String(student.id),
        ),
      )
      .map(
        ({
          id,
          globalStatus,
          classStartDate,
          classEndDate,
          scheduledBaja,
          scheduledBajaClassEndDate,
        }) => ({
          id,
          globalStatus,
          classStartDate,
          classEndDate,
          scheduledBaja,
          scheduledBajaClassEndDate,
        }),
      ),
    maintenancePeriods: options.maintenancePeriods || [],
    temporaryRelocations: options.temporaryRelocations || [],
    requests: gestiones
      .filter(
        (gestion) =>
          gestion.type === "recuperacion" &&
          recoveryTargetsClass(gestion, clase),
      )
      .map(({ id, status, recoveryDate }) => ({ id, status, recoveryDate }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
