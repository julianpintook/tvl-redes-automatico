# TVL Redes · Proceso automático

Corre gratis en GitHub Actions cada 5 minutos para la app **TVL Redes** (https://tvl-redes.web.app):

- **Recordatorios**: eventos (el día anterior y 2 h antes), reemplazos que empiezan, cierre del período de horas extras (14 y 15 de cada mes) y cumpleaños (una semana antes y el mismo día).
- **Notificaciones push** al celular/computadora de cada integrante que las activó.
- **Calendario personal** (.ics) de cada integrante, publicado en un Gist secreto y actualizado cada hora.

No contiene datos del equipo ni claves: todo se lee de Firebase con los secretos del repositorio
(`FIREBASE_SERVICE_ACCOUNT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `GIST_TOKEN`). Los registros solo muestran cantidades.

## Copia de seguridad y limpieza

- **Copia de seguridad**: los domingos a las 3 (hora de Argentina) se guardan todos los datos en el repositorio
  **privado** `tvl-redes-respaldos` (carpeta `ultimo/`, un archivo por colección). El historial de Git conserva
  las copias de cada semana. Para hacerla en el momento: *Run workflow* → "Hacer la copia de seguridad ahora".
  Para restaurar: `restaurar.mjs` (uso manual, explicado al principio del archivo).
- **Limpieza** (todos los días a las 4): borra avisos de más de 3 meses, mensajes del chat de más de 6 meses,
  alertas de más de 2 meses, correos despachados de más de 1 mes y marcas internas de recordatorios.
  Nunca toca datos de gestión (grilla, eventos, vacaciones, horas extras, comprobantes, etc.).
- **Mantener vivo**: el día 1 de cada mes se actualiza `ultima-actividad.txt` para que GitHub no pause el proceso.
