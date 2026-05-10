const SIZE = 9;
const BOX = 3;
const EMPTY = 0;
const STORAGE_KEY = "sudoku-generator-state-v1";
const LEADERBOARD_KEY = "sudoku-generator-best-times-v1";
const THEME_KEY = "sudoku-generator-theme";

const DIFFICULTY = {
  easy: { removals: 36, hints: 4 },
  medium: { removals: 46, hints: 3 },
  hard: { removals: 54, hints: 2 }
};

const state = {
  puzzle: createEmptyGrid(),
  solution: createEmptyGrid(),
  board: createEmptyGrid(),
  notes: createNotesGrid(),
  selected: null,
  difficulty: "medium",
  seconds: 0,
  timerId: null,
  paused: false,
  mistakes: 0,
  hintsLeft: 3,
  entries: 0,
  gameOver: false,
  undoStack: [],
  redoStack: []
};

const els = {};

document.addEventListener("DOMContentLoaded", init);

function init() {
  cacheElements();
  buildBoard();
  buildNumberPad();
  bindEvents();
  applySavedTheme();

  if (loadGame()) {
    render();
    startTimer();
  } else {
    newGame();
  }

  renderLeaderboard();
}

function cacheElements() {
  els.board = document.getElementById("board");
  els.cells = [];
  els.difficulty = document.getElementById("difficulty");
  els.timer = document.getElementById("timer");
  els.mistakes = document.getElementById("mistakes");
  els.hints = document.getElementById("hints");
  els.pauseButton = document.getElementById("pauseButton");
  els.resumeButton = document.getElementById("resumeButton");
  els.pauseOverlay = document.getElementById("pauseOverlay");
  els.numberPad = document.getElementById("numberPad");
  els.notesMode = document.getElementById("notesMode");
  els.strictMode = document.getElementById("strictMode");
  els.themeToggle = document.getElementById("themeToggle");
  els.modal = document.getElementById("modal");
  els.modalEyebrow = document.getElementById("modalEyebrow");
  els.modalTitle = document.getElementById("modalTitle");
  els.modalMessage = document.getElementById("modalMessage");
  els.modalStats = document.getElementById("modalStats");
  els.modalClose = document.getElementById("modalClose");
  els.modalPlayAgain = document.getElementById("modalPlayAgain");
  els.leaderboard = document.getElementById("leaderboard");
  els.undo = document.getElementById("undo");
  els.redo = document.getElementById("redo");
  els.getHint = document.getElementById("getHint");
}

function bindEvents() {
  els.board.addEventListener("click", onBoardClick);
  els.board.addEventListener("keydown", onBoardKeydown);
  els.numberPad.addEventListener("click", onNumberPadClick);

  els.difficulty.addEventListener("change", () => {
    state.difficulty = els.difficulty.value;
    newGame();
  });

  document.getElementById("newGame").addEventListener("click", newGame);
  document.getElementById("solvePuzzle").addEventListener("click", solvePuzzle);
  document.getElementById("resetBoard").addEventListener("click", resetBoard);
  document.getElementById("checkSolution").addEventListener("click", checkSolution);
  document.getElementById("clearCell").addEventListener("click", clearSelectedCell);
  els.getHint.addEventListener("click", giveHint);
  els.undo.addEventListener("click", undo);
  els.redo.addEventListener("click", redo);
  els.pauseButton.addEventListener("click", pauseGame);
  els.resumeButton.addEventListener("click", resumeGame);
  els.themeToggle.addEventListener("click", toggleTheme);
  els.modalClose.addEventListener("click", () => {
    els.modal.hidden = true;
  });
  els.modalPlayAgain.addEventListener("click", () => {
    els.modal.hidden = true;
    newGame();
  });
  window.addEventListener("beforeunload", saveGame);
}

function buildBoard() {
  const fragment = document.createDocumentFragment();

  for (let row = 0; row < SIZE; row++) {
    els.cells[row] = [];
    for (let col = 0; col < SIZE; col++) {
      const cell = document.createElement("button");
      cell.className = "cell";
      cell.type = "button";
      cell.dataset.row = row;
      cell.dataset.col = col;
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-label", `Row ${row + 1}, column ${col + 1}`);
      els.cells[row][col] = cell;
      fragment.appendChild(cell);
    }
  }

  els.board.appendChild(fragment);
}

function buildNumberPad() {
  const fragment = document.createDocumentFragment();

  for (let value = 1; value <= 9; value++) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.value = String(value);
    button.textContent = String(value);
    button.setAttribute("aria-label", `Enter ${value}`);
    fragment.appendChild(button);
  }

  const clear = document.createElement("button");
  clear.type = "button";
  clear.dataset.value = "0";
  clear.textContent = "C";
  clear.setAttribute("aria-label", "Clear selected cell");
  fragment.appendChild(clear);

  els.numberPad.appendChild(fragment);
}

function newGame() {
  stopTimer();
  state.difficulty = els.difficulty.value;
  const generated = generatePuzzle(DIFFICULTY[state.difficulty].removals);

  state.puzzle = generated.puzzle;
  state.solution = generated.solution;
  state.board = cloneGrid(generated.puzzle);
  state.notes = createNotesGrid();
  state.selected = null;
  state.seconds = 0;
  state.paused = false;
  state.mistakes = 0;
  state.hintsLeft = DIFFICULTY[state.difficulty].hints;
  state.entries = 0;
  state.gameOver = false;
  state.undoStack = [];
  state.redoStack = [];
  els.pauseOverlay.hidden = true;
  els.pauseButton.textContent = "Pause";

  render();
  startTimer();
  saveGame();
}

// Create a solved board, then remove cells only when the puzzle remains unique.
function generatePuzzle(removals) {
  const solution = createSolvedGrid();
  const puzzle = cloneGrid(solution);
  const cells = shuffle([...Array(SIZE * SIZE).keys()]);
  let removed = 0;

  for (const index of cells) {
    if (removed >= removals) break;
    const row = Math.floor(index / SIZE);
    const col = index % SIZE;
    const backup = puzzle[row][col];
    puzzle[row][col] = EMPTY;

    if (countSolutions(cloneGrid(puzzle), 2) === 1) {
      removed++;
    } else {
      puzzle[row][col] = backup;
    }
  }

  return { puzzle, solution };
}

function createSolvedGrid() {
  const grid = createEmptyGrid();
  fillGrid(grid);
  return grid;
}

function fillGrid(grid) {
  const empty = findEmptyCell(grid);
  if (!empty) return true;

  for (const value of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
    if (isSafe(grid, empty.row, empty.col, value)) {
      grid[empty.row][empty.col] = value;
      if (fillGrid(grid)) return true;
      grid[empty.row][empty.col] = EMPTY;
    }
  }

  return false;
}

function solveGrid(grid) {
  const empty = findBestEmptyCell(grid);
  if (!empty) return true;

  for (const value of empty.candidates) {
    if (isSafe(grid, empty.row, empty.col, value)) {
      grid[empty.row][empty.col] = value;
      if (solveGrid(grid)) return true;
      grid[empty.row][empty.col] = EMPTY;
    }
  }

  return false;
}

function countSolutions(grid, limit) {
  let count = 0;

  function search() {
    if (count >= limit) return;
    const empty = findBestEmptyCell(grid);
    if (!empty) {
      count++;
      return;
    }

    for (const value of empty.candidates) {
      if (isSafe(grid, empty.row, empty.col, value)) {
        grid[empty.row][empty.col] = value;
        search();
        grid[empty.row][empty.col] = EMPTY;
      }
    }
  }

  search();
  return count;
}

function findEmptyCell(grid) {
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      if (grid[row][col] === EMPTY) return { row, col };
    }
  }
  return null;
}

function findBestEmptyCell(grid) {
  let best = null;

  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      if (grid[row][col] !== EMPTY) continue;
      const candidates = [];
      for (let value = 1; value <= 9; value++) {
        if (isSafe(grid, row, col, value)) candidates.push(value);
      }
      if (!best || candidates.length < best.candidates.length) {
        best = { row, col, candidates };
      }
      if (candidates.length === 0) return best;
    }
  }

  return best;
}

function isSafe(grid, row, col, value) {
  for (let index = 0; index < SIZE; index++) {
    if (grid[row][index] === value || grid[index][col] === value) return false;
  }

  const boxRow = Math.floor(row / BOX) * BOX;
  const boxCol = Math.floor(col / BOX) * BOX;
  for (let r = boxRow; r < boxRow + BOX; r++) {
    for (let c = boxCol; c < boxCol + BOX; c++) {
      if (grid[r][c] === value) return false;
    }
  }

  return true;
}

function onBoardClick(event) {
  const cell = event.target.closest(".cell");
  if (!cell || state.paused || state.gameOver) return;
  selectCell(Number(cell.dataset.row), Number(cell.dataset.col));
}

function onBoardKeydown(event) {
  if (!state.selected || state.paused || state.gameOver) return;
  const { row, col } = state.selected;

  if (/^[1-9]$/.test(event.key)) {
    event.preventDefault();
    enterValue(Number(event.key));
  } else if (event.key === "Backspace" || event.key === "Delete" || event.key === "0") {
    event.preventDefault();
    clearSelectedCell();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    selectCell(Math.max(0, row - 1), col);
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    selectCell(Math.min(8, row + 1), col);
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    selectCell(row, Math.max(0, col - 1));
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    selectCell(row, Math.min(8, col + 1));
  }
}

function onNumberPadClick(event) {
  const button = event.target.closest("button");
  if (!button || state.paused || state.gameOver) return;
  const value = Number(button.dataset.value);
  if (value === 0) clearSelectedCell();
  else enterValue(value);
}

function selectCell(row, col) {
  state.selected = { row, col };
  render();
  getCell(row, col).focus();
  saveGame();
}

function enterValue(value) {
  if (!state.selected || !Number.isInteger(value) || value < 1 || value > 9) return;
  const { row, col } = state.selected;
  if (isGiven(row, col)) return;

  if (els.notesMode.checked) {
    toggleNote(row, col, value);
    return;
  }

  const previousValue = state.board[row][col];
  const previousNotes = [...state.notes[row][col]];
  if (previousValue === value) return;

  pushHistory({ row, col, previousValue, nextValue: value, previousNotes, nextNotes: [] });
  state.board[row][col] = value;
  state.notes[row][col] = [];
  state.entries++;
  state.redoStack = [];

  if (value !== state.solution[row][col]) {
    state.mistakes++;
    if (els.strictMode.checked && state.mistakes >= 3) {
      state.gameOver = true;
      stopTimer();
      showModal({
        eyebrow: "Game Over",
        title: "Three Mistakes",
        message: "The board is locked after three mistakes.",
        stats: buildResultStats()
      });
    }
  } else {
    removeRelatedNotes(row, col, value);
  }

  render();
  saveGame();
  detectWin();
}

function toggleNote(row, col, value) {
  if (isGiven(row, col) || state.board[row][col] !== EMPTY) return;
  const previousNotes = [...state.notes[row][col]];
  const nextNotes = previousNotes.includes(value)
    ? previousNotes.filter((item) => item !== value)
    : [...previousNotes, value].sort((a, b) => a - b);

  pushHistory({ row, col, previousValue: EMPTY, nextValue: EMPTY, previousNotes, nextNotes });
  state.notes[row][col] = nextNotes;
  state.redoStack = [];
  render();
  saveGame();
}

function clearSelectedCell() {
  if (!state.selected || state.paused || state.gameOver) return;
  const { row, col } = state.selected;
  if (isGiven(row, col)) return;

  const previousValue = state.board[row][col];
  const previousNotes = [...state.notes[row][col]];
  if (previousValue === EMPTY && previousNotes.length === 0) return;

  pushHistory({ row, col, previousValue, nextValue: EMPTY, previousNotes, nextNotes: [] });
  state.board[row][col] = EMPTY;
  state.notes[row][col] = [];
  state.redoStack = [];
  render();
  saveGame();
}

function resetBoard() {
  state.board = cloneGrid(state.puzzle);
  state.notes = createNotesGrid();
  state.selected = null;
  state.mistakes = 0;
  state.entries = 0;
  state.gameOver = false;
  state.undoStack = [];
  state.redoStack = [];
  state.paused = false;
  els.pauseOverlay.hidden = true;
  els.pauseButton.textContent = "Pause";
  startTimer();
  render();
  saveGame();
}

function solvePuzzle() {
  const solved = cloneGrid(state.board);
  if (!solveGrid(solved)) {
    showModal({
      eyebrow: "Solver",
      title: "No Solution",
      message: "The current board cannot be solved. Clear conflicting entries or reset the puzzle."
    });
    return;
  }

  state.board = cloneGrid(state.solution);
  state.notes = createNotesGrid();
  state.gameOver = true;
  stopTimer();
  render();
  saveGame();
  showModal({
    eyebrow: "Solver",
    title: "Puzzle Solved",
    message: "The solution has been filled in.",
    stats: buildResultStats()
  });
}

function checkSolution() {
  const conflicts = collectConflicts();
  const emptyCells = countEmptyCells(state.board);

  if (conflicts.size > 0) {
    render();
    showModal({
      eyebrow: "Validation",
      title: "Incorrect Entries",
      message: "One or more cells conflict with the Sudoku rules or the solution."
    });
  } else if (emptyCells > 0) {
    showModal({
      eyebrow: "Validation",
      title: "Valid So Far",
      message: `${emptyCells} cells remain.`
    });
  } else {
    completePuzzle();
  }
}

function giveHint() {
  if (state.paused || state.gameOver || state.hintsLeft <= 0) return;
  const target = findHintTarget();
  if (!target) return;

  const { row, col } = target;
  const previousValue = state.board[row][col];
  const previousNotes = [...state.notes[row][col]];
  const value = state.solution[row][col];

  pushHistory({ row, col, previousValue, nextValue: value, previousNotes, nextNotes: [] });
  state.board[row][col] = value;
  state.notes[row][col] = [];
  state.hintsLeft--;
  state.redoStack = [];
  state.selected = { row, col };
  removeRelatedNotes(row, col, value);
  render();
  saveGame();
  detectWin();
}

function findHintTarget() {
  if (state.selected) {
    const { row, col } = state.selected;
    if (!isGiven(row, col) && state.board[row][col] === EMPTY) return state.selected;
  }

  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      if (!isGiven(row, col) && state.board[row][col] === EMPTY) return { row, col };
    }
  }

  return null;
}

function undo() {
  const move = state.undoStack.pop();
  if (!move || state.paused) return;
  applyMove(move, "previous");
  state.redoStack.push(move);
  render();
  saveGame();
}

function redo() {
  const move = state.redoStack.pop();
  if (!move || state.paused) return;
  applyMove(move, "next");
  state.undoStack.push(move);
  render();
  saveGame();
}

function pushHistory(move) {
  state.undoStack.push(move);
  if (state.undoStack.length > 120) state.undoStack.shift();
}

function applyMove(move, direction) {
  const valueKey = direction === "previous" ? "previousValue" : "nextValue";
  const notesKey = direction === "previous" ? "previousNotes" : "nextNotes";
  state.board[move.row][move.col] = move[valueKey];
  state.notes[move.row][move.col] = [...move[notesKey]];
  state.selected = { row: move.row, col: move.col };
}

function removeRelatedNotes(row, col, value) {
  for (let index = 0; index < SIZE; index++) {
    state.notes[row][index] = state.notes[row][index].filter((note) => note !== value);
    state.notes[index][col] = state.notes[index][col].filter((note) => note !== value);
  }

  const boxRow = Math.floor(row / BOX) * BOX;
  const boxCol = Math.floor(col / BOX) * BOX;
  for (let r = boxRow; r < boxRow + BOX; r++) {
    for (let c = boxCol; c < boxCol + BOX; c++) {
      state.notes[r][c] = state.notes[r][c].filter((note) => note !== value);
    }
  }
}

function render() {
  const conflicts = collectConflicts();
  const completed = collectCompletedUnits();

  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const cell = getCell(row, col);
      const value = state.board[row][col];
      const key = cellKey(row, col);
      cell.className = "cell";
      cell.textContent = "";
      cell.tabIndex = state.selected && state.selected.row === row && state.selected.col === col ? 0 : -1;

      if (isGiven(row, col)) cell.classList.add("given");
      if (state.selected) {
        const selected = state.selected;
        const sameBox = Math.floor(selected.row / BOX) === Math.floor(row / BOX)
          && Math.floor(selected.col / BOX) === Math.floor(col / BOX);
        if (selected.row === row && selected.col === col) cell.classList.add("selected");
        else if (selected.row === row || selected.col === col || sameBox) cell.classList.add("related");
      }
      if (completed.has(`r${row}`)) cell.classList.add("complete");
      if (conflicts.has(key)) cell.classList.add("invalid");

      if (value) {
        cell.textContent = String(value);
      } else if (state.notes[row][col].length) {
        cell.appendChild(renderNotes(state.notes[row][col]));
      }
    }
  }

  els.timer.textContent = formatTime(state.seconds);
  els.mistakes.textContent = String(state.mistakes);
  els.hints.textContent = String(state.hintsLeft);
  els.undo.disabled = state.undoStack.length === 0 || state.paused;
  els.redo.disabled = state.redoStack.length === 0 || state.paused;
  els.getHint.disabled = state.hintsLeft === 0 || state.paused || state.gameOver;
}

function renderNotes(notes) {
  const wrapper = document.createElement("div");
  wrapper.className = "notes";
  for (let value = 1; value <= 9; value++) {
    const item = document.createElement("span");
    item.textContent = notes.includes(value) ? String(value) : "";
    wrapper.appendChild(item);
  }
  return wrapper;
}

function collectConflicts() {
  const conflicts = new Set();

  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const value = state.board[row][col];
      if (!value) continue;
      if (value !== state.solution[row][col] || hasDuplicateInUnit(row, col, value)) {
        conflicts.add(cellKey(row, col));
      }
    }
  }

  return conflicts;
}

function hasDuplicateInUnit(row, col, value) {
  for (let index = 0; index < SIZE; index++) {
    if (index !== col && state.board[row][index] === value) return true;
    if (index !== row && state.board[index][col] === value) return true;
  }

  const boxRow = Math.floor(row / BOX) * BOX;
  const boxCol = Math.floor(col / BOX) * BOX;
  for (let r = boxRow; r < boxRow + BOX; r++) {
    for (let c = boxCol; c < boxCol + BOX; c++) {
      if ((r !== row || c !== col) && state.board[r][c] === value) return true;
    }
  }

  return false;
}

function collectCompletedUnits() {
  const completed = new Set();
  for (let row = 0; row < SIZE; row++) {
    let correct = true;
    for (let col = 0; col < SIZE; col++) {
      if (state.board[row][col] !== state.solution[row][col]) {
        correct = false;
        break;
      }
    }
    if (correct) completed.add(`r${row}`);
  }
  return completed;
}

function detectWin() {
  if (state.gameOver || countEmptyCells(state.board) > 0 || collectConflicts().size > 0) return;
  completePuzzle();
}

function completePuzzle() {
  state.gameOver = true;
  stopTimer();
  saveBestTime();
  saveGame();
  renderLeaderboard();
  showModal({
    eyebrow: "Success",
    title: "Puzzle Complete",
    message: "You solved the puzzle.",
    stats: buildResultStats(),
    playAgain: true
  });
}

function startTimer() {
  stopTimer();
  if (state.paused || state.gameOver) return;
  state.timerId = window.setInterval(() => {
    state.seconds++;
    els.timer.textContent = formatTime(state.seconds);
    saveGame();
  }, 1000);
}

function stopTimer() {
  if (state.timerId) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
}

function pauseGame() {
  if (state.gameOver || state.paused) return;
  state.paused = true;
  els.pauseOverlay.hidden = false;
  els.pauseButton.textContent = "Paused";
  stopTimer();
  render();
  saveGame();
}

function resumeGame() {
  if (state.gameOver || !state.paused) return;
  state.paused = false;
  els.pauseOverlay.hidden = true;
  els.pauseButton.textContent = "Pause";
  startTimer();
  render();
  saveGame();
}

function saveGame() {
  const data = {
    puzzle: state.puzzle,
    solution: state.solution,
    board: state.board,
    notes: state.notes,
    selected: state.selected,
    difficulty: state.difficulty,
    seconds: state.seconds,
    paused: state.paused,
    mistakes: state.mistakes,
    hintsLeft: state.hintsLeft,
    entries: state.entries,
    gameOver: state.gameOver,
    undoStack: state.undoStack,
    redoStack: state.redoStack
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadGame() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!isValidGrid(data.puzzle) || !isValidGrid(data.solution) || !isValidGrid(data.board)) return false;

    state.puzzle = data.puzzle;
    state.solution = data.solution;
    state.board = data.board;
    state.notes = normalizeNotes(data.notes);
    state.selected = normalizeSelection(data.selected);
    state.difficulty = DIFFICULTY[data.difficulty] ? data.difficulty : "medium";
    state.seconds = Number(data.seconds) || 0;
    state.paused = Boolean(data.paused);
    state.mistakes = Number(data.mistakes) || 0;
    state.hintsLeft = Number.isInteger(data.hintsLeft) ? data.hintsLeft : DIFFICULTY[state.difficulty].hints;
    state.entries = Number(data.entries) || 0;
    state.gameOver = Boolean(data.gameOver);
    state.undoStack = Array.isArray(data.undoStack) ? data.undoStack : [];
    state.redoStack = Array.isArray(data.redoStack) ? data.redoStack : [];

    els.difficulty.value = state.difficulty;
    els.pauseOverlay.hidden = !state.paused;
    els.pauseButton.textContent = state.paused ? "Paused" : "Pause";
    return true;
  } catch {
    return false;
  }
}

function saveBestTime() {
  const scores = getLeaderboard();
  scores.push({
    difficulty: state.difficulty,
    seconds: state.seconds,
    mistakes: state.mistakes,
    date: new Date().toISOString()
  });
  scores.sort((a, b) => a.seconds - b.seconds || a.mistakes - b.mistakes);
  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(scores.slice(0, 8)));
}

function getLeaderboard() {
  try {
    const scores = JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || "[]");
    return Array.isArray(scores) ? scores : [];
  } catch {
    return [];
  }
}

function renderLeaderboard() {
  els.leaderboard.textContent = "";
  const scores = getLeaderboard();

  if (!scores.length) {
    const item = document.createElement("li");
    item.textContent = "No completed games yet";
    els.leaderboard.appendChild(item);
    return;
  }

  for (const score of scores) {
    const item = document.createElement("li");
    item.textContent = `${capitalize(score.difficulty)} - ${formatTime(score.seconds)} - ${score.mistakes} mistakes`;
    els.leaderboard.appendChild(item);
  }
}

function toggleTheme() {
  const isDark = document.body.classList.toggle("dark");
  localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
  els.themeToggle.textContent = isDark ? "Light" : "Dark";
  els.themeToggle.setAttribute("aria-pressed", String(isDark));
}

function applySavedTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = saved === "dark" || (!saved && prefersDark);
  document.body.classList.toggle("dark", isDark);
  els.themeToggle.textContent = isDark ? "Light" : "Dark";
  els.themeToggle.setAttribute("aria-pressed", String(isDark));
}

function showModal({ eyebrow = "Result", title, message, stats = null, playAgain = false }) {
  els.modalEyebrow.textContent = eyebrow;
  els.modalTitle.textContent = title;
  els.modalMessage.textContent = message;
  els.modalPlayAgain.hidden = !playAgain;
  renderModalStats(stats);
  els.modal.hidden = false;
}

function renderModalStats(stats) {
  els.modalStats.textContent = "";
  if (!stats) {
    els.modalStats.hidden = true;
    return;
  }

  for (const item of stats) {
    const wrapper = document.createElement("div");
    const term = document.createElement("dt");
    const value = document.createElement("dd");
    term.textContent = item.label;
    value.textContent = item.value;
    wrapper.append(term, value);
    els.modalStats.appendChild(wrapper);
  }
  els.modalStats.hidden = false;
}

function buildResultStats() {
  return [
    { label: "Time", value: formatTime(state.seconds) },
    { label: "Mistakes", value: String(state.mistakes) },
    { label: "Difficulty", value: capitalize(state.difficulty) }
  ];
}

function getCell(row, col) {
  return els.cells[row][col];
}

function isGiven(row, col) {
  return state.puzzle[row][col] !== EMPTY;
}

function createEmptyGrid() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
}

function createNotesGrid() {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => []));
}

function cloneGrid(grid) {
  return grid.map((row) => [...row]);
}

function countEmptyCells(grid) {
  return grid.flat().filter((value) => value === EMPTY).length;
}

function cellKey(row, col) {
  return `${row}-${col}`;
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function shuffle(array) {
  for (let index = array.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [array[index], array[swapIndex]] = [array[swapIndex], array[index]];
  }
  return array;
}

function isValidGrid(grid) {
  return Array.isArray(grid)
    && grid.length === SIZE
    && grid.every((row) => Array.isArray(row)
      && row.length === SIZE
      && row.every((value) => Number.isInteger(value) && value >= 0 && value <= 9));
}

function normalizeNotes(notes) {
  if (!Array.isArray(notes) || notes.length !== SIZE) return createNotesGrid();

  return Array.from({ length: SIZE }, (_, row) => {
    if (!Array.isArray(notes[row]) || notes[row].length !== SIZE) {
      return Array.from({ length: SIZE }, () => []);
    }

    return Array.from({ length: SIZE }, (_, col) => {
      const values = notes[row][col];
      if (!Array.isArray(values)) return [];
      return values
        .filter((value) => Number.isInteger(value) && value >= 1 && value <= 9)
        .sort((a, b) => a - b);
    });
  });
}

function normalizeSelection(selection) {
  if (!selection) return null;
  const row = Number(selection.row);
  const col = Number(selection.col);
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row > 8 || col < 0 || col > 8) return null;
  return { row, col };
}
