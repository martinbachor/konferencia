const socket = io('/');

const screensEls = document.querySelectorAll('.screen');
let myScreen = null;
let myPeer = null;
let localStream = null;

// vykreslenie stavu
function renderScreens(state) {
  screensEls.forEach((el) => {
    const id = el.dataset.screen;
    const info = state[id];
    const statusEl = el.querySelector('.status');

    el.classList.remove('free', 'occupied');

    if (!info) {
      statusEl.textContent = 'Neznáma';
      return;
    }

    if (info.occupied) {
      el.classList.add('occupied');
      statusEl.textContent = `Obsadená (${info.name || 'účastník'})`;
    } else {
      el.classList.add('free');
      statusEl.textContent = 'Voľná (klikni pre pripojenie)';
    }
  });
}

socket.on('screens-state', (state) => {
  renderScreens(state);
});

// po potvrdení z servera si len zapamätáme screenId
socket.on('screen-assigned', ({ screenId }) => {
  console.log('✅ screen-assigned:', screenId);
  myScreen = screenId;
  // call sa už spúšťa v handleJoinToScreen
});

// klik na obrazovku
screensEls.forEach((el) => {
  el.addEventListener('click', () => {
    const screenId = el.dataset.screen;
    if (el.classList.contains('occupied')) return;

    handleJoinToScreen(screenId);
  });
});

async function handleJoinToScreen(screenId) {
  const name = prompt('Zadaj svoje meno:');
  if (!name) return;

  // otvor screen (simulácia fyzickej obrazovky)
  window.open(`/screen/${screenId}`, '_blank');

  // pošli serveru žiadosť obsadiť túto obrazovku
  socket.emit('request-screen', { screenId, name });

  // priprav PeerJS a lokálny stream (kamera + mikrofón)
  try {
    if (!localStream) {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
    }

    if (!myPeer) {
      myPeer = new Peer(undefined, {
        host: 'localhost',
        port: 3001,
        path: '/peerjs',
      });

      myPeer.on('error', (err) => {
        console.error('Peer error:', err);
      });
    }

    myPeer.on('open', (id) => {
      console.log('Môj PeerJS ID:', id);
      // zavolaj priradenú obrazovku
      const call = myPeer.call(screenId, localStream);
      if (!call) {
        console.error('Nepodarilo sa zavolať screen', screenId);
      }
    });

    // ak už peer beží a otvor event už nastal, môžeš volať hneď
    if (myPeer.open) {
      const call = myPeer.call(screenId, localStream);
      if (!call) {
        console.error('Nepodarilo sa zavolať screen (instant) ', screenId);
      }
    }
  } catch (err) {
    console.error('Chyba pri získaní média:', err);
    alert('Nepodarilo sa zapnúť kameru/mikrofón.');
  }
}

// pri zatvorení tabu -> odhlás sa
window.addEventListener('beforeunload', () => {
  if (myScreen) {
    socket.emit('leave-screen');
  }
});
