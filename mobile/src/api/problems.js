import api from "./axiosInstance";

export async function getProblems() {
  const { data } = await api.get("/problems");
  return data; // [{ id, title, difficulty, slug, totalSubmissions, totalAccepted }]
}

export async function getProblem(slug) {
  const { data } = await api.get(`/problems/${slug}`);
  return data;
}

export async function searchProblems(q, limit = 50) {
  const trimmed = typeof q === "string" ? q.trim() : "";
  if (!trimmed) {
    return getProblems();
  }
  const { data } = await api.get("/problems", {
    params: { q: trimmed, limit },
  });
  return data;
}
