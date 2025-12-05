import React, { useEffect, useState } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Leaderboard from './pages/Leaderboard';
import Layout from './components/Layout';
import { AuthStatus, DailyActivity, DailyReadiness, DailySleep, SleepSession, UserProfile } from './types';
import { ouraService } from './services/ouraService';

const App: React.FC = () => {
  const [authStatus, setAuthStatus] = useState<AuthStatus>(AuthStatus.LOADING);
  const [token, setToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'leaderboard'>('dashboard');

  // Data State
  const [user, setUser] = useState<UserProfile | null>(null);
  const [sleepData, setSleepData] = useState<DailySleep[]>([]);
  const [sleepSessions, setSleepSessions] = useState<SleepSession[]>([]);
  const [readinessData, setReadinessData] = useState<DailyReadiness[]>([]);
  const [activityData, setActivityData] = useState<DailyActivity[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check hash for token (Redirect from Oura)
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1)); // Remove the '#'
      const accessToken = params.get('access_token');
      if (accessToken) {
        localStorage.setItem('oura_token', accessToken);
        setToken(accessToken);
        setAuthStatus(AuthStatus.AUTHENTICATED);
        window.history.replaceState(null, '', window.location.pathname); // Clean URL
      }
    } else {
      // Check localStorage
      const storedToken = localStorage.getItem('oura_token');
      if (storedToken) {
        setToken(storedToken);
        setAuthStatus(AuthStatus.AUTHENTICATED);
      } else {
        setAuthStatus(AuthStatus.UNAUTHENTICATED);
      }
    }
  }, []);

  useEffect(() => {
    if (authStatus === AuthStatus.AUTHENTICATED && token) {
      fetchData(token);
    }
  }, [authStatus, token]);

  const fetchData = async (accessToken: string) => {
    try {
      setError(null);
      // Fetch user info first
      const userData = await ouraService.getPersonalInfo(accessToken);
      setUser(userData);

      // Fetch metrics in parallel
      const [sleep, sessions, readiness, activity] = await Promise.all([
        ouraService.getDailySleep(accessToken),
        ouraService.getSleepSessions(accessToken),
        ouraService.getDailyReadiness(accessToken),
        ouraService.getDailyActivity(accessToken),
      ]);

      setSleepData(sleep);
      setSleepSessions(sessions);
      setReadinessData(readiness);
      setActivityData(activity);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch data. Your token may have expired.');
      if ((err as Error).message.includes('401')) {
        handleLogout();
      }
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('oura_token');
    setToken(null);
    setUser(null);
    setAuthStatus(AuthStatus.UNAUTHENTICATED);
  };

  if (authStatus === AuthStatus.LOADING) {
    return (
      <div className="min-h-screen bg-oura-dark flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-oura-purple"></div>
      </div>
    );
  }

  if (authStatus === AuthStatus.UNAUTHENTICATED) {
    return <Login />;
  }

  return (
    <Layout
      activeTab={activeTab}
      onNavigate={setActiveTab}
      onLogout={handleLogout}
      userEmail={user?.email}
    >
      {error && (
        <div className="bg-red-500/10 border border-red-500 text-red-500 p-4 rounded-xl mb-6">
          {error} <button onClick={() => fetchData(token!)} className="underline ml-2">Retry</button>
        </div>
      )}

      {activeTab === 'dashboard' ? (
        <Dashboard
          user={user}
          sleep={sleepData}
          sleepSessions={sleepSessions}
          readiness={readinessData}
          activity={activityData}
        />
      ) : (
        <Leaderboard
          user={user}
          sleep={sleepData}
          readiness={readinessData}
          activity={activityData}
        />
      )}
    </Layout>
  );
};

export default App;
