import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import Blog from "./pages/Blog";
import PostPage from "./pages/Post";
import Admin from "./pages/Admin";
import Chrome from "./Chrome";
import { navigate, usePath } from "./router";
import "./styles.css";

function NotFound() {
  useEffect(() => {
    document.title = "Not found — frgmt";
  }, []);
  return (
    <Chrome>
      <main id="main" className="bcol">
        <h1 className="line">There is nothing at this address.</h1>
        <p>
          <a href="/">Home</a>
        </p>
      </main>
    </Chrome>
  );
}

function Root() {
  const path = usePath();

  // plain internal links join the SPA: one listener for the whole site
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target || a.origin !== location.origin) return;
      e.preventDefault();
      navigate(a.pathname);
    };
    addEventListener("click", onClick);
    return () => removeEventListener("click", onClick);
  }, []);

  if (path === "/") return <App />;
  if (path === "/blog") return <Blog />;
  if (path.startsWith("/blog/"))
    return <PostPage key={path} slug={decodeURIComponent(path.slice(6))} />;
  if (path === "/admin" || path.startsWith("/admin/")) return <Admin />;
  return <NotFound />;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
