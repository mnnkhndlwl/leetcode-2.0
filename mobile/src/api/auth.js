import api from "./axiosInstance";

export async function signup(username, email, password) {
  const { data } = await api.post("/auth/signup", { username, email, password });
  return data; // { token, user }
}

export async function login(email, password) {
  const { data } = await api.post("/auth/login", { email, password });
  return data; // { token, user }
}
