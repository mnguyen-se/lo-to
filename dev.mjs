import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { handler } from './api/room.js';

const rooms = new Map();
const memory = {
  get(key) { return rooms.get(key); },
  create(key, value) {
    if (rooms.has(key)) return false;
    rooms.set(key, value);
    return true;
  },
  update(key, before, after) {
    if (rooms.get(key) !== before) return false;
    if (after) rooms.set(key, after);
    else rooms.delete(key);
    return true;
  }
};
const api = handler(process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_TOKEN ? undefined : memory);
const assets = {
  '/': ['index.html', 'text/html'],
  '/app.js': ['app.js', 'text/javascript'],
  '/styles.css': ['styles.css', 'text/css']
};

createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/api/room') return api(req, res);
  const asset = Object.hasOwn(assets, path) ? assets[path] : null;
  if (!asset) {
    res.writeHead(404).end();
    return;
  }
  const [file, type] = asset;
  res.setHeader('Content-Type', type + '; charset=utf-8');
  res.end(await readFile(new URL('./public/' + file, import.meta.url)));
}).listen(Number(process.env.PORT || 3000), '0.0.0.0', () => {
  console.log('Lô Tô Online · http://localhost:' + (process.env.PORT || 3000));
});
