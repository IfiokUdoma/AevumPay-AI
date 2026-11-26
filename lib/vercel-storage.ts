// Server-only adapter for the R2 HTTP API. Object keys are content-addressed.
function requestObject(key: string, method: "GET" | "PUT", body?: ArrayBuffer) {
  const { R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_API_TOKEN } = process.env;
  if (!R2_ACCOUNT_ID || !R2_BUCKET_NAME || !R2_API_TOKEN) {
    throw new Error("Missing R2_ACCOUNT_ID, R2_BUCKET_NAME or R2_API_TOKEN");
  }
  const path = [R2_ACCOUNT_ID, "r2", "buckets", R2_BUCKET_NAME, "objects", key]
    .map(encodeURIComponent).join("/");
  return fetch("https://api.cloudflare.com/client/v4/accounts/" + path, {
    method, body, cache: "no-store",
    headers: { Authorization: "Bearer " + R2_API_TOKEN },
  });
}
export const bucket = {
  async get(key: string) {
    const response = await requestObject(key, "GET");
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("R2 read failed: " + response.status);
    return response;
  },
  async put(key: string, bytes: ArrayBuffer) {
    const response = await requestObject(key, "PUT", bytes);
    if (!response.ok) throw new Error("R2 write failed: " + response.status);
  },
};
