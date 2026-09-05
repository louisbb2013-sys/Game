// Game state management and UI wiring.

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

const els = {
  modePlay: document.getElementById('mode-play'),
  modeSimulate: document.getElementById('mode-simulate'),
  colorField: document.getElementById('color-field'),
  colorBtns: Array.from(document.querySelectorAll('.color-btn')),
  speed: document.getElementById('speed'),
  speedLabel: document.getElementById('speed-label'),
  newGame: document.getElementById('new-game'),
  pauseBtn: document.getElementById('pause-btn'),
  playerList: document.getElementById('player-list'),
  moveLog: document.getElementById('move-log'),
  overlay: document.getElementById('winner-overlay'),
  overlayText: document.getElementById('winner-text'),
  overlayRestart: document.getElementById('overlay-restart'),
};

const state = {
  board: null,
  turnIndex: 0,
  active: new Set(TURN_ORDER),
  mode: 'play',
  humanColor: 'red',
  selected: null,
  legalMoves: [],
  gameOver: false,
  winner: null,
  paused: false,
  aiTimer: null,
  moveNumber: 0,
};

function currentColor() {
  return TURN_ORDER[state.turnIndex];
}

function isHumanTurn() {
  return state.mode === 'play' && currentColor() === state.humanColor;
}

function advanceTurn() {
  if (state.active.size <= 1) {
    endGame();
    return;
  }
  do {
    state.turnIndex = (state.turnIndex + 1) % TURN_ORDER.length;
  } while (!state.active.has(currentColor()));
}

function endGame() {
  state.gameOver = true;
  state.winner = state.active.size === 1 ? [...state.active][0] : null;
  els.overlay.classList.remove('hidden');
  els.overlayText.textContent = state.winner
    ? `${PLAYER_CONFIG[state.winner].label} wins!`
    : 'Game Over';
  clearTimeout(state.aiTimer);
}

function logMove(color, text) {
  state.moveNumber++;
  const line = document.createElement('div');
  line.textContent = `${state.moveNumber}. ${PLAYER_CONFIG[color].label}: ${text}`;
  els.moveLog.appendChild(line);
  els.moveLog.scrollTop = els.moveLog.scrollHeight;
}

function logElimination(color) {
  const line = document.createElement('div');
  line.textContent = `— ${PLAYER_CONFIG[color].label} eliminated! —`;
  line.style.color = PLAYER_CONFIG[color].hex;
  els.moveLog.appendChild(line);
  els.moveLog.scrollTop = els.moveLog.scrollHeight;
}

function performMove(move) {
  const color = currentColor();
  const captured = state.board[move.to.y][move.to.x];
  const notation = moveToNotation(move, captured && captured !== OFF);
  const { eliminatedColor } = applyMoveToBoard(state.board, move);

  logMove(color, notation);
  if (eliminatedColor) {
    state.active.delete(eliminatedColor);
    logElimination(eliminatedColor);
  }

  state.selected = null;
  state.legalMoves = [];

  advanceTurn();
  refresh();

  if (!state.gameOver) scheduleNextTurn();
}

function scheduleNextTurn() {
  clearTimeout(state.aiTimer);
  if (state.paused) return;
  const aiControlled = state.mode === 'simulate' || currentColor() !== state.humanColor;
  if (!aiControlled) return;

  const delay = parseInt(els.speed.value, 10);
  state.aiTimer = setTimeout(() => {
    if (state.gameOver || state.paused) return;
    const color = currentColor();
    const move = chooseAiMove(state.board, color);
    if (!move) {
      // No legal moves: pass the turn.
      advanceTurn();
      refresh();
      if (!state.gameOver) scheduleNextTurn();
      return;
    }
    performMove(move);
  }, delay);
}

function refresh() {
  render(ctx, state);
  renderPlayerList();
}

function renderPlayerList() {
  els.playerList.innerHTML = '';
  for (const color of TURN_ORDER) {
    const li = document.createElement('li');
    const eliminated = !state.active.has(color);
    if (eliminated) li.classList.add('eliminated');
    if (!eliminated && !state.gameOver && color === currentColor()) li.classList.add('current-turn');

    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = PLAYER_CONFIG[color].hex;
    li.appendChild(swatch);

    const label = document.createElement('span');
    label.textContent = PLAYER_CONFIG[color].label;
    li.appendChild(label);

    const tag = document.createElement('span');
    tag.className = 'tag';
    if (eliminated) tag.textContent = 'Eliminated';
    else if (state.mode === 'play' && color === state.humanColor) tag.textContent = 'You';
    else tag.textContent = 'AI';
    li.appendChild(tag);

    els.playerList.appendChild(li);
  }
}

function cellFromEvent(evt) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const px = (evt.clientX - rect.left) * scaleX;
  const py = (evt.clientY - rect.top) * scaleY;
  return { x: Math.floor(px / CELL), y: Math.floor(py / CELL) };
}

canvas.addEventListener('click', (evt) => {
  if (state.gameOver || !isHumanTurn()) return;
  const { x, y } = cellFromEvent(evt);
  if (!isOnBoard(x, y)) return;
  const cell = state.board[y][x];

  if (state.selected) {
    const match = state.legalMoves.find(m => m.x === x && m.y === y);
    if (match) {
      performMove({ from: state.selected, to: { x, y }, capture: match.capture, promote: match.promote, piece: state.board[state.selected.y][state.selected.x].type });
      return;
    }
    if (cell && cell !== OFF && cell.color === state.humanColor) {
      selectSquare(x, y);
    } else {
      state.selected = null;
      state.legalMoves = [];
      refresh();
    }
    return;
  }

  if (cell && cell !== OFF && cell.color === state.humanColor) {
    selectSquare(x, y);
  }
});

function selectSquare(x, y) {
  state.selected = { x, y };
  state.legalMoves = getPseudoMoves(state.board, x, y);
  refresh();
}

function newGame() {
  clearTimeout(state.aiTimer);
  state.board = setupInitialBoard();
  state.turnIndex = 0;
  state.active = new Set(TURN_ORDER);
  state.selected = null;
  state.legalMoves = [];
  state.gameOver = false;
  state.winner = null;
  state.paused = false;
  state.moveNumber = 0;
  els.moveLog.innerHTML = '';
  els.overlay.classList.add('hidden');
  els.pauseBtn.textContent = 'Pause AI';
  refresh();
  scheduleNextTurn();
}

els.modePlay.addEventListener('click', () => {
  state.mode = 'play';
  els.modePlay.classList.add('active');
  els.modeSimulate.classList.remove('active');
  els.colorField.classList.remove('hidden');
  els.pauseBtn.classList.add('hidden');
});

els.modeSimulate.addEventListener('click', () => {
  state.mode = 'simulate';
  els.modeSimulate.classList.add('active');
  els.modePlay.classList.remove('active');
  els.colorField.classList.add('hidden');
  els.pauseBtn.classList.remove('hidden');
});

els.colorBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    state.humanColor = btn.dataset.color;
    els.colorBtns.forEach(b => b.classList.toggle('active', b === btn));
  });
});
document.querySelector('.color-btn[data-color="red"]').classList.add('active');

els.speed.addEventListener('input', () => {
  const v = parseInt(els.speed.value, 10);
  els.speedLabel.textContent = v <= 150 ? 'Fast' : v >= 900 ? 'Slow' : 'Normal';
});

els.pauseBtn.addEventListener('click', () => {
  state.paused = !state.paused;
  els.pauseBtn.textContent = state.paused ? 'Resume AI' : 'Pause AI';
  if (!state.paused && !state.gameOver) scheduleNextTurn();
  else clearTimeout(state.aiTimer);
});

els.newGame.addEventListener('click', newGame);
els.overlayRestart.addEventListener('click', newGame);

newGame();
