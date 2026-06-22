import { useEffect, useRef, useState } from "react";

/* ============================================================
   Typewriter — emulates a human at a keyboard.
   The script is a list of editing ops. Selections are always
   trailing (from `sel` to the end of the buffer), which is enough
   to model word-select, shrink-back, cut, copy, paste and delete
   the way a person actually does them. Timing is jittered per
   keystroke with longer beats after spaces and punctuation, so it
   never reads as a metronome.
   ============================================================ */

export type Op =
  | { op: "type"; text: string; cps?: number }
  | { op: "pause"; ms: number }
  | { op: "back"; n: number } // backspace n chars, one at a time
  | { op: "selBack"; n: number } // grow trailing selection left by n chars
  | { op: "selWord" } // select the trailing word
  | { op: "selAll" } // select the whole line
  | { op: "kill" } // delete current selection
  | { op: "cut" } // selection -> clipboard, then delete
  | { op: "copy" } // selection -> clipboard
  | { op: "paste"; cps?: number } // type clipboard contents at the caret
  | { op: "done" }; // fire onDone here instead of at the very end

/** A typo helper: types the wrong word, hesitates, word-selects it and
 *  retypes the right one. Expands to primitive ops. */
export function typo(wrong: string, right: string): Op[] {
  return [
    { op: "type", text: wrong },
    { op: "pause", ms: 520 },
    { op: "selBack", n: wrong.length },
    { op: "pause", ms: 180 },
    { op: "type", text: right },
  ];
}

type Props = {
  script: Op[];
  start?: boolean;
  className?: string;
  /** keep a blinking caret parked at the end after the script finishes */
  caretAtRest?: boolean;
  onDone?: () => void;
  ariaLabel?: string;
};

// resolve the final committed text by replaying the ops with no timing —
// used for prefers-reduced-motion and for the aria-label.
export function resolve(script: Op[]): string {
  let text = "";
  let sel: number | null = null;
  let clip = "";
  for (const o of script) {
    switch (o.op) {
      case "type":
        if (sel !== null) {
          text = text.slice(0, sel);
          sel = null;
        }
        text += o.text;
        break;
      case "back":
        text = text.slice(0, Math.max(0, text.length - o.n));
        break;
      case "selBack":
        sel = Math.max(0, text.length - o.n);
        break;
      case "selWord": {
        const m = text.match(/(\s*\S+)$/);
        sel = m ? text.length - m[0].length : 0;
        break;
      }
      case "selAll":
        sel = 0;
        break;
      case "kill":
        if (sel !== null) {
          text = text.slice(0, sel);
          sel = null;
        }
        break;
      case "cut":
        if (sel !== null) {
          clip = text.slice(sel);
          text = text.slice(0, sel);
          sel = null;
        }
        break;
      case "copy":
        if (sel !== null) clip = text.slice(sel);
        break;
      case "paste":
        if (sel !== null) {
          text = text.slice(0, sel);
          sel = null;
        }
        text += clip;
        break;
      default:
        break;
    }
  }
  return text;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
// human keystroke cadence: base interval scaled by character, with jitter
function keyDelay(ch: string, cps: number): number {
  const base = 1000 / cps;
  let mult = 0.55 + Math.random() * 0.9; // 0.55x .. 1.45x
  if (ch === " ") mult += 0.5; // a beat after words
  if (".,!?;:—".includes(ch)) mult += 1.4; // think after punctuation
  if (Math.random() < 0.06) mult += 2.2; // occasional hesitation mid-word
  return base * mult;
}

export default function Typewriter({
  script,
  start = true,
  className,
  caretAtRest = true,
  onDone,
  ariaLabel,
}: Props) {
  const [text, setText] = useState("");
  const [sel, setSel] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!start) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setText(resolve(script));
      setSel(null);
      onDoneRef.current?.();
      return;
    }

    // local mutable buffer; React state mirrors it each tick
    let t = "";
    let s: number | null = null;
    let clip = "";
    const flush = () => {
      setText(t);
      setSel(s);
    };
    const wait = (ms: number) =>
      new Promise<void>((res) => {
        timer = setTimeout(res, ms);
      });

    (async () => {
      setRunning(true);
      // a breath before the first keystroke
      await wait(120);
      for (const o of script) {
        if (!alive) return;
        switch (o.op) {
          case "type": {
            // typing over a live selection replaces it
            if (s !== null) {
              t = t.slice(0, s);
              s = null;
              flush();
              await wait(90);
            }
            const cps = o.cps ?? 11; // ~110 wpm, human pace
            for (const ch of o.text) {
              if (!alive) return;
              t += ch;
              flush();
              await wait(keyDelay(ch, cps));
            }
            break;
          }
          case "pause":
            await wait(o.ms);
            break;
          case "back": {
            for (let i = 0; i < o.n; i++) {
              if (!alive) return;
              t = t.slice(0, -1);
              flush();
              await wait(38 + Math.random() * 36);
            }
            break;
          }
          case "selBack": {
            const target = Math.max(0, t.length - o.n);
            s = t.length;
            for (let i = t.length; i >= target; i--) {
              if (!alive) return;
              s = i;
              flush();
              await wait(26 + Math.random() * 22);
            }
            break;
          }
          case "selWord": {
            const m = t.match(/(\s*\S+)$/);
            const target = m ? t.length - m[0].length : 0;
            // double-click feel: snap, then settle
            s = target;
            flush();
            await wait(150);
            break;
          }
          case "selAll": {
            s = 0;
            flush();
            await wait(160);
            break;
          }
          case "kill": {
            if (s !== null) {
              await wait(120);
              t = t.slice(0, s);
              s = null;
              flush();
              await wait(80);
            }
            break;
          }
          case "cut": {
            if (s !== null) {
              clip = t.slice(s);
              await wait(160);
              t = t.slice(0, s);
              s = null;
              flush();
              await wait(140);
            }
            break;
          }
          case "copy": {
            if (s !== null) {
              clip = t.slice(s);
              await wait(160);
              s = null; // selection clears on copy+move
              flush();
            }
            break;
          }
          case "paste": {
            if (s !== null) {
              t = t.slice(0, s);
              s = null;
            }
            // paste lands in a quick burst, faster than hand-typing
            const cps = o.cps ?? 60;
            for (const ch of clip) {
              if (!alive) return;
              t += ch;
              flush();
              await wait(keyDelay(ch, cps) * 0.5);
            }
            break;
          }
          case "done":
            onDoneRef.current?.();
            break;
        }
      }
      if (alive) {
        setRunning(false);
        onDoneRef.current?.();
      }
    })();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, script]);

  const head = sel === null ? text : text.slice(0, sel);
  const picked = sel === null ? "" : text.slice(sel);

  return (
    <span className={className} aria-label={ariaLabel ?? resolve(script)} role="text">
      <span aria-hidden="true">
        {head}
        {picked && <mark className="tw-sel">{picked}</mark>}
        {caretAtRest || running ? (
          <span className="tw-caret" data-fat={picked ? "1" : undefined} />
        ) : null}
      </span>
    </span>
  );
}
