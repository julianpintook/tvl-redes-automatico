// Motor de turnos: resuelve el turno efectivo (con horario de entrada/salida y coberturas) para cualquier fecha.
import { addDays, dayKeyOf, diffDays, startOfWeek } from './dates.js';

export const SHIFTS = {
  morning: { label: 'Mañana', short: 'M', cls: 'bg-green-100 text-green-800 dark:bg-green-400/15 dark:text-green-300' },
  midday: { label: 'Mediodía', short: 'MD', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300' },
  afternoon: { label: 'Tarde', short: 'T', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-400/15 dark:text-sky-300' },
  off: { label: 'Franco', short: 'F', cls: 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400' },
  dayoff: { label: 'Día pedido', short: 'DP', cls: 'bg-teal-100 text-teal-800 dark:bg-teal-400/15 dark:text-teal-300' },
  vacation: { label: 'Vacaciones', short: 'V', cls: 'bg-violet-100 text-violet-800 dark:bg-violet-400/15 dark:text-violet-300' },
  // Cubriendo otro sector de la empresa (lo marca el jefe; se le asigna reemplazo como en vacaciones).
  external_tv: { label: 'En TV', short: 'TV', cls: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-400/15 dark:text-indigo-300' },
  external_radio: { label: 'En Radio', short: 'RAD', cls: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-400/15 dark:text-indigo-300' },
  external_redaccion: { label: 'En Redacción', short: 'RED', cls: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-400/15 dark:text-indigo-300' },
  holiday_off: { label: 'Feriado', short: 'FER', cls: 'bg-rose-50 text-rose-500 dark:bg-rose-400/10 dark:text-rose-300' },
  reinforcement_morning: { label: 'Refuerzo', short: 'R', cls: 'bg-orange-100 text-orange-800 dark:bg-orange-400/15 dark:text-orange-300' },
  reinforcement_midday: { label: 'Refuerzo Mediodía', short: 'RMD', cls: 'bg-orange-100 text-orange-800 dark:bg-orange-400/15 dark:text-orange-300' },
  none: { label: 'Sin asignar', short: '—', cls: 'bg-transparent text-slate-400 border border-dashed border-slate-200 dark:border-white/10' },
};

/** Turnos que el admin puede asignar manualmente. */
export const EDITABLE_SHIFTS = ['morning', 'midday', 'afternoon', 'off'];
/** Turnos que se consideran "trabajando" (tienen horario). */
export const WORKING = new Set(['morning', 'midday', 'afternoon', 'reinforcement_morning', 'reinforcement_midday']);

/** Horarios por defecto (el admin los puede cambiar en "Horarios por defecto"). */
export const DEFAULT_TIMES = {
  morning: { start: '06:00', end: '14:00' },
  midday: { start: '10:00', end: '18:00' },
  afternoon: { start: '14:00', end: '22:00' },
  reinforcement_morning: { start: '09:00', end: '15:00' },
  reinforcement_midday: { start: '11:00', end: '17:00' },
};

/** Coberturas adicionales de un día puntual. */
export const COVERAGE_TYPES = {
  extension: { label: 'Extensión de horario', short: 'Extensión', cls: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-400/15 dark:text-fuchsia-300' },
  match: { label: 'Partido', short: 'Partido', cls: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-400/15 dark:text-fuchsia-300' },
  double: { label: 'Doble turno', short: 'Doble', cls: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-400/15 dark:text-indigo-300' },
};

/** Sectores donde alguien del equipo puede estar cubriendo. */
export const EXTERNAL_AREAS = { tv: 'TV', radio: 'Radio', redaccion: 'Redacción' };
/** Asignación a otro sector vigente para una persona en una fecha. */
export const assignmentOn = (assignments, userId, date) => (assignments || []).find((a) => a.userId === userId && a.startDate <= date && a.endDate >= date);

export const shiftLabel = (s) => (SHIFTS[s] || SHIFTS.none).label;
export const scheduleDocId = (userId, weekStart) => `${userId}_${weekStart}`;
export const BASE_WEEK = 'base';

/** '06:00','14:00' → '06:00 a 14:00' */
export const formatRange = (start, end) => (start && end ? `${start} a ${end}` : '');

/** Inversión mañana ↔ tarde. */
export const flipShift = (s) => (s === 'morning' ? 'afternoon' : s === 'afternoon' ? 'morning' : s);

/**
 * Turno de domingo según weekend_config.
 * - fixed: siempre sundayBaseShift.
 * - rotating: rotación cruzada. El domingo de la semana de anchorWeekDate trabaja sundayBaseShift;
 *   cada semana siguiente (o anterior) alterna Mañana ↔ Tarde.
 */
export function sundayShiftFor(cfg, sundayISO) {
  if (!cfg) return 'off';
  const base = cfg.sundayBaseShift || 'none';
  if (base === 'none') return 'off';
  if (cfg.sundayMode !== 'rotating' || !cfg.anchorWeekDate) return base;
  const anchorSunday = addDays(startOfWeek(cfg.anchorWeekDate), 6);
  const weeks = Math.round(diffDays(anchorSunday, sundayISO) / 7);
  return Math.abs(weeks) % 2 === 0 ? base : flipShift(base);
}

/** Turno de sábado: siempre fijo. */
export function saturdayShiftFor(cfg) {
  if (!cfg || !cfg.saturdayShift || cfg.saturdayShift === 'none') return 'off';
  return cfg.saturdayShift;
}

/** Horario de un turno: el explícito si existe; si no, el por defecto. Francos/vacaciones no tienen horario. */
export function timesFor(shift, explicit, defaults = DEFAULT_TIMES) {
  if (!WORKING.has(shift)) return { start: '', end: '' };
  if (explicit?.start && explicit?.end) return { start: explicit.start, end: explicit.end };
  const d = defaults[shift] || DEFAULT_TIMES[shift] || {};
  return { start: d.start || '', end: d.end || '' };
}

/**
 * Resuelve el turno efectivo.
 * Prioridad: vacaciones aprobadas > cubriendo otro sector > ajuste del día (incluye cambios aprobados) > feriado > fin de semana > grilla habitual.
 * Home office: lo marcado en el ajuste del día manda; si no, el del horario habitual (solo días con turno).
 * @returns {{shift, start, end, note, source, coverage, home}}
 */
export function resolveShift({ userId, date, baseSchedule, weekSchedule, weekendConfig, holiday, vacations = [], assignments = [], defaults = DEFAULT_TIMES }) {
  const key = dayKeyOf(date);
  const onVacation = vacations.some((v) => v.userId === userId && v.status === 'approved' && v.startDate <= date && v.endDate >= date);
  const override = weekSchedule?.days?.[key];
  const baseCell = baseSchedule?.days?.[key];
  const note = override?.note || '';
  const coverage = override?.coverage?.type ? override.coverage : null;
  const homeFor = (shift, source) => {
    if (!WORKING.has(shift)) return false;
    if (typeof override?.home === 'boolean') return override.home;
    return source === 'base' || source === 'override' ? Boolean(baseCell?.home) : false;
  };
  const out = (shift, explicit, source, n = note) => ({ shift, ...timesFor(shift, explicit, defaults), note: n, source, coverage, home: homeFor(shift, source) });

  if (onVacation) return { ...out('vacation', null, 'vacation'), coverage: null, home: false };
  const ext = assignmentOn(assignments, userId, date);
  if (ext && SHIFTS[`external_${ext.area}`]) return { ...out(`external_${ext.area}`, null, 'external', ext.note || ''), coverage: null, home: false };
  if (override?.shift) return out(override.shift, override, 'override');

  if (holiday) {
    let shift = 'holiday_off';
    if (holiday.morningUserId === userId) shift = 'morning';
    else if (holiday.afternoonUserId === userId) shift = 'afternoon';
    else if (holiday.reinforcementEnabled && holiday.reinforcementUserId === userId) {
      shift = holiday.reinforcementSlot === 'midday' ? 'reinforcement_midday' : 'reinforcement_morning';
    }
    return out(shift, null, 'holiday');
  }

  if (key === 'sat') {
    const s = saturdayShiftFor(weekendConfig);
    return out(s, { start: weekendConfig?.saturdayStart, end: weekendConfig?.saturdayEnd }, 'weekend', note || baseCell?.note || '');
  }
  if (key === 'sun') {
    const s = sundayShiftFor(weekendConfig, date);
    return out(s, weekendConfig?.sundayTimes?.[s], 'weekend', note || baseCell?.note || '');
  }

  return out(baseCell?.shift || 'none', baseCell, 'base', note || baseCell?.note || '');
}

/** 'HH:MM' de un Date. */
export const hhmm = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** ¿La franja [start, end) contiene la hora `now` ('HH:MM')? Soporta franjas que cruzan la medianoche. */
export function isActiveAt(start, end, now) {
  if (!start || !end) return false;
  if (start <= end) return now >= start && now < end;
  return now >= start || now < end;
}
