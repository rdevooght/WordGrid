const POINTS_SYSTEM = {
  1: { category: "rare", multiplier: 2, isThemeWord: false },
  2: { category: "common", multiplier: 1, isThemeWord: false },
  theme: { category: "theme-word", multiplier: 2, isThemeWord: true },
};

const ABILITIES_CONFIG = [
  {
    id: "small-hint",
    name: "Small Hint",
    icon: "💡",
    cost: 5,
    action: "useSmallHint",
    condition: "canSmallHint",
  },
  {
    id: "big-hint",
    name: "Big Hint",
    icon: "✨",
    cost: 10,
    action: "useBigHint",
    condition: "canBigHint",
  },
  {
    id: "bomb",
    name: "Bomb",
    icon: "💣",
    cost: 5,
    action: "activateBomb",
    condition: "canBomb",
    activeMode: "bomb",
  },
  {
    id: "swap",
    name: "Swap",
    icon: "🔄",
    cost: 5,
    action: "activateSwap",
    condition: "canSwap",
    activeMode: "swap",
  },
  {
    id: "destruct",
    name: "Destruct",
    icon: "💥",
    cost: 0,
    action: "destructLastWord",
    condition: "canDestruct",
  },
];

function game() {
  return {
    grid: [],
    width: 6,
    height: 8, // 6x8 grid
    get themeName() {
      return typeof DEFAULT_THEME !== "undefined"
        ? DEFAULT_THEME.name
        : "Unknown Theme";
    },
    letters:
      "EEEEEEEEEEEEAAAAAAAAAIIIIIIIIIOOOOOOOONNNNNNRRRRRRTTTTTTLLLLSSSSUUUDDDDGGGGBBCCMMPPFFHHVVWWYYKJXQZ",
    selectedIndices: [],
    currentWord: "",
    score: 0,
    timeLeft: 180, // 3 minutes
    timer: null,
    gameMode: "theme",
    gameStarted: false,
    gameOver: false,
    validWordsHistory: [],
    lastWordCategory: "",
    highScore: localStorage.getItem("wordRushHighScore") || 0,

    // Theme State
    themeWords: [],
    foundThemeWords: [],
    totalThemeWords: 0,
    columnRefillIndices: [], // Track current 'top' row for each column in theme
    dictionary: null, // Optimization: Map word -> category
    prefixes: null, // Set of valid 2-3 letter prefixes

    // Destruct Button State
    lastFoundWordIndices: [], // Indices of the last valid word (for highlighting)
    lastFoundWord: "", // The actual word string

    // Mana System
    mana: 0,
    maxMana: 30,

    // Abilities Configuration
    get abilitiesList() {
      return ABILITIES_CONFIG;
    },

    // Ability Mode (for bomb/swap that require clicks)
    activeAbility: null, // null, 'bomb', 'swap'
    swapFirstIndex: null, // For swap: stores first clicked cell

    // Tap Selection State
    currentGestureIndices: [], // Track indices visited in current gesture
    isPotentialSubmit: false, // Flag if gesture started on last selected cell

    // Hint highlighting
    hintHighlightIndices: [], // Cells highlighted by hint ability

    // UI State
    showToast: false,
    toastMessage: "",

    // computed checks
    get isValidWord() {
      return this.checkWord(this.currentWord);
    },

    // Check if all theme words have been found
    get allThemeWordsFound() {
      return this.gameMode === "theme" && this.themeWords.length === 0;
    },

    // Check if destruct button should be enabled
    get canDestruct() {
      return this.allThemeWordsFound && this.lastFoundWordIndices.length > 0;
    },

    // Ability availability checks
    get canSmallHint() {
      return this.mana >= 2;
    },
    get canBigHint() {
      return this.mana >= 5;
    },
    get canBomb() {
      return this.allThemeWordsFound && this.mana >= 5;
    },
    get canSwap() {
      return this.allThemeWordsFound && this.mana >= 5;
    },

    // Computed for missing theme words
    get missingThemeWords() {
      if (!this.gameOver || this.gameMode !== "theme") return [];
      return this.themeWords; // themeWords only contains unfound ones as we splice them out
    },

    initGame() {
      if (this.gameMode === "theme") {
        if (typeof DEFAULT_THEME !== "undefined") {
          this.width = DEFAULT_THEME["grid-size"][0];
          this.height = DEFAULT_THEME["grid-size"][1];
          this.themeWords = [...DEFAULT_THEME["theme-words"]];
          this.totalThemeWords = this.themeWords.length;
          this.foundThemeWords = [];
        }
      }
      this.validWordsHistory = [];
      this.processDictionary();
      this.generateGrid();
      // Timer not started automatically anymore
      this.gameStarted = false;
      this.gameOver = false;
      this.score = 0;
    },

    startGame() {
      this.gameStarted = true;
      this.startTimer();
    },

    generateGrid() {
      this.grid = [];

      if (this.gameMode === "theme" && typeof DEFAULT_THEME !== "undefined") {
        // Load from Theme
        const themeGrid = DEFAULT_THEME.grid; // Array of strings "ABCDE"
        const totalRows = themeGrid.length;
        const startRow = Math.max(0, totalRows - this.height);

        // Initialize refill indices for each column
        // They point to the row "above" the visible grid in the theme
        this.columnRefillIndices = new Array(this.width).fill(startRow - 1);

        for (let y = 0; y < this.height; y++) {
          // Use rows from the bottom of the theme grid
          const themeRowIndex = startRow + y;
          const row = themeRowIndex < totalRows ? themeGrid[themeRowIndex] : "";

          for (let x = 0; x < this.width; x++) {
            const letter =
              row && x < row.length ? row[x] : this.getRandomLetter();

            this.grid.push({
              id: Math.random().toString(36).substr(2, 9),
              letter: letter,
              x: x,
              y: y,
              status: "idle",
            });
          }
        }
      } else {
        // Random Generation
        this.columnRefillIndices = new Array(this.width).fill(-1); // No theme refill
        for (let i = 0; i < this.width * this.height; i++) {
          this.grid.push({
            id: Math.random().toString(36).substr(2, 9),
            letter: this.getRandomLetter(),
            x: i % this.width,
            y: Math.floor(i / this.width),
            status: "idle", // idle, selected, removed
          });
        }
      }
    },

    getRandomLetter() {
      return this.letters.charAt(
        Math.floor(Math.random() * this.letters.length),
      );
    },

    getCellClasses(cell) {
      let classes = "tile"; // Base class
      const cellIndex = this.grid.indexOf(cell);
      if (this.selectedIndices.includes(cellIndex)) {
        classes += " selected";
      }
      if (this.lastFoundWordIndices.includes(cellIndex)) {
        classes += " highlighted";
      }
      if (this.hintHighlightIndices.includes(cellIndex)) {
        classes += " hint-highlight";
      }
      if (this.swapFirstIndex === cellIndex) {
        classes += " swap-selected";
      }
      if (cell.status === "removed") {
        classes += " removed";
      }
      return classes;
    },

    tileBounds: [],
    pathViewBox: { width: 100, height: 100 },

    handleTouchStart(e) {
      this.handleInputStart(e.touches[0].clientX, e.touches[0].clientY);
    },
    handleTouchMove(e) {
      this.handleInputMove(e.touches[0].clientX, e.touches[0].clientY);
    },
    handleTouchEnd(e) {
      if (e.cancelable) e.preventDefault(); // Good practice to prevent mouse compat events if handled
      this.handleInputEnd();
    },
    handleMouseDown(e) {
      this.isDragging = true;
      this.handleInputStart(e.clientX, e.clientY);
    },

    handleMouseMove(e) {
      if (!this.isDragging) return;
      this.handleInputMove(e.clientX, e.clientY);
    },

    handleMouseUp() {
      if (this.isDragging) {
        this.isDragging = false;
        this.handleInputEnd();
      }
    },

    handleInputStart(x, y) {
      if (this.gameOver) return;

      if (!this.gameStarted) {
        this.startGame();
        return;
      }

      // Recalculate physical positions of tiles
      this.calculateTileBounds();

      // Check if we are interacting with a specific cell for abilities
      if (this.activeAbility) {
        const index = this.getTileIndexAt(x, y);
        if (index !== -1) {
          this.handleGridClick(index);
          return; // Don't start dragging if we used an ability
        } else {
          // Clicked outside any tile -> Cancel ability
          this.cancelAbility();
          // Don't return, allow falling through to start normal drag potentially?
          // Actually, if we cancel, we probably want to let the user start dragging immediately.
        }
      }

      const index = this.getTileIndexAt(x, y);

      // Initialize gesture tracking
      this.currentGestureIndices = [];
      this.isPotentialSubmit = false;

      if (index !== -1) {
        this.currentGestureIndices.push(index);

        // DECISION LOGIC: Should we keep existing selection or start new?
        let keepSelection = false;

        if (this.selectedIndices.length > 0) {
          const lastIndex =
            this.selectedIndices[this.selectedIndices.length - 1];

          // Case A: Tapped on last selected cell (Potential Submit)
          if (index === lastIndex) {
            keepSelection = true;
            this.isPotentialSubmit = true;
          }
          // Case B: Tapped on neighbor (Continue Path)
          else if (
            this.isNeighbor(lastIndex, index) &&
            !this.selectedIndices.includes(index)
          ) {
            keepSelection = true;
          }
          // Case C: Tapped on previous cell (Backtrack)
          else if (
            this.selectedIndices.length > 1 &&
            index === this.selectedIndices[this.selectedIndices.length - 2]
          ) {
            keepSelection = true;
          }
        }

        if (!keepSelection) {
          // Reset selection if starting fresh or disjoint click
          this.selectedIndices = [];
          this.currentWord = "";
          this.lastWordCategory = "";

          // Clear hint highlights when starting new selection
          this.hintHighlightIndices = [];
          // Clear previous word highlight when starting new selection
          this.lastFoundWordIndices = [];
          this.lastFoundWord = "";
        }
      } else {
        // Clicked outside - clear everything
        this.selectedIndices = [];
        this.currentWord = "";
      }

      this.detectCell(x, y);
    },

    getTileIndexAt(x, y) {
      if (!this.tileBounds || this.tileBounds.length === 0) return -1;

      for (let i = 0; i < this.tileBounds.length; i++) {
        const bound = this.tileBounds[i];
        if (!bound) continue;
        const dx = x - bound.cx;
        const dy = y - bound.cy;
        if (dx * dx + dy * dy < bound.radiusSq) {
          return i;
        }
      }
      return -1;
    },

    calculateTileBounds() {
      this.tileBounds = [];
      const tiles = document.querySelectorAll(".tile");
      const gridWrapper = document.querySelector(".grid-wrapper");
      if (gridWrapper) {
        const wrapperRect = gridWrapper.getBoundingClientRect();
        this.pathViewBox = {
          width: wrapperRect.width,
          height: wrapperRect.height,
        };
      }
      tiles.forEach((tile) => {
        const rect = tile.getBoundingClientRect();
        const index = parseInt(tile.dataset.index);
        if (!isNaN(index)) {
          // Use a hit radius slightly larger than half width (0.55) to ensure
          // connectivity between orthogonal neighbors (overlap) while still
          // keeping the corners (distance ~0.7) as 'dead zones' for diagonals.
          const size = Math.min(rect.width, rect.height);
          this.tileBounds[index] = {
            cx: rect.left + rect.width / 2,
            cy: rect.top + rect.height / 2,
            radiusSq: Math.pow(size * 0.55, 2),
          };
        }
      });
    },

    handleInputMove(x, y) {
      if (this.gameOver) return;
      this.detectCell(x, y);
    },

    detectCell(x, y) {
      if (this.tileBounds.length === 0) return;

      // Find closest valid tile within radius
      let bestIndex = -1;
      let minDistSq = Infinity;

      for (let i = 0; i < this.tileBounds.length; i++) {
        const bound = this.tileBounds[i];
        if (!bound) continue;

        if (this.grid[i] && this.grid[i].status === "removed") continue;

        const dx = x - bound.cx;
        const dy = y - bound.cy;
        const distSq = dx * dx + dy * dy;

        if (distSq < bound.radiusSq && distSq < minDistSq) {
          minDistSq = distSq;
          bestIndex = i;
        }
      }

      if (bestIndex === -1) return; // No hit

      const index = bestIndex; // Found a hit

      // Track unique cells visited in this gesture
      if (!this.currentGestureIndices.includes(index)) {
        this.currentGestureIndices.push(index);
      }

      // Logic for selection
      // 1. If empty selection, add it
      if (this.selectedIndices.length === 0) {
        this.addToSelection(index);
        return;
      }

      // 2. Check if valid neighbor
      const lastIndex = this.selectedIndices[this.selectedIndices.length - 1];
      if (index !== lastIndex && !this.selectedIndices.includes(index)) {
        if (this.isNeighbor(lastIndex, index)) {
          this.addToSelection(index);
        }
      } else if (
        index === this.selectedIndices[this.selectedIndices.length - 2]
      ) {
        // Backtrack
        this.selectedIndices.pop();
        this.updateCurrentWord();
      }
    },

    addToSelection(index) {
      this.selectedIndices.push(index);
      this.updateCurrentWord();

      // Haptic feedback if available
      if (navigator.vibrate) navigator.vibrate(10);
    },

    handleInputEnd() {
      if (this.gameOver) return;

      // Logic to decide whether to submit or keep selection

      // 1. If we dragged over multiple cells in this gesture -> Submit
      if (this.currentGestureIndices.length > 1) {
        this.submitWord();
      }
      // 2. If we tapped the last selected cell (Confirmation) -> Submit
      else if (
        this.isPotentialSubmit &&
        this.currentGestureIndices.length === 1
      ) {
        this.submitWord();
      }
      // 3. Otherwise (Single tap on new cell, neighbor, or backtrack) -> Keep Selection
      else {
        // Do nothing, let the selection persist
      }

      // Reset gesture tracking
      this.currentGestureIndices = [];
      this.isPotentialSubmit = false;
    },

    updateCurrentWord() {
      this.currentWord = this.selectedIndices
        .map((i) => this.grid[i].letter)
        .join("")
        .toLowerCase();
    },

    getPathPoints() {
      if (this.selectedIndices.length < 2 || this.tileBounds.length === 0) {
        return "";
      }

      const gridWrapper = document.querySelector(".grid-wrapper");
      if (!gridWrapper) return "";
      const wrapperRect = gridWrapper.getBoundingClientRect();

      return this.selectedIndices
        .map((i) => {
          const bound = this.tileBounds[i];
          if (!bound) return "0,0";
          // Convert screen coordinates to local wrapper coordinates
          const x = bound.cx - wrapperRect.left;
          const y = bound.cy - wrapperRect.top;
          return `${x},${y}`;
        })
        .join(" ");
    },

    isNeighbor(i1, i2) {
      const x1 = i1 % this.width;
      const y1 = Math.floor(i1 / this.width);
      const x2 = i2 % this.width;
      const y2 = Math.floor(i2 / this.width);

      return Math.abs(x1 - x2) <= 1 && Math.abs(y1 - y2) <= 1;
    },

    /*
     Returns false if
     - the word is not found in the dictionnary,
     - or the word is already found
     - or the dictionary is not loaded
     otherwise returns the value of the word in the dictionary
    */
    checkWord(word) {
      if (word.length < 3) return false;
      // Check if already found (in either list)
      if (this.validWordsHistory.some((h) => h.word === word)) return false;
      if (this.foundThemeWords.includes(word)) return false;

      if (!this.dictionary) this.processDictionary();

      if (!this.dictionary) return false;
      const value = this.dictionary[word];
      if (!value) return false;
      else return value;
    },

    processDictionary() {
      if (this.dictionary) return;
      if (typeof GAME_DICTIONARY === "undefined") return;

      this.dictionary = GAME_DICTIONARY;
      this.prefixes = new Set();

      // Add theme words
      if (this.gameMode === "theme") {
        this.themeWords.forEach((word) => {
          this.dictionary[word] = "theme";
        });
      }

      // Pre-compute prefixes for optimization (ALL lengths)
      Object.keys(this.dictionary).forEach((word) => {
        // Optimization: Only store prefixes for words that could fit in our max search depth (e.g. 10)
        // But storing all is safer and not too expensive for standard English dict.
        for (let i = 2; i <= word.length; i++) {
          this.prefixes.add(word.substring(0, i));
        }
      });
    },

    submitWord() {
      const word = this.currentWord;
      const indices = [...this.selectedIndices]; // Copy before clearing

      const value = this.checkWord(word);

      if (value) {
        this.processValidWord(word, value, indices);
      }
      this.selectedIndices = [];
      this.currentWord = "";
    },

    processValidWord(word, value, indices) {
      // Calculate Score

      const effects = POINTS_SYSTEM[value];

      let points = word.length * effects.multiplier;

      this.score += points;
      this.lastWordCategory = effects.category;

      // Add mana based on points (capped at maxMana)
      this.mana = Math.min(this.maxMana, this.mana + points);

      // Add to history if not a theme word
      if (!effects.isThemeWord) {
        this.validWordsHistory.push({
          word: word,
          category: effects.category,
        });

        if (this.gameMode !== "theme" || this.themeWords.length === 0) {
          this.lastFoundWordIndices = indices;
          this.lastFoundWord = word;
        }
      }

      // Handle theme mode behavior
      if (this.gameMode === "theme" && effects.isThemeWord) {
        // Theme words are auto-destroyed
        const idx = this.themeWords.indexOf(word);
        if (idx > -1) this.themeWords.splice(idx, 1);
        this.foundThemeWords.push(word);

        // Use passed indices for destruction
        this.selectedIndices = indices;
        this.destroySelected();
        this.selectedIndices = [];

        if (this.themeWords.length === 0) {
          this.handleThemeWin();
        }
      }

      if (this.score > this.highScore) {
        this.highScore = this.score;
        localStorage.setItem("wordRushHighScore", this.highScore);
      }
    },

    handleThemeWin() {
      const winBonus = 25;
      this.score += winBonus;
      this.triggerToast(`Theme Completed! +${winBonus} points`);
    },

    triggerToast(message) {
      this.toastMessage = message;
      this.showToast = true;
      setTimeout(() => {
        this.showToast = false;
      }, 3000);
    },

    // Destruct button action - destroys the currently highlighted word
    destructLastWord() {
      if (!this.canDestruct) return;

      // Use the stored indices from the last found word
      this.selectedIndices = [...this.lastFoundWordIndices];
      this.destroySelected();

      // Clear the highlight state
      this.lastFoundWordIndices = [];
      this.lastFoundWord = "";
      this.selectedIndices = [];
    },

    // ========== ABILITY METHODS ==========

    // Find a path in the grid that spells a valid word
    findWordInGrid() {
      console.log("Finding word in grid...");
      console.log(this.themeWords);
      // Phase 1: Look for THEME words
      if (this.themeWords.length > 0) {
        // Linear search for theme words (order doesn't matter much as they are specific targets)
        const maxSearchDepth = this.themeWords[0].length;
        const result = this.findAllFindableWords(
          "theme",
          false,
          maxSearchDepth,
        );
        if (result) return result;
      }

      // Phase 2: Look for COMMON words (value 2)
      // Randomized search to avoid top-left bias
      return this.findAllFindableWords(2, true);
    },

    findAllFindableWords(targetType, randomize, maxSearchDepth = 10) {
      // Create indices array
      let indices = [];
      for (let i = 0; i < this.grid.length; i++) indices.push(i);

      if (randomize) {
        // Fisher-Yates Shuffle
        for (let i = indices.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [indices[i], indices[j]] = [indices[j], indices[i]];
        }
      }

      // Check every cell in (possibly randomized) order
      for (const i of indices) {
        if (this.grid[i].status === "removed") continue;

        // Start DFS
        // We look for words of length 3+
        const path = this.dfsFindWord(
          i,
          [i],
          this.grid[i].letter,
          targetType,
          maxSearchDepth,
        );
        if (path) {
          const word = path
            .map((idx) => this.grid[idx].letter)
            .join("")
            .toLowerCase();
          return { word, path };
        }
      }
      return null;
    },

    dfsFindWord(idx, visited, currentStr, targetType, maxSearchDepth = 10) {
      // Pruning: Check prefixes at EVERY step
      // We only check if length >= 2 because 1 letter "prefixes" are just letters on the grid
      if (
        currentStr.length >= 2 &&
        !this.prefixes.has(currentStr.toLowerCase())
      ) {
        return null;
      }

      // Check if currentStr is a valid word (min length 3)
      if (currentStr.length >= 3) {
        const lowerWord = currentStr.toLowerCase();
        // Valid word found?
        const value = this.checkWord(lowerWord);
        if (value && value === targetType) {
          return visited;
        }
      }

      // Limit max depth to avoid infinite searches (e.g. 10 chars is usually enough for hints)
      if (currentStr.length >= maxSearchDepth) return null;

      const neighbors = this.getNeighbors(idx);
      // Randomize neighbors to get Variety in hints (optional)
      // neighbors.sort(() => Math.random() - 0.5);
      for (const nIdx of neighbors) {
        if (!visited.includes(nIdx) && this.grid[nIdx].status !== "removed") {
          const result = this.dfsFindWord(
            nIdx,
            [...visited, nIdx],
            currentStr + this.grid[nIdx].letter,
            targetType,
            maxSearchDepth,
          );
          if (result) return result;
        }
      }
      return null;
    },

    getNeighbors(index) {
      const neighbors = [];
      const x = index % this.width;
      const y = Math.floor(index / this.width);

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
            neighbors.push(ny * this.width + nx);
          }
        }
      }
      return neighbors;
    },

    // Old method for reference (Removed for optimization)
    // findPathForWord(word) { ... }
    // dfsPath(...) { ... }

    // Small Hint: highlight first letter of a findable word
    useSmallHint() {
      if (!this.canSmallHint) return;
      const result = this.findWordInGrid();
      if (result) {
        this.hintHighlightIndices = [result.path[0]]; // First letter only
        this.mana -= 2;
      }
    },

    // Big Hint: highlight all letters of a findable word
    useBigHint() {
      if (!this.canBigHint) return;
      const result = this.findWordInGrid();
      if (result) {
        this.hintHighlightIndices = result.path; // All letters
        this.mana -= 5;
      }
    },

    // Bomb: enter bomb mode (click cell to remove)
    activateBomb() {
      if (!this.canBomb) return;
      this.activeAbility = "bomb";
    },

    // Swap: enter swap mode (click two cells to swap)
    activateSwap() {
      if (!this.canSwap) return;
      this.activeAbility = "swap";
      this.swapFirstIndex = null;
    },

    // Cancel any active ability
    cancelAbility() {
      this.activeAbility = null;
      this.swapFirstIndex = null;
    },

    // Handle grid click during ability mode
    handleGridClick(index) {
      if (this.grid[index].status === "removed") return;

      if (this.activeAbility === "bomb") {
        this.executeBomb(index);
      } else if (this.activeAbility === "swap") {
        this.executeSwap(index);
      }
    },

    executeBomb(index) {
      this.selectedIndices = [index];
      this.destroySelected();
      this.selectedIndices = [];
      this.mana -= 5;
      this.activeAbility = null;
    },

    executeSwap(index) {
      if (this.swapFirstIndex === null) {
        this.swapFirstIndex = index;
      } else if (this.swapFirstIndex !== index) {
        // Swap the letters
        const temp = this.grid[this.swapFirstIndex].letter;
        this.grid[this.swapFirstIndex].letter = this.grid[index].letter;
        this.grid[index].letter = temp;
        this.mana -= 5;
        this.activeAbility = null;
        this.swapFirstIndex = null;
      }
    },

    destroySelected() {
      // Mark as removed
      const indicesToRemove = [...this.selectedIndices];

      // 1. Remove letter content first (visual)
      // 2. Then shift columns down
      // For simple implementation:
      // sort indices descending
      indicesToRemove.sort((a, b) => b - a);

      // Set specific tiles to 'removed' immediately for animation
      indicesToRemove.forEach((i) => {
        this.grid[i].status = "removed";
      });

      // Wait for anim then shift
      setTimeout(() => {
        this.shiftGrid();
      }, 500);
    },

    shiftGrid() {
      // Column-wise processing
      for (let x = 0; x < this.width; x++) {
        let newCol = [];
        // Collect surviving letters in this column
        for (let y = 0; y < this.height; y++) {
          const idx = y * this.width + x;
          if (this.grid[idx].status !== "removed") {
            newCol.push(this.grid[idx]);
          }
        }

        // Fill top with new letters
        const missing = this.height - newCol.length;
        for (let k = 0; k < missing; k++) {
          let newLetter;

          // Check if we have reserve letters in the theme for this column
          if (
            this.gameMode === "theme" &&
            this.columnRefillIndices &&
            this.columnRefillIndices[x] >= 0
          ) {
            const themeRowIdx = this.columnRefillIndices[x];
            // Get letter from theme
            if (
              DEFAULT_THEME.grid[themeRowIdx] &&
              DEFAULT_THEME.grid[themeRowIdx][x]
            ) {
              newLetter = DEFAULT_THEME.grid[themeRowIdx][x];
            } else {
              newLetter = this.getRandomLetter(); // Fallback if theme grid is malformed
            }
            this.columnRefillIndices[x]--;
          } else {
            newLetter = this.getRandomLetter();
          }

          newCol.unshift({
            id: Math.random().toString(36).substr(2, 9),
            letter: newLetter,
            x: x,
            y: k, // temporary
            status: "new",
          });
        }

        // Write back to grid
        for (let y = 0; y < this.height; y++) {
          const idx = y * this.width + x;
          this.grid[idx] = newCol[y];
          this.grid[idx].status = "idle"; // reset status
        }
      }
    },

    categoryColor(cat) {
      return (
        {
          common: "text-gray-400",
          rare: "text-cyan-400",
          shiny: "text-yellow-400",
          legendary: "text-pink-500",
        }[cat] || "text-white"
      );
    },

    startTimer() {
      if (this.timer) clearInterval(this.timer);
      this.gameOver = false;
      this.score = 0;

      this.timer = setInterval(() => {
        this.timeLeft--;
        if (this.timeLeft <= 0) {
          this.endGame();
        }
      }, 1000);
    },

    endGame() {
      clearInterval(this.timer);
      this.gameOver = true;
    },

    restartGame() {
      this.gameMode = "theme";
      this.initGame();
    },

    formatTime(seconds) {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m}:${s.toString().padStart(2, "0")}`;
    },
  };
}
