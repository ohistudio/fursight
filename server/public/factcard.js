// The week's card: a fact card, not just a picture. His sticker big at the top (the latest cut-out of him from the
// week: a flop moment or something Ask saw), the week's headline from Muse Spark, four numbers from what FurSight
// logged (weight, flops, loafing, the litter tray or the care streak), and the highlights. Drawn on a canvas so it
// can be saved, shared and kept in the diary. Used by the web app; Wrapped shows the same card at the end.
//
//   await FSFactCard.make({ pet, entries, recap: { title, highlights, streak }, img })  -> PNG data URL
//     img(path) turns a hub path into a URL the canvas can load (with the device key)
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
    g.font = "800 32px Nunito, sans-serif"; g.globalAlpha = 0.85; g.fillText(`${from} to ${to}${nicks.length ? "  ·  aka " + nicks.join(", ") : ""}`, 70, 156); g.globalAlpha = 1;

    // his sticker: the latest cut-out from the week, else his photo in a circle
    const st = week.find((e) => e.has_image && e.kind !== "recap" && (e.png || (e.extra && e.extra.sticker)));
    const top = 190, box = 470;
    try {
      if (st) {
        const im = await load(img(`/diary/${st.id}/image`)), s = Math.min(box / im.width, box / im.height);
        g.shadowColor = "rgba(30,20,60,0.35)"; g.shadowBlur = 30; g.shadowOffsetY = 14;
        g.drawImage(im, (W - im.width * s) / 2, top + (box - im.height * s) / 2, im.width * s, im.height * s);
        g.shadowColor = "transparent";
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
    const tw = (W - 200 - 24) / 2, th = 140;
    y += 6;
    tiles.forEach((t, i) => {
      const x = 100 + (i % 2) * (tw + 24), ty = y + Math.floor(i / 2) * (th + 20);
      g.fillStyle = "#F3EEFF"; rounded(g, x, ty, tw, th, 28); g.fill();
      g.fillStyle = "#2B2A33"; g.font = "900 56px Nunito, sans-serif"; g.fillText(t.big, x + 28, ty + 72);
      g.fillStyle = "#6B6977"; g.font = "800 28px Nunito, sans-serif"; g.fillText(t.label, x + 28, ty + 114);
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
    return c.toDataURL("image/png");
  }

  root.FSFactCard = { make, facts };
})(window);
