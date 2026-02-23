import { supabase } from '../lib/supabase.js';

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// ============================================
// Generic CRUD
// ============================================
export async function getAll(collection) {
    const { data, error } = await supabase.from(collection).select('*');
    if (error) { console.error(`Error fetching ${collection}:`, error); return []; }
    return data || [];
}

export async function getById(collection, id) {
    const { data, error } = await supabase.from(collection).select('*').eq('id', id).single();
    if (error) { console.error(`Error fetching ${collection} by id:`, error); return null; }
    return data;
}

export async function create(collection, item) {
    const newItem = {
        ...item,
        id: item.id || generateId(),
        createdAt: new Date().toISOString()
    };
    // Strip undefined
    Object.keys(newItem).forEach(key => newItem[key] === undefined && delete newItem[key]);

    console.log(`[DB] Inserting into '${collection}':`, JSON.stringify(newItem, null, 2));
    const { data, error } = await supabase.from(collection).insert([newItem]).select().single();
    if (error) {
        console.error(`[DB] ❌ Error creating in ${collection}:`, error.message, error.details, error.hint, error.code);
        return null;
    }
    console.log(`[DB] ✅ Created in '${collection}':`, data?.id);
    return data;
}

export async function update(collection, id, updates) {
    const cleanUpdates = { ...updates, updatedAt: new Date().toISOString() };
    Object.keys(cleanUpdates).forEach(key => cleanUpdates[key] === undefined && delete cleanUpdates[key]);

    const { data, error } = await supabase.from(collection).update(cleanUpdates).eq('id', id).select().single();
    if (error) { console.error(`Error updating ${collection}:`, error); return null; }
    return data;
}

export async function remove(collection, id) {
    const { data, error } = await supabase.from(collection).delete().eq('id', id).select();
    if (error) { console.error(`Error deleting from ${collection}:`, error); return null; }
    return data;
}

// ============================================
// Players
// ============================================
export async function getPlayers() {
    return await getAll('players');
}

export async function getPlayer(id) {
    return await getById('players', id);
}

export async function createPlayer(data) {
    return await create('players', {
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

export async function updatePlayer(id, data) {
    return await update('players', id, data);
}

export async function deletePlayer(id) {
    return await remove('players', id);
}

// ============================================
// Selectives (Seletivas & Etapas)
// ============================================
export async function getSelectives() {
    const seletivas = await getAll('seletivas');
    const etapas = await getAll('etapas');
    return [...seletivas, ...etapas];
}

export async function getSelective(id) {
    let sel = await getById('seletivas', id);
    if (!sel) sel = await getById('etapas', id);
    return sel;
}

export async function createSelective(data) {
    const eventType = data.eventType || 'seletiva';
    const table = eventType === 'etapa' ? 'etapas' : 'seletivas';

    console.log(`[createSelective] eventType='${eventType}', table='${table}'`);

    let seasonId;
    try {
        seasonId = data.seasonId || await getCurrentSeasonId();
        console.log(`[createSelective] seasonId='${seasonId}'`);
    } catch (err) {
        console.error('[createSelective] ❌ Failed to get seasonId:', err);
        return null;
    }

    const payload = {
        name: data.name,
        mode: data.mode,
        eventType: eventType,
        playerIds: data.playerIds || [],
        config: data.config || {
            rounds: 1,
            pointsPerWin: 3,
            pointsPerLoss: 0,
            tiebreaker: 'head-to-head'
        },
        status: 'active',
        seasonId: seasonId,
        teamId: data.teamId || 'default'
    };

    // Only add team confront fields for etapas (seletivas table doesn't have these columns)
    if (eventType === 'etapa') {
        payload.teamConfronts = data.teamConfronts || [];
        payload.teamConfront = data.teamConfront || null;
    }

    console.log(`[createSelective] Final payload keys:`, Object.keys(payload));
    return await create(table, payload);
}

export async function updateSelective(id, data) {
    let sel = await getById('seletivas', id);
    if (sel) {
        return await update('seletivas', id, data);
    } else {
        return await update('etapas', id, data);
    }
}

export async function deleteSelective(id) {
    const allMatches = await getAll('matches');
    const filtered = allMatches.filter(m => m.selectiveId === id);
    for (const m of filtered) {
        await remove('matches', m.id);
    }

    let sel = await getById('seletivas', id);
    if (sel) {
        return await remove('seletivas', id);
    } else {
        return await remove('etapas', id);
    }
}

// ============================================
// Hall Of Fame generic mapper
// ============================================
async function getHallOfFameByType(type) {
    const { data, error } = await supabase.from('hall_of_fame').select('*').eq('type', type);
    if (error) { console.error(`Error fetching hall_of_fame type ${type}:`, error); return []; }
    return data ? data.map(d => ({ id: d.id, ...d.payload })) : [];
}

async function createHallOfFame(type, payload) {
    const id = payload.id || generateId();
    const item = {
        id,
        type,
        payload: payload,
        createdAt: new Date().toISOString()
    };
    const { data, error } = await supabase.from('hall_of_fame').insert([item]).select().single();
    if (error) { console.error(`Error creating hall_of_fame ${type}:`, error); return null; }
    return { id: data.id, ...data.payload };
}

async function updateHallOfFame(type, id, updates) {
    const { data: existing, error: fetchErr } = await supabase.from('hall_of_fame').select('*').eq('id', id).single();
    if (fetchErr || !existing) return null;

    const newPayload = { ...existing.payload, ...updates };
    const { data, error } = await supabase.from('hall_of_fame').update({ payload: newPayload, updatedAt: new Date().toISOString() }).eq('id', id).select().single();
    if (error) { console.error(`Error updating hall_of_fame ${type}:`, error); return null; }
    return { id: data.id, ...data.payload };
}

async function removeHallOfFame(id) {
    await supabase.from('hall_of_fame').delete().eq('id', id);
    return [];
}

// ============================================
// Stage Results
// ============================================
export async function saveStageResults(selectiveId, placements) {
    return await createHallOfFame('stageResult', {
        selectiveId,
        placements,
        completedAt: new Date().toISOString()
    });
}

export async function getStageResults() {
    return await getHallOfFameByType('stageResult');
}

export async function getPlayerStageStats(playerId) {
    const results = await getStageResults();
    let stagesPlayed = 0, titles = 0, podiums = 0;
    const history = [];

    for (const sr of results) {
        const placement = sr.placements.find(p => p.playerId === playerId);
        if (placement) {
            stagesPlayed++;
            if (placement.position === 1) titles++;
            if (placement.position <= 3) podiums++;
            const selective = await getSelective(sr.selectiveId);
            history.push({
                name: selective?.name || 'Etapa',
                position: placement.position,
                date: sr.completedAt
            });
        }
    }
    return { stagesPlayed, titles, podiums, history };
}

// ============================================
// External Opponents
// ============================================
export async function getExternalOpponents() {
    return await getHallOfFameByType('externalOpponent');
}

export async function createExternalOpponent(data) {
    return await createHallOfFame('externalOpponent', {
        name: data.name,
        team: data.team || ''
    });
}

export async function getExternalOpponent(id) {
    const all = await getExternalOpponents();
    return all.find(o => o.id === id) || null;
}

// ============================================
// External Matches
// ============================================
export async function createExternalMatch(data) {
    return await createHallOfFame('externalMatch', {
        selectiveId: data.selectiveId,
        playerId: data.playerId,
        externalOpponentId: data.externalOpponentId,
        result: data.result,
        registeredAt: new Date().toISOString()
    });
}

export async function getExternalMatchesBySelective(selectiveId) {
    const matches = await getHallOfFameByType('externalMatch');
    return matches.filter(m => m.selectiveId === selectiveId);
}

export async function getExternalMatchesByPlayer(playerId) {
    const matches = await getHallOfFameByType('externalMatch');
    return matches.filter(m => m.playerId === playerId);
}

export async function deleteExternalMatch(id) {
    return await removeHallOfFame(id);
}

export async function getPlayerExternalStats(playerId) {
    const matches = await getExternalMatchesByPlayer(playerId);
    const wins = matches.filter(m => m.result === 'win').length;
    const losses = matches.filter(m => m.result === 'loss').length;
    const total = wins + losses;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

    const opponentMap = {};
    for (const m of matches) {
        if (!opponentMap[m.externalOpponentId]) {
            const opp = await getExternalOpponent(m.externalOpponentId);
            opponentMap[m.externalOpponentId] = {
                name: opp?.name || '?',
                team: opp?.team || '',
                wins: 0,
                losses: 0
            };
        }
        if (m.result === 'win') opponentMap[m.externalOpponentId].wins++;
        else opponentMap[m.externalOpponentId].losses++;
    }

    return { total, wins, losses, winRate, opponents: Object.values(opponentMap) };
}

// ============================================
// Matches (Partidas)
// ============================================
export async function getMatches() {
    return await getAll('matches');
}

export async function getMatchesBySelective(selectiveId) {
    const matches = await getAll('matches');
    return matches.filter(m => m.selectiveId === selectiveId);
}

export async function createMatch(data) {
    return await create('matches', {
        ...data,
        status: data.status || 'pending',
        events: data.events || [],
        scheduledTime: data.scheduledTime || new Date().toISOString()
    });
}

export async function updateMatch(id, data) {
    return await update('matches', id, data);
}

// ============================================
// Seasons
// ============================================
export async function getSeasons() {
    return await getHallOfFameByType('season');
}

export async function getSeason(id) {
    const seasons = await getSeasons();
    return seasons.find(s => s.id === id) || null;
}

export async function getCurrentSeasonId() {
    const seasons = await getSeasons();
    const currentYear = new Date().getFullYear();
    let current = seasons.find(s => s.year === currentYear && s.status === 'active');
    if (!current) {
        current = await createHallOfFame('season', {
            year: currentYear,
            status: 'active',
            championId: null,
            viceId: null,
            finalRanking: []
        });
    }
    return current.id;
}

export async function deleteSeason(id) {
    const allSelectives = await getSelectives();
    const filteredSelectives = allSelectives.filter(s => s.seasonId === id);
    for (const sel of filteredSelectives) {
        await deleteSelective(sel.id);
    }
    return await removeHallOfFame(id);
}

export async function closeSeason(id, championId, viceId, finalRanking) {
    return await updateHallOfFame('season', id, {
        status: 'completed',
        championId,
        viceId,
        finalRanking
    });
}

// ============================================
// Settings
// ============================================
export async function getSettings() {
    const settings = await getHallOfFameByType('setting');
    if (settings.length > 0) return settings[0];
    return {
        rankingMode: 'points',
        pointsPerWin: 3,
        pointsPerDraw: 1,
        initialElo: 1000,
        eloKFactor: 32
    };
}

export async function updateSettings(data) {
    const settings = await getHallOfFameByType('setting');
    if (settings.length > 0) {
        return await updateHallOfFame('setting', settings[0].id, data);
    } else {
        return await createHallOfFame('setting', data);
    }
}

// ============================================
// Seeds & Resets
// ============================================
export async function seedDemoData() {
    const players = await getPlayers();
    if (players.length > 0) return;

    const names = [
        "Cleverson", "Lucas M", "Felipe", "Thiago", "Diego R",
        "Rafael", "Marcelo", "Bruno", "Eduardo", "João Silva"
    ];

    const createdPlayers = [];
    for (const name of names) {
        const p = await createPlayer({ name, nickname: name.substring(0, 3).toUpperCase() });
        createdPlayers.push(p);
    }

    const statsData = [
        { wins: 42, losses: 12, points: 126, eloRating: 1450, streak: 5, bestStreak: 8, badges: ['🏆', '🔥'] },
        { wins: 38, losses: 15, points: 114, eloRating: 1380, streak: 2, bestStreak: 7, badges: ['🥈'] },
        { wins: 33, losses: 20, points: 99, eloRating: 1310, streak: 0, bestStreak: 5, badges: ['🥉'] },
        { wins: 28, losses: 20, points: 84, eloRating: 1250, streak: 3, bestStreak: 4, badges: ['🎯'] },
        { wins: 25, losses: 18, points: 75, eloRating: 1220, streak: 1, bestStreak: 4, badges: [] },
        { wins: 20, losses: 22, points: 60, eloRating: 1150, streak: 0, bestStreak: 3, badges: [] },
        { wins: 15, losses: 25, points: 45, eloRating: 1080, streak: 0, bestStreak: 2, badges: [] },
        { wins: 7, losses: 13, points: 21, eloRating: 960, streak: 0, bestStreak: 2, badges: [] },
        { wins: 5, losses: 14, points: 15, eloRating: 930, streak: 1, bestStreak: 1, badges: [] },
        { wins: 4, losses: 17, points: 12, eloRating: 900, streak: 0, bestStreak: 1, badges: [] },
    ];

    for (let i = 0; i < statsData.length; i++) {
        if (createdPlayers[i]) {
            await updatePlayer(createdPlayers[i].id, statsData[i]);
        }
    }
}

export async function resetHallOfFame() {
    let players = await getPlayers();
    for (const p of players) {
        await updatePlayer(p.id, {
            wins: 0,
            losses: 0,
            streak: 0,
            bestStreak: 0,
            badges: []
        });
    }

    const allSeasons = await getSeasons();
    for (const s of allSeasons) {
        if (s.status !== 'active') {
            await removeHallOfFame(s.id);
        }
    }

    const allStageResults = await getStageResults();
    for (const sr of allStageResults) {
        await removeHallOfFame(sr.id);
    }
}

export async function resetCurrentRanking() {
    let players = await getPlayers();
    for (const p of players) {
        await updatePlayer(p.id, {
            points: 0,
            eloRating: 1000,
            wins: 0,
            losses: 0,
            streak: 0
        });
    }
}
