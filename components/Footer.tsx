import React from 'react';

const Footer: React.FC = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[rgba(0,0,0,0.06)] bg-[#F2EDE8] px-6 py-6 text-[#A8A29E] text-xs">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-[#6B9E8A] flex items-center justify-center" style={{ boxShadow: '1px 1px 2px rgba(0,0,0,0.08)' }}>
            <span className="font-bold text-white text-[10px]">O</span>
          </div>
          <span>&copy; {year} Oura Circles+</span>
        </div>
        <div className="flex items-center gap-4">
          <span>Not affiliated with Oura Health Oy</span>
          <span className="hidden sm:inline text-[rgba(0,0,0,0.15)]">&middot;</span>
          <span className="hidden sm:inline">Community Project</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
