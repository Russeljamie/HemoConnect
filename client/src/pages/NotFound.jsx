import { Link } from "react-router-dom";

function NotFound() {
  return (
    <main className="not-found-page">
      <div>
        <span>404</span>
        <h1>Page not found</h1>
        <p>This address does not match a HemoConnect page.</p>
        <Link to="/dashboard">Return to dashboard</Link>
      </div>
    </main>
  );
}

export default NotFound;