const express = require("express");
const app = express();
const server = require("http").Server(app);
const io = require("socket.io")(server);

app.set("view engine", "ejs");
app.use(express.static("public"));

// jedna spoločná miestnosť pre všetkých
const ROOM_ID = "konferencia-room";

// stav 4 obrazoviek v miestnosti
// obrazovka 4 slúži na zdieľanie (sharingActive)
const screens = {
  1: { occupied: false, guestPeerId: null, screenPeerId: null },
  2: { occupied: false, guestPeerId: null, screenPeerId: null },
  3: { occupied: false, guestPeerId: null, screenPeerId: null },
  4: { occupied: false, guestPeerId: null, screenPeerId: null, sharingActive: false },
};

// socket.id -> info o užívateľovi
// { role: 'guest' | 'screen', peerId: string, screenId: number | null, roomId: string }
const socketToUser = new Map();

// kto práve zdieľa obrazovku (socket.id)
let screen4ShareOwnerSocketId = null;

// ÚVODNÁ STRÁNKA – mapa miestnosti
app.get("/", (req, res) => {
  res.render("index", { screens });
});

// PRIPOJENIE HOSŤA NA KONKRÉTNU OBRAZOVKU (len 1–3)
// 4. obrazovka je LEN na zdieľanie, nie na join ako hosť
app.get("/join/:screenParam", (req, res) => {
  const screenId = parseScreenId(req.params.screenParam);
  if (!screens[screenId]) {
    return res.redirect("/");
  }

  // screen 4 – nepripájame ako hosťa, len info
  if (screenId === 4) {
    return res.render("screen-busy", {
      screenId,
      message: "Obrazovka 4 slúži len na zdieľanie obrazovky.",
    });
  }

  // ak je obrazovka obsadená hosťom -> info stránka
  if (screens[screenId].occupied) {
    return res.render("screen-busy", {
      screenId,
      message: "Na túto obrazovku je už pripojený účastník.",
    });
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

// fallback – staré linky typu /:room
app.get("/:room", (req, res) => {
  res.render("guest", { roomId: req.params.room, screenId: null });
});

// SOCKET.IO – signalizácia pre WebRTC + stav obrazoviek
io.on("connection", (socket) => {
  console.log("Nové socket spojenie:", socket.id);

  socket.on("join-room", (roomId, peerId, meta = {}) => {
    const role = meta.role || "guest";
    const screenId = meta.screenId || null;

    const userInfo = { role, peerId, screenId, roomId };
    socketToUser.set(socket.id, userInfo);

    console.log("join-room:", userInfo);

    // hosť obsadzuje obrazovku 1–3 (nie 4)
    if (role === "guest" && screenId && screens[screenId] && screenId !== 4) {
      screens[screenId].occupied = true;
      screens[screenId].guestPeerId = peerId;
      io.emit("screens-update", screens);
    }

    // ak je to screen, uložíme peerId
    if (role === "screen" && screenId && screens[screenId]) {
      screens[screenId].screenPeerId = peerId;

      // špeciálne: ak je to obrazovka 4, pošleme jej peerId hosťom
      if (screenId === 4) {
        io.emit("screen4-peer", peerId);
      }
    }

    // 1) novému klientovi pošleme všetkých, čo už sú v roome
    for (const [otherSocketId, info] of socketToUser.entries()) {
      if (otherSocketId === socket.id) continue;
      if (info.roomId === roomId && info.peerId) {
        socket.emit("user-connected", info.peerId);
      }
    }

    // 2) ostatným v roome oznámime, že pribudol tento nový peer
    socket.join(roomId);
    socket.to(roomId).emit("user-connected", peerId);

    // žiadosť o začatie zdieľania obrazovky
    socket.on("start-screen-share", (callback) => {
      const info = socketToUser.get(socket.id);
      if (!info) {
        return callback({ ok: false, message: "Používateľ nie je v miestnosti." });
      }

      // už niekto zdieľa -> zamietnuť
      if (screens[4].sharingActive && screen4ShareOwnerSocketId && screen4ShareOwnerSocketId !== socket.id) {
        return callback({
          ok: false,
          message: "Obrazovka 4 už je používaná na zdieľanie.",
        });
      }

      // povoliť zdieľanie
      screens[4].sharingActive = true;
      screen4ShareOwnerSocketId = socket.id;
      io.emit("screens-update", screens);
      io.emit("screen-share-state", {
        active: true,
        ownerPeerId: info.peerId,
      });

      callback({ ok: true });
    });

    // koniec zdieľania obrazovky
    socket.on("stop-screen-share", () => {
      if (socket.id !== screen4ShareOwnerSocketId) return;

      screens[4].sharingActive = false;
      screen4ShareOwnerSocketId = null;
      io.emit("screens-update", screens);
      io.emit("screen-share-state", {
        active: false,
        ownerPeerId: null,
      });
    });

    socket.on("disconnect", () => {
      const info = socketToUser.get(socket.id);
      console.log("disconnect:", socket.id, info);
      if (!info) return;

      // ak odchádza hosť z 1–3, uvoľníme obrazovku
      if (info.role === "guest" && info.screenId && screens[info.screenId] && info.screenId !== 4) {
        screens[info.screenId].occupied = false;
        screens[info.screenId].guestPeerId = null;
        io.emit("screens-update", screens);
      }

      // ak odchádza screen 4, zrušíme sharing-peer info
      if (info.role === "screen" && info.screenId && screens[info.screenId]) {
        screens[info.screenId].screenPeerId = null;
        if (info.screenId === 4) {
          io.emit("screen4-peer", null);
        }
      }

      // ak odchádza ten, kto zdieľal obrazovku 4, ukončíme sharing
      if (socket.id === screen4ShareOwnerSocketId) {
        screens[4].sharingActive = false;
        screen4ShareOwnerSocketId = null;
        io.emit("screens-update", screens);
        io.emit("screen-share-state", {
          active: false,
          ownerPeerId: null,
        });
      }

      socket.to(info.roomId).emit("user-disconnected", info.peerId);
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
