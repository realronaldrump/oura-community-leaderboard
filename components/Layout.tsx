import React, { useState } from 'react';
import {
  HomeIcon,
  TrophyIcon,
  ArrowRightOnRectangleIcon,
  ChartBarIcon,
  Cog6ToothIcon
} from '@heroicons/react/24/outline';
import { useHapticFeedback } from './ios';
import Footer from './Footer';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: 'dashboard' | 'leaderboard';
  onNavigate: (tab: 'dashboard' | 'leaderboard') => void;
  onLogout: () => void;
  userEmail?: string;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, onNavigate, onLogout, userEmail }) => {
  const { triggerHaptic } = useHapticFeedback();

  const handleNavigate = (tab: 'dashboard' | 'leaderboard') => {
    triggerHaptic('light');
    onNavigate(tab);
  };

  const handleLogout = () => {
    triggerHaptic('warning');
    onLogout();
  };

  return (
    <div className="flex h-screen bg-[#F2EDE8] text-[#2D2A26] overflow-hidden">
      {/* Sidebar - Desktop */}
      <div className="hidden md:flex flex-col w-64 bg-white border-r border-[rgba(0,0,0,0.06)]" style={{ boxShadow: '4px 0 12px rgba(0,0,0,0.04)' }}>
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#6B9E8A] flex items-center justify-center" style={{ boxShadow: '2px 2px 4px rgba(0,0,0,0.1), -2px -2px 4px rgba(255,255,255,0.9)' }}>
            <span className="font-bold text-white text-sm">O</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#2D2A26]">Oura Circles+</h1>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          <button
            onClick={() => handleNavigate('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 ios-button ${activeTab === 'dashboard'
                ? 'bg-[#6B9E8A]/12 text-[#6B9E8A] shadow-clay-inset'
                : 'text-[#7A756E] hover:bg-[#F2EDE8] hover:text-[#2D2A26]'
              }`}
            style={activeTab === 'dashboard' ? { boxShadow: 'inset 3px 3px 6px rgba(0,0,0,0.06), inset -3px -3px 6px rgba(255,255,255,0.7)' } : {}}
          >
            <HomeIcon className="w-5 h-5" />
            <span className="font-semibold">Dashboard</span>
          </button>

          <button
            onClick={() => handleNavigate('leaderboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 ios-button ${activeTab === 'leaderboard'
                ? 'bg-[#6B9E8A]/12 text-[#6B9E8A]'
                : 'text-[#7A756E] hover:bg-[#F2EDE8] hover:text-[#2D2A26]'
              }`}
            style={activeTab === 'leaderboard' ? { boxShadow: 'inset 3px 3px 6px rgba(0,0,0,0.06), inset -3px -3px 6px rgba(255,255,255,0.7)' } : {}}
          >
            <TrophyIcon className="w-5 h-5" />
            <span className="font-semibold">Leaderboard</span>
          </button>
        </nav>

        <div className="p-4 border-t border-[rgba(0,0,0,0.06)]">
          {userEmail && (
            <div className="mb-4 px-2 text-xs text-[#A8A29E] truncate">
              Signed in as {userEmail}
            </div>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2 text-[#7A756E] hover:text-[#D4897B] transition-colors rounded-xl hover:bg-[#F2EDE8] ios-button"
          >
            <ArrowRightOnRectangleIcon className="w-5 h-5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white/85 backdrop-blur-xl border-b border-[rgba(0,0,0,0.06)] z-40 flex items-center justify-between px-4 safe-top" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-[#6B9E8A] flex items-center justify-center">
            <span className="font-bold text-white text-xs">O</span>
          </div>
          <span className="font-bold text-sm text-[#2D2A26]">Circles+</span>
        </div>
        <button onClick={handleLogout} className="ios-touch-target p-2 text-[#7A756E] active:text-[#D4897B] transition-colors">
          <ArrowRightOnRectangleIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <main className="flex-1 overflow-y-auto pt-20 md:pt-0 p-4 md:p-8 ios-scroll">
          <div className="max-w-7xl mx-auto pb-24 md:pb-8">
            {children}
          </div>
          <Footer />
        </main>

        {/* Mobile Bottom Nav */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-[rgba(0,0,0,0.06)] safe-bottom z-50" style={{ boxShadow: '0 -4px 12px rgba(0,0,0,0.04)' }}>
          <div className="flex ios-list-item">
            <button
              onClick={() => handleNavigate('dashboard')}
              className={`flex-1 flex flex-col items-center justify-center py-2 ios-touch ${activeTab === 'dashboard' ? 'text-[#6B9E8A]' : 'text-[#A8A29E]'
                }`}
            >
              <div className={`p-1 rounded-xl transition-all duration-200 ${activeTab === 'dashboard' ? 'bg-[#6B9E8A]/10' : ''}`}>
                <HomeIcon className="w-6 h-6" />
              </div>
              <span className="text-xs mt-1 font-semibold">Home</span>
            </button>
            <button
              onClick={() => handleNavigate('leaderboard')}
              className={`flex-1 flex flex-col items-center justify-center py-2 ios-touch ${activeTab === 'leaderboard' ? 'text-[#6B9E8A]' : 'text-[#A8A29E]'
                }`}
            >
              <div className={`p-1 rounded-xl transition-all duration-200 ${activeTab === 'leaderboard' ? 'bg-[#6B9E8A]/10' : ''}`}>
                <TrophyIcon className="w-6 h-6" />
              </div>
              <span className="text-xs mt-1 font-semibold">Rankings</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Layout;
