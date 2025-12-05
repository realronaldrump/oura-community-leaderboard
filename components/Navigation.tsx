
import React from 'react';

type Page = 'dashboard' | 'leaderboard' | 'settings';

interface NavigationProps {
    currentPage: Page;
    setPage: (page: Page) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ currentPage, setPage }) => {
    return (
        <nav className="bg-oura-card border-b border-gray-800 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center">
                        <span className="text-xl font-bold text-white tracking-widest mr-8">OURA COMMUNITY</span>
                        <div className="flex items-baseline space-x-4">
                            <button
                                onClick={() => setPage('dashboard')}
                                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${currentPage === 'dashboard' ? 'bg-oura-purple text-white' : 'text-gray-300 hover:text-white hover:bg-gray-700'
                                    }`}
                            >
                                Dashboard
                            </button>
                            <button
                                onClick={() => setPage('leaderboard')}
                                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${currentPage === 'leaderboard' ? 'bg-oura-purple text-white' : 'text-gray-300 hover:text-white hover:bg-gray-700'
                                    }`}
                            >
                                Leaderboard
                            </button>
                            <button
                                onClick={() => setPage('settings')}
                                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${currentPage === 'settings' ? 'bg-oura-purple text-white' : 'text-gray-300 hover:text-white hover:bg-gray-700'
                                    }`}
                            >
                                Settings
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </nav>
    );
};
