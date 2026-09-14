// Store global command palette (Ctrl+K) — dipakai layout & tombol pemicu
import { create } from "zustand";

type CommandPaletteStore = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

export const useCommandPalette = create<CommandPaletteStore>((set, get) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set({ open: !get().open }),
}));
