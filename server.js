// 장난메신저 중계 서버: 같은 "방"에 있는 친구들끼리 채팅과 던지기를 전달한다.
const http = require('http');
const { WebSocketServer } = require('ws');

const ITEMS = ['dart', 'rock', 'snow', 'banana', 'heart'];

// 단독 실행(node server.js)도 되고, 앱 안에서 require 해서 켤 수도 있다
function start(PORT, onError) {
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('장난메신저 서버 동작 중');
});
const wss = new WebSocketServer({ server });
const clients = new Map(); // ws -> { id, name, color, room }
let nextId = 1;

const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };

function broadcastRoster(room) {
  const users = [...clients.values()].filter(c => c.room === room)
    .map(({ id, name, color, eyes, mouth, species, sign }) => ({ id, name, color, eyes, mouth, species, sign }));
  for (const [ws, c] of clients) if (c.room === room) send(ws, { type: 'roster', users });
}

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const me = clients.get(ws);

    if (m.type === 'hello' && !me) {
      const user = {
        id: String(nextId++),
        name: String(m.name || '익명').slice(0, 16),
        color: /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : '#ff9f43',
        eyes: /^[a-z]{1,12}$/.test(m.eyes) ? m.eyes : '',
        mouth: /^[a-z]{1,12}$/.test(m.mouth) ? m.mouth : '',
        species: /^[a-z]{1,12}$/.test(m.species) ? m.species : '',
        sign: String(m.sign || '').trim().slice(0, 40),
        room: String(m.room || 'lobby').slice(0, 32),
      };
      clients.set(ws, user);
      send(ws, { type: 'welcome', id: user.id });
      broadcastRoster(user.room);
      return;
    }
    if (!me) return;

    if (m.type === 'chat') {
      const text = String(m.text || '').slice(0, 200).trim();
      if (!text) return;
      for (const [w, c] of clients) {
        if (c.room === me.room && c.id === String(m.to)) send(w, { type: 'chat', from: me.id, text });
      }
    } else if (m.type === 'sign') { // 자리 비움 팻말: 방 전체 명단에 반영
      me.sign = String(m.text || '').trim().slice(0, 40);
      broadcastRoster(me.room);
    } else if (m.type === 'throw' && ITEMS.includes(m.item)) {
      // 같은 방 모두에게 보여준다 (던진 사람은 이미 화면에 그렸으니 제외)
      for (const [w, c] of clients) {
        if (c.room === me.room && w !== ws) send(w, { type: 'throw', from: me.id, to: String(m.to), item: m.item });
      }
    }
  });

  ws.on('close', () => {
    const me = clients.get(ws);
    clients.delete(ws);
    if (me) broadcastRoster(me.room);
  });
});

// 끊긴 연결 정리
const timer = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);
server.on('close', () => clearInterval(timer));
// 포트가 이미 쓰이는 등 실패해도 앱이 죽지 않게 (ws 서버도 같은 오류를 다시 내보냄)
const fail = e => { if (onError) onError(e); else { console.error(e.message); process.exit(1); } };
server.on('error', fail);
wss.on('error', () => {});

server.listen(PORT, () => console.log(`장난메신저 서버: ws://localhost:${PORT}`));
return server;
}

module.exports = { start };
if (require.main === module) start(process.env.PORT || 8787);
