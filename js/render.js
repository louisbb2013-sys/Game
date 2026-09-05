// Canvas rendering for the board, pieces, and move highlights.

const CELL = 44;

const PIECE_GLYPHS = {
  K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟',
};

function drawBoard(ctx, state) {
  ctx.clearRect(0, 0, SIZE * CELL, SIZE * CELL);

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (isOffBoard(x, y)) continue;
      const dark = (x + y) % 2 === 1;
      ctx.fillStyle = dark ? '#3a3f52' : '#e9e9f2';
      ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
  }

  // Subtle home-zone tint.
  const zones = {
    red: () => { for (let y = 11; y < 14; y++) for (let x = 3; x <= 10; x++) tintCell(ctx, x, y, PLAYER_CONFIG.red.hex); },
    yellow: () => { for (let y = 0; y < 3; y++) for (let x = 3; x <= 10; x++) tintCell(ctx, x, y, PLAYER_CONFIG.yellow.hex); },
    blue: () => { for (let x = 0; x < 3; x++) for (let y = 3; y <= 10; y++) tintCell(ctx, x, y, PLAYER_CONFIG.blue.hex); },
    green: () => { for (let x = 11; x < 14; x++) for (let y = 3; y <= 10; y++) tintCell(ctx, x, y, PLAYER_CONFIG.green.hex); },
  };
  Object.values(zones).forEach(fn => fn());

  // Selected square + legal move highlights.
  if (state.selected) {
    highlightCell(ctx, state.selected.x, state.selected.y, 'rgba(108,140,255,0.55)');
  }
  for (const m of state.legalMoves || []) {
    const cx = m.x * CELL + CELL / 2;
    const cy = m.y * CELL + CELL / 2;
    ctx.beginPath();
    ctx.fillStyle = m.capture ? 'rgba(231,76,60,0.65)' : 'rgba(108,140,255,0.45)';
    ctx.arc(cx, cy, m.capture ? CELL * 0.42 : CELL * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }

  // Grid lines on playable area.
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (isOffBoard(x, y)) continue;
      ctx.strokeRect(x * CELL + 0.5, y * CELL + 0.5, CELL - 1, CELL - 1);
    }
  }
}

function tintCell(ctx, x, y, hex) {
  ctx.fillStyle = hexToRgba(hex, 0.08);
  ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
}

function highlightCell(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function drawPieces(ctx, board) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${CELL * 0.72}px serif`;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const cell = board[y][x];
      if (!cell || cell === OFF) continue;
      const cx = x * CELL + CELL / 2;
      const cy = y * CELL + CELL / 2;
      const glyph = PIECE_GLYPHS[cell.type];
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.strokeText(glyph, cx, cy);
      ctx.fillStyle = PLAYER_CONFIG[cell.color].hex;
      ctx.fillText(glyph, cx, cy);
    }
  }
}

function render(ctx, state) {
  drawBoard(ctx, state);
  drawPieces(ctx, state.board);
}
