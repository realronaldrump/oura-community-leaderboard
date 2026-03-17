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
    <div className="flex h-screen bg-[#0C0C0C] text-[#FAFAFA] overflow-hidden">
      {/* Sidebar - Desktop */}
      <div className="hidden md:flex flex-col w-64 bg-[#141414] border-r border-[#222]">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#00C896] flex items-center justify-center">
            <span className="font-bold text-black text-sm">O</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight">Oura Circles+</h1>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          <button
            onClick={() => handleNavigate('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ios-button ${activeTab === 'dashboard'
                ? 'bg-[#00C896]/20 text-[#00C896]'
                : 'text-[#A0A0A0] hover:bg-[#1C1C1C] hover:text-[#FAFAFA]'
              }`}
          >
            <HomeIcon className="w-5 h-5" />
            <span className="font-medium">Dashboard</span>
          </button>

          <button
            onClick={() => handleNavigate('leaderboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ios-button ${activeTab === 'leaderboard'
                ? 'bg-[#00C896]/20 text-[#00C896]'
                : 'text-[#A0A0A0] hover:bg-[#1C1C1C] hover:text-[#FAFAFA]'
              }`}
          >
            <TrophyIcon className="w-5 h-5" />
            <span className="font-medium">Leaderboard</span>
          </button>
        </nav>

        <div className="p-4 border-t border-[#222]">
          {userEmail && (
            <div className="mb-4 px-2 text-xs text-[#666666] truncate">
              Signed in as {userEmail}
            </div>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2 text-[#A0A0A0] hover:text-[#FF453A] transition-colors rounded-lg hover:bg-[#1C1C1C] ios-button"
          >
            <ArrowRightOnRectangleIcon className="w-5 h-5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-[#141414]/80 backdrop-blur-xl border-b border-[#222] z-40 flex items-center justify-between px-4 safe-top">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-[#00C896] flex items-center justify-center">
            <span className="font-bold text-black text-xs">O</span>
          </div>
          <span className="font-bold text-sm">Circles+</span>
        </div>
        <button onClick={handleLogout} className="ios-touch-target p-2 text-[#A0A0A0] active:text-[#FF453A] transition-colors">
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

        {/* Mobile Bottom Nav - iOS Style */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#141414]/95 backdrop-blur-xl border-t border-[#222] safe-bottom z-50">
          <div className="flex ios-list-item">
            <button
              onClick={() => handleNavigate('dashboard')}
              className={`flex-1 flex flex-col items-center justify-center py-2 ios-touch ${activeTab === 'dashboard' ? 'text-[#00C896]' : 'text-[#666666]'
                }`}
            >
              <div className={`p-1 rounded-xl transition-all duration-200 ${activeTab === 'dashboard' ? 'bg-[#00C896]/10' : ''}`}>
                <HomeIcon className="w-6 h-6" />
              </div>
              <span className="text-xs mt-1 font-medium">Home</span>
            </button>
            <button
              onClick={() => handleNavigate('leaderboard')}
              className={`flex-1 flex flex-col items-center justify-center py-2 ios-touch ${activeTab === 'leaderboard' ? 'text-[#00C896]' : 'text-[#666666]'
                }`}
            >
              <div className={`p-1 rounded-xl transition-all duration-200 ${activeTab === 'leaderboard' ? 'bg-[#00C896]/10' : ''}`}>
                <TrophyIcon className="w-6 h-6" />
              </div>
              <span className="text-xs mt-1 font-medium">Rankings</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Layout;
