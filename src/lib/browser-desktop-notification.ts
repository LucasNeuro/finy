/**
 * Notificações nativas do sistema (Windows / macOS / Linux) via Web Notification API.
 * Ativas automaticamente quando o navegador concede permissão (pedido no primeiro clique na área da empresa).
 * Com o navegador totalmente fechado seria necessário Push + Service Worker.
 */

/** Permissão concedida → mostramos aviso de mensagem nova (para chats que não estão abertos na URL). */
export function getDesktopNotifyEnabled(): boolean {
  if (typeof window === "undefined" || typeof Notification === "undefined") return false;
  return Notification.permission === "granted";
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

/**
 * Aviso ao receber mensagem noutra conversa (não a aberta no URL).
 * Mostra mesmo com o ClicVend em foco — o utilizador pediu alerta a cada mensagem relevante.
 */
export function showIncomingChatDesktopNotification(opts: {
  slug: string;
  conversationId: string;
  title: string;
  body?: string;
}): void {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;

  const { slug, conversationId, title, body } = opts;
  const safeTitle = title.trim() || "ClicVend";
  const safeBody = (body ?? "Nova mensagem — clique para abrir o chat.").slice(0, 240);
  const url = `${window.location.origin}/${slug}/conversas/${conversationId}`;

  try {
    const n = new Notification(safeTitle, {
      body: safeBody,
      tag: `clicvend-chat-${conversationId}`,
      icon: "/logo-icon.svg",
    });
    n.onclick = () => {
      try {
        window.focus();
        window.location.assign(url);
      } finally {
        n.close();
      }
    };
  } catch {
    /* Safari / políticas restritas */
  }
}
