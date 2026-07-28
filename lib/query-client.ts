import { fetch } from "expo/fetch";
import { QueryClient, QueryFunction } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";

const AUTH_TOKEN_KEY = "gobharat_auth_token";

let cachedToken: string | null = null;

export async function setAuthToken(token: string | null): Promise<void> {
  cachedToken = token;
  if (token) {
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

export async function getAuthToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  try {
    cachedToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
  } catch {}
  return cachedToken;
}

export async function clearAuthToken(): Promise<void> {
  cachedToken = null;
  await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
}

export function getApiUrl(): string {
  let host = process.env.EXPO_PUBLIC_DOMAIN;

  if (!host) {
    throw new Error("EXPO_PUBLIC_DOMAIN is not set");
  }

  let url = new URL(`https://${host}`);

  return url.href;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

async function handle401Logout() {
  try {
    await clearAuthToken();
    const { router } = require("expo-router");
    router.replace("/auth");
  } catch {}
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    if (res.status === 401) {
      await handle401Logout();
    }
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);
  const authHeaders = await getAuthHeaders();

  const headers: Record<string, string> = {
    ...authHeaders,
    ...(data ? { "Content-Type": "application/json" } : {}),
  };

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);
    const authHeaders = await getAuthHeaders();

    const res = await fetch(url.toString(), {
      credentials: "include",
      headers: authHeaders,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: 2,
    },
    mutations: {
      retry: false,
    },
  },
});
