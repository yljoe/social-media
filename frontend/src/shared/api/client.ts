import type { ApiResponse } from "../types/api";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";

export async function api<T>(path: string, init?: RequestInit, fallbackMessage = "API request failed"): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });
  const json = (await response.json()) as ApiResponse<T>;
  if (!response.ok) {
    throw new Error(json.message || fallbackMessage);
  }
  return json.data;
}
