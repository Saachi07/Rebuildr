import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Landing() {
  const { user } = useAuth();
  const start = user ? "/cases/new" : "/login";
  return (
    <div className="container">
      <div className="hero">
        <h1>You're not doing this alone.</h1>
        <p className="warm">
          Whatever happened, we'll help you piece it back together. One small
          step at a time. Nothing has to happen all at once.
        </p>
        <div className="cta-row">
          <Link to="/emergency"><button className="urgent big">I need help right now</button></Link>
          <Link to={start}><button className="big">Start when you're ready</button></Link>
        </div>
      </div>

      <div className="grid grid-3">
        <div className="card">
          <h3>1. Share what you have</h3>
          <p className="muted-strong">A few photos, your insurance papers, even just one document is enough to start.</p>
        </div>
        <div className="card">
          <h3>2. We sort it for you</h3>
          <p className="muted-strong">We read your policy, list what you lost, and figure out what's covered.</p>
        </div>
        <div className="card">
          <h3>3. You get a plan</h3>
          <p className="muted-strong">A clear next step, the deadlines that matter, and people who can help.</p>
        </div>
      </div>
    </div>
  );
}
