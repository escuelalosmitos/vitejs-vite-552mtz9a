// Este motor también se incluye en el HTML autónomo de WordPress.
// Sin acceso a Firebase, datos personales, cobros ni escrituras de reservas.
export function createEnrollmentPromotions() {
  const text = (value, limit = 2000) => String(value ?? '').trim().slice(0, limit);
  const list = value => [...new Set((Array.isArray(value) ? value : []).map(item => text(item, 180)).filter(Boolean))];
  const money = cents => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(cents / 100);
  const safeUrl = value => {
    try { const url = new URL(text(value, 2000)); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; }
    catch { return ''; }
  };
  const localParts = timestamp => Object.fromEntries(new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(timestamp)).map(part => [part.type, part.value]));
  function madridInput(timestamp) {
    if (!Number.isFinite(timestamp) || timestamp <= 0 || !Number.isFinite(new Date(timestamp).getTime())) return '';
    const p = localParts(timestamp);
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  }
  function madridMillis(value, endOfMinute = false) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(value || ''))) return 0;
    const target = Date.parse(`${value}:00Z`);
    if (!Number.isFinite(target)) return 0;
    let timestamp = target;
    for (let i = 0; i < 3; i++) {
      const actual = madridInput(timestamp);
      if (actual === value) return timestamp + (endOfMinute ? 59999 : 0);
      timestamp += target - Date.parse(`${actual}:00Z`);
    }
    return 0;
  }
  function normalize(value = {}) {
    value = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
      id: text(value.id, 100), name: text(value.name, 100), subtitle: text(value.subtitle, 300), conditions: text(value.conditions, 3000),
      status: ['enabled', 'paused'].includes(value.status) ? value.status : 'draft',
      startsAt: Number(value.startsAt) || 0, endsAt: Number(value.endsAt) || 0,
      commonUrl: safeUrl(value.commonUrl), priority: Math.max(0, Math.min(999, Math.floor(Number(value.priority) || 0))),
      discountType: value.discountType === 'fixed' ? 'fixed' : 'percent', discountValue: Number(value.discountValue) || 0,
      durationType: ['months', 'until', 'ongoing'].includes(value.durationType) ? value.durationType : 'first_receipt',
      durationMonths: Math.max(1, Math.min(36, Math.floor(Number(value.durationMonths) || 1))), benefitUntil: text(value.benefitUntil, 10),
      intakeMonth: text(value.intakeMonth, 7), benefitStartMonth: text(value.benefitStartMonth, 7),
      billingText: text(value.billingText, 1000), commitmentText: text(value.commitmentText, 1000),
      summaryTerms: text(value.summaryTerms, 500),
      centers: list(value.centers), instruments: list(value.instruments), capacities: list(value.capacities), days: list(value.days),
      selectionIds: list(value.selectionIds), excludedSelectionIds: list(value.excludedSelectionIds),
      modes: list(value.modes).filter(mode => ['group', 'private'].includes(mode))
    };
  }
  function error(value) {
    const c = normalize(value);
    if (!c.id || !c.name) return 'Escribe un nombre para la campaña.';
    if (c.status !== 'enabled') return '';
    if (!c.commonUrl) return 'Añade el enlace HTTPS común de Tadosi.';
    if (!Number.isFinite(new Date(c.startsAt).getTime()) || !Number.isFinite(new Date(c.endsAt).getTime()) || c.startsAt <= 0 || c.endsAt < c.startsAt) return 'Revisa el inicio y el fin de la campaña.';
    if (!Number.isFinite(c.discountValue) || c.discountValue <= 0 || (c.discountType === 'percent' && c.discountValue > 100)) return 'Revisa el descuento: porcentaje entre 0 y 100 o importe positivo.';
    if (!c.conditions) return 'Escribe las condiciones que verá la persona interesada.';
    if ([c.intakeMonth, c.benefitStartMonth].some(month => month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))) return 'Revisa los meses de incorporación y descuento.';
    if (c.durationType === 'until' && (!/^\d{4}-\d{2}-\d{2}$/.test(c.benefitUntil) || !Number.isFinite(Date.parse(`${c.benefitUntil}T12:00:00Z`)) || new Date(`${c.benefitUntil}T12:00:00Z`).toISOString().slice(0, 10) !== c.benefitUntil)) return 'Indica hasta qué fecha se aplica el descuento.';
    return '';
  }
  function publicCampaigns(values) {
    return (Array.isArray(values) ? values : []).map(normalize).filter(c => c.status === 'enabled' && !error(c));
  }
  function state(value, now = Date.now()) {
    const c = normalize(value);
    if (c.status === 'paused') return 'Pausada';
    if (c.status !== 'enabled') return 'Borrador';
    if (error(c)) return 'Incompleta';
    if (now < c.startsAt) return 'Programada';
    if (now > c.endsAt) return 'Finalizada';
    return 'Activa';
  }
  function active(values, now = Date.now()) {
    return publicCampaigns(values).filter(c => now >= c.startsAt && now <= c.endsAt)
      .sort((a, b) => b.priority - a.priority || b.startsAt - a.startsAt || a.id.localeCompare(b.id))[0] || null;
  }
  function matches(c, turn, instrument = turn.instrumento, mode = 'group') {
    return !!turn && (!c.centers.length || c.centers.includes(turn.escuela))
      && (!c.instruments.length || c.instruments.includes(instrument))
      && (!c.capacities.length || c.capacities.includes(String(turn.maxCap)))
      && (!c.days.length || c.days.includes(String(turn.dayNum)))
      && (!c.selectionIds.length || c.selectionIds.includes(turn.selectionId))
      && !c.excludedSelectionIds.includes(turn.selectionId)
      && (!c.modes.length || c.modes.includes(Number(turn.maxCap) === 1 ? 'private' : mode))
      && !(c.intakeMonth && turn.inicio && String(turn.inicio).slice(0, 7) > c.intakeMonth);
  }
  function monthlyCents(value) {
    if (typeof value !== 'string') return null;
    const match = value.trim().match(/^(\d{1,5})(?:[.,](\d{1,2}))?\s*(?:€|euros?)\s*\/\s*mes$/i);
    if (!match) return null;
    const cents = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
    return cents > 0 ? cents : null;
  }
  function duration(value) {
    const c = normalize(value);
    if (c.benefitStartMonth && c.durationType === 'months') return c.durationMonths === 1
      ? `en ${monthLabel(c.benefitStartMonth)}` : `durante ${c.durationMonths} mensualidades desde ${monthLabel(c.benefitStartMonth)}`;
    if (c.durationType === 'months') return `durante ${c.durationMonths === 1 ? 'la primera mensualidad' : `las ${c.durationMonths} primeras mensualidades`}`;
    if (c.durationType === 'until') return `hasta el ${c.benefitUntil.split('-').reverse().join('/')}`;
    if (c.durationType === 'ongoing') return 'mientras se mantenga la inscripción, según las condiciones';
    return 'en el primer recibo';
  }
  function monthLabel(month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return '';
    return new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T12:00:00Z`));
  }
  function discountLabel(c) { return c.discountType === 'fixed' ? `−${money(Math.round(c.discountValue * 100))}` : `−${c.discountValue} %`; }
  function quote(values, turn, instrument = turn?.instrumento, mode = 'group', now = Date.now(), usePromotion = true) {
    const campaign = active(values, now);
    const baseLabel = text(mode === 'private' && turn?.allowPrivateOpening ? turn.privateOpeningPrice || '120 €/mes' : turn?.precio);
    const baseCents = monthlyCents(baseLabel);
    const eligible = usePromotion === true && !!campaign && matches(campaign, turn, instrument, mode);
    const discountedCents = eligible && baseCents !== null
      ? Math.max(0, campaign.discountType === 'fixed' ? baseCents - Math.round(campaign.discountValue * 100) : Math.round(baseCents * (1 - campaign.discountValue / 100))) : baseCents;
    return { campaign, eligible, baseCents, discountedCents, baseLabel,
      displayLabel: eligible && discountedCents !== null ? `${money(discountedCents)}/mes` : baseLabel,
      durationLabel: eligible ? duration(campaign) : '', discountLabel: eligible ? discountLabel(campaign) : '',
      destination: (eligible ? campaign.commonUrl : '') || (mode === 'private' && turn?.allowPrivateOpening ? turn.privateOpeningUrl : turn?.url) || '' };
  }
  function summary(turn, instrument, mode, offer) {
    if (!turn) return '';
    const c = offer.campaign;
    const lines = [
      `${turn.escuela} | Instrumento: ${instrument}`,
      `Turno: ${turn.horario} | ${turn.maxCap} personas`,
      `Modalidad: ${mode === 'private' && turn.allowPrivateOpening ? 'Particular provisional' : Number(turn.maxCap) === 1 ? 'Particular' : turn.allowPrivateOpening ? 'Esperar apertura de grupo' : 'Grupo'}`,
      `Inicio: ${offer.eligible && c.intakeMonth ? monthLabel(c.intakeMonth) : turn.inicio ? turn.inicio.split('-').reverse().join('/') : 'A confirmar'}`,
      `Cuota habitual: ${offer.baseLabel || 'A confirmar'}`
    ];
    if (offer.eligible) {
      lines.push(`Promoción: ${c.name} (${offer.discountLabel})`, `Cuota promocional: ${offer.displayLabel} ${offer.durationLabel}`,
        `Inscribirse hasta: ${madridInput(c.endsAt).replace('T', ' ')} (España)`);
      if (c.durationType !== 'ongoing') lines.push(`Después del descuento: ${offer.baseLabel}`);
      if (c.summaryTerms) lines.push(`Condiciones: ${c.summaryTerms}`);
      else {
        if (c.billingText) lines.push(`Cobros: ${c.billingText}`);
        if (c.commitmentText) lines.push(`Permanencia: ${c.commitmentText}`);
      }
    } else lines.push('Sin promoción.');
    if (mode === 'private' && turn.allowPrivateOpening) lines.push(`Al abrir el grupo, cuota habitual: ${turn.precio || 'A confirmar'}.`);
    lines.push(`Ref. turno: ${turn.selectionId}`, 'Plaza pendiente de confirmación. Sin cobro al inscribirse.');
    const result = lines.map(line => String(line).replace(/\s+/g, ' ').trim()).join('\n');
    // Incluye el coste de convertir LF a CRLF al copiar en Windows. Nunca corta
    // importes o condiciones para encajar: se debe corregir el resumen en Admin.
    return summaryLength(result) <= 1000 ? result : '';
  }
  function summaryLength(value) { return String(value).replace(/\r\n/g, '\n').replace(/\n/g, '\r\n').length; }
  return { normalize, error, publicCampaigns, state, active, matches, monthlyCents, money, duration, monthLabel, discountLabel, quote, summary, summaryLength, madridInput, madridMillis };
}

export const enrollmentPromotions = createEnrollmentPromotions();

export const blackFriday2026Draft = () => enrollmentPromotions.normalize({
  id: 'black-friday-2026', name: 'Black Friday Los Mitos', status: 'draft',
  subtitle: '50 % de descuento en enero de 2027',
  conditions: 'Oferta para nuevas inscripciones en clases de grupo de Tarragona y Reus, del 23 al 29 de noviembre de 2026, ambos incluidos. Enero de 2027 tiene un 50 % de descuento y se cobrará durante los primeros días de diciembre de 2026, tras contactar y confirmar la plaza. Febrero y marzo se cobrarán a tarifa habitual. Permanencia durante enero, febrero y marzo de 2027. Clases particulares y apertura particular provisional excluidas.',
  commonUrl: 'https://qow.es/MBTHVp', startsAt: enrollmentPromotions.madridMillis('2026-11-23T00:00'), endsAt: enrollmentPromotions.madridMillis('2026-11-29T23:59', true),
  discountType: 'percent', discountValue: 50, durationType: 'months', durationMonths: 1, benefitStartMonth: '2027-01', intakeMonth: '2027-01',
  billingText: 'Enero de 2027 se cobrará al 50 % durante los primeros días de diciembre de 2026, después de contactar y confirmar la plaza. Febrero y marzo se cobrarán a tarifa habitual. No se realiza ningún cobro al completar este formulario.',
  commitmentText: 'Permanencia durante enero, febrero y marzo de 2027.', modes: ['group'],
  summaryTerms: 'Enero de 2027 al 50 %, cobrado a primeros de diciembre de 2026 tras confirmar la plaza. Febrero y marzo a tarifa habitual. Permanencia durante enero, febrero y marzo de 2027.'
});
