import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="container">
      <div className="not-found">
        <h1>404</h1>
        <p>That page doesn't exist.</p>
        <Link to="/dashboard"><button>Back to dashboard</button></Link>
      </div>
    </div>
  );
}
