export const GYMUSIK_DEFAULTS = Object.freeze({
  active: false,
  preenrollmentOpen: false,
  studentPrice: 20,
  externalPrice: 35,
  monthlyCredits: 4,
  minimumMembers: 6,
  cancellationHours: 24,
  instruments: ['Guitarra']
});

export const GYMUSIK_MEMBER_STATUSES = Object.freeze({
  preenrolled: 'Preinscrito',
  active: 'Activo',
  paused: 'En pausa',
  cancelled: 'Baja'
});

export const GYMUSIK_SESSION_STATUSES = Object.freeze({
  draft: 'Borrador',
  published: 'Publicada',
  cancelled: 'Cancelada',
  completed: 'Completada'
});

export const GYMUSIK_RESERVATION_STATUSES = Object.freeze({
  confirmed: 'Confirmada',
  waitlist: 'Lista de espera',
  cancelled: 'Cancelada',
  attended: 'Asistió',
  no_show: 'No asistió'
});

export const normalizeGymusikId = (value = '', fallback = 'item') => {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || fallback;
};

export const sanitizeGymusikDocumentPart = (
  value = '',
  fallback = 'item'
) => (
  normalizeGymusikId(value, fallback).replace(/[^a-z0-9_-]/g, '-')
);

export const buildGymusikReservationId = (
  sessionId = '',
  studentId = ''
) => (
  `${sanitizeGymusikDocumentPart(
    sessionId,
    'sesion'
  )}_${sanitizeGymusikDocumentPart(studentId, 'alumno')}`
);

export const buildGymusikSessionId = ({
  date = '',
  time = '',
  instrument = '',
  centerId = ''
} = {}) => (
  [
    date,
    String(time || '').replace(':', ''),
    normalizeGymusikId(instrument, 'instrumento'),
    normalizeGymusikId(centerId, 'sede'),
    Date.now().toString(36)
  ]
    .filter(Boolean)
    .join('_')
);

export const normalizeGymusikConfig = (value = {}) => ({
  ...GYMUSIK_DEFAULTS,
  ...(value || {}),
  preenrollmentOpen: value?.preenrollmentOpen === true,
  studentPrice: Math.max(
    0,
    Number(
      value?.studentPrice ?? GYMUSIK_DEFAULTS.studentPrice
    ) || 0
  ),
  externalPrice: Math.max(
    0,
    Number(
      value?.externalPrice ?? GYMUSIK_DEFAULTS.externalPrice
    ) || 0
  ),
  monthlyCredits: Math.max(
    1,
    Math.trunc(
      Number(
        value?.monthlyCredits ?? GYMUSIK_DEFAULTS.monthlyCredits
      ) || GYMUSIK_DEFAULTS.monthlyCredits
    )
  ),
  minimumMembers: Math.max(
    1,
    Math.trunc(
      Number(
        value?.minimumMembers ?? GYMUSIK_DEFAULTS.minimumMembers
      ) || GYMUSIK_DEFAULTS.minimumMembers
    )
  ),
  cancellationHours: Math.max(
    0,
    Number(
      value?.cancellationHours
      ?? GYMUSIK_DEFAULTS.cancellationHours
    ) || 0
  ),
  instruments:
    Array.isArray(value?.instruments)
    && value.instruments.length > 0
      ? value.instruments
      : GYMUSIK_DEFAULTS.instruments
});

export const getGymusikMonth = value => (
  String(value || '').slice(0, 7)
);

export const isGymusikReservationActive = reservation => (
  ['confirmed', 'attended', 'no_show'].includes(
    String(reservation?.status || '').toLowerCase()
  )
);

export const isGymusikWaitlistReservation = reservation => (
  String(reservation?.status || '').toLowerCase() === 'waitlist'
);

export const getGymusikCreditsUsed = ({
  reservations = [],
  studentId = '',
  month = ''
} = {}) => (
  (reservations || []).filter(reservation => (
    String(reservation.studentId || '') === String(studentId || '')
    && getGymusikMonth(
      reservation.sessionDate || reservation.date
    ) === month
    && (
      isGymusikReservationActive(reservation)
      || isGymusikWaitlistReservation(reservation)
      || (
        reservation.status === 'cancelled'
        && reservation.creditConsumed === true
      )
    )
  )).length
);

export const getGymusikCreditsRemaining = ({
  reservations = [],
  studentId = '',
  month = '',
  monthlyCredits = 4
} = {}) => (
  Math.max(
    0,
    Math.max(1, Number(monthlyCredits) || 4)
      - getGymusikCreditsUsed({
        reservations,
        studentId,
        month
      })
  )
);

export const getGymusikSessionStart = session => {
  const date = String(session?.date || '').slice(0, 10);
  const time = String(session?.time || '00:00').slice(0, 5);

  if (!date) return null;

  const parsed = new Date(`${date}T${time}:00`);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const canCancelGymusikReservationWithCredit = ({
  session = {},
  now = new Date(),
  cancellationHours = 24
} = {}) => {
  const startsAt = getGymusikSessionStart(session);

  if (!startsAt) return false;

  return (
    startsAt.getTime() - now.getTime()
    >= Math.max(0, Number(cancellationHours) || 0)
      * 60
      * 60
      * 1000
  );
};

export const sortGymusikSessions = sessions => (
  [...(sessions || [])].sort((left, right) => (
    `${left.date || ''}T${left.time || ''}`.localeCompare(
      `${right.date || ''}T${right.time || ''}`
    )
  ))
);

export const getGymusikCapacity = session => (
  Math.max(
    1,
    Math.trunc(Number(session?.capacity) || 1)
  )
);
