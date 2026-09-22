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

export const buildMitoboxSlotId = ({
  date = '',
  centerId = '',
  roomId = '',
  time = ''
} = {}) => (
  [
    date,
    normalizeId(centerId, 'sede'),
    normalizeId(roomId, 'sala'),
    String(time || '').replace(':', '')
  ]
    .filter(Boolean)
    .join('_')
);

export const buildMitoboxReservationId = ({
  studentId = '',
  date = '',
  time = ''
} = {}) => (
  [
    date,
    String(time || '').replace(':', ''),
    normalizeId(studentId, 'alumno')
  ]
    .filter(Boolean)
    .join('_')
);

const normalizeDate = value => {
  if (!value) return '';

  if (typeof value?.toDate === 'function') {
    const date = value.toDate();

    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(date.getDate()).padStart(2, '0')}`;
  }

  return String(value || '').trim().slice(0, 10);
};

const isPunctualClass = classData =>
  Boolean(classData?.date || classData?.specificDate)
  || classData?.isRecurring === false;

const getClassIds = classData =>
  unique(
    [
      classData?.id,
      classData?.docId,
      classData?.classId,
      classData?.canonicalClassId,
      classData?.officialClassId
    ].map(value => String(value || '').trim())
  );

const temporaryChangeBelongsToClass = (change = {}, classData = {}) => {
  const ids = new Set(getClassIds(classData));
  const changeId = String(change.classId || '').trim();

  if (changeId && ids.has(changeId)) return true;

  const classPath = String(
    classData.refPath || classData.classRefPath || ''
  ).trim();

  return Boolean(
    classPath
    && change.classRefPath
    && String(change.classRefPath) === classPath
  );
};

const isTemporaryChangeActive = (change = {}, date = '') => {
  const status = String(change.status || '').toLowerCase();

  if (
    ['cancelled', 'cancelada', 'finalizada', 'expired'].includes(status)
  ) {
    return false;
  }

  const from = normalizeDate(change.from);
  const until = normalizeDate(change.until);

  return Boolean(
    from
    && until
    && date
    && from <= date
    && until >= date
  );
};

const getEffectiveClass = (
  classData = {},
  date = '',
  temporaryClassChanges = []
) => {
  if (isPunctualClass(classData)) return classData;

  const change = [...temporaryClassChanges]
    .filter(
      item =>
        temporaryChangeBelongsToClass(item, classData)
        && isTemporaryChangeActive(item, date)
    )
    .sort((left, right) =>
      String(right.createdAt || '').localeCompare(
        String(left.createdAt || '')
      )
    )[0];

  if (!change) return classData;

  return {
    ...classData,
    dayOfWeek: Number(change.dayOfWeek),
    time: change.time || classData.time,
    centerId: change.centerId || classData.centerId,
    roomId: change.roomId || classData.roomId,
    sede: change.sede || classData.sede,
    sala: change.sala || classData.sala,
    duration:
      Number(change.duration)
      || Number(classData.duration)
      || 60,
    temporaryClassChange: change
  };
};

const getStudentId = student =>
  String(student?.id || student?.studentId || '').trim();

const isRelocationActive = (relocation = {}, date = '') => {
  const status = String(relocation.status || '').toLowerCase();

  if (
    ['cancelled', 'cancelada', 'finalizada', 'expired'].includes(status)
  ) {
    return false;
  }

  const from = normalizeDate(relocation.from);
  const until = normalizeDate(relocation.until);

  return Boolean(
    from
    && until
    && from <= date
    && until >= date
  );
};

const classMatchesReference = (
  classData = {},
  classId = '',
  classPath = ''
) => {
  if (
    classPath
    && [classData.refPath, classData.classRefPath]
      .filter(Boolean)
      .includes(classPath)
  ) {
    return true;
  }

  return Boolean(
    classId
    && getClassIds(classData).includes(String(classId))
  );
};

const isOccupancyActiveOnDate = (
  occupancy = {},
  date = ''
) => (
  (!occupancy.from || normalizeDate(occupancy.from) <= date)
  && (!occupancy.until || normalizeDate(occupancy.until) >= date)
  && !(occupancy.maintenance || []).some(period => (
    normalizeDate(period.from) <= date
    && normalizeDate(period.until) >= date
  ))
);

const getEffectiveStudentCount = (
  classData = {},
  date = '',
  relocations = []
) => {
  // Estos campos cuentan únicamente alumnos que realmente tienen clase.
  // Mantenimiento e inicios futuros no deben bloquear un aula de Mitobox.
  const publishedCount = [
    classData.mitoboxStudentCount,
    classData.activeStudentCount
  ]
    .map(Number)
    .find(Number.isFinite);

  const studentIds = unique(
    (classData.students || [])
      .filter(
        student =>
          student?.isMaintenance !== true
          && student?.isFutureStart !== true
          && student?.isActive !== false
      )
      .map(getStudentId)
  );

  const relocationKey = relocation =>
    String(
      relocation.studentId
      || relocation.id
      || [
        relocation.sourceClassId,
        relocation.targetClassId,
        relocation.from,
        relocation.until
      ].join('|')
    ).trim();

  const movedOut = new Set(
    relocations
      .filter(relocation => isRelocationActive(relocation, date))
      .filter(relocation =>
        classMatchesReference(
          classData,
          relocation.sourceClassId
            || relocation.sourceClass
            || relocation.originClassId,
          relocation.sourceClassRefPath
            || relocation.sourceRefPath
            || relocation.originClassRefPath
        )
      )
      .map(relocationKey)
      .filter(Boolean)
  );

  const movedIn = relocations
    .filter(relocation => isRelocationActive(relocation, date))
    .filter(relocation =>
      classMatchesReference(
        classData,
        relocation.targetClassId || relocation.targetClass,
        relocation.targetClassRefPath || relocation.targetRefPath
      )
    )
    .map(relocationKey)
    .filter(Boolean);

  const datedOccupancy = Array.isArray(classData.mitoboxOccupancy)
    ? classData.mitoboxOccupancy.filter(
        occupancy => isOccupancyActiveOnDate(occupancy, date)
      ).length
    : null;

  if (datedOccupancy !== null) {
    return Math.max(
      0,
      datedOccupancy - movedOut.size + unique(movedIn).length
    );
  }

  if (Number.isFinite(publishedCount)) {
    return Math.max(
      0,
      publishedCount - movedOut.size + unique(movedIn).length
    );
  }

  return unique([
    ...studentIds.filter(studentId => !movedOut.has(studentId)),
    ...movedIn
  ]).length;
};

const classOccursOnDate = (classData = {}, date = '') => {
  if (isPunctualClass(classData)) {
    return normalizeDate(
      classData.date || classData.specificDate
    ) === date;
  }

  const targetDay = new Date(`${date}T00:00:00`).getDay();

  return Number(classData.dayOfWeek) === targetDay;
};

const getLocationValues = values =>
  unique(
    (values || [])
      .flatMap(value => (Array.isArray(value) ? value : [value]))
      .map(value => normalizeId(value))
      .filter(Boolean)
  );

const locationValuesOverlap = (
  leftValues = [],
  rightValues = []
) => {
  const right = new Set(getLocationValues(rightValues));

  return getLocationValues(leftValues).some(value => right.has(value));
};

// Compatibilidad con clases antiguas: unas guardan el ID estable y otras el
// nombre visible. También se conservan alias cuando una sede o sala se renombra.
const classMatchesCenter = (classData = {}, center = {}) =>
  locationValuesOverlap(
    [
      classData.centerId,
      classData.sede,
      classData.center,
      classData.centerName
    ],
    [
      center.id,
      center.name,
      center.aliases
    ]
  );

const classMatchesRoom = (classData = {}, room = {}) =>
  locationValuesOverlap(
    [
      classData.roomId,
      classData.sala,
      classData.room,
      classData.roomName
    ],
    [
      room.id,
      room.name,
      room.aliases
    ]
  );

const timeToMinutes = value => {
  const match = String(value || '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})$/);

  if (!match) return null;

  return Number(match[1]) * 60 + Number(match[2]);
};

const minutesToTime = value => {
  const total = Number(value);

  if (
    !Number.isFinite(total)
    || total < 0
    || total >= 24 * 60
  ) {
    return '';
  }

  return `${String(Math.floor(total / 60)).padStart(
    2,
    '0'
  )}:${String(total % 60).padStart(2, '0')}`;
};

const classOverlapsReservation = (
  classData = {},
  reservationTime = '',
  reservationDuration = 60
) => {
  const classStart = timeToMinutes(classData.time);
  const reservationStart = timeToMinutes(reservationTime);

  if (classStart === null || reservationStart === null) {
    return false;
  }

  const classEnd =
    classStart + Math.max(1, Number(classData.duration) || 60);

  const reservationEnd =
    reservationStart
    + Math.max(1, Number(reservationDuration) || 60);

  return (
    classStart < reservationEnd
    && reservationStart < classEnd
  );
};

// Solo existe un turno Mitobox cuando una clase real empieza a esa hora.
// No dependemos del formato histórico de `duration`: algunas clases antiguas
// pueden guardar la duración de manera distinta aunque ocupen el bloque lectivo.
// Una clase hibernada libera su sala, pero nunca crea por sí sola un turno.
const buildCandidateTimes = teachingClasses => unique(
  (teachingClasses || [])
    .map(classData => String(classData.time || '').trim())
    .filter(time => timeToMinutes(time) !== null)
).sort(
  (left, right) =>
    (timeToMinutes(left) ?? 0) - (timeToMinutes(right) ?? 0)
);

export const isMitoboxSchoolClosed = ({
  date = '',
  center = {},
  settings = {}
} = {}) => (
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
  if (
    !date
    || !center
    || isMitoboxSchoolClosed({ date, center, settings })
  ) {
    return [];
  }

  // Las hibernadas se conservan para conocer la geometría del horario, pero no
  // ocupan aula ni acreditan presencia de un profesor.
  const classesAtCenter = (classes || [])
    .map(classData =>
      getEffectiveClass(
        classData,
        date,
        temporaryClassChanges
      )
    )
    .filter(classData => classOccursOnDate(classData, date))
    .filter(classData => classMatchesCenter(classData, center));

  const occupyingClasses = classesAtCenter
    .filter(
      classData =>
        getEffectiveStudentCount(
          classData,
          date,
          temporaryRelocations
        ) > 0
    )
    .filter(
      classData =>
        !(classData.cancelledDates || []).includes(date)
    );

  const candidateTimes = buildCandidateTimes(occupyingClasses);

  const usageBySlotId = new Map(
    (slotUsage || []).map(item => [
      String(item.slotId || item.id || ''),
      item
    ])
  );

  const slots = [];

  candidateTimes.forEach(time => {
    const overlappingClasses = occupyingClasses.filter(classData =>
      classOverlapsReservation(classData, time, 60)
    );

    (center.rooms || [])
      .filter(
        room =>
          room.active !== false
          && room.mitoboxEnabled !== false
      )
      .filter(
        room =>
          !overlappingClasses.some(classData =>
            classMatchesRoom(classData, room)
          )
      )
      .forEach(room => {
        const capacity = Math.max(
          1,
          Number(room.capacity || 1)
        );

        const slotId = buildMitoboxSlotId({
          date,
          centerId: center.id || center.name,
          roomId: room.id || room.name,
          time
        });

        const usage = usageBySlotId.get(slotId);

        const reservedCount = Math.max(
          0,
          Number(usage?.reservedCount || 0)
        );

        const freeSeats = Math.max(
          0,
          capacity - reservedCount
        );

        if (freeSeats < 1) return;

        slots.push({
          slotId,
          date,
          time,
          centerId:
            center.id || normalizeId(center.name, 'sede'),
          sede: center.name,
          roomId:
            room.id || normalizeId(room.name, 'sala'),
          sala: room.name,
          capacity,
          reservedCount,
          freeSeats
        });
      });
  });

  const sortedSlots = slots.sort(
    (left, right) =>
      left.time.localeCompare(right.time)
      || left.sala.localeCompare(right.sala, 'es')
  );

  const debugEnabled = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('mitoboxDebug') === '1';

  if (debugEnabled) {
    const diagnostic = {
      date,
      center: {
        id: center.id || '',
        name: center.name || '',
        aliases: center.aliases || [],
        rooms: (center.rooms || []).map(room => ({
          id: room.id || '',
          name: room.name || '',
          aliases: room.aliases || [],
          active: room.active !== false,
          mitoboxEnabled: room.mitoboxEnabled !== false
        }))
      },
      classesAtCenter: classesAtCenter.map(classData => ({
        id: classData.id || classData.docId || '',
        subject: classData.subject || '',
        time: classData.time || '',
        duration: classData.duration ?? '',
        centerId: classData.centerId || '',
        sede: classData.sede || '',
        roomId: classData.roomId || '',
        sala: classData.sala || '',
        room: classData.room || '',
        roomName: classData.roomName || '',
        effectiveStudentCount: getEffectiveStudentCount(
          classData,
          date,
          temporaryRelocations
        ),
        cancelledOnDate: (classData.cancelledDates || []).includes(date),
        mitoboxStudentCount: classData.mitoboxStudentCount ?? null,
        activeStudentCount: classData.activeStudentCount ?? null,
        occupancyWindows: Array.isArray(classData.mitoboxOccupancy)
          ? classData.mitoboxOccupancy.length
          : null
      })),
      candidateTimes,
      roomBlocking: candidateTimes.map(time => {
        const overlappingClasses = occupyingClasses.filter(classData =>
          classOverlapsReservation(classData, time, 60)
        );
        return {
          time,
          rooms: (center.rooms || []).map(room => ({
            roomId: room.id || '',
            sala: room.name || '',
            blockedBy: overlappingClasses
              .filter(classData => classMatchesRoom(classData, room))
              .map(classData => ({
                id: classData.id || classData.docId || '',
                subject: classData.subject || '',
                time: classData.time || '',
                duration: classData.duration ?? '',
                roomId: classData.roomId || '',
                sala: classData.sala || '',
                room: classData.room || '',
                roomName: classData.roomName || ''
              }))
          }))
        };
      }),
      resultingSlots: sortedSlots.map(slot => ({
        time: slot.time,
        roomId: slot.roomId,
        sala: slot.sala,
        freeSeats: slot.freeSeats
      }))
    };

    console.log(`MITOBOX_DIAGNOSTICO\n${JSON.stringify(diagnostic, null, 2)}`);
  }

  return sortedSlots;
};

export const isActiveMitoboxReservation = reservation => (
  ![
    'cancelled',
    'cancelada',
    'rejected',
    'rechazada'
  ].includes(
    String(reservation?.status || '').toLowerCase()
  )
);
