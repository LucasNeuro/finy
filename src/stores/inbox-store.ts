import { create } from "zustand";

type InboxState = {
  /** Última conversa selecionada (para navegação rápida ou pré-seleção) */
  selectedConversationId: string | null;
  setSelectedConversationId: (id: string | null) => void;
};

export const useInboxStore = create<InboxState>((set) => ({
  selectedConversationId: null,
  setSelectedConversationId: (id) => set({ selectedConversationId: id }),
}));
