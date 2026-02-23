import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Players from './pages/Players.jsx';
import CreateSelective from './pages/CreateSelective.jsx';
import Matches from './pages/Matches.jsx';
import EditEtapa from './pages/Etapas.jsx';
import CreateEtapa from './pages/CreateEtapa.jsx';
import Rankings from './pages/Rankings.jsx';
import History from './pages/History.jsx';
import HallOfFame from './pages/HallOfFame.jsx';

export default function App() {
    return (
        <BrowserRouter>
            <div className="app-layout">
                <Sidebar />
                <main className="main-content">
                    <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/jogadores" element={<Players />} />
                        <Route path="/nova-seletiva" element={<CreateSelective />} />
                        <Route path="/confrontos" element={<Matches />} />
                        <Route path="/etapas" element={<EditEtapa />} />
                        <Route path="/nova-etapa" element={<CreateEtapa />} />
                        <Route path="/ranking" element={<Rankings />} />
                        <Route path="/historico" element={<History />} />
                        <Route path="/hall-da-fama" element={<HallOfFame />} />
                    </Routes>
                </main>
            </div>
        </BrowserRouter>
    );
}
