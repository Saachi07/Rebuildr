import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

const STORAGE_KEY = "rebuildr.helpFooterDismissed";

export function HelpFooter() {
  const loc = useLocation();
  const [dismissed, setDismissed] = useState<boolean>(
    () => sessionStorage.getItem(STORAGE_KEY) === "1",
  );

  // Hide on login + legal + the emergency page itself.
  if (loc.pathname.startsWith("/login") || loc.pathname.startsWith("/legal") || loc.pathname.startsWith("/emergency")) {
    return null;
  }
  if (dismissed) return null;

  return (
    <div className="help-footer" role="complementary" aria-label="Help and crisis support">
      <strong>Need to talk to someone?</strong>
      <span className="muted-strong">
        Call or text <a href="tel:988">988</a> (24/7) · Alberta Mental Health
        Help Line: <a href="tel:18773032642">1-877-303-2642</a>
      </span>
      <Link to="/emergency" style={{ color: "var(--focus)", textDecoration: "underline" }}>
        All emergency contacts
      </Link>
      <span className="spacer" />
      <button
        className="close-x"
        aria-label="Dismiss this help bar for the rest of the session"
        onClick={() => { sessionStorage.setItem(STORAGE_KEY, "1"); setDismissed(true); }}
      >
        ×
      </button>
    </div>
  );
}
