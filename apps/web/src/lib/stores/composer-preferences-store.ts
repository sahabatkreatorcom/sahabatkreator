import { create } from "zustand";

interface ComposerPreferencesState {
    lastSelectedAccountIds: string[];
    setLastSelectedAccountIds: (ids: string[]) => void;
}

export const useComposerPreferencesStore = create<ComposerPreferencesState>((set) => ({
    lastSelectedAccountIds: [],
    setLastSelectedAccountIds: (ids) => set({ lastSelectedAccountIds: ids }),
}));
