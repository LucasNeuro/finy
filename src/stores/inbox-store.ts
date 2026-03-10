import { create } from "zustand";

type InboxState = {
  /** Última conversa selecionada (para navegação rápida ou pré-seleção) */
  selectedConversationId: string | null;
  setSelectedConversationId: (id: string | null) => void;
  /** Modo foco: sidebar recolhida, abas com até 5 conversas "Meus" */
  focusMode: boolean;
  setFocusMode: (v: boolean) => void;
};

export const useInboxStore = create<InboxState>((set) => ({
  selectedConversationId: null,
  setSelectedConversationId: (id) => set({ selectedConversationId: id }),
  focusMode: false,
  setFocusMode: (v) => set({ focusMode: v }),
}));
