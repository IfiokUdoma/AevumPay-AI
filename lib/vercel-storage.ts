import { get, put } from "@vercel/blob";

// The evidence route verifies the content hash before storing the bytes.
export const bucket = {
  async get(key: string) {
    const result = await get(key, { access: "private" });
    return result?.statusCode === 200 ? { body: result.stream } : null;
  },
  async put(key: string, bytes: ArrayBuffer) {
    await put(key, bytes, {
      access: "private",
      contentType: "application/octet-stream",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  },
};
