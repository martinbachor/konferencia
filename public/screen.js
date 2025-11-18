const socket = io("/");
const container = document.getElementById("video-container");

const myPeer = new Peer(undefined, {
  host: "/",
  port: "3001",
  path: "/peerjs",
});

let currentVideo = null;

myPeer.on("open", (id) => {
  console.log("SCREEN PeerJS ID:", id);
  socket.emit("join-room", ROOM_ID, id, {
    role: "screen",
    screenId: SCREEN_ID,
  });
});

// obrazovka neposiela vlastné video, len prijíma cudzie streamy
myPeer.on("call", (call) => {
  console.log("SCREEN: prichádzajúci hovor od", call.peer);
  call.answer(); // bez vlastného streamu
  const video = document.createElement("video");
  call.on("stream", (userVideoStream) => {
    console.log("SCREEN: dostal stream, zobrazujem video");
    showSingleVideo(video, userVideoStream);
  });
  call.on("close", () => {
    if (video === currentVideo) {
      video.remove();
      currentVideo = null;
    }
  });
});

function showSingleVideo(video, stream) {
  video.srcObject = stream;
  video.muted = true; // pre istotu kvôli autoplay
  video.addEventListener("loadedmetadata", () => {
    video.play();
  });

  if (currentVideo) {
    currentVideo.remove();
  }
  currentVideo = video;
  container.append(video);
}
