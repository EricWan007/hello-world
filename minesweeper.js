(function () {
  'use strict';

  const DIFFICULTIES = {
    easy:   { rows: 9,  cols: 9,  mines: 10 },
    medium: { rows: 16, cols: 16, mines: 40 },
    hard:   { rows: 16, cols: 30, mines: 99 },
  };

  const boardEl = document.getElementById('board');
  const mineCounterEl = document.getElementById('mineCounter');
  const timerEl = document.getElementById('timer');
  const resetBtn = document.getElementById('resetBtn');
  const difficultyEl = document.getElementById('difficulty');
  const messageEl = document.getElementById('message');

  let rows, cols, totalMines;
  let grid;            // 二维数组：{ mine, revealed, flagged, adjacent }
  let cellEls;         // 对应的 DOM 元素
  let firstClick;      // 是否为第一次点击（首次点击必安全）
  let gameOver;
  let revealedCount;
  let flagCount;
  let timerId = null;
  let seconds = 0;

  /* ---------- 初始化 ---------- */

  function newGame() {
    const conf = DIFFICULTIES[difficultyEl.value];
    rows = conf.rows;
    cols = conf.cols;
    totalMines = conf.mines;

    firstClick = true;
    gameOver = false;
    revealedCount = 0;
    flagCount = 0;
    seconds = 0;

    stopTimer();
    timerEl.textContent = '000';
    resetBtn.textContent = '🙂';
    messageEl.textContent = '';
    messageEl.className = '';
    updateMineCounter();

    grid = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        row.push({ mine: false, revealed: false, flagged: false, adjacent: 0 });
      }
      grid.push(row);
    }

    renderBoard();
  }

  function renderBoard() {
    boardEl.innerHTML = '';
    boardEl.style.gridTemplateColumns = `repeat(${cols}, 32px)`;
    cellEls = [];

    for (let r = 0; r < rows; r++) {
      const rowEls = [];
      for (let c = 0; c < cols; c++) {
        const el = document.createElement('div');
        el.className = 'cell';
        el.dataset.r = r;
        el.dataset.c = c;
        el.addEventListener('click', onLeftClick);
        el.addEventListener('contextmenu', onRightClick);
        boardEl.appendChild(el);
        rowEls.push(el);
      }
      cellEls.push(rowEls);
    }
  }

  /* ---------- 布雷 ---------- */

  // 在首次点击后布雷，保证首次点击的格子及其周围没有雷
  function placeMines(safeR, safeC) {
    const positions = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1) continue;
        positions.push([r, c]);
      }
    }
    // 洗牌取前 totalMines 个
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    for (let i = 0; i < totalMines; i++) {
      const [r, c] = positions[i];
      grid[r][c].mine = true;
    }
    // 计算每个格子周围的雷数
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c].mine) continue;
        let count = 0;
        forEachNeighbor(r, c, (nr, nc) => { if (grid[nr][nc].mine) count++; });
        grid[r][c].adjacent = count;
      }
    }
  }

  function forEachNeighbor(r, c, fn) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) fn(nr, nc);
      }
    }
  }

  /* ---------- 事件处理 ---------- */

  function onLeftClick(e) {
    if (gameOver) return;
    const r = +e.currentTarget.dataset.r;
    const c = +e.currentTarget.dataset.c;
    const cell = grid[r][c];
    if (cell.flagged) return;

    if (firstClick) {
      firstClick = false;
      placeMines(r, c);
      startTimer();
    }

    if (cell.revealed) {
      chord(r, c); // 已翻开的数字格：双击式快速翻开
      return;
    }

    if (cell.mine) {
      lose(r, c);
      return;
    }

    reveal(r, c);
    checkWin();
  }

  function onRightClick(e) {
    e.preventDefault();
    if (gameOver) return;
    const r = +e.currentTarget.dataset.r;
    const c = +e.currentTarget.dataset.c;
    const cell = grid[r][c];
    if (cell.revealed) return;

    cell.flagged = !cell.flagged;
    flagCount += cell.flagged ? 1 : -1;
    cellEls[r][c].textContent = cell.flagged ? '🚩' : '';
    updateMineCounter();
  }

  /* ---------- 核心逻辑 ---------- */

  function reveal(r, c) {
    const cell = grid[r][c];
    if (cell.revealed || cell.flagged || cell.mine) return;

    cell.revealed = true;
    revealedCount++;
    const el = cellEls[r][c];
    el.classList.add('revealed');

    if (cell.adjacent > 0) {
      el.textContent = cell.adjacent;
      el.classList.add('n' + cell.adjacent);
      return;
    }

    // 空白格：用栈做泛洪展开，避免深递归
    const stack = [[r, c]];
    while (stack.length) {
      const [cr, cc] = stack.pop();
      forEachNeighbor(cr, cc, (nr, nc) => {
        const n = grid[nr][nc];
        if (n.revealed || n.flagged || n.mine) return;
        n.revealed = true;
        revealedCount++;
        const nEl = cellEls[nr][nc];
        nEl.classList.add('revealed');
        if (n.adjacent > 0) {
          nEl.textContent = n.adjacent;
          nEl.classList.add('n' + n.adjacent);
        } else {
          stack.push([nr, nc]);
        }
      });
    }
  }

  // 在已翻开的数字格上点击：若周围旗数等于数字，翻开其余未标记格
  function chord(r, c) {
    const cell = grid[r][c];
    if (cell.adjacent === 0) return;

    let flags = 0;
    forEachNeighbor(r, c, (nr, nc) => { if (grid[nr][nc].flagged) flags++; });
    if (flags !== cell.adjacent) return;

    let hitMine = null;
    forEachNeighbor(r, c, (nr, nc) => {
      const n = grid[nr][nc];
      if (!n.flagged && !n.revealed && n.mine && !hitMine) hitMine = [nr, nc];
    });

    if (hitMine) {
      lose(hitMine[0], hitMine[1]);
      return;
    }

    forEachNeighbor(r, c, (nr, nc) => reveal(nr, nc));
    checkWin();
  }

  /* ---------- 输赢 ---------- */

  function lose(r, c) {
    gameOver = true;
    stopTimer();
    resetBtn.textContent = '😵';
    messageEl.textContent = '💥 踩到雷了！点击笑脸重新开始';
    messageEl.className = 'lose';

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const cell = grid[i][j];
        const el = cellEls[i][j];
        if (cell.mine && !cell.flagged) {
          el.classList.add('revealed', 'mine');
          el.textContent = '💣';
        } else if (!cell.mine && cell.flagged) {
          el.classList.add('revealed', 'wrong-flag');
          el.textContent = '❌';
        }
      }
    }
    cellEls[r][c].classList.add('exploded');
    cellEls[r][c].textContent = '💥';
  }

  function checkWin() {
    if (gameOver) return;
    if (revealedCount === rows * cols - totalMines) {
      gameOver = true;
      stopTimer();
      resetBtn.textContent = '😎';
      messageEl.textContent = `🎉 恭喜通关！用时 ${seconds} 秒`;
      messageEl.className = 'win';
      // 自动给剩余的雷插上旗
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          const cell = grid[i][j];
          if (cell.mine && !cell.flagged) {
            cell.flagged = true;
            cellEls[i][j].textContent = '🚩';
          }
        }
      }
      flagCount = totalMines;
      updateMineCounter();
    }
  }

  /* ---------- 计时与计数 ---------- */

  function startTimer() {
    stopTimer();
    timerId = setInterval(() => {
      seconds = Math.min(seconds + 1, 999);
      timerEl.textContent = String(seconds).padStart(3, '0');
    }, 1000);
  }

  function stopTimer() {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function updateMineCounter() {
    const remaining = totalMines - flagCount;
    const sign = remaining < 0 ? '-' : '';
    mineCounterEl.textContent = sign + String(Math.abs(remaining)).padStart(3, '0');
  }

  /* ---------- 绑定 ---------- */

  resetBtn.addEventListener('click', newGame);
  difficultyEl.addEventListener('change', newGame);
  boardEl.addEventListener('contextmenu', (e) => e.preventDefault());

  newGame();
})();
