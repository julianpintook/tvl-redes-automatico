// Proceso automático de TVL Redes (corre en GitHub Actions cada pocos minutos, gratis).
// 1) Recordatorios: eventos, reemplazos, cierre de horas extras y cumpleaños → crea avisos en la app.
// 2) Push: envía al celular/compu los avisos nuevos de la app (Web Push).
// 3) Calendarios: genera el calendario personal (.ics) de cada integrante y lo publica en un Gist secreto.
// Los registros (logs) de este repo son públicos: acá solo se imprimen cantidades, nunca datos personales.
import admin from 'firebase-admin';
import webpush from 'web-push';
import { createHash, randomBytes } from 'node:crypto';
import { addDays, startOfWeek } from './lib/dates.js';
import { BASE_WEEK, DEFAULT_TIMES, SHIFTS, WORKING, resolveShift, scheduleDocId } from './lib/shifts.js';
import { MONTHS, daysUntil, nextBirthday } from './lib/birthdays.js';
import { periodLabel, periodOf, periodRange } from './lib/overtime.js';

const TZ = 'America/Argentina/Buenos_Aires';
const APP_URL = 'https://tvl-redes.web.app';
const env = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Falta el secreto ${k}`);
  return v;
};

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(env('FIREBASE_SERVICE_ACCOUNT'))) });
const db = admin.firestore();
webpush.setVapidDetails(APP_URL, env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
const GIST_TOKEN = process.env.GIST_TOKEN || '';
const FieldValue = admin.firestore.FieldValue;

// ---- Hora de Argentina ----
function nowAR() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute), hhmm: `${parts.hour}:${parts.minute}` };
}
const NOW = nowAR();
const TODAY = NOW.date;
const TOMORROW = addDays(TODAY, 1);
const fmt = (iso, opts = { weekday: 'long', day: 'numeric', month: 'long' }) => new Date(`${iso}T12:00:00-03:00`).toLocaleDateString('es-AR', { timeZone: TZ, ...opts });

const stats = { reminders: 0, pushes: 0, pushFail: 0, subsRemoved: 0, calendars: 0 };

// ---- Datos ----
const snap = async (q) => (await q.get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const users = await snap(db.collection('users'));
const team = users.filter((u) => u.status === 'approved');
const admins = team.filter((u) => u.role === 'admin');
const byUid = Object.fromEntries(users.map((u) => [u.id, u]));
const name = (uid) => byUid[uid]?.displayName || 'un compañero';

/** Crea avisos en la app (una sola vez por clave). Después el paso de push los envía. */
async function remindOnce(key, to, title, body, link) {
  const ref = db.collection('reminders_sent').doc(key);
  if ((await ref.get()).exists) return;
  const targets = [...new Set(to.filter(Boolean))];
  if (!targets.length) return;
  const batch = db.batch();
  targets.forEach((userId) =>
    batch.set(db.collection('notifications').doc(), { userId, type: 'reminder', title, body, link, read: false, emailSent: false, createdAt: FieldValue.serverTimestamp() })
  );
  batch.set(ref, { at: FieldValue.serverTimestamp(), count: targets.length });
  await batch.commit();
  stats.reminders += targets.length;
}

// ---------------- 1) Recordatorios ----------------
async function reminders() {
  // Eventos
  const events = await snap(db.collection('events').where('date', '>=', addDays(TODAY, -1)).where('date', '<=', TOMORROW));
  for (const e of events) {
    const who = e.assigneeIds || [];
    const detail = `${e.start ? `${e.start}${e.end ? ` a ${e.end}` : ''} hs` : 'Horario a confirmar'}${e.location ? ` · ${e.location}` : ''}\nCuentas: ${(e.accounts || []).join(', ')}`;
    if (e.date === TOMORROW && NOW.hour >= 9) await remindOnce(`event_${e.id}_${e.date}_manana`, who, `Mañana: ${e.name}`, detail, '/eventos');
    if (e.date === TODAY) {
      if (e.start) {
        const [h, m] = e.start.split(':').map(Number);
        const minsTo = h * 60 + m - (NOW.hour * 60 + NOW.minute);
        if (minsTo <= 120 && minsTo > -30) await remindOnce(`event_${e.id}_${e.date}_pronto`, who, `Hoy a las ${e.start}: ${e.name}`, detail, '/eventos');
      } else if (NOW.hour >= 8) await remindOnce(`event_${e.id}_${e.date}_hoy`, who, `Hoy: ${e.name}`, detail, '/eventos');
    }
  }

  // Reemplazos que empiezan mañana (o hoy, si no se avisó)
  const reps = await snap(db.collection('replacements').where('startDate', '>=', TODAY).where('startDate', '<=', TOMORROW));
  for (const r of reps) {
    if (NOW.hour < 9) continue;
    const when = r.startDate === TODAY ? 'Hoy' : 'Mañana';
    await remindOnce(
      `rep_${r.id}_inicio`,
      [r.replacementUserId],
      `${when} empezás a reemplazar a ${name(r.absentUserId)}`,
      `Hasta el ${fmt(r.endDate)}.${(r.accounts || []).length ? `\nCuentas: ${r.accounts.join(', ')}` : ''}${r.note ? `\n${r.note}` : ''}`,
      '/vacaciones'
    );
  }

  // Cierre del período de horas extras (el 15 de cada mes)
  const day = Number(TODAY.slice(8));
  if ((day === 14 || day === 15) && NOW.hour >= 10) {
    const period = periodOf(TODAY);
    const r = periodRange(period);
    const label = periodLabel(period);
    const txt = `Período ${label}: del ${fmt(r.start, { day: 'numeric', month: 'numeric' })} al ${fmt(r.end, { day: 'numeric', month: 'numeric' })}. Revisá que tengas todas tus horas extras cargadas.`;
    await remindOnce(`ot_cierre_${period}_${day}`, team.map((u) => u.id), day === 14 ? 'Mañana cierra el período de horas extras' : 'Hoy cierra el período de horas extras', txt, '/horas-extras');
  }

  // Cumpleaños: una semana antes y el mismo día, a quien cubre esas cuentas
  const birthdays = await snap(db.collection('birthdays'));
  for (const b of birthdays) {
    const days = daysUntil(b.day, b.month, TODAY);
    const year = nextBirthday(b.day, b.month, TODAY).slice(0, 4);
    const who = team.filter((u) => (u.assignedChannels || []).some((a) => (b.accounts || []).includes(a))).map((u) => u.id);
    const who2 = `${b.firstName} ${b.lastName}`;
    const where = (b.accounts || []).join(', ');
    if (days === 0 && NOW.hour >= 8) await remindOnce(`bday_${b.id}_${year}_dia`, who, `🎂 Hoy cumple ${who2}`, `Preparar el saludo para ${where}.`, '/cumpleanos');
    if (days === 7 && NOW.hour >= 9) await remindOnce(`bday_${b.id}_${year}_semana`, who, `🎂 En una semana cumple ${who2}`, `${b.day} de ${MONTHS[b.month - 1]} · ${where}.`, '/cumpleanos');
  }
}

// ---------------- 1b) Resumen de la semana (lunes) ----------------
const DAY_SHORT = { mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue', fri: 'Vie', sat: 'Sáb', sun: 'Dom' };
async function loadScheduleData(from, to) {
  const [schedules, weekendCfg, holidays, vacations, events, reps, settings] = await Promise.all([
    snap(db.collection('schedules')),
    snap(db.collection('weekend_config')),
    snap(db.collection('holidays').where('date', '>=', from)),
    snap(db.collection('vacations').where('status', '==', 'approved')),
    snap(db.collection('events').where('date', '>=', addDays(from, -7))),
    snap(db.collection('replacements').where('endDate', '>=', from)),
    db.collection('settings').doc('shifts').get(),
  ]);
  const scheduleById = Object.fromEntries(schedules.map((x) => [x.id, x]));
  const weekendBy = Object.fromEntries(weekendCfg.map((w) => [w.id, w]));
  const holidayBy = Object.fromEntries(holidays.map((h) => [h.date, h]));
  const defaults = { ...DEFAULT_TIMES, ...(settings.exists ? settings.data().times || {} : {}) };
  const shiftOf = (uid, d) =>
    resolveShift({
      userId: uid,
      date: d,
      baseSchedule: scheduleById[scheduleDocId(uid, BASE_WEEK)],
      weekSchedule: scheduleById[scheduleDocId(uid, startOfWeek(d))],
      weekendConfig: weekendBy[uid],
      holiday: holidayBy[d],
      vacations,
      defaults,
    });
  return { vacations, events: events.filter((e) => (e.endDate || e.date) >= from && e.date <= to), reps, holidayBy, shiftOf };
}

async function weeklySummary() {
  const weekStart = startOfWeek(TODAY);
  if (TODAY !== weekStart || NOW.hour < 8) return;
  const weekEnd = addDays(weekStart, 6);
  const data = await loadScheduleData(weekStart, weekEnd);
  for (const u of team) {
    const lines = [];
    let anything = false;
    for (let d = weekStart; d <= weekEnd; d = addDays(d, 1)) {
      const sh = data.shiftOf(u.id, d);
      const label = `${DAY_SHORT[['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(`${d}T12:00:00-03:00`).getUTCDay()]]} ${Number(d.slice(8))}`;
      let txt;
      if (WORKING.has(sh.shift)) txt = `${SHIFTS[sh.shift].label} ${sh.start} a ${sh.end}`;
      else if (sh.shift === 'vacation') txt = 'Vacaciones';
      else if (sh.shift === 'holiday_off') txt = `Feriado${data.holidayBy[d] ? ` (${data.holidayBy[d].name})` : ''}`;
      else if (sh.shift === 'off') txt = 'Franco';
      else txt = 'Sin asignar';
      if (sh.shift !== 'none') anything = true;
      if (sh.coverage?.start) txt += ` + ${sh.coverage.type === 'match' ? 'Partido' : 'Extensión'} ${sh.coverage.start} a ${sh.coverage.end}`;
      lines.push(`${label}: ${txt}`);
    }
    const ev = data.events.filter((e) => (e.assigneeIds || []).includes(u.id));
    ev.forEach((e) => lines.push(`⭐ ${Number(e.date.slice(8))}/${Number(e.date.slice(5, 7))}: ${e.name}${e.start ? ` ${e.start}` : ''}`));
    data.reps
      .filter((r) => r.replacementUserId === u.id && r.startDate <= weekEnd)
      .forEach((r) => lines.push(`Reemplazás a ${name(r.absentUserId)} hasta el ${Number(r.endDate.slice(8))}/${Number(r.endDate.slice(5, 7))}`));
    if (!anything && !ev.length) continue;
    await remindOnce(`semana_${weekStart}_${u.id}`, [u.id], 'Tu semana', lines.join('\n'), '/grilla');
  }
}

// ---------------- 2) Push ----------------
const subsCache = {};
async function subsOf(uid) {
  if (!subsCache[uid]) subsCache[uid] = await snap(db.collection('users').doc(uid).collection('pushSubs'));
  return subsCache[uid];
}
async function pushPending() {
  const since = admin.firestore.Timestamp.fromMillis(Date.now() - 3 * 3600e3);
  const recent = await snap(db.collection('notifications').where('createdAt', '>=', since));
  const pending = recent.filter((n) => !n.pushSent);
  for (const n of pending) {
    const targets = n.userId === 'role:admin' ? admins.map((a) => a.id) : [n.userId];
    for (const uid of targets) {
      for (const s of await subsOf(uid)) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify({ title: n.title, body: n.body, link: n.link || '/', tag: n.id }), { TTL: 12 * 3600 });
          stats.pushes++;
        } catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) {
            await db.collection('users').doc(uid).collection('pushSubs').doc(s.id).delete();
            subsCache[uid] = subsCache[uid].filter((x) => x.id !== s.id);
            await db.collection('users').doc(uid).update({ pushDevices: subsCache[uid].length }).catch(() => {});
            stats.subsRemoved++;
          } else stats.pushFail++;
        }
      }
    }
    await db.collection('notifications').doc(n.id).update({ pushSent: true });
  }
}

// ---------------- 3) Calendarios (.ics) ----------------
const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const utc = (date, hhmm) => {
  // Argentina es UTC-3 todo el año.
  const d = new Date(`${date}T${hhmm}:00-03:00`);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
};
const dayVal = (date) => date.replace(/-/g, '');
function vevent({ uid, summary, description = '', date, start, end, endDate }) {
  const lines = ['BEGIN:VEVENT', `UID:${uid}@tvl-redes`, `DTSTAMP:${utc(TODAY, '00:00')}`, `SUMMARY:${icsEsc(summary)}`];
  if (description) lines.push(`DESCRIPTION:${icsEsc(description)}`);
  if (start) {
    const endDay = end && end <= start ? addDays(date, 1) : date; // cruza la medianoche
    lines.push(`DTSTART:${utc(date, start)}`, `DTEND:${utc(endDay, end || start)}`);
  } else lines.push(`DTSTART;VALUE=DATE:${dayVal(date)}`, `DTEND;VALUE=DATE:${dayVal(addDays(endDate || date, 1))}`);
  lines.push('END:VEVENT');
  return lines.join('\r\n');
}

async function gistApi(method, path, body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${GIST_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'tvl-redes-automatico' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return res.json();
}

async function calendars() {
  if (!GIST_TOKEN) return;
  const from = addDays(TODAY, -14);
  const to = addDays(TODAY, 75);
  const data = await loadScheduleData(from, to);
  const { vacations, events, reps, holidayBy } = data;
  const me = await gistApi('GET', '/user');

  for (const u of team) {
    const ev = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const s = data.shiftOf(u.id, d);
      if (WORKING.has(s.shift) && s.start) ev.push(vevent({ uid: `turno-${u.id}-${d}`, summary: `Turno ${SHIFTS[s.shift].label}`, description: s.note, date: d, start: s.start, end: s.end }));
      if (s.shift === 'holiday_off') ev.push(vevent({ uid: `feriado-${u.id}-${d}`, summary: `Feriado: ${holidayBy[d]?.name || ''}`, date: d }));
      if (s.coverage?.start) ev.push(vevent({ uid: `cobertura-${u.id}-${d}`, summary: s.coverage.type === 'match' ? `Partido${s.coverage.note ? `: ${s.coverage.note}` : ''}` : `Extensión de horario${s.coverage.note ? `: ${s.coverage.note}` : ''}`, date: d, start: s.coverage.start, end: s.coverage.end }));
    }
    vacations
      .filter((v) => v.userId === u.id && v.endDate >= from)
      .forEach((v) => ev.push(vevent({ uid: `vacaciones-${v.id}`, summary: '🌴 Vacaciones', date: v.startDate, endDate: v.endDate })));
    events
      .filter((e) => (e.assigneeIds || []).includes(u.id))
      .forEach((e) =>
        ev.push(vevent({ uid: `evento-${e.id}`, summary: `⭐ ${e.name}`, description: `${(e.accounts || []).join(', ')}${e.location ? `\n${e.location}` : ''}${e.notes ? `\n${e.notes}` : ''}`, date: e.date, start: e.endDate ? '' : e.start, end: e.end, endDate: e.endDate }))
      );
    reps
      .filter((r) => r.replacementUserId === u.id)
      .forEach((r) => ev.push(vevent({ uid: `reemplazo-${r.id}`, summary: `Reemplazo de ${name(r.absentUserId)}`, description: (r.accounts || []).join(', '), date: r.startDate, endDate: r.endDate })));

    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TVL Redes//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:TVL Redes · ${u.firstName || u.displayName}`, 'X-WR-TIMEZONE:America/Argentina/Buenos_Aires', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', ...ev, 'END:VCALENDAR'].join('\r\n');
    const hash = createHash('sha256').update(ics).digest('hex').slice(0, 16);

    const ref = db.collection('users').doc(u.id).collection('private').doc('calendar');
    const cur = (await ref.get()).data();
    if (cur?.hash === hash) continue;
    if (cur?.gistId) {
      await gistApi('PATCH', `/gists/${cur.gistId}`, { files: { [cur.file]: { content: ics } } });
      await ref.update({ hash, updatedAt: FieldValue.serverTimestamp() });
    } else {
      const file = `tvl-redes-${randomBytes(8).toString('hex')}.ics`;
      const g = await gistApi('POST', '/gists', { public: false, description: 'Calendario TVL Redes', files: { [file]: { content: ics } } });
      await ref.set({ gistId: g.id, file, url: `https://gist.githubusercontent.com/${me.login}/${g.id}/raw/${file}`, hash, updatedAt: FieldValue.serverTimestamp() });
    }
    stats.calendars++;
  }
}

/** Mantiene actualizado en cada perfil cuántos dispositivos tienen avisos activados (lo ve el admin). */
async function syncDevices() {
  for (const u of team) {
    const n = (await subsOf(u.id)).length;
    if (u.pushDevices !== n) await db.collection('users').doc(u.id).update({ pushDevices: n });
  }
}

const steps = { reminders, weeklySummary, pushPending, calendars, syncDevices };
let failed = false;
for (const [k, fn] of Object.entries(steps)) {
  // Calendarios: una vez por hora (en la primera pasada de cada hora) o si se fuerza.
  if ((k === 'calendars' || k === 'syncDevices') && NOW.minute >= 10 && !process.env.FORCE_CALENDARS) continue;
  try {
    await fn();
  } catch (e) {
    failed = true;
    console.error(`Error en ${k}: ${e.message}`);
  }
}
console.log(`Hora AR ${TODAY} ${NOW.hhmm} · recordatorios ${stats.reminders} · push ${stats.pushes} (fallidos ${stats.pushFail}, bajas ${stats.subsRemoved}) · calendarios ${stats.calendars}`);
await Promise.all(admin.apps.map((a) => a.delete()));
if (failed) process.exit(1);
