# HANDOFF 15-ago-2026 — está en el repo de MANDI

Este trabajo cubrió **los dos inbox** a la vez. El documento completo vive en:

    wa-inbox-next/docs/HANDOFF-2026-08-15-avisos-y-clientes-invisibles.md

Lo de IND en una línea: último commit desplegado `6d91bb0`, **256 pruebas**,
`main` sincronizado.

Lo que le toca a IND y no a MANDI:

- ⚠️ **El celular de Rodrigo NUNCA se suscribió al push de IND.** Cada inbox tiene
  sus propias claves VAPID: estar suscrito a MANDI no sirve acá. Hay que abrir
  `https://ind-inbox.apps.mandarinaec.com/inbox`, agregarlo a la pantalla de inicio
  (queda un SEGUNDO icono) y tocar 🔕 desde ahí.
- El techo del recordatorio de Telegram es de **2 horas**, no 24 como MANDI:
  con el volumen de IND, 24 h nombraría 81 chats y sería inútil.
- El 9804 vive en **coexistencia** (en el celular). Eso causa ~2,5% de mensajes
  `unsupported` — ocho veces más que el otro número — y no se va a arreglar,
  porque registrarlo en la nube le quitaría el WhatsApp a quien atiende.
- `/api/cron/seguimientos` todavía tiene la autorización permisiva. El cron nuevo
  (`/api/cron/pendientes`) ya está endurecido.
