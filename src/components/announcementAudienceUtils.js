import { getSchoolParts } from './vacationChallengeUtils.js';

export const BOARD_WEEKDAYS = [
  { value: 1, label: 'Lunes' }, { value: 2, label: 'Martes' }, { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' }, { value: 5, label: 'Viernes' }, { value: 6, label: 'Sábado' }, { value: 0, label: 'Domingo' }
];
const strings = values => [...new Set((Array.isArray(values) ? values : []).map(value => String(value || '').trim()).filter(Boolean))].sort();
const folded = value => String(value || '').trim().toLocaleLowerCase('es');

export const normalizeBoardFilters = (filters = {}) => ({
  centers: strings(filters.centers), instruments: strings(filters.instruments), teachers: strings(filters.teachers),
  weekdays: [...new Set((Array.isArray(filters.weekdays) ? filters.weekdays : []).filter(value => typeof value === 'number' || (typeof value === 'string' && /^[0-6]$/.test(value))).map(Number).filter(value => Number.isInteger(value) && value >= 0 && value <= 6))].sort()
});
export const boardAudienceOptions = (record = {}) => ({
  targetType: record.audienceType === 'filtered' ? 'filters' : record.targetType || record.audienceType || 'all',
  targetValue: String(record.targetValue || record.audienceValue || '').trim(),
  filters: normalizeBoardFilters(record.filters || record.audienceFilters)
});
export const boardAudienceSignature = record => {
  const options = boardAudienceOptions(record);
  return JSON.stringify([options.targetType, options.targetType === 'filters' ? options.filters : options.targetValue]);
};
export const validBoardAudience = record => {
  const options = boardAudienceOptions(record);
  return ['all', 'teachers'].includes(options.targetType) || (options.targetType === 'filters'
    ? Object.values(options.filters).some(values => values.length > 0) : Boolean(options.targetValue));
};
export const matchesBoardClass = (classData, record, comparators = {}) => {
  const options = boardAudienceOptions(record);
  const sameCenter = comparators.isSameCenter || ((a, b) => folded(a) === folded(b));
  const sameTeacher = comparators.isSameTeacher || ((a, b) => folded(a) === folded(b));
  const center = classData.centerId || classData.sede || 'Tarragona';
  if (options.targetType === 'all') return true;
  if (!validBoardAudience(options)) return false;
  if (options.targetType === 'sede') return sameCenter(center, options.targetValue);
  if (options.targetType === 'instrumento') return folded(classData.subject) === folded(options.targetValue);
  if (options.targetType === 'profesor') return sameTeacher(classData.teacher, options.targetValue);
  if (options.targetType !== 'filters' || !validBoardAudience(options)) return false;
  const filters = options.filters;
  // Dentro de una categoría se cumple cualquiera de los valores; una misma
  // clase tiene que cumplir simultáneamente todas las categorías elegidas.
  return (!filters.centers.length || filters.centers.some(value => sameCenter(center, value)))
    && (!filters.instruments.length || filters.instruments.some(value => folded(classData.subject) === folded(value)))
    && (!filters.teachers.length || filters.teachers.some(value => sameTeacher(classData.teacher, value)))
    && (!filters.weekdays.length || filters.weekdays.includes(Number(classData.dayOfWeek)));
};
export const buildBoardAudienceFields = (record, targets = []) => {
  const options = boardAudienceOptions(record);
  return {
    audienceType: options.targetType === 'filters' ? 'filtered' : options.targetType,
    audienceValue: ['filters', 'teachers'].includes(options.targetType) ? '' : options.targetValue,
    audienceFilters: options.targetType === 'filters' ? options.filters : {},
    recipientStudentIds: options.targetType === 'filters' ? strings(targets.map(target => target.studentId)) : []
  };
};
export const boardFiltersLabel = record => {
  const filters = boardAudienceOptions(record).filters;
  return [
    filters.centers.length ? `Sede: ${filters.centers.join(' o ')}` : '',
    filters.instruments.length ? `Instrumento: ${filters.instruments.join(' o ')}` : '',
    filters.teachers.length ? `Profesor: ${filters.teachers.join(' o ')}` : '',
    filters.weekdays.length ? `Días: ${BOARD_WEEKDAYS.filter(day => filters.weekdays.includes(day.value)).map(day => day.label).join(' o ')}` : ''
  ].filter(Boolean).join(' · ') || 'Selecciona al menos un filtro';
};
export const getUnseenBoardResponses = (announcementId, pollResponses = [], callResponses = []) => [
  ...pollResponses.filter(response => response.pollId === announcementId).map(response => ({ ...response, collectionName: 'pollResponses' })),
  ...callResponses.filter(response => (response.callId || response.announcementId) === announcementId).map(response => ({ ...response, collectionName: 'callResponses' }))
].filter(response => !response.adminSeenAt);
export const unreadBoardPublicationIds = (pollResponses = [], callResponses = []) => new Set([
  ...pollResponses.filter(response => !response.adminSeenAt).map(response => response.pollId),
  ...callResponses.filter(response => !response.adminSeenAt).map(response => response.callId || response.announcementId)
].filter(Boolean));
export const boardNowLocal = (clock = Date.now()) => {
  const p = getSchoolParts(clock), pad = value => String(value).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
};
export const isBoardPublicationArchived = record => Boolean(record.archived || record.pollStatus === 'archived' || record.callStatus === 'archived');
export const boardPublicationState = (record, clock = Date.now()) => {
  if (isBoardPublicationArchived(record)) return 'archived';
  if (record.type === 'tray_notice') {
    if (record.expiresAt && record.expiresAt <= boardNowLocal(clock)) return 'expired';
    if (record.publishAt && record.publishAt > boardNowLocal(clock)) return 'scheduled';
  }
  const deadline = record.type === 'poll' ? record.pollDeadline : record.type === 'call' ? record.callDeadline : '';
  if (record.pollStatus === 'closed' || record.callStatus === 'closed' || (deadline && new Date(deadline).getTime() <= clock)) return 'closed';
  return 'active';
};
export const matchesBoardView = (record, view, unreadIds = new Set(), clock = Date.now()) => {
  if (view === 'unread') return record.type !== 'tray_notice' && unreadIds.has(record.id);
  const historical = ['archived', 'expired', 'closed'].includes(boardPublicationState(record, clock));
  return view === 'history' ? historical : !historical;
};
export const boardArchiveFields = (record, archived, now = new Date().toISOString()) => {
  const result = { archived, archivedAt: archived ? now : '', updatedAt: now };
  const key = record.type === 'poll' ? 'pollStatus' : record.type === 'call' ? 'callStatus' : '';
  const previousKey = record.type === 'poll' ? 'previousPollStatus' : 'previousCallStatus';
  if (key) {
    const previous = record[key] === 'archived' ? record[previousKey] || 'open' : record[key] || 'open';
    result[key] = archived ? 'archived' : record[previousKey] || 'open';
    result[previousKey] = archived ? previous : record[previousKey] || 'open';
  }
  return result;
};
export const buildBoardInboxItem = (notificationId, record) => ({
  notificationId, type: 'tray_notice', title: record.title || '', content: record.content || '', url: record.url || '',
  publishAt: record.publishAt || '', expiresAt: record.expiresAt || '', audienceLabel: record.audienceLabel || '',
  archived: Boolean(record.archived), updatedAt: record.updatedAt || '', updatedBy: record.updatedBy || '',
  createdAt: record.createdAt || record.updatedAt || '', createdBy: record.createdBy || record.updatedBy || ''
});
