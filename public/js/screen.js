const socket = io('/');
const screenId = window.SCREEN_ID;

const statusEl = document.getElementById('status');
const videoEl = document.getElementById('remoteVideo');
const placeholderEl = document.getElementById('placeholder');

// nahlás serveru, že tento socket je fyzická obrazovka
socket.emit('register-screen', { screenId });

// PeerJS klient pre obrazovku – stabilné ID = screenId
const peer = new Peer(screenId, {
  host: 'localhost',
  port: 3001,
  path: '/peerjs',
});

peer.on('open', (id) => {
  console.log(`Screen ${screenId} PeerJS ID:`, id);
});

// Keď remote účastník zavolá túto obrazovku
peer.on('call', (call) => {
  console.log('Prichádzajúci hovor na', screenId);

  // obrazovka neposiela vlastné video/audio späť
  call.answer();

  call.on('stream', (remoteStream) => {
    console.log('Dostal som stream na', screenId);
    placeholderEl.style.display = 'none';
    videoEl.srcObject = remoteStream;
  });

  call.on('close', () => {
    console.log('Hovor ukončený na', screenId);
    videoEl.srcObject = null;
    placeholderEl.style.display = 'block';
  });
});

// update textov podľa obsadenosti
socket.on('screens-state', (state) => {
  const info = state[screenId];
  if (!info) {
    statusEl.textContent = 'Neznáma obrazovka.';
    return;
  }

  if (info.occupied) {
    statusEl.textContent = `Pripojený: ${info.name || 'účastník'}`;
  } else {
    statusEl.textContent = 'Čakám na účastníka...';
    videoEl.srcObject = null;
    placeholderEl.style.display = 'block';
  }
});

// --- CONTROLS PRE OBRAZOVKU -----------------------------
document.addEventListener('DOMContentLoaded', () => {
  // --- CONTROLS PRE OBRAZOVKU -----------------------------

  const muteBtn   = document.getElementById('btn-mute');
  const camBtn    = document.getElementById('btn-camera');
  const leaveBtn  = document.getElementById('btn-leave');

  const muteWarning = document.getElementById('mute-warning');
  const camWarning  = document.getElementById('cam-warning');

  let isMuted = false;
  let isCamOff = false;

  // MUTE – stíšenie prehrávaného videa
  if (muteBtn) {
    muteBtn.addEventListener("click", () => {
      if (!videoEl) return;

      isMuted = !isMuted;
      videoEl.muted = isMuted;

      if (isMuted) {
        muteBtn.textContent = "🔇 Zvuk vypnutý";
        if (muteWarning) muteWarning.classList.remove("hidden");
      } else {
        muteBtn.textContent = "🔊 Zvuk zapnutý";
        if (muteWarning) muteWarning.classList.add("hidden");
      }

      console.log("Mute toggled, muted =", isMuted);
    });
  }

  // CAMERA – skryť / zobraziť video
  if (camBtn) {
    camBtn.addEventListener("click", () => {
      if (!videoEl) return;

      isCamOff = !isCamOff;

      if (isCamOff) {
        videoEl.style.display = "none";
        if (placeholderEl) placeholderEl.style.display = "block";
        camBtn.textContent = "📷 Kamera vypnutá";
        if (camWarning) camWarning.classList.remove("hidden");
      } else {
        videoEl.style.display = "block";
        if (placeholderEl) placeholderEl.style.display = "none";
        camBtn.textContent = "📷 Kamera zapnutá";
        if (camWarning) camWarning.classList.add("hidden");
      }

      console.log("Camera (view) toggled, hidden =", isCamOff);
    });
  }

  // LEAVE – odpojenie (zatvorenie/odchod)
  if (leaveBtn) {
    leaveBtn.addEventListener("click", () => {
      console.log("Leaving screen -> redirect na /");
      window.location.href = "/";
    });
  }
});


