# TVL Redes · Proceso automático

Corre gratis en GitHub Actions cada 5 minutos para la app **TVL Redes** (https://tvl-redes.web.app):

- **Recordatorios**: eventos (el día anterior y 2 h antes), reemplazos que empiezan, cierre del período de horas extras (14 y 15 de cada mes) y cumpleaños (una semana antes y el mismo día).
- **Notificaciones push** al celular/computadora de cada integrante que las activó.
- **Calendario personal** (.ics) de cada integrante, publicado en un Gist secreto y actualizado cada hora.

No contiene datos del equipo ni claves: todo se lee de Firebase con los secretos del repositorio
(`FIREBASE_SERVICE_ACCOUNT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `GIST_TOKEN`). Los registros solo muestran cantidades.
