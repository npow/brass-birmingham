// ============================================================================
// Brass: Birmingham - Game State Management
// ============================================================================

class GameState {
    constructor(numPlayers, playerNames) {
        this.numPlayers = numPlayers;
        this.playerNames = playerNames;
        this.era = ERA.CANAL;
        this.round = 1;
        this.currentPlayerIndex = 0;
        this.actionsThisTurn = 0;
        this.actionsPerTurn = FIRST_ROUND_ACTIONS; // First round: 1 action
        this.isFirstRound = true;
        this.gameOver = false;
        this.turnOrder = []; // player indices in turn order
        this.moneySpentThisRound = {}; // playerId -> amount spent this round

        // Initialize players
        this.players = [];
        for (let i = 0; i < numPlayers; i++) {
            this.players.push(this.createPlayer(i, playerNames[i]));
        }

        // Turn order starts as player order
        this.turnOrder = this.players.map((_, i) => i);

        // Board state
        this.boardIndustries = {}; // cityId_slotIndex -> { playerId, type, level, tileData, flipped, resourceCubes }
        this.boardLinks = {}; // connectionId -> { playerId, type: 'canal'|'rail' }
        this.breweryFarmTiles = {}; // 'northern'|'southern' -> { playerId, type, level, tileData, flipped, resourceCubes }

        // Markets
        this.coalMarket = COAL_MARKET_INITIAL; // number of cubes remaining
        this.ironMarket = IRON_MARKET_INITIAL;

        // Merchant state
        this.merchantTiles = []; // { location, buys, hasBeer, bonusClaimed }
        this.initMerchants();

        // Card draw deck and discard
        this.drawDeck = [];
        this.wildLocationPile = 4; // 4 wild location cards
        this.wildIndustryPile = 4; // 4 wild industry cards
        this.initDeck();

        // Deal cards
        this.dealCards();

        // Selected card for current action
        this.selectedCardIndex = null;
        this.selectedAction = null;
        this.pendingAction = null; // { action, step, data }
    }

    createPlayer(index, name) {
        // Create industry tile stacks for this player
        const industryTiles = {};
        for (const [type, levels] of Object.entries(INDUSTRY_DATA)) {
            industryTiles[type] = [];
            for (const tileData of levels) {
                for (let i = 0; i < tileData.count; i++) {
                    industryTiles[type].push({
                        ...tileData,
                        type: type,
                        used: false
                    });
                }
            }
        }

        return {
            id: index,
            name: name,
            color: PLAYER_COLORS[index],
            bgColor: PLAYER_BG_COLORS[index],
            colorName: PLAYER_NAMES[index],
            money: INITIAL_MONEY,
            income: INITIAL_INCOME,
            vp: 0,
            hand: [],
            industryTiles: industryTiles,
            linksRemaining: { canal: 14, rail: 14 },
            hasWildLocation: false,
            hasWildIndustry: false,
        };
    }

    initMerchants() {
        const tiles = [];
        // Add merchant tiles based on player count
        for (let p = 2; p <= this.numPlayers; p++) {
            if (MERCHANT_TILES[p]) {
                for (const tile of MERCHANT_TILES[p]) {
                    tiles.push({
                        location: tile.location,
                        buys: tile.buys,
                        hasBeer: true,
                        bonusClaimed: false,
                    });
                }
            }
        }
        // Shuffle merchant tiles
        this.shuffleArray(tiles);
        this.merchantTiles = tiles;
    }

    initDeck() {
        const deck = [];
        const deckData = CARD_DECK[this.numPlayers];
        if (!deckData) return;

        // Location cards
        for (const [cityId, count] of Object.entries(deckData.locations)) {
            for (let i = 0; i < count; i++) {
                deck.push({
                    type: CARD_TYPES.LOCATION,
                    location: cityId,
                    name: CITIES[cityId] ? CITIES[cityId].name : cityId,
                });
            }
        }

        // Industry cards
        for (const [industryType, count] of Object.entries(deckData.industries)) {
            for (let i = 0; i < count; i++) {
                deck.push({
                    type: CARD_TYPES.INDUSTRY,
                    industryType: industryType,
                    name: INDUSTRY_DISPLAY[industryType].name,
                });
            }
        }

        this.shuffleArray(deck);
        this.drawDeck = deck;
    }

    dealCards() {
        for (const player of this.players) {
            while (player.hand.length < HAND_SIZE && this.drawDeck.length > 0) {
                player.hand.push(this.drawDeck.pop());
            }
        }
    }

    drawCards(playerId) {
        const player = this.players[playerId];
        while (player.hand.length < HAND_SIZE && this.drawDeck.length > 0) {
            player.hand.push(this.drawDeck.pop());
        }
    }

    shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    // ========================================================================
    // Spending tracker (for turn order)
    // ========================================================================

    spendMoney(playerId, amount) {
        const player = this.players[playerId];
        player.money -= amount;
        this.moneySpentThisRound[playerId] = (this.moneySpentThisRound[playerId] || 0) + amount;
    }

    // ========================================================================
    // Current player helpers
    // ========================================================================

    get currentPlayer() {
        return this.players[this.turnOrder[this.currentPlayerIndex]];
    }

    get currentPlayerId() {
        return this.turnOrder[this.currentPlayerIndex];
    }

    // ========================================================================
    // Income track helpers
    // ========================================================================

    adjustIncome(playerId, amount) {
        const player = this.players[playerId];
        player.income = Math.min(MAX_INCOME, Math.max(MIN_INCOME, player.income + amount));
    }

    getIncomeAmount(income) {
        return income; // Income level = money earned per round
    }

    // ========================================================================
    // Market helpers
    // ========================================================================

    getCoalPrice() {
        if (this.coalMarket <= 0) return Infinity;
        // Price is based on which space the next coal would come from
        const spaceIndex = COAL_MARKET_PRICES.length - this.coalMarket;
        return COAL_MARKET_PRICES[spaceIndex] || Infinity;
    }

    getIronPrice() {
        if (this.ironMarket <= 0) return Infinity;
        const spaceIndex = IRON_MARKET_PRICES.length - this.ironMarket;
        return IRON_MARKET_PRICES[spaceIndex] || Infinity;
    }

    buyCoalFromMarket(count) {
        let totalCost = 0;
        for (let i = 0; i < count; i++) {
            if (this.coalMarket <= 0) return { cost: Infinity, success: false };
            const price = this.getCoalPrice();
            totalCost += price;
            this.coalMarket--;
        }
        return { cost: totalCost, success: true };
    }

    buyIronFromMarket(count) {
        let totalCost = 0;
        for (let i = 0; i < count; i++) {
            if (this.ironMarket <= 0) return { cost: Infinity, success: false };
            const price = this.getIronPrice();
            totalCost += price;
            this.ironMarket--;
        }
        return { cost: totalCost, success: true };
    }

    sellCoalToMarket(count) {
        for (let i = 0; i < count; i++) {
            if (this.coalMarket < COAL_MARKET_PRICES.length) {
                this.coalMarket++;
            }
        }
    }

    sellIronToMarket(count) {
        for (let i = 0; i < count; i++) {
            if (this.ironMarket < IRON_MARKET_PRICES.length) {
                this.ironMarket++;
            }
        }
    }

    // ========================================================================
    // Network helpers
    // ========================================================================

    // Check if a location is in a player's network
    isInNetwork(playerId, locationId) {
        // A location is in your network if:
        // 1. It contains one of your industry tiles, OR
        // 2. It is adjacent to one of your link tiles

        // Check for own industry at location
        if (isCity(locationId)) {
            const city = CITIES[locationId];
            for (let i = 0; i < city.slots.length; i++) {
                const key = `${locationId}_${i}`;
                const tile = this.boardIndustries[key];
                if (tile && tile.playerId === playerId) return true;
            }
        }

        // Check brewery farms
        if (isBreweryFarm(locationId)) {
            const tile = this.breweryFarmTiles[locationId];
            if (tile && tile.playerId === playerId) return true;
        }

        // Check for adjacent links
        for (const conn of CONNECTIONS) {
            const link = this.boardLinks[conn.id];
            if (link && link.playerId === playerId) {
                if (conn.cities.includes(locationId)) return true;
                // Check via brewery for kidderminster-worcester
                if (conn.viaBrewery && (conn.cities[0] === locationId || conn.cities[1] === locationId)) {
                    return true;
                }
            }
        }

        return false;
    }

    // Get all locations connected to a given location via links
    getConnectedLocations(locationId, visitedConnections = new Set()) {
        const connected = new Set([locationId]);
        for (const conn of CONNECTIONS) {
            if (visitedConnections.has(conn.id)) continue;
            const link = this.boardLinks[conn.id];
            if (!link) continue;

            let otherEnd = null;
            if (conn.cities[0] === locationId) otherEnd = conn.cities[1];
            else if (conn.cities[1] === locationId) otherEnd = conn.cities[0];
            else if (conn.viaBrewery === locationId) {
                otherEnd = conn.cities[0] === locationId ? conn.cities[1] : conn.cities[0];
            }

            if (otherEnd) {
                visitedConnections.add(conn.id);
                connected.add(otherEnd);
                if (conn.viaBrewery) connected.add(conn.viaBrewery);
                // Recursively find connected locations
                const further = this.getConnectedLocations(otherEnd, visitedConnections);
                for (const loc of further) connected.add(loc);
            }
        }
        return connected;
    }

    // Find coal source: nearest connected unflipped coal mine, or market
    findCoalSource(locationId, playerId) {
        const sources = [];

        // BFS through connected network to find coal mines
        const visited = new Set();
        const queue = [{ loc: locationId, distance: 0 }];

        while (queue.length > 0) {
            const { loc, distance } = queue.shift();
            if (visited.has(loc)) continue;
            visited.add(loc);

            // Check for coal mines at this location
            if (isCity(loc)) {
                const city = CITIES[loc];
                for (let i = 0; i < city.slots.length; i++) {
                    const key = `${loc}_${i}`;
                    const tile = this.boardIndustries[key];
                    if (tile && tile.type === INDUSTRY_TYPES.COAL_MINE &&
                        !tile.flipped && tile.resourceCubes > 0) {
                        sources.push({ type: 'mine', key, distance, free: true });
                    }
                }
            }

            // Follow links to adjacent locations
            for (const conn of CONNECTIONS) {
                const link = this.boardLinks[conn.id];
                if (!link) continue;

                let otherEnd = null;
                if (conn.cities[0] === loc) otherEnd = conn.cities[1];
                else if (conn.cities[1] === loc) otherEnd = conn.cities[0];

                if (otherEnd && !visited.has(otherEnd)) {
                    queue.push({ loc: otherEnd, distance: distance + 1 });
                }
            }
        }

        // Sort by distance (nearest first)
        sources.sort((a, b) => a.distance - b.distance);

        // Also add market as option
        if (this.coalMarket > 0) {
            sources.push({ type: 'market', price: this.getCoalPrice(), free: false });
        }

        return sources;
    }

    // Find iron source: any unflipped iron works (no connection needed), or market
    findIronSource(playerId) {
        const sources = [];

        // Iron doesn't need connection - any iron works on the board
        for (const [key, tile] of Object.entries(this.boardIndustries)) {
            if (tile.type === INDUSTRY_TYPES.IRON_WORKS &&
                !tile.flipped && tile.resourceCubes > 0) {
                sources.push({ type: 'works', key, free: true });
            }
        }

        // Market
        if (this.ironMarket > 0) {
            sources.push({ type: 'market', price: this.getIronPrice(), free: false });
        }

        return sources;
    }

    // Find beer source for selling
    findBeerSources(locationId, playerId) {
        const sources = [];

        // Own breweries anywhere (no connection needed)
        for (const [key, tile] of Object.entries(this.boardIndustries)) {
            if (tile.type === INDUSTRY_TYPES.BREWERY && tile.playerId === playerId &&
                !tile.flipped && tile.resourceCubes > 0) {
                sources.push({ type: 'own', key });
            }
        }
        // Own brewery farms
        for (const [farmId, tile] of Object.entries(this.breweryFarmTiles)) {
            if (tile && tile.type === INDUSTRY_TYPES.BREWERY && tile.playerId === playerId &&
                !tile.flipped && tile.resourceCubes > 0) {
                sources.push({ type: 'own', key: `farm_${farmId}` });
            }
        }

        // Connected opponent breweries
        const connected = this.getConnectedLocations(locationId);
        for (const loc of connected) {
            if (isCity(loc)) {
                const city = CITIES[loc];
                for (let i = 0; i < city.slots.length; i++) {
                    const key = `${loc}_${i}`;
                    const tile = this.boardIndustries[key];
                    if (tile && tile.type === INDUSTRY_TYPES.BREWERY &&
                        tile.playerId !== playerId &&
                        !tile.flipped && tile.resourceCubes > 0) {
                        sources.push({ type: 'opponent', key });
                    }
                }
            }
            if (isBreweryFarm(loc)) {
                const tile = this.breweryFarmTiles[loc];
                if (tile && tile.type === INDUSTRY_TYPES.BREWERY &&
                    tile.playerId !== playerId &&
                    !tile.flipped && tile.resourceCubes > 0) {
                    sources.push({ type: 'opponent', key: `farm_${loc}` });
                }
            }
        }

        // Merchant beer
        for (let i = 0; i < this.merchantTiles.length; i++) {
            const mt = this.merchantTiles[i];
            if (mt.hasBeer) {
                // Check if merchant location is connected
                if (connected.has(mt.location)) {
                    sources.push({ type: 'merchant', index: i });
                }
            }
        }

        return sources;
    }

    // Consume a resource from a tile
    consumeResource(key) {
        let tile;
        if (key.startsWith('farm_')) {
            const farmId = key.substring(5);
            tile = this.breweryFarmTiles[farmId];
        } else {
            tile = this.boardIndustries[key];
        }
        if (!tile || tile.resourceCubes <= 0) return false;
        tile.resourceCubes--;

        // If depleted, flip the tile
        if (tile.resourceCubes <= 0) {
            this.flipTile(key, tile);
        }
        return true;
    }

    flipTile(key, tile) {
        if (tile.flipped) return;
        tile.flipped = true;
        // Increase income
        this.adjustIncome(tile.playerId, tile.tileData.income);
    }

    // ========================================================================
    // Turn management
    // ========================================================================

    advanceTurn() {
        this.actionsThisTurn++;
        this.selectedCardIndex = null;
        this.selectedAction = null;
        this.pendingAction = null;

        // Check if era should end (current player just played their last card)
        const allHandsEmpty = this.players.every(p => p.hand.length === 0);
        if (allHandsEmpty && this.drawDeck.length === 0) {
            if (this.era === ERA.CANAL) {
                return 'endCanalEra';
            } else {
                return 'endGame';
            }
        }

        if (this.actionsThisTurn >= this.actionsPerTurn) {
            // Draw cards for current player
            this.drawCards(this.currentPlayerId);

            // Move to next player
            this.actionsThisTurn = 0;
            this.currentPlayerIndex++;

            if (this.currentPlayerIndex >= this.numPlayers) {
                this.currentPlayerIndex = 0;
                const roundResult = this.endRound();
                if (roundResult !== 'continue') return roundResult;
            }

            // Skip players with no cards
            const skipResult = this.skipEmptyHandPlayers();
            if (skipResult) return skipResult;
        } else {
            // If current player has no cards left, end their turn early
            if (this.currentPlayer.hand.length === 0) {
                this.drawCards(this.currentPlayerId);
                if (this.currentPlayer.hand.length === 0) {
                    // Still no cards - skip remaining actions
                    this.actionsThisTurn = 0;
                    this.currentPlayerIndex++;
                    if (this.currentPlayerIndex >= this.numPlayers) {
                        this.currentPlayerIndex = 0;
                        const roundResult = this.endRound();
                        if (roundResult !== 'continue') return roundResult;
                    }
                    const skipResult = this.skipEmptyHandPlayers();
                    if (skipResult) return skipResult;
                }
            }
        }

        return 'continue';
    }

    skipEmptyHandPlayers() {
        let safety = 0;
        while (this.currentPlayer.hand.length === 0 && this.drawDeck.length === 0 && safety < this.numPlayers) {
            this.currentPlayerIndex++;
            safety++;
            if (this.currentPlayerIndex >= this.numPlayers) {
                this.currentPlayerIndex = 0;
                // If we've wrapped around and everyone is empty, check for era end
                const allEmpty = this.players.every(p => p.hand.length === 0);
                if (allEmpty && this.drawDeck.length === 0) {
                    if (this.era === ERA.CANAL) return 'endCanalEra';
                    else return 'endGame';
                }
                const roundResult = this.endRound();
                if (roundResult !== 'continue') return roundResult;
            }
        }
        return null; // No special event
    }

    endRound() {
        // Income phase
        for (const player of this.players) {
            const incomeAmount = this.getIncomeAmount(player.income);
            player.money += incomeAmount;
            if (player.money < 0) {
                // Player is in debt - handle debt (simplified: just set to 0, lose VP)
                const debt = Math.abs(player.money);
                player.vp = Math.max(0, player.vp - debt);
                player.money = 0;
            }
        }

        // Determine turn order: player who spent LEAST goes first
        // Ties broken by current turn order (earlier player goes first)
        this.turnOrder.sort((a, b) => {
            const spentA = this.moneySpentThisRound[a] || 0;
            const spentB = this.moneySpentThisRound[b] || 0;
            if (spentA !== spentB) return spentA - spentB; // Less spending = earlier turn
            return 0; // Maintain current relative order for ties
        });

        // Reset spending tracker for next round
        this.moneySpentThisRound = {};

        this.round++;
        if (this.isFirstRound) {
            this.isFirstRound = false;
            this.actionsPerTurn = ACTIONS_PER_TURN;
        }

        // Check if era ends (no cards left in any player's hand and draw deck is empty)
        const allHandsEmpty = this.players.every(p => p.hand.length === 0);
        if (allHandsEmpty && this.drawDeck.length === 0) {
            if (this.era === ERA.CANAL) {
                return 'endCanalEra';
            } else {
                return 'endGame';
            }
        }

        return 'continue';
    }

    endCanalEra() {
        // Score canal era
        const scores = this.calculateEraScore();

        // Remove all canal links
        for (const [connId, link] of Object.entries(this.boardLinks)) {
            if (link.type === 'canal') {
                delete this.boardLinks[connId];
                this.players[link.playerId].linksRemaining.canal++;
            }
        }

        // Remove all level 1 industry tiles from board
        for (const [key, tile] of Object.entries(this.boardIndustries)) {
            if (tile.tileData.level === 1) {
                delete this.boardIndustries[key];
            }
        }

        // Remove brewery farm level 1 tiles
        for (const [farmId, tile] of Object.entries(this.breweryFarmTiles)) {
            if (tile && tile.tileData.level === 1) {
                delete this.breweryFarmTiles[farmId];
            }
        }

        // Transition to rail era
        this.era = ERA.RAIL;
        this.round = 1;
        this.isFirstRound = true;
        this.actionsPerTurn = FIRST_ROUND_ACTIONS;
        this.currentPlayerIndex = 0;
        this.actionsThisTurn = 0;

        // Restock merchant beer
        for (const mt of this.merchantTiles) {
            mt.hasBeer = true;
        }

        // Reshuffle all cards into draw deck
        this.initDeck();
        // Clear player hands
        for (const player of this.players) {
            player.hand = [];
        }
        this.dealCards();

        return scores;
    }

    endGame() {
        // Score rail era
        const scores = this.calculateEraScore();
        this.gameOver = true;

        // Add income bonus VP
        for (const player of this.players) {
            player.vp += player.income;
        }

        return scores;
    }

    calculateEraScore() {
        const scores = this.players.map(p => ({
            playerId: p.id,
            name: p.name,
            linkVP: 0,
            industryVP: 0,
            incomeVP: 0,
            totalVP: p.vp,
        }));

        // Score links
        for (const [connId, link] of Object.entries(this.boardLinks)) {
            const conn = CONNECTIONS.find(c => c.id === connId);
            if (!conn) continue;

            let linkValue = 0;
            for (const cityId of conn.cities) {
                if (isCity(cityId)) {
                    const city = CITIES[cityId];
                    for (let i = 0; i < city.slots.length; i++) {
                        const key = `${cityId}_${i}`;
                        const tile = this.boardIndustries[key];
                        if (tile && tile.flipped) {
                            linkValue += tile.tileData.linkVP;
                        }
                    }
                }
                if (isMerchantLocation(cityId)) {
                    // Merchant locations count as 2 VP per link connected
                    linkValue += 2;
                }
                if (isBreweryFarm(cityId)) {
                    const tile = this.breweryFarmTiles[cityId];
                    if (tile && tile.flipped) {
                        linkValue += tile.tileData.linkVP;
                    }
                }
            }

            const playerScore = scores.find(s => s.playerId === link.playerId);
            if (playerScore) {
                playerScore.linkVP += linkValue;
            }
        }

        // Score flipped industries
        for (const [key, tile] of Object.entries(this.boardIndustries)) {
            if (tile.flipped) {
                const playerScore = scores.find(s => s.playerId === tile.playerId);
                if (playerScore) {
                    playerScore.industryVP += tile.tileData.vp;
                }
            }
        }

        // Score brewery farm tiles
        for (const [farmId, tile] of Object.entries(this.breweryFarmTiles)) {
            if (tile && tile.flipped) {
                const playerScore = scores.find(s => s.playerId === tile.playerId);
                if (playerScore) {
                    playerScore.industryVP += tile.tileData.vp;
                }
            }
        }

        // Apply scores
        for (const score of scores) {
            const player = this.players[score.playerId];
            player.vp += score.linkVP + score.industryVP;
            score.totalVP = player.vp;
        }

        return scores;
    }

    // ========================================================================
    // Player tile stack helpers
    // ========================================================================

    // Get the next available tile of a type for a player
    getNextTile(playerId, industryType) {
        const player = this.players[playerId];
        const tiles = player.industryTiles[industryType];
        if (!tiles) return null;
        return tiles.find(t => !t.used);
    }

    // Get the current level a player can build for a type
    getCurrentLevel(playerId, industryType) {
        const tile = this.getNextTile(playerId, industryType);
        return tile ? tile.level : null;
    }

    // Remove (use) the next tile from a player's stack
    useNextTile(playerId, industryType) {
        const player = this.players[playerId];
        const tiles = player.industryTiles[industryType];
        if (!tiles) return null;
        const tile = tiles.find(t => !t.used);
        if (tile) {
            tile.used = true;
            return tile;
        }
        return null;
    }

    // For development: remove tiles without building them
    developTile(playerId, industryType) {
        const player = this.players[playerId];
        const tiles = player.industryTiles[industryType];
        if (!tiles) return null;
        const tile = tiles.find(t => !t.used);
        if (tile) {
            tile.used = true;
            return tile;
        }
        return null;
    }

    // Get all remaining tile counts for a player
    getRemainingTiles(playerId) {
        const player = this.players[playerId];
        const result = {};
        for (const [type, tiles] of Object.entries(player.industryTiles)) {
            const remaining = tiles.filter(t => !t.used);
            result[type] = {
                count: remaining.length,
                nextLevel: remaining.length > 0 ? remaining[0].level : null,
                tiles: remaining,
            };
        }
        return result;
    }

    // ========================================================================
    // State inspection for window.render_game_to_text
    // ========================================================================

    toJSON() {
        return {
            era: this.era,
            round: this.round,
            currentPlayer: this.currentPlayerId,
            actionsRemaining: this.actionsPerTurn - this.actionsThisTurn,
            players: this.players.map(p => ({
                id: p.id,
                name: p.name,
                money: p.money,
                income: p.income,
                vp: p.vp,
                handSize: p.hand.length,
                linksRemaining: p.linksRemaining,
            })),
            coalMarket: this.coalMarket,
            ironMarket: this.ironMarket,
            boardIndustries: Object.keys(this.boardIndustries).length,
            boardLinks: Object.keys(this.boardLinks).length,
            drawDeckSize: this.drawDeck.length,
        };
    }
}
