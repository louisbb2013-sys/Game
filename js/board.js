// Board layout, setup, and low-level square helpers for the 4-player cross board.
const SIZE = 14;

const TURN_ORDER = ['red', 'blue', 'yellow', 'green'];

const PLAYER_CONFIG = {
  red:    { label: 'Red',    hex: '#e74c3c', forward: { x: 0, y: -1 } },
  yellow: { label: 'Yellow', hex: '#f1c40f', forward: { x: 0, y: 1 } },
  blue:   { label: 'Blue',   hex: '#3498db', forward: { x: 1, y: 0 } },
  green:  { label: 'Green',  hex: '#2ecc71', forward: { x: -1, y: 0 } },
};

const BACK_RANK_ORDER = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];

const PIECE_VALUES = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 1000 };

const OFF = 'OFF';

function isOffBoard(x, y) {
  return (x < 3 || x > 10) && (y < 3 || y > 10);
}

function inRange(x, y) {
  return x >= 0 && x < SIZE && y >= 0 && y < SIZE;
}

function isOnBoard(x, y) {
  return inRange(x, y) && !isOffBoard(x, y);
}

function createEmptyBoard() {
  const board = [];
  for (let y = 0; y < SIZE; y++) {
    const row = [];
    for (let x = 0; x < SIZE; x++) {
      row.push(isOffBoard(x, y) ? OFF : null);
    }
    board.push(row);
  }
  return board;
}

function setupInitialBoard() {
  const board = createEmptyBoard();

  // Red: bottom arm, back rank row 13, pawns row 12, facing up (-y).
  for (let i = 0; i < 8; i++) {
    const x = 3 + i;
    board[13][x] = { type: BACK_RANK_ORDER[i], color: 'red' };
    board[12][x] = { type: 'P', color: 'red' };
  }

  // Yellow: top arm, back rank row 0, pawns row 1, facing down (+y).
  for (let i = 0; i < 8; i++) {
    const x = 3 + i;
    board[0][x] = { type: BACK_RANK_ORDER[i], color: 'yellow' };
    board[1][x] = { type: 'P', color: 'yellow' };
  }

  // Blue: left arm, back file col 0, pawns col 1, facing right (+x).
  for (let i = 0; i < 8; i++) {
    const y = 3 + i;
    board[y][0] = { type: BACK_RANK_ORDER[i], color: 'blue' };
    board[y][1] = { type: 'P', color: 'blue' };
  }

  // Green: right arm, back file col 13, pawns col 12, facing left (-x).
  for (let i = 0; i < 8; i++) {
    const y = 3 + i;
    board[y][13] = { type: BACK_RANK_ORDER[i], color: 'green' };
    board[y][12] = { type: 'P', color: 'green' };
  }

  return board;
}

function cloneBoard(board) {
  return board.map(row => row.map(cell => (cell && cell !== OFF ? { ...cell } : cell)));
}
