const $ = id => document.getElementById(id);
const sessionKey = 'loto.session';
const queryCode = new URL(location.href).searchParams.get('phong');
let session;
try { session = JSON.parse(sessionStorage.getItem(sessionKey)); } catch { session = null; }
if (queryCode && session?.code !== queryCode.toUpperCase()) session = null;
let room = null;
let selectedPage = 0;
const marked = new Set();
let busy = false;
let polling = false;
let noticeTimer;
let failures = 0;

$('code').value = queryCode?.slice(0, 6).toUpperCase() ?? '';
$('name').value = localStorage.getItem('loto.name') ?? '';

function notify(message) {
  clearTimeout(noticeTimer);
  $('notice').textContent = message;
  $('notice').hidden = false;
  noticeTimer = setTimeout(() => { $('notice').hidden = true; }, 4200);
}

async function send(action, data = {}) {
  const response = await fetch('/api/room', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...session, action, ...data }),
    signal: AbortSignal.timeout(8000)
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error), { status: response.status });
  return result;
}

function saveSession(value) {
  session = value;
  if (value) sessionStorage.setItem(sessionKey, JSON.stringify(value));
  else sessionStorage.removeItem(sessionKey);
}

function apply(next) {
  if (!next || next.code !== session?.code) return;
  if (room && room.code === next.code && room.revision >= next.revision) return;
  if (room?.code !== next.code || room?.you !== next.you || room?.round !== next.round) {
    selectedPage = 0;
    marked.clear();
  }
  if (next.winner?.id === next.you && !room?.winner) selectedPage = (next.winner.page ?? 1) - 1;
  room = next;
  render();
}

function markedLine() {
  for (const [page, rows] of room.pages.entries()) {
    const row = rows.findIndex(cells => cells.every(n => n === null || marked.has(n)));
    if (row >= 0) return { page: page + 1, row: row + 1 };
  }
  return null;
}

function render() {
  $('welcome').hidden = Boolean(room);
  $('game').hidden = !room;
  document.querySelectorAll('#entry button, #leave').forEach(button => { button.disabled = busy; });
  if (!room) return;
  const { players, drawn, winner, pages, phase } = room;
  const host = room.host === room.you;
  const playing = phase === 'playing';
  const drawnSet = new Set(drawn);
  const page = pages[selectedPage];
  $('pages').hidden = pages.length < 2 || phase === 'waiting';
  $('card').hidden = !page || phase === 'waiting';
  $('card').classList.toggle('legacy', page?.length === 3);
  $('page1').setAttribute('aria-pressed', selectedPage === 0);
  $('page2').setAttribute('aria-pressed', selectedPage === 1);
  $('roomCode').textContent = room.code;
  $('round').textContent = room.round ? 'VÁN ' + room.round : 'SẢNH CHỜ';
  $('phase').textContent = winner ? winner.name + ' đã Kinh!' : playing ? 'Vé của bạn' : 'Chờ bắt đầu';
  $('ball').textContent = drawn.at(-1) ?? '–';
  $('gameHint').textContent = winner ? 'Thắng với hàng số ' + winner.row + ' trên trang ' + (winner.page ?? 1) + '. Chủ phòng có thể mở ván mới.'
    : playing ? 'Bấm ô có số đã bóc để đánh dấu. Đủ 5 số đã đánh dấu trên một hàng thì bấm Kinh!'
    : players.length < 2 ? 'Mời thêm ít nhất một người để bắt đầu.' : 'Chủ phòng có thể bắt đầu ván chơi.';
  $('count').textContent = players.length + '/8';
  $('drawCount').textContent = drawn.length + '/90';
  $('players').replaceChildren(...players.map(player => {
    const item = document.createElement('li');
    item.textContent = player.name + (player.id === room.you ? ' (bạn)' : '') + (player.id === room.host ? ' · Chủ phòng' : '');
    return item;
  }));
  $('card').replaceChildren(...(page && phase !== 'waiting' ? Array.from({ length: Math.ceil(page.length / 3) }, (_, panelIndex) => {
    const panel = document.createElement('div');
    panel.className = 'ticket-panel';
    panel.append(...page.slice(panelIndex * 3, panelIndex * 3 + 3).flatMap((row, i) => row.map(n => {
    const cell = document.createElement(n === null ? 'div' : 'button');
    cell.className = 'cell';
    if (n === null) {
      cell.classList.add('empty');
      cell.setAttribute('aria-hidden', 'true');
    } else {
      cell.textContent = n;
      cell.type = 'button';
      cell.disabled = !playing || !drawnSet.has(n);
      const updateMark = () => {
        cell.classList.toggle('marked', marked.has(n));
        cell.setAttribute('aria-pressed', String(marked.has(n)));
      };
      updateMark();
      cell.onclick = () => {
        if (marked.has(n)) marked.delete(n);
        else marked.add(n);
        updateMark();
        $('claim').disabled = busy || !markedLine();
      };
      if (drawnSet.has(n)) {
        cell.classList.add('hit');
        cell.setAttribute('aria-label', n + ', đã bóc');
      }
      if (winner?.id === room.you && (winner.page ?? 1) === selectedPage + 1 && winner.row === panelIndex * 3 + i + 1) cell.classList.add('win');
    }
    return cell;
    })));
    return panel;
  }) : []));
  $('history').replaceChildren(...[...drawn].reverse().map(n => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = n;
    return chip;
  }));
  $('start').hidden = !host || playing;
  $('start').textContent = room.round ? 'Chơi ván mới' : 'Bắt đầu';
  $('start').disabled = busy || players.length < 2;
  $('draw').hidden = !host || !playing;
  $('draw').disabled = busy || drawn.length === 90;
  $('claim').hidden = !playing;
  $('claim').disabled = busy || !markedLine();
}

async function act(action, data = {}) {
  if (busy) return;
  busy = true;
  render();
  try {
    const result = await send(action, data);
    if (action === 'leave') {
      saveSession(null);
      room = null;
      history.replaceState(null, '', '/');
    } else if (action === 'create' || action === 'join') {
      localStorage.setItem('loto.name', data.name);
      saveSession({ code: result.room.code, token: result.token });
      history.replaceState(null, '', '/?phong=' + result.room.code);
      apply(result.room);
    } else {
      apply(result.room);
    }
  } catch (error) {
    notify(error.status ? error.message : 'Mất kết nối. Thử lại nhé.');
  } finally {
    busy = false;
    render();
  }
}

$('entry').addEventListener('submit', event => {
  event.preventDefault();
  const action = event.submitter?.value ?? (queryCode ? 'join' : 'create');
  act(action, { name: $('name').value, code: $('code').value });
});
$('start').onclick = () => act('start', { round: room.round });
$('draw').onclick = () => act('draw', { round: room.round, count: room.drawn.length });
$('claim').onclick = () => {
  const line = markedLine();
  if (line) act('claim', { round: room.round, ...line });
};
$('page1').onclick = () => { selectedPage = 0; render(); };
$('page2').onclick = () => { selectedPage = 1; render(); };
$('leave').onclick = () => act('leave');
$('invite').onclick = async () => {
  const url = new URL('/?phong=' + room.code, location.origin).href;
  try {
    await navigator.clipboard.writeText(url);
    notify('Đã sao chép link mời.');
  } catch {
    notify('Gửi mã phòng ' + room.code + ' cho bạn bè.');
  }
};

async function sync() {
  if (!session || busy || polling) return;
  const current = session;
  polling = true;
  try {
    const result = await send('state');
    if (current === session) apply(result.room);
    failures = 0;
  } catch (error) {
    if (current !== session) return;
    if (error.status === 401 || error.status === 404) {
      saveSession(null);
      room = null;
      render();
      notify(error.message);
    } else if (++failures === 2) {
      notify(error.status ? error.message : 'Mất kết nối. Đang thử đồng bộ lại.');
    }
  } finally {
    polling = false;
  }
}
if (session) sync();
setInterval(sync, 2200);
