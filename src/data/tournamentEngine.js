// ============================================
// LigaPro Sinuca – Tournament Engine
// ============================================

// ============================================
// Shuffle Helper
// ============================================
function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ============================================
// Single Elimination
// ============================================
export function generateEliminationBracket(selectiveId, playerIds) {
    const shuffled = shuffle(playerIds);

    // Pad to nearest power of 2
    let size = 1;
    while (size < shuffled.length) size *= 2;

    const padded = [...shuffled];
    while (padded.length < size) {
        padded.push(null); // BYE
    }

    const matches = [];
    const totalRounds = Math.log2(size);

    // Generate first round
    for (let i = 0; i < padded.length; i += 2) {
        const p1 = padded[i];
        const p2 = padded[i + 1];

        if (p1 && p2) {
            const match = {
                selectiveId,
                round: 1,
                player1Id: p1,
                player2Id: p2
            };
            matches.push(match);
        } else if (p1) {
            // BYE - auto advance
            const match = {
                selectiveId,
                round: 1,
                player1Id: p1,
                player2Id: null
            };
            matches.push(match);
        }
    }

    return {
        matches,
        totalRounds,
        bracketSize: size
    };
}

// ============================================
// Round Robin (Todos contra Todos)
// ============================================
export function generateRoundRobin(selectiveId, playerIds, numRounds = 1) {
    const players = [...playerIds];
    const matches = [];

    // If odd number, add a BYE
    if (players.length % 2 !== 0) {
        players.push(null);
    }

    const n = players.length;
    const totalRoundsInCycle = n - 1;

    for (let cycle = 0; cycle < numRounds; cycle++) {
        const rotatingPlayers = [...players];

        for (let round = 0; round < totalRoundsInCycle; round++) {
            const roundNumber = cycle * totalRoundsInCycle + round + 1;

            for (let i = 0; i < n / 2; i++) {
                const p1 = rotatingPlayers[i];
                const p2 = rotatingPlayers[n - 1 - i];

                if (p1 && p2) {
                    const match = {
                        selectiveId,
                        round: roundNumber,
                        player1Id: p1,
                        player2Id: p2
                    };
                    matches.push(match);
                }
            }

            // Rotate: fix first player, rotate others
            const last = rotatingPlayers.pop();
            rotatingPlayers.splice(1, 0, last);
        }
    }

    return { matches, totalRounds: totalRoundsInCycle * numRounds };
}

// ============================================
// Swiss System
// ============================================
export function generateSwissRound(selectiveId, playerIds, rankings, roundNumber, previousMatches = []) {
    // Sort players by current score/ranking
    const sorted = [...playerIds].sort((a, b) => {
        const aRank = rankings.findIndex(r => r.id === a);
        const bRank = rankings.findIndex(r => r.id === b);
        return (aRank === -1 ? 999 : aRank) - (bRank === -1 ? 999 : bRank);
    });

    // Track previous opponents to avoid rematches
    const playedAgainst = {};
    previousMatches.forEach(m => {
        if (!playedAgainst[m.player1Id]) playedAgainst[m.player1Id] = new Set();
        if (!playedAgainst[m.player2Id]) playedAgainst[m.player2Id] = new Set();
        playedAgainst[m.player1Id].add(m.player2Id);
        playedAgainst[m.player2Id].add(m.player1Id);
    });

    const matched = new Set();
    const matches = [];

    for (let i = 0; i < sorted.length; i++) {
        if (matched.has(sorted[i])) continue;

        for (let j = i + 1; j < sorted.length; j++) {
            if (matched.has(sorted[j])) continue;

            // Avoid rematch if possible
            const prevOpps = playedAgainst[sorted[i]];
            if (prevOpps && prevOpps.has(sorted[j])) continue;

            const match = {
                selectiveId,
                round: roundNumber,
                player1Id: sorted[i],
                player2Id: sorted[j]
            };
            matches.push(match);
            matched.add(sorted[i]);
            matched.add(sorted[j]);
            break;
        }
    }

    // Handle any remaining unmatched players (pair them even if rematch)
    const unmatched = sorted.filter(id => !matched.has(id));
    for (let i = 0; i < unmatched.length - 1; i += 2) {
        const match = {
            selectiveId,
            round: roundNumber,
            player1Id: unmatched[i],
            player2Id: unmatched[i + 1]
        };
        matches.push(match);
    }

    return { matches };
}

// ============================================
// Generate Matches for Selective
// ============================================
export function generateMatchesForSelective(selective) {
    const { id, mode, playerIds, config } = selective;

    switch (mode) {
        case 'elimination':
            return generateEliminationBracket(id, playerIds);

        case 'round-robin':
            return generateRoundRobin(id, playerIds, config?.rounds || 1);

        case 'swiss':
            // Swiss generates one round at a time
            return generateSwissRound(id, playerIds, [], 1);

        default:
            return { matches: [] };
    }
}
