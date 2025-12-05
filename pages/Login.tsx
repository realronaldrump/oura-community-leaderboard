
import React, { useState } from 'react';
import { AUTH_URL, REDIRECT_URI } from '../constants';
import { ClipboardDocumentIcon, CheckIcon } from '@heroicons/react/24/outline';

const Login: React.FC = () => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(REDIRECT_URI);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-oura-dark flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-oura-purple opacity-20 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-oura-teal opacity-20 blur-[120px] rounded-full"></div>
      </div>

      <div className="max-w-md w-full bg-oura-card/80 backdrop-blur-xl border border-gray-800 rounded-3xl p-8 shadow-2xl z-10 text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gradient-to-tr from-oura-purple to-oura-blue flex items-center justify-center shadow-lg shadow-oura-purple/20">
          <span className="text-3xl font-bold text-white">O</span>
        </div>
        
        <h1 className="text-3xl font-bold text-white mb-2">Oura Circles+</h1>
        <p className="text-gray-400 mb-8">
          A community leaderboard for your health. Connect your ring to see how you stack up against friends.
        </p>

        <a 
          href={AUTH_URL}
          className="block w-full py-4 px-6 bg-white text-oura-dark font-bold rounded-xl hover:bg-gray-100 transform hover:scale-[1.02] transition-all duration-200 shadow-lg"
        >
          Connect Oura Ring
        </a>
        
        <p className="mt-6 text-xs text-gray-600">
          By connecting, you agree to share your activity, sleep, and readiness scores within this private leaderboard application.
        </p>

        {/* Developer Helper for Redirect URI */}
        <div className="mt-8 pt-6 border-t border-gray-800 text-left">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2">
            Developer Setup
          </p>
          <p className="text-xs text-gray-400 mb-2">
            Ensure this Redirect URI is added to your Oura Developer Console:
          </p>
          <div className="flex items-center gap-2 bg-black/40 rounded-lg p-2 border border-gray-800">
            <code className="flex-1 text-xs text-oura-teal font-mono truncate">
              {REDIRECT_URI}
            </code>
            <button 
              onClick={handleCopy}
              className="p-1 hover:bg-gray-700 rounded transition-colors text-gray-400"
              title="Copy to clipboard"
            >
              {copied ? <CheckIcon className="w-4 h-4 text-green-500" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
