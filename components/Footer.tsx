import React from 'react';

const Footer: React.FC = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[#222] bg-[#0C0C0C] px-6 py-6 text-[#666666] text-xs">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-[#00C896] flex items-center justify-center">
            <span className="font-bold text-black text-[10px]">O</span>
          </div>
          <span>&copy; {year} Oura Circles+</span>
        </div>
        <div className="flex items-center gap-4">
          <span>Not affiliated with Oura Health Oy</span>
          <span className="hidden sm:inline text-[#333]">&middot;</span>
          <span className="hidden sm:inline">Community Project</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
