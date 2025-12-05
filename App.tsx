
import React, { useState } from 'react';
import { UserProvider } from './contexts/UserContext';
import { Navigation } from './components/Navigation';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Leaderboard from './pages/Leaderboard';

function App() {
  const [currentPage, setCurrentPage] = useState<'dashboard' | 'leaderboard' | 'settings'>('dashboard');

  return (
    <UserProvider>
      <div className="min-h-screen bg-oura-bg text-white font-sans selection:bg-oura-purple selection:text-white">
        <Navigation currentPage={currentPage} setPage={setCurrentPage} />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
          {currentPage === 'dashboard' && <Dashboard />}
          {currentPage === 'settings' && <Settings />}
          {currentPage === 'leaderboard' && <Leaderboard />}
        </main>
      </div>
    </UserProvider>
  );
}

export default App;
