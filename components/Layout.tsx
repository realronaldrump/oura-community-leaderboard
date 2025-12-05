import React from 'react';
import {
  HomeIcon,
  TrophyIcon,
  ArrowRightOnRectangleIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: 'dashboard' | 'leaderboard';
  onNavigate: (tab: 'dashboard' | 'leaderboard') => void;
  onLogout: () => void;
  userEmail?: string;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, onNavigate, onLogout, userEmail }) => {
  return (
    <div className="flex h-screen bg-oura-dark text-white overflow-hidden">
      {/* Sidebar - Desktop */}
      <div className="hidden md:flex flex-col w-64 bg-oura-card border-r border-gray-800">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-oura-purple to-oura-blue flex items-center justify-center">
            <span className="font-bold text-white">O</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight">Oura Circles+</h1>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          <button
            onClick={() => onNavigate('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === 'dashboard'
                ? 'bg-gradient-to-r from-oura-purple/20 to-transparent text-oura-purple border-l-2 border-oura-purple'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
          >
            <HomeIcon className="w-5 h-5" />
            <span className="font-medium">Dashboard</span>
          </button>

          <button
            onClick={() => onNavigate('leaderboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === 'leaderboard'
                ? 'bg-gradient-to-r from-oura-teal/20 to-transparent text-oura-teal border-l-2 border-oura-teal'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
          >
            <TrophyIcon className="w-5 h-5" />
            <span className="font-medium">Leaderboard</span>
          </button>
        </nav>

        <div className="p-4 border-t border-gray-800">
          {userEmail && (
            <div className="mb-4 px-2 text-xs text-gray-500 truncate">
              Signed in as {userEmail}
            </div>
          )}
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-2 text-gray-400 hover:text-oura-danger transition-colors rounded-lg hover:bg-gray-800"
          >
            <ArrowRightOnRectangleIcon className="w-5 h-5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-oura-card border-b border-gray-800 z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-oura-purple to-oura-blue flex items-center justify-center">
            <span className="font-bold text-xs text-white">O</span>
          </div>
          <span className="font-bold">Circles+</span>
        </div>
        <button onClick={onLogout} className="p-2 text-gray-400">
          <ArrowRightOnRectangleIcon className="w-6 h-6" />
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <main className="flex-1 overflow-y-auto pt-20 md:pt-0 p-4 md:p-8 scroll-smooth">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>

        {/* Mobile Bottom Nav */}
        <div className="md:hidden flex bg-oura-card border-t border-gray-800 pb-safe">
          <button
            onClick={() => onNavigate('dashboard')}
            className={`flex-1 flex flex-col items-center justify-center py-3 ${activeTab === 'dashboard' ? 'text-oura-purple' : 'text-gray-500'
              }`}
          >
            <HomeIcon className="w-6 h-6" />
            <span className="text-xs mt-1">Home</span>
          </button>
          <button
            onClick={() => onNavigate('leaderboard')}
            className={`flex-1 flex flex-col items-center justify-center py-3 ${activeTab === 'leaderboard' ? 'text-oura-teal' : 'text-gray-500'
              }`}
          >
            <TrophyIcon className="w-6 h-6" />
            <span className="text-xs mt-1">Rankings</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Layout;
