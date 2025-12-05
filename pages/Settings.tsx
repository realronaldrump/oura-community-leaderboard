
import React, { useState } from 'react';
import { useUser } from '../contexts/UserContext';
import { TrashIcon, PlusIcon } from '@heroicons/react/24/outline'; // verify if we have heroicons

const Settings: React.FC = () => {
    const { profiles, addProfile, removeProfile } = useUser();
    const [newName, setNewName] = useState('');
    const [newToken, setNewToken] = useState('');

    const handleAdd = (e: React.FormEvent) => {
        e.preventDefault();
        if (newName && newToken) {
            addProfile(newName, newToken);
            setNewName('');
            setNewToken('');
        }
    };

    return (
        <div className="max-w-3xl mx-auto space-y-8">
            <div>
                <h2 className="text-3xl font-bold text-white mb-2">Community Settings</h2>
                <p className="text-gray-400">Manage user profiles and access tokens.</p>
            </div>

            <div className="bg-oura-card rounded-3xl p-8 border border-gray-800 shadow-lg">
                <h3 className="text-xl font-semibold text-white mb-6">Add New Profile</h3>
                <form onSubmit={handleAdd} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Name</label>
                        <input
                            type="text"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            className="w-full bg-oura-bg border border-gray-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-oura-purple focus:border-transparent outline-none transition-all"
                            placeholder="e.g. Davis"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Oura Personal Access Token</label>
                        <input
                            type="password"
                            value={newToken}
                            onChange={e => setNewToken(e.target.value)}
                            className="w-full bg-oura-bg border border-gray-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-oura-purple focus:border-transparent outline-none transition-all"
                            placeholder="Header token from cloud.ouraring.com"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        className="w-full bg-oura-purple hover:bg-oura-purple-dark text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        <PlusIcon className="w-5 h-5" />
                        Add Profile
                    </button>
                </form>
            </div>

            <div className="bg-oura-card rounded-3xl p-8 border border-gray-800 shadow-lg">
                <h3 className="text-xl font-semibold text-white mb-6">Active Profiles</h3>
                {profiles.length === 0 ? (
                    <p className="text-gray-500 italic">No profiles added yet.</p>
                ) : (
                    <div className="space-y-4">
                        {profiles.map(profile => (
                            <div key={profile.id} className="flex items-center justify-between bg-oura-bg p-4 rounded-xl border border-gray-800">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-oura-purple to-oura-blue flex items-center justify-center text-white font-bold">
                                        {profile.name[0].toUpperCase()}
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-white">{profile.name}</h4>
                                        <p className="text-xs text-gray-500 truncate w-32">Token: ••••••••</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => removeProfile(profile.id)}
                                    className="text-red-400 hover:text-red-300 p-2 hover:bg-red-900/20 rounded-lg transition-colors"
                                    title="Remove Profile"
                                >
                                    <TrashIcon className="w-5 h-5" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="bg-blue-900/20 border border-blue-900/50 rounded-2xl p-6">
                <h4 className="text-blue-200 font-medium mb-2">How to get a token?</h4>
                <p className="text-sm text-blue-300/80">
                    Go to <a href="https://cloud.ouraring.com/personal-access-tokens" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">Oura Cloud</a>, sign in, and create a new Personal Access Token. Copy it and paste it here.
                    <br />
                    Data is stored locally in your browser and requesting directly to Oura API.
                </p>
            </div>
        </div>
    );
};

export default Settings;
