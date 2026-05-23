import axios from "axios";
import { Platform } from "react-native";
import useUserStore from "../store/useUserStore";

const BASE_URL =
  Platform.OS === "android" ? "http://10.0.2.2:3000" : "http://localhost:3000";

const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 10000,
});

// MMKV is synchronous, so we read the token straight from the store
// with getState() — no async/await needed here.
api.interceptors.request.use((config) => {
  const { token } = useUserStore.getState();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401 — log the user out (clears store + MMKV via persist)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useUserStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

export default api;
