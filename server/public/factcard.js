// The week's card: a fact card, not just a picture. His sticker big at the top (the latest cut-out of him from the
// week: a flop moment or something Ask saw), the week's headline from Muse Spark, four numbers from what FurSight
// logged (weight, flops, loafing, the litter tray or the care streak), and the highlights. Drawn on a canvas so it
// can be saved, shared and kept in the diary. Used by the web app; Wrapped shows the same card at the end.
//
//   await FSFactCard.make({ pet, entries, recap: { title, highlights, streak }, img })  -> { png, layout }
//     img(path) turns a hub path into a URL the canvas can load (with the device key)
//   FSFactCard.html(layout, img) -> the same card, live: stickers sway, numbers count up, highlights rise.
//     The PNG is for sharing and keeping; the app shows this. layout is small enough to keep on the diary entry.
(function (root) {
  const W = 1080, H = 1350;
  const load = (src) => new Promise((ok, bad) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => ok(i); i.onerror = bad; i.src = src; });

  function wrap(g, text, maxW) {
    const words = String(text || "").split(/\s+/), lines = [];
    let line = "";
    for (const w of words) { const t = line ? line + " " + w : w; if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line);
    return lines;
  }
  function rounded(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  // the numbers worth a tile, best first
  function facts(entries, recap) {
    const a = root.FSActivity.summary(entries), tray = root.FSTray.summary(entries), out = [];
    const ws = tray.week.filter((d) => d.weight_g);
    if (ws.length) {
      const last = ws[ws.length - 1].weight_g, change = ws.length > 1 ? last - ws[0].weight_g : 0;
      out.push({ big: (last / 1000).toFixed(2) + " kg", label: ws.length > 1 ? (Math.abs(change) <= 20 ? "weight, steady" : `weight, ${change > 0 ? "+" : ""}${change} g`) : "weight" });
    }
    if (a.has) out.push({ big: String(a.week.flops), label: a.week.flops === 1 ? "flop" : "flops" });
    if (a.has && a.week.loaf > 0) out.push({ big: root.FSActivity.time(a.week.loaf), label: "loafing" });
    if (recap.streak) out.push({ big: String(recap.streak), label: recap.streak === 1 ? "day of full care" : "days of full care" });
    const visits = tray.week.filter((d) => d.visits).map((d) => d.visits);
    if (visits.length) out.push({ big: (visits.reduce((x, y) => x + y, 0) / visits.length).toFixed(0), label: "tray visits a day" });
    if (a.has && a.week.active > 0) out.push({ big: root.FSActivity.time(a.week.active), label: "on the move" });
    return { tiles: out.slice(0, 4), simulated: tray.simulated || a.simulated };
  }

  async function make({ pet, entries, recap, img }) {
    if (document.fonts) await Promise.all([document.fonts.load("900 64px Nunito"), document.fonts.load("800 30px Nunito")]).catch(() => {});
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d");
    const since = Date.now() - 7 * 864e5, week = entries.filter((e) => e.at >= since);

    // grape, with two soft blobs
    g.fillStyle = "#9B6CF0"; g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(255,255,255,0.10)"; g.beginPath(); g.arc(W - 90, 160, 260, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(80, 620, 200, 0, Math.PI * 2); g.fill();

    // heading
    const from = new Date(since).toLocaleDateString(undefined, { day: "numeric", month: "short" }), to = new Date().toLocaleDateString(undefined, { day: "numeric", month: "short" });
    g.fillStyle = "#FFFFFF"; g.textBaseline = "alphabetic";
    g.font = "900 46px Nunito, sans-serif"; g.fillText(`${pet.name}'s week`.toUpperCase(), 70, 110);
    const nicks = String(pet.nicknames || "").split(/[,;\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 3);
    const sub = `${from} to ${to}${nicks.length ? "  ·  aka " + nicks.join(", ") : ""}`;
    g.font = "800 32px Nunito, sans-serif"; g.globalAlpha = 0.85; g.fillText(`${from} to ${to}${nicks.length ? "  ·  aka " + nicks.join(", ") : ""}`, 70, 156); g.globalAlpha = 1;

    // his stickers: the week's three latest cut-outs, the newest big in the middle, two smaller and tilted behind;
    // with none, his photo in a circle
    const sts = week.filter((e) => e.has_image && e.kind !== "recap" && (e.png || (e.extra && e.extra.sticker))).slice(0, 3);
    const top = 190, box = 470;
    const place = (im, cx, cy, size, deg) => {
      const s = Math.min(size / im.width, size / im.height), w = im.width * s, h = im.height * s;
      g.save(); g.translate(cx, cy); g.rotate((deg * Math.PI) / 180);
      g.shadowColor = "rgba(30,20,60,0.35)"; g.shadowBlur = 30; g.shadowOffsetY = 14;
      g.drawImage(im, -w / 2, -h / 2, w, h); g.restore();
    };
    try {
      if (sts.length) {
        const ims = await Promise.all(sts.map((e) => load(img(`/diary/${e.id}/image`)).catch(() => null)));
        if (ims[1]) place(ims[1], 230, top + 300, 290, -11);
        if (ims[2]) place(ims[2], W - 230, top + 290, 290, 10);
        if (ims[0]) place(ims[0], W / 2, top + box / 2, sts.length > 1 ? 420 : box, -2);
      } else if (pet.has_photo) {
        const im = await load(img(`/pets/${pet.id}/photo`)), r = 210, cx = W / 2, cy = top + box / 2, s = Math.max((r * 2) / im.width, (r * 2) / im.height);
        g.fillStyle = "#FFFFFF"; g.beginPath(); g.arc(cx, cy, r + 14, 0, Math.PI * 2); g.fill();
        g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip(); g.drawImage(im, cx - (im.width * s) / 2, cy - (im.height * s) / 2, im.width * s, im.height * s); g.restore();
      }
    } catch (e) { /* no picture: the facts still stand */ }

    // the white card
    const cy = 690, ch = H - cy - 50;
    g.fillStyle = "#7A4ED1"; rounded(g, 50, cy + 12, W - 100, ch, 48); g.fill();
    g.fillStyle = "#FFFFFF"; rounded(g, 50, cy, W - 100, ch, 48); g.fill();
    g.fillStyle = "#2B2A33"; g.font = "900 58px Nunito, sans-serif";
    let y = cy + 92;
    for (const line of wrap(g, recap.title || `${pet.name}'s week`, W - 200).slice(0, 2)) { g.fillText(line, 100, y); y += 66; }

    // four tiles
    const { tiles, simulated } = facts(entries, recap);
    const layout = { name: pet.name, sub, title: recap.title || `${pet.name}'s week`, tiles, highlights: (recap.highlights || []).slice(0, 3), stickers: sts.map((e) => e.id), photo: !sts.length && pet.has_photo ? pet.id : null, simulated };
    const tw = (W - 200 - 24) / 2, th = 118;
    y += 6;
    tiles.forEach((t, i) => {
      const x = 100 + (i % 2) * (tw + 24), ty = y + Math.floor(i / 2) * (th + 20);
      g.fillStyle = "#F3EEFF"; rounded(g, x, ty, tw, th, 28); g.fill();
      g.fillStyle = "#2B2A33"; g.font = "900 52px Nunito, sans-serif"; g.fillText(t.big, x + 28, ty + 62);
      g.fillStyle = "#6B6977"; g.font = "800 27px Nunito, sans-serif"; g.fillText(t.label, x + 28, ty + 100);
    });
    y += Math.ceil(tiles.length / 2) * (th + 20) + 26;

    // highlights
    g.font = "800 30px Nunito, sans-serif";
    for (const h of (recap.highlights || []).slice(0, 3)) {
      if (y > cy + ch - 90) break;
      g.fillStyle = "#3DBE6B"; g.beginPath(); g.arc(112, y - 10, 9, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#2B2A33"; g.fillText(wrap(g, h, W - 260)[0], 138, y);
      y += 46;
    }

    // footer
    g.fillStyle = "#6B6977"; g.font = "800 24px Nunito, sans-serif";
    g.fillText(`FurSight · it notices, your vet decides${simulated ? " · includes simulated data" : ""}`, 100, cy + ch - 40);
    return { png: c.toDataURL("image/png"), layout };
  }

  // ---------------------------------------------------------------- the live card (same layout, in HTML)

  let styled = false;
  function style() {
    if (styled) return; styled = true;
    const s = document.createElement("style");
    s.textContent = `
      .fc { position: relative; width: 100%; aspect-ratio: 1080 / 1350; overflow: hidden; border-radius: 22px; }
      .fc .in { position: absolute; left: 0; top: 0; width: 1080px; height: 1350px; transform-origin: 0 0; background: #9B6CF0; font-family: Nunito, sans-serif; color: #fff; }
      .fc .blob { position: absolute; border-radius: 50%; background: rgba(255,255,255,.10); }
      .fc h4 { position: absolute; left: 70px; top: 62px; margin: 0; font: 900 46px Nunito, sans-serif; letter-spacing: .01em; text-transform: uppercase; }
      .fc .sub { position: absolute; left: 70px; top: 122px; font: 800 32px Nunito, sans-serif; opacity: .85; }
      .fc .st { position: absolute; transform: translate(-50%, -50%) rotate(var(--r)); filter: drop-shadow(0 14px 18px rgba(30,20,60,.35)); animation: fcPop .7s cubic-bezier(.3,1.6,.5,1) var(--d) both, fcSway 3.6s ease-in-out calc(var(--d) + .7s) infinite alternate; }
      .fc .st.photo { border-radius: 50%; border: 14px solid #fff; object-fit: cover; }
      @keyframes fcPop { from { opacity: 0; transform: translate(-50%, -40%) rotate(var(--r)) scale(.5); } }
      @keyframes fcSway { from { transform: translate(-50%, -50%) rotate(calc(var(--r) - 4deg)); } to { transform: translate(-50%, -54%) rotate(calc(var(--r) + 4deg)); } }
      .fc .card { position: absolute; left: 50px; top: 690px; width: 980px; height: 610px; background: #fff; border-radius: 48px; box-shadow: 0 12px 0 #7A4ED1; padding: 40px 50px; box-sizing: border-box; color: #2B2A33; }
      .fc .card h5 { margin: 0 0 18px; font: 900 58px/1.12 Nunito, sans-serif; }
      .fc .tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 20px 24px; }
      .fc .tile { background: #F3EEFF; border-radius: 28px; height: 118px; padding: 14px 28px; box-sizing: border-box; animation: fcRise .6s cubic-bezier(.2,.9,.3,1) var(--d) both; }
      .fc .tile b { display: block; font: 900 52px/1.05 Nunito, sans-serif; font-variant-numeric: tabular-nums; } .fc .tile span { font: 800 27px Nunito, sans-serif; color: #6B6977; }
      .fc .hl { margin-top: 22px; display: grid; gap: 10px; }
      .fc .hl div { font: 800 30px Nunito, sans-serif; display: flex; gap: 16px; align-items: center; animation: fcRise .6s cubic-bezier(.2,.9,.3,1) var(--d) both; white-space: nowrap; overflow: hidden; }
      .fc .hl div:before { content: ""; width: 18px; height: 18px; border-radius: 50%; background: #3DBE6B; flex: none; }
      .fc .foot { position: absolute; left: 50px; bottom: 34px; font: 800 24px Nunito, sans-serif; color: #6B6977; }
      @keyframes fcRise { from { opacity: 0; transform: translateY(24px); } }
      @media (prefers-reduced-motion: reduce) { .fc .st, .fc .tile, .fc .hl div { animation: none; } }`;
    document.head.appendChild(s);
  }
  const escH = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // the card as a live element, scaled to whatever width it's given; numbers count up when it's shown
  function html(layout, img) {
    style();
    const id = "fc" + Math.random().toString(36).slice(2, 8), L = layout;
    const spots = [[540, 425, 420, -2, 0.15], [230, 490, 290, -11, 0.35], [850, 480, 290, 10, 0.5]];
    const sts = (L.stickers || []).slice(0, 3).map((sid, i) => {
      const [x, y, size, deg, d] = L.stickers.length === 1 ? [540, 425, 470, -2, 0.15] : spots[i];
      return `<img class="st" src="${img(`/diary/${sid}/image`)}" alt="" style="left:${x}px;top:${y}px;max-width:${size}px;max-height:${size}px;--r:${deg}deg;--d:${d}s">`;
    }).reverse().join("");   // the big one last, so it sits on top
    const photo = !sts && L.photo ? `<img class="st photo" src="${img(`/pets/${L.photo}/photo`)}" alt="" style="left:540px;top:425px;width:420px;height:420px;--r:0deg;--d:.15s">` : "";
    const el = `<div class="fc" id="${id}"><div class="in">
      <div class="blob" style="width:520px;height:520px;right:-170px;top:-100px"></div><div class="blob" style="width:400px;height:400px;left:-120px;top:420px"></div>
      <h4>${escH(L.name)}'s week</h4><div class="sub">${escH(L.sub)}</div>${sts}${photo}
      <div class="card"><h5>${escH(L.title)}</h5>
        <div class="tiles">${(L.tiles || []).map((t, i) => `<div class="tile" style="--d:${0.5 + i * 0.12}s"><b data-to="${escH(t.big)}">${escH(t.big)}</b><span>${escH(t.label)}</span></div>`).join("")}</div>
        <div class="hl">${(L.highlights || []).slice(0, 2).map((h, i) => `<div style="--d:${1 + i * 0.15}s">${escH(h)}</div>`).join("")}</div>
        <div class="foot">FurSight · it notices, your vet decides${L.simulated ? " · includes simulated data" : ""}</div></div></div></div>`;
    // once it's on the page: fit the 1080 px card to its box, and play it
    setTimeout(() => { const box = document.getElementById(id); if (box) { const inner = box.firstElementChild, fit = () => { inner.style.transform = `scale(${box.clientWidth / 1080})`; }; fit(); if (window.ResizeObserver) new ResizeObserver(fit).observe(box); play(box); } }, 0);
    return el;
  }

  // (re)play a live card: the entrances again, and the plain numbers count up (Wrapped calls this per slide)
  function play(box) {
    for (const el of box.querySelectorAll(".st, .tile, .hl div")) { el.style.animation = "none"; void el.offsetWidth; el.style.animation = ""; }
    for (const b of box.querySelectorAll("[data-to]")) {
      const m = /^(\d+)(\.\d+)?(.*)$/.exec(b.dataset.to); if (!m) continue;
      const end = Number(m[1] + (m[2] || "")), dp = m[2] ? m[2].length - 1 : 0, rest = m[3], t0 = performance.now() + 500;
      (function tick(t) { const k = Math.max(0, Math.min(1, (t - t0) / 1000)), v = end * (1 - Math.pow(1 - k, 3)); b.textContent = v.toFixed(dp) + rest; if (k < 1) requestAnimationFrame(tick); })(t0);
    }
  }

  root.FSFactCard = { make, html, play, facts };
})(window);
