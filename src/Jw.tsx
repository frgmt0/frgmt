import { useEffect, useRef, useState } from "react";

/* ============================================================
   Jw — the identity mark, auditioning typefaces.
   It flips through a handful of faces ("which one is right?")
   and then commits to the display face. The little caption
   narrates the tinkering. System fonts so the audition is
   instant; the final lock is the loaded display face.
   ============================================================ */

type Face = { label: string; stack: string; final?: boolean };

const AUDITION: Face[] = [
  { label: "georgia", stack: 'Georgia, "Times New Roman", serif' },
  { label: "courier", stack: '"Courier New", Courier, monospace' },
  { label: "impact", stack: 'Impact, "Haettenschweiler", "Arial Narrow Bold", sans-serif' },
  { label: "comic sans", stack: '"Comic Sans MS", "Comic Sans", cursive' },
  { label: "helvetica", stack: 'Helvetica, Arial, sans-serif' },
  { label: "times", stack: '"Times New Roman", Times, serif' },
];

const FINAL: Face = { label: "archivo", stack: '"Archivo", "Arial Black", sans-serif', final: true };

type Props = {
  start: boolean;
  skip?: boolean;
  onLocked?: () => void;
  onCaption?: (text: string) => void;
};

export default function Jw({ start, skip, onLocked, onCaption }: Props) {
  const [face, setFace] = useState<Face>(FINAL);
  const [locked, setLocked] = useState(false);
  const onLockedRef = useRef(onLocked);
  const onCaptionRef = useRef(onCaption);
  onLockedRef.current = onLocked;
  onCaptionRef.current = onCaption;

  useEffect(() => {
    if (skip) {
      setFace(FINAL);
      setLocked(true);
      onCaptionRef.current?.(`font: ${FINAL.label} ✓`);
      onLockedRef.current?.();
      return;
    }
    if (!start) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setFace(FINAL);
      setLocked(true);
      onCaptionRef.current?.(`font: ${FINAL.label} ✓`);
      onLockedRef.current?.();
      return;
    }

    let i = 0;
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const next = () => {
      if (!alive) return;
      if (i < AUDITION.length) {
        const f = AUDITION[i];
        setFace(f);
        setLocked(false);
        onCaptionRef.current?.(`try: ${f.label}`);
        i += 1;
        timers.push(setTimeout(next, 165));
      } else {
        setFace(FINAL);
        setLocked(true);
        onCaptionRef.current?.(`font: ${FINAL.label} ✓`);
        onLockedRef.current?.();
      }
    };
    timers.push(setTimeout(next, 120));
    return () => {
      alive = false;
      for (const t of timers) clearTimeout(t);
    };
  }, [start, skip]);

  return (
    <span className="jw-mark" style={{ fontFamily: face.stack }} data-final={locked ? "1" : undefined}>
      jw
    </span>
  );
}
