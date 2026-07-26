import ClaudeMark from "./ClaudeMark";

/* ============================================================
   Badge — the Claude Ambassador credential.
   Rendered as a cream sticker affixed to the off-black terminal:
   Anthropic's light/dark/clay trio, dropped onto the page as a
   physical object. The mark is the official sunburst.
   ============================================================ */

export default function Badge() {
  return (
    <a
      className="amb"
      href="https://claude.com/community/ambassadors"
      target="_blank"
      rel="noreferrer"
      aria-label="Claude Ambassador — students and educators vertical"
    >
      <ClaudeMark className="amb-mark" />
      <span className="amb-text">
        <span className="amb-title">claude ambassador</span>
        <span className="amb-vert">students &amp; educators</span>
      </span>
      <span className="amb-perf" aria-hidden="true" />
    </a>
  );
}
