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
        document.querySelectorAll('.player-name-input input').forEach(input => {
            names.push(input.value || input.placeholder);
        });
        startGame(playerCount, names);
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
        `;
        container.appendChild(div);
    }
}

// ============================================================================
// Game Initialization
// ============================================================================

function startGame(numPlayers, playerNames) {
    // Switch screens
    document.getElementById('setup-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');

    // Create game state
    gameState = new GameState(numPlayers, playerNames);

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
}

// ============================================================================
// Initialize
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    initSetup();
});
