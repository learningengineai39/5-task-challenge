/**
 * Tic Tac Toe Pro - Advanced Modular Architecture
 */

// --- Storage Engine ---
const StorageEngine = (() => {
    const defaultStats = {
        xWins: 0, oWins: 0, draws: 0, totalGames: 0, totalMoves: 0, longestGame: 0
    };
    const defaultAchievements = {
        firstWin: false,
        streak3: false,
        streak10: false,
        drawMaster: false,
        fastWin: false
    };

    const getStats = () => JSON.parse(localStorage.getItem('ttt_stats')) || { ...defaultStats };
    const saveStats = (stats) => localStorage.setItem('ttt_stats', JSON.stringify(stats));
    
    const getAchievements = () => JSON.parse(localStorage.getItem('ttt_achieves')) || { ...defaultAchievements };
    const saveAchievements = (ach) => localStorage.setItem('ttt_achieves', JSON.stringify(ach));

    const getTheme = () => localStorage.getItem('ttt_theme') || 'theme-dark';
    const saveTheme = (theme) => localStorage.setItem('ttt_theme', theme);

    return { getStats, saveStats, getAchievements, saveAchievements, getTheme, saveTheme };
})();

// --- Sound Engine ---
const SoundEngine = (() => {
    const playTone = (freq, type, duration, vol) => {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            gain.gain.setValueAtTime(vol, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + duration);
        } catch (e) {
            console.log("AudioContext blocked or not supported.");
        }
    };

    return {
        moveX: () => playTone(440, 'sine', 0.1, 0.1),
        moveO: () => playTone(660, 'sine', 0.1, 0.1),
        win: () => {
            playTone(440, 'triangle', 0.1, 0.1);
            setTimeout(() => playTone(554, 'triangle', 0.1, 0.1), 100);
            setTimeout(() => playTone(659, 'triangle', 0.3, 0.1), 200);
        },
        draw: () => {
            playTone(330, 'sawtooth', 0.2, 0.1);
            setTimeout(() => playTone(220, 'sawtooth', 0.4, 0.1), 200);
        },
        click: () => playTone(880, 'square', 0.05, 0.05)
    };
})();

// --- AI Engine ---
const AIEngine = (() => {
    const checkWin = (board, player) => {
        const winPatterns = [
            [0,1,2], [3,4,5], [6,7,8],
            [0,3,6], [1,4,7], [2,5,8],
            [0,4,8], [2,4,6]
        ];
        return winPatterns.some(p => p.every(i => board[i] === player));
    };

    const getAvailableMoves = (board) => board.map((val, idx) => val === null ? idx : null).filter(val => val !== null);

    const getRandomMove = (board) => {
        const moves = getAvailableMoves(board);
        return moves[Math.floor(Math.random() * moves.length)];
    };

    const getMediumMove = (board, aiPlayer) => {
        const humanPlayer = aiPlayer === 'X' ? 'O' : 'X';
        const moves = getAvailableMoves(board);
        
        // 1. Win
        for (let i of moves) {
            let b = [...board]; b[i] = aiPlayer;
            if (checkWin(b, aiPlayer)) { GameEngine.setAiAnalysis("Executing winning move"); return i; }
        }
        // 2. Block
        for (let i of moves) {
            let b = [...board]; b[i] = humanPlayer;
            if (checkWin(b, humanPlayer)) { GameEngine.setAiAnalysis("Blocking opponent win"); return i; }
        }
        // 3. Center
        if (board[4] === null) { GameEngine.setAiAnalysis("Securing strategic center"); return 4; }
        
        GameEngine.setAiAnalysis("Making calculated move");
        return getRandomMove(board);
    };

    const minimax = (board, depth, isMaximizing, aiPlayer, humanPlayer) => {
        if (checkWin(board, aiPlayer)) return 10 - depth;
        if (checkWin(board, humanPlayer)) return depth - 10;
        if (getAvailableMoves(board).length === 0) return 0;

        if (isMaximizing) {
            let bestScore = -Infinity;
            for (let i of getAvailableMoves(board)) {
                board[i] = aiPlayer;
                bestScore = Math.max(minimax(board, depth + 1, false, aiPlayer, humanPlayer), bestScore);
                board[i] = null;
            }
            return bestScore;
        } else {
            let bestScore = Infinity;
            for (let i of getAvailableMoves(board)) {
                board[i] = humanPlayer;
                bestScore = Math.min(minimax(board, depth + 1, true, aiPlayer, humanPlayer), bestScore);
                board[i] = null;
            }
            return bestScore;
        }
    };

    const getHardMove = (board, aiPlayer) => {
        const humanPlayer = aiPlayer === 'X' ? 'O' : 'X';
        let bestScore = -Infinity;
        let move;
        const moves = getAvailableMoves(board);

        if (moves.length === 9) { GameEngine.setAiAnalysis("Optimal opening sequence"); return getRandomMove(board); }
        if (moves.length === 8 && board[4] === null) { GameEngine.setAiAnalysis("Securing center position"); return 4; }
        
        for (let i of moves) {
            board[i] = aiPlayer;
            let score = minimax(board, 0, false, aiPlayer, humanPlayer);
            board[i] = null;
            if (score > bestScore) {
                bestScore = score;
                move = i;
            }
        }
        GameEngine.setAiAnalysis("Computed optimal Minimax path");
        return move;
    };

    return {
        getMove: (board, difficulty, aiPlayer) => {
            if (difficulty === 'easy') { GameEngine.setAiAnalysis("Executing random move"); return getRandomMove(board); }
            if (difficulty === 'medium') return getMediumMove(board, aiPlayer);
            if (difficulty === 'hard') return getHardMove([...board], aiPlayer);
        }
    };
})();

// --- Game Engine ---
const GameEngine = (() => {
    let board = Array(9).fill(null);
    let currentPlayer = 'X';
    let currentStartingPlayer = 'X';
    let nextScheduledStarter = 'X';
    let startingPlayerMode = 'alternate';
    let isGameOver = false;
    let mode = 'pvp';
    let difficulty = 'medium';
    let timerDuration = 0;
    let timerInt;
    let timeRemaining;
    
    let tourneyMax = 1;
    let tourneyScores = { X: 0, O: 0 };
    let history = []; 
    let aiAnalysisMsg = "";

    const winPatterns = [
        [0,1,2], [3,4,5], [6,7,8],
        [0,3,6], [1,4,7], [2,5,8],
        [0,4,8], [2,4,6]
    ];

    const init = () => {
        board = Array(9).fill(null);
        
        if (startingPlayerMode === 'x') currentStartingPlayer = 'X';
        else if (startingPlayerMode === 'o') currentStartingPlayer = 'O';
        else if (startingPlayerMode === 'random') currentStartingPlayer = Math.random() < 0.5 ? 'X' : 'O';
        else {
            currentStartingPlayer = nextScheduledStarter;
            nextScheduledStarter = nextScheduledStarter === 'X' ? 'O' : 'X';
        }
        currentPlayer = currentStartingPlayer;
        
        isGameOver = false;
        history = [ [...board] ];
        aiAnalysisMsg = `Round Start: Player ${currentPlayer} goes first`;
        
        UIEngine.renderBoard(board);
        UIEngine.updateTurn(currentPlayer);
        UIEngine.clearWinningLine();
        UIEngine.updateControls(history.length, isGameOver);
        UIEngine.setAiAnalysis(aiAnalysisMsg);
        
        startTimer();
        if (isAITurn()) setTimeout(makeAIMove, 600);
    };

    const setMode = (m) => { 
        mode = m; 
        if(mode !== 'aivai') { tourneyScores = {X:0, O:0}; UIEngine.updateTournamentStatus(tourneyMax, tourneyScores); } 
        init(); 
    };
    const setDifficulty = (d) => { difficulty = d; init(); };
    const setStartingPlayerMode = (m) => { startingPlayerMode = m; nextScheduledStarter = 'X'; init(); };
    const setTimer = (t) => { timerDuration = parseInt(t); init(); };
    const setTournament = (t) => { tourneyMax = parseInt(t); tourneyScores = {X:0, O:0}; UIEngine.updateTournamentStatus(tourneyMax, tourneyScores); init(); };
    const setAiAnalysis = (msg) => { aiAnalysisMsg = msg; UIEngine.setAiAnalysis(msg); };

    const startTimer = () => {
        clearInterval(timerInt);
        if (timerDuration === 0) { UIEngine.updateTimer("--:--"); return; }
        timeRemaining = timerDuration;
        UIEngine.updateTimer(`00:${timeRemaining.toString().padStart(2, '0')}`);
        
        timerInt = setInterval(() => {
            timeRemaining--;
            if (timeRemaining < 0) {
                clearInterval(timerInt);
                switchTurn();
                if (isAITurn()) setTimeout(makeAIMove, 500);
            } else {
                UIEngine.updateTimer(`00:${timeRemaining.toString().padStart(2, '0')}`);
            }
        }, 1000);
    };

    const isAITurn = () => {
        if (isGameOver) return false;
        if (mode === 'aivai') return true;
        if (mode === 'pvai' && currentPlayer === 'O') return true;
        return false;
    };

    const makeAIMove = () => {
        if (!isAITurn()) return;
        const move = AIEngine.getMove(board, difficulty, currentPlayer);
        if (move !== undefined && move !== null) {
            handleCellClick(move);
        }
    };

    const switchTurn = () => {
        currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
        UIEngine.updateTurn(currentPlayer);
        startTimer();
    };

    const checkWinOrDraw = () => {
        for (let p of winPatterns) {
            const [a, b, c] = p;
            if (board[a] && board[a] === board[b] && board[a] === board[c]) {
                return { win: true, player: board[a], pattern: p };
            }
        }
        if (!board.includes(null)) return { draw: true };
        return null;
    };

    const updateStatsAndAchievements = (result) => {
        const stats = StorageEngine.getStats();
        const ach = StorageEngine.getAchievements();
        stats.totalGames++;
        stats.totalMoves += history.length - 1;
        if (history.length > stats.longestGame) stats.longestGame = history.length;

        if (result.win) {
            if (result.player === 'X') stats.xWins++;
            if (result.player === 'O') stats.oWins++;
            SoundEngine.win();
            
            tourneyScores[result.player]++;
            UIEngine.updateTournamentStatus(tourneyMax, tourneyScores);
            
            const neededToWin = Math.ceil(tourneyMax / 2);
            if (tourneyScores[result.player] >= neededToWin) {
                UIEngine.showGameOver(`Player ${result.player} Wins Series!`, `Final Score: X (${tourneyScores.X}) - O (${tourneyScores.O})`);
                tourneyScores = {X:0, O:0}; 
            } else {
                if (tourneyMax > 1) {
                    UIEngine.showGameOver(`Player ${result.player} Wins Round!`, `Next round starts shortly...`);
                    setTimeout(() => { UIEngine.hideModals(); init(); }, 2500); 
                } else {
                    UIEngine.showGameOver(`Player ${result.player} Wins!`, `A fantastic victory.`);
                }
            }

            ach.firstWin = true;
            if (stats.xWins >= 3 || stats.oWins >= 3) ach.streak3 = true;
            if (stats.xWins >= 10 || stats.oWins >= 10) ach.streak10 = true;
            if (history.length <= 6) ach.fastWin = true; 

        } else if (result.draw) {
            stats.draws++;
            SoundEngine.draw();
            ach.drawMaster = true;
            UIEngine.showGameOver("It's a Draw!", "A perfectly balanced game.");
            if (tourneyMax > 1) {
                setTimeout(() => { UIEngine.hideModals(); init(); }, 2500);
            }
        }

        StorageEngine.saveStats(stats);
        StorageEngine.saveAchievements(ach);
        UIEngine.updateScoreboard(stats);
        UIEngine.renderAchievements(ach);
    };

    const handleCellClick = (index) => {
        if (isGameOver || board[index]) return;
        if (mode === 'pvai' && currentPlayer === 'O' && !isAITurn()) return; 

        clearInterval(timerInt);
        board[index] = currentPlayer;
        history.push([...board]);
        UIEngine.renderBoard(board);
        UIEngine.updateControls(history.length, isGameOver);
        
        if (currentPlayer === 'X') SoundEngine.moveX();
        else SoundEngine.moveO();

        const result = checkWinOrDraw();
        if (result) {
            isGameOver = true;
            if (result.win) UIEngine.drawWinningLine(result.pattern);
            UIEngine.updateControls(history.length, isGameOver);
            updateStatsAndAchievements(result);
            return;
        }

        switchTurn();
        if (isAITurn()) {
            setTimeout(makeAIMove, Math.random() * 400 + 400); 
        }
    };

    const undo = () => {
        if (history.length <= 1 || isGameOver) return;
        
        history.pop(); 
        if (mode === 'pvai' && history.length > 1) history.pop(); // Pop AI move
        
        board = [...history[history.length - 1]];
        const movesMade = history.length - 1;
        currentPlayer = movesMade % 2 === 0 ? currentStartingPlayer : (currentStartingPlayer === 'X' ? 'O' : 'X');
        
        UIEngine.renderBoard(board);
        UIEngine.updateTurn(currentPlayer);
        UIEngine.updateControls(history.length, isGameOver);
        startTimer();
        
        if (isAITurn()) {
            setTimeout(makeAIMove, 500);
        }
    };

    const replay = () => {
        if (!isGameOver) return;
        UIEngine.clearWinningLine();
        let step = 0;
        const replayInt = setInterval(() => {
            UIEngine.renderBoard(history[step]);
            step++;
            if (step >= history.length) {
                clearInterval(replayInt);
                const result = checkWinOrDraw();
                if (result && result.win) UIEngine.drawWinningLine(result.pattern);
            }
        }, 600);
    };

    return { init, handleCellClick, setMode, setDifficulty, setStartingPlayerMode, setTimer, setTournament, undo, replay, setAiAnalysis };
})();

// --- UI Engine ---
const UIEngine = (() => {
    const boardEl = document.getElementById('game-board');
    const winningLine = document.getElementById('winning-line');
    const turnX = document.getElementById('player-x-turn');
    const turnO = document.getElementById('player-o-turn');
    const timerEl = document.getElementById('game-timer');
    const btnUndo = document.getElementById('btn-undo');
    const btnReplay = document.getElementById('btn-replay');
    const aiAnalysisEl = document.getElementById('ai-analysis');
    const tourneyStatus = document.getElementById('tournament-status');
    const overlay = document.getElementById('modal-overlay');
    const modals = document.querySelectorAll('.modal');

    const renderBoard = (board) => {
        boardEl.innerHTML = '';
        board.forEach((val, i) => {
            const cell = document.createElement('div');
            cell.className = `cell ${val ? val.toLowerCase() : ''} ${val ? 'taken' : ''}`;
            if (val) cell.innerHTML = `<span>${val}</span>`;
            cell.addEventListener('click', () => {
                if (!val) { SoundEngine.click(); GameEngine.handleCellClick(i); }
            });
            boardEl.appendChild(cell);
        });
    };

    const updateTurn = (player) => {
        turnX.classList.toggle('active', player === 'X');
        turnO.classList.toggle('active', player === 'O');
    };

    const updateTimer = (timeStr) => { timerEl.textContent = timeStr; };

    const drawWinningLine = (pattern) => {
        const cells = document.querySelectorAll('.cell');
        const first = cells[pattern[0]].getBoundingClientRect();
        const last = cells[pattern[2]].getBoundingClientRect();
        const boardRect = boardEl.getBoundingClientRect();

        const x1 = first.left + first.width / 2 - boardRect.left;
        const y1 = first.top + first.height / 2 - boardRect.top;
        const x2 = last.left + last.width / 2 - boardRect.left;
        const y2 = last.top + last.height / 2 - boardRect.top;

        winningLine.innerHTML = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line>`;
    };

    const clearWinningLine = () => { winningLine.innerHTML = ''; };

    const updateControls = (historyLen, isGameOver) => {
        btnUndo.disabled = historyLen <= 1 || isGameOver;
        btnReplay.disabled = !isGameOver;
    };

    const updateScoreboard = (stats) => {
        document.getElementById('score-x').textContent = stats.xWins;
        document.getElementById('score-o').textContent = stats.oWins;
        document.getElementById('score-draw').textContent = stats.draws;
        
        const totalWins = stats.xWins + stats.oWins;
        document.getElementById('stat-winrate-x').textContent = totalWins ? Math.round((stats.xWins / totalWins)*100) + '%' : '0%';
        document.getElementById('stat-winrate-o').textContent = totalWins ? Math.round((stats.oWins / totalWins)*100) + '%' : '0%';
        document.getElementById('stat-total').textContent = stats.totalGames;
        document.getElementById('stat-avg-moves').textContent = stats.totalGames ? (stats.totalMoves / stats.totalGames).toFixed(1) : 0;
    };

    const renderAchievements = (ach) => {
        const list = document.getElementById('achievements-list');
        list.innerHTML = `
            <li class="achievement ${ach.firstWin ? 'unlocked' : ''}">
                <i class="fas fa-medal"></i> <div><h4>First Blood</h4><p>Win your first game</p></div>
            </li>
            <li class="achievement ${ach.streak3 ? 'unlocked' : ''}">
                <i class="fas fa-fire"></i> <div><h4>Heating Up</h4><p>Win 3 games</p></div>
            </li>
            <li class="achievement ${ach.streak10 ? 'unlocked' : ''}">
                <i class="fas fa-crown"></i> <div><h4>Champion</h4><p>Win 10 games</p></div>
            </li>
            <li class="achievement ${ach.drawMaster ? 'unlocked' : ''}">
                <i class="fas fa-handshake"></i> <div><h4>Peacemaker</h4><p>Play a draw</p></div>
            </li>
            <li class="achievement ${ach.fastWin ? 'unlocked' : ''}">
                <i class="fas fa-bolt"></i> <div><h4>Speed Demon</h4><p>Win in 5 moves or less</p></div>
            </li>
        `;
    };

    const setAiAnalysis = (msg) => { aiAnalysisEl.textContent = msg; };

    const updateTournamentStatus = (max, scores) => {
        if (max > 1) tourneyStatus.innerHTML = `Best of ${max} Series: X (${scores.X}) - O (${scores.O})`;
        else tourneyStatus.innerHTML = '';
    };

    const showModal = (id) => {
        overlay.classList.add('active');
        document.getElementById(id).classList.add('active');
        SoundEngine.click();
    };

    const hideModals = () => {
        overlay.classList.remove('active');
        modals.forEach(m => m.classList.remove('active'));
    };

    const showGameOver = (title, message) => {
        document.getElementById('gameover-title').textContent = title;
        document.getElementById('gameover-message').textContent = message;
        showModal('modal-gameover');
    };

    const setupListeners = () => {
        document.getElementById('btn-theme').addEventListener('click', () => showModal('modal-theme'));
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const theme = e.target.dataset.theme;
                document.body.className = theme;
                StorageEngine.saveTheme(theme);
                hideModals();
            });
        });

        document.getElementById('btn-stats').addEventListener('click', () => showModal('modal-stats'));
        
        document.getElementById('btn-online').addEventListener('click', () => showModal('modal-online'));
        document.getElementById('btn-create-room').addEventListener('click', () => {
            const status = document.getElementById('online-status');
            status.textContent = "Creating room... Code: " + Math.random().toString(36).substring(2, 8).toUpperCase();
            setTimeout(() => status.textContent += " (Waiting for opponent)", 1000);
            setTimeout(() => { status.textContent = "Opponent joined! Starting..."; setTimeout(hideModals, 1000); }, 3000);
        });
        document.getElementById('btn-join-room').addEventListener('click', () => {
            const code = document.getElementById('room-code').value;
            if(!code) return;
            const status = document.getElementById('online-status');
            status.textContent = "Connecting to " + code + "...";
            setTimeout(() => { status.textContent = "Connected! Starting game..."; setTimeout(hideModals, 1000); }, 2000);
        });

        document.getElementById('select-mode').addEventListener('change', (e) => {
            document.getElementById('difficulty-group').style.display = e.target.value === 'pvp' ? 'none' : 'flex';
            GameEngine.setMode(e.target.value);
        });
        document.getElementById('select-starter').addEventListener('change', (e) => GameEngine.setStartingPlayerMode(e.target.value));
        document.getElementById('select-difficulty').addEventListener('change', (e) => GameEngine.setDifficulty(e.target.value));
        document.getElementById('select-timer').addEventListener('change', (e) => GameEngine.setTimer(e.target.value));
        document.getElementById('select-tournament').addEventListener('change', (e) => GameEngine.setTournament(e.target.value));

        document.getElementById('btn-start').addEventListener('click', () => { SoundEngine.click(); GameEngine.init(); });
        btnUndo.addEventListener('click', () => { SoundEngine.click(); GameEngine.undo(); });
        btnReplay.addEventListener('click', () => { SoundEngine.click(); GameEngine.replay(); });
        
        document.getElementById('btn-next-game').addEventListener('click', () => {
            hideModals();
            GameEngine.init();
        });

        document.querySelectorAll('.close-modal').forEach(btn => btn.addEventListener('click', hideModals));
        overlay.addEventListener('click', hideModals);
    };

    return {
        renderBoard, updateTurn, updateTimer, drawWinningLine, clearWinningLine,
        updateControls, updateScoreboard, renderAchievements, setAiAnalysis,
        updateTournamentStatus, showGameOver, setupListeners, hideModals
    };
})();

// --- App Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    document.body.className = StorageEngine.getTheme();
    UIEngine.updateScoreboard(StorageEngine.getStats());
    UIEngine.renderAchievements(StorageEngine.getAchievements());
    document.getElementById('difficulty-group').style.display = 'none'; 
    
    UIEngine.setupListeners();
    GameEngine.init();
});
