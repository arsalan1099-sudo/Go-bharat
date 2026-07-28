import { fetch } from "expo/fetch";
import { getApiUrl } from "@/lib/query-client";

export async function moderateImage(imageBase64: string): Promise<{ safe: boolean; reason?: string }> {
  try {
    const baseUrl = getApiUrl();
    const url = new URL("/api/ai/moderate-image", baseUrl);

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64 }),
    });

    const data = await response.json();
    return { safe: data.safe !== false, reason: data.reason };
  } catch {
    return { safe: true };
  }
}
