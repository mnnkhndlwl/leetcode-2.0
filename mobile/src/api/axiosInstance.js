import axios from "axios";
import useUserStore from "../store/useUserStore";
import { queryClient } from "./queryClient";
import { API_URL } from "../config";

const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
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
      queryClient.clear(); // drop cached server data for the logged-out user
    }
    return Promise.reject(error);
  }
);

export default api;
