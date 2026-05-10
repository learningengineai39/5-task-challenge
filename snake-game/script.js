'use strict';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const els = {
  score: document.getElementById('score'),
  highScore: document.getElementById('highScore'),
  foodEaten: document.getElementById('foodEaten'),
  level: document.getElementById('level'),
  difficulty: document.getElementById('difficulty'),
  startBtn: document.getElementById('startBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  restartBtn: document.getElementById('restartBtn'),
  soundBtn: document.getElementById('soundBtn'),
  overlay: document.getElementById('overlay'),
  overlayKicker: document.getElementById('overlayKicker'),
  overlayTitle: document.getElementById('overlayTitle'),
  overlayText: document.getElementById('overlayText'),
  powerList: document.getElementById('powerList'),
  scorePopLayer: document.getElementById('scorePopLayer'),
  skins: [...document.querySelectorAll('.skin')],
  touchPad: document.querySelector('.touch-pad')
};

const STORAGE = {
  high: 'neonSnake.highScore',
  settings: 'neonSnake.settings'
};

const GRID_SIZE = 20;
const CELL_COUNT = GRID_SIZE * GRID_SIZE;
const LEVEL_POINTS = 12;
const MAX_LEVEL = 12;
const DIFFICULTY = {
  easy: { step: 150, bonusChance: 0.12, powerChance: 0.08, obstacleStart: 6 },
  medium: { step: 118, bonusChance: 0.16, powerChance: 0.11, obstacleStart: 4 },
  hard: { step: 92, bonusChance: 0.2, powerChance: 0.14, obstacleStart: 3 }
};
const DIRECTIONS = {
  ArrowUp: { x: 0, y: -1 },
  KeyW: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  KeyS: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  KeyA: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  KeyD: { x: 1, y: 0 }
};
const SKINS = {
  volt: ['#57ff6a', '#00f5ff'],
  ruby: ['#ff4668', '#ff3df2'],
  aqua: ['#00f5ff', '#4361ff'],
  solar: ['#ffd45c', '#ff7a3d']
};

let state = createState();
let audioCtx = null;
let animationId = null;
let lastFrame = 0;
let accumulator = 0;
let touchStart = null;

function createState() {
  const settings = loadSettings();
  return {
    status: 'start',
    snake: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }],
    direction: { x: 1, y: 0 },
    nextDirection: { x: 1, y: 0 },
    food: null,
    obstacles: [],
    score: 0,
    highScore: Number(localStorage.getItem(STORAGE.high) || 0),
    foodEaten: 0,
    level: 1,
    difficulty: settings.difficulty,
    skin: settings.skin,
    sound: settings.sound,
    activePowers: {},
    pendingGrowth: 0,
    deathFlash: 0,
    lastAteAt: 0,
    levelPulse: 0
  };
}

function loadSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE.settings) || '{}');
    return {
      difficulty: parsed.difficulty && DIFFICULTY[parsed.difficulty] ? parsed.difficulty : 'medium',
      skin: parsed.skin && SKINS[parsed.skin] ? parsed.skin : 'volt',
      sound: parsed.sound !== false
    };
  } catch {
    return { difficulty: 'medium', skin: 'volt', sound: true };
  }
}

function saveSettings() {
  localStorage.setItem(STORAGE.settings, JSON.stringify({
    difficulty: state.difficulty,
    skin: state.skin,
    sound: state.sound
  }));
}

function resetGame(startRunning = false) {
  const previous = {
    difficulty: els.difficulty.value,
    skin: state.skin,
    sound: state.sound,
    highScore: state.highScore
  };
  state = createState();
  Object.assign(state, previous);
  state.status = startRunning ? 'running' : 'start';
  state.food = spawnFood();
  state.obstacles = [];
  accumulator = 0;
  lastFrame = performance.now();
  syncUi();
  updateOverlay();
}

function startGame() {
  ensureAudio();
  if (state.status === 'gameover' || state.status === 'victory') {
    resetGame(true);
  } else {
    state.status = 'running';
  }
  els.pauseBtn.disabled = false;
  updateOverlay();
}

function togglePause() {
  if (state.status === 'running') {
    state.status = 'paused';
  } else if (state.status === 'paused') {
    state.status = 'running';
    lastFrame = performance.now();
  }
  updateOverlay();
  syncUi();
}

function currentStepMs() {
  const base = DIFFICULTY[state.difficulty].step;
  const levelDrop = (state.level - 1) * 5;
  const slow = hasPower('slow') ? 1.45 : 1;
  const speedBoost = hasPower('speed') ? 0.72 : 1;
  return Math.max(54, (base - levelDrop) * slow * speedBoost);
}

function gameLoop(now) {
  const delta = Math.min(90, now - lastFrame);
  lastFrame = now;
  updatePowerTimers(now);
  if (state.status === 'running') {
    accumulator += delta;
    const stepMs = currentStepMs();
    while (accumulator >= stepMs) {
      updateGame(now);
      accumulator -= stepMs;
    }
  }
  draw(now);
  animationId = requestAnimationFrame(gameLoop);
}

function updateGame(now) {
  state.direction = state.nextDirection;
  const head = state.snake[0];
  const next = { x: head.x + state.direction.x, y: head.y + state.direction.y };
  const invincible = hasPower('invincible');

  if (isWall(next) || isSnake(next) || isObstacle(next)) {
    if (!invincible) {
      endGame('gameover');
      return;
    }
    next.x = (next.x + GRID_SIZE) % GRID_SIZE;
    next.y = (next.y + GRID_SIZE) % GRID_SIZE;
    if (isObstacle(next)) removeObstacle(next);
  }

  state.snake.unshift(next);
  if (state.food && sameCell(next, state.food)) {
    consumeFood(state.food, now);
    state.food = spawnFood();
  }

  if (state.pendingGrowth > 0) {
    state.pendingGrowth--;
  } else {
    state.snake.pop();
  }

  if (hasPower('magnet') && state.food) {
    pullFoodTowardSnake();
  }
}

function consumeFood(food, now) {
  const double = hasPower('double');
  const points = food.points * (double ? 2 : 1);
  state.score += points;
  state.foodEaten++;
  state.pendingGrowth += food.growth;
  state.lastAteAt = now;

  if (food.power) {
    activatePower(food.power, now);
  }
  if (food.kind === 'shrink') {
    shrinkSnake(2);
  }
  if (food.kind === 'speed') {
    activatePower('speed', now);
  }

  showScorePop(food, `+${points}`, food.color);
  playSound(food.kind === 'bonus' ? 'bonus' : 'eat');
  updateProgression();
  syncUi();
}

function updateProgression() {
  const nextLevel = Math.min(MAX_LEVEL, Math.floor(state.score / LEVEL_POINTS) + 1);
  if (nextLevel > state.level) {
    state.level = nextLevel;
    state.levelPulse = performance.now();
    playSound('level');
    growObstacles();
  }
  if (state.score >= CELL_COUNT * 2) {
    endGame('victory');
  }
}

function growObstacles() {
  const config = DIFFICULTY[state.difficulty];
  if (state.level < config.obstacleStart) return;
  const target = Math.min(24, (state.level - config.obstacleStart + 1) * 3);
  while (state.obstacles.length < target) {
    const cell = randomEmptyCell();
    if (!cell) return;
    state.obstacles.push(cell);
  }
}

function spawnFood() {
  const cell = randomEmptyCell();
  if (!cell) return null;
  const config = DIFFICULTY[state.difficulty];
  const roll = Math.random();
  const powerRoll = Math.random();
  let food = { ...cell, kind: 'normal', points: 1, growth: 1, color: '#57ff6a', born: performance.now() };

  if (powerRoll < config.powerChance) {
    const powers = ['invincible', 'double', 'slow', 'magnet'];
    const power = powers[Math.floor(Math.random() * powers.length)];
    food = { ...food, kind: 'power', power, points: 2, growth: 1, color: powerColor(power) };
  } else if (roll < config.bonusChance) {
    food = { ...food, kind: 'bonus', points: 5, growth: 2, color: '#ffd45c' };
  } else if (roll < config.bonusChance + 0.08) {
    food = { ...food, kind: 'speed', points: 2, growth: 1, color: '#00f5ff' };
  } else if (roll < config.bonusChance + 0.13 && state.snake.length > 5) {
    food = { ...food, kind: 'shrink', points: 3, growth: 0, color: '#ff3df2' };
  }
  return food;
}

function randomEmptyCell() {
  const occupied = new Set([
    ...state.snake.map(cellKey),
    ...state.obstacles.map(cellKey),
    state.food ? cellKey(state.food) : ''
  ]);
  const free = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const key = `${x},${y}`;
      if (!occupied.has(key)) free.push({ x, y });
    }
  }
  return free.length ? free[Math.floor(Math.random() * free.length)] : null;
}

function activatePower(power, now) {
  state.activePowers[power] = now + powerDuration(power);
}

function powerDuration(power) {
  return {
    invincible: 6500,
    double: 9000,
    slow: 7000,
    magnet: 8500,
    speed: 4500
  }[power] || 6000;
}

function updatePowerTimers(now) {
  let changed = false;
  Object.entries(state.activePowers).forEach(([power, expires]) => {
    if (expires <= now) {
      delete state.activePowers[power];
      changed = true;
    }
  });
  if (changed) syncUi();
}

function hasPower(power) {
  return Boolean(state.activePowers[power] && state.activePowers[power] > performance.now());
}

function pullFoodTowardSnake() {
  const head = state.snake[0];
  const food = state.food;
  const options = [
    { x: food.x + Math.sign(head.x - food.x), y: food.y },
    { x: food.x, y: food.y + Math.sign(head.y - food.y) }
  ].filter(cell => !isWall(cell) && !isSnake(cell) && !isObstacle(cell));
  if (options.length && Math.random() < 0.35) {
    Object.assign(state.food, options[Math.floor(Math.random() * options.length)]);
  }
}

function shrinkSnake(amount) {
  for (let i = 0; i < amount && state.snake.length > 3; i++) {
    state.snake.pop();
  }
}

function endGame(status) {
  state.status = status;
  state.deathFlash = performance.now();
  if (state.score > state.highScore) {
    state.highScore = state.score;
    localStorage.setItem(STORAGE.high, String(state.highScore));
  }
  playSound(status === 'victory' ? 'level' : 'crash');
  syncUi();
  updateOverlay();
}

function setDirection(dir) {
  const next = typeof dir === 'string' ? directionFromName(dir) : dir;
  if (!next || state.status === 'gameover' || state.status === 'victory') return;
  const reversing = next.x + state.direction.x === 0 && next.y + state.direction.y === 0;
  if (!reversing) state.nextDirection = next;
}

function directionFromName(name) {
  return {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  }[name];
}

function draw(now) {
  const size = canvas.width;
  const cell = size / GRID_SIZE;
  ctx.clearRect(0, 0, size, size);
  drawBoard(size, cell, now);
  drawObstacles(cell);
  if (state.food) drawFood(state.food, cell, now);
  drawSnake(cell, now);
  drawBorder(size, now);
}

function drawBoard(size, cell, now) {
  ctx.fillStyle = '#03080e';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(151, 255, 233, 0.065)';
  ctx.lineWidth = 1;
  const offset = (now / 60) % cell;
  for (let i = -1; i <= GRID_SIZE; i++) {
    const p = Math.round(i * cell + offset);
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }
}

function drawSnake(cell, now) {
  const [primary, secondary] = SKINS[state.skin];
  state.snake.forEach((segment, index) => {
    const x = segment.x * cell;
    const y = segment.y * cell;
    const inset = index === 0 ? cell * 0.09 : cell * 0.14;
    const pulse = index === 0 ? Math.sin(now / 90) * 0.08 + 1 : 1;
    ctx.shadowBlur = index === 0 ? 22 : 13;
    ctx.shadowColor = hasPower('invincible') ? '#ffffff' : primary;
    ctx.fillStyle = index === 0 ? primary : blend(primary, secondary, Math.min(0.8, index / state.snake.length));
    roundRect(x + inset, y + inset, cell - inset * 2, cell - inset * 2, 7 * pulse);
    ctx.fill();
    if (index === 0) {
      ctx.fillStyle = '#031014';
      const eye = cell * 0.14;
      ctx.fillRect(x + cell * 0.32, y + cell * 0.3, eye, eye);
      ctx.fillRect(x + cell * 0.58, y + cell * 0.3, eye, eye);
    }
  });
  ctx.shadowBlur = 0;
}

function drawFood(food, cell, now) {
  const x = food.x * cell + cell / 2;
  const y = food.y * cell + cell / 2;
  const age = Math.min(1, (now - food.born) / 280);
  const pulse = Math.sin(now / 130) * 0.11 + 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(age * pulse, age * pulse);
  ctx.shadowBlur = 24;
  ctx.shadowColor = food.color;
  ctx.fillStyle = food.color;
  if (food.kind === 'bonus') {
    starPath(cell * 0.34, cell * 0.16);
  } else if (food.kind === 'power') {
    polygonPath(6, cell * 0.34);
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, cell * 0.3, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();
  ctx.shadowBlur = 0;
}

function drawObstacles(cell) {
  ctx.shadowBlur = 12;
  ctx.shadowColor = '#ff4668';
  state.obstacles.forEach(ob => {
    const pad = cell * 0.15;
    ctx.fillStyle = 'rgba(255, 70, 104, 0.88)';
    roundRect(ob.x * cell + pad, ob.y * cell + pad, cell - pad * 2, cell - pad * 2, 5);
    ctx.fill();
  });
  ctx.shadowBlur = 0;
}

function drawBorder(size, now) {
  const danger = state.status === 'gameover' && now - state.deathFlash < 800;
  ctx.lineWidth = danger ? 9 : 5;
  ctx.strokeStyle = danger ? '#ff4668' : 'rgba(0, 245, 255, 0.75)';
  ctx.shadowBlur = 18;
  ctx.shadowColor = ctx.strokeStyle;
  ctx.strokeRect(2.5, 2.5, size - 5, size - 5);
  ctx.shadowBlur = 0;
}

function roundRect(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function starPath(outer, inner) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 ? inner : outer;
    const angle = Math.PI / 5 * i - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function polygonPath(sides, radius) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = Math.PI * 2 * i / sides - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function blend(a, b, amount) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const mix = ca.map((value, i) => Math.round(value + (cb[i] - value) * amount));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}

function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function syncUi() {
  els.score.textContent = state.score;
  els.highScore.textContent = state.highScore;
  els.foodEaten.textContent = state.foodEaten;
  els.level.textContent = state.level;
  els.difficulty.value = state.difficulty;
  els.pauseBtn.disabled = state.status === 'start' || state.status === 'gameover' || state.status === 'victory';
  els.pauseBtn.textContent = state.status === 'paused' ? 'Resume' : 'Pause';
  els.startBtn.textContent = state.status === 'running' ? 'Running' : 'Start';
  els.startBtn.disabled = state.status === 'running';
  els.soundBtn.textContent = state.sound ? 'Sound On' : 'Sound Off';
  els.soundBtn.setAttribute('aria-pressed', String(state.sound));
  els.skins.forEach(btn => btn.classList.toggle('is-active', btn.dataset.skin === state.skin));
  renderPowers();
}

function renderPowers() {
  const now = performance.now();
  const powers = Object.entries(state.activePowers).filter(([, expires]) => expires > now);
  els.powerList.innerHTML = '';
  if (!powers.length) {
    const empty = document.createElement('span');
    empty.className = 'empty-power';
    empty.textContent = 'None active';
    els.powerList.append(empty);
    return;
  }
  powers.forEach(([power, expires]) => {
    const pill = document.createElement('span');
    pill.className = 'power-pill';
    pill.textContent = `${powerLabel(power)} ${Math.ceil((expires - now) / 1000)}s`;
    els.powerList.append(pill);
  });
}

function updateOverlay() {
  const visible = state.status !== 'running';
  els.overlay.classList.toggle('is-visible', visible);
  const copy = {
    start: ['Ready', 'Enter the grid', 'Choose a difficulty and press Start. Use arrows, WASD, or swipe to steer.'],
    paused: ['Paused', 'System hold', 'Press Resume or Space to return to the arena.'],
    gameover: ['Game Over', 'Collision detected', `Final score: ${state.score}. Restart to chase the high score.`],
    victory: ['Victory', 'Grid mastered', `You cleared victory mode with ${state.score} points.`]
  }[state.status];
  if (copy) {
    els.overlayKicker.textContent = copy[0];
    els.overlayTitle.textContent = copy[1];
    els.overlayText.textContent = copy[2];
  }
}

function showScorePop(food, text, color) {
  const pop = document.createElement('span');
  pop.className = 'score-pop';
  pop.textContent = text;
  pop.style.color = color;
  pop.style.left = `${(food.x + 0.5) / GRID_SIZE * 100}%`;
  pop.style.top = `${(food.y + 0.4) / GRID_SIZE * 100}%`;
  els.scorePopLayer.append(pop);
  window.setTimeout(() => pop.remove(), 850);
}

function powerColor(power) {
  return {
    invincible: '#ffffff',
    double: '#ffd45c',
    slow: '#00f5ff',
    magnet: '#ff3df2'
  }[power] || '#57ff6a';
}

function powerLabel(power) {
  return {
    invincible: 'Shield',
    double: 'Double',
    slow: 'Slow',
    magnet: 'Magnet',
    speed: 'Boost'
  }[power] || power;
}

function playSound(type) {
  if (!state.sound) return;
  ensureAudio();
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const config = {
    eat: [520, 0.08, 'square', 0.035],
    bonus: [760, 0.12, 'triangle', 0.045],
    crash: [110, 0.25, 'sawtooth', 0.06],
    level: [880, 0.18, 'sine', 0.045]
  }[type] || [420, 0.08, 'sine', 0.03];
  osc.type = config[2];
  osc.frequency.setValueAtTime(config[0], now);
  osc.frequency.exponentialRampToValueAtTime(type === 'crash' ? 42 : config[0] * 1.5, now + config[1]);
  gain.gain.setValueAtTime(config[3], now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + config[1]);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + config[1]);
}

function ensureAudio() {
  if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function isWall(cell) {
  return cell.x < 0 || cell.x >= GRID_SIZE || cell.y < 0 || cell.y >= GRID_SIZE;
}

function isSnake(cell) {
  return state.snake.some(segment => sameCell(segment, cell));
}

function isObstacle(cell) {
  return state.obstacles.some(obstacle => sameCell(obstacle, cell));
}

function removeObstacle(cell) {
  state.obstacles = state.obstacles.filter(obstacle => !sameCell(obstacle, cell));
}

function sameCell(a, b) {
  return a && b && a.x === b.x && a.y === b.y;
}

function cellKey(cell) {
  return `${cell.x},${cell.y}`;
}

function handleKeydown(event) {
  if (DIRECTIONS[event.code]) {
    event.preventDefault();
    if (state.status === 'start') startGame();
    setDirection(DIRECTIONS[event.code]);
  } else if (event.code === 'Space') {
    event.preventDefault();
    if (state.status === 'start' || state.status === 'gameover' || state.status === 'victory') startGame();
    else togglePause();
  }
}

function bindEvents() {
  window.addEventListener('keydown', handleKeydown);
  els.startBtn.addEventListener('click', startGame);
  els.pauseBtn.addEventListener('click', togglePause);
  els.restartBtn.addEventListener('click', () => resetGame(true));
  els.soundBtn.addEventListener('click', () => {
    state.sound = !state.sound;
    saveSettings();
    syncUi();
    if (state.sound) playSound('eat');
  });
  els.difficulty.addEventListener('change', () => {
    state.difficulty = els.difficulty.value;
    saveSettings();
    resetGame(false);
  });
  els.skins.forEach(btn => {
    btn.addEventListener('click', () => {
      state.skin = btn.dataset.skin;
      saveSettings();
      syncUi();
    });
  });
  els.touchPad.addEventListener('click', event => {
    const button = event.target.closest('[data-dir]');
    if (button) {
      if (state.status === 'start') startGame();
      setDirection(button.dataset.dir);
    }
  });
  canvas.addEventListener('touchstart', event => {
    const touch = event.changedTouches[0];
    touchStart = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });
  canvas.addEventListener('touchend', event => {
    if (!touchStart) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) {
      if (state.status === 'start') startGame();
      setDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    }
    touchStart = null;
  }, { passive: true });
}

function init() {
  state.food = spawnFood();
  els.difficulty.value = state.difficulty;
  bindEvents();
  syncUi();
  updateOverlay();
  animationId = requestAnimationFrame(gameLoop);
}

window.addEventListener('beforeunload', () => {
  if (animationId) cancelAnimationFrame(animationId);
  saveSettings();
});

init();
