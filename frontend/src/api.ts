import { supabase } from "./auth/supabase";

const BASE = (import.meta.env.VITE_API_BASE as string) || "http://127.0.0.1:5000";

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export const OFFLINE_MESSAGE =
  "It looks like you're offline. Your information is safe, check your connection and try again.";

// Every error a user sees should be in plain language, never a status code
// or a JSON blob. Server-provided `error` strings are already written for
// humans, so we keep those; everything else gets translated.
function friendlyMessage(status: number, serverText: string): string {
  if (status === 401) {
    return "Your session timed out. Please sign in again, your work is saved.";
  }
  if (status === 403) {
    return "You don't have access to that. Signing out and back in usually fixes this.";
  }
  if (status === 404) return "We couldn't find that. It may have been removed.";
  if (status === 413) return "That file is too large. Try a smaller one.";
  if (status >= 500) {
    return "Something went wrong on our side, not your fault. Please try again in a moment.";
  }
  return serverText || "Something didn't work. Please try again in a moment.";
}

// Pull the friendly `{ "error": "..." }` message out of a failed response,
// falling back to the raw body. Used by the raw-fetch (multipart) helpers.
async function errorText(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (json && typeof json.error === "string") return json.error;
  } catch {
    /* not JSON, use the raw text */
  }
  return text;
}

async function toApiError(res: Response): Promise<ApiError> {
  const serverText = await errorText(res);
  return new ApiError(friendlyMessage(res.status, serverText), res.status);
}

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Transient failures (model overloaded, rate limited, brief network blip)
// resolve themselves within seconds. Retrying quietly spares a stressed user
// from seeing an error they would only respond to by clicking retry anyway.
// GETs always retry; mutating calls only when the caller opts in.
const RETRY_DELAYS_MS = [800, 2000];
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

type RequestOptions = RequestInit & { retryTransient?: boolean };

async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const { retryTransient, ...fetchInit } = init;
  const method = (fetchInit.method ?? "GET").toUpperCase();
  const shouldRetry = retryTransient ?? method === "GET";
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(await authHeaders()),
    ...(fetchInit.headers ?? {}),
  };
  const maxAttempts = shouldRetry ? RETRY_DELAYS_MS.length + 1 : 1;
  let lastError: ApiError | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]);
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, { ...fetchInit, headers });
    } catch {
      lastError = new ApiError(OFFLINE_MESSAGE);
      continue;
    }
    if (!res.ok) {
      const err = await toApiError(res);
      if (RETRYABLE_STATUSES.has(res.status)) {
        lastError = err;
        continue;
      }
      throw err;
    }
    return res.json() as Promise<T>;
  }
  throw lastError ?? new ApiError(OFFLINE_MESSAGE);
}

// Multipart upload with progress reporting. fetch() can't report upload
// progress, so this one path uses XMLHttpRequest.
async function uploadWithProgress<T>(
  path: string,
  form: FormData,
  onProgress?: (percent: number) => void,
): Promise<T> {
  const headers = (await authHeaders()) as Record<string, string>;
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}${path}`);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onerror = () => reject(new ApiError(OFFLINE_MESSAGE));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as T);
        } catch {
          reject(new ApiError(friendlyMessage(500, "")));
        }
        return;
      }
      let serverText = xhr.responseText;
      try {
        const json = JSON.parse(xhr.responseText);
        if (json && typeof json.error === "string") serverText = json.error;
      } catch {
        /* keep raw */
      }
      reject(new ApiError(friendlyMessage(xhr.status, serverText), xhr.status));
    };
    xhr.send(form);
  });
}

// Where the insurance claim stands. Mirrors the validation list in
// backend/app/blueprints/cases.py; the UI renders friendly labels.
export type ClaimStage =
  | "not_started"
  | "reported"
  | "adjuster_assigned"
  | "estimate_received"
  | "settlement_offer"
  | "payout"
  | "closed"
  | "denied";

// A coverage the user declined, added, or is unsure about. Survivors lose
// disputes because there is no record of what was offered and declined at
// signup, so we let them write it down while they still remember.
export type CoverageDecision = {
  coverage: string;
  decision: "declined" | "added" | "unsure";
  noted_on?: string | null;
  note?: string | null;
};

export type Case = {
  id: string;
  case_name: string;
  disaster_type: string;
  region?: string | null;
  location?: string | null;
  incident_date?: string | null;
  status?: string | null;
  claim_stage?: ClaimStage | null;
  checklist_state?: Record<string, boolean> | null;
  coverage_decisions?: CoverageDecision[] | null;
  intake_answers?: Record<string, unknown> | null;
  derived_tags?: string[] | null;
  created_at?: string;
  deleted_at?: string | null;
  closed_at?: string | null;
};

export type CommChannel = "phone" | "email" | "in_person" | "mail" | "other";
export type CommKind = "note" | "call" | "email" | "meeting" | "discrepancy";

// One entry in the claim communications log: who the user talked to, when,
// and what was said. The `discrepancy` kind pairs `insurer_statement` (what
// they were told) with `summary` (what the policy or user says happened).
export type Communication = {
  id: string;
  case_id: string;
  occurred_at: string;
  contact_name?: string | null;
  organization?: string | null;
  channel?: CommChannel | null;
  kind: CommKind;
  summary: string;
  insurer_statement?: string | null;
  follow_up?: string | null;
  created_at?: string;
};

export type AleCategory = "hotel" | "meals" | "transport" | "storage" | "pets" | "other";

// An additional living expense the insurer may reimburse while the user is
// displaced. Keeping receipts organized is what gets ALE paid out fastest.
export type AleExpense = {
  id: string;
  case_id: string;
  category: AleCategory;
  vendor?: string | null;
  amount: number;
  expense_date?: string | null;
  receipt_url?: string | null;
  notes?: string | null;
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

// Every extracted fact carries the exact sentence it came from plus the page
// it appears on, so the UI can show the contract's own words next to our
// plain-language version. `verified` is set server-side by checking the quote
// against the locally extracted text: true = found verbatim, false = not
// found (show as unverified), null = nothing to check against (photo uploads).
export type SourceCited = {
  source_quote?: string | null;
  page_number?: number | null;
  verified?: boolean | null;
};

export type FlaggedIssue = { issue_type: string; message: string } & SourceCited;
export type Deadline = { task: string; date: string } & SourceCited;
export type CoverageLimit = { text: string } & SourceCited;
export type GlossaryTerm = {
  term: string;
  definition: string;
  source_quote?: string | null;
  page_number?: number | null;
};
export type CoverageScopeStatus = "covered" | "not_covered" | "conditional" | "unclear";
export type CoverageScopeEntry = {
  item: string;
  status: CoverageScopeStatus;
  detail?: string | null;
} & SourceCited;
export type Deductible = {
  amount?: string | null;
  type: "fixed" | "percentage" | "unknown";
  detail?: string | null;
} & SourceCited;
export type Verification = {
  checked: boolean;
  total: number;
  verified_count: number;
};

// Output of the rich pdf_and_summary pipeline (text extraction, spaCy NLP,
// then a structured Gemini summary), merged under `analysis` on relevant
// documents. coverage_limits accepts plain strings too because analyses
// stored before the citations change are still in that older shape.
export type RichAnalysis = {
  plain_language_summary?: string | null;
  flagged_issues?: FlaggedIssue[];
  deadlines?: Deadline[];
  coverage_limits?: (string | CoverageLimit)[];
  required_actions?: string[];
  warnings?: string[];
  glossary?: GlossaryTerm[];
  coverage_scope?: CoverageScopeEntry[];
  deductible?: Deductible | null;
  verification?: Verification | null;
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

export type BoundingBox = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

// Whether an item is claimed as personal property (contents) or is part
// of the building (dwelling coverage). Permanent fixtures like wall-to-wall
// carpet, wallpaper, and built-in cabinets are building, not contents.
export type ClaimClass = "contents" | "building" | "unclear";
export type Salvageable = "likely" | "unlikely" | "needs_professional_assessment";

export type ScannedItem = {
  name: string;
  category: string;
  count: number;
  condition: string;
  visible_brand?: string;
  approximate_size: string;
  canadian_retail_estimate_cad: { low: number; high: number };
  bounding_box?: BoundingBox;
  salvageable?: Salvageable | null;
  salvage_note?: string | null;
  claim_class?: ClaimClass | null;
  claim_note?: string | null;
};

export type RoomScan = {
  room_type: string;
  items: ScannedItem[];
  notes: string;
  detected_phase?: "before" | "after" | null;
  // Computed server-side: the estimate range counting only contents items,
  // which is what a personal property claim can actually include.
  contents_total_estimate_cad?: { low: number; high: number } | null;
  building_items_present?: boolean;
};

// Flat shape returned by the new Flask blueprint , 
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

export type ReadinessCheck = {
  key: string;
  label: string;
  done: boolean;
};

export type CaseReadiness = {
  percent: number;
  completed: number;
  total: number;
  checks: ReadinessCheck[];
};

export type RecommendResponse = {
  by_category: RecGroups;
  top_pick: Recommendation | null;
  deadline_radar: Recommendation[];
  personalize_more: PersonalizeHint[];
  empty_categories?: string[];
  todo?: Recommendation[];
  readiness?: CaseReadiness;
};

export type ScrapeResult = {
  sources_checked: number;
  programs_found: number;
  programs_added: number;
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
  policy_reviewed_at?: string | null;
};

// Everything the user owns, in one JSON file. Built for users who need their
// records outside the app, especially during a coverage dispute.
export type DataExport = {
  exported_at: string;
  profile: Profile;
  cases: Case[];
  items: Item[];
  documents: UserDocument[];
  communications: Communication[];
  ale_expenses: AleExpense[];
  recommendations: unknown[];
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
  updateCase: (id: string, body: Partial<Case>) =>
    request<{ case: Case }>(`/cases/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
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
  deleteCase: (id: string) =>
    request<{ ok: true }>(`/cases/${id}`, { method: "DELETE" }),
  listDeletedCases: () => request<{ cases: Case[] }>("/cases/deleted"),
  closeCase: (id: string) =>
    request<{ case: Case }>(`/cases/${id}/close`, { method: "POST" }),
  reopenCase: (id: string) =>
    request<{ case: Case }>(`/cases/${id}/reopen`, { method: "POST" }),
  restoreCase: (id: string) =>
    request<{ case: Case }>(`/cases/${id}/restore`, { method: "POST" }),

  // Claim communications log
  listCommunications: (caseId: string) =>
    request<{ communications: Communication[] }>(`/cases/${caseId}/communications`),
  createCommunication: (caseId: string, body: Partial<Communication>) =>
    request<{ communication: Communication }>(`/cases/${caseId}/communications`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateCommunication: (id: string, body: Partial<Communication>) =>
    request<{ communication: Communication }>(`/communications/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteCommunication: (id: string) =>
    request<{ ok: true }>(`/communications/${id}`, { method: "DELETE" }),

  // Additional living expenses
  listAleExpenses: (caseId: string) =>
    request<{ expenses: AleExpense[]; total: number }>(`/cases/${caseId}/ale-expenses`),
  createAleExpense: (caseId: string, body: Partial<AleExpense>) =>
    request<{ expense: AleExpense }>(`/cases/${caseId}/ale-expenses`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateAleExpense: (id: string, body: Partial<AleExpense>) =>
    request<{ expense: AleExpense }>(`/ale-expenses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteAleExpense: (id: string) =>
    request<{ ok: true }>(`/ale-expenses/${id}`, { method: "DELETE" }),

  getDamageMapping: () =>
    request<{ mapping: Record<string, string> }>("/meta/damage-mapping"),

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
  scrapePrograms: (caseId: string) =>
    request<ScrapeResult>(`/cases/${caseId}/scrape-programs`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  listMyDocuments: () => request<{ documents: UserDocument[] }>("/documents"),
  getDocumentUrl: (id: string) =>
    request<{ url: string; ttl_seconds: number }>(`/documents/${id}/url`),
  analyzeDocument: (id: string) =>
    // Gemini occasionally returns 503 under load; the retry usually saves
    // the user from having to click analyze twice.
    request<{ document: UserDocument }>(`/documents/${id}/analyze`, {
      method: "POST",
      retryTransient: true,
    }),
  listDeletedDocuments: () =>
    request<{ documents: UserDocument[] }>("/documents/deleted"),
  restoreDocument: (id: string) =>
    request<{ document: UserDocument }>(`/documents/${id}/restore`, { method: "POST" }),
  updateDocument: (id: string, patch: { name?: string; doc_type?: string }) =>
    request<{ document: UserDocument }>(`/documents/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteDocument: (id: string) =>
    request<{ ok: true }>(`/documents/${id}`, { method: "DELETE" }),
  uploadDocument: async (
    file: File,
    onProgress?: (percent: number) => void,
  ): Promise<{ document: UserDocument }> => {
    const fd = new FormData();
    fd.append("file", file);
    return uploadWithProgress("/documents", fd, onProgress);
  },

  analyzeRoomPhoto: async (file: File, prePost: "pre" | "post" | "auto" = "auto"): Promise<RoomScan> => {
    const fd = new FormData();
    fd.append("image", file);
    fd.append("pre_post", prePost);
    let res: Response;
    try {
      res = await fetch(`${BASE}/ml/analyze-photo`, {
        method: "POST",
        headers: await authHeaders(),
        body: fd,
      });
    } catch {
      throw new ApiError(OFFLINE_MESSAGE);
    }
    if (!res.ok) throw await toApiError(res);
    return res.json();
  },

  // Upload an item photo to storage; returns the public URL to store in
  // one of the item's image columns (before_url / after_url).
  uploadItemImage: async (file: File): Promise<{ url: string }> => {
    const fd = new FormData();
    fd.append("image", file);
    let res: Response;
    try {
      res = await fetch(`${BASE}/items/upload-image`, {
        method: "POST",
        headers: await authHeaders(),
        body: fd,
      });
    } catch {
      throw new ApiError(OFFLINE_MESSAGE);
    }
    if (!res.ok) throw await toApiError(res);
    return res.json();
  },

  // /items, user-wide library, independent of any case
  listMyItems: () => request<{ items: Item[] }>("/items"),
  createLibraryItem: (body: Partial<Item>) =>
    request<{ item: Item }>("/items", { method: "POST", body: JSON.stringify(body) }),
  attachItemToCase: (itemId: string, caseId: string) =>
    request<{ item: Item }>(`/items/${itemId}/attach/${caseId}`, { method: "POST" }),
  detachItem: (itemId: string) =>
    request<{ item: Item }>(`/items/${itemId}/detach`, { method: "POST" }),

  // /me, profile + readiness score
  getMe: () => request<MeResponse>("/me"),
  updateMe: (patch: Partial<Profile>) =>
    request<MeResponse>("/me", { method: "PATCH", body: JSON.stringify(patch) }),
  exportMyData: () => request<DataExport>("/me/export"),
  deleteAccount: () =>
    request<{ ok: true; warnings?: string[] }>("/me", {
      method: "DELETE",
      body: JSON.stringify({ confirm: "DELETE" }),
    }),

  getTerms: () => request<Terms>("/terms"),
  getTermsStatus: () => request<TermsStatus>("/terms/status"),
  acceptTerms: (version: string) =>
    request<{ ok: true }>("/terms/accept", {
      method: "POST",
      body: JSON.stringify({ version }),
    }),
  listAlerts: () => request<{ alerts: Alert[] }>("/alerts"),
};
