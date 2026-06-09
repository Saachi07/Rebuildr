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

function Nav() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  return (
    <div className="nav">
      <Link to="/" className="brand">Rebuildr</Link>
      <div className="row">
        {user ? (
          <>
            <Link to="/dashboard">Dashboard</Link>
            <Link to="/documents">Documents</Link>
            <span className="muted" style={{ marginLeft: 12 }}>{user.email}</span>
            <button
              className="secondary"
              style={{ marginLeft: 12 }}
              onClick={async () => { await signOut(); nav("/"); }}
            >Sign out</button>
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
