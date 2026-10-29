// Pet cam video over WebRTC, set up through the relay socket the JPEGs already use.
//
// The watcher makes the offer; the webcam page answers with its canvas (already cropped to the shared zoom), so
// the video goes straight between them instead of one picture at a time through the relay. Anything that goes
// wrong (no WebRTC, a network that blocks it, the camera page restarting) drops back to JPEGs on the same socket,
// and the watcher tries video again a little later.
//
//   const v = FSRtc.watch({ ws, relay, channel, video, onLive })   then v.message(m) for each JSON message, v.stop()
//   const s = FSRtc.serve({ ws, relay, channel, canvas, fps })               then s.message(m), s.count(), s.stop()
(function (root) {
  const iceCache = {};
  const ice = (relay, channel) => (iceCache[channel] ||= fetch(`${relay}/c/${channel}/ice`).then((r) => r.json()).then((j) => j.iceServers)
    .catch(() => { delete iceCache[channel]; return [{ urls: "stun:stun.cloudflare.com:3478" }]; }));
  const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };

  function watch({ ws, relay, channel, video, onLive }) {
    if (!root.RTCPeerConnection) return null;
    let pc = null, live = false, stopped = false, retry = null, giveUp = null, wait = 15e3, ready = Promise.resolve();

    const fallback = () => {
      clearTimeout(giveUp);
      if (pc) { pc.close(); pc = null; }
      if (live) { live = false; send(ws, { rtc: "off" }); onLive(false); }
      video.srcObject = null;
      if (!stopped) { clearTimeout(retry); retry = setTimeout(start, wait); wait = Math.min(wait * 2, 120e3); }
    };

    async function start() {
      if (stopped || ws.readyState !== 1) return;
      clearTimeout(retry); if (pc) pc.close();
      const me = (pc = new RTCPeerConnection({ iceServers: await ice(relay, channel) }));
      if (stopped || pc !== me) return me.close();
      me.addTransceiver("video", { direction: "recvonly" });
      me.onicecandidate = (e) => e.candidate && pc === me && send(ws, { rtc: { candidate: e.candidate } });
      me.ontrack = (e) => { video.srcObject = e.streams[0] || new MediaStream([e.track]); video.play().catch(() => {}); };
      me.onconnectionstatechange = () => {
        if (pc !== me) return;
        if (me.connectionState === "failed" || me.connectionState === "closed") fallback();
        if (me.connectionState === "disconnected") setTimeout(() => pc === me && me.connectionState === "disconnected" && fallback(), 4000);
      };
      // live once real frames are showing, not just when the connection opens
      video.onplaying = () => {
        if (pc !== me || live) return;
        live = true; wait = 15e3; clearTimeout(giveUp);
        send(ws, { rtc: "on" }); onLive(true);
      };
      // a connection can stay "connected" while no frames arrive (the camera page asleep in the background):
      // if the picture hasn't moved for 6 s, go back to JPEGs and try video again shortly
      let at = -1, still = 0;
      const watchdog = setInterval(() => {
        if (pc !== me) return clearInterval(watchdog);
        if (!live) return;
        if (video.currentTime === at) { if ((still += 2) >= 6) { clearInterval(watchdog); wait = 5e3; fallback(); } }
        else { at = video.currentTime; still = 0; }
      }, 2000);
      await me.setLocalDescription(await me.createOffer());
      ready = Promise.resolve();
      send(ws, { rtc: { sdp: me.localDescription } });
      giveUp = setTimeout(() => pc === me && !live && fallback(), 12e3);
    }

    function message(m) {
      if (!m || !m.rtc) return false;
      if (m.rtc === "restart") { if (live) { live = false; send(ws, { rtc: "off" }); onLive(false); } wait = 15e3; setTimeout(start, 1500); return true; }
      const me = pc; if (!me) return true;
      if (m.rtc.sdp) ready = me.setRemoteDescription(m.rtc.sdp).catch(fallback);
      else if (m.rtc.candidate) ready.then(() => pc === me && me.addIceCandidate(m.rtc.candidate)).catch(() => {});
      return true;
    }

    function stop() { stopped = true; clearTimeout(retry); clearTimeout(giveUp); if (pc) pc.close(); pc = null; video.srcObject = null; }

    if (ws.readyState === 1) start(); else ws.addEventListener("open", start, { once: true });
    return { message, stop, get live() { return live; } };
  }

  function serve({ ws, relay, channel, canvas, fps = 15 }) {
    if (!root.RTCPeerConnection || !canvas.captureStream) return null;
    const peers = new Map();
    let stream = null;
    const drop = (id) => { const p = peers.get(id); if (p) { p.pc.close(); peers.delete(id); } };

    function message(m) {
      if (!m || !m.from || !m.rtc) return false;
      if (m.rtc === "bye") { drop(m.from); return true; }
      if (m.rtc.sdp && m.rtc.sdp.type === "offer") {
        drop(m.from);
        const id = m.from, p = { pc: null, ready: null };
        peers.set(id, p);
        p.ready = (async () => {
          const pc = (p.pc = new RTCPeerConnection({ iceServers: await ice(relay, channel) }));
          stream ||= canvas.captureStream(fps);
          const sender = pc.addTrack(stream.getVideoTracks()[0], stream);
          pc.onicecandidate = (e) => e.candidate && send(ws, { to: id, rtc: { candidate: e.candidate } });
          pc.onconnectionstatechange = () => { if (["failed", "closed"].includes(pc.connectionState) && peers.get(id) === p) drop(id); };
          await pc.setRemoteDescription(m.rtc.sdp);
          await pc.setLocalDescription(await pc.createAnswer());
          send(ws, { to: id, rtc: { sdp: pc.localDescription } });
          // keep it inside a slow home uplink: 480 px square looks fine at this rate
          try { const prm = sender.getParameters(); prm.encodings = prm.encodings?.length ? prm.encodings : [{}]; prm.encodings[0].maxBitrate = 600e3; prm.encodings[0].maxFramerate = fps; await sender.setParameters(prm); } catch (e) {}
        })().catch(() => drop(id));
        return true;
      }
      if (m.rtc.candidate) { const p = peers.get(m.from); p && p.ready.then(() => p.pc && p.pc.addIceCandidate(m.rtc.candidate)).catch(() => {}); }
      return true;
    }

    const count = () => [...peers.values()].filter((p) => p.pc && p.pc.connectionState === "connected").length;
    function stop() { for (const id of [...peers.keys()]) drop(id); if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; }
    return { message, count, stop };
  }

  root.FSRtc = { watch, serve };
})(typeof window !== "undefined" ? window : globalThis);
