const express = require("express");
const app = express();
const server = require("http").Server(app);
const io = require("socket.io")(server);

app.set("view engine", "ejs");
app.use(express.static("public"));

// jedna spoločná miestnosť pre všetkých
const ROOM_ID = "konferencia-room";

// stav 4 obrazoviek v miestnosti
// occupied = true => je tam pripojený hosť
const screens = {
  1: { occupied: false },
  2: { occupied: false },
  3: { occupied: false },
  4: { occupied: false }, // neskôr na zdieľanie obrazovky
};

// socket.id -> info o užívateľovi
// { role: 'guest' | 'screen', peerId: string, screenId: number | null }
const socketToUser = new Map();

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

// fallback – ak by si mal niekde starý link typu /:room
app.get("/:room", (req, res) => {
  res.render("guest", { roomId: req.params.room, screenId: null });
});

// SOCKET.IO – signalizácia pre WebRTC + stav obrazoviek
io.on("connection", (socket) => {
  socket.on("join-room", (roomId, peerId, meta = {}) => {
    const role = meta.role || "guest";
    const screenId = meta.screenId || null;

    socketToUser.set(socket.id, { role, peerId, screenId });

    // ak je to hosť a pripája sa na konkrétnu obrazovku, označ ju ako obsadenú
    if (role === "guest" && screenId && screens[screenId]) {
      screens[screenId].occupied = true;
      io.emit("screens-update", screens);
    }

    socket.join(roomId);

    // ostatným v miestnosti oznámime, že sa pripojil nový peer
    socket.to(roomId).emit("user-connected", peerId);

    socket.on("disconnect", () => {
      const info = socketToUser.get(socket.id);
      if (!info) return;

      if (info.role === "guest" && info.screenId && screens[info.screenId]) {
        screens[info.screenId].occupied = false;
        io.emit("screens-update", screens);
      }

      socket.to(roomId).emit("user-disconnected", info.peerId);
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
