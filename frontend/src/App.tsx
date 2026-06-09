import { useEffect, useRef, useState } from "react";
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
import Terms from "./pages/legal/Terms";
import Privacy from "./pages/legal/Privacy";
import { TermsGate } from "./components/TermsGate";
import { Spinner } from "./components/Skeleton";

const PLACEHOLDER_NOTIFICATIONS = [
  {
    id: "n1",
    title: "Alberta Emergency Alert",
    body: "Wildfire smoke advisory in effect for your area. Stay indoors if possible.",
    time: "2h ago",
    unread: true,
  },
  {
    id: "n2",
    title: "Missing photos",
    body: "You added 3 items to your living room — add photos to strengthen your claim.",
    time: "Yesterday",
    unread: true,
  },
  {
    id: "n3",
    title: "Document reminder",
    body: "Your insurance policy document hasn't been uploaded yet.",
    time: "2 days ago",
    unread: false,
  },
];

function NotificationsButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unreadCount = PLACEHOLDER_NOTIFICATIONS.filter((n) => n.unread).length;

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
          <div className="popover-header">Notifications</div>
          {PLACEHOLDER_NOTIFICATIONS.map((n) => (
            <div key={n.id} className={`notif-item${n.unread ? " unread" : ""}`}>
              <div className="notif-title">{n.title}</div>
              <div className="notif-body">{n.body}</div>
              <div className="notif-time">{n.time}</div>
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
          <button className="menu-item" onClick={() => { setOpen(false); nav("/dashboard"); }}>
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
            <Link to="/documents">Documents</Link>
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
      <Link to="/cases/new"><button>+ Create case</button></Link>
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
        <Route path="/documents" element={<Private><Documents /></Private>} />
        <Route path="/cases/new" element={<Private><NewCase /></Private>} />
        <Route path="/cases/:id" element={<Private><CaseHub /></Private>} />
        <Route path="/cases/:id/inventory" element={<Private><Inventory /></Private>} />
        <Route path="/cases/:id/recommendations" element={<Private><Recommendations /></Private>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </TermsGate>
  );
}
