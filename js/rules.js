// Move generation and game-state mutation. No "check" concept — capturing a
// king eliminates that player outright (house rule, see README).

const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const QUEEN_DIRS = ROOK_DIRS.concat(BISHOP_DIRS);
const KNIGHT_STEPS = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];

function pawnDiagonals(forward) {
  const { x: fx, y: fy } = forward;
  return [
    { x: fx + fy, y: fy + fx },
    { x: fx - fy, y: fy - fx },
  ];
}

function slideMoves(board, x, y, color, dirs) {
  const moves = [];
  for (const [dx, dy] of dirs) {
    let nx = x + dx, ny = y + dy;
    while (isOnBoard(nx, ny)) {
      const cell = board[ny][nx];
      if (cell === null) {
        moves.push({ x: nx, y: ny, capture: false });
      } else {
        if (cell.color !== color) moves.push({ x: nx, y: ny, capture: true });
        break;
      }
      nx += dx; ny += dy;
    }
  }
  return moves;
}

function stepMoves(board, x, y, color, steps) {
  const moves = [];
  for (const [dx, dy] of steps) {
    const nx = x + dx, ny = y + dy;
    if (!isOnBoard(nx, ny)) continue;
    const cell = board[ny][nx];
    if (cell === null) moves.push({ x: nx, y: ny, capture: false });
    else if (cell.color !== color) moves.push({ x: nx, y: ny, capture: true });
  }
  return moves;
}

function pawnMoves(board, x, y, color) {
  const moves = [];
  const forward = PLAYER_CONFIG[color].forward;
  const oneX = x + forward.x, oneY = y + forward.y;
  const onStartRank =
    (color === 'red' && y === 12) || (color === 'yellow' && y === 1) ||
    (color === 'blue' && x === 1) || (color === 'green' && x === 12);

  if (isOnBoard(oneX, oneY) && board[oneY][oneX] === null) {
    moves.push({ x: oneX, y: oneY, capture: false, promote: isPawnPromoSquare(oneX, oneY, forward) });
    const twoX = x + forward.x * 2, twoY = y + forward.y * 2;
    if (onStartRank && isOnBoard(twoX, twoY) && board[twoY][twoX] === null) {
      moves.push({ x: twoX, y: twoY, capture: false, promote: isPawnPromoSquare(twoX, twoY, forward) });
    }
  }

  for (const d of pawnDiagonals(forward)) {
    const nx = x + d.x, ny = y + d.y;
    if (!isOnBoard(nx, ny)) continue;
    const cell = board[ny][nx];
    if (cell !== null && cell.color !== color) {
      moves.push({ x: nx, y: ny, capture: true, promote: isPawnPromoSquare(nx, ny, forward) });
    }
  }
  return moves;
}

function isPawnPromoSquare(x, y, forward) {
  if (forward.y === -1) return y === 0;
  if (forward.y === 1) return y === SIZE - 1;
  if (forward.x === 1) return x === SIZE - 1;
  if (forward.x === -1) return x === 0;
  return false;
}

function getPseudoMoves(board, x, y) {
  const piece = board[y][x];
  if (!piece || piece === OFF) return [];
  const { type, color } = piece;
  switch (type) {
    case 'P': return pawnMoves(board, x, y, color);
    case 'N': return stepMoves(board, x, y, color, KNIGHT_STEPS);
    case 'B': return slideMoves(board, x, y, color, BISHOP_DIRS);
    case 'R': return slideMoves(board, x, y, color, ROOK_DIRS);
    case 'Q': return slideMoves(board, x, y, color, QUEEN_DIRS);
    case 'K': return stepMoves(board, x, y, color, QUEEN_DIRS);
    default: return [];
  }
}

function getAllMoves(board, color) {
  const all = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const cell = board[y][x];
      if (cell && cell !== OFF && cell.color === color) {
        const moves = getPseudoMoves(board, x, y);
        for (const m of moves) all.push({ from: { x, y }, to: { x: m.x, y: m.y }, capture: m.capture, promote: !!m.promote, piece: cell.type });
      }
    }
  }
  return all;
}

function isSquareAttacked(board, x, y, byColors) {
  for (let cy = 0; cy < SIZE; cy++) {
    for (let cx = 0; cx < SIZE; cx++) {
      const cell = board[cy][cx];
      if (cell && cell !== OFF && byColors.includes(cell.color)) {
        const moves = getPseudoMoves(board, cx, cy);
        if (moves.some(m => m.x === x && m.y === y)) return true;
      }
    }
  }
  return false;
}

// Applies a move to a board in place. Returns { capturedPiece, eliminatedColor }.
function applyMoveToBoard(board, move) {
  const piece = board[move.from.y][move.from.x];
  const captured = board[move.to.y][move.to.x];
  board[move.to.y][move.to.x] = { ...piece };
  board[move.from.y][move.from.x] = null;

  if (move.promote && piece.type === 'P') {
    board[move.to.y][move.to.x].type = 'Q';
  }

  let eliminatedColor = null;
  if (captured && captured !== OFF && captured.type === 'K') {
    eliminatedColor = captured.color;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (board[y][x] && board[y][x] !== OFF && board[y][x].color === eliminatedColor) {
          board[y][x] = null;
        }
      }
    }
  }

  return { capturedPiece: captured && captured !== OFF ? captured : null, eliminatedColor };
}

function squareName(x, y) {
  return `${String.fromCharCode(97 + x)}${SIZE - y}`;
}

function moveToNotation(move, captured) {
  const pieceLetter = move.piece === 'P' ? '' : move.piece;
  const sep = captured ? 'x' : '-';
  return `${pieceLetter}${squareName(move.from.x, move.from.y)}${sep}${squareName(move.to.x, move.to.y)}`;
}
