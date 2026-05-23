import { MMKV } from "react-native-mmkv";

// Single shared MMKV instance for the whole app
export const mmkv = new MMKV({ id: "app-storage" });

// Zustand-persist-compatible storage adapter.
// MMKV is fully synchronous — no Promises needed.
export const mmkvStorage = {
  setItem: (key, value) => mmkv.set(key, value),
  getItem: (key) => mmkv.getString(key) ?? null,
  removeItem: (key) => mmkv.delete(key),
};
