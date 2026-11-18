// Utilidades de fechas en formato ISO local 'YYYY-MM-DD' (sin zonas horarias, evita corrimientos UTC).

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DAY_LABELS = { mon: 'Lunes', tue: 'Martes', wed: 'Miércoles', thu: 'Jueves', fri: 'Viernes', sat: 'Sábado', sun: 'Domingo' };
export const DAY_SHORT = { mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue', fri: 'Vie', sat: 'Sáb', sun: 'Dom' };

const pad = (n) => String(n).padStart(2, '0');

export function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0); // mediodía: inmune a cambios de horario
}

export function todayISO() {
  return toISO(new Date());
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Clave de día (mon..sun) de una fecha ISO. */
export function dayKeyOf(iso) {
  const js = parseISO(iso).getDay(); // 0 = domingo
  return DAY_KEYS[(js + 6) % 7];
}

/** Lunes de la semana que contiene la fecha. */
export function startOfWeek(iso) {
  const idx = DAY_KEYS.indexOf(dayKeyOf(iso));
  return addDays(iso, -idx);
}

/** Las 7 fechas (lun→dom) de la semana que arranca en weekStart. */
export function weekDates(weekStart) {
  return DAY_KEYS.map((k, i) => ({ key: k, date: addDays(weekStart, i) }));
}

export function diffDays(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}

export function isWeekend(iso) {
  const k = dayKeyOf(iso);
  return k === 'sat' || k === 'sun';
}

export function formatDate(iso, opts = { day: 'numeric', month: 'short' }) {
  if (!iso) return '';
  return parseISO(iso).toLocaleDateString('es-AR', opts);
}

export function formatLong(iso) {
  return formatDate(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** Timestamp de Firestore | Date | number → texto relativo. */
export function timeAgo(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return 'recién';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 7) return `hace ${Math.floor(s / 86400)} d`;
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

/** Antigüedad entre hireDate y hoy → { years, months, label }. */
export function seniority(hireDate, ref = todayISO()) {
  if (!hireDate) return { years: 0, months: 0, label: 'Sin fecha de ingreso' };
  const a = parseISO(hireDate);
  const b = parseISO(ref);
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  if (months < 0) months = 0;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [];
  if (years) parts.push(`${years} ${years === 1 ? 'año' : 'años'}`);
  if (rest || !years) parts.push(`${rest} ${rest === 1 ? 'mes' : 'meses'}`);
  return { years, months: rest, label: parts.join(' y ') };
}
