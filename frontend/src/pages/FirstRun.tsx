import { useState } from "react";
import { Link } from "react-router-dom";
import { useStartRecovery } from "../lib/useStartRecovery";

// The one-time welcome for someone who has never started a case or added any
// inventory. We do not yet know their situation, so we offer two clearly
// unequal paths framed by what is happening to them, not by our internal
// pre/post vocabulary. Recovery is the prominent, zero-friction primary: a
// person dealing with damage right now should not have to weigh options.
// Preparing is the calm secondary, for those nothing has happened to yet.
// Once they act on either, they are no longer new and never see this again.
export default function FirstRun() {
  const startRecovery = useStartRecovery();
  const [starting, setStarting] = useState(false);

  async function onStartRecovery() {
    setStarting(true);
    try {
      await startRecovery();
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 760 }}>
      <h1>Welcome to Rebuildr</h1>
      <p className="warm-note" style={{ marginTop: 8 }}>
        Where would you like to begin? You can always switch later, nothing
        here locks you in.
      </p>

      <div className="card accent-card" style={{ marginTop: 8 }}>
        <h2 style={{ marginTop: 0 }}>Something has happened</h2>
        <p className="muted-strong" style={{ marginTop: 0 }}>
          If you are dealing with damage right now, we will walk you through it
          one calm step at a time. Your progress saves as you go, so you can
          stop and come back whenever you need to.
        </p>
        <button className="big" disabled={starting} onClick={onStartRecovery}>
          {starting ? "Setting things up..." : "Start your recovery"}
        </button>
      </div>

      <div className="card" style={{ marginTop: 8 }}>
        <h3 style={{ marginTop: 0 }}>I want to be ready</h3>
        <p className="muted-strong" style={{ marginTop: 0 }}>
          Good. The best time to get ready is before you ever need to.
          Photograph your home while it is whole and understand your coverage
          now, so any future claim is far easier.
        </p>
        <Link to="/prepare">
          <button className="secondary big">Get prepared</button>
        </Link>
      </div>
    </div>
  );
}
