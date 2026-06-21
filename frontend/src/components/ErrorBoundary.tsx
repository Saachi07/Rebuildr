import { Component, ReactNode } from "react";

// A render-time crash in any one page used to blank the whole app, with no way
// out but a manual refresh. This catches those errors and shows a calm, plain
// recovery screen instead, so a single broken view never strands someone
// mid-recovery. Reset is keyed on the current path, so navigating elsewhere (or
// reloading) clears the error and tries again.
type Props = { children: ReactNode; routeKey: string };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    // A new route after an error means the user navigated away; drop the error
    // so the new page renders normally.
    if (this.state.error && prev.routeKey !== this.props.routeKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: unknown) {
    // Keep a console trail for debugging; no user data is logged.
    console.error("Unhandled UI error:", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="container">
        <div className="card" style={{ marginTop: 24 }}>
          <h1 style={{ marginTop: 0 }}>Something on this page broke</h1>
          <p className="warm-note">
            This is on us, not you, and nothing you saved is lost. Try reloading,
            or head back to your dashboard and pick up where you left off.
          </p>
          <div className="row" style={{ marginTop: 16, gap: 8 }}>
            <button className="big" onClick={() => window.location.reload()}>
              Reload this page
            </button>
            <a href="/dashboard">
              <button className="secondary big">Go to dashboard</button>
            </a>
          </div>
        </div>
      </div>
    );
  }
}
