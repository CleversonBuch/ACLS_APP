import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard,
    Users,
    PlusCircle,
    Swords,
    Trophy,
    History,
    Crown,
    Menu,
    X,
    Shield
} from 'lucide-react';

const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/nova-seletiva', icon: PlusCircle, label: 'Nova Seletiva' },
    { path: '/confrontos', icon: Swords, label: 'Seletivas' },
    { path: '/nova-etapa', icon: PlusCircle, label: 'Nova Etapa' },
    { path: '/etapas', icon: Trophy, label: 'Etapas' },
    { path: '/ranking', icon: Trophy, label: 'Ranking' },
    { path: '/jogadores', icon: Users, label: 'Jogadores' },
    { path: '/historico', icon: History, label: 'Histórico' },
    { path: '/hall-da-fama', icon: Crown, label: 'Hall da Fama' },
    { path: '/admin', icon: Shield, label: 'Admin' },
];

export default function Sidebar() {
    const [open, setOpen] = useState(false);

    return (
        <>
            {/* Mobile Header */}
            <div className="mobile-header">
                <button className="hamburger-btn" onClick={() => setOpen(true)}>
                    <Menu size={24} />
                </button>
                <span className="mobile-brand">🎱 A.C.L.S</span>
                <div style={{ width: 40 }} />
            </div>

            {/* Overlay */}
            <div
                className={`sidebar-overlay ${open ? 'open' : ''}`}
                onClick={() => setOpen(false)}
            />

            {/* Sidebar */}
            <aside className={`sidebar ${open ? 'open' : ''}`}>
                <div className="sidebar-header">
                    <div className="sidebar-logo">🎱</div>
                    <div className="sidebar-brand">
                        <h1>A.C.L.S</h1>
                        <span>App</span>
                    </div>
                    <button
                        className="hamburger-btn"
                        onClick={() => setOpen(false)}
                        style={{ marginLeft: 'auto', display: open ? 'block' : 'none' }}
                    >
                        <X size={20} />
                    </button>
                </div>

                <nav className="sidebar-nav">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.path === '/'}
                            className={({ isActive }) =>
                                `sidebar-link ${isActive ? 'active' : ''}`
                            }
                            onClick={() => setOpen(false)}
                        >
                            <item.icon size={20} />
                            {item.label}
                        </NavLink>
                    ))}

                    <div style={{ margin: '16px 0', borderTop: '1px solid var(--border-subtle)' }} />

                    <button 
                        className="sidebar-link" 
                        style={{ width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}
                        onClick={() => {
                            if (navigator.share) {
                                navigator.share({
                                    title: 'A.C.L.S App',
                                    text: 'Acompanhe o ranking e as seletivas de sinuca!',
                                    url: window.location.href
                                }).catch(console.error);
                            } else {
                                navigator.clipboard.writeText(window.location.href);
                                alert('Link copiado para a área de transferência!');
                            }
                            setOpen(false);
                        }}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 12 }}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                        Compartilhar App
                    </button>
                </nav>

                <div className="sidebar-footer">
                    <p className="sidebar-footer-text">
                        A.C.L.S v1.0<br />
                        © 2026 Todos os direitos reservados
                    </p>
                </div>
            </aside>
        </>
    );
}
