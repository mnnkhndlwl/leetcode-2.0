import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { mmkvStorage } from "../utils/mmkvStorage";

const useUserStore = create(
  persist(
    (set) => ({
      user: null,
      token: null,

      // Called after login / signup
      setAuth: (user, token) => set({ user, token }),

      // Called on logout — persist middleware will sync the cleared
      // state back to MMKV automatically
      logout: () => set({ user: null, token: null }),
    }),
    {
      name: "user-store",
      storage: createJSONStorage(() => mmkvStorage),
      // Only persist what we actually need
      partialize: (state) => ({ user: state.user, token: state.token }),
    }
  )
);

export default useUserStore;
