/* ==========================================================================
   TIUM_ | Word Hunt - Interactive Game Engine
   ========================================================================== */

const WORDS = ["TIUM", "THINKING", "MEDIUM", "THIRD", "PLACE", "CONNECTION", "PHILOSOPHY", "ENLIGHTEN", "THOUGHTS", "HUMAN"];

// Grid Configuration
const GRID_SIZE = 15;
let grid = [];
let wordPlacements = []; // Array of { word, cells: [{r, c}], start: {r, c}, end: {r, c} }
let foundWords = new Set();
let gameTimer = null;
let secondsElapsed = 0;
let isGameActive = false;

// Selection State
let isDragging = false;
let startCell = null; // {r, c}
let currentCell = null; // {r, c}
let selectedCells = []; // Array of {r, c}

// Animation States
let brandAnimInterval = null;
let isBrandAnimActive = false;
let userHasInteracted = false;

// Default Leaderboard (Starts empty)
const DEFAULT_LEADERBOARD = [];

// DOM Elements
const boardEl = document.getElementById("board");
const dragOverlay = document.getElementById("drag-overlay");
const foundOverlay = document.getElementById("found-overlay");
const circleOverlay = document.getElementById("circle-overlay");
const gridContainer = document.getElementById("grid-container");
const wordBankEl = document.getElementById("word-bank");
const scoreCounter = document.getElementById("score-counter");
const timerCounter = document.getElementById("timer-counter");
const successOverlay = document.getElementById("success-overlay");
const finalTimeEl = document.getElementById("final-time");
const leaderboardBody = document.getElementById("leaderboard-body");
const playerNameInput = document.getElementById("player-name-input");
const submitScoreBtn = document.getElementById("submit-score-btn");
const submitScoreContainer = document.getElementById("submit-score-container");

/* ==========================================================================
   1. Word Search Generation Algorithm
   ========================================================================== */

function generateGrid() {
  let attempts = 0;
  let success = false;
  
  while (!success && attempts < 100) {
    attempts++;
    grid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(""));
    wordPlacements = [];
    
    // Sort words by length descending for better packing
    const sortedWords = [...WORDS].sort((a, b) => b.length - a.length);
    let placedAll = true;

    for (let word of sortedWords) {
      if (!placeWord(word)) {
        placedAll = false;
        break;
      }
    }
    
    if (placedAll) {
      success = true;
    }
  }

  if (!success) {
    console.error("Failed to generate grid layout after 100 attempts. Defaulting to fallback placement.");
  }

  // Fill empty spaces with random uppercase letters
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (grid[r][c] === "") {
        grid[r][c] = alphabet[Math.floor(Math.random() * alphabet.length)];
      }
    }
  }
}

function placeWord(word) {
  // 8 directions: [row_step, col_step]
  const directions = [
    [0, 1],   // E (across)
    [0, -1],  // W (backward)
    [1, 0],   // S (down)
    [-1, 0],  // N (up)
    [1, 1],   // SE (diag down-right)
    [1, -1],  // SW (diag down-left)
    [-1, 1],  // NE (diag up-right)
    [-1, -1]  // NW (diag up-left)
  ];
  
  // Randomize start locations and directions
  const shuffledDirections = [...directions].sort(() => Math.random() - 0.5);
  const startPoints = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      startPoints.push({ r, c });
    }
  }
  startPoints.sort(() => Math.random() - 0.5);

  for (let point of startPoints) {
    for (let dir of shuffledDirections) {
      const [dr, dc] = dir;
      if (canPlaceWordAt(word, point.r, point.c, dr, dc)) {
        const cells = [];
        for (let i = 0; i < word.length; i++) {
          const r = point.r + i * dr;
          const c = point.c + i * dc;
          grid[r][c] = word[i];
          cells.push({ r, c });
        }
        wordPlacements.push({
          word: word,
          cells: cells,
          start: { r: point.r, c: point.c },
          end: { r: point.r + (word.length - 1) * dr, c: point.c + (word.length - 1) * dc }
        });
        return true;
      }
    }
  }
  return false;
}

function canPlaceWordAt(word, startR, startC, dr, dc) {
  for (let i = 0; i < word.length; i++) {
    const r = startR + i * dr;
    const c = startC + i * dc;
    
    // Bounds check
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) {
      return false;
    }
    
    // Conflict check
    if (grid[r][c] !== "" && grid[r][c] !== word[i]) {
      return false;
    }
  }
  return true;
}

/* ==========================================================================
   2. DOM Grid Renderer
   ========================================================================== */

function renderBoard() {
  boardEl.innerHTML = "";
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.textContent = grid[r][c];
      cell.dataset.row = r;
      cell.dataset.col = c;
      boardEl.appendChild(cell);
    }
  }
  
  // Re-render the overlays to scale with the new grid
  updateFoundWordOverlays();
}

function renderWordBank() {
  wordBankEl.innerHTML = "";
  // Sort alphabetically for word bank listing
  const sortedWords = [...WORDS].sort();
  
  sortedWords.forEach(word => {
    const wordEl = document.createElement("div");
    wordEl.className = "bank-word";
    wordEl.id = `bank-word-${word}`;
    
    const bullet = document.createElement("span");
    bullet.className = "word-bullet";
    
    const text = document.createElement("span");
    text.textContent = word;
    
    wordEl.appendChild(bullet);
    wordEl.appendChild(text);
    wordBankEl.appendChild(wordEl);
    
    if (foundWords.has(word)) {
      wordEl.classList.add("found");
    }
  });
}

/* ==========================================================================
   3. Drag Selection Engine (Pointer Events)
   ========================================================================== */

function initPointerEvents() {
  boardEl.addEventListener("pointerdown", handlePointerDown);
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp);
}

function handlePointerDown(e) {
  // Only handle left clicks or touches
  if (e.button !== 0 && e.pointerType === "mouse") return;
  
  const cell = getCellFromEvent(e);
  if (!cell) return;
  
  // Stop looping brand animation on first interaction
  if (!userHasInteracted) {
    userHasInteracted = true;
    stopBrandAnimation();
  }
  
  isDragging = true;
  startCell = getCellCoords(cell);
  currentCell = startCell;
  selectedCells = [startCell];
  
  // Enable styling on cells
  clearSelectionStyles();
  cell.classList.add("selected-temp");
  
  // Start the timer on first select
  if (!isGameActive) {
    startTimer();
  }
  
  updateDragOverlay();
  
  // Prevent scrolling on touch screens
  if (e.pointerType === "touch") {
    e.preventDefault();
  }
}

function handlePointerMove(e) {
  if (!isDragging) return;
  
  const cell = getCellFromEvent(e);
  if (!cell) return;
  
  const cellCoords = getCellCoords(cell);
  if (cellCoords.r === currentCell.r && cellCoords.c === currentCell.c) return;
  
  currentCell = cellCoords;
  
  // Lock to 8 directions
  let dr = currentCell.r - startCell.r;
  let dc = currentCell.c - startCell.c;
  
  if (dr === 0 && dc === 0) {
    selectedCells = [startCell];
  } else {
    // Determine the step multiplier
    const stepR = Math.sign(dr);
    const stepC = Math.sign(dc);
    
    // Check if the current angle is close to diagonal, horizontal, or vertical
    const isHorizontal = dr === 0;
    const isVertical = dc === 0;
    const isDiagonal = Math.abs(dr) === Math.abs(dc);
    
    let validDir = false;
    let length = 0;
    let finalStepR = 0;
    let finalStepC = 0;
    
    if (isHorizontal) {
      validDir = true;
      length = Math.abs(dc);
      finalStepR = 0;
      finalStepC = stepC;
    } else if (isVertical) {
      validDir = true;
      length = Math.abs(dr);
      finalStepR = stepR;
      finalStepC = 0;
    } else if (isDiagonal) {
      validDir = true;
      length = Math.abs(dr);
      finalStepR = stepR;
      finalStepC = stepC;
    } else {
      // Quantize to nearest 45 degree angle
      const angle = Math.atan2(dr, dc);
      const octant = Math.round(angle / (Math.PI / 4));
      
      // Map octant index back to step values
      const octantMapping = [
        [0, 1],   // 0: East
        [1, 1],   // 1: Southeast
        [1, 0],   // 2: South
        [1, -1],  // 3: Southwest
        [0, -1],  // 4: West
        [-1, -1], // -3 / 5: Northwest
        [-1, 0],  // -2 / 6: North
        [-1, 1],  // -1 / 7: Northeast
      ];
      
      const mappedIndex = (octant + 8) % 8;
      const [mappedStepR, mappedStepC] = octantMapping[mappedIndex];
      
      validDir = true;
      // Project the drag distance onto the locked direction
      length = Math.max(Math.abs(dr), Math.abs(dc));
      finalStepR = mappedStepR;
      finalStepC = mappedStepC;
    }
    
    if (validDir) {
      selectedCells = [];
      for (let i = 0; i <= length; i++) {
        const nextR = startCell.r + i * finalStepR;
        const nextC = startCell.c + i * finalStepC;
        if (nextR >= 0 && nextR < GRID_SIZE && nextC >= 0 && nextC < GRID_SIZE) {
          selectedCells.push({ r: nextR, c: nextC });
        }
      }
    }
  }
  
  // Update styles
  clearSelectionStyles();
  selectedCells.forEach(coords => {
    const el = getCellElement(coords.r, coords.c);
    if (el) el.classList.add("selected-temp");
  });
  
  updateDragOverlay();
}

function handlePointerUp(e) {
  if (!isDragging) return;
  isDragging = false;
  
  validateSelection();
  clearSelectionStyles();
  clearDragOverlay();
}

function getCellFromEvent(e) {
  const target = document.elementFromPoint(e.clientX, e.clientY);
  if (target && target.classList.contains("cell")) {
    return target;
  }
  return null;
}

function getCellCoords(cellEl) {
  return {
    r: parseInt(cellEl.dataset.row, 10),
    c: parseInt(cellEl.dataset.col, 10)
  };
}

function getCellElement(r, c) {
  return boardEl.querySelector(`[data-row="${r}"][data-col="${c}"]`);
}

function clearSelectionStyles() {
  boardEl.querySelectorAll(".cell.selected-temp").forEach(el => {
    el.classList.remove("selected-temp");
  });
}

/* ==========================================================================
   4. Selection Validation
   ========================================================================== */

function validateSelection() {
  if (selectedCells.length < 2) return;
  
  const start = selectedCells[0];
  const end = selectedCells[selectedCells.length - 1];
  
  // Find matching word placement by coordinates
  const match = wordPlacements.find(placement => {
    const normalMatch = (placement.start.r === start.r && placement.start.c === start.c &&
                         placement.end.r === end.r && placement.end.c === end.c);
    const reverseMatch = (placement.start.r === end.r && placement.start.c === end.c &&
                          placement.end.r === start.r && placement.end.c === start.c);
    return normalMatch || reverseMatch;
  });

  if (match) {
    const word = match.word;
    if (!foundWords.has(word)) {
      foundWords.add(word);
      
      // Visually lock in found cells
      match.cells.forEach(coords => {
        const el = getCellElement(coords.r, coords.c);
        if (el) {
          el.classList.add("selected-found");
          // Add a subtle pop bounce animation
          el.animate([
            { transform: 'scale(1)' },
            { transform: 'scale(1.12)' },
            { transform: 'scale(1)' }
          ], { duration: 250, easing: 'ease-out' });
        }
      });
      
      // Update sidebar lists
      const bankWordEl = document.getElementById(`bank-word-${word}`);
      if (bankWordEl) bankWordEl.classList.add("found");
      
      // Add haptic feedback if supported
      if (navigator.vibrate) {
        navigator.vibrate(30);
      }
      
      scoreCounter.textContent = `${foundWords.size}/${WORDS.length}`;
      updateFoundWordOverlays();
      checkWinCondition();
    }
  }
}

/* ==========================================================================
   5. Dynamic SVG Capsule / Oval Drawing Engine
   ========================================================================== */

function getCellCenter(r, c) {
  const cell = getCellElement(r, c);
  if (!cell) return { x: 0, y: 0 };
  
  const containerRect = gridContainer.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();
  
  return {
    x: cellRect.left - containerRect.left + cellRect.width / 2,
    y: cellRect.top - containerRect.top + cellRect.height / 2,
    width: cellRect.width,
    height: cellRect.height
  };
}

/**
 * Creates a mathematically perfect rounded rectangle (capsule/oval)
 * wrapping from (x1, y1) to (x2, y2).
 */
function createCapsule(x1, y1, x2, y2, cellWidth, isAnim = false) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const angleDeg = (angle * 180) / Math.PI;
  const rad = cellWidth / 2 - 2; // tight outline around letters

  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("transform", `translate(${x1}, ${y1}) rotate(${angleDeg})`);

  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", -rad);
  rect.setAttribute("y", -rad);
  rect.setAttribute("width", length + 2 * rad);
  rect.setAttribute("height", 2 * rad);
  rect.setAttribute("rx", rad);
  rect.setAttribute("ry", rad);
  rect.setAttribute("fill", "none");
  rect.setAttribute("stroke", "#000000");
  rect.setAttribute("stroke-width", "1.5");

  if (isAnim) {
    rect.setAttribute("class", "brand-highlight-path animate-circle");
    const perimeter = 2 * length + 2 * Math.PI * rad;
    rect.style.strokeDasharray = perimeter;
    rect.style.strokeDashoffset = perimeter;
  }

  g.appendChild(rect);
  return g;
}

function updateDragOverlay() {
  clearDragOverlay();
  if (selectedCells.length < 2) return;
  
  const start = selectedCells[0];
  const end = selectedCells[selectedCells.length - 1];
  
  const p1 = getCellCenter(start.r, start.c);
  const p2 = getCellCenter(end.r, end.c);
  
  const g = createCapsule(p1.x, p1.y, p2.x, p2.y, p1.width);
  g.querySelector("rect").setAttribute("class", "drag-line");
  
  dragOverlay.appendChild(g);
}

function clearDragOverlay() {
  dragOverlay.innerHTML = "";
}

function updateFoundWordOverlays() {
  foundOverlay.innerHTML = "";
  foundWords.forEach(word => {
    const placement = wordPlacements.find(p => p.word === word);
    if (!placement) return;
    
    const p1 = getCellCenter(placement.start.r, placement.start.c);
    const p2 = getCellCenter(placement.end.r, placement.end.c);
    
    const g = createCapsule(p1.x, p1.y, p2.x, p2.y, p1.width);
    g.querySelector("rect").setAttribute("class", "found-line");
    
    foundOverlay.appendChild(g);
  });
}

/* ==========================================================================
   6. Looping Brand Circle Animation
   ========================================================================== */

function startBrandAnimation() {
  if (isBrandAnimActive) return;
  isBrandAnimActive = true;
  
  // Trigger immediately
  triggerBrandCircle();
  
  // Set up the interval loop (every 8 seconds)
  brandAnimInterval = setInterval(() => {
    if (!userHasInteracted) {
      triggerBrandCircle();
    }
  }, 8000);
}

function stopBrandAnimation() {
  isBrandAnimActive = false;
  if (brandAnimInterval) {
    clearInterval(brandAnimInterval);
    brandAnimInterval = null;
  }
  circleOverlay.innerHTML = "";
}

function triggerBrandCircle() {
  circleOverlay.innerHTML = "";
  
  // Find positions for "THINKING" and "MEDIUM"
  const thinkingPlacement = wordPlacements.find(p => p.word === "THINKING");
  const mediumPlacement = wordPlacements.find(p => p.word === "MEDIUM");
  
  if (thinkingPlacement) {
    drawCircleAroundWord(thinkingPlacement, 0); // Animate immediately
  }
  if (mediumPlacement) {
    drawCircleAroundWord(mediumPlacement, 400); // Slight delay for staging
  }
}

function drawCircleAroundWord(placement, delayMs) {
  setTimeout(() => {
    if (userHasInteracted) return;
    
    const p1 = getCellCenter(placement.start.r, placement.start.c);
    const p2 = getCellCenter(placement.end.r, placement.end.c);
    
    const g = createCapsule(p1.x, p1.y, p2.x, p2.y, p1.width, true);
    circleOverlay.appendChild(g);
  }, delayMs);
}

/* ==========================================================================
   7. Leaderboard Logic (Vercel Serverless API + Local Storage fallback)
   ========================================================================== */

async function renderLeaderboard(highlightName = null, highlightTime = null) {
  let list = [];
  try {
    const res = await fetch("/api/scores");
    if (!res.ok) throw new Error("API failed");
    list = await res.json();
  } catch (e) {
    console.warn("Could not fetch global leaderboard, falling back to local storage:", e);
    // Fallback: load local scores
    const localData = localStorage.getItem("tium_leaderboard");
    if (localData) {
      try {
        list = JSON.parse(localData);
      } catch (err) {
        list = DEFAULT_LEADERBOARD;
      }
    } else {
      list = DEFAULT_LEADERBOARD;
    }
  }

  // Sort and display top 5
  list.sort((a, b) => a.time - b.time);
  leaderboardBody.innerHTML = "";
  const topScores = list.slice(0, 5);

  if (topScores.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.setAttribute("colspan", "3");
    td.style.textAlign = "center";
    td.style.color = "var(--ink-muted)";
    td.style.fontStyle = "italic";
    td.style.padding = "16px 0";
    td.textContent = "No scores submitted yet. Be the first!";
    tr.appendChild(td);
    leaderboardBody.appendChild(tr);
    return;
  }

  topScores.forEach((entry, idx) => {
    const tr = document.createElement("tr");

    const rankTd = document.createElement("td");
    rankTd.className = "rank-cell";
    rankTd.textContent = idx + 1;

    const nameTd = document.createElement("td");
    nameTd.textContent = entry.name;

    const timeTd = document.createElement("td");
    timeTd.className = "time-cell";
    timeTd.textContent = formatTime(entry.time);

    tr.appendChild(rankTd);
    tr.appendChild(nameTd);
    tr.appendChild(timeTd);

    if (highlightName && entry.name === highlightName && entry.time === highlightTime) {
      tr.style.fontWeight = "bold";
      tr.style.backgroundColor = "rgba(0, 0, 0, 0.05)";
    }

    leaderboardBody.appendChild(tr);
  });
}

async function saveScore(name, timeSecs) {
  const cleanedName = name.trim().toUpperCase() || "GUEST";
  
  // 1. Save local backup copy in localStorage
  try {
    const localData = localStorage.getItem("tium_leaderboard");
    let localList = localData ? JSON.parse(localData) : [...DEFAULT_LEADERBOARD];
    localList.push({ name: cleanedName, time: timeSecs, date: new Date().toLocaleDateString() });
    localStorage.setItem("tium_leaderboard", JSON.stringify(localList));
  } catch (e) {
    console.error("Failed to write to local storage:", e);
  }

  // 2. POST to the global database API
  try {
    const response = await fetch("/api/scores", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name: cleanedName, time: timeSecs })
    });
    
    if (!response.ok) throw new Error("POST failed");
    
    // Refresh the leaderboard showing the global ranking, highlighting the new entry
    renderLeaderboard(cleanedName, timeSecs);
  } catch (e) {
    console.error("Could not sync score to global leaderboard:", e);
    // Refresh using local scores instead
    renderLeaderboard(cleanedName, timeSecs);
  }
}

/* ==========================================================================
   8. Timer & Progress Management
   ========================================================================== */

function formatTime(sec) {
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  return `${min.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function startTimer() {
  isGameActive = true;
  secondsElapsed = 0;
  timerCounter.textContent = "00:00";
  
  if (gameTimer) clearInterval(gameTimer);
  gameTimer = setInterval(() => {
    secondsElapsed++;
    timerCounter.textContent = formatTime(secondsElapsed);
  }, 1000);
}

function stopTimer() {
  isGameActive = false;
  if (gameTimer) {
    clearInterval(gameTimer);
    gameTimer = null;
  }
}

function checkWinCondition() {
  if (foundWords.size === WORDS.length) {
    stopTimer();
    
    // Trigger canvas celebration confetti
    if (typeof confetti === 'function') {
      const duration = 2.5 * 1000;
      const end = Date.now() + duration;
      
      (function frame() {
        confetti({
          particleCount: 3,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: ['#000000', '#555555', '#aaaaaa']
        });
        confetti({
          particleCount: 3,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: ['#000000', '#555555', '#aaaaaa']
        });
        
        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      }());
    }
    
    // Show success overlay
    setTimeout(() => {
      finalTimeEl.textContent = timerCounter.textContent;
      playerNameInput.value = "";
      submitScoreContainer.style.display = "flex"; // Show input fields
      successOverlay.classList.add("active");
    }, 800);
  }
}

/* ==========================================================================
   9. Toolbar Actions (Shuffle, Reset, Solution)
   ========================================================================== */

function shuffleGame() {
  stopTimer();
  foundWords.clear();
  scoreCounter.textContent = `0/${WORDS.length}`;
  timerCounter.textContent = "00:00";
  
  userHasInteracted = false;
  
  generateGrid();
  renderBoard();
  renderWordBank();
  
  startBrandAnimation();
}

function resetGame() {
  stopTimer();
  foundWords.clear();
  scoreCounter.textContent = `0/${WORDS.length}`;
  timerCounter.textContent = "00:00";
  
  userHasInteracted = false;
  
  // Clear visually found styles
  boardEl.querySelectorAll(".cell.selected-found").forEach(el => {
    el.classList.remove("selected-found");
  });
  
  boardEl.querySelectorAll(".cell.reveal-solution").forEach(el => {
    el.classList.remove("reveal-solution");
  });
  
  updateFoundWordOverlays();
  renderWordBank();
  
  startBrandAnimation();
}

let isSolutionRevealed = false;
function toggleSolution() {
  isSolutionRevealed = !isSolutionRevealed;
  
  const revealBtn = document.getElementById("reveal-btn");
  if (isSolutionRevealed) {
    revealBtn.textContent = "Hide Solution";
    
    // Highlight cells belonging to solutions
    wordPlacements.forEach(placement => {
      placement.cells.forEach(coords => {
        const el = getCellElement(coords.r, coords.c);
        if (el) el.classList.add("reveal-solution");
      });
    });
  } else {
    revealBtn.textContent = "Show Solution";
    boardEl.querySelectorAll(".cell.reveal-solution").forEach(el => {
      el.classList.remove("reveal-solution");
    });
  }
}

/* ==========================================================================
   10. Initialization & Event Bindings
   ========================================================================== */

function init() {
  generateGrid();
  renderBoard();
  renderWordBank();
  renderLeaderboard();
  initPointerEvents();
  startBrandAnimation();
  
  // Toolbar buttons bindings
  document.getElementById("shuffle-btn").addEventListener("click", shuffleGame);
  document.getElementById("reset-btn").addEventListener("click", resetGame);
  document.getElementById("reveal-btn").addEventListener("click", toggleSolution);
  
  // Success overlay score submission
  submitScoreBtn.onclick = () => {
    const name = playerNameInput.value.trim() || "GUEST";
    saveScore(name, secondsElapsed);
    submitScoreContainer.style.display = "none"; // Hide after save
  };
  
  // Success overlay buttons
  document.getElementById("play-again-btn").addEventListener("click", () => {
    successOverlay.classList.remove("active");
    shuffleGame();
  });
  document.getElementById("close-success-btn").addEventListener("click", () => {
    successOverlay.classList.remove("active");
  });
  
  // Resizing events to adjust overlays
  window.addEventListener("resize", () => {
    updateFoundWordOverlays();
    if (isBrandAnimActive && !userHasInteracted) {
      triggerBrandCircle();
    }
  });
}

// Kickstart
document.addEventListener("DOMContentLoaded", init);
