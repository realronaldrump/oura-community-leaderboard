
import React, { useState } from 'react';
import { REDIRECT_URI, createOAuthState, getAuthUrl, OAUTH_STATE_KEY } from '../constants';
import { ClipboardDocumentIcon, CheckIcon } from '@heroicons/react/24/outline';

const Login: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const handleConnect = () => {
    const state = createOAuthState();
    localStorage.setItem(OAUTH_STATE_KEY, state);
    window.location.href = getAuthUrl(state);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(REDIRECT_URI);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#F2EDE8] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Soft background blobs */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#A08BBE] opacity-[0.06] blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#6B9E8A] opacity-[0.06] blur-[120px] rounded-full"></div>
      </div>

      <div className="max-w-md w-full bg-white border border-[rgba(0,0,0,0.06)] rounded-3xl p-8 z-10 text-center"
        style={{ boxShadow: '10px 10px 20px rgba(0,0,0,0.08), -10px -10px 20px rgba(255,255,255,0.95), inset 2px 2px 4px rgba(255,255,255,0.8), inset -2px -2px 4px rgba(0,0,0,0.03)' }}
      >
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[#6B9E8A] flex items-center justify-center"
          style={{ boxShadow: '4px 4px 8px rgba(0,0,0,0.1), -4px -4px 8px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.3)' }}
        >
          <span className="text-3xl font-bold text-white">O</span>
        </div>

        <h1 className="text-3xl font-bold text-[#2D2A26] mb-2">Oura Circles+</h1>
        <p className="text-[#7A756E] mb-8">
          A community leaderboard for your health. Connect your ring to see how you stack up against friends.
        </p>

        <button
          type="button"
          onClick={handleConnect}
          className="block w-full py-4 px-6 bg-[#6B9E8A] text-white font-bold rounded-2xl hover:scale-[1.02] transition-all duration-200"
          style={{ boxShadow: '4px 4px 8px rgba(0,0,0,0.1), -4px -4px 8px rgba(255,255,255,0.6), inset 1px 1px 2px rgba(255,255,255,0.2)' }}
        >
          Connect Oura Ring
        </button>

        <p className="mt-6 text-xs text-[#A8A29E]">
          By connecting, you agree to share your activity, sleep, and readiness scores within this private leaderboard application.
        </p>

        {/* Developer Helper for Redirect URI */}
        <div className="mt-8 pt-6 border-t border-[rgba(0,0,0,0.06)] text-left">
          <p className="text-[10px] uppercase tracking-wider text-[#A8A29E] font-bold mb-2">
            Developer Setup
          </p>
          <p className="text-xs text-[#7A756E] mb-2">
            Ensure this Redirect URI is added to your Oura Developer Console:
          </p>
          <div className="flex items-center gap-2 bg-[#F2EDE8] rounded-xl p-2 border border-[rgba(0,0,0,0.06)]"
            style={{ boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.05), inset -2px -2px 4px rgba(255,255,255,0.5)' }}
          >
            <code className="flex-1 text-xs text-[#6B9E8A] font-mono truncate">
              {REDIRECT_URI}
            </code>
            <button
              onClick={handleCopy}
              className="p-1 hover:bg-white rounded-lg transition-colors text-[#7A756E]"
              title="Copy to clipboard"
            >
              {copied ? <CheckIcon className="w-4 h-4 text-[#7BC4A0]" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
