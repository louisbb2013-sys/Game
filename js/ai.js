// Simple heuristic AI: material capture value + a 1-ply safety check + noise.

function evaluateMove(board, move, color) {
  const trial = cloneBoard(board);
  const targetCell = trial[move.to.y][move.to.x];
  const capturedValue = targetCell && targetCell !== OFF ? PIECE_VALUES[targetCell.type] : 0;

  const { eliminatedColor } = applyMoveToBoard(trial, move);
  let score = capturedValue;
  if (eliminatedColor) score += 500; // big bonus for eliminating a player

  if (!eliminatedColor || eliminatedColor !== color) {
    const enemyColors = TURN_ORDER.filter(c => c !== color);
    const stillThere = trial[move.to.y][move.to.x];
    if (stillThere && stillThere !== OFF && isSquareAttacked(trial, move.to.x, move.to.y, enemyColors)) {
      score -= PIECE_VALUES[stillThere.type] * 0.75;
    }
  }

  score += Math.random() * 0.6;
  return score;
}

function chooseAiMove(board, color) {
  const moves = getAllMoves(board, color);
  if (moves.length === 0) return null;
  let best = moves[0];
  let bestScore = -Infinity;
  for (const move of moves) {
    const score = evaluateMove(board, move, color);
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}
