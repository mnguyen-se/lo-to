import { randomInt, randomUUID } from 'node:crypto';

const ttl = 86400;
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const numbers = Array.from({ length: 90 }, (_, i) => i + 1);

export class GameError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function ticketPages() {
  const order = shuffle(Array.from({ length: 9 }, (_, i) => i));
  const buckets = order.map((_, col) => shuffle(numbers.slice(col * 10, col * 10 + 10)));
  const offset = randomInt(9);
  return Array.from({ length: 2 }, (_, page) =>
    Array.from({ length: 9 }, (_, row) => {
      const first = (offset + (page * 9 + row) * 5) % 9;
      return order.map((position, col) =>
        (position - first + 9) % 9 < 5 ? buckets[col].pop() : null
      );
    })
  );
}

function addPlayer(room, name) {
  const player = { id: randomUUID(), token: randomUUID(), name, card: null };
  room.players.push(player);
  room.host ??= player.id;
  return player;
}

function view(room, player) {
  return {
    code: room.code, revision: room.revision, phase: room.phase,
    host: room.host, drawn: room.drawn, winner: room.winner, round: room.round,
    players: room.players.map(({ id, name }) => ({ id, name })),
    you: player.id, pages: player.pages ?? (player.card ? [player.card] : [])
  };
}

const compareAndSet = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
if ARGV[2] == '' then
  redis.call('DEL', KEYS[1])
else
  redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
end
return 1`;

export const redisStore = {
  async command(args) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) throw new GameError('Máy chủ chưa cấu hình Redis.', 503);
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(5000)
    });
    const body = await response.json();
    if (!response.ok || body.error) throw new Error('Redis command failed');
    return body.result;
  },
  get(key) { return this.command(['GET', key]); },
  create(key, value) { return this.command(['SET', key, value, 'EX', ttl, 'NX']); },
  update(key, before, after) {
    return this.command(['EVAL', compareAndSet, 1, key, before, after, ttl]);
  }
};

export async function game(input, store = redisStore) {
  const { action, token } = input;
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (['create', 'join'].includes(action) && (!name || name.length > 24)) {
    throw new GameError('Nhập tên từ 1 đến 24 ký tự.');
  }
  if (action === 'create') {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
      const room = { code, revision: 1, round: 0, phase: 'waiting', players: [], host: null, drawn: [], deck: [], winner: null };
      const player = addPlayer(room, name);
      if (await store.create('loto:' + code, JSON.stringify(room))) {
        return { token: player.token, room: view(room, player) };
      }
    }
    throw new GameError('Chưa tạo được phòng. Thử lại nhé.', 503);
  }

  const code = typeof input.code === 'string' ? input.code.trim().toUpperCase() : '';
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) throw new GameError('Mã phòng gồm 6 ký tự.');
  const key = 'loto:' + code;
  for (let attempt = 0; attempt < 12; attempt++) {
    const raw = await store.get(key);
    if (!raw) throw new GameError('Phòng đã đóng hoặc mã phòng không đúng.', 404);
    const room = JSON.parse(raw);
    let player = room.players.find(p => p.token === token);

    switch (action) {
      case 'join':
        if (player) return { token: player.token, room: view(room, player) };
        if (room.phase === 'playing') throw new GameError('Phòng đang chơi. Hãy đợi ván sau.');
        if (room.players.length >= 8) throw new GameError('Phòng đã đủ 8 người.');
        player = addPlayer(room, name);
        break;
      case 'state':
        if (!player) throw new GameError('Phiên chơi đã kết thúc.', 401);
        return { room: view(room, player) };
      default:
        if (!player) throw new GameError('Phiên chơi đã kết thúc.', 401);
        changeRoom(room, player, input);
    }

    room.revision++;
    const next = room.players.length ? JSON.stringify(room) : '';
    if (await store.update(key, raw, next)) {
      return action === 'leave' ? {} : { token: player.token, room: view(room, player) };
    }
  }
  throw new GameError('Phòng đang cập nhật. Thử lại nhé.', 409);
}

function changeRoom(room, player, input) {
  if (input.action === 'leave') {
    room.players = room.players.filter(p => p.id !== player.id);
    if (room.host === player.id) room.host = room.players[0]?.id ?? null;
    if (room.phase === 'playing' && room.players.length < 2) room.phase = 'waiting';
    return;
  }
  if (input.action === 'claim') {
    if (room.phase !== 'playing' || input.round !== room.round) throw new GameError('Ván này đã kết thúc.');
    const drawn = new Set(room.drawn);
    const pages = player.pages ?? [player.card];
    const rows = pages.map(page => page.findIndex(cells => cells.every(n => n === null || drawn.has(n))));
    const page = rows.findIndex(row => row >= 0);
    if (page < 0) throw new GameError('Vé của bạn chưa có hàng nào đủ 5 số.');
    room.winner = { id: player.id, name: player.name, page: page + 1, row: rows[page] + 1 };
    room.phase = 'ended';
    return;
  }
  if (room.host !== player.id) throw new GameError('Chỉ chủ phòng mới dùng được nút này.', 403);
  if (input.action === 'start') {
    if (room.phase === 'playing' || input.round !== room.round) throw new GameError('Ván đang diễn ra.');
    if (room.players.length < 2) throw new GameError('Cần tối thiểu 2 người để bắt đầu.');
    room.round++;
    room.phase = 'playing';
    room.deck = shuffle(numbers);
    room.drawn = [];
    room.winner = null;
    room.players.forEach(p => { p.pages = ticketPages(); delete p.card; });
  } else if (input.action === 'draw') {
    if (room.phase !== 'playing' || input.round !== room.round) throw new GameError('Phòng chưa có ván đang chơi.');
    if (input.count !== room.drawn.length) throw new GameError('Số mới đã được bóc. Đợi đồng bộ nhé.', 409);
    if (!room.deck.length) throw new GameError('Đã bóc hết 90 số.');
    room.drawn.push(room.deck.pop());
  } else {
    throw new GameError('Thao tác không hợp lệ.');
  }
}
