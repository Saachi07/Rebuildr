import { useEffect, useState } from "react";

// People recovering from a disaster are often on patchy connections
// (evacuation centres, damaged areas). Tell them plainly when they're
// offline and reassure them nothing is lost.
export function OfflineBanner() {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  if (online) return null;
  return (
    <div className="offline-banner" role="status">
      <strong>You're offline right now.</strong>{" "}
      Everything you've saved is safe. We'll reconnect automatically when your
      connection comes back.
    </div>
  );
}
