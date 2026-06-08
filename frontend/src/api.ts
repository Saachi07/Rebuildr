import { supabase } from "./auth/supabase";

const BASE = (import.meta.env.VITE_API_BASE as string) || "http://127.0.0.1:5000";

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(await authHeaders()),
    ...(init.headers ?? {}),
  };
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export type Case = {
  id: string;
  case_name: string;
  disaster_type: string;
  region?: string | null;
  location?: string | null;
  incident_date?: string | null;
  insurance_provider?: string | null;
  insurance_policy_number?: string | null;
  status?: string | null;
  intake_answers?: Record<string, unknown> | null;
  derived_tags?: string[] | null;
  created_at?: string;
};

export type Item = {
  id: string;
  case_id: string;
  name: string;
  category?: string;
  material?: string;
  damage_type?: string;
  damage_severity?: string;
  estimated_value?: number;
  description?: string;
};

export type Recommendation = {
  resource: {
    id: string;
    title: string;
    description?: string;
    url?: string;
    category?: string;
    type?: string;
  };
  score: number;
  reasons: string[];
  rank: number;
};

export type RecGroups = Record<string, Recommendation[]>;

export const api = {
  listCases: () => request<{ cases: Case[] }>("/cases"),
  getCase: (id: string) => request<{ case: Case }>(`/cases/${id}`),
  createCase: (body: Partial<Case>) =>
    request<{ case: Case }>("/cases", { method: "POST", body: JSON.stringify(body) }),
  listItems: (caseId: string) =>
    request<{ items: Item[] }>(`/cases/${caseId}/items`),
  createItem: (caseId: string, body: Partial<Item>) =>
    request<{ item: Item }>(`/cases/${caseId}/items`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getRecommendations: (caseId: string, topK = 5) =>
    request<{ case_id: string; groups: RecGroups }>(
      `/cases/${caseId}/recommendations?top_k=${topK}`
    ),
};
