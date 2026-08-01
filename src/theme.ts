import { flushSync } from "react-dom";

export type Theme = "light" | "dark";

const KEY = "frgmt-theme";

/** Stored choice wins, then the OS. */
export function initialTheme(): Theme {
  const saved = localStorage.getItem(KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function persist(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(KEY, theme);
}

/**
 * Swap the theme behind a circular wipe that opens from the control you
 * clicked, then let the caller bring the objects back.
 *
 * View Transitions capture a still of the old page and cross-fade to a still of
 * the new one, so anything animating *during* the transition is frozen inside
 * that snapshot. That is why the objects are hidden for the wipe and released
 * only once it has finished: the two moves read as a sequence rather than
 * fighting each other in one frame.
 *
 * Without View Transitions support, or under reduced motion, this is a plain
 * synchronous swap. The page is complete either way.
 */
export async function swapTheme(
  next: Theme,
  origin: { x: number; y: number },
  apply: (t: Theme) => void,
  reduced: boolean,
): Promise<void> {
  const supported = typeof document.startViewTransition === "function";

  if (reduced || !supported) {
    apply(next);
    persist(next);
    return;
  }

  const transition = document.startViewTransition(() => {
    flushSync(() => {
      apply(next);
      persist(next);
    });
  });

  await transition.ready;

  const { x, y } = origin;
  const reach = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );

  document.documentElement.animate(
    {
      clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${reach}px at ${x}px ${y}px)`],
    },
    {
      duration: 640,
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      pseudoElement: "::view-transition-new(root)",
    },
  );

  await transition.finished;
}
