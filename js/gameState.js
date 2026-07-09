// ============================================================================
// Brass: Birmingham - Game State Management
// ============================================================================

class GameState {
    constructor(numPlayers, playerNames, playerIsAI = []) {
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
            const aiConfig = playerIsAI[i] || {};
            this.players.push(this.createPlayer(i, playerNames[i], !!aiConfig.isAI, aiConfig.difficulty || 'normal'));
        }

        // Initial turn order is random (rulebook: character tiles are shuffled
        // onto the Turn Order Track during setup)
        this.turnOrder = this.players.map((_, i) => i);
        this.shuffleArray(this.turnOrder);

        // Events generated during end-of-round upkeep (shortfall tile sales
        // etc.), for the UI layer to surface in the game log.
        this.lastRoundEvents = [];

        // Board state
        this.boardIndustries = {}; // cityId_slotIndex -> { playerId, type, level, tileData, flipped, resourceCubes }
        this.boardLinks = {}; // connectionId -> { playerId, type: 'canal'|'rail' }
        this.breweryFarmTiles = {}; // 'northern'|'southern' -> { playerId, type, level, tileData, flipped, resourceCubes }

        // Markets
        this.coalMarket = COAL_MARKET_INITIAL; // number of cubes remaining
        this.ironMarket = IRON_MARKET_INITIAL;

        // Merchant state
        this.merchantTiles = []; // { location, buys: 'any'|'blank'|industryType, hasBeer }
        this.initMerchants();

        // Card draw deck and discard
        this.drawDeck = [];
        this.wildLocationPile = 4; // 4 wild location cards
        this.wildIndustryPile = 4; // 4 wild industry cards
        this.initDeck();

        // Deal cards, then seed each player's discard pile with 1 card
        // (rulebook: Player Area Setup step 9) — this makes the era last
        // exactly 10/9/8 rounds at 2/3/4 players.
        this.dealCards();
        this.seedDiscardPiles();

        // Selected card for current action
        this.selectedCardIndex = null;
        this.selectedAction = null;
        this.pendingAction = null; // { action, step, data }
    }

    createPlayer(index, name, isAI = false, aiDifficulty = 'normal') {
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
            incomeSpace: INITIAL_INCOME_SPACE, // progress track space (level 0)
            vp: 0,
            hand: [],
            industryTiles: industryTiles,
            linksRemaining: { canal: 14, rail: 14 },
            hasWildLocation: false,
            hasWildIndustry: false,
            isAI: isAI,
            aiDifficulty: aiDifficulty,
        };
    }

    initMerchants() {
        // Gather the tiles marked for this player count, shuffle them, and
        // deal one to each active merchant slot (rulebook: Board Setup step 5).
        const mix = [];
        for (let p = 2; p <= this.numPlayers; p++) {
            if (MERCHANT_TILE_MIX[p]) mix.push(...MERCHANT_TILE_MIX[p]);
        }
        this.shuffleArray(mix);

        const tiles = [];
        for (const [merchId, merch] of Object.entries(MERCHANTS)) {
            if (merch.minPlayers > this.numPlayers) continue;
            for (let s = 0; s < merch.slots; s++) {
                const buys = mix.pop();
                tiles.push({
                    location: merchId,
                    buys, // 'any' | 'blank' | industry type
                    hasBeer: buys !== 'blank', // no beer beside blank tiles
                });
            }
        }
        this.merchantTiles = tiles;
    }

    // Does this merchant tile accept the given (sellable) industry type?
    merchantTileAccepts(mt, industryType) {
        return mt.buys === 'any' || mt.buys === industryType;
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

        // Industry cards. Every industry card carries an industryTypes array;
        // the physical deck includes dual "Cotton Mill or Manufacturer" cards
        // that can be built as either industry.
        for (const [industryType, count] of Object.entries(deckData.industries)) {
            for (let i = 0; i < count; i++) {
                deck.push({
                    type: CARD_TYPES.INDUSTRY,
                    industryTypes: [industryType],
                    name: INDUSTRY_DISPLAY[industryType].name,
                });
            }
        }
        for (let i = 0; i < (deckData.dualCottonManufacturer || 0); i++) {
            deck.push({
                type: CARD_TYPES.INDUSTRY,
                industryTypes: [INDUSTRY_TYPES.COTTON_MILL, INDUSTRY_TYPES.MANUFACTURER],
                name: 'Cotton Mill / Manufacturer',
            });
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

    // Each player places 1 card from the deck face down as their discard pile
    // at setup and after the era transition reshuffle.
    seedDiscardPiles() {
        for (const player of this.players) {
            if (this.drawDeck.length > 0) this.drawDeck.pop();
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
    // The income marker sits on a Progress Track SPACE (0-99); the income
    // LEVEL (-10..30) is derived from the space. Tile flips and bonuses
    // advance the marker by spaces; loans drop it by levels.

    getIncomeLevel(playerId) {
        return incomeLevelFromSpace(this.players[playerId].incomeSpace);
    }

    advanceIncomeSpaces(playerId, spaces) {
        const player = this.players[playerId];
        player.incomeSpace = Math.min(MAX_INCOME_SPACE, Math.max(0, player.incomeSpace + spaces));
    }

    canTakeLoan(playerId) {
        // A loan may not take the income level below -10
        return this.getIncomeLevel(playerId) - LOAN_INCOME_PENALTY >= MIN_INCOME;
    }

    applyLoanIncomeDrop(playerId) {
        // Drop 3 income LEVELS, placing the marker on the highest space
        // within the lower level.
        const player = this.players[playerId];
        const newLevel = Math.max(MIN_INCOME, this.getIncomeLevel(playerId) - LOAN_INCOME_PENALTY);
        player.incomeSpace = incomeHighestSpaceOfLevel(newLevel);
    }

    // ========================================================================
    // Market helpers
    // ========================================================================

    getCoalPrice() {
        // When the market is empty, coal can still be bought for £8 each
        if (this.coalMarket <= 0) return COAL_EMPTY_PRICE;
        const spaceIndex = COAL_MARKET_PRICES.length - this.coalMarket;
        return COAL_MARKET_PRICES[spaceIndex] ?? COAL_EMPTY_PRICE;
    }

    getIronPrice() {
        // When the market is empty, iron can still be bought for £6 each
        if (this.ironMarket <= 0) return IRON_EMPTY_PRICE;
        const spaceIndex = IRON_MARKET_PRICES.length - this.ironMarket;
        return IRON_MARKET_PRICES[spaceIndex] ?? IRON_EMPTY_PRICE;
    }

    // Consume one cube of market coal/iron. The market may be empty — cubes
    // are then bought from the General Supply at the flat empty price.
    takeMarketCoal() {
        if (this.coalMarket > 0) this.coalMarket--;
    }

    takeMarketIron() {
        if (this.ironMarket > 0) this.ironMarket--;
    }

    // When a Coal Mine / Iron Works is built, as many cubes as possible are
    // immediately moved from the tile to empty spaces in its market, filling
    // the most expensive spaces first; the builder collects the price of each
    // space filled. If the tile is emptied it flips at once.
    // (Caller is responsible for the coal mine's merchant-connection check.)
    autoSellToMarket(key, tile) {
        const isCoal = tile.type === INDUSTRY_TYPES.COAL_MINE;
        const prices = isCoal ? COAL_MARKET_PRICES : IRON_MARKET_PRICES;
        let moneyGained = 0;
        let cubesMoved = 0;

        while (tile.resourceCubes > 0) {
            const cubesInMarket = isCoal ? this.coalMarket : this.ironMarket;
            if (cubesInMarket >= prices.length) break; // market full
            // Most expensive empty space is just below the cheapest filled cube
            moneyGained += prices[prices.length - cubesInMarket - 1];
            if (isCoal) this.coalMarket++; else this.ironMarket++;
            tile.resourceCubes--;
            cubesMoved++;
        }

        if (cubesMoved > 0 && tile.resourceCubes === 0) {
            this.flipTile(key, tile);
        }
        return { moneyGained, cubesMoved, flipped: tile.flipped };
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
                // Check if locationId is the brewery farm that this link passes through
                if (conn.viaBrewery && conn.viaBrewery === locationId) {
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

            // Determine the other endpoint(s) reachable from locationId
            const endpoints = [];
            if (conn.cities[0] === locationId) {
                endpoints.push(conn.cities[1]);
                if (conn.viaBrewery) endpoints.push(conn.viaBrewery);
            } else if (conn.cities[1] === locationId) {
                endpoints.push(conn.cities[0]);
                if (conn.viaBrewery) endpoints.push(conn.viaBrewery);
            } else if (conn.viaBrewery === locationId) {
                // When at the brewery farm, both city endpoints are reachable
                endpoints.push(conn.cities[0], conn.cities[1]);
            }

            if (endpoints.length > 0) {
                visitedConnections.add(conn.id);
                for (const otherEnd of endpoints) {
                    if (!connected.has(otherEnd)) {
                        connected.add(otherEnd);
                        const further = this.getConnectedLocations(otherEnd, visitedConnections);
                        for (const loc of further) connected.add(loc);
                    }
                }
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

            // Check for coal mines at this location (one entry per cube, so
            // callers needing several coal can draw repeatedly from one mine)
            if (isCity(loc)) {
                const city = CITIES[loc];
                for (let i = 0; i < city.slots.length; i++) {
                    const key = `${loc}_${i}`;
                    const tile = this.boardIndustries[key];
                    if (tile && tile.type === INDUSTRY_TYPES.COAL_MINE &&
                        !tile.flipped && tile.resourceCubes > 0) {
                        for (let c = 0; c < tile.resourceCubes; c++) {
                            sources.push({ type: 'mine', key, distance, free: true });
                        }
                    }
                }
            }

            // Follow links to adjacent locations
            for (const conn of CONNECTIONS) {
                const link = this.boardLinks[conn.id];
                if (!link) continue;

                const neighbors = [];
                if (conn.cities[0] === loc) {
                    neighbors.push(conn.cities[1]);
                    if (conn.viaBrewery) neighbors.push(conn.viaBrewery);
                } else if (conn.cities[1] === loc) {
                    neighbors.push(conn.cities[0]);
                    if (conn.viaBrewery) neighbors.push(conn.viaBrewery);
                } else if (conn.viaBrewery === loc) {
                    neighbors.push(conn.cities[0], conn.cities[1]);
                }

                for (const n of neighbors) {
                    if (!visited.has(n)) queue.push({ loc: n, distance: distance + 1 });
                }
            }
        }

        // Sort by distance (nearest first) — coal MUST come from the closest
        // connected mine before farther mines or the market
        sources.sort((a, b) => a.distance - b.distance);

        // Market coal requires a connection to a merchant location. The
        // `visited` set from the BFS above is exactly the connected set.
        const merchantConnected = [...visited].some(loc => isMerchantLocation(loc));
        if (merchantConnected) {
            // One entry per market cube (cheapest first)...
            for (let i = 0; i < this.coalMarket; i++) {
                const spaceIndex = COAL_MARKET_PRICES.length - this.coalMarket + i;
                sources.push({ type: 'market', price: COAL_MARKET_PRICES[spaceIndex] ?? COAL_EMPTY_PRICE, free: false });
            }
            // ...then unlimited General Supply coal at £8 once the market is empty
            for (let i = 0; i < 6; i++) {
                sources.push({ type: 'market', price: COAL_EMPTY_PRICE, free: false });
            }
        }

        return sources;
    }

    // Find iron source: any unflipped iron works (no connection needed), or market
    findIronSource(playerId) {
        const sources = [];

        // Iron doesn't need connection - any iron works on the board
        // Add one entry per available cube so callers needing 2+ iron see enough entries
        for (const [key, tile] of Object.entries(this.boardIndustries)) {
            if (tile.type === INDUSTRY_TYPES.IRON_WORKS &&
                !tile.flipped && tile.resourceCubes > 0) {
                for (let c = 0; c < tile.resourceCubes; c++) {
                    sources.push({ type: 'works', key, free: true });
                }
            }
        }

        // One market entry per cube (cheapest first), then unlimited General
        // Supply iron at £6. No connection is ever required for iron.
        for (let i = 0; i < this.ironMarket; i++) {
            const spaceIndex = IRON_MARKET_PRICES.length - this.ironMarket + i;
            sources.push({ type: 'market', price: IRON_MARKET_PRICES[spaceIndex] ?? IRON_EMPTY_PRICE, free: false });
        }
        for (let i = 0; i < 6; i++) {
            sources.push({ type: 'market', price: IRON_EMPTY_PRICE, free: false });
        }

        return sources;
    }

    // Find beer sources for a location where beer is required.
    // - Own unflipped breweries: usable anywhere, no connection needed.
    // - Opponents' unflipped breweries: must be connected to locationId.
    // - Merchant beer: ONLY usable when selling to that merchant. Callers pass
    //   allowedMerchantIndices (indices into merchantTiles) for the merchant(s)
    //   the sale is going to; pass nothing for non-sell uses (e.g. rail links).
    findBeerSources(locationId, playerId, allowedMerchantIndices = null) {
        const sources = [];

        // Own breweries anywhere (no connection needed)
        // Add one entry per available cube so callers needing 2+ beer see enough entries
        for (const [key, tile] of Object.entries(this.boardIndustries)) {
            if (tile.type === INDUSTRY_TYPES.BREWERY && tile.playerId === playerId &&
                !tile.flipped && tile.resourceCubes > 0) {
                for (let c = 0; c < tile.resourceCubes; c++) {
                    sources.push({ type: 'own', key });
                }
            }
        }
        // Own brewery farms
        for (const [farmId, tile] of Object.entries(this.breweryFarmTiles)) {
            if (tile && tile.type === INDUSTRY_TYPES.BREWERY && tile.playerId === playerId &&
                !tile.flipped && tile.resourceCubes > 0) {
                for (let c = 0; c < tile.resourceCubes; c++) {
                    sources.push({ type: 'own', key: `farm_${farmId}` });
                }
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
                        for (let c = 0; c < tile.resourceCubes; c++) {
                            sources.push({ type: 'opponent', key });
                        }
                    }
                }
            }
            if (isBreweryFarm(loc)) {
                const tile = this.breweryFarmTiles[loc];
                if (tile && tile.type === INDUSTRY_TYPES.BREWERY &&
                    tile.playerId !== playerId &&
                    !tile.flipped && tile.resourceCubes > 0) {
                    for (let c = 0; c < tile.resourceCubes; c++) {
                        sources.push({ type: 'opponent', key: `farm_${loc}` });
                    }
                }
            }
        }

        // Merchant beer — only from the merchant(s) this sale is going to
        if (allowedMerchantIndices) {
            for (const i of allowedMerchantIndices) {
                const mt = this.merchantTiles[i];
                if (mt && mt.hasBeer && connected.has(mt.location)) {
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
        // Advance income marker by the tile's income icon count (SPACES)
        this.advanceIncomeSpaces(tile.playerId, tile.tileData.income);
    }

    // ========================================================================
    // Turn management
    // ========================================================================

    advanceTurn() {
        this.actionsThisTurn++;
        this.selectedCardIndex = null;
        this.selectedAction = null;
        this.pendingAction = null;

        // Check if era should end mid-turn (all hands empty, deck exhausted).
        // Call endRound to distribute income before signaling era end.
        const allHandsEmpty = this.players.every(p => p.hand.length === 0);
        if (allHandsEmpty && this.drawDeck.length === 0) {
            return this.endRound(); // returns 'endCanalEra' or 'endGame'
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
                const roundResult = this.endRound(); // handles income, era-end detection
                if (roundResult !== 'continue') return roundResult;
            }
        }
        return null; // No special event
    }

    endRound() {
        this.lastRoundEvents = [];

        // The era ends following the round in which all cards are played
        const allHandsEmpty = this.players.every(p => p.hand.length === 0);
        const eraEnding = allHandsEmpty && this.drawDeck.length === 0;
        const isFinalRoundOfGame = eraEnding && this.era === ERA.RAIL;

        // Income phase — not collected at the end of the final round of the game
        if (!isFinalRoundOfGame) {
            for (const player of this.players) {
                const level = incomeLevelFromSpace(player.incomeSpace);
                player.money += level;
                if (player.money < 0) {
                    this.resolveShortfall(player);
                }
            }
        }

        // Determine turn order: player who spent LEAST goes first next round
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

        if (eraEnding) {
            return this.era === ERA.CANAL ? 'endCanalEra' : 'endGame';
        }

        return 'continue';
    }

    // A player who cannot pay negative income must sell industry tiles from
    // the board for half their cost (rounded down), stopping as soon as the
    // shortfall is covered; if that still isn't enough, they lose 1 VP per £1.
    resolveShortfall(player) {
        const candidates = [];
        for (const [key, tile] of Object.entries(this.boardIndustries)) {
            if (tile.playerId === player.id) candidates.push({ key, tile, farm: false });
        }
        for (const [farmId, tile] of Object.entries(this.breweryFarmTiles)) {
            if (tile && tile.playerId === player.id) candidates.push({ key: farmId, tile, farm: true });
        }
        // Auto-choice: give up unflipped low-VP tiles before flipped ones
        candidates.sort((a, b) =>
            (Number(a.tile.flipped) - Number(b.tile.flipped)) ||
            (a.tile.tileData.vp - b.tile.tileData.vp));

        for (const cand of candidates) {
            if (player.money >= 0) break;
            const refund = Math.floor(cand.tile.tileData.cost / 2);
            if (cand.farm) delete this.breweryFarmTiles[cand.key];
            else delete this.boardIndustries[cand.key];
            player.money += refund;
            this.lastRoundEvents.push({
                type: 'shortfall-sale',
                playerId: player.id,
                message: `sold ${INDUSTRY_DISPLAY[cand.tile.type].name} Lv${cand.tile.tileData.level} for £${refund} to cover income shortfall`,
            });
        }

        if (player.money < 0) {
            const deficit = -player.money;
            const vpLoss = Math.min(player.vp, deficit);
            player.vp -= vpLoss;
            player.money = 0;
            this.lastRoundEvents.push({
                type: 'shortfall-vp',
                playerId: player.id,
                message: `could not pay income shortfall — lost ${vpLoss} VP`,
            });
        }
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

        // Remove Level I (canal-era-only) industry tiles; Level II+ tiles persist
        // into the Rail Era and score again at game end (per the rulebook).
        for (const [key, tile] of Object.entries(this.boardIndustries)) {
            if (!tile.tileData.railEra) {
                delete this.boardIndustries[key];
            }
        }

        // Same rule for brewery farm tiles
        for (const [farmId, tile] of Object.entries(this.breweryFarmTiles)) {
            if (tile && !tile.tileData.railEra) {
                delete this.breweryFarmTiles[farmId];
            }
        }

        // Transition to rail era. The 1-action restriction applies only to
        // the first round of the CANAL era — every Rail Era round is 2 actions.
        this.era = ERA.RAIL;
        this.round = 1;
        this.isFirstRound = false;
        this.actionsPerTurn = ACTIONS_PER_TURN;
        this.currentPlayerIndex = 0;
        this.actionsThisTurn = 0;

        // Reset merchant beer (blank tiles never hold beer)
        for (const mt of this.merchantTiles) {
            mt.hasBeer = mt.buys !== 'blank';
        }

        // Return any wild cards from player hands before clearing
        for (const player of this.players) {
            for (const card of player.hand) {
                if (card.type === CARD_TYPES.WILD_LOCATION) {
                    this.wildLocationPile++;
                    player.hasWildLocation = false;
                } else if (card.type === CARD_TYPES.WILD_INDUSTRY) {
                    this.wildIndustryPile++;
                    player.hasWildIndustry = false;
                }
            }
            player.hand = [];
        }

        // Reshuffle all cards into draw deck, deal new hands, seed discards
        this.initDeck();
        this.dealCards();
        this.seedDiscardPiles();

        return scores;
    }

    endGame() {
        // Score rail era
        const scores = this.calculateEraScore();
        this.gameOver = true;

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

            // Each link scores 1 VP per link icon in adjacent locations.
            // Icons come from built industry tiles (flipped OR unflipped —
            // both faces show them) and from merchant locations (2 each).
            let linkValue = 0;
            for (const cityId of conn.cities) {
                if (isCity(cityId)) {
                    const city = CITIES[cityId];
                    for (let i = 0; i < city.slots.length; i++) {
                        const key = `${cityId}_${i}`;
                        const tile = this.boardIndustries[key];
                        if (tile) {
                            linkValue += tile.tileData.linkVP;
                        }
                    }
                }
                if (isMerchantLocation(cityId)) {
                    linkValue += 2;
                }
                if (isBreweryFarm(cityId)) {
                    const tile = this.breweryFarmTiles[cityId];
                    if (tile) {
                        linkValue += tile.tileData.linkVP;
                    }
                }
            }
            // Also score brewery farms that this link passes through (e.g. kidderminster-worcester via southern)
            if (conn.viaBrewery) {
                const tile = this.breweryFarmTiles[conn.viaBrewery];
                if (tile) {
                    linkValue += tile.tileData.linkVP;
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
                incomeLevel: incomeLevelFromSpace(p.incomeSpace),
                incomeSpace: p.incomeSpace,
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
