import { supabase } from "./auth/supabase";

const BASE = (import.meta.env.VITE_API_BASE as string) || "http://127.0.0.1:5000";

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Pull the friendly `{ "error": "..." }` message out of a failed response,
// falling back to the raw body. Used by the raw-fetch (multipart) helpers.
async function errorText(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (json && typeof json.error === "string") return json.error;
  } catch {
    /* not JSON — use the raw text */
  }
  return text;
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
  room?: string;
  before_url?: string;
  after_url?: string;
};

export type FlaggedIssue = { issue_type: string; message: string };
export type Deadline = { task: string; date: string };

// Output of the rich pdf_and_summary pipeline (text extraction → spaCy NLP →
// structured Gemini summary), merged under `analysis` on relevant documents.
export type RichAnalysis = {
  plain_language_summary?: string | null;
  flagged_issues?: FlaggedIssue[];
  deadlines?: Deadline[];
  coverage_limits?: string[];
  required_actions?: string[];
  warnings?: string[];
  summary_provider?: string | null;
  nlp?: {
    dates?: string[];
    money?: string[];
    organizations?: string[];
    provider?: string | null;
  };
};

export type GeminiAnalysis = {
  doc_type?: string;
  title?: string | null;
  summary?: string;
  key_fields?: Record<string, unknown> | { label: string; value: string }[];
  analysis?: RichAnalysis | null;
  [key: string]: unknown;
};

export type Alert = {
  id: string;
  title: string;
  message: string;
  send_notification?: boolean;
  severity?: string;
  regions?: string[];
  published_at?: string | null;
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
  detected_phase?: "before" | "after" | null;
};

// Flat shape returned by the new Flask blueprint —
// see backend/app/blueprints/recommendations.py: Recommendation.to_dict().
export type RecStatus = "suggested" | "saved" | "dismissed" | "done";

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
  status?: RecStatus;
  rec_id?: string | null;
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
  empty_categories?: string[];
};

export type Terms = {
  version: string;
  privacy_url?: string;
  terms_url?: string;
  encryption_notice?: string;
};

export type Profile = {
  id?: string;
  full_name?: string | null;
  location?: string | null;
  region?: string | null;
  language?: string | null;
};

export type ReadinessCheck = { key: string; done: boolean };
export type Readiness = {
  percent: number;
  completed: number;
  total: number;
  checks: ReadinessCheck[];
};

export type MeResponse = { profile: Profile; readiness: Readiness };

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
  updateItem: (caseId: string, itemId: string, body: Partial<Item>) =>
    request<{ item: Item }>(`/cases/${caseId}/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  createItemsBulk: (caseId: string, items: Partial<Item>[]) =>
    request<{ items: Item[] }>(`/cases/${caseId}/items/bulk`, {
      method: "POST",
      body: JSON.stringify({ items }),
    }),
  deleteItem: (caseId: string, itemId: string) =>
    request<{ ok: true }>(`/cases/${caseId}/items/${itemId}`, { method: "DELETE" }),
  getRecommendations: (caseId: string, _topK = 5) =>
    request<RecommendResponse>(
      `/cases/${caseId}/recommendations`,
      { method: "POST", body: JSON.stringify({}) },
    ),
  updateRecommendation: (recId: string, status: RecStatus) =>
    request<{ recommendation: { id: string; status: RecStatus } }>(
      `/recommendations/${recId}`,
      { method: "PATCH", body: JSON.stringify({ status }) },
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
    if (!res.ok) throw new Error(await errorText(res));
    return res.json();
  },

  analyzeRoomPhoto: async (file: File, prePost: "pre" | "post" | "auto" = "auto"): Promise<RoomScan> => {
    const fd = new FormData();
    fd.append("image", file);
    fd.append("pre_post", prePost);
    const res = await fetch(`${BASE}/ml/analyze-photo`, {
      method: "POST",
      headers: await authHeaders(),
      body: fd,
    });
    if (!res.ok) throw new Error(await errorText(res));
    return res.json();
  },

  // Upload an item photo to storage; returns the public URL to store in
  // one of the item's image columns (before_url / after_url).
  uploadItemImage: async (file: File): Promise<{ url: string }> => {
    const fd = new FormData();
    fd.append("image", file);
    const res = await fetch(`${BASE}/items/upload-image`, {
      method: "POST",
      headers: await authHeaders(),
      body: fd,
    });
    if (!res.ok) throw new Error(await errorText(res));
    return res.json();
  },

  // /items — user-wide library, independent of any case
  listMyItems: () => request<{ items: Item[] }>("/items"),
  createLibraryItem: (body: Partial<Item>) =>
    request<{ item: Item }>("/items", { method: "POST", body: JSON.stringify(body) }),
  attachItemToCase: (itemId: string, caseId: string) =>
    request<{ item: Item }>(`/items/${itemId}/attach/${caseId}`, { method: "POST" }),
  detachItem: (itemId: string) =>
    request<{ item: Item }>(`/items/${itemId}/detach`, { method: "POST" }),

  // /me — profile + readiness score
  getMe: () => request<MeResponse>("/me"),
  updateMe: (patch: Partial<Profile>) =>
    request<MeResponse>("/me", { method: "PATCH", body: JSON.stringify(patch) }),

  getTerms: () => request<Terms>("/terms"),
  getTermsStatus: () => request<TermsStatus>("/terms/status"),
  acceptTerms: (version: string) =>
    request<{ ok: true }>("/terms/accept", {
      method: "POST",
      body: JSON.stringify({ version }),
    }),
  listAlerts: () => request<{ alerts: Alert[] }>("/alerts"),
};
