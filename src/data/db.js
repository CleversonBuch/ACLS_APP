// ============================================
// LigaPro Sinuca – localStorage Data Layer
// ============================================

const STORAGE_PREFIX = 'ligapro_';

function getCollection(name) {
    try {
        const data = localStorage.getItem(STORAGE_PREFIX + name);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

function setCollection(name, data) {
    localStorage.setItem(STORAGE_PREFIX + name, JSON.stringify(data));
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// ============================================
// Generic CRUD
// ============================================
export function getAll(collection) {
    return getCollection(collection);
}

export function getById(collection, id) {
    return getCollection(collection).find(item => item.id === id) || null;
}

export function create(collection, item) {
    const items = getCollection(collection);
    const newItem = {
        ...item,
        id: generateId(),
        createdAt: new Date().toISOString()
    };
    items.push(newItem);
    setCollection(collection, items);
    return newItem;
}

export function update(collection, id, updates) {
    const items = getCollection(collection);
    const index = items.findIndex(item => item.id === id);
    if (index === -1) return null;
    items[index] = { ...items[index], ...updates, updatedAt: new Date().toISOString() };
    setCollection(collection, items);
    return items[index];
}

export function remove(collection, id) {
    const items = getCollection(collection);
    const filtered = items.filter(item => item.id !== id);
    setCollection(collection, filtered);
    return filtered;
}

// ============================================
// Players
// ============================================
export function getPlayers() {
    return getAll('players');
}

export function getPlayer(id) {
    return getById('players', id);
}

export function createPlayer(data) {
    return create('players', {
        name: data.name,
        nickname: data.nickname || '',
        photo: data.photo || '',
        teamId: data.teamId || 'default',
        eloRating: 1000,
        points: 0,
        wins: 0,
        losses: 0,
        streak: 0,
        bestStreak: 0,
        badges: []
    });
}

export function updatePlayer(id, data) {
    return update('players', id, data);
}

export function deletePlayer(id) {
    return remove('players', id);
}

// ============================================
// Selectives (Seletivas)
// ============================================
export function getSelectives() {
    return getAll('selectives');
}

export function getSelective(id) {
    return getById('selectives', id);
}

export function createSelective(data) {
    return create('selectives', {
        name: data.name,
        mode: data.mode, // 'elimination', 'round-robin', 'swiss'
        eventType: data.eventType || 'seletiva', // 'seletiva' | 'etapa'
        playerIds: data.playerIds || [],
        config: {
            rounds: data.config?.rounds || 1,
            pointsPerWin: data.config?.pointsPerWin ?? 3,
            pointsPerLoss: data.config?.pointsPerLoss ?? 0,
            tiebreaker: data.config?.tiebreaker || 'head-to-head'
        },
        status: 'active', // 'active', 'completed'
        seasonId: data.seasonId || getCurrentSeasonId(),
        teamId: data.teamId || 'default'
    });
}

export function updateSelective(id, data) {
    return update('selectives', id, data);
}

export function deleteSelective(id) {
    // Remove all matches belonging to this selective
    const allMatches = getAll('matches');
    const filtered = allMatches.filter(m => m.selectiveId !== id);
    setCollection('matches', filtered);
    // Remove the selective itself
    return remove('selectives', id);
}

// ============================================
// Stage Results (Etapas)
// ============================================
export function saveStageResults(selectiveId, placements) {
    // placements = [{ playerId, position, points }]
    return create('stageResults', {
        selectiveId,
        placements,
        completedAt: new Date().toISOString()
    });
}

export function getStageResults() {
    return getAll('stageResults');
}

export function getPlayerStageStats(playerId) {
    const results = getAll('stageResults');
    let stagesPlayed = 0, titles = 0, podiums = 0;
    const history = [];

    results.forEach(sr => {
        const placement = sr.placements.find(p => p.playerId === playerId);
        if (placement) {
            stagesPlayed++;
            if (placement.position === 1) titles++;
            if (placement.position <= 3) podiums++;
            // Get selective name
            const selective = getById('selectives', sr.selectiveId);
            history.push({
                name: selective?.name || 'Etapa',
                position: placement.position,
                date: sr.completedAt
            });
        }
    });

    return { stagesPlayed, titles, podiums, history };
}

// ============================================
// External Opponents
// ============================================
export function getExternalOpponents() {
    return getAll('externalOpponents');
}

export function createExternalOpponent(data) {
    return create('externalOpponents', {
        name: data.name,
        team: data.team || ''
    });
}

export function getExternalOpponent(id) {
    return getById('externalOpponents', id);
}

// ============================================
// External Matches (within Etapas)
// ============================================
export function createExternalMatch(data) {
    return create('externalMatches', {
        selectiveId: data.selectiveId,
        playerId: data.playerId, // our player
        externalOpponentId: data.externalOpponentId,
        result: data.result, // 'win' | 'loss'
        registeredAt: new Date().toISOString()
    });
}

export function getExternalMatchesBySelective(selectiveId) {
    return getAll('externalMatches').filter(m => m.selectiveId === selectiveId);
}

export function getExternalMatchesByPlayer(playerId) {
    return getAll('externalMatches').filter(m => m.playerId === playerId);
}

export function deleteExternalMatch(id) {
    return remove('externalMatches', id);
}

export function getPlayerExternalStats(playerId) {
    const matches = getExternalMatchesByPlayer(playerId);
    const wins = matches.filter(m => m.result === 'win').length;
    const losses = matches.filter(m => m.result === 'loss').length;
    const total = wins + losses;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

    // Group by opponent
    const opponentMap = {};
    matches.forEach(m => {
        if (!opponentMap[m.externalOpponentId]) {
            const opp = getExternalOpponent(m.externalOpponentId);
            opponentMap[m.externalOpponentId] = {
                name: opp?.name || '?',
                team: opp?.team || '',
                wins: 0,
                losses: 0
            };
        }
        if (m.result === 'win') opponentMap[m.externalOpponentId].wins++;
        else opponentMap[m.externalOpponentId].losses++;
    });

    return { total, wins, losses, winRate, opponents: Object.values(opponentMap) };
}
// Matches (Partidas)
// ============================================
export function getMatches() {
    return getAll('matches');
}

export function getMatchesBySelective(selectiveId) {
    return getAll('matches').filter(m => m.selectiveId === selectiveId);
}

export function createMatch(data) {
    return create('matches', {
        selectiveId: data.selectiveId,
        round: data.round,
        player1Id: data.player1Id,
        player2Id: data.player2Id,
        score1: null,
        score2: null,
        winnerId: null,
        status: 'pending' // 'pending', 'completed'
    });
}

export function updateMatch(id, data) {
    return update('matches', id, data);
}

// ============================================
// Seasons (Temporadas)
// ============================================
export function getSeasons() {
    return getAll('seasons');
}

export function getCurrentSeasonId() {
    const seasons = getAll('seasons');
    const currentYear = new Date().getFullYear();
    let current = seasons.find(s => s.year === currentYear && s.status === 'active');
    if (!current) {
        current = create('seasons', {
            year: currentYear,
            status: 'active',
            championId: null,
            viceId: null,
            finalRanking: []
        });
    }
    return current.id;
}

export function deleteSeason(id) {
    // Optional: remove related selectives and matches if we want a hard delete
    const allSelectives = getAll('selectives');
    const filteredSelectives = allSelectives.filter(s => s.seasonId !== id);
    setCollection('selectives', filteredSelectives);
    return remove('seasons', id);
}

export function closeSeason(id, championId, viceId, finalRanking) {
    return update('seasons', id, {
        status: 'completed',
        championId,
        viceId,
        finalRanking
    });
}

// ============================================
// Settings
// ============================================
export function getSettings() {
    try {
        const data = localStorage.getItem(STORAGE_PREFIX + 'settings');
        return data ? JSON.parse(data) : { rankingMode: 'points' };
    } catch {
        return { rankingMode: 'points' };
    }
}

export function updateSettings(updates) {
    const current = getSettings();
    const newSettings = { ...current, ...updates };
    localStorage.setItem(STORAGE_PREFIX + 'settings', JSON.stringify(newSettings));
    return newSettings;
}

// ============================================
// Teams
// ============================================
export function getTeams() {
    const teams = getAll('teams');
    if (teams.length === 0) {
        create('teams', { name: 'Equipe Principal' });
        return getAll('teams');
    }
    return teams;
}

export function createTeam(data) {
    return create('teams', { name: data.name });
}

// ============================================
// Demo / Seed Data
// ============================================
export function seedDemoData() {
    if (getPlayers().length > 0) return; // Already seeded

    const players = [
        { name: 'Carlos Silva', nickname: 'Tubarão' },
        { name: 'Roberto Alves', nickname: 'Máquina' },
        { name: 'André Costa', nickname: 'Sniper' },
        { name: 'Fernando Lima', nickname: 'Flash' },
        { name: 'Lucas Mendes', nickname: 'Rei' },
        { name: 'Paulo Santos', nickname: 'Brabo' },
        { name: 'João Pereira', nickname: 'Zen' },
        { name: 'Marcos Oliveira', nickname: 'Trovão' },
        { name: 'Diego Souza', nickname: 'Artilheiro' },
        { name: 'Rafael Gomes', nickname: 'Tático' },
    ];

    const createdPlayers = players.map(p => createPlayer(p));

    // Simulate some stats
    const statsData = [
        { wins: 18, losses: 4, points: 54, eloRating: 1180, streak: 5, bestStreak: 7, badges: ['🏆', '🔥'] },
        { wins: 15, losses: 6, points: 45, eloRating: 1140, streak: 3, bestStreak: 5, badges: ['🥈'] },
        { wins: 14, losses: 7, points: 42, eloRating: 1120, streak: 2, bestStreak: 4, badges: ['🥉'] },
        { wins: 12, losses: 8, points: 36, eloRating: 1080, streak: 1, bestStreak: 3, badges: [] },
        { wins: 11, losses: 9, points: 33, eloRating: 1050, streak: 0, bestStreak: 3, badges: [] },
        { wins: 10, losses: 10, points: 30, eloRating: 1020, streak: 2, bestStreak: 2, badges: [] },
        { wins: 9, losses: 12, points: 27, eloRating: 990, streak: 0, bestStreak: 2, badges: [] },
        { wins: 7, losses: 13, points: 21, eloRating: 960, streak: 0, bestStreak: 2, badges: [] },
        { wins: 5, losses: 14, points: 15, eloRating: 930, streak: 1, bestStreak: 1, badges: [] },
        { wins: 4, losses: 17, points: 12, eloRating: 900, streak: 0, bestStreak: 1, badges: [] },
    ];

    createdPlayers.forEach((p, i) => {
        updatePlayer(p.id, statsData[i]);
    });
}

// ============================================
// Hall of Fame
// ============================================
export function resetHallOfFame() {
    // Hall of Fame data comprises player wins, streak stats, badges, and completed season records.
    // 1. Reset all player stats that surface in Hall of Fame
    let players = getPlayers();
    players = players.map(p => ({
        ...p,
        wins: 0,
        losses: 0,
        streak: 0,
        bestStreak: 0,
        badges: []
    }));
    setCollection('players', players);

    // 2. Erase completed seasons entirely (History + Champions Timeline depend on this)
    const allSeasons = getSeasons();
    const activeSeason = allSeasons.find(s => s.status === 'active');
    // Only keeping the active season if there is one
    setCollection('seasons', activeSeason ? [activeSeason] : []);

    // 3. Clear stage results since they count titles & podiums
    setCollection('stageResults', []);
}

// ============================================
// Ranking Geral
// ============================================
export function resetCurrentRanking() {
    // Resets current points, elo, and active season stats without touching Hall of Fame badges or history
    let players = getPlayers();
    players = players.map(p => ({
        ...p,
        points: 0,
        eloRating: 1000,
        wins: 0,
        losses: 0,
        streak: 0
    }));
    setCollection('players', players);
}
