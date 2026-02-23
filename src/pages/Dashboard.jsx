import React, { useEffect, useState } from 'react';
import { getRankings, getWinRate, getPlayerScore, getGlobalStats } from '../data/rankingEngine.js';
import { getSelectives, getMatches, getSettings } from '../data/db.js';
import { TrendingUp, TrendingDown, Minus, Gamepad2, Flame, Target, Users, Loader } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function Dashboard() {
    const [rankings, setRankings] = useState([]);
    const [stats, setStats] = useState({});
    const [selectives, setSelectives] = useState([]);
    const [settings, setSettingsState] = useState({ rankingMode: 'points' });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        refresh();
    }, []);

    async function refresh() {
        setLoading(true);
        const [r, st, sel, set] = await Promise.all([
            getRankings(),
            getGlobalStats(),
            getSelectives(),
            getSettings()
        ]);
        setRankings(r);
        setStats(st || {});
        setSelectives(sel);
        if (set) setSettingsState(set);
        setLoading(false);
    }

    const top3 = rankings.slice(0, 3);
    const top10 = rankings.slice(0, 10);
    const lastSelective = selectives.filter(s => s.status === 'completed').slice(-1)[0];
    const nextSelective = selectives.filter(s => s.status === 'active').slice(0, 1)[0];
    const isElo = settings.rankingMode === 'elo';

    // Chart data - simulate evolution from rankings
    const chartData = rankings.slice(0, 5).length > 0
        ? Array.from({ length: 8 }, (_, i) => {
            const point = { name: `R${i + 1}` };
            rankings.slice(0, 5).forEach(p => {
                const base = isElo ? (p.eloRating || 1000) : (p.points || 0);
                const noise = Math.floor(Math.random() * 20 - 10);
                const scale = (i + 1) / 8;
                point[p.nickname || p.name] = Math.max(0, Math.round(base * scale + noise));
            });
            return point;
        })
        : [];

    const lineColors = ['#10b981', '#fbbf24', '#60a5fa', '#f87171', '#a78bfa'];

    function getInitials(name) {
        if (!name) return '';
        return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    }

    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-dim)' }}>
                <Loader className="animate-spin" size={32} style={{ marginBottom: 16 }} />
                <p>Carregando Dashboard...</p>
            </div>
        );
    }

    return (
        <div className="animate-fade-in" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Dashboard</h1>
                    <p className="page-subtitle">Visão geral da sua liga de sinuca</p>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-card-icon green"><Users size={20} /></div>
                    <div className="stat-card-value">{stats.totalPlayers || 0}</div>
                    <div className="stat-card-label">Jogadores</div>
                </div>
                <div className="stat-card">
                    <div className="stat-card-icon gold"><Gamepad2 size={20} /></div>
                    <div className="stat-card-value">{stats.totalMatches || 0}</div>
                    <div className="stat-card-label">Total de Jogos</div>
                </div>
                <div className="stat-card">
                    <div className="stat-card-icon red"><Flame size={20} /></div>
                    <div className="stat-card-value">{stats.bestStreak || 0}</div>
                    <div className="stat-card-label">Maior Sequência</div>
                    {stats.bestStreakPlayer && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            {stats.bestStreakPlayer.nickname || stats.bestStreakPlayer.name}
                        </div>
                    )}
                </div>
                <div className="stat-card">
                    <div className="stat-card-icon blue"><Target size={20} /></div>
                    <div className="stat-card-value">{stats.bestWinRate || 0}%</div>
                    <div className="stat-card-label">Melhor Aproveitamento</div>
                    {stats.bestWinRatePlayer && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            {stats.bestWinRatePlayer.nickname || stats.bestWinRatePlayer.name}
                        </div>
                    )}
                </div>
            </div>

            <div className="grid-2" style={{ marginBottom: 24 }}>
                {/* Podium */}
                <div className="card card-gold">
                    <div className="card-header">
                        <h3 className="card-title">🏆 Top 3</h3>
                    </div>
                    {top3.length >= 3 ? (
                        <div className="podium">
                            {/* 2nd place */}
                            <div className="podium-place second">
                                <div className="podium-medal">🥈</div>
                                <div className="podium-avatar">{getInitials(top3[1].name)}</div>
                                <div className="podium-name">{top3[1].name.split(' ')[0]}</div>
                                <div className="podium-nickname">{top3[1].nickname}</div>
                                <div className="podium-points">{isElo ? top3[1].eloRating : top3[1].points} pts</div>
                                <div className="podium-bar" />
                            </div>
                            {/* 1st place */}
                            <div className="podium-place first">
                                <div className="podium-medal">🥇</div>
                                <div className="podium-avatar">{getInitials(top3[0].name)}</div>
                                <div className="podium-name">{top3[0].name.split(' ')[0]}</div>
                                <div className="podium-nickname">{top3[0].nickname}</div>
                                <div className="podium-points">{isElo ? top3[0].eloRating : top3[0].points} pts</div>
                                <div className="podium-bar" />
                            </div>
                            {/* 3rd place */}
                            <div className="podium-place third">
                                <div className="podium-medal">🥉</div>
                                <div className="podium-avatar">{getInitials(top3[2].name)}</div>
                                <div className="podium-name">{top3[2].name.split(' ')[0]}</div>
                                <div className="podium-nickname">{top3[2].nickname}</div>
                                <div className="podium-points">{isElo ? top3[2].eloRating : top3[2].points} pts</div>
                                <div className="podium-bar" />
                            </div>
                        </div>
                    ) : (
                        <div className="empty-state">
                            <div className="empty-state-icon">🎱</div>
                            <div className="empty-state-title">Cadastre jogadores</div>
                            <div className="empty-state-desc">Adicione pelo menos 3 jogadores para ver o pódio</div>
                        </div>
                    )}
                </div>

                {/* Evolution Chart */}
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">📈 Evolução</h3>
                        <span className="card-subtitle">{isElo ? 'Rating ELO' : 'Pontos'}</span>
                    </div>
                    {chartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={220}>
                            <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" />
                                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} />
                                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                                <Tooltip
                                    contentStyle={{
                                        background: '#1a2332',
                                        border: '1px solid rgba(148,163,184,0.12)',
                                        borderRadius: 8,
                                        fontSize: 12,
                                        color: '#f1f5f9'
                                    }}
                                />
                                {rankings.slice(0, 5).map((p, i) => (
                                    <Line
                                        key={p.id}
                                        type="monotone"
                                        dataKey={p.nickname || p.name}
                                        stroke={lineColors[i]}
                                        strokeWidth={2}
                                        dot={false}
                                    />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="empty-state">
                            <div className="empty-state-desc">Sem dados ainda</div>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid-2" style={{ marginBottom: 24 }}>
                {/* Info Cards */}
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">📋 Última Seletiva</h3>
                    </div>
                    {lastSelective ? (
                        <div>
                            <div style={{ fontWeight: 600, fontSize: 16 }}>{lastSelective.name}</div>
                            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
                                {lastSelective.mode === 'elimination' ? 'Eliminatória' :
                                    lastSelective.mode === 'round-robin' ? 'Todos contra Todos' : 'Sistema Suíço'}
                                {' · '}{lastSelective.playerIds?.length || 0} jogadores
                            </div>
                        </div>
                    ) : (
                        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Nenhuma seletiva finalizada ainda</div>
                    )}
                </div>
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">🎯 Próxima Seletiva</h3>
                    </div>
                    {nextSelective ? (
                        <div>
                            <div style={{ fontWeight: 600, fontSize: 16 }}>{nextSelective.name}</div>
                            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
                                {nextSelective.mode === 'elimination' ? 'Eliminatória' :
                                    nextSelective.mode === 'round-robin' ? 'Todos contra Todos' : 'Sistema Suíço'}
                                {' · '}{nextSelective.playerIds?.length || 0} jogadores
                            </div>
                        </div>
                    ) : (
                        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Nenhuma seletiva ativa</div>
                    )}
                </div>
            </div>

            {/* Top 10 Ranking */}
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">🏅 Ranking Top 10</h3>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {isElo ? 'Sistema ELO' : 'Pontos Fixos'}
                    </span>
                </div>
                {top10.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="ranking-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Jogador</th>
                                    <th>{isElo ? 'ELO' : 'Pontos'}</th>
                                    <th>V</th>
                                    <th>D</th>
                                    <th>%</th>
                                    <th>Seq.</th>
                                </tr>
                            </thead>
                            <tbody>
                                {top10.map((player, index) => (
                                    <tr key={player.id}>
                                        <td>
                                            <div className={`rank-position ${index === 0 ? 'top-1' : index === 1 ? 'top-2' : index === 2 ? 'top-3' : ''}`}>
                                                {index + 1}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="player-cell">
                                                <div className="player-avatar-sm">{getInitials(player.name)}</div>
                                                <div>
                                                    <div className="player-info-name">{player.name}</div>
                                                    <div className="player-info-nickname">{player.nickname}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--green-400)' }}>
                                            {isElo ? player.eloRating || 1000 : player.points || 0}
                                        </td>
                                        <td style={{ color: 'var(--green-400)' }}>{player.wins || 0}</td>
                                        <td style={{ color: 'var(--red-400)' }}>{player.losses || 0}</td>
                                        <td>{getWinRate(player)}%</td>
                                        <td>
                                            {player.streak > 0 ? (
                                                <span className="trend-up">🔥 {player.streak}</span>
                                            ) : (
                                                <span className="trend-same">-</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="empty-state">
                        <div className="empty-state-icon">🎱</div>
                        <div className="empty-state-title">Sem jogadores cadastrados</div>
                    </div>
                )}
            </div>
        </div>
    );
}
