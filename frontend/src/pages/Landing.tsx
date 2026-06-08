import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Landing() {
  const { user } = useAuth();
  const start = user ? "/cases/new" : "/login";
  return (
    <div className="container">
      <div className="hero">
        <h1>Pick up the pieces. One plan at a time.</h1>
        <p>
          Rebuildr turns photos of damage and your insurance docs into a
          prioritized recovery plan — claims to file, deadlines to hit,
          resources to tap.
        </p>
        <div className="cta-row">
          <Link to={start}><button className="urgent">I need help now</button></Link>
          <Link to={start}><button>Start recovery planning</button></Link>
        </div>
      </div>

      <div className="grid grid-3">
        <div className="card">
          <h3>1. Upload</h3>
          <p className="muted">Photos of damage, your insurance policy, any claims you've already filed.</p>
        </div>
        <div className="card">
          <h3>2. We analyze</h3>
          <p className="muted">Classify damage room-by-room, parse policy coverage and deadlines, flag the gaps.</p>
        </div>
        <div className="card">
          <h3>3. You get a plan</h3>
          <p className="muted">Prioritized actions, deadlines, claims checklist, resource matches.</p>
        </div>
      </div>
    </div>
  );
}
