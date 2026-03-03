/**
 * Regras de horário por caixa: business_hours (semanal) + special_dates (datas específicas).
 * Usado na distribuição (webhook) para só atribuir conversa a caixa que está em horário de atendimento.
 */

export type BusinessHoursItem = { day: number; open: string; close: string };
export type SpecialDateItem =
  | { date: string; closed: true }
  | { date: string; open: string; close: string };

export type QueueSchedule = {
  business_hours?: BusinessHoursItem[];
  special_dates?: SpecialDateItem[];
};

/**
 * Verifica se a caixa está em horário de atendimento no momento dado.
 * - special_dates: sobrescreve na data exata (closed = fechado; open/close = janela naquele dia).
 * - business_hours: dia da semana (0=Dom) + open/close. Vazio = 24/7.
 * - Se não houver special_dates para a data e business_hours vazio → aberto 24/7.
 */
export function isQueueOpen(
  queue: QueueSchedule,
  at: Date = new Date()
): boolean {
  const dateStr = at.toISOString().slice(0, 10);
  const day = at.getDay();
  const time = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;

  const special = (queue.special_dates ?? []).find(
    (s) => s.date === dateStr
  ) as SpecialDateItem | undefined;
  if (special) {
    if ("closed" in special && special.closed) return false;
    if ("open" in special && "close" in special)
      return time >= special.open && time <= special.close;
  }

  const hours = (queue.business_hours ?? []) as BusinessHoursItem[];
  if (hours.length === 0) return true;

  const today = hours.find((h) => h.day === day);
  if (!today) return false;
  return time >= today.open && time <= today.close;
}
