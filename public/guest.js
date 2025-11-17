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

navigator.mediaDevices
  .getUserMedia({
    video: true,
    audio: true,
  })
  .then((stream) => {
    console.log("GUEST: mám stream z kamery/mikrofónu");
    addVideoStream(myVideo, stream);

    // keď niekto volá nás (príde hovor)
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

    // keď sa niekto nový pripojí (napr. screen), my ho zavoláme
    socket.on("user-connected", (userId) => {
      console.log("GUEST: user-connected", userId);
      connectToNewUser(userId, stream);
    });

    // až teraz, keď máme stream a event listener,
    // sa pripojíme do miestnosti
    myPeer.on("open", (id) => {
      console.log("GUEST: môj PeerJS ID:", id);
      socket.emit("join-room", ROOM_ID, id, {
        role: "guest",
        screenId: SCREEN_ID,
      });
    });
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
