(() => {
  const socket = io();
  const peers = {};         // socketId -> RTCPeerConnection
  const audioSenders = {};  // socketId -> RTCRtpSender (audio) - swapped to a mic+screen-sound mix while presenting
  const videoSenders = {};  // socketId -> RTCRtpSender (video) - used to swap camera <-> screen
  const queues = {};        // socketId -> promise chain, keeps signalling messages in order
  const sharingPeers = new Set(); // socketIds that are currently presenting their screen
  const remoteStreams = {}; // socketId -> MediaStream (used by the recorder)
  const micMuted = {};      // socketId (or 'local') -> true when that mic is muted

  const grid = document.getElementById('grid');
  const statusEl = document.getElementById('roomStatus');
  const noticeEl = document.getElementById('mediaNotice');
  const messages = document.getElementById('messages');
  const localVideo = document.getElementById('localVideo');
  const micBtn = document.getElementById('toggleMic');
  const camBtn = document.getElementById('toggleCam');
  const shareBtn = document.getElementById('shareScreen');
  const micSelect = document.getElementById('micSelect');
  const speakerSelect = document.getElementById('speakerSelect');
  const shareAudioChk = document.getElementById('shareAudio');
  const micLevel = document.getElementById('micLevel');
  const muteAllBtn = document.getElementById('muteAll');     // host only
  const unmuteAllBtn = document.getElementById('unmuteAll'); // host only
  const banner = document.getElementById('hostBanner');
  const bannerText = document.getElementById('hostBannerText');
  const bannerActionBtn = document.getElementById('hostBannerAction');
  const bannerCloseBtn = document.getElementById('hostBannerClose');
  const isHost = window.IS_HOST === true; // UI only - the server re-checks every host command
  const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  const localStream = new MediaStream(); // what we send to other people
  let micTrack = null;
  let outAudio = null;        // audio track currently sent to everybody (mic, or mic + screen sound)
  let screenAudioTrack = null;
  let mixCtx = null;
  let meterCtx = null;
  let camTrack = null;
  let screenTrack = null;
  let hasMic = false;
  let hasCam = false;

  // ---------- UI helpers ----------
  function setNotice(text) {
    noticeEl.textContent = text || '';
    noticeEl.hidden = !text;
  }

  function addMessage(name, text) {
    const p = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = name + ' ';
    p.appendChild(strong);
    p.appendChild(document.createTextNode(text));
    messages.appendChild(p);
    messages.scrollTop = messages.scrollHeight;
  }

  function playAll() {
    document.querySelectorAll('.tile video').forEach((v) => { v.play().catch(() => {}); });
    if (meterCtx && meterCtx.state === 'suspended') meterCtx.resume().catch(() => {});
  }

  function tryPlay(video) {
    video.play().catch(() => {
      // Browser blocks sound until the user interacts with the page
      showBanner('Your browser blocked sound. Click to turn on audio.', { label: 'Enable sound', onClick: playAll });
    });
  }
  document.addEventListener('click', playAll);

  function markSharing(id, on) {
    const tile = document.getElementById('tile-' + id);
    if (tile) tile.classList.toggle('sharing', on);
  }

  // ---------- Banner (host messages) ----------
  let bannerAction = null;
  let bannerTimer = null;

  function showBanner(text, action) {
    clearTimeout(bannerTimer);
    bannerText.textContent = text;
    bannerAction = action || null;
    bannerActionBtn.hidden = !action;
    if (action) bannerActionBtn.textContent = action.label;
    banner.hidden = false;
    if (!action) bannerTimer = setTimeout(() => { banner.hidden = true; }, 5000);
  }

  bannerActionBtn.addEventListener('click', () => {
    if (bannerAction) bannerAction.onClick();
    banner.hidden = true;
  });
  bannerCloseBtn.addEventListener('click', () => { banner.hidden = true; });

  // ---------- Full screen ----------
  function toggleFullscreen(tile) {
    const current = document.fullscreenElement || document.webkitFullscreenElement;
    if (current) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else if (tile.requestFullscreen || tile.webkitRequestFullscreen) {
      (tile.requestFullscreen || tile.webkitRequestFullscreen).call(tile);
    } else {
      // iPhone Safari can only fullscreen the <video> element itself
      const v = tile.querySelector('video');
      if (v && v.webkitEnterFullscreen) v.webkitEnterFullscreen();
    }
  }

  function updateFsLabels() {
    const current = document.fullscreenElement || document.webkitFullscreenElement;
    document.querySelectorAll('.tile').forEach((t) => {
      const b = t.querySelector('.fs-btn');
      if (b) b.textContent = t === current ? 'Exit full screen' : 'Full screen';
    });
  }
  document.addEventListener('fullscreenchange', updateFsLabels);
  document.addEventListener('webkitfullscreenchange', updateFsLabels);

  // ---------- Tiles ----------
  function refreshTile(id) {
    const tile = document.getElementById('tile-' + id);
    if (!tile) return;
    const muted = !!micMuted[id];
    tile.classList.toggle('muted', muted);
    const b = tile.querySelector('.mute-btn');
    if (b) b.textContent = muted ? 'Unmute' : 'Mute';
  }

  function buildActions(tile, id) {
    const actions = document.createElement('div');
    actions.className = 'tile-actions';
    actions.addEventListener('dblclick', (e) => e.stopPropagation());

    if (isHost && id !== 'local') {
      const muteBtn = document.createElement('button');
      muteBtn.type = 'button';
      muteBtn.className = 'tile-btn mute-btn';
      muteBtn.textContent = 'Mute';
      muteBtn.title = 'Mute this person, or ask them to unmute';
      muteBtn.addEventListener('click', () => {
        const unmuting = !!micMuted[id];
        socket.emit('host-mute', { to: id, muted: !unmuting });
        if (unmuting) showBanner('Unmute request sent.');
      });
      actions.appendChild(muteBtn);
    }

    const fsBtn = document.createElement('button');
    fsBtn.type = 'button';
    fsBtn.className = 'tile-btn fs-btn';
    fsBtn.textContent = 'Full screen';
    fsBtn.addEventListener('click', () => toggleFullscreen(tile));
    actions.appendChild(fsBtn);

    tile.appendChild(actions);
    tile.addEventListener('dblclick', () => toggleFullscreen(tile));
  }

  function addTile(id, name, stream, host) {
    let tile = document.getElementById('tile-' + id);
    if (!tile) {
      tile = document.createElement('div');
      tile.className = 'tile';
      tile.id = 'tile-' + id;
      tile.innerHTML = '<video autoplay playsinline></video><span></span>';
      tile.querySelector('span').textContent = name + (host ? ' (Host)' : '');
      grid.appendChild(tile);
      buildActions(tile, id);
      if (sharingPeers.has(id)) tile.classList.add('sharing');
      refreshTile(id);
    }
    const video = tile.querySelector('video');
    if (stream && video.srcObject !== stream) {
      video.srcObject = stream;
      applySink(video);
      tryPlay(video);
    }
  }

  function showLocalPreview() {
    localVideo.srcObject = new MediaStream([screenTrack || camTrack].filter(Boolean));
  }

  // ---------- Camera / mic ----------
  function explain(err, what) {
    switch (err && err.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return `Access to the ${what} is blocked. Click the lock icon in the address bar, allow it, then reload the page.`;
      case 'NotFoundError':
      case 'OverconstrainedError':
        return `No ${what} was found on this device.`;
      case 'NotReadableError':
      case 'AbortError':
        return `The ${what} is being used by another app or browser (Zoom, Teams, another tab...). Close it and reload.`;
      default:
        return `Could not start the ${what} (${(err && err.name) || 'unknown error'}).`;
    }
  }

  // Placeholder tracks let the connection still work (and let us receive + screen share)
  // when the user has no camera / no mic / denied permission.
  function makePlaceholderVideo() {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    let flip = false;
    const draw = () => {
      ctx.fillStyle = '#0d1426';
      ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = '#cfd8e6';
      ctx.font = '600 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Camera off', 320, 240);
      // tiny change so browsers keep sending frames for a static canvas
      ctx.fillStyle = flip ? '#0d1426' : '#0d1427';
      ctx.fillRect(0, 0, 2, 2);
      flip = !flip;
    };
    draw();
    setInterval(draw, 1000);
    return canvas.captureStream(5).getVideoTracks()[0];
  }

  function makeSilentAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    return new AC().createMediaStreamDestination().stream.getAudioTracks()[0];
  }

  // ---------- Remembered choices + speaker (sound output) ----------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ }
    }
  };
  const canPickSpeaker = 'setSinkId' in HTMLMediaElement.prototype;
  let sinkId = store.get('speakerId') || ''; // '' = system default output

  // The chosen output is pinned on every video/audio element, so changing the
  // microphone (or plugging in a headset) no longer moves the sound somewhere else.
  function applySink(video) {
    if (!canPickSpeaker) return;
    video.setSinkId(sinkId).catch(() => {
      // saved device is gone -> fall back to the system default
      if (sinkId) { sinkId = ''; store.set('speakerId', ''); video.setSinkId('').catch(() => {}); }
    });
  }

  function applySinkAll() {
    document.querySelectorAll('.tile video').forEach(applySink);
  }

  async function listSpeakers() {
    if (!canPickSpeaker) return;
    try {
      const outs = (await navigator.mediaDevices.enumerateDevices())
        .filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications');
      speakerSelect.innerHTML = '';
      const def = document.createElement('option');
      def.value = '';
      def.textContent = 'System default sound';
      speakerSelect.appendChild(def);
      outs.forEach((d, i) => {
        const o = document.createElement('option');
        o.value = d.deviceId;
        o.textContent = d.label || 'Speaker ' + (i + 1);
        speakerSelect.appendChild(o);
      });
      speakerSelect.value = outs.some((d) => d.deviceId === sinkId) ? sinkId : '';
      if (speakerSelect.value !== sinkId) sinkId = speakerSelect.value;
      speakerSelect.hidden = outs.length < 1;
    } catch (e) { speakerSelect.hidden = true; }
  }

  speakerSelect.addEventListener('change', () => {
    sinkId = speakerSelect.value;
    store.set('speakerId', sinkId);
    applySinkAll();
  });

  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', () => {
      if (hasMic) listMics();
      listSpeakers().then(applySinkAll);
    });
  }

  shareAudioChk.checked = store.get('shareAudio') !== '0';
  shareAudioChk.addEventListener('change', () => store.set('shareAudio', shareAudioChk.checked ? '1' : '0'));

  const AUDIO_CONSTRAINTS = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

  async function initMedia() {
    const notices = [];
    const md = navigator.mediaDevices;

    if (!md || !md.getUserMedia) {
      notices.push(
        window.isSecureContext === false
          ? `Camera/mic are blocked by the browser on ${location.origin} (plain HTTP). Open http://localhost:${location.port || 3000} on the computer that runs the server.`
          : 'This browser does not support camera/mic access.'
      );
    } else {
      let combinedErr = null;
      try {
        const savedMic = store.get('micId');
        const stream = await md.getUserMedia({
          video: true,
          audio: savedMic ? { ...AUDIO_CONSTRAINTS, deviceId: { ideal: savedMic } } : AUDIO_CONSTRAINTS
        });
        camTrack = stream.getVideoTracks()[0] || null;
        micTrack = stream.getAudioTracks()[0] || null;
      } catch (err) {
        combinedErr = err;
      }

      if (combinedErr) {
        const denied = ['NotAllowedError', 'SecurityError'].includes(combinedErr.name);
        if (denied) {
          notices.push(explain(combinedErr, 'camera/microphone'));
        } else {
          // One device may be missing or busy - try each one separately
          for (const [kind, what] of [['video', 'camera'], ['audio', 'microphone']]) {
            try {
              const s = await md.getUserMedia({ [kind]: kind === 'audio' ? AUDIO_CONSTRAINTS : true });
              if (kind === 'video') camTrack = s.getVideoTracks()[0] || null;
              else micTrack = s.getAudioTracks()[0] || null;
            } catch (err) {
              notices.push(explain(err, what));
            }
          }
        }
      }
    }

    hasCam = !!camTrack;
    hasMic = !!micTrack;
    if (!hasCam) camTrack = makePlaceholderVideo();
    if (!hasMic) micTrack = makeSilentAudio();

    if (micTrack) localStream.addTrack(micTrack);
    localStream.addTrack(camTrack);

    if (!hasCam) { camBtn.disabled = true; camBtn.textContent = 'No camera'; }
    if (!hasMic) { micBtn.disabled = true; micBtn.textContent = 'No microphone'; }
    outAudio = micTrack;
    setNotice(notices.join(' '));
    showLocalPreview();
    if (hasMic) { startMeter(); listMics(); }
    else micSelect.hidden = true;
    listSpeakers().then(applySinkAll);
  }

  // ---------- Microphone picker + level meter ----------
  async function listMics() {
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
      const current = micTrack.getSettings().deviceId;
      micSelect.innerHTML = '';
      devices.forEach((d, i) => {
        const o = document.createElement('option');
        o.value = d.deviceId;
        o.textContent = d.label || 'Microphone ' + (i + 1);
        if (d.deviceId === current) o.selected = true;
        micSelect.appendChild(o);
      });
      micSelect.hidden = devices.length < 2;
    } catch (e) { micSelect.hidden = true; }
  }

  function startMeter() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !micTrack) return;
    if (meterCtx) meterCtx.close().catch(() => {});
    meterCtx = new AC();
    meterCtx.resume().catch(() => {});
    const analyser = meterCtx.createAnalyser();
    analyser.fftSize = 512;
    meterCtx.createMediaStreamSource(new MediaStream([micTrack])).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const ctx = meterCtx;
    (function loop() {
      if (ctx !== meterCtx) return;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
      micLevel.style.width = Math.min(100, Math.sqrt(sum / data.length) * 400) + '%';
      requestAnimationFrame(loop);
    })();
  }

  micSelect.addEventListener('change', async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { ...AUDIO_CONSTRAINTS, deviceId: { exact: micSelect.value } }
      });
      const next = s.getAudioTracks()[0];
      next.enabled = hasMic ? micTrack.enabled : true;
      if (micTrack) { localStream.removeTrack(micTrack); micTrack.stop(); }
      micTrack = next;
      localStream.addTrack(micTrack);
      hasMic = true;
      store.set('micId', micSelect.value);
      micBtn.disabled = false;
      setMicLabel();
      if (screenAudioTrack) startMix(screenAudioTrack); else outAudio = micTrack;
      await swapAudio(outAudio);
      syncRecAudio();
      startMeter();
      applySinkAll(); // keep the sound on the chosen speaker
      listSpeakers();
      setNotice('');
    } catch (err) {
      setNotice(explain(err, 'microphone'));
    }
  });

  // ---------- Peer connections ----------
  function createPeer(id, name, host) {
    const pc = new RTCPeerConnection(rtcConfig);
    peers[id] = pc;
    if (outAudio || micTrack) audioSenders[id] = pc.addTrack(outAudio || micTrack, localStream);
    videoSenders[id] = pc.addTrack(screenTrack || camTrack, localStream);
    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('signal', { to: id, data: { candidate: e.candidate } });
    };
    pc.ontrack = (e) => {
      const stream = e.streams[0] || new MediaStream([e.track]);
      remoteStreams[id] = stream;
      addTile(id, name, stream, host);
      syncRecAudio();
    };
    return pc;
  }

  async function handleSignal({ from, name, host, data }) {
    let pc = peers[from];
    if (!pc) {
      if (!data.sdp) return; // late candidate from someone who already left
      pc = createPeer(from, name, host);
      addTile(from, name, null, host);
    }
    if (data.sdp) {
      await pc.setRemoteDescription(data.sdp);
      if (data.sdp.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('signal', { to: from, data: { sdp: pc.localDescription } });
      }
    } else if (data.candidate) {
      try { await pc.addIceCandidate(data.candidate); } catch (e) { /* ignore late candidates */ }
    }
  }

  // ---------- Screen share ----------
  function updateShareUI(on) {
    shareBtn.textContent = on ? 'Stop sharing' : 'Share screen';
    shareBtn.classList.toggle('danger', on);
    shareBtn.classList.toggle('ghost', !on);
    shareAudioChk.disabled = on; // decided when sharing starts
  }

  function swapVideo(track) {
    return Promise.all(
      Object.values(videoSenders).map((s) => s.replaceTrack(track).catch((e) => console.error(e)))
    );
  }

  function swapAudio(track) {
    return Promise.all(
      Object.values(audioSenders).map((s) => s.replaceTrack(track).catch((e) => console.error(e)))
    );
  }

  // Mixes the microphone and the shared screen/tab sound into one track,
  // so people hear both the presenter and the video/audio being presented.
  function startMix(screenAudio) {
    stopMix();
    const AC = window.AudioContext || window.webkitAudioContext;
    try { mixCtx = new AC({ sampleRate: 48000 }); } catch (e) { mixCtx = new AC(); }
    mixCtx.resume().catch(() => {});
    const dest = mixCtx.createMediaStreamDestination();
    if (hasMic) mixCtx.createMediaStreamSource(new MediaStream([micTrack])).connect(dest);
    mixCtx.createMediaStreamSource(new MediaStream([screenAudio])).connect(dest);
    outAudio = dest.stream.getAudioTracks()[0];
  }

  function stopMix() {
    if (mixCtx) { mixCtx.close().catch(() => {}); mixCtx = null; }
  }

  async function startScreenShare() {
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: shareAudioChk.checked ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
        ...(shareAudioChk.checked ? { systemAudio: 'include' } : {})
      });
    } catch (err) {
      // NotAllowedError also happens when the user just closes the picker - stay quiet then
      if (err.name !== 'NotAllowedError') setNotice(`Could not start screen sharing (${err.name}).`);
      return;
    }
    screenTrack = stream.getVideoTracks()[0];
    if ('contentHint' in screenTrack) screenTrack.contentHint = 'detail'; // keep text sharp
    screenTrack.addEventListener('ended', stopScreenShare); // browser's own "Stop sharing" bar
    await swapVideo(screenTrack);

    screenAudioTrack = stream.getAudioTracks()[0] || null;
    if (screenAudioTrack) {
      startMix(screenAudioTrack);
      await swapAudio(outAudio);
      syncRecAudio();
      setNotice('');
    } else if (shareAudioChk.checked) {
      setNotice('Screen is shared, but no sound. In the share window pick "Entire screen" (Windows) or a "Tab", and tick "Also share system audio" / "Also share tab audio".');
    }

    showLocalPreview();
    updateShareUI(true);
    markSharing('local', true);
    socket.emit('screen-share', true);
  }

  async function stopScreenShare() {
    if (!screenTrack) return;
    const t = screenTrack;
    screenTrack = null;
    t.stop();
    if (screenAudioTrack) { screenAudioTrack.stop(); screenAudioTrack = null; }
    stopMix();
    outAudio = micTrack;
    await swapVideo(camTrack);
    await swapAudio(outAudio);
    syncRecAudio();
    showLocalPreview();
    updateShareUI(false);
    markSharing('local', false);
    socket.emit('screen-share', false);
  }

  shareBtn.addEventListener('click', () => (screenTrack ? stopScreenShare() : startScreenShare()));

  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    shareBtn.disabled = true;
    shareBtn.title = "Screen sharing isn't supported in this browser or on this device.";
  }

  // ---------- Socket events ----------
  socket.on('connect_error', (err) => {
    statusEl.textContent = err.message === 'unauthorized'
      ? 'Your session has expired. Please log in again.'
      : 'Could not connect to the server: ' + err.message;
  });

  socket.on('room-error', (msg) => { statusEl.textContent = msg; });

  // Existing peers: we send the offers
  socket.on('peers', async (others) => {
    statusEl.textContent = others.length ? '' : 'Waiting for others to join.';
    if (rec) socket.emit('recording-state', { on: true });
    for (const p of others) {
      try {
        const pc = createPeer(p.id, p.name, p.host);
        addTile(p.id, p.name, null, p.host);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('signal', { to: p.id, data: { sdp: pc.localDescription } });
      } catch (e) { console.error('offer error', e); }
    }
  });

  socket.on('peer-joined', (p) => {
    statusEl.textContent = '';
    addMessage('Room', p.name + ' joined.');
    if (screenTrack) socket.emit('screen-share', true); // tell the newcomer we're presenting
    if (hasMic && !micTrack.enabled) socket.emit('mic-state', { muted: true }); // ...and that we're muted
  });

  // Signals are handled one at a time per peer so ICE candidates never
  // arrive before the offer/answer they belong to has been applied.
  socket.on('signal', (msg) => {
    queues[msg.from] = (queues[msg.from] || Promise.resolve())
      .then(() => handleSignal(msg))
      .catch((e) => console.error('signal error', e));
  });

  socket.on('screen-share', ({ id, sharing }) => {
    if (sharing) sharingPeers.add(id); else sharingPeers.delete(id);
    markSharing(id, sharing);
  });

  socket.on('mic-state', ({ id, muted }) => {
    micMuted[id] = muted;
    refreshTile(id);
  });

  // The host muted us, or is asking us to unmute (we never switch the mic on by ourselves)
  socket.on('force-mute', ({ muted }) => {
    if (!hasMic) return;
    if (muted) {
      if (micTrack.enabled) {
        setMic(false);
        showBanner('The host muted your microphone.');
      }
    } else if (!micTrack.enabled) {
      showBanner('The host is asking you to unmute.', { label: 'Unmute', onClick: () => setMic(true) });
    }
  });

  socket.on('peer-left', ({ id }) => {
    if (peers[id]) { peers[id].close(); delete peers[id]; }
    delete videoSenders[id];
    delete audioSenders[id];
    delete remoteStreams[id];
    delete queues[id];
    sharingPeers.delete(id);
    delete micMuted[id];
    const tile = document.getElementById('tile-' + id);
    if (tile) tile.remove();
    syncRecAudio();
  });

  socket.on('chat', (m) => addMessage(m.name, m.message));

  // ---------- Host only: which invited candidates (guests) are in the room ----------
  const tabChat = document.getElementById('tabChat');
  const tabGuests = document.getElementById('tabGuests');
  if (isHost && tabChat && tabGuests) {
    const guestPanel = document.getElementById('guestPanel');
    const guestList = document.getElementById('guestList');
    const guestCount = document.getElementById('guestCount');
    const guestSummary = document.getElementById('guestSummary');
    const chatForm = document.getElementById('chatForm');

    function showTab(which) {
      const guests = which === 'guests';
      tabChat.classList.toggle('active', !guests);
      tabGuests.classList.toggle('active', guests);
      tabChat.setAttribute('aria-selected', String(!guests));
      tabGuests.setAttribute('aria-selected', String(guests));
      guestPanel.hidden = !guests;
      messages.hidden = guests;
      chatForm.hidden = guests;
      if (!guests) messages.scrollTop = messages.scrollHeight;
    }
    tabChat.addEventListener('click', () => showTab('chat'));
    tabGuests.addEventListener('click', () => showTab('guests'));

    socket.on('guest-list', ({ guests, count, joinedTotal }) => {
      guestCount.textContent = count;
      guestSummary.textContent = joinedTotal
        ? count + ' candidate' + (count === 1 ? '' : 's') + ' in the room now, ' + joinedTotal + ' joined so far.'
        : 'No invited candidates have joined yet.';
      guestList.textContent = '';
      guests.forEach((g) => {
        const li = document.createElement('li');
        li.textContent = g.name;
        guestList.appendChild(li);
      });
    });
  }

  document.getElementById('chatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('chatInput');
    if (input.value.trim()) socket.emit('chat', input.value);
    input.value = '';
  });

  // One place that changes the mic, so the button, the tile badge and
  // everybody else's view (via the server) always stay in sync.
  function setMicLabel() {
    micBtn.textContent = micTrack && micTrack.enabled ? 'Mute mic' : 'Unmute mic';
    micBtn.disabled = !hasMic;
  }

  function setMic(enabled) {
    if (!hasMic) return;
    micTrack.enabled = enabled;
    setMicLabel();
    micMuted.local = !enabled;
    refreshTile('local');
    socket.emit('mic-state', { muted: !enabled });
  }

  micBtn.addEventListener('click', () => { if (hasMic) setMic(!micTrack.enabled); });

  camBtn.addEventListener('click', () => {
    if (!hasCam) return;
    camTrack.enabled = !camTrack.enabled;
    camBtn.textContent = camTrack.enabled ? 'Turn camera off' : 'Turn camera on';
  });

  buildActions(document.getElementById('tile-local'), 'local');

  if (muteAllBtn) {
    muteAllBtn.addEventListener('click', () => {
      socket.emit('host-mute-all', { muted: true });
      showBanner('Everyone has been muted.');
    });
  }
  if (unmuteAllBtn) {
    unmuteAllBtn.addEventListener('click', () => {
      socket.emit('host-mute-all', { muted: false });
      showBanner('Unmute request sent to everyone.');
    });
  }

  messages.scrollTop = messages.scrollHeight;


  // ---------- Recording (host only) ----------
  // The host's browser draws every video tile onto a canvas, mixes all audio
  // (own mic, screen sound, every participant) and records that with MediaRecorder.
  // When stopped, the file is uploaded to the server (recordings/ folder) and shows up on the dashboard.
  const recordBtn = document.getElementById('recordBtn'); // host only
  const recBadge = document.getElementById('recBadge');
  const recLabel = document.getElementById('recLabel');
  let rec = null;
  let recClock = null;
  const MEETING_ID_URL = '/meetings/' + window.MEETING_ID + '/recording';

  function pickRecMime() {
    const list = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=h264,opus', 'video/webm', 'video/mp4', 'video/webm;codecs=vp9,opus'];
    return list.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  }

  function fmtClock(sec) {
    const m = Math.floor(sec / 60);
    return m + ':' + String(sec % 60).padStart(2, '0');
  }

  function setRecBadge(on, text) {
    recBadge.hidden = !on;
    if (on) recLabel.textContent = text || 'Recording';
  }

  // keep the recorder's audio mix in step with mic / screen sound / participants
  function syncRecAudio() {
    if (!rec) return;
    const wanted = {};
    if (hasMic && micTrack) wanted.mic = micTrack;
    if (screenAudioTrack) wanted.screen = screenAudioTrack;
    Object.keys(remoteStreams).forEach((id) => {
      const t = remoteStreams[id].getAudioTracks()[0];
      if (t) wanted['r:' + id] = t;
    });
    Object.keys(rec.sources).forEach((k) => {
      if (wanted[k] !== rec.sources[k].track) {
        try { rec.sources[k].node.disconnect(); } catch (e) { /* already gone */ }
        delete rec.sources[k];
      }
    });
    Object.keys(wanted).forEach((k) => {
      if (rec.sources[k]) return;
      const node = rec.ctx.createMediaStreamSource(new MediaStream([wanted[k]]));
      node.connect(rec.dest);
      rec.sources[k] = { track: wanted[k], node };
    });
  }

  function drawContain(g, video, x, y, w, h) {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    const scale = Math.min(w / vw, h / vh);
    const dw = vw * scale, dh = vh * scale;
    g.drawImage(video, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  const labelWidths = {};

  function drawLabel(g, text, x, y, h) {
    g.font = '600 16px sans-serif';
    if (labelWidths[text] === undefined) labelWidths[text] = g.measureText(text).width + 14;
    const w = labelWidths[text];
    g.fillStyle = 'rgba(0,0,0,.6)';
    g.fillRect(x + 8, y + h - 30, w, 22);
    g.fillStyle = '#fff';
    g.textBaseline = 'middle';
    g.fillText(text, x + 15, y + h - 19);
  }

  function drawRecFrame() {
    if (!rec) return;
    const { canvas } = rec;
    const g = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    g.fillStyle = '#0b1020';
    g.fillRect(0, 0, W, H);

    const tiles = Array.from(grid.querySelectorAll('.tile')).map((t) => ({
      video: t.querySelector('video'),
      name: (t.querySelector('span') || {}).textContent || '',
      sharing: t.classList.contains('sharing')
    })).filter((t) => t.video && t.video.videoWidth > 0);
    if (!tiles.length) return;

    const presenter = tiles.find((t) => t.sharing);
    if (presenter) {
      const others = tiles.filter((t) => t !== presenter);
      const mainW = others.length ? Math.round(W * 0.78) : W;
      drawContain(g, presenter.video, 0, 0, mainW, H);
      drawLabel(g, presenter.name, 0, 0, H);
      const sideH = others.length ? Math.floor(H / Math.min(others.length, 4)) : 0;
      others.slice(0, 4).forEach((t, i) => {
        drawContain(g, t.video, mainW, i * sideH, W - mainW, sideH);
        drawLabel(g, t.name, mainW, i * sideH, sideH);
      });
    } else {
      const cols = Math.ceil(Math.sqrt(tiles.length));
      const rows = Math.ceil(tiles.length / cols);
      const cw = W / cols, ch = H / rows;
      tiles.forEach((t, i) => {
        const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
        drawContain(g, t.video, x, y, cw, ch);
        drawLabel(g, t.name, x, y, ch);
      });
    }
    // push exactly one frame per drawing (smoother than letting the browser guess)
    if (rec.manualFrames) rec.videoTrack.requestFrame();
  }

  // A Worker timer keeps ticking at full speed even when this tab is in the background
  // (normal setInterval is throttled to once a second there, which makes the video jerky).
  function makeTicker(fn, ms) {
    try {
      const url = URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},' + ms + ')'], { type: 'text/javascript' }));
      const w = new Worker(url);
      w.onmessage = fn;
      return () => { w.terminate(); URL.revokeObjectURL(url); };
    } catch (e) {
      const t = setInterval(fn, ms);
      return () => clearInterval(t);
    }
  }

  async function startRecording() {
    if (rec || !window.MediaRecorder) {
      if (!window.MediaRecorder) setNotice('Recording is not supported in this browser. Use a recent Chrome, Edge or Firefox.');
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    const mime = pickRecMime();
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    // 48 kHz = the sample rate WebRTC audio uses, so nothing gets resampled (resampling causes crackles/gaps)
    let ctx;
    try { ctx = new AC({ sampleRate: 48000, latencyHint: 'playback' }); } catch (e) { ctx = new AC(); }
    await ctx.resume().catch(() => {});
    const dest = ctx.createMediaStreamDestination();

    const FPS = 24;
    let capture = canvas.captureStream(0);
    let videoTrack = capture.getVideoTracks()[0];
    const manualFrames = !!(videoTrack && typeof videoTrack.requestFrame === 'function');
    if (!manualFrames) { capture = canvas.captureStream(FPS); videoTrack = capture.getVideoTracks()[0]; }

    rec = { canvas, ctx, dest, sources: {}, chunks: [], mime, started: Date.now(), videoTrack, manualFrames };
    syncRecAudio();
    drawRecFrame();
    rec.stopTicker = makeTicker(drawRecFrame, Math.round(1000 / FPS));

    const stream = new MediaStream([videoTrack, ...dest.stream.getAudioTracks()]);
    try {
      rec.recorder = new MediaRecorder(stream, Object.assign({ videoBitsPerSecond: 2000000, audioBitsPerSecond: 128000 }, mime ? { mimeType: mime } : {}));
    } catch (e) {
      rec.stopTicker();
      ctx.close().catch(() => {});
      rec = null;
      setNotice('Could not start the recorder (' + e.name + ').');
      return;
    }
    rec.recorder.ondataavailable = (e) => { if (e.data && e.data.size) rec.chunks.push(e.data); };
    rec.recorder.onstop = finishRecording;
    rec.recorder.start(1000);

    recordBtn.textContent = 'Stop recording';
    recordBtn.classList.remove('ghost');
    recordBtn.classList.add('danger');
    setRecBadge(true, 'Recording 0:00');
    recClock = setInterval(() => {
      setRecBadge(true, 'Recording ' + fmtClock(Math.round((Date.now() - rec.started) / 1000)));
    }, 1000);
    socket.emit('recording-state', { on: true });
    addMessage('Room', 'Recording started.');
  }

  function stopRecording() {
    if (!rec || rec.recorder.state === 'inactive') return;
    rec.recorder.stop(); // finishRecording() runs from onstop
  }

  async function finishRecording() {
    const r = rec;
    rec = null;
    r.stopTicker();
    clearInterval(recClock);
    r.ctx.close().catch(() => {});
    socket.emit('recording-state', { on: false });
    addMessage('Room', 'Recording stopped.');

    const type = (r.mime || 'video/webm').split(';')[0];
    const ext = type === 'video/mp4' ? 'mp4' : 'webm';
    const blob = new Blob(r.chunks, { type });
    const seconds = Math.round((Date.now() - r.started) / 1000);

    recordBtn.disabled = true;
    recordBtn.textContent = 'Saving...';
    setRecBadge(true, 'Saving recording...');

    const localUrl = URL.createObjectURL(blob);
    const offerDownload = (msg) => showBanner(msg, {
      label: 'Download copy',
      onClick: () => {
        const a = document.createElement('a');
        a.href = localUrl;
        a.download = 'recording-' + new Date().toISOString().replace(/[:.]/g, '-') + '.' + ext;
        a.click();
      }
    });

    try {
      const res = await fetch(MEETING_ID_URL + '?ext=' + ext + '&duration=' + seconds, {
        method: 'POST',
        headers: { 'Content-Type': type },
        body: blob
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Upload failed');
      offerDownload('Recording saved. You can play or download it from the Dashboard.');
    } catch (err) {
      offerDownload('Could not save on the server (' + err.message + '). Download your copy now, it is lost when you leave.');
    }

    recordBtn.disabled = false;
    recordBtn.textContent = 'Start recording';
    recordBtn.classList.remove('danger');
    recordBtn.classList.add('ghost');
    setRecBadge(false);
  }

  if (recordBtn) {
    recordBtn.addEventListener('click', () => (rec ? stopRecording() : startRecording()));
    window.addEventListener('beforeunload', (e) => {
      if (rec) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  // Everybody else just sees a clear "recording" badge
  socket.on('recording-state', ({ on }) => {
    if (isHost) return;
    setRecBadge(on, 'Recording');
    if (on) addMessage('Room', 'This meeting is being recorded.');
  });

  let mediaReady = false;

  function joinRoom() {
    // Fresh start on (re)connect: old peer connections belong to the old socket id
    Object.keys(peers).forEach((id) => {
      peers[id].close();
      delete peers[id];
      delete videoSenders[id];
      delete audioSenders[id];
      delete remoteStreams[id];
      const t = document.getElementById('tile-' + id);
      if (t) t.remove();
    });
    socket.emit('join-room', window.ROOM_CODE);
  }

  socket.on('connect', () => { if (mediaReady) joinRoom(); });
  socket.on('disconnect', () => { statusEl.textContent = 'Connection lost. Reconnecting...'; });

  (async () => {
    await initMedia();
    mediaReady = true;
    if (socket.connected) joinRoom();
  })();
})();
