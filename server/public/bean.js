// The Bean: FurSight's little character. One SVG, moved by CSS, used by the web app and the glasses.
//
//   bean("idle", 120)            -> HTML string for a 120px-wide Bean
//   setBean(el, "safe")          -> change the mood of a Bean already on the page (plays its reaction)
//
// Moods: idle, thinking, safe, caution, toxic (vet looks like toxic).
(function () {
  const CSS = `
  .bean { display: block; overflow: visible; }
  .bean .tilt, .bean .bob, .bean .earL, .bean .earR, .bean .eyes, .bean .look, .bean .nose, .bean .shadow { transform-box: fill-box; }
  .bean .tilt  { transform-origin: 50% 100%; transition: transform .45s cubic-bezier(.3,1.6,.5,1); }
  .bean .bob   { transform-origin: 50% 100%; animation: bn-bob 3.2s ease-in-out infinite; }
  .bean .shadow{ transform-origin: 50% 50%; animation: bn-shadow 3.2s ease-in-out infinite; }
  .bean .earL  { transform-origin: 50% 95%; animation: bn-earL 5.3s ease-in-out infinite; }
  .bean .earR  { transform-origin: 50% 95%; animation: bn-earR 6.1s ease-in-out infinite; }
  .bean .eyes  { transform-origin: 50% 50%; animation: bn-blink 4.7s infinite; }
  .bean .look  { animation: bn-look 9s ease-in-out infinite; }
  .bean .nose  { transform-origin: 50% 50%; animation: bn-sniff 2.6s infinite; }
  .bean .bob, .bean .shadow, .bean .earL, .bean .earR, .bean .eyes, .bean .look, .bean .nose { animation-delay: var(--d, 0s); }
  .bean .m { display: none; } .bean .m-idle { display: inline; }

  /* thinking: eyes up, slow ears, slower float */
  .bean.thinking .look { animation: bn-think 2.4s ease-in-out infinite; }
  .bean.thinking .bob  { animation-duration: 2s; }
  .bean.thinking .shadow { animation-duration: 2s; }
  .bean.thinking .m-idle { display: none; } .bean.thinking .m-o { display: inline; }

  /* safe: a hop, ears up, a smile */
  .bean.safe .bob   { animation: bn-hop .75s cubic-bezier(.3,.7,.4,1) 1, bn-bob 3.2s ease-in-out .75s infinite; }
  .bean.safe .shadow{ animation: bn-hopshadow .75s cubic-bezier(.3,.7,.4,1) 1, bn-shadow 3.2s ease-in-out .75s infinite; }
  .bean.safe .earL  { animation: none; transform: rotate(-4deg); transition: transform .3s; }
  .bean.safe .earR  { animation: none; transform: rotate(4deg); transition: transform .3s; }
  .bean.safe .m-idle { display: none; } .bean.safe .m-smile { display: inline; }

  /* caution: a head tilt, one ear folded */
  .bean.caution .tilt { transform: rotate(-8deg); }
  .bean.caution .earR { animation: none; transform: rotate(38deg); transition: transform .4s; }
  .bean.caution .m-idle { display: none; } .bean.caution .m-flat { display: inline; }

  /* toxic: a little shake, ears down */
  .bean.toxic .tilt { animation: bn-shake .5s ease-in-out 1; }
  .bean.toxic .bob  { animation-duration: 4.5s; }
  .bean.toxic .earL { animation: none; transform: rotate(-62deg); transition: transform .45s; }
  .bean.toxic .earR { animation: none; transform: rotate(62deg); transition: transform .45s; }
  .bean.toxic .look { animation: none; transform: translateY(4px); }
  .bean.toxic .m-idle { display: none; } .bean.toxic .m-frown { display: inline; }

  @keyframes bn-bob    { 0%,100% { transform: translateY(0) scale(1,1); } 50% { transform: translateY(-8px) scale(.985,1.015); } }
  @keyframes bn-shadow { 0%,100% { transform: scale(1); opacity: .16; } 50% { transform: scale(.88); opacity: .1; } }
  @keyframes bn-hop    { 0% { transform: translateY(0) scale(1.08,.9); } 35% { transform: translateY(-46px) scale(.94,1.07); } 70% { transform: translateY(0) scale(1.08,.92); } 100% { transform: translateY(0) scale(1,1); } }
  @keyframes bn-hopshadow { 0%,70%,100% { transform: scale(1); opacity: .16; } 35% { transform: scale(.6); opacity: .06; } }
  @keyframes bn-shake  { 0%,100% { transform: rotate(0); } 20% { transform: rotate(-6deg); } 45% { transform: rotate(5deg); } 70% { transform: rotate(-3deg); } }
  @keyframes bn-earL   { 0%,100% { transform: rotate(-12deg); } 45% { transform: rotate(-6deg); } 70% { transform: rotate(-14deg); } 74% { transform: rotate(-24deg); } 78% { transform: rotate(-12deg); } }
  @keyframes bn-earR   { 0%,100% { transform: rotate(10deg); } 30% { transform: rotate(16deg); } 55% { transform: rotate(8deg); } 88% { transform: rotate(11deg); } 91% { transform: rotate(22deg); } 94% { transform: rotate(10deg); } }
  @keyframes bn-blink  { 0%,92%,100% { transform: scaleY(1); } 95% { transform: scaleY(.1); } }
  @keyframes bn-look   { 0%,30%,100% { transform: translate(0,0); } 36%,52% { transform: translate(7px,-2px); } 58%,74% { transform: translate(-6px,1px); } 80% { transform: translate(0,0); } }
  @keyframes bn-think  { 0%,100% { transform: translate(-6px,-7px); } 50% { transform: translate(6px,-7px); } }
  @keyframes bn-sniff  { 0%,70%,100% { transform: translateY(0); } 74% { transform: translateY(-1.5px); } 78% { transform: translateY(0); } 82% { transform: translateY(-1.5px); } 86% { transform: translateY(0); } }
  @media (prefers-reduced-motion: reduce) { .bean * { animation: none !important; transition: none !important; } }`;

  let n = 0;
  function bean(mood = "idle", width = 120) {
    if (!document.getElementById("bean-css")) {
      const s = document.createElement("style"); s.id = "bean-css"; s.textContent = CSS; document.head.appendChild(s);
    }
    const g = "bn" + n++, d = (-Math.random() * 6).toFixed(2) + "s";
    return `<svg class="bean ${mood === "vet" ? "toxic" : mood}" width="${width}" height="${Math.round(width * 1.04)}" viewBox="-130 -250 260 270" style="--d:${d}" aria-hidden="true">
  <defs>
    <radialGradient id="${g}b" cx="36%" cy="26%" r="85%"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".55" stop-color="#F3F0FA"/><stop offset="1" stop-color="#C6BAE5"/></radialGradient>
    <radialGradient id="${g}f" cx="45%" cy="35%" r="70%"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#ECE6F7"/></radialGradient>
    <linearGradient id="${g}e" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C2A8F7"/><stop offset="1" stop-color="#9B6CF0"/></linearGradient>
    <radialGradient id="${g}k" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#4A4656"/><stop offset="1" stop-color="#16151B"/></radialGradient>
  </defs>
  <ellipse class="shadow" cx="0" cy="4" rx="84" ry="12" fill="#2B2A33"/>
  <g class="tilt"><g class="bob">
    <g class="earL"><rect x="-74" y="-236" width="44" height="96" rx="22" fill="url(#${g}b)"/><rect x="-63" y="-222" width="22" height="64" rx="11" fill="url(#${g}e)" opacity=".85"/></g>
    <g class="earR"><rect x="30" y="-236" width="44" height="96" rx="22" fill="url(#${g}b)"/><rect x="41" y="-222" width="22" height="64" rx="11" fill="url(#${g}e)" opacity=".85"/></g>
    <rect x="-112" y="-176" width="224" height="176" rx="88" fill="url(#${g}b)"/>
    <ellipse cx="0" cy="-86" rx="78" ry="60" fill="url(#${g}f)" stroke="#E2DBF2" stroke-width="3"/>
    <g class="look">
      <g class="eyes">
        <ellipse cx="-26" cy="-92" rx="10" ry="14" fill="url(#${g}k)"/><ellipse cx="26" cy="-92" rx="10" ry="14" fill="url(#${g}k)"/>
        <circle cx="-29" cy="-98" r="3.2" fill="#fff"/><circle cx="23" cy="-98" r="3.2" fill="#fff"/>
      </g>
      <g class="nose"><path d="M-5 -70 h10 l-5 5 z" fill="#C9A3E8" stroke="#B48BDB" stroke-width="2" stroke-linejoin="round"/></g>
      <g fill="none" stroke="#2B2A33" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path class="m m-idle" d="M-8 -62 q4 5 8 0 q4 5 8 0"/>
        <path class="m m-smile" d="M-12 -62 q12 12 24 0"/>
        <path class="m m-flat" d="M-8 -59 h16"/>
        <path class="m m-frown" d="M-9 -55 q9 -8 18 0"/>
        <ellipse class="m m-o" cx="0" cy="-58" rx="4" ry="5"/>
      </g>
    </g>
    <ellipse cx="-74" cy="-104" rx="12" ry="34" fill="#fff" opacity=".75" transform="rotate(22 -74 -104)"/>
    <ellipse cx="-62" cy="-150" rx="7" ry="5" fill="#fff" opacity=".8"/>
  </g></g>
</svg>`;
  }

  // Change mood in place. Re-adding the class replays a one-shot reaction (the hop, the shake).
  function setBean(el, mood) {
    const svg = el && (el.matches && el.matches("svg.bean") ? el : el.querySelector("svg.bean"));
    if (!svg) return;
    const m = mood === "vet" ? "toxic" : mood;
    svg.setAttribute("class", "bean");
    void svg.getBoundingClientRect();
    svg.setAttribute("class", "bean " + m);
  }

  // The FurSight wordmark: the dot of the i is a pink rabbit nose. Sized by the surrounding font, so it fits any heading.
  const NOSE = `<path d="M-7 -3.5 Q0 -6.5 7 -3.5 Q7 -1.5 3 1.5 Q0 3.5 -3 1.5 Q-7 -1.5 -7 -3.5 Z" fill="#F08CBB"/>`;
  function wordmark(after = "") {
    if (!document.getElementById("fs-word-css")) {
      const s = document.createElement("style"); s.id = "fs-word-css";
      s.textContent = ".fs-word{white-space:nowrap}.fs-i{position:relative;display:inline-block}.fs-i svg{position:absolute;left:50%;top:.03em;width:.42em;height:.27em;transform:translateX(-50%);overflow:visible}";
      document.head.appendChild(s);
    }
    return `<span class="fs-word" aria-label="FurSight${after}">FurS<span class="fs-i">ı<svg viewBox="-8 -7 16 11" aria-hidden="true">${NOSE}</svg></span>ght${after}</span>`;
  }

  window.bean = bean; window.setBean = setBean; window.wordmark = wordmark;
})();
