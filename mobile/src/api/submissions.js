import api from "./axiosInstance";

// RFC4122-ish v4 id. Good enough for idempotency keys (per-user scoped,
// short-lived) and avoids pulling in a native crypto dependency.
export function newIdempotencyKey() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function submitCode({ problemId, language, code, idempotencyKey, contestId }) {
  const res = await api.post(
    "/submissions",
    contestId ? { problemId, language, code, contestId } : { problemId, language, code },
    idempotencyKey
      ? { headers: { "Idempotency-Key": idempotencyKey } }
      : undefined,
  );
  // created=true  -> 201, brand-new submission
  // created=false -> 200, idempotent replay of an existing submission
  return { ...res.data, created: res.status === 201 };
}

export async function getSubmission(id) {
  const { data } = await api.get(`/submissions/${id}`);
  return data;
}
