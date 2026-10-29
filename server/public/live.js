// Live Xiaosi: a sticker of him that does what the pet cam last saw him doing. Loafing, he breathes; flopped, he
// tips over; on the move, he hops; eating, he nods; grooming, he wiggles; not seen lately, he peeks in from the
// edge. Only motion on stickers already made (no new AI), and only what the cams actually saw.
//
//   FSLive.state(me, entries, now?) -> { state, at, sim } | null
//       me.live (the pet cam's report) if it's fresh, else the newest pose / time on the move in the diary
//   FSLive.html({ sticker, photo, state, name, size, caption }) -> markup (styles are added once)
//   FSLive.sticker(entries) -> diary entry of his newest cut-out (not a weekly card), or null
(function (root) {
  const WORD = { loaf: "is loafing", flop: "has flopped", stretched: "is stretched out", sitting: "is sitting up", eating: "is eating", grooming: "is grooming", active: "is on the move", away: "isn't on the cams right now" };
  const FRESH = 20 * 60e3, RECENT = 3 * 36e5;

  function state(me, entries, now = Date.now()) {
    if (me && me.live && now - me.live.at < FRESH) return { state: me.live.state, at: me.live.at, sim: !!me.live.sim };
    // the diary: a pose is logged when he gets up from it, so the newest one is what he did last
    const e = (entries || []).find((x) => (x.kind === "pose" || x.kind === "active") && x.extra && now - (x.extra.to || x.at) < RECENT);
    if (e) return { state: e.kind === "active" ? "active" : e.extra.pose || "sitting", at: e.extra.to || e.at, sim: !!e.extra.sim };
    const last = (entries || []).find((x) => x.kind === "pose" || x.kind === "active" || x.kind === "moment");
    return last ? { state: "away", at: last.at, sim: !!(last.extra && last.extra.sim) } : null;
  }

  const sticker = (entries) => (entries || []).find((e) => e.has_image && e.kind !== "recap" && (e.png || (e.extra && e.extra.sticker))) || null;

  const ago = (t) => { const m = Math.round((Date.now() - t) / 6e4); return m < 2 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };

  let styled = false;
  function style() {
    if (styled || typeof document === "undefined") return;
    styled = true;
    const s = document.createElement("style");
    s.textContent = `
      .lx { position: relative; display: grid; place-items: center; flex: none; }
      .lx .who { transform-origin: 50% 60%; will-change: transform; }
      .lx.away { overflow: hidden; }   /* peeking in from the edge needs the edge */
      .lx img { display: block; max-width: 100%; max-height: 100%; filter: drop-shadow(0 6px 10px rgba(0,0,0,.22)); }
      .lx img.photo { border-radius: 50%; border: 5px solid #fff; aspect-ratio: 1; object-fit: cover; }
      .lx.loaf .who, .lx.sitting .who { animation: lxBreathe 3.4s ease-in-out infinite; }
      .lx.stretched .who { animation: lxBreatheLong 3.8s ease-in-out infinite; }
      .lx.flop .who { animation: lxFlop .9s cubic-bezier(.4,1.6,.6,1) both, lxBreatheFlop 3.6s ease-in-out .9s infinite; }
      .lx.active .who { animation: lxHop .9s ease-in-out infinite; }
      .lx.eating .who { animation: lxNod .7s ease-in-out infinite; }
      .lx.grooming .who { animation: lxWiggle .45s ease-in-out infinite; }
      .lx.away .who { animation: lxPeek 4.5s ease-in-out infinite; }
      @keyframes lxBreathe { 0%, 100% { transform: scale(1, 1); } 50% { transform: scale(1.03, .96); } }
      @keyframes lxBreatheLong { 0%, 100% { transform: scale(1.12, .9); } 50% { transform: scale(1.15, .87); } }
      @keyframes lxFlop { from { transform: rotate(0) scale(1); } to { transform: rotate(-78deg) scale(.82); } }
      @keyframes lxBreatheFlop { 0%, 100% { transform: rotate(-78deg) scale(.82, .82); } 50% { transform: rotate(-78deg) scale(.85, .79); } }
      @keyframes lxHop { 0% { transform: translate(-10%, 4%) scale(.92, .86); } 25% { transform: translate(-4%, -12%) scale(.84, .94); } 50% { transform: translate(4%, 4%) scale(.94, .84); }
        75% { transform: translate(10%, -10%) scale(.84, .94); } 100% { transform: translate(-10%, 4%) scale(.92, .86); } }
      @keyframes lxNod { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(7deg) translateY(3%); } }
      @keyframes lxWiggle { 0%, 100% { transform: rotate(-4deg); } 50% { transform: rotate(4deg); } }
      @keyframes lxPeek { 0%, 100% { transform: translateX(62%) rotate(-8deg); } 40%, 60% { transform: translateX(28%) rotate(-3deg); } }
      @media (prefers-reduced-motion: reduce) { .lx .who { animation: none !important; } }`;
    document.head.appendChild(s);
  }

  // the picture (a sticker, else his photo in a circle) doing the state's motion, and a line saying what it is
  function html({ sticker: src, photo, state: st, name, size = 120, caption = true }) {
    style();
    if (!st) return "";
    const pic = src ? `<img src="${src}" alt="">` : photo ? `<img class="photo" src="${photo}" alt="">` : "";
    const line = `${name} ${WORD[st.state] || "is " + st.state}`;
    return `<div class="lx ${st.state}" style="width:${size}px;height:${size}px" title="${line}"><div class="who">${pic}</div></div>
      ${caption ? `<div class="lxcap"><b>${line}</b><span>${st.state === "away" ? `last seen ${ago(st.at)}` : `pet cam, ${ago(st.at)}`}${st.sim ? " · simulated" : ""}</span></div>` : ""}`;
  }

  const api = { state, html, sticker, WORD };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.FSLive = api;
})(typeof window !== "undefined" ? window : globalThis);
