import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import NewCase from "./pages/NewCase";
import CaseHub from "./pages/CaseHub";
import Inventory from "./pages/Inventory";
import Recommendations from "./pages/Recommendations";
import Emergency from "./pages/Emergency";
import Documents from "./pages/Documents";
import NotFound from "./pages/NotFound";
import Profile from "./pages/Profile";
import Terms from "./pages/legal/Terms";
import Privacy from "./pages/legal/Privacy";
import { TermsGate } from "./components/TermsGate";
import { Spinner } from "./components/Skeleton";
import { HelpFooter } from "./components/HelpFooter";
import { CasePicker } from "./components/CasePicker";
import { api } from "./api";

type DerivedNotif = {
  id: string;
  title: string;
  body: string;
  to?: string;
  unread: boolean;
};

function useDerivedNotifications(): DerivedNotif[] {
  const { user } = useAuth();
  const [notifs, setNotifs] = useState<DerivedNotif[]>([]);

  useEffect(() => {
    if (!user) { setNotifs([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const [casesRes, docsRes, alertsRes, meRes] = await Promise.all([
          api.listCases(),
          api.listMyDocuments(),
          api.listAlerts(),
          api.getMe(),
        ]);
        if (cancelled) return;
        const out: DerivedNotif[] = [];
        const cases = casesRes.cases;
        const docs = docsRes.documents;
        const alerts = (alertsRes && (alertsRes.alerts ?? [])) || [];
        const weatherTerms = ["tornado", "wildfire", "flood", "winter storm", "evacuation"];
        const profileRegion = meRes?.profile?.region || null;
        const caseRegion = cases && cases.length > 0 ? cases[0].region : null;
        const userRegion = (profileRegion || caseRegion || "") as string;

        // Filter alerts by region: include if alert has no regions (broad),
        // or if any alert region fuzzily matches the user's profile/case region.
        const filteredAlerts = alerts.filter((a) => {
          try {
            const regs = (a.regions || []).map((r: any) => String(r || "").toLowerCase().trim()).filter(Boolean);
            if (regs.length === 0) return true;
            if (!userRegion) return true;
            const ur = String(userRegion).toLowerCase().trim();
            for (const rr of regs) {
              if (rr.includes(ur) || ur.includes(rr)) return true;
            }
            return false;
          } catch {
            return true;
          }
        });
        const hasPolicy = docs.some((d) => d.doc_type === "insurance_policy" || d.doc_type === "policy");
        if (!hasPolicy) {
          out.push({
            id: "policy-missing",
            title: "Upload your insurance policy",
            body: "We use your policy to find deadlines and coverage gaps. It only takes a minute.",
            to: "/documents",
            unread: true,
          });
        }

        if (cases.length === 0) {
          out.push({
            id: "no-case",
            title: "Start your first case",
            body: "Tell us what happened so we can build your plan.",
            to: "/cases/new",
            unread: true,
          });
        } else {
          const latest = cases[0];
          // Crude "inventory empty?" check — we don't list items here to keep this cheap.
          out.push({
            id: `recs-${latest.id}`,
            title: "Your recovery plan is ready",
            body: `Open the latest plan for ${latest.case_name}.`,
            to: `/cases/${latest.id}/recommendations`,
            unread: false,
          });

          // Check inventory for the latest case; if missing or empty, remind user
          try {
            const itemsRes = await api.listItems(latest.id);
            const items = itemsRes?.items ?? [];
            if (!items || items.length === 0) {
              out.push({
                id: `inventory-missing-${latest.id}`,
                title: "Complete your home inventory",
                body: "A detailed home inventory helps document losses — add photos and items now.",
                to: `/cases/${latest.id}/inventory`,
                unread: true,
              });
            }
          } catch {
            // don't block notifications if the inventory check fails
          }
        }

        // Surface document deadlines pulled out by Gemini.
        for (const d of docs) {
          const fields = (d.gemini_analysis?.key_fields ?? {}) as Record<string, unknown>;
          const deadline = fields["deadline"] ?? fields["filing_deadline"] ?? fields["due_date"];
          if (typeof deadline === "string" && deadline.trim()) {
            out.push({
              id: `deadline-${d.id}`,
              title: `Deadline in ${d.name}`,
              body: String(deadline),
              to: "/documents",
              unread: true,
            });
          }
        }

        // Surface weather / Alberta 511 alerts
        for (const a of filteredAlerts) {
          try {
            const send = !!a.send_notification;
            if (!send) continue;
            const msg = String(a.message || a.long_description || a.description || "");
            const lower = msg.toLowerCase();
            const high = weatherTerms.some((t) => lower.includes(t));
            const insuranceAppend = !hasPolicy ? "\n\nPlease upload your insurance documents to prepare for potential claims." : "";
            out.push({
              id: `alert-${a.id}`,
              title: `${high ? '⚠️ ' : ''}${String(a.title || 'Weather alert')}`,
              body: `${msg}${insuranceAppend}`,
              to: "/emergency",
              unread: true,
            });
          } catch {
            // swallow malformed alerts
            continue;
          }
        }

        setNotifs(out);
      } catch {
        if (!cancelled) setNotifs([]);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  return notifs;
}

function NotificationsButton() {
  const notifs = useDerivedNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const unreadCount = notifs.filter((n) => n.unread).length;

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="nav-pop" ref={ref}>
      <button
        className="icon-btn"
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden>🔔</span>
        {unreadCount > 0 && <span className="dot-badge">{unreadCount}</span>}
      </button>
      {open && (
        <div className="popover">
          <div className="popover-header">What needs attention</div>
          {notifs.length === 0 && (
            <div className="notif-empty">You're all caught up.</div>
          )}
          {notifs.map((n) => (
            <div
              key={n.id}
              className={`notif-item${n.unread ? " unread" : ""}${n.to ? " actionable" : ""}`}
              onClick={() => { if (n.to) { setOpen(false); nav(n.to); } }}
            >
              <div className="notif-title">{n.title}</div>
              <div className="notif-body">{n.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileMenu() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const initial = (user?.email ?? "?").trim().charAt(0).toUpperCase();

  return (
    <div className="nav-pop" ref={ref}>
      <button
        className="avatar-btn"
        aria-label="Profile menu"
        onClick={() => setOpen((v) => !v)}
      >
        {initial}
      </button>
      {open && (
        <div className="popover">
          <div className="profile-head">
            <div className="avatar-lg">{initial}</div>
            <div>
              <div className="profile-name">Signed in</div>
              <div className="profile-email">{user?.email}</div>
            </div>
          </div>
          <button className="menu-item" onClick={() => { setOpen(false); nav("/profile"); }}>
            View profile
          </button>
          <button className="menu-item" onClick={() => { setOpen(false); nav("/documents"); }}>
            Documents
          </button>
          <button
            className="menu-item danger-text"
            onClick={async () => { setOpen(false); await signOut(); nav("/"); }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function Nav() {
  const { user } = useAuth();
  return (
    <div className="nav">
      <Link to="/" className="brand">Rebuildr</Link>
      <div className="row">
        {user ? (
          <>
            <Link to="/dashboard">Dashboard</Link>
            <NotificationsButton />
            <ProfileMenu />
          </>
        ) : (
          <Link to="/login"><button>Sign in</button></Link>
        )}
      </div>
    </div>
  );
}

function ActionBar() {
  const { user } = useAuth();
  const loc = useLocation();
  if (!user) return null;
  if (loc.pathname.startsWith("/login") || loc.pathname.startsWith("/legal")) return null;
  return (
    <div className="actionbar">
      <CasePicker />
      <span className="spacer" />
      <Link to="/cases/new"><button>+ Start a new case</button></Link>
    </div>
  );
}

function Private({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="container"><Spinner /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <TermsGate>
      <Nav />
      <ActionBar />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/emergency" element={<Emergency />} />
        <Route path="/login" element={<Login />} />
        <Route path="/legal/terms" element={<Terms />} />
        <Route path="/legal/privacy" element={<Privacy />} />
        <Route path="/dashboard" element={<Private><Dashboard /></Private>} />
        <Route path="/profile" element={<Private><Profile /></Private>} />
        <Route path="/documents" element={<Private><Documents /></Private>} />
        <Route path="/cases/new" element={<Private><NewCase /></Private>} />
        <Route path="/cases/:id" element={<Private><CaseHub /></Private>} />
        <Route path="/cases/:id/inventory" element={<Private><Inventory /></Private>} />
        <Route path="/cases/:id/recommendations" element={<Private><Recommendations /></Private>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <HelpFooter />
    </TermsGate>
  );
}
