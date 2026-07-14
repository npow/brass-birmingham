// ============================================================================
// Brass: Birmingham - Main Entry Point
// ============================================================================

let gameState = null;
let gameLogic = null;
let boardRenderer = null;
let uiManager = null;

// ============================================================================
// Setup Screen
// ============================================================================

function initSetup() {
    let playerCount = 3;

    // Player count buttons
    document.querySelectorAll('.count-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.count-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            playerCount = parseInt(btn.dataset.count);
            renderPlayerInputs(playerCount);
        });
    });

    // Initialize with default count
    renderPlayerInputs(playerCount);

    // Start game button
    document.getElementById('start-game-btn').addEventListener('click', () => {
        const names = [];
        const playerIsAI = [];
        document.querySelectorAll('.player-name-input').forEach(row => {
            const input = row.querySelector('input[type="text"]');
            names.push(input.value || input.placeholder);
            const aiCheckbox = row.querySelector('.ai-toggle-checkbox');
            const difficultySelect = row.querySelector('.ai-difficulty-select');
            playerIsAI.push({
                isAI: aiCheckbox.checked,
                difficulty: difficultySelect.value,
            });
        });
        startGame(playerCount, names, playerIsAI);
    });
}

function renderPlayerInputs(count) {
    const container = document.querySelector('.player-name-inputs');
    container.innerHTML = '';

    const defaultNames = ['Alice', 'Bob', 'Carol', 'Dave'];

    for (let i = 0; i < count; i++) {
        const div = document.createElement('div');
        div.className = 'player-name-input';
        div.innerHTML = `
            <div class="color-swatch" style="background: ${PLAYER_COLORS[i]}"></div>
            <input type="text" placeholder="${defaultNames[i]}" maxlength="20">
            <label class="ai-toggle">
                <input type="checkbox" class="ai-toggle-checkbox">
                <span>AI</span>
            </label>
            <select class="ai-difficulty-select" disabled>
                <option value="easy">Easy</option>
                <option value="normal" selected>Normal</option>
                <option value="hard">Hard</option>
            </select>
        `;
        const aiCheckbox = div.querySelector('.ai-toggle-checkbox');
        const difficultySelect = div.querySelector('.ai-difficulty-select');
        aiCheckbox.addEventListener('change', () => {
            difficultySelect.disabled = !aiCheckbox.checked;
        });
        container.appendChild(div);
    }
}

// ============================================================================
// Game Initialization
// ============================================================================

function startGame(numPlayers, playerNames, playerIsAI = []) {
    // Switch screens
    document.getElementById('setup-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');

    // Create game state
    gameState = new GameState(numPlayers, playerNames, playerIsAI);

    // Create game logic
    gameLogic = new GameLogic(gameState);

    // Create board renderer
    const svg = document.getElementById('game-board');
    boardRenderer = new BoardRenderer(svg);
    boardRenderer.render(gameState);

    // Create UI manager
    uiManager = new UIManager();
    uiManager.init(gameState, gameLogic, boardRenderer);

    // Expose state for testing
    window.render_game_to_text = () => JSON.stringify(gameState.toJSON(), null, 2);
    window.gameState = gameState;
    window.gameLogic = gameLogic;
    window.uiManager = uiManager;
    window.AIPlayer = AIPlayer;
}

// ============================================================================
// Initialize
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    initSetup();
});
