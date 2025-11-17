const socket = io("/");
const container = document.getElementById("video-container");

const myPeer = new Peer(undefined, {
  host: "/",
  port: "3001",
  path: "/peerjs",
});

let currentVideo = null;

// obrazovka neposiela vlastné video, len prijíma cudzie streamy
myPeer.on("call", (call) => {
  call.answer(); // bez vlastného streamu
  const video = document.createElement("video");
  call.on("stream", (userVideoStream) => {
    showSingleVideo(video, userVideoStream);
  });
  call.on("close", () => {
    if (video === currentVideo) {
      video.remove();
      currentVideo = null;
    }
  });
});

myPeer.on("open", (id) => {
  // role = screen, priradená obrazovka = SCREEN_ID
  socket.emit("join-room", ROOM_ID, id, {
    role: "screen",
    screenId: SCREEN_ID,
  });
});

function showSingleVideo(video, stream) {
  video.srcObject = stream;
  video.addEventListener("loadedmetadata", () => {
    video.play();
  });

  if (currentVideo) {
    currentVideo.remove();
  }
  currentVideo = video;
  container.append(video);
}
