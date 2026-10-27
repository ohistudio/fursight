// FurSight pet cam relay. One Durable Object per channel holds the latest JPEG and fans it out.
//
//   GET /                     the webcam page (run it on the computer by the enclosure)
//   GET /g/<channel>          the Ray-Ban Display page (600x600)
//   WS  /c/<channel>/send?k=  webcam page -> binary JPEG frames; gets {viewers:n} back
//   WS  /c/<channel>/watch    glasses page <- binary JPEG frames
//   GET /c/<channel>/frame.jpg  latest frame, for a browser that can't hold a socket
//
// A channel id is 16 random characters and is the only way to see the camera, so it's never listed.
// The first webcam page to send on a channel claims it with its key; nobody else can send there.
// The webcam page only sends while someone is watching, so an idle camera costs nothing.
import { handleHub, Household, Links } from "./hub.js";
export { Household, Links };
import CAM from "./cam.html";
import GLASSES from "./glasses.html";

const ID = /^[A-Za-z0-9]{16}$/;

// Ray-Ban Display reads the app's name and icon from <launch dir>/.well-known/meta-wearables-manifest.json;
// the glasses page launches from /g/<channel>, so its directory is /g/
const MANIFEST = JSON.stringify({
  version: 1,
  name: "FurSight Cam",
  description: "Live view of your pet's enclosure from the FurSight webcam.",
  appearance: { theme_color: "#3FA36B", icon: { src: "../icon.png", type: "monochrome" } },
});
const ICON = Uint8Array.from(atob("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"), (c) => c.charCodeAt(0));
const html = (s) => new Response(s, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/hub/")) return handleHub(req, env, url);
    if (url.pathname === "/") return html(CAM);
    if (url.pathname === "/g/.well-known/meta-wearables-manifest.json") return new Response(MANIFEST, { headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" } });
    if (url.pathname === "/g/icon.png") return new Response(ICON, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400", "access-control-allow-origin": "*" } });
    let m = url.pathname.match(/^\/g\/([A-Za-z0-9]{16})$/);
    if (m) return html(GLASSES);
    m = url.pathname.match(/^\/c\/([A-Za-z0-9]{16})\/(send|watch|frame\.jpg)$/);
    if (!m || !ID.test(m[1])) return new Response("not found", { status: 404 });
    return env.CHANNELS.get(env.CHANNELS.idFromName(m[1])).fetch(req);
  },
};

const POLL_SEEN = 3000; // a polling viewer counts as watching for this long after its last fetch

export class Channel {
  constructor(ctx) {
    this.ctx = ctx;
    this.frame = null;   // latest JPEG (ArrayBuffer)
    this.at = 0;         // when it arrived
    this.pollers = new Map();
  }

  sockets(tag) { return this.ctx.getWebSockets(tag); }

  // a socket that is closing still shows up in getWebSockets, so the one going away is left out by hand
  viewers(leaving = null) {
    const now = Date.now();
    for (const [k, t] of this.pollers) if (now - t > POLL_SEEN) this.pollers.delete(k);
    return this.sockets("watch").filter((ws) => ws !== leaving).length + this.pollers.size;
  }

  tellSender(leaving = null) {
    const msg = JSON.stringify({ viewers: this.viewers(leaving) });
    for (const ws of this.sockets("send")) { try { ws.send(msg); } catch (e) {} }
  }

  async fetch(req) {
    const url = new URL(req.url);
    const what = url.pathname.split("/")[3];

    if (what === "frame.jpg") {
      const who = url.searchParams.get("v") || "anon";
      const isNew = !this.pollers.has(who);
      this.pollers.set(who, Date.now());
      if (isNew) { this.tellSender(); this.ctx.storage.setAlarm(Date.now() + POLL_SEEN + 500); }
      if (!this.frame) return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
      return new Response(this.frame, { headers: { "content-type": "image/jpeg", "cache-control": "no-store", "x-frame-age": String(Date.now() - this.at) } });
    }

    if (req.headers.get("Upgrade") !== "websocket") return new Response("expected a websocket", { status: 426 });
    if (what === "send") {
      const key = url.searchParams.get("k") || "";
      if (key.length < 16) return new Response("key required", { status: 403 });
      const owner = await this.ctx.storage.get("key");
      if (owner && owner !== key) return new Response("this channel belongs to another camera", { status: 403 });
      if (!owner) await this.ctx.storage.put("key", key);
      for (const old of this.sockets("send")) { try { old.close(4000, "replaced"); } catch (e) {} }
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [what]);
    if (what === "watch") {
      if (this.frame) pair[1].send(this.frame);
      queueMicrotask(() => this.tellSender());
    } else {
      pair[1].send(JSON.stringify({ viewers: this.viewers() }));
    }
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async alarm() {
    this.tellSender();
    if (this.pollers.size) this.ctx.storage.setAlarm(Date.now() + POLL_SEEN + 500);
  }

  webSocketMessage(ws, data) {
    const [tag] = this.ctx.getTags(ws);
    if (data === "ping") { try { ws.send("pong"); } catch (e) {} return; }
    if (tag !== "send" || typeof data === "string" || data.byteLength > 512 * 1024) return;
    this.frame = data; this.at = Date.now();
    for (const v of this.sockets("watch")) { try { v.send(data); } catch (e) {} }
  }

  webSocketClose(ws) { this.closed(ws); }
  webSocketError(ws) { this.closed(ws); }
  closed(ws) {
    const watcher = this.ctx.getTags(ws)[0] === "watch";
    try { ws.close(1000, "bye"); } catch (e) {}
    if (watcher) this.tellSender(ws);
  }
}
