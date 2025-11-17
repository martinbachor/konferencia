const express = require("express");
const app = express();
const server = require("http").Server(app);
const io = require("socket.io")(server);

app.set("view engine", "ejs");
app.use(express.static("public"));

// jedna spoločná miestnosť pre všetkých
const ROOM_ID = "konferencia-room";

// stav 4 obrazoviek v miestnosti
const screens = {
  1: { occupied: false },
  2: { occupied: false },
  3: { occupied: false },
  4: { occupied: false }, // neskôr na zdieľanie obrazovky
};

// socket.id -> info o užívateľovi
// { role: 'guest' | 'screen', peerId: string, screenId: number | null, roomId: string }
const socketToUser = new Map();

// roomId -> Set peerId-ov v miestnosti
const roomPeers = new Map();

// ÚVODNÁ STRÁNKA – mapa miestnosti
app.get("/", (req, res) => {
  res.render("index", { screens });
});

// PRIPOJENIE HOSŤA NA OBRAZOVKU
app.get("/join/:screenParam", (req, res) => {
  const screenId = parseScreenId(req.params.screenParam);
  if (!screens[screenId]) {
    return res.redirect("/");
  }
  res.render("guest", { roomId: ROOM_ID, screenId });
});

// OBRAZOVKA V MIESTNOSTI (PC1–PC4)
app.get("/screen/:screenParam", (req, res) => {
  const screenId = parseScreenId(req.params.screenParam);
  if (!screens[screenId]) {
    return res.redirect("/");
  }
  res.render("screen", { roomId: ROOM_ID, screenId });
});

// fallback – ak by si mal starý link typu /:room
app.get("/:room", (req, res) => {
  res.render("guest", { roomId: req.params.room, screenId: null });
});

// SOCKET.IO – signalizácia pre WebRTC + stav obrazoviek
io.on("connection", (socket) => {
  console.log("Nové socket spojenie:", socket.id);

  socket.on("join-room", (roomId, peerId, meta = {}) => {
    const role = meta.role || "guest";
    const screenId = meta.screenId || null;

    console.log("join-room:", { roomId, peerId, role, screenId });

    const userInfo = { role, peerId, screenId, roomId };
    socketToUser.set(socket.id, userInfo);

    // hosť obsadzuje obrazovku
    if (role === "guest" && screenId && screens[screenId]) {
      screens[screenId].occupied = true;
      io.emit("screens-update", screens);
    }

    // pošli novému klientovi ZOZNAM všetkých peerId, ktoré už sú v roome
    for (const [, info] of socketToUser.entries()) {
      if (info.roomId === roomId && info.peerId !== peerId) {
        socket.emit("user-connected", info.peerId);
      }
    }

    // pridaj peerId do roomPeers
    if (!roomPeers.has(roomId)) {
      roomPeers.set(roomId, new Set());
    }
    roomPeers.get(roomId).add(peerId);

    socket.join(roomId);

    socket.on("disconnect", () => {
      const info = socketToUser.get(socket.id);
      console.log("disconnect:", socket.id, info);
      if (!info) return;

      // uvoľni obsadenú obrazovku hosťa
      if (info.role === "guest" && info.screenId && screens[info.screenId]) {
        screens[info.screenId].occupied = false;
        io.emit("screens-update", screens);
      }

      // daj ostatným v roome vedieť, že peer zmizol
      socket.to(info.roomId).emit("user-disconnected", info.peerId);

      // odstráň z roomPeers
      const peersInRoom = roomPeers.get(info.roomId);
      if (peersInRoom) {
        peersInRoom.delete(info.peerId);
        if (peersInRoom.size === 0) {
          roomPeers.delete(info.roomId);
        }
      }

      socketToUser.delete(socket.id);
    });
  });
});

// pomocná funkcia – podporí /screen2 aj /2
function parseScreenId(param) {
  const match = String(param).match(/(\d+)/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server beží na porte ${PORT}`);
});
