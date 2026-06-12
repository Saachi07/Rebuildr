import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function NotFound() {
  const { user } = useAuth();
  const home = user ? "/dashboard" : "/";
  return (
    <div className="container">
      <div className="not-found">
        <h1>404</h1>
        <p>
          We couldn't find that page. Don't worry — everything you've saved is
          safe. Let's get you back.
        </p>
        <Link to={home}>
          <button>{user ? "Back to your dashboard" : "Back to the start"}</button>
        </Link>
      </div>
    </div>
  );
}
