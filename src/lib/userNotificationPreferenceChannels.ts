/** Preferências pessoais no Perfil (não confundir com os canais de template em Definições → Notificações). */
export const USER_NOTIFICATION_PREF = {
  PUSH: "user_push",
  EMAIL: "user_email",
  EVENT_CALENDAR: "user_event_calendar",
} as const;

export const USER_NOTIFICATION_PREF_CHANNELS = [
  USER_NOTIFICATION_PREF.PUSH,
  USER_NOTIFICATION_PREF.EMAIL,
  USER_NOTIFICATION_PREF.EVENT_CALENDAR,
] as const;
