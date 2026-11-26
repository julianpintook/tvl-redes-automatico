// Tipos de aviso que cada persona puede elegir recibir (o no) en el celular.
// Lo importante llega siempre. La misma lógica la usa el proceso automático (worker/lib/notifPrefs.js).

export const NOTIF_CATEGORIES = [
  { id: 'tareas', label: 'Tareas y comentarios', desc: 'Te asignan una tarea, te mencionan con @ o comentan en una tarea tuya.' },
  { id: 'eventos', label: 'Recordatorios de eventos', desc: 'El día antes y un rato antes de un evento donde estás asignado/a.' },
  { id: 'cumpleanos', label: 'Cumpleaños', desc: 'Cumpleaños de conductores y periodistas de tus cuentas, y de compañeros del equipo.' },
  { id: 'social', label: 'Agradecimientos y saludos', desc: 'Cuando alguien te agradece o te deja un mensajito de cumple.' },
  { id: 'resumen', label: 'Resumen de los lunes', desc: 'Tu semana: turnos, coberturas y eventos.' },
  { id: 'horas', label: 'Cierre de horas extras', desc: 'Los días 14 y 15, para que no te olvides de cargarlas.' },
  { id: 'proyectos', label: 'Proyectos', desc: 'Te suman a un proyecto, cambia su estado o se acercan las fechas de ejecución y publicación de un documento.' },
  { id: 'chat', label: 'Menciones en el chat', desc: 'Cuando alguien te nombra con @ en el chat del equipo.' },
];

export const ALWAYS = [
  'Alertas de último momento',
  'Cambios en tu horario y feriados que trabajás',
  'Vacaciones, reemplazos y cambios de turno',
  'Comunicados y encuestas',
  'Respuestas a tus pedidos (comprobantes, equipos, ideas)',
  'Tus post-its con aviso',
];

/** Categoría de un aviso (o null si llega siempre). */
export function categoryOf(n) {
  if (n?.category) return n.category;
  const t = n?.type || '';
  if (t === 'task_assigned' || t === 'task_comment' || t === 'task_mention') return 'tareas';
  if (t === 'kudo' || t === 'birthday_wish') return 'social';
  if (t === 'chat_mention') return 'chat';
  if (t.startsWith('project_')) return 'proyectos';
  return null;
}

/** ¿La persona quiere recibir este aviso en el celular? (por defecto, sí) */
export const wantsPush = (user, n) => {
  const c = categoryOf(n);
  return !c || user?.notifPrefs?.[c] !== false;
};
