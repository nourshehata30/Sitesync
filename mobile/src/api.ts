import Constants from "expo-constants";
import type { Patch, ServerResponse } from "./sync/core";

const BASE = (Constants.expoConfig?.extra?.apiUrl as string) ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit & { token?: string | null } = {}): Promise<T> {
  const { token, ...rest } = init;
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(rest.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) throw new ApiError(res.status, (await res.text()) || res.statusText);
  return res.json() as Promise<T>;
}

export const auth = (mode: "login" | "register", email: string, password: string) =>
  request<{ access_token: string }>(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify({ email, password }) });

export const sync = (token: string, cursor: number, pending: Record<string, Patch>) =>
  request<ServerResponse>("/api/sync", {
    method: "POST",
    token,
    body: JSON.stringify({ cursor, changes: Object.entries(pending).map(([id, p]) => ({ id, ...p })) }),
  });

interface Ticket {
  blob_name: string;
  upload_url: string;
  headers: Record<string, string>;
}

/** Two-step upload: ask the API for a SAS ticket, then PUT bytes straight to Azure Blob Storage. */
export async function uploadPhoto(token: string, uri: string): Promise<string> {
  const ticket = await request<Ticket>("/api/uploads/ticket", { method: "POST", token });
  const bytes = await (await fetch(uri)).blob();
  // Local-dev fallback endpoint needs the bearer token; Azure SAS URLs must NOT receive one.
  const isLocal = ticket.upload_url.startsWith(BASE);
  const put = await fetch(ticket.upload_url, {
    method: "PUT",
    headers: { ...ticket.headers, ...(isLocal ? { Authorization: `Bearer ${token}` } : {}) },
    body: bytes,
  });
  if (!put.ok) throw new ApiError(put.status, "Photo upload failed");
  return ticket.blob_name;
}

export const photoUrl = (token: string, blobName: string) =>
  request<{ url: string }>(`/api/uploads/read-url?blob_name=${encodeURIComponent(blobName)}`, { token }).then((r) => r.url);
