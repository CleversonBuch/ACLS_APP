import React, { useState, useEffect } from 'react';
import { getPlayers, createPlayer, updatePlayer, deletePlayer, getPlayerStageStats, getPlayerExternalStats } from '../data/db.js';
import { getWinRate, getRankings } from '../data/rankingEngine.js';
import { UserPlus, X, Edit, Trash2, Search, Upload, Camera } from 'lucide-react';

export default function Players() {
    const [players, setPlayers] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [editingPlayer, setEditingPlayer] = useState(null);
    const [search, setSearch] = useState('');
    const [form, setForm] = useState({ name: '', nickname: '', photo: '' });
    const [photoMode, setPhotoMode] = useState('upload'); // 'upload' | 'url'

    function handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            alert('Por favor, selecione um arquivo de imagem.');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            alert('A imagem deve ter no máximo 2MB.');
            return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
            // Resize to keep localStorage manageable
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX = 200;
                let w = img.width, h = img.height;
                if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
                else { w = Math.round(w * MAX / h); h = MAX; }
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                setForm(prev => ({ ...prev, photo: canvas.toDataURL('image/jpeg', 0.8) }));
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    }

    useEffect(() => { refresh(); }, []);

    function refresh() {
        const ranked = getRankings();
        setPlayers(ranked);
    }

    function handleSubmit(e) {
        e.preventDefault();
        if (!form.name.trim()) return;

        if (editingPlayer) {
            updatePlayer(editingPlayer.id, form);
        } else {
            createPlayer(form);
        }
        setForm({ name: '', nickname: '', photo: '' });
        setEditingPlayer(null);
        setShowModal(false);
        refresh();
    }

    function handleEdit(player) {
        setEditingPlayer(player);
        setForm({ name: player.name, nickname: player.nickname, photo: player.photo || '' });
        setShowModal(true);
    }

    function handleDelete(id) {
        if (confirm('Tem certeza que deseja remover este jogador?')) {
            deletePlayer(id);
            refresh();
        }
    }

    function getInitials(name) {
        return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    }

    const filtered = players.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.nickname && p.nickname.toLowerCase().includes(search.toLowerCase()))
    );

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Jogadores</h1>
                    <p className="page-subtitle">{players.length} jogadores cadastrados</p>
                </div>
                <button className="btn btn-primary" onClick={() => { setEditingPlayer(null); setForm({ name: '', nickname: '', photo: '' }); setShowModal(true); }}>
                    <UserPlus size={18} /> Novo Jogador
                </button>
            </div>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 20, maxWidth: 360 }}>
                <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                <input
                    className="form-input"
                    placeholder="Buscar jogador..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ paddingLeft: 40 }}
                />
            </div>

            {/* Players Grid */}
            {filtered.length > 0 ? (
                <div className="players-grid">
                    {filtered.map((player, index) => (
                        <div key={player.id} className="player-card animate-slide-up" style={{ animationDelay: `${index * 50}ms` }}>
                            <div className="player-card-rank">#{index + 1}</div>
                            <div className="player-card-avatar">
                                {player.photo ? (
                                    <img src={player.photo} alt={player.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                                ) : (
                                    getInitials(player.name)
                                )}
                            </div>
                            <div className="player-card-name">{player.name}</div>
                            {player.nickname && <div className="player-card-nickname">"{player.nickname}"</div>}

                            {player.badges && player.badges.length > 0 && (
                                <div className="player-card-badges">
                                    {player.badges.map((b, i) => <span key={i} className="badge">{b}</span>)}
                                </div>
                            )}

                            <div className="player-card-stats">
                                <div className="player-stat">
                                    <div className="player-stat-value" style={{ color: 'var(--green-400)' }}>{player.wins || 0}</div>
                                    <div className="player-stat-label">Vitórias</div>
                                </div>
                                <div className="player-stat">
                                    <div className="player-stat-value" style={{ color: 'var(--red-400)' }}>{player.losses || 0}</div>
                                    <div className="player-stat-label">Derrotas</div>
                                </div>
                                <div className="player-stat">
                                    <div className="player-stat-value">{getWinRate(player)}%</div>
                                    <div className="player-stat-label">Aprov.</div>
                                </div>
                            </div>

                            <div className="win-rate-bar">
                                <div className="win-rate-fill" style={{ width: `${getWinRate(player)}%` }} />
                            </div>

                            {/* Etapa Stats */}
                            {(() => {
                                const stageStats = getPlayerStageStats(player.id);
                                if (stageStats.stagesPlayed === 0) return null;
                                return (
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'center',
                                        gap: 16,
                                        marginTop: 12,
                                        paddingTop: 10,
                                        borderTop: '1px solid var(--border-subtle)',
                                        fontSize: 12
                                    }}>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{stageStats.stagesPlayed}</div>
                                            <div style={{ color: 'var(--text-dim)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Etapas</div>
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--gold-400)' }}>{stageStats.titles}</div>
                                            <div style={{ color: 'var(--text-dim)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>🏆 Títulos</div>
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--bronze)' }}>{stageStats.podiums}</div>
                                            <div style={{ color: 'var(--text-dim)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>🥇🥈🥉</div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* External Stats */}
                            {(() => {
                                const extStats = getPlayerExternalStats(player.id);
                                if (extStats.total === 0) return null;
                                return (
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'center',
                                        gap: 16,
                                        marginTop: 12,
                                        paddingTop: 10,
                                        borderTop: '1px solid var(--border-subtle)',
                                        fontSize: 12
                                    }}>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{extStats.total}</div>
                                            <div style={{ color: 'var(--text-dim)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>⚔️ Externos</div>
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--green-400)' }}>{extStats.wins}</div>
                                            <div style={{ color: 'var(--text-dim)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>V Ext.</div>
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: extStats.winRate >= 50 ? 'var(--green-400)' : 'var(--red-400)' }}>{extStats.winRate}%</div>
                                            <div style={{ color: 'var(--text-dim)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Aprov. Ext.</div>
                                        </div>
                                    </div>
                                );
                            })()}

                            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
                                <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(player)}>
                                    <Edit size={14} /> Editar
                                </button>
                                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(player.id)}>
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="empty-state">
                    <div className="empty-state-icon">👤</div>
                    <div className="empty-state-title">Nenhum jogador encontrado</div>
                    <div className="empty-state-desc">Adicione o primeiro jogador para começar</div>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">{editingPlayer ? 'Editar Jogador' : 'Novo Jogador'}</h3>
                            <button className="modal-close" onClick={() => setShowModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Nome *</label>
                                    <input
                                        className="form-input"
                                        placeholder="Nome completo"
                                        value={form.name}
                                        onChange={e => setForm({ ...form, name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Apelido</label>
                                    <input
                                        className="form-input"
                                        placeholder="Ex: Tubarão"
                                        value={form.nickname}
                                        onChange={e => setForm({ ...form, nickname: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Foto do Jogador</label>
                                    {/* Photo preview */}
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                        <div
                                            style={{
                                                width: 96,
                                                height: 96,
                                                borderRadius: '50%',
                                                background: form.photo ? 'none' : 'var(--bg-elevated)',
                                                border: '2px dashed var(--border-default)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                overflow: 'hidden',
                                                cursor: 'pointer',
                                                position: 'relative',
                                                transition: 'border-color 0.2s',
                                            }}
                                            onClick={() => document.getElementById('photo-file-input').click()}
                                            onMouseOver={e => e.currentTarget.style.borderColor = 'var(--green-400)'}
                                            onMouseOut={e => e.currentTarget.style.borderColor = ''}
                                        >
                                            {form.photo ? (
                                                <img src={form.photo} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                <Camera size={32} style={{ color: 'var(--text-dim)' }} />
                                            )}
                                        </div>
                                        <input
                                            id="photo-file-input"
                                            type="file"
                                            accept="image/*"
                                            style={{ display: 'none' }}
                                            onChange={handleFileUpload}
                                        />
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => document.getElementById('photo-file-input').click()}
                                            >
                                                <Upload size={14} /> Upload Foto
                                            </button>
                                            {form.photo && (
                                                <button
                                                    type="button"
                                                    className="btn btn-danger btn-sm"
                                                    onClick={() => setForm({ ...form, photo: '' })}
                                                >
                                                    <X size={14} /> Remover
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {/* URL fallback toggle */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                        <button
                                            type="button"
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                color: 'var(--green-400)',
                                                fontSize: 12,
                                                cursor: 'pointer',
                                                textDecoration: 'underline',
                                                padding: 0,
                                            }}
                                            onClick={() => setPhotoMode(prev => prev === 'upload' ? 'url' : 'upload')}
                                        >
                                            {photoMode === 'upload' ? 'Ou inserir URL da foto' : 'Ou fazer upload do dispositivo'}
                                        </button>
                                    </div>
                                    {photoMode === 'url' && (
                                        <input
                                            className="form-input"
                                            placeholder="https://..."
                                            value={form.photo.startsWith('data:') ? '' : form.photo}
                                            onChange={e => setForm({ ...form, photo: e.target.value })}
                                        />
                                    )}
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary">{editingPlayer ? 'Salvar' : 'Adicionar'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
