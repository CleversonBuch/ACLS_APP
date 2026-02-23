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
    X
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
