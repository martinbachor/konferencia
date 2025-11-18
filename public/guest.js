const socket = io("/");
const videoGrid = document.getElementById("video-grid");

const myPeer = new Peer(undefined, {
  host: "/",
  port: "3001",
  path: "/peerjs",
});

const myVideo = document.createElement("video");
myVideo.muted = true;

const peers = {};

let screen4PeerId = null;      // PeerJS ID monitora 4
let screenShareCall = null;    // aktívny call pre share
let screenShareActive = false; // server hovorí, či niekto zdieľa

// info o obrazovke 4 (peer id monitora)
socket.on("screen4-peer", (peerId) => {
  console.log("GUEST: screen4-peer =", peerId);
  screen4PeerId = peerId;
});

// globálny stav zdieľania (kto zdieľa)
socket.on("screen-share-state", (state) => {
  console.log("GUEST: screen-share-state", state);
  screenShareActive = state.active;
  updateShareButton();
});

// PeerJS je pripravený
myPeer.on("open", (id) => {
  console.log("GUEST: môj PeerJS ID:", id);
  socket.emit("join-room", ROOM_ID, id, {
    role: "guest",
    screenId: SCREEN_ID,
  });
});

// kamera/mikrofón
navigator.mediaDevices
  .getUserMedia({
    video: true,
    audio: true,
  })
  .then((stream) => {
    console.log("GUEST: mám stream z kamery/mikrofónu");
    addVideoStream(myVideo, stream);

    // keď nám niekto volá
    myPeer.on("call", (call) => {
      console.log("GUEST: prichádzajúci hovor od", call.peer);
      call.answer(stream);
      const video = document.createElement("video");
      call.on("stream", (userVideoStream) => {
        addVideoStream(video, userVideoStream);
      });
      call.on("close", () => {
        video.remove();
      });
    });

    // keď sa niekto nový pripojí, MY HO VOLÁME (okrem screen4)
    socket.on("user-connected", (userId) => {
      console.log("GUEST: user-connected", userId);

      // ⚠️ Dôležité: nechceme posielať KAMERU na obrazovku 4
      if (screen4PeerId && userId === screen4PeerId) {
        console.log("GUEST: screen4 joined -> nevolám ho s kamerou");
        return;
      }

      connectToNewUser(userId, stream);
    });

    // handlery na zdieľanie obrazovky
    setupScreenShare();
  })
  .catch((err) => {
    console.error("Nemôžem získať kameru/mikrofón:", err);
    alert(
      "Nepodarilo sa získať prístup ku kamere/mikrofónu. Skontroluj povolenia prehliadača."
    );
  });

socket.on("user-disconnected", (userId) => {
  console.log("GUEST: user-disconnected", userId);
  if (peers[userId]) peers[userId].close();
});

function connectToNewUser(userId, stream) {
  console.log("GUEST: volám nového usera", userId);
  const call = myPeer.call(userId, stream);
  const video = document.createElement("video");
  call.on("stream", (userVideoStream) => {
    addVideoStream(video, userVideoStream);
  });
  call.on("close", () => {
    video.remove();
  });
  peers[userId] = call;
}

function addVideoStream(video, stream) {
  video.srcObject = stream;
  video.addEventListener("loadedmetadata", () => {
    video.play();
  });
  videoGrid.append(video);
}

// -------------------- ZDIEĽANIE OBRAZOVKY --------------------

function setupScreenShare() {
  const btn = document.getElementById("share-screen-btn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    // ak už zdieľame -> stop
    if (screenShareCall) {
      console.log("GUEST: zastavujem zdieľanie");
      screenShareCall.close();
      screenShareCall = null;
      socket.emit("stop-screen-share");
      updateShareButton();
      return;
    }

    // ak je už sharing aktívny niekým iným
    if (screenShareActive) {
      alert("Obrazovka 4 už je používaná na zdieľanie.");
      return;
    }

    if (!screen4PeerId) {
      alert("Obrazovka 4 nie je pripojená.");
      return;
    }

    // najprv sa spýtame servera, či môžeme začať zdieľať
    socket.emit("start-screen-share", async (response) => {
      if (!response || !response.ok) {
        alert(response && response.message ? response.message : "Zdieľanie nie je dostupné.");
        return;
      }

      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });

        console.log("GUEST: začínam zdieľať obrazovku na peer", screen4PeerId);

        const call = myPeer.call(screen4PeerId, displayStream);
        screenShareCall = call;
        updateShareButton();

        const [videoTrack] = displayStream.getVideoTracks();
        if (videoTrack) {
          videoTrack.addEventListener("ended", () => {
            console.log("GUEST: zdieľanie bolo ukončené (browser UI)");
            if (screenShareCall) {
              screenShareCall.close();
              screenShareCall = null;
              socket.emit("stop-screen-share");
              updateShareButton();
            }
          });
        }
      } catch (err) {
        console.error("GUEST: chyba pri getDisplayMedia", err);
        alert("Nepodarilo sa začať zdieľanie obrazovky.");
        socket.emit("stop-screen-share");
      }
    });
  });

  updateShareButton();
}

function updateShareButton() {
  const btn = document.getElementById("share-screen-btn");
  if (!btn) return;

  if (screenShareCall) {
    btn.textContent = "Zastaviť zdieľanie obrazovky";
    btn.disabled = false;
  } else if (screenShareActive) {
    btn.textContent = "Zdieľanie prebieha (nedostupné)";
    btn.disabled = true;
  } else {
    btn.textContent = "Zdieľať obrazovku na obrazovku 4";
    btn.disabled = false;
  }
}
