// ============================================
// LigaPro Sinuca – Ranking Engine
// ============================================
import { getPlayers, updatePlayer, getSettings, getAll } from './db.js';

// ============================================
// Fixed Points Model
// ============================================
export async function applyFixedPoints(winnerId, loserId, config = {}) {
    const pointsPerWin = config.pointsPerWin ?? 3;
    const pointsPerLoss = config.pointsPerLoss ?? 0;

    const players = await getPlayers();
    const winner = players.find(p => p.id === winnerId);
    if (!winner) return;

    // Update winner (points only, stats handled by rebuild)
    await updatePlayer(winnerId, {
        points: (winner.points || 0) + pointsPerWin
    });

    // Update loser (points only, stats handled by rebuild)
    if (loserId) {
        const loser = players.find(p => p.id === loserId);
        if (loser) {
            await updatePlayer(loserId, {
                points: (loser.points || 0) + pointsPerLoss
            });
        }
    }

    await rebuildPlayerStats(winnerId);
    if (loserId) await rebuildPlayerStats(loserId);
}

// ============================================
// ELO Rating Model
// ============================================
function getDynamicKFactor(matchesPlayed) {
    if (matchesPlayed < 5) return 40;
    if (matchesPlayed <= 10) return 24;
    return 16;
}

function expectedScore(ratingA, ratingB) {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export async function applyEloRating(winnerId, loserId) {
    const players = await getPlayers();
    const winner = players.find(p => p.id === winnerId);
    const loser = players.find(p => p.id === loserId);
    if (!winner || !loser) return;

    const winnerRating = winner.eloRating || 1000;
    const loserRating = loser.eloRating || 1000;

    const expectedWin = expectedScore(winnerRating, loserRating);
    const expectedLose = expectedScore(loserRating, winnerRating);

    const wGames = (winner.wins || 0) + (winner.losses || 0);
    const lGames = (loser.wins || 0) + (loser.losses || 0);

    const newWinnerRating = Math.round(winnerRating + getDynamicKFactor(wGames) * (1 - expectedWin));
    const newLoserRating = Math.round(loserRating + getDynamicKFactor(lGames) * (0 - expectedLose));

    // Update winner (Elo only, stats handled by rebuild)
    await updatePlayer(winnerId, {
        eloRating: newWinnerRating
    });

    // Update loser (Elo only, stats handled by rebuild)
    await updatePlayer(loserId, {
        eloRating: Math.max(100, newLoserRating) // Floor at 100
    });

    await rebuildPlayerStats(winnerId);
    if (loserId) await rebuildPlayerStats(loserId);
}

// ============================================
// Apply Match Result (BOTH systems always)
// ============================================
export async function applyMatchResult(winnerId, loserId, config = {}) {
    const players = await getPlayers();
    const winner = players.find(p => p.id === winnerId);
    const loser = players.find(p => p.id === loserId);
    if (!winner || !loser) return;

    const pointsPerWin = config.pointsPerWin ?? 3;
    const pointsPerLoss = config.pointsPerLoss ?? 0;

    // ELO calculation
    const winnerRating = winner.eloRating || 1000;
    const loserRating = loser.eloRating || 1000;
    const expectedWin = expectedScore(winnerRating, loserRating);
    const expectedLose = expectedScore(loserRating, winnerRating);

    const wGames = (winner.wins || 0) + (winner.losses || 0);
    const lGames = (loser.wins || 0) + (loser.losses || 0);

    const newWinnerRating = Math.round(winnerRating + getDynamicKFactor(wGames) * (1 - expectedWin));
    const newLoserRating = Math.round(loserRating + getDynamicKFactor(lGames) * (0 - expectedLose));

    // Update winner (both systems points, stats handled by rebuild)
    await updatePlayer(winnerId, {
        points: (winner.points || 0) + pointsPerWin,
        eloRating: newWinnerRating
    });

    // Update loser (both systems points, stats handled by rebuild)
    await updatePlayer(loserId, {
        points: (loser.points || 0) + pointsPerLoss,
        eloRating: Math.max(100, newLoserRating)
    });

    await rebuildPlayerStats(winnerId);
    if (loserId) await rebuildPlayerStats(loserId);
}

// ============================================
// Reverse Match Result (undo BOTH systems)
// ============================================
export async function reverseMatchResult(winnerId, loserId, config = {}) {
    const players = await getPlayers();
    const winner = players.find(p => p.id === winnerId);
    const loser = players.find(p => p.id === loserId);
    if (!winner || !loser) return;

    const pointsPerWin = config.pointsPerWin ?? 3;
    const pointsPerLoss = config.pointsPerLoss ?? 0;

    // Reverse ELO
    const winnerRating = winner.eloRating || 1000;
    const loserRating = loser.eloRating || 1000;
    const expected = expectedScore(winnerRating, loserRating);
    const winnerDelta = Math.round(K_FACTOR * (1 - expected));
    const loserDelta = Math.round(K_FACTOR * expected);

    // Reverse winner (points only, stats handled by rebuild)
    await updatePlayer(winnerId, {
        points: Math.max(0, (winner.points || 0) - pointsPerWin),
        eloRating: Math.max(100, winnerRating - winnerDelta)
    });

    // Reverse loser (points only, stats handled by rebuild)
    await updatePlayer(loserId, {
        points: Math.max(0, (loser.points || 0) - pointsPerLoss),
        eloRating: loserRating + loserDelta
    });

    await rebuildPlayerStats(winnerId);
    if (loserId) await rebuildPlayerStats(loserId);
}

// ============================================
// Recalculate ALL Rankings Chronologically
// ============================================
export async function recalculateAllRankings() {
    const players = await getPlayers();
    const allMatches = await getAll('matches');

    // Sort all completed matches chronologically
    const completedMatches = allMatches
        .filter(m => m.status === 'completed' && m.winnerId)
        .sort((a, b) => {
            const timeA = new Date(a.createdAt || a.scheduledTime || 0).getTime();
            const timeB = new Date(b.createdAt || b.scheduledTime || 0).getTime();
            if (Math.abs(timeA - timeB) < 5000) {
                const roundA = parseInt(a.round) || 0;
                const roundB = parseInt(b.round) || 0;
                if (roundA !== roundB) return roundA - roundB;
                return a.id.localeCompare(b.id);
            }
            return timeA - timeB;
        });

    // Virtual state map
    const pState = {};
    players.forEach(p => {
        pState[p.id] = {
            points: 0,
            eloRating: 1000,
            wins: 0,
            losses: 0,
            streak: 0,
            bestStreak: 0
        };
    });

    const settings = await getSettings();
    const config = settings?.config || {};
    const ptsWin = config.pointsPerWin ?? 3;
    const ptsLoss = config.pointsPerLoss ?? 0;

    // Process each match chronologically
    completedMatches.forEach(m => {
        const winnerId = m.winnerId;
        const loserId = winnerId === m.player1Id ? m.player2Id : m.player1Id;

        const wState = pState[winnerId];
        const lState = pState[loserId];

        if (!wState || !lState) return;

        // ELO
        const expectedWin = expectedScore(wState.eloRating, lState.eloRating);
        const expectedLose = expectedScore(lState.eloRating, wState.eloRating);

        const wGames = wState.wins + wState.losses;
        const lGames = lState.wins + lState.losses;

        wState.eloRating = Math.round(wState.eloRating + getDynamicKFactor(wGames) * (1 - expectedWin));
        lState.eloRating = Math.max(100, Math.round(lState.eloRating + getDynamicKFactor(lGames) * (0 - expectedLose)));

        // Points
        wState.points += ptsWin;
        lState.points += ptsLoss;

        // Stats
        wState.wins++;
        wState.streak++;
        if (wState.streak > wState.bestStreak) wState.bestStreak = wState.streak;

        lState.losses++;
        lState.streak = 0;
    });

    // Save back to DB
    for (const p of players) {
        const s = pState[p.id];
        await updatePlayer(p.id, {
            points: s.points,
            eloRating: s.eloRating,
            wins: s.wins,
            losses: s.losses,
            streak: s.streak,
            bestStreak: s.bestStreak
        });
    }
}

// ============================================
// Robust Player Stats Rebuilder
// ============================================
export async function rebuildPlayerStats(playerId) {
    if (!playerId) return;
    const players = await getPlayers();
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    const allMatches = await getAll('matches');

    // Sort player matches chronologically (by updatedAt, createdAt or ID)
    const playerMatches = allMatches
        .filter(m => m.status === 'completed' && (m.player1Id === playerId || m.player2Id === playerId))
        .sort((a, b) => {
            // Sort matches firmly by creation time so historical edits (updatedAt) don't scramble the timeline
            const timeA = new Date(a.createdAt || a.scheduledTime || 0).getTime();
            const timeB = new Date(b.createdAt || b.scheduledTime || 0).getTime();

            // If they were created at almost the exact same time (e.g. round-robin batch creation)
            if (Math.abs(timeA - timeB) < 5000) {
                // Secondary fallback to tournament round numbers for correct sequence
                const roundA = parseInt(a.round) || 0;
                const roundB = parseInt(b.round) || 0;
                if (roundA !== roundB) return roundA - roundB;

                return a.id.localeCompare(b.id);
            }

            return timeA - timeB;
        });

    let wins = 0;
    let losses = 0;
    let streak = 0;
    let bestStreak = 0;

    for (const m of playerMatches) {
        if (m.winnerId === playerId) {
            wins++;
            streak++;
            if (streak > bestStreak) bestStreak = streak;
        } else if (m.winnerId) {
            losses++;
            streak = 0;
        }
    }

    await updatePlayer(playerId, {
        wins,
        losses,
        streak,
        bestStreak
    });
}

// ============================================
// Get Sorted Rankings
// ============================================

export function getHeadToHeadResult(playerAId, playerBId, matchList) {
    const h2h = matchList.filter(m =>
        m.status === 'completed' && m.winnerId && (
            (m.player1Id === playerAId && m.player2Id === playerBId) ||
            (m.player1Id === playerBId && m.player2Id === playerAId)
        )
    );
    if (h2h.length === 0) return 0;

    let aWins = 0, bWins = 0;
    h2h.forEach(m => {
        if (m.winnerId === playerAId) aWins++;
        else if (m.winnerId === playerBId) bWins++;
    });

    if (aWins > bWins) return 1;
    if (bWins > aWins) return -1;
    return 0;
}

export function getEffectiveElo(player) {
    const games = (player.wins || 0) + (player.losses || 0);
    const rawElo = player.eloRating || 1000;
    const factor = Math.min(1, games / 6);
    return Math.round(rawElo * factor);
}

export async function getRankings() {
    const settings = await getSettings();
    const players = await getPlayers();
    const allMatches = await getAll('matches');

    // Calculate generic SB score globally for tiebreakers
    players.forEach(p => {
        let sb = 0;
        const pWins = allMatches.filter(m => m.status === 'completed' && m.winnerId === p.id);
        pWins.forEach(w => {
            const loserId = w.player1Id === p.id ? w.player2Id : w.player1Id;
            const loser = players.find(x => x.id === loserId);
            if (loser) {
                sb += (loser.points || 0);
            }
        });
        p.sbScore = sb;
    });

    if (settings.rankingMode === 'elo') {
        return [...players].sort((a, b) => {
            const aGames = (a.wins || 0) + (a.losses || 0);
            const bGames = (b.wins || 0) + (b.losses || 0);

            // Fator de Confiança
            const aElo = getEffectiveElo(a);
            const bElo = getEffectiveElo(b);

            if (bElo !== aElo) return bElo - aElo;

            // 1º: Maior número de vitórias
            if ((b.wins || 0) !== (a.wins || 0)) return (b.wins || 0) - (a.wins || 0);

            // 2º: Confronto direto
            const h2h = getHeadToHeadResult(a.id, b.id, allMatches);
            if (h2h !== 0) return -h2h;

            // 3º: Maior número de jogos
            if (bGames !== aGames) return bGames - aGames;

            // Desempate via Winrate / SB (Normalização final p/ garantir 100% no topo)
            const aRate = (a.wins || 0) / Math.max(1, aGames);
            const bRate = (b.wins || 0) / Math.max(1, bGames);
            if (bRate !== aRate) return bRate - aRate;

            return (b.sbScore || 0) - (a.sbScore || 0);
        });
    } else {
        return [...players].sort((a, b) => {
            if ((b.points || 0) !== (a.points || 0)) return (b.points || 0) - (a.points || 0);
            const h2h = getHeadToHeadResult(a.id, b.id, allMatches);
            if (h2h !== 0) return -h2h;
            // Desempate triplo via SB Score
            if ((b.sbScore || 0) !== (a.sbScore || 0)) return (b.sbScore || 0) - (a.sbScore || 0);

            const aRate = (a.wins || 0) / Math.max(1, (a.wins || 0) + (a.losses || 0));
            const bRate = (b.wins || 0) / Math.max(1, (b.wins || 0) + (b.losses || 0));
            if (bRate !== aRate) return bRate - aRate;
            return (b.wins || 0) - (a.wins || 0);
        });
    }
}

// ============================================
// Get Player Win Rate
// ============================================
export function getWinRate(player) {
    const total = (player.wins || 0) + (player.losses || 0);
    if (total === 0) return 0;
    return Math.round(((player.wins || 0) / total) * 100);
}

// ============================================
// Get Player Score (based on mode)
// ============================================
export function getPlayerScore(player, settings) {
    if (settings && settings.rankingMode === 'elo') {
        return getEffectiveElo(player);
    }
    return player.points || 0;
}

// ============================================
// Get Global Stats
// ============================================
export async function getGlobalStats() {
    const players = await getPlayers();
    const totalMatches = players.reduce((sum, p) => sum + (p.wins || 0), 0);

    let bestStreak = 0;
    let bestStreakPlayer = null;
    let bestWinRate = 0;
    let bestWinRatePlayer = null;

    players.forEach(p => {
        if ((p.bestStreak || 0) > bestStreak) {
            bestStreak = p.bestStreak || 0;
            bestStreakPlayer = p;
        }
        const rate = getWinRate(p);
        const totalGames = (p.wins || 0) + (p.losses || 0);
        if (totalGames >= 3 && rate > bestWinRate) {
            bestWinRate = rate;
            bestWinRatePlayer = p;
        }
    });

    return {
        totalPlayers: players.length,
        totalMatches,
        bestStreak,
        bestStreakPlayer,
        bestWinRate,
        bestWinRatePlayer
    };
}
