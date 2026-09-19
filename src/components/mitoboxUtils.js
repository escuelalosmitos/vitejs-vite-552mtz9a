const normalizeId = (value = '', fallback = '') => {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
};

const unique = values => [...new Set((values || []).filter(Boolean))];

export const buildMitoboxSlotId = ({ date = '', centerId = '', roomId = '', time = '' } = {}) => (
  [date, normalizeId(centerId, 'sede'), normalizeId(roomId, 'sala'), String(time || '').replace(':', '')]
    .filter(Boolean)
    .join('_')
);

export const buildMitoboxReservationId = ({ studentId = '', date = '', time = '' } = {}) => (
  [date, String(time || '').replace(':', ''), normalizeId(studentId, 'alumno')]
    .filter(Boolean)
    .join('_')
);

const normalizeDate = value => {
  if (!value) return '';
  if (typeof value?.toDate === 'function') {
    const date = value.toDate();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  return String(value || '').trim().slice(0, 10);
};

const isPunctualClass = classData => Boolean(classData?.date || classData?.specificDate) || classData?.isRecurring === false;

const getClassIds = classData => unique([
  classData?.id,
  classData?.docId,
  classData?.classId,
  classData?.canonicalClassId,
  classData?.officialClassId
].map(value => String(value || '').trim()));

const temporaryChangeBelongsToClass = (change = {}, classData = {}) => {
  const ids = new Set(getClassIds(classData));
  const changeId = String(change.classId || '').trim();
  if (changeId && ids.has(changeId)) return true;
  const classPath = String(classData.refPath || classData.classRefPath || '').trim();
  return Boolean(classPath && change.classRefPath && String(change.classRefPath) === classPath);
};

const isTemporaryChangeActive = (change = {}, date = '') => {
  const status = String(change.status || '').toLowerCase();
  if (['cancelled', 'cancelada', 'finalizada', 'expired'].includes(status)) return false;
  const from = normalizeDate(change.from);
  const until = normalizeDate(change.until);
  return Boolean(from && until && date && from <= date && until >= date);
};

const getEffectiveClass = (classData = {}, date = '', temporaryClassChanges = []) => {
  if (isPunctualClass(classData)) return classData;
  const change = [...temporaryClassChanges]
    .filter(item => temporaryChangeBelongsToClass(item, classData) && isTemporaryChangeActive(item, date))
    .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))[0];
  if (!change) return classData;
  return {
    ...classData,
    dayOfWeek: Number(change.dayOfWeek),
    time: change.time || classData.time,
    centerId: change.centerId || classData.centerId,
    roomId: change.roomId || classData.roomId,
    sede: change.sede || classData.sede,
    sala: change.sala || classData.sala,
    duration: Number(change.duration) || Number(classData.duration) || 60,
    temporaryClassChange: change
  };
};

const getStudentId = student => String(student?.id || student?.studentId || '').trim();

const isRelocationActive = (relocation = {}, date = '') => {
  const status = String(relocation.status || '').toLowerCase();
  if (['cancelled', 'cancelada', 'finalizada', 'expired'].includes(status)) return false;
  const from = normalizeDate(relocation.from);
  const until = normalizeDate(relocation.until);
  return Boolean(from && until && from <= date && until >= date);
};

const classMatchesReference = (classData = {}, classId = '', classPath = '') => {
  if (classPath && [classData.refPath, classData.classRefPath].filter(Boolean).includes(classPath)) return true;
  return Boolean(classId && getClassIds(classData).includes(String(classId)));
};

const getEffectiveStudentCount = (classData = {}, date = '', relocations = []) => {
  const publishedCount = [classData.mitoboxStudentCount, classData.committedSeatCount, classData.activeStudentCount]
    .map(Number)
    .find(Number.isFinite);
  const studentIds = unique((classData.students || []).map(getStudentId));
  const relocationKey = relocation => String(relocation.studentId || relocation.id || [
    relocation.sourceClassId,
    relocation.targetClassId,
    relocation.from,
    relocation.until
  ].join('|')).trim();
  const movedOut = new Set(relocations
    .filter(relocation => isRelocationActive(relocation, date))
    .filter(relocation => classMatchesReference(
      classData,
      relocation.sourceClassId || relocation.sourceClass || relocation.originClassId,
      relocation.sourceClassRefPath || relocation.sourceRefPath || relocation.originClassRefPath
    ))
    .map(relocationKey)
    .filter(Boolean));
  const movedIn = relocations
    .filter(relocation => isRelocationActive(relocation, date))
    .filter(relocation => classMatchesReference(
      classData,
      relocation.targetClassId || relocation.targetClass,
      relocation.targetClassRefPath || relocation.targetRefPath
    ))
    .map(relocationKey)
    .filter(Boolean);
  if (Number.isFinite(publishedCount)) {
    return Math.max(0, publishedCount - movedOut.size + unique(movedIn).length);
  }
  return unique([...studentIds.filter(studentId => !movedOut.has(studentId)), ...movedIn]).length;
};

const classOccursOnDate = (classData = {}, date = '') => {
  if (isPunctualClass(classData)) {
    return normalizeDate(classData.date || classData.specificDate) === date;
  }
  const targetDay = new Date(`${date}T00:00:00`).getDay();
  return Number(classData.dayOfWeek) === targetDay;
};

const isSameLocationValue = (left = '', right = '') => normalizeId(left) === normalizeId(right);

const timeToMinutes = value => {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

const classOverlapsReservation = (classData = {}, reservationTime = '', reservationDuration = 60) => {
  const classStart = timeToMinutes(classData.time);
  const reservationStart = timeToMinutes(reservationTime);
  if (classStart === null || reservationStart === null) return false;
  const classEnd = classStart + Math.max(1, Number(classData.duration) || 60);
  const reservationEnd = reservationStart + Math.max(1, Number(reservationDuration) || 60);
  return classStart < reservationEnd && reservationStart < classEnd;
};

export const isMitoboxSchoolClosed = ({ date = '', center = {}, settings = {} } = {}) => (
  (settings.festivos || []).includes(date)
  || (settings.vacaciones || []).includes(date)
  || (center.holidays || []).includes(date)
);

export const calculateMitoboxAvailability = ({
  date = '',
  center = null,
  classes = [],
  temporaryClassChanges = [],
  temporaryRelocations = [],
  settings = {},
  slotUsage = []
} = {}) => {
  if (!date || !center || isMitoboxSchoolClosed({ date, center, settings })) return [];

  const scheduledClasses = (classes || [])
    .map(classData => getEffectiveClass(classData, date, temporaryClassChanges))
    .filter(classData => classOccursOnDate(classData, date))
    .filter(classData => isSameLocationValue(classData.centerId || classData.sede, center.id || center.name))
    .filter(classData => getEffectiveStudentCount(classData, date, temporaryRelocations) > 0);

  // Los bloques empiezan en horas en las que existe docencia real en la sede.
  // Una cancelación libera el aula, pero conserva la hora como bloque reservable.
  const candidateTimes = unique(scheduledClasses.map(classData => String(classData.time || '').trim())).sort();
  const occupyingClasses = scheduledClasses.filter(classData => !(classData.cancelledDates || []).includes(date));
  const usageBySlotId = new Map((slotUsage || []).map(item => [String(item.slotId || item.id || ''), item]));
  const slots = [];

  candidateTimes.forEach(time => {
    const occupiedRoomIds = new Set(occupyingClasses
      .filter(classData => classOverlapsReservation(classData, time, 60))
      .map(classData => normalizeId(classData.roomId || classData.sala, 'sala')));

    (center.rooms || [])
      .filter(room => room.active !== false && room.mitoboxEnabled !== false)
      .filter(room => !occupiedRoomIds.has(normalizeId(room.id || room.name, 'sala')))
      .forEach(room => {
        const capacity = Math.max(1, Number(room.capacity || 1));
        const slotId = buildMitoboxSlotId({ date, centerId: center.id || center.name, roomId: room.id || room.name, time });
        const usage = usageBySlotId.get(slotId);
        const reservedCount = Math.max(0, Number(usage?.reservedCount || 0));
        const freeSeats = Math.max(0, capacity - reservedCount);
        if (freeSeats < 1) return;
        slots.push({
          slotId,
          date,
          time,
          centerId: center.id || normalizeId(center.name, 'sede'),
          sede: center.name,
          roomId: room.id || normalizeId(room.name, 'sala'),
          sala: room.name,
          capacity,
          reservedCount,
          freeSeats
        });
      });
  });

  return slots.sort((left, right) => left.time.localeCompare(right.time) || left.sala.localeCompare(right.sala, 'es'));
};

export const isActiveMitoboxReservation = reservation => (
  !['cancelled', 'cancelada', 'rejected', 'rechazada'].includes(String(reservation?.status || '').toLowerCase())
);
