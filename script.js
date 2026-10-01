/* =========================================================
   GAME LOGIC  (no DOM code in this section)
   ========================================================= */

// Which positions are joined by a line on the board
const ADJACENT = {
  1: [2, 4, 5], 2: [1, 3, 5], 3: [2, 5, 6],
  4: [1, 5, 7], 5: [1, 2, 3, 4, 6, 7, 8, 9], 6: [3, 5, 9],
  7: [4, 5, 8], 8: [5, 7, 9], 9: [5, 6, 8]
};

// The 8 lines that win the game
const WINNING_LINES = [
  [1, 2, 3], [4, 5, 6], [7, 8, 9],
  [1, 4, 7], [2, 5, 8], [3, 6, 9],
  [1, 5, 9], [3, 5, 7]
];

const PLAYER_NAMES = { 1: 'BLUE', 2: 'RED' };

function createState() {
  return {
    currentPlayer: 1,                 // 1 = Blue, 2 = Red
    board: Array(10).fill(null),      // board[1..9] = null | 1 | 2
    playerCoins: { 1: 3, 2: 3 },      // coins still waiting outside the board
    phase: 'placing',                 // 'placing' -> 'moving'
    gameOver: false,
    winner: null,
    winLine: null
  };
}

// Empty positions where the coin at `from` may go (must be connected AND empty)
function getValidMoves(state, from) {
  return ADJACENT[from].filter(pos => state.board[pos] === null);
}

function getEmptyPositions(state) {
  return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(pos => state.board[pos] === null);
}

function playerHasMoves(state, player) {
  return [1, 2, 3, 4, 5, 6, 7, 8, 9].some(
    pos => state.board[pos] === player && getValidMoves(state, pos).length > 0
  );
}

// Returns the winning line for a player, or null
function findWinningLine(state, player) {
  return WINNING_LINES.find(line => line.every(pos => state.board[pos] === player)) || null;
}

// After a valid action: check win, change phase, change player
function finishTurn(state) {
  const player = state.currentPlayer;
  const line = findWinningLine(state, player);
  if (line) {
    state.gameOver = true; state.winner = player; state.winLine = line;
    return;
  }
  if (state.phase === 'placing' && state.playerCoins[1] === 0 && state.playerCoins[2] === 0) {
    state.phase = 'moving';
  }
  state.currentPlayer = player === 1 ? 2 : 1;
}

function placeCoin(state, pos) {
  if (state.board[pos] !== null) return { ok: false, msg: '❌ That spot is already taken!' };
  state.board[pos] = state.currentPlayer;
  state.playerCoins[state.currentPlayer]--;
  finishTurn(state);
  return { ok: true };
}

function moveCoin(state, from, to) {
  if (!ADJACENT[from].includes(to)) return { ok: false, msg: '❌ You can only move to a connected position!' };
  if (state.board[to] !== null) return { ok: false, msg: '❌ That spot is already taken!' };
  state.board[from] = null;
  state.board[to] = state.currentPlayer;
  finishTurn(state);
  return { ok: true };
}

/* =========================================================
   USER INTERFACE
   ========================================================= */

// Spot centres as percentages of the board (matches the SVG lines)
const SPOT_POSITIONS = {
  1: [14, 14], 2: [50, 14], 3: [86, 14],
  4: [14, 50], 5: [50, 50], 6: [86, 50],
  7: [14, 86], 8: [50, 86], 9: [86, 86]
};

let boardEl, statusEl, hintEl, overlayEl;   // filled in by startGame() once the page has loaded
const spotEls = {};
let state = createState();
let drag = null;        // info about the coin being dragged
let hintTimer = null;


function makeCoin(player, pos) {
  const coin = document.createElement('div');
  coin.className = `coin p${player}`;
  coin.dataset.player = player;
  coin.dataset.pos = pos || '';
  return coin;
}

function render() {
  // coins on the board
  for (let id = 1; id <= 9; id++) {
    const slot = spotEls[id].querySelector('.slot');
    slot.innerHTML = '';
    if (state.board[id]) {
      const coin = makeCoin(state.board[id], id);
      if (state.winLine && state.winLine.includes(id)) coin.classList.add('win');
      slot.appendChild(coin);
    }
  }
  // coins waiting outside the board
  [1, 2].forEach(p => {
    const box = document.getElementById('coins' + p);
    box.innerHTML = '';
    for (let i = 0; i < state.playerCoins[p]; i++) box.appendChild(makeCoin(p, ''));
    document.getElementById('tray' + p).classList.toggle('active', !state.gameOver && state.currentPlayer === p);
  });
  // whose turn
  const p = state.currentPlayer;
  statusEl.className = 'status pop p' + p;
  // background changes to the shade of whoever's turn it is
  document.body.classList.toggle('turn-blue', p === 1);
  document.body.classList.toggle('turn-red', p === 2);
  statusEl.textContent = state.gameOver ? `${PLAYER_NAMES[state.winner]} WINS!`
    : `${p === 1 ? '🔵' : '🔴'} ${PLAYER_NAMES[p]}'S TURN`;
  showDefaultHint();
}

function showDefaultHint() {
  hintEl.className = 'hint';
  hintEl.textContent = '';   // only error messages are shown
}

function showBadHint(text) {
  clearTimeout(hintTimer);
  hintEl.className = 'hint';
  void hintEl.offsetWidth;                 // restart the shake animation
  hintEl.className = 'hint bad';
  hintEl.textContent = text;
  hintTimer = setTimeout(showDefaultHint, 2200);
}

function shakeCoin(selector) {
  const coin = document.querySelector(selector);
  if (coin) coin.classList.add('shake');
}

/* ---------- Drag and drop with pointer events (mouse + touch) ---------- */

function moveGhost(event) {
  drag.x = event.clientX;
  drag.y = event.clientY - drag.touchOffset;   // lift above the finger on touch screens
  drag.ghost.style.left = drag.x + 'px';
  drag.ghost.style.top = drag.y + 'px';
}

// Which spot is the coin over? (forgiving: nearest spot within a coin's radius)
function spotUnder(x, y) {
  let best = null, bestDist = Infinity;
  for (const id in spotEls) {
    const r = spotEls[id].getBoundingClientRect();
    const dist = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
    if (dist < r.width * 0.8 && dist < bestDist) { best = Number(id); bestDist = dist; }
  }
  return best;
}

function endDrag() {
  if (!drag) return;
  const { from, ghost, coin, player } = drag;
  const target = spotUnder(drag.x, drag.y);
  ghost.remove();
  Object.values(spotEls).forEach(s => s.classList.remove('ok', 'hover'));
  drag = null;

  // Dropped back where it started: just cancel
  if (target === from && from !== null) return coin.classList.remove('lifted');

  let result;
  if (target === null) result = { ok: false, msg: '❌ Drop the coin onto a spot!' };
  else if (state.phase === 'placing') result = placeCoin(state, target);
  else result = moveCoin(state, from, target);

  if (!result.ok) {                       // invalid: coin goes back and shakes
    coin.classList.remove('lifted');
    coin.classList.add('shake');
    showBadHint(result.msg);
    return;
  }

  render();
  const landed = spotEls[target].querySelector('.coin');
  if (landed) landed.classList.add('pop');

  if (state.gameOver) return celebrate();

  // If the next player is completely blocked, skip their turn
  if (state.phase === 'moving' && !playerHasMoves(state, state.currentPlayer)) {
    const stuck = state.currentPlayer;
    state.currentPlayer = stuck === 1 ? 2 : 1;
    render();
    showBadHint(`😮 ${PLAYER_NAMES[stuck]} has no moves — turn skipped!`);
  }
}

/* ---------- Winning + restarting ---------- */

function celebrate() {
  const card = document.getElementById('winCard');
  card.className = 'win-card p' + state.winner;
  document.getElementById('winText').textContent = `${PLAYER_NAMES[state.winner]} WINS!`;
  setTimeout(() => {                       // let the glowing coins be seen first
    overlayEl.hidden = false;
    launchConfetti();
  }, 900);
}

function launchConfetti() {
  const colors = ['#00D2FF', '#FF6257', '#FFE14D', '#78C940', '#FF8ADB', '#fff'];
  for (let i = 0; i < 70; i++) {
    const bit = document.createElement('div');
    bit.className = 'confetti';
    bit.style.left = Math.random() * 100 + 'vw';
    bit.style.background = colors[i % colors.length];
    bit.style.animationDuration = 2 + Math.random() * 2.5 + 's';
    bit.style.animationDelay = Math.random() * 0.8 + 's';
    document.body.appendChild(bit);
    setTimeout(() => bit.remove(), 6000);
  }
}

function restartGame() {
  state = createState();
  overlayEl.hidden = true;
  document.querySelectorAll('.confetti').forEach(c => c.remove());
  boardEl.classList.remove('wiggle');
  void boardEl.offsetWidth;
  boardEl.classList.add('wiggle');
  render();
}

// Build the 9 round spots once
function buildSpots() {
  for (let id = 1; id <= 9; id++) {
    const spot = document.createElement('div');
    spot.className = 'spot';
    spot.style.left = SPOT_POSITIONS[id][0] + '%';
    spot.style.top = SPOT_POSITIONS[id][1] + '%';
    spot.innerHTML = `${id}<div class="slot"></div>`;
    boardEl.appendChild(spot);
    spotEls[id] = spot;
  }
}

/* ---------- Startup: runs only after the whole page has loaded ---------- */

function startGame() {
  boardEl = document.getElementById('board');
  statusEl = document.getElementById('status');
  hintEl = document.getElementById('hint');
  overlayEl = document.getElementById('overlay');

  buildSpots();

  document.addEventListener('pointerdown', event => {
    const coin = event.target.closest('.coin');
    if (!coin || drag || state.gameOver) return;
    const player = Number(coin.dataset.player);
    const from = coin.dataset.pos ? Number(coin.dataset.pos) : null;

    // Rule checks before the coin can be picked up
    if (player !== state.currentPlayer) return showBadHint(`❌ It's ${PLAYER_NAMES[state.currentPlayer]}'s turn!`), coin.classList.add('shake');
    if (state.phase === 'placing' && from !== null) return showBadHint('❌ Place all your coins first!'), coin.classList.add('shake');
    if (state.phase === 'moving' && getValidMoves(state, from).length === 0) return showBadHint('❌ This coin is stuck! Try another one.'), coin.classList.add('shake');

    event.preventDefault();
    const targets = from === null ? getEmptyPositions(state) : getValidMoves(state, from);
    const ghost = makeCoin(player, from);
    ghost.classList.add('dragging');
    document.body.appendChild(ghost);
    coin.classList.add('lifted');
    targets.forEach(id => spotEls[id].classList.add('ok'));
    drag = { player, from, ghost, coin, targets, touchOffset: event.pointerType === 'touch' ? 40 : 0 };
    moveGhost(event);
  });

  document.addEventListener('pointermove', event => {
    if (!drag) return;
    moveGhost(event);
    const hovered = spotUnder(drag.x, drag.y);
    Object.keys(spotEls).forEach(id => spotEls[id].classList.toggle('hover', Number(id) === hovered && drag.targets.includes(hovered)));
  });

  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);

  document.getElementById('playAgain').addEventListener('click', restartGame);
  document.getElementById('restart').addEventListener('click', restartGame);
  render();
}

window.addEventListener('load', startGame);
