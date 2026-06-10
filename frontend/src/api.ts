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

export type GeminiAnalysis = {
  summary?: string;
  key_fields?: Record<string, unknown>;
  [key: string]: unknown;
};

export type UserDocument = {
  id: string;
  name: string;
  doc_type?: string;
  mime_type?: string;
  size_bytes?: number;
  uploaded_at?: string;
  gemini_analysis?: GeminiAnalysis | null;
};

export type ScannedItem = {
  name: string;
  category: string;
  count: number;
  condition: string;
  visible_brand?: string;
  approximate_size: string;
  canadian_retail_estimate_cad: { low: number; high: number };
};

export type RoomScan = {
  room_type: string;
  items: ScannedItem[];
  notes: string;
};

// Flat shape returned by the new Flask blueprint —
// see backend/app/blueprints/recommendations.py: Recommendation.to_dict().
export type Recommendation = {
  id: string;
  type?: string;
  title: string;
  body?: string;
  url?: string;
  phone?: string;
  score: number;
  reasons: string[];
  days_until_deadline?: number | null;
};

export type RecGroups = Record<string, Recommendation[]>;

export type PersonalizeHint = {
  question_id: string;
  estimated_unlock_cad: number;
  would_unlock: string[];
  copy: string;
};

export type RecommendResponse = {
  by_category: RecGroups;
  top_pick: Recommendation | null;
  deadline_radar: Recommendation[];
  personalize_more: PersonalizeHint[];
};

export type Terms = {
  version: string;
  privacy_url?: string;
  terms_url?: string;
  encryption_notice?: string;
};

export type TermsStatus = {
  accepted: boolean;
  version?: string;
};

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
  getRecommendations: (caseId: string, _topK = 5) =>
    request<RecommendResponse>(
      `/cases/${caseId}/recommendations`,
      { method: "POST", body: JSON.stringify({}) },
    ),

  listMyDocuments: () => request<{ documents: UserDocument[] }>("/documents"),
  getDocumentUrl: (id: string) =>
    request<{ url: string; ttl_seconds: number }>(`/documents/${id}/url`),
  analyzeDocument: (id: string) =>
    request<{ document: UserDocument }>(`/documents/${id}/analyze`, { method: "POST" }),
  deleteDocument: (id: string) =>
    request<{ ok: true }>(`/documents/${id}`, { method: "DELETE" }),
  uploadDocument: async (file: File): Promise<{ document: UserDocument }> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${BASE}/documents`, {
      method: "POST",
      headers: await authHeaders(),
      body: fd,
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json();
  },

  analyzeRoomPhoto: async (file: File): Promise<RoomScan> => {
    const fd = new FormData();
    fd.append("image", file);
    const res = await fetch(`${BASE}/ml/analyze-photo`, {
      method: "POST",
      headers: await authHeaders(),
      body: fd,
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json();
  },

  getTerms: () => request<Terms>("/terms"),
  getTermsStatus: () => request<TermsStatus>("/terms/status"),
  acceptTerms: (version: string) =>
    request<{ ok: true }>("/terms/accept", {
      method: "POST",
      body: JSON.stringify({ version }),
    }),
};
