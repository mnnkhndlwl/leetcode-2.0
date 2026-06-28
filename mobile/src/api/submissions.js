import api from "./axiosInstance";

export async function submitCode({ problemId, language, code }) {
  const { data } = await api.post("/submissions", { problemId, language, code });
  return data; // { submissionId, status: "PENDING" }
}

export async function getSubmission(id) {
  const { data } = await api.get(`/submissions/${id}`);
  return data;
}
