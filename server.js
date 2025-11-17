const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.Server(app);
const io = socketIO(server);

// EJS + statické súbory
app.set('view engine', 'ejs');
app.set('views', 'views');
app.use(express.static('public'));

// Stav obrazoviek (1 účastník na obrazovku)
const screens = {
  screen1: { occupant: null },
  screen2: { occupant: null },
  screen3: { occupant: null },
  screen4: { occupant: null }, // prezentácia / share
};

function publicScreensState() {
  const result = {};
  for (const [id, data] of Object.entries(screens)) {
    result[id] = {
      occupied: !!data.occupant,
      name: data.occupant ? data.occupant.name : null,
    };
  }
  return result;
}

// ---------- ROUTES ----------

// Mapa miestnosti
app.get('/', (req, res) => {
  res.render('map'); // views/map.ejs
});

// Obrazovky v miestnosti (PC1–PC4)
app.get('/screen/:id', (req, res) => {
  const screenId = req.params.id;
  if (!screens[screenId]) {
    return res.status(404).send('Neznáma obrazovka');
  }
  res.render('screen', { screenId }); // views/screen.ejs
});

// (voliteľné) klasická room, ak ju chceš použiť na ďalší call
app.get('/room/:room', (req, res) => {
  res.render('room', { roomId: req.params.room });
});

// ---------- SOCKET.IO LOGIKA ----------

io.on('connection', (socket) => {
  console.log('Nové pripojenie:', socket.id);

  // predvolený stav
  socket.screenId = null; // pre remote účastníka: na ktorú obrazovku je priradený
  socket.isScreen = false; // true = tento socket je fyzická obrazovka /screen/:id

  // po pripojení pošleme aktuálny stav
  socket.emit('screens-state', publicScreensState());

  // ----- registrácia obrazovky (/screen/:id) -----
  socket.on('register-screen', ({ screenId }) => {
    if (!screens[screenId]) return;
    socket.isScreen = true;
    socket.screenId = screenId;
    console.log(`Socket ${socket.id} registrovaný ako obrazovka ${screenId}`);
  });

  // ----- žiadosť remote účastníka obsadiť obrazovku -----
  socket.on('request-screen', ({ screenId, name }) => {
    const screen = screens[screenId];

    if (!screen) {
      socket.emit('screen-error', { message: 'Neznáma obrazovka.' });
      return;
    }

    if (screen.occupant) {
      socket.emit('screen-busy', { screenId });
      return;
    }

    // priradíme účastníka k obrazovke
    screen.occupant = {
      socketId: socket.id,
      name: name || 'Účastník',
    };

    socket.screenId = screenId; // tento socket reprezentuje účastníka
    socket.isScreen = false;

    io.emit('screens-state', publicScreensState());
    socket.emit('screen-assigned', { screenId });
  });

  // ----- účastník sa dobrovoľne odhlasuje -----
  socket.on('leave-screen', () => {
    if (!socket.screenId || socket.isScreen) return; // obrazovka sa takto neodhlasuje
    const screenId = socket.screenId;
    const screen = screens[screenId];

    if (screen && screen.occupant && screen.occupant.socketId === socket.id) {
      screen.occupant = null;
      socket.screenId = null;
      io.emit('screens-state', publicScreensState());
    }
  });

  // ----- disconnect -----
  socket.on('disconnect', () => {
    // 1) remote účastník -> uvoľni jeho obrazovku
    if (!socket.isScreen && socket.screenId) {
      const screenId = socket.screenId;
      const screen = screens[screenId];
      if (screen && screen.occupant && screen.occupant.socketId === socket.id) {
        screen.occupant = null;
        console.log(`Účastník na ${screenId} sa odpojil (socket ${socket.id})`);
        io.emit('screens-state', publicScreensState());
      }
    }

    // 2) fyzická obrazovka -> uvoľni obrazovku, ak bola obsadená
    if (socket.isScreen && socket.screenId) {
      const screenId = socket.screenId;
      const screen = screens[screenId];
      if (screen && screen.occupant) {
        console.log(`Obrazovka ${screenId} spadla, uvoľňujem ju.`);
        screen.occupant = null;
        io.emit('screens-state', publicScreensState());
      }
    }
  });

  // ----- pôvodná zoom-clone logika (ak chceš /room/:room) -----
  socket.on('join-room', (roomId, userId) => {
    socket.join(roomId);
    socket.to(roomId).broadcast.emit('user-connected', userId);

    socket.on('disconnect', () => {
      socket.to(roomId).broadcast.emit('user-disconnected', userId);
    });
  });
});

// ---------- START SERVERA ----------

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server beží na porte ${PORT}`);
});
