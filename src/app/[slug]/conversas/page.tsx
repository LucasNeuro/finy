"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ConversasEmptyPage() {
  const pathname = usePathname();
  const slug = pathname?.split("/").filter(Boolean)[0] ?? "";
  const base = slug ? `/${slug}` : "";
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-[#F1F5F9] px-4 text-center">
      <p className="text-lg font-medium text-[#1E293B]">Chat de atendimento</p>
      <p className="mt-2 text-[#64748B]">
        Selecione uma conversa na lista à esquerda para abrir o chat e responder.
      </p>
      <p className="mt-4 text-sm text-[#64748B]">
        Novas mensagens entram aqui quando o número está conectado em <Link href={`${base}/conexoes`} className="text-clicvend-orange hover:underline font-medium">Conexões</Link> — cada mensagem nova cria a conversa em <strong>Novos</strong> e o contato. Para trazer histórico antigo ou lista completa de contatos, use o botão <strong>Sincronizar</strong> em <Link href={`${base}/contatos`} className="text-clicvend-orange hover:underline">Contatos</Link> ou em <Link href={`${base}/conexoes`} className="text-clicvend-orange hover:underline">Conexões</Link>. Se você tem contatos mas não vê conversas, use a aba <strong>Filas</strong> na lista ao lado ou confira as <Link href={`${base}/filas`} className="text-clicvend-orange hover:underline">Atribuições</Link> da fila.
      </p>
    </div>
  );
}
