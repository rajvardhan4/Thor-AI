'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Fingerprint, Cpu, Lock, Terminal } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'scanning' | 'granted' | 'denied'>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const router = useRouter();

  useEffect(() => {
    // Holographic security boot sequence
    const bootSequences = [
      'INITIALIZING SECURITY PROTOCOLS...',
      'ESTABLISHING ENCRYPTED TUNNEL...',
      'FIREWALL LEVEL 5 ACTIVE.',
      'READY FOR BIOMETRIC OR CREDENTIAL SCAN.'
    ];

    bootSequences.forEach((text, i) => {
      setTimeout(() => {
        setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${text}`]);
      }, i * 600);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    setStatus('scanning');
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] INITIALIZING USER IDENTITY VERIFICATION...`]);

    // Simulate scanning delay
    setTimeout(async () => {
      try {
        const socketUrl = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'http://localhost:3001';
        const baseUrl = socketUrl.endsWith('/') ? socketUrl.slice(0, -1) : socketUrl;
        const res = await fetch(`${baseUrl}/api/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        const data = await res.json();
        
        if (data.success) {
          setStatus('granted');
          setLogs(prev => [
            ...prev,
            `[${new Date().toLocaleTimeString()}] CREDENTIALS VERIFIED.`,
            `[${new Date().toLocaleTimeString()}] DECRYPTING PROFILE...`,
            `[${new Date().toLocaleTimeString()}] ACCESS GRANTED. WELCOME RAJVARDHAN.`
          ]);
          localStorage.setItem('thor_user', JSON.stringify(data.user));
          
          setTimeout(() => {
            router.push('/');
          }, 1500);
        } else {
          setStatus('denied');
          setLogs(prev => [
            ...prev,
            `[${new Date().toLocaleTimeString()}] ERROR: ACCESS DENIED. INVALID CREDENTIALS.`
          ]);
          setTimeout(() => setStatus('idle'), 2000);
        }
      } catch (err) {
        setStatus('denied');
        setLogs(prev => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] SECURE SERVER CONNECTION FAILED.`
        ]);
        setTimeout(() => setStatus('idle'), 2500);
      }
    }, 1500);
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-gray-950 text-cyan-400 p-4 font-mono select-none">
      {/* Sci-Fi Ambient Overlays */}
      <div className="hud-grid"></div>
      <div className="scanlines"></div>
      <div className="scanner-bar"></div>

      <div className="w-full max-w-lg glass-panel p-8 rounded-xl relative z-10 border border-cyan-500/30 shadow-[0_0_50px_rgba(0,240,255,0.1)]">
        {/* Hologram Corners */}
        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-cyan-400"></div>
        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-cyan-400"></div>
        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-cyan-400"></div>
        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-cyan-400"></div>

        {/* Header HUD info */}
        <div className="flex justify-between items-center text-xs text-cyan-500/60 border-b border-cyan-500/20 pb-4 mb-6">
          <div className="flex items-center gap-2">
            <Cpu className="w-3 h-3 animate-pulse" />
            <span>THOR SYSTEM v5.00</span>
          </div>
          <span>SECURE PORT 3001</span>
        </div>

        {/* Biometric Icon Area */}
        <div className="flex flex-col items-center justify-center my-6">
          <div className={`relative p-6 rounded-full border-2 ${
            status === 'scanning' ? 'border-yellow-400 text-yellow-400 animate-pulse' :
            status === 'granted' ? 'border-emerald-500 text-emerald-500' :
            status === 'denied' ? 'border-red-600 text-red-600 animate-bounce' :
            'border-cyan-500/40 text-cyan-400'
          } bg-black/40`}>
            <Fingerprint className="w-16 h-16" />
            {status === 'scanning' && (
              <div className="absolute top-0 left-0 w-full h-full border-2 border-yellow-400 rounded-full animate-ping opacity-75"></div>
            )}
          </div>
          <span className={`text-xs mt-3 tracking-widest font-semibold uppercase ${
            status === 'scanning' ? 'text-yellow-400' :
            status === 'granted' ? 'text-emerald-400' :
            status === 'denied' ? 'text-red-500' :
            'text-cyan-500/70'
          }`}>
            {status === 'scanning' ? 'ANALYZING CREDENTIALS...' :
             status === 'granted' ? 'ACCESS GRANTED' :
             status === 'denied' ? 'ACCESS DENIED' :
             'IDENTITY VERIFICATION REQUIRED'}
          </span>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-cyan-500/60">
              <Terminal className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="IDENTITY IDENTIFIER"
              value={username}
              onChange={e => setUsername(e.target.value)}
              disabled={status === 'scanning' || status === 'granted'}
              className="w-full bg-black/50 border border-cyan-500/30 rounded px-3 py-2.5 pl-10 text-cyan-100 placeholder-cyan-700 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30 text-sm tracking-wider"
            />
          </div>

          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-cyan-500/60">
              <Lock className="w-4 h-4" />
            </span>
            <input
              type="password"
              placeholder="SECURITY CODE"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={status === 'scanning' || status === 'granted'}
              className="w-full bg-black/50 border border-cyan-500/30 rounded px-3 py-2.5 pl-10 text-cyan-100 placeholder-cyan-700 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30 text-sm tracking-wider"
            />
          </div>

          <button
            type="submit"
            disabled={status === 'scanning' || status === 'granted' || !username || !password}
            className="w-full bg-cyan-950 border border-cyan-400 text-cyan-400 font-semibold py-2.5 rounded hover:bg-cyan-500 hover:text-black transition duration-300 disabled:opacity-50 text-sm tracking-widest uppercase flex items-center justify-center gap-2"
          >
            <Shield className="w-4 h-4" />
            INITIATE PROTOCOL
          </button>
        </form>

        {/* Terminal Logs Panel */}
        <div className="mt-6 border border-cyan-500/20 bg-black/60 rounded p-3 text-[10px] text-cyan-500/80 leading-relaxed max-h-24 overflow-y-auto">
          {logs.map((log, index) => (
            <div key={index} className="truncate">
              {log}
            </div>
          ))}
        </div>

        {/* Subtitle credentials helper */}
        <div className="mt-4 text-center text-[10px] text-cyan-600/60">
          SECURED BY MATRIX INTEGRATION LAYER | DEFAULT: admin / thor
        </div>
      </div>
    </div>
  );
}
