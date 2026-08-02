import { useEffect, useRef, useState, type ReactNode } from "react";
import { initialTheme, persist, swapTheme, type Theme } from "./theme";
import Wash from "./Wash";

/**
 * The room around the blog and admin pages: the same wash, the same mark,
 * the same lamp with the circular wipe, on the same paper. The home page
 * keeps its own copy of this logic because its grid hands the lamp a
 * specific track; these pages use the simpler vitrine frame.
 */
export default function Chrome({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [reduced, setReduced] = useState(true);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const t = initialTheme();
    setTheme(t);
    persist(t);
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const onToggle = async () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    const box = toggleRef.current?.getBoundingClientRect();
    const origin = box
      ? { x: box.left + box.width / 2, y: box.top + box.height / 2 }
      : { x: window.innerWidth, y: 0 };
    await swapTheme(next, origin, setTheme, reduced);
  };

  return (
    <div className="frame">
      <Wash theme={theme} reduced={reduced} />
      <a className="skip" href="#main">
        Skip to content
      </a>
      <a className="mark" href="/">
        frgmt
      </a>
      <button
        ref={toggleRef}
        className="lamp"
        onClick={onToggle}
        aria-pressed={theme === "dark"}
        aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}
      >
        {theme === "dark" ? "light" : "dark"}
      </button>
      {children}
    </div>
  );
}
