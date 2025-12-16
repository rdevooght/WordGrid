function game() {
    return {
        grid: [],
        width: 6,
        height: 8, // 6x8 grid
        letters: 'EEEEEEEEEEEEAAAAAAAAAIIIIIIIIIOOOOOOOONNNNNNRRRRRRTTTTTTLLLLSSSSUUUDDDDGGGGBBCCMMPPFFHHVVWWYYKJXQZ',
        selectedIndices: [],
        currentWord: '',
        score: 0,
        timeLeft: 180, // 3 minutes
        timer: null,
        gameMode: 'theme', // 'standard', 'destructive', 'theme'
        gameOver: false,
        validWordsHistory: [],
        lastWordCategory: '',
        highScore: localStorage.getItem('wordRushHighScore') || 0,

        // Theme State
        themeWords: [],
        foundThemeWords: [],
        totalThemeWords: 0,
        columnRefillIndices: [], // Track current 'top' row for each column in theme
        dictionary: null, // Optimization: Map word -> category

        // computed checks
        get isValidWord() {
            return this.checkWord(this.currentWord);
        },

        initGame() {
            if (this.gameMode === 'theme') {
                if (typeof DEFAULT_THEME !== 'undefined') {
                    this.width = DEFAULT_THEME['grid-size'][0];
                    this.height = DEFAULT_THEME['grid-size'][1];
                    this.themeWords = [...DEFAULT_THEME['theme-words']];
                    this.totalThemeWords = this.themeWords.length;
                    this.foundThemeWords = [];
                }
            }
            this.validWordsHistory = [];
            this.processDictionary();
            this.generateGrid();
            this.startTimer();
        },

        generateGrid() {
            this.grid = [];

            if (this.gameMode === 'theme' && typeof DEFAULT_THEME !== 'undefined') {
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
                    const row = (themeRowIndex < totalRows) ? themeGrid[themeRowIndex] : "";

                    for (let x = 0; x < this.width; x++) {
                        const letter = (row && x < row.length) ? row[x] : this.getRandomLetter();

                        this.grid.push({
                            id: Math.random().toString(36).substr(2, 9),
                            letter: letter,
                            x: x,
                            y: y,
                            status: 'idle'
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
                        status: 'idle' // idle, selected, removed
                    });
                }
            }
        },

        getRandomLetter() {
            return this.letters.charAt(Math.floor(Math.random() * this.letters.length));
        },

        getCellClasses(cell) {
            let classes = 'tile'; // Base class
            if (this.selectedIndices.includes(this.grid.indexOf(cell))) {
                classes += ' selected';
            }
            if (cell.status === 'removed') {
                classes += ' removed';
            }
            // Highlight found theme words? Maybe just animation.
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
        handleTouchEnd() {
            this.submitWord();
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
                this.submitWord();
            }
        },

        handleInputStart(x, y) {
            if (this.gameOver) return;

            // Recalculate physical positions of tiles
            this.calculateTileBounds();

            this.selectedIndices = [];
            this.currentWord = '';
            this.lastWordCategory = '';
            this.detectCell(x, y);
        },

        calculateTileBounds() {
            this.tileBounds = [];
            const tiles = document.querySelectorAll('.tile');
            const gridWrapper = document.querySelector('.grid-wrapper');
            if (gridWrapper) {
                const wrapperRect = gridWrapper.getBoundingClientRect();
                this.pathViewBox = { width: wrapperRect.width, height: wrapperRect.height };
            }
            tiles.forEach(tile => {
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
                        radiusSq: Math.pow(size * 0.55, 2)
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

                if (this.grid[i] && this.grid[i].status === 'removed') continue;

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
            } else if (index === this.selectedIndices[this.selectedIndices.length - 2]) {
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

        updateCurrentWord() {
            this.currentWord = this.selectedIndices
                .map(i => this.grid[i].letter)
                .join('')
                .toLowerCase();
        },

        getPathPoints() {
            if (this.selectedIndices.length < 2 || this.tileBounds.length === 0) {
                return '';
            }

            const gridWrapper = document.querySelector('.grid-wrapper');
            if (!gridWrapper) return '';
            const wrapperRect = gridWrapper.getBoundingClientRect();

            return this.selectedIndices.map(i => {
                const bound = this.tileBounds[i];
                if (!bound) return '0,0';
                // Convert screen coordinates to local wrapper coordinates
                const x = bound.cx - wrapperRect.left;
                const y = bound.cy - wrapperRect.top;
                return `${x},${y}`;
            }).join(' ');
        },

        isNeighbor(i1, i2) {
            const x1 = i1 % this.width;
            const y1 = Math.floor(i1 / this.width);
            const x2 = i2 % this.width;
            const y2 = Math.floor(i2 / this.width);

            return Math.abs(x1 - x2) <= 1 && Math.abs(y1 - y2) <= 1;
        },

        checkWord(word) {
            if (word.length < 3) return false;
            // Check if already found (in either list)
            if (this.validWordsHistory.some(h => h.word === word)) return false;
            if (this.foundThemeWords.includes(word)) return false;

            // Check theme words first
            if (this.gameMode === 'theme' && this.themeWords.includes(word)) {
                return true;
            }
            if (!this.dictionary) this.processDictionary();
            return this.dictionary && Object.prototype.hasOwnProperty.call(this.dictionary, word);
        },

        processDictionary() {
            if (this.dictionary) return;
            if (typeof GAME_DICTIONARY === 'undefined') return;

            // Handle new format: { 'common': [...], 'rare': [...], ... }
            this.dictionary = {};
            for (const category in GAME_DICTIONARY) {
                if (Array.isArray(GAME_DICTIONARY[category])) {
                    for (const w of GAME_DICTIONARY[category]) {
                        this.dictionary[w] = category;
                    }
                }
            }
        },

        submitWord() {
            const word = this.currentWord;
            if (this.checkWord(word)) {
                let category = 'common';
                if (this.dictionary && Object.prototype.hasOwnProperty.call(this.dictionary, word)) {
                    category = this.dictionary[word];
                }

                // Theme Logic Check
                let isThemeWord = false;
                if (this.gameMode === 'theme' && this.themeWords.includes(word)) {
                    isThemeWord = true;
                    category = 'legendary'; // Theme words are legendary!
                }

                this.processValidWord(word, category, isThemeWord);
            } else {
                // Invalid - just clear
            }
            this.selectedIndices = [];
            this.currentWord = '';
        },

        processValidWord(word, category, isThemeWord) {
            // Calculate Score
            let points = 0;
            switch (word.length) {
                case 3: points = 10; break;
                case 4: points = 20; break;
                case 5: points = 40; break;
                case 6: points = 80; break;
                default: points = 100 + (word.length - 6) * 50;
            }

            // Multiplier by category
            if (category === 'rare') points *= 2;
            if (category === 'shiny') points *= 3;
            if (category === 'legendary') points *= 5;

            this.score += points;
            this.lastWordCategory = category;

            // Add to history if not a theme word
            if (!isThemeWord) {
                this.validWordsHistory.push({
                    word: word,
                    category: category
                });
            }

            // Handle Mode behavior
            if (this.gameMode === 'destructive') {
                this.destroySelected();
            } else if (this.gameMode === 'theme') {
                if (isThemeWord) {
                    // Remove from list
                    const idx = this.themeWords.indexOf(word);
                    if (idx > -1) this.themeWords.splice(idx, 1);
                    this.foundThemeWords.push(word);

                    this.destroySelected();

                    if (this.themeWords.length === 0) {
                        this.handleThemeWin();
                    }
                } else {
                    // Non-theme word in theme mode: Score points, NO destruction
                }
            } else {
                // Standard mode
            }

            if (this.score > this.highScore) {
                this.highScore = this.score;
                localStorage.setItem('wordRushHighScore', this.highScore);
            }
        },

        handleThemeWin() {
            // Congratulation Logic
            alert("Congratulations! You found all theme words! Keep playing for high score.");
            // Ideally, show a modal or overlay instead of alert
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
            indicesToRemove.forEach(i => {
                this.grid[i].status = 'removed';
            });

            // Wait for anim then shift
            setTimeout(() => {
                this.shiftGrid();
            }, 200);
        },

        shiftGrid() {
            // Column-wise processing
            for (let x = 0; x < this.width; x++) {
                let newCol = [];
                // Collect surviving letters in this column
                for (let y = 0; y < this.height; y++) {
                    const idx = y * this.width + x;
                    if (this.grid[idx].status !== 'removed') {
                        newCol.push(this.grid[idx]);
                    }
                }

                // Fill top with new letters
                const missing = this.height - newCol.length;
                for (let k = 0; k < missing; k++) {
                    let newLetter;

                    // Check if we have reserve letters in the theme for this column
                    if (this.gameMode === 'theme' &&
                        this.columnRefillIndices &&
                        this.columnRefillIndices[x] >= 0) {

                        const themeRowIdx = this.columnRefillIndices[x];
                        // Get letter from theme
                        if (DEFAULT_THEME.grid[themeRowIdx] && DEFAULT_THEME.grid[themeRowIdx][x]) {
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
                        status: 'new'
                    });
                }

                // Write back to grid
                for (let y = 0; y < this.height; y++) {
                    const idx = y * this.width + x;
                    this.grid[idx] = newCol[y];
                    this.grid[idx].status = 'idle'; // reset status
                }
            }
        },

        categoryColor(cat) {
            return {
                'common': 'text-gray-400',
                'rare': 'text-cyan-400',
                'shiny': 'text-yellow-400',
                'legendary': 'text-pink-500'
            }[cat] || 'text-white';
        },

        startTimer() {
            if (this.timer) clearInterval(this.timer);
            this.timeLeft = 180;
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

        restartGame(mode) {
            if (mode) this.gameMode = mode;
            this.initGame();
        },

        setMode(mode) {
            this.gameMode = mode;
        },

        formatTime(seconds) {
            const m = Math.floor(seconds / 60);
            const s = seconds % 60;
            return `${m}:${s.toString().padStart(2, '0')}`;
        }
    }
}
