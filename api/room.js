import { game, GameError } from '../lib/rooms.js';

export function handler(store) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        throw new GameError('Chỉ hỗ trợ POST.', 405);
      }
      if (Number(req.headers['content-length']) > 4096) throw new GameError('Yêu cầu quá lớn.', 413);
      let input = req.body;
      if (typeof input === 'string') input = JSON.parse(input);
      if (input === undefined) {
        let raw = '';
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 4096) throw new GameError('Yêu cầu quá lớn.', 413);
        }
        input = JSON.parse(raw);
      }
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new GameError('Yêu cầu không hợp lệ.');
      const result = await game(input, store);
      res.end(JSON.stringify(result));
    } catch (error) {
      res.statusCode = error instanceof GameError ? error.status : error instanceof SyntaxError ? 400 : 503;
      const message = error instanceof GameError ? error.message : error instanceof SyntaxError
        ? 'Dữ liệu gửi lên không hợp lệ.' : 'Máy chủ đang gián đoạn. Thử lại nhé.';
      res.end(JSON.stringify({ error: message }));
    }
  };
}

export default handler();
