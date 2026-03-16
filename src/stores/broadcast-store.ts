import { create } from "zustand";

type BroadcastState = {
  /** IDs dos itens da fila de envio selecionados para broadcast */
  selectedQueueItemIds: Set<string>;
  setSelectedQueueItemIds: (ids: Set<string>) => void;
  toggleQueueItem: (id: string) => void;
  selectAllQueueItems: (ids: string[]) => void;
  clearSelection: () => void;
};

export const useBroadcastStore = create<BroadcastState>((set) => ({
  selectedQueueItemIds: new Set(),
  setSelectedQueueItemIds: (ids) => set({ selectedQueueItemIds: ids }),
  toggleQueueItem: (id) =>
    set((s) => {
      const next = new Set(s.selectedQueueItemIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedQueueItemIds: next };
    }),
  selectAllQueueItems: (ids) =>
    set((s) => {
      const allSelected = ids.length > 0 && ids.every((id) => s.selectedQueueItemIds.has(id));
      return {
        selectedQueueItemIds: allSelected ? new Set() : new Set(ids),
      };
    }),
  clearSelection: () => set({ selectedQueueItemIds: new Set() }),
}));
