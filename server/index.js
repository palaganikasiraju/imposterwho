import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: true, credentials: true } });
const rooms = new Map();

app.use(cors());
app.use(express.json());
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));
app.use(express.static(path.join(__dirname, '..', 'dist')));
app.use((req, res, next) => {
  if (req.method === 'GET' && req.accepts('html')) return res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
  next();
});

function publicRoom(room) {
  return { code: room.code, hostId: room.hostId, status: room.status, players: [...room.players.values()].map(({ id, name, isHost }) => ({ id, name, isHost })) };
}

function sendRoom(code) {
  const room = rooms.get(code);
  if (room) io.to(code).emit('room:update', publicRoom(room));
}

io.on('connection', (socket) => {
  socket.on('room:create', ({ name }, done) => {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const room = { code, hostId: socket.id, status: 'lobby', players: new Map([[socket.id, { id: socket.id, name: String(name).trim().slice(0, 18), isHost: true }]]) };
    rooms.set(code, room); socket.join(code); socket.data.roomCode = code;
    done?.({ ok: true, room: publicRoom(room) }); sendRoom(code);
  });

  socket.on('room:join', ({ code, name }, done) => {
    const room = rooms.get(String(code));
    if (!room) return done?.({ ok: false, error: 'Room not found' });
    if (room.status !== 'lobby') return done?.({ ok: false, error: 'Game already started' });
    if (room.players.size >= 12) return done?.({ ok: false, error: 'Room is full' });
    room.players.set(socket.id, { id: socket.id, name: String(name).trim().slice(0, 18), isHost: false });
    socket.join(room.code); socket.data.roomCode = room.code;
    done?.({ ok: true, room: publicRoom(room) }); sendRoom(room.code);
  });

  socket.on('game:start', ({ roomCode, settings }, done) => {
    const room = rooms.get(roomCode);
    if (!room || room.hostId !== socket.id || room.players.size < 3) return done?.({ ok: false, error: 'At least 3 players are needed' });
    room.status = 'playing'; room.game = { ...settings, turn: 0, players: [...room.players.values()].map((p) => p.id) };
    const ids = room.game.players; const imposterId = ids[Math.floor(Math.random() * ids.length)];
    room.game.imposterId = imposterId; room.game.word = settings.word;
    ids.forEach((id) => io.to(id).emit('game:role', { role: id === imposterId ? 'imposter' : 'player', word: id === imposterId ? null : settings.word }));
    io.to(roomCode).emit('game:state', { status: 'playing', turn: 0, currentPlayerId: ids[0] }); sendRoom(roomCode); done?.({ ok: true });
  });

  socket.on('game:next', ({ roomCode }, done) => {
    const room = rooms.get(roomCode); if (!room?.game || room.game.players[room.game.turn] !== socket.id) return done?.({ ok: false, error: 'Not your turn' });
    room.game.turn += 1;
    if (room.game.turn >= room.game.players.length) io.to(roomCode).emit('game:voting');
    else io.to(roomCode).emit('game:state', { status: 'playing', turn: room.game.turn, currentPlayerId: room.game.players[room.game.turn] });
    done?.({ ok: true });
  });

  socket.on('vote:submit', ({ roomCode, targetId }) => io.to(roomCode).emit('vote:update', { voterId: socket.id, targetId }));

  socket.on('webrtc:offer', ({ targetId, offer }) => io.to(targetId).emit('webrtc:offer', { fromId: socket.id, offer }));
  socket.on('webrtc:answer', ({ targetId, answer }) => io.to(targetId).emit('webrtc:answer', { fromId: socket.id, answer }));
  socket.on('webrtc:ice', ({ targetId, candidate }) => io.to(targetId).emit('webrtc:ice', { fromId: socket.id, candidate }));

  socket.on('disconnect', () => { const code = socket.data.roomCode; const room = rooms.get(code); if (!room) return; room.players.delete(socket.id); if (room.hostId === socket.id) room.hostId = room.players.keys().next().value; if (!room.players.size) rooms.delete(code); else sendRoom(code); });
});

const port = process.env.PORT || 3001;
httpServer.listen(port, () => console.log(`Imposter Who server running on http://localhost:${port}`));
