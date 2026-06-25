'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Fingerprint, Cpu, Lock, Terminal, User, Mail, Phone, ArrowLeft, ShieldAlert, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const [screen, setScreen] = useState<'landing' | 'login' | 'register'>('landing');
  
  // Login State
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  
  // Register State
  const [regFullName, setRegFullName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);

  const [status, setStatus] = useState<'idle' | 'scanning' | 'granted' | 'denied'>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const router = useRouter();

  useEffect(() => {
    // Holographic security boot sequence
    const bootSequences = [
      'INITIALIZING SECURITY PROTOCOLS...',
      'ESTABLISHING ENCRYPTED TUNNEL...',
      'FIREWALL LEVEL 5 ACTIVE.',
      'READY FOR USER SECURE IDENTIFICATION SCAN.'
    ];

    bootSequences.forEach((text, i) => {
      setTimeout(() => {
        setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${text}`]);
      }, i * 400);
    });
  }, []);

  const getBackendUrl = () => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'http://localhost:3001';
    return socketUrl.endsWith('/') ? socketUrl.slice(0, -1) : socketUrl;
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginIdentifier || !loginPassword) return;

    setStatus('scanning');
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] INITIATING LOGON CREDENTIAL SCAN...`]);

    setTimeout(async () => {
      try {
        const res = await fetch(`${getBackendUrl()}/api/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: loginIdentifier, password: loginPassword })
        });

        const data = await res.json();
        
        if (data.success) {
          setStatus('granted');
          setLogs(prev => [
            ...prev,
            `[${new Date().toLocaleTimeString()}] ACCESS CODE VALIDATED.`,
            `[${new Date().toLocaleTimeString()}] DECRYPTING BIOMETRICS...`,
            `[${new Date().toLocaleTimeString()}] WELCOME BACK, ${data.user.fullName.toUpperCase()}.`
          ]);
          localStorage.setItem('thor_user', JSON.stringify(data.user));
          
          setTimeout(() => {
            router.push('/');
          }, 1500);
        } else {
          setStatus('denied');
          setLogs(prev => [
            ...prev,
            `[${new Date().toLocaleTimeString()}] ACCESS DENIED: ${data.error.toUpperCase()}`
          ]);
          setTimeout(() => setStatus('idle'), 2000);
        }
      } catch (err) {
        setStatus('denied');
        setLogs(prev => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] SYSTEM LINK ERROR: SECURE HANDSHAKE FAILED.`
        ]);
        setTimeout(() => setStatus('idle'), 2500);
      }
    }, 1200);
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regFullName || !regUsername || !regEmail || !regPassword || !regConfirmPassword) {
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] REGISTRATION FAILED: ALL FIELDS REQUIRED.`]);
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] REGISTRATION FAILED: SECURITY CODES MISMATCH.`]);
      return;
    }

    setStatus('scanning');
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] CREATING NEW ENCRYPTED PROFILE...`]);

    setTimeout(async () => {
      try {
        const res = await fetch(`${getBackendUrl()}/api/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: regFullName,
            username: regUsername,
            email: regEmail,
            phone: regPhone,
            password: regPassword,
            confirmPassword: regConfirmPassword
          })
        });

        const data = await res.json();

        if (data.success) {
          setStatus('granted');
          setLogs(prev => [
            ...prev,
            `[${new Date().toLocaleTimeString()}] BIOMETRIC ARCHIVE CREATED.`,
            `[${new Date().toLocaleTimeString()}] TRANSMITTING WELCOME PROTOCOLS TO ${regEmail.toUpperCase()}...`,
            `[${new Date().toLocaleTimeString()}] SIGNUP COMPLETED.`
          ]);
          
          setTimeout(() => {
            setStatus('idle');
            setScreen('login');
            // Clear forms
            setRegFullName('');
            setRegUsername('');
            setRegEmail('');
            setRegPhone('');
            setRegPassword('');
            setRegConfirmPassword('');
          }, 1800);
        } else {
          setStatus('denied');
          setLogs(prev => [
            ...prev,
            `[${new Date().toLocaleTimeString()}] ENROLLMENT FAILED: ${data.error.toUpperCase()}`
          ]);
          setTimeout(() => setStatus('idle'), 2000);
        }
      } catch (err) {
        setStatus('denied');
        setLogs(prev => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] ENROLLMENT LINK FAILED.`
        ]);
        setTimeout(() => setStatus('idle'), 2500);
      }
    }, 1200);
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
        <div className="flex flex-col items-center justify-center my-4">
          <div className={`relative p-5 rounded-full border-2 ${
            status === 'scanning' ? 'border-yellow-400 text-yellow-400 animate-pulse' :
            status === 'granted' ? 'border-emerald-500 text-emerald-500' :
            status === 'denied' ? 'border-red-600 text-red-600 animate-bounce' :
            'border-cyan-500/40 text-cyan-400'
          } bg-black/40`}>
            <Fingerprint className="w-12 h-12" />
            {status === 'scanning' && (
              <div className="absolute top-0 left-0 w-full h-full border-2 border-yellow-400 rounded-full animate-ping opacity-75"></div>
            )}
          </div>
          <span className={`text-[10px] mt-2 tracking-widest font-semibold uppercase ${
            status === 'scanning' ? 'text-yellow-400' :
            status === 'granted' ? 'text-emerald-400' :
            status === 'denied' ? 'text-red-500' :
            'text-cyan-500/70'
          }`}>
            {status === 'scanning' ? 'COMPUTING AUTH PROTOCOLS...' :
             status === 'granted' ? 'IDENTITY VALIDATED' :
             status === 'denied' ? 'ACCESS DENIED' :
             'IDENTITY VERIFICATION STAGE'}
          </span>
        </div>

        {/* LANDING SCREEN */}
        {screen === 'landing' && (
          <div className="space-y-6 text-center">
            <p className="text-sm tracking-widest text-cyan-200 mt-2 uppercase">
              Welcome to the THOR AI System
            </p>
            <div className="space-y-3 pt-4">
              <button
                onClick={() => {
                  setScreen('login');
                  setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ACCESS PROTOCOL SELECTED.`]);
                }}
                className="w-full bg-cyan-950/40 border border-cyan-400 text-cyan-400 font-bold py-3 rounded hover:bg-cyan-500 hover:text-black transition duration-300 text-sm tracking-widest uppercase flex items-center justify-center gap-2"
              >
                <Shield className="w-4 h-4" />
                ACCESS SYSTEM (LOGIN)
              </button>
              <button
                onClick={() => {
                  setScreen('register');
                  setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ENROLLMENT CHANNEL SECURED.`]);
                }}
                className="w-full bg-black/40 border border-cyan-500/30 text-cyan-500/80 font-bold py-3 rounded hover:bg-cyan-500/20 hover:text-cyan-200 transition duration-300 text-sm tracking-widest uppercase flex items-center justify-center gap-2"
              >
                <Fingerprint className="w-4 h-4" />
                ENROLL IDENTITY (REGISTER)
              </button>
            </div>
          </div>
        )}

        {/* LOGIN SCREEN */}
        {screen === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="flex items-center gap-2 mb-2 text-xs text-cyan-400 hover:text-cyan-300 cursor-pointer" onClick={() => setScreen('landing')}>
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>RETURN</span>
            </div>

            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-cyan-500/60">
                <Terminal className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="IDENTITY IDENTIFIER (USERNAME / EMAIL)"
                value={loginIdentifier}
                onChange={e => setLoginIdentifier(e.target.value)}
                disabled={status === 'scanning' || status === 'granted'}
                className="w-full bg-black/50 border border-cyan-500/30 rounded px-3 py-2.5 pl-10 text-cyan-100 placeholder-cyan-700 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30 text-xs tracking-wider"
              />
            </div>

            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-cyan-500/60">
                <Lock className="w-4 h-4" />
              </span>
              <input
                type={showLoginPassword ? 'text' : 'password'}
                placeholder="SECURITY CODE"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                disabled={status === 'scanning' || status === 'granted'}
                className="w-full bg-black/50 border border-cyan-500/30 rounded px-3 py-2.5 pl-10 pr-10 text-cyan-100 placeholder-cyan-700 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30 text-xs tracking-wider"
              />
              <button
                type="button"
                onClick={() => setShowLoginPassword(!showLoginPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-cyan-500/60 hover:text-cyan-400 transition"
              >
                {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <button
              type="submit"
              disabled={status === 'scanning' || status === 'granted' || !loginIdentifier || !loginPassword}
              className="w-full bg-cyan-950 border border-cyan-400 text-cyan-400 font-semibold py-2.5 rounded hover:bg-cyan-500 hover:text-black transition duration-300 disabled:opacity-40 text-xs tracking-widest uppercase flex items-center justify-center gap-2"
            >
              <Shield className="w-4 h-4" />
              INITIATE PROTOCOL
            </button>
          </form>
        )}

        {/* REGISTER SCREEN */}
        {screen === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
            <div className="flex items-center gap-2 mb-1 text-xs text-cyan-400 hover:text-cyan-300 cursor-pointer" onClick={() => setScreen('landing')}>
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>RETURN</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-cyan-500/60">
                  <User className="w-3.5 h-3.5" />
                </span>
                <input
                  type="text"
                  placeholder="FULL NAME"
                  value={regFullName}
                  onChange={e => setRegFullName(e.target.value)}
                  disabled={status === 'scanning' || status === 'granted'}
                  className="w-full bg-black/50 border border-cyan-500/30 rounded px-3 py-2 pl-9 text-cyan-100 placeholder-cyan-700 focus:outline-none focus:border-cyan-400 text-xs tracking-wider"
                />
              </div>

              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-cyan-500/60">
                  <Terminal className="w-3.5 h-3.5" />
                </span>
                <input
                  type="text"
                  placeholder="USERNAME"
                  value={regUsername}
                  onChange={e => setRegUsername(e.target.value)}
                  disabled={status === 'scanning' || status === 'granted'}
                  className="w-full bg-black/50 border border-cyan-500/30 rounded px-3 py-2 pl-9 text-cyan-100 placeholder-cyan-700 focus:outline-none focus:border-cyan-400 text-xs tracking-wider"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-cyan-500/60">
                  <Mail className="w-3.5 h-3.5" />
                </span>
                <input
                  type="email"
                  placeholder="EMAIL ADDRESS"
                  value={regEmail}
                  onChange={e => setRegEmail(e.target.value)}
                  disabled={status === 'scanning' || status === 'granted'}
                  className="w-full bg-black/50 border border-cyan-500/30 rounded px-3 py-2 pl-9 text-cyan-100 placeholder-cyan-700 focus:outline-none focus:border-cyan-400 text-xs tracking-wider"
                />
              </div>

              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-cyan-500/60">
                  <Phone className="w-3.5 h-3.5" />
                </span>
                <input
                  type="tel"
                  placeholder="PHONE NUMBER"
                  value={regPhone}
                  onChange={e => setRegPhone(e.target.value)}
                  disabled={status === 'scanning' || status === 'granted'}
                  className="w-full bg-black/50 border border-cyan-500/30 rounded px-3 py-2 pl-9 text-cyan-100 placeholder-cyan-700 focus:outline-none focus:border-cyan-400 text-xs tracking-wider"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-cyan-500/60">
                  <Lock className="w-3.5 h-3.5" />
                </span>
                <input
                  type={showRegPassword ? 'text' : 'password'}
                  placeholder="SECURITY CODE"
                  value={regPassword}
                  onChange={e => setRegPassword(e.target.value)}
                  disabled={status === 'scanning' || status === 'granted'}
                  className="w-full bg-black/50 border border-cyan-500/30 rounded px-3 py-2 pl-9 pr-9 text-cyan-100 placeholder-cyan-700 focus:outline-none focus:border-cyan-400 text-xs tracking-wider"
                />
                <button
                  type="button"
                  onClick={() => setShowRegPassword(!showRegPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-cyan-500/60 hover:text-cyan-400 transition"
                >
                  {showRegPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>

              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-cyan-500/60">
                  <Lock className="w-3.5 h-3.5" />
                </span>
                <input
                  type={showRegConfirmPassword ? 'text' : 'password'}
                  placeholder="CONFIRM CODE"
                  value={regConfirmPassword}
                  onChange={e => setRegConfirmPassword(e.target.value)}
                  disabled={status === 'scanning' || status === 'granted'}
                  className="w-full bg-black/50 border border-cyan-500/30 rounded px-3 py-2 pl-9 pr-9 text-cyan-100 placeholder-cyan-700 focus:outline-none focus:border-cyan-400 text-xs tracking-wider"
                />
                <button
                  type="button"
                  onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-cyan-500/60 hover:text-cyan-400 transition"
                >
                  {showRegConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={status === 'scanning' || status === 'granted' || !regFullName || !regUsername || !regEmail || !regPassword || !regConfirmPassword}
              className="w-full bg-cyan-950 border border-cyan-400 text-cyan-400 font-semibold py-2.5 rounded hover:bg-cyan-500 hover:text-black transition duration-300 disabled:opacity-40 text-xs tracking-widest uppercase flex items-center justify-center gap-2"
            >
              <ShieldAlert className="w-4 h-4" />
              ENROLL PROFILE
            </button>
          </form>
        )}

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
          SECURED BY MATRIX INTEGRATION LAYER | SYSTEM PROTOCOL V5
        </div>
      </div>
    </div>
  );
}
