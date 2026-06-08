import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import NewCase from "./pages/NewCase";
import CaseHub from "./pages/CaseHub";
import Inventory from "./pages/Inventory";
import Recommendations from "./pages/Recommendations";

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

function Private({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="container">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Private><Dashboard /></Private>} />
        <Route path="/cases/new" element={<Private><NewCase /></Private>} />
        <Route path="/cases/:id" element={<Private><CaseHub /></Private>} />
        <Route path="/cases/:id/inventory" element={<Private><Inventory /></Private>} />
        <Route path="/cases/:id/recommendations" element={<Private><Recommendations /></Private>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
