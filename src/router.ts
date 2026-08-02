import { useEffect, useState } from "react";

/**
 * The smallest router that works: the URL is the state. Internal links are
 * intercepted globally in main.tsx, so any plain <a href="/blog"> joins the
 * SPA without knowing this file exists.
 */
export function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    addEventListener("popstate", on);
    return () => removeEventListener("popstate", on);
  }, []);
  return path;
}

export function navigate(to: string) {
  history.pushState(null, "", to);
  dispatchEvent(new PopStateEvent("popstate"));
  scrollTo(0, 0);
}
