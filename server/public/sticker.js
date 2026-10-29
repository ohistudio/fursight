// Turn a photo of him into a die-cut sticker: SAM outlines him (/api/sticker), then the canvas cuts him out and
// draws a thick white border and a soft shadow around the outline. Returns a transparent PNG data URL, or null
// if he isn't found. Used for flop moments (diary, Today, notifications).
//
//   await makeSticker(photoDataUrl, (path, body) => api(path, body))
(function (root) {
  const load = (src) => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src; });
  const canvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; };

  async function makeSticker(photo, api, maxSide = 640) {
    const { mask: m } = await api("/api/sticker", { image: photo });
    if (!m) return null;
    const img = await load(photo), W = img.naturalWidth, H = img.naturalHeight;

    // his silhouette, full size: the mask's bytes become alpha, placed where SAM found him
    const [sil, sg] = canvas(W, H), bits = Uint8Array.from(atob(m.bits), (c) => c.charCodeAt(0));
    const [mc, mg] = canvas(m.w, m.h), id = mg.createImageData(m.w, m.h);
    for (let i = 0; i < m.w * m.h; i++) { id.data[i * 4 + 3] = bits[i] ? 255 : 0; }
    mg.putImageData(id, 0, 0);
    sg.filter = "blur(1px)";   // soften the stair-steps of the mask
    sg.drawImage(mc, m.x * (W / m.image.w), m.y * (H / m.image.h), m.w * (W / m.image.w), m.h * (H / m.image.h));

    // him, cut out
    const [cut, cg] = canvas(W, H);
    cg.drawImage(img, 0, 0); cg.globalCompositeOperation = "destination-in"; cg.drawImage(sil, 0, 0);

    // the white edge: the silhouette in white, stamped in a ring around itself
    const size = Math.max(m.w * (W / m.image.w), m.h * (H / m.image.h)), bw = Math.max(6, size * 0.045);
    const [white, wg] = canvas(W, H);
    wg.drawImage(sil, 0, 0); wg.globalCompositeOperation = "source-in"; wg.fillStyle = "#fff"; wg.fillRect(0, 0, W, H);
    const pad = Math.ceil(bw * 3.4),   // room for the white edge, the shadow's blur and its drop, so nothing is clipped
 bx = m.x * (W / m.image.w) - pad, by = m.y * (H / m.image.h) - pad;
    const ow = m.w * (W / m.image.w) + pad * 2, oh = m.h * (H / m.image.h) + pad * 2;
    const [out, og] = canvas(Math.ceil(ow), Math.ceil(oh));
    const [ring, rg] = canvas(out.width, out.height);
    for (const r of [bw, bw * 0.66, bw * 0.33]) for (let a = 0; a < 360; a += 15) {
      rg.drawImage(white, -bx + Math.cos(a * Math.PI / 180) * r, -by + Math.sin(a * Math.PI / 180) * r);
    }
    og.shadowColor = "rgba(43,42,51,0.28)"; og.shadowBlur = bw * 1.2; og.shadowOffsetY = bw * 0.35;
    og.drawImage(ring, 0, 0);
    og.shadowColor = "transparent";
    og.drawImage(cut, -bx, -by);

    // keep it small enough for the diary and a notification
    const s = Math.min(1, maxSide / Math.max(out.width, out.height));
    if (s >= 1) return out.toDataURL("image/png");
    const [small, smg] = canvas(Math.round(out.width * s), Math.round(out.height * s));
    smg.drawImage(out, 0, 0, small.width, small.height);
    return small.toDataURL("image/png");
  }

  root.makeSticker = makeSticker;
})(window);
