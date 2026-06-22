'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { 
  Mic, MicOff, Cpu, Settings, Terminal, Activity, 
  Volume2, Lock, Play, Plus, Trash2, LogOut, 
  Battery, Monitor, Server, CircleDot, PlayCircle, Send, CheckCircle2, AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface CommandLog {
  id: string;
  text: string;
  intent: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  action: string;
  errorMsg?: string;
  processingTime?: number;
  tokensUsed?: number;
  timestamp: string;
}

interface Workflow {
  id: string;
  name: string;
  description: string;
  triggerPhrase: string;
  steps: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  
  // Connection & stats
  const [socket, setSocket] = useState<Socket | null>(null);
  const [agentOnline, setAgentOnline] = useState(false);
  const [stats, setStats] = useState({
    cpu: 0,
    ram: 0,
    battery: 100,
    activeWindow: 'System Idle'
  });

  // State Management
  const [activeTab, setActiveTab] = useState<'console' | 'automation' | 'settings'>('console');
  const [feedback, setFeedback] = useState('SYSTEM ONLINE. AWAITING ACTIVATION.');
  const [currentSpeech, setCurrentSpeech] = useState('');
  const [voiceState, setVoiceState] = useState<'SLEEPING' | 'LISTENING' | 'PROCESSING' | 'EXECUTING'>('SLEEPING');
  
  // Custom manual commands
  const [manualCommand, setManualCommand] = useState('');
  const [logs, setLogs] = useState<CommandLog[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);

  // Workflow builder state
  const [wfName, setWfName] = useState('');
  const [wfTrigger, setWfTrigger] = useState('');
  const [wfDesc, setWfDesc] = useState('');
  const [wfSteps, setWfSteps] = useState<{ action: string; target?: string; url?: string; value?: string | number }[]>([]);
  const [newStepAction, setNewStepAction] = useState('open-app');
  const [newStepValue, setNewStepValue] = useState('');

  // Speech Recognition refs
  const recognitionRef = useRef<any>(null);
  const [speechSupported, setSpeechSupported] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wakeWordDetectedRef = useRef(false);
  
  // Settings
  const [openaiKey, setOpenaiKey] = useState('');
  const [speechVolume, setSpeechVolume] = useState(1);
  const [speechPitch, setSpeechPitch] = useState(1.0); // Balanced pitch for Thor companion
  const [speechRate, setSpeechRate] = useState(1.0);

  // Authentication check & load settings
  useEffect(() => {
    const savedUser = localStorage.getItem('thor_user');
    if (!savedUser) {
      router.push('/login');
    } else {
      setUser(JSON.parse(savedUser));
    }

    const savedKey = localStorage.getItem('thor_openai_key');
    if (savedKey) {
      setOpenaiKey(savedKey);
    }
  }, [router]);

  // Establish WebSocket Connection
  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'http://localhost:3001';
    const s = io(socketUrl);
    setSocket(s);

    s.on('connect', () => {
      console.log('Frontend connected to server');
      s.emit('register:frontend');
      addConsoleMsg('SECURE SOCKET LINK ESTABLISHED.');
    });

    s.on('agent:status', (data: { online: boolean }) => {
      setAgentOnline(data.online);
      addConsoleMsg(`LOCAL AGENT STATUS: ${data.online ? 'CONNECTED' : 'OFFLINE'}`);
    });

    s.on('stats:update', (data: any) => {
      setStats(data);
    });

    s.on('command:parsed', (data: any) => {
      setVoiceState('PROCESSING');
      setFeedback(`INTENT DETECTED: ${data.parsed.intent.toUpperCase()}`);
      if (data.parsed.speechReply && data.parsed.mode === 'action') {
        // Speak initial action preview e.g. "Sure Rajvardhan. Opening Visual Studio Code now."
        speak(data.parsed.speechReply);
      }
    });

    s.on('command:execution-result', (data: any) => {
      setVoiceState('EXECUTING');
      if (data.success) {
        setFeedback(data.feedback || 'COMMAND COMPLETED.');
        if (data.speechReply) {
          speak(data.speechReply, () => {
            if (!data.isPartial) {
              setVoiceState('SLEEPING');
            }
          });
        } else {
          if (!data.isPartial) {
            setVoiceState('SLEEPING');
          }
        }
      } else {
        setFeedback(`ERROR: ${data.error}`);
        const errText = data.speechReply || `Error: ${data.error}`;
        speak(errText, () => {
          setVoiceState('SLEEPING');
        });
      }
      fetchLogs();
    });

    s.on('workflow:step', (data: any) => {
      setFeedback(`WORKFLOW [${data.name}]: EXEC STEP ${data.currentStep}/${data.totalSteps} (${data.action})`);
    });

    return () => {
      s.disconnect();
    };
  }, []);

  // Fetch API logs & workflows
  const fetchLogs = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/logs');
      const data = await res.json();
      setLogs(data);
    } catch (e) {}
  };

  const fetchWorkflows = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/workflows');
      const data = await res.json();
      setWorkflows(data);
    } catch (e) {}
  };

  useEffect(() => {
    fetchLogs();
    fetchWorkflows();
  }, []);

  const addConsoleMsg = (text: string) => {
    const mockLog: CommandLog = {
      id: Math.random().toString(),
      text: 'SYS_MSG',
      intent: 'SYSTEM',
      status: 'SUCCESS',
      action: text,
      timestamp: new Date().toISOString()
    };
    setLogs(prev => [mockLog, ...prev.slice(0, 49)]);
  };

  // Text to Speech with continuous mic toggling
  const speak = (text: string, onEnd?: () => void) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      // Temporarily stop microphone recognition so it doesn't hear itself speak
      try {
        if (recognitionRef.current) {
          recognitionRef.current.onend = null; // Disable standard continuous end restarts
          recognitionRef.current.stop();
        }
      } catch (e) {}

      window.speechSynthesis.cancel(); // Stop current speech
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.volume = speechVolume;
      utterance.rate = speechRate;
      utterance.pitch = speechPitch;
      
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(v => 
        v.name.includes('Google US English') || 
        v.name.includes('David') || 
        v.name.includes('Male')
      );
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.onend = () => {
        // Re-enable microphone continuous listening
        try {
          if (recognitionRef.current) {
            recognitionRef.current.onend = () => {
              if (voiceState !== 'PROCESSING' && voiceState !== 'EXECUTING') {
                try { recognitionRef.current.start(); } catch (e) {}
              }
            };
            recognitionRef.current.start();
          }
        } catch (e) {}

        if (onEnd) onEnd();
      };

      utterance.onerror = () => {
        // Fallback mic restart on synthesis error
        try {
          if (recognitionRef.current) {
            recognitionRef.current.start();
          }
        } catch (e) {}
        if (onEnd) onEnd();
      };

      window.speechSynthesis.speak(utterance);
    }
  };

  // Continuous speech recognition
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    let commandTimeout: any = null;

    rec.onstart = () => {
      setVoiceState('SLEEPING');
      addConsoleMsg('VOICE RECOGNITION SYSTEM ONLINE.');
    };

    rec.onerror = (e: any) => {
      console.error('Speech recognition error', e);
      if (e.error === 'not-allowed') {
        addConsoleMsg('MICROPHONE ACCESS BLOCKED.');
      }
    };

    rec.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      const activeText = (finalTranscript || interimTranscript).toLowerCase().trim();
      setCurrentSpeech(activeText);

      // Wake Word check: "Thor" (with phonetics: thore, tor, or, for, our)
      let wakeWordIndex = -1;
      let wakeWordLength = 0;
      const wakeWords = ['thor', 'thore', 'tor', 'or', 'for', 'our'];
      
      for (const word of wakeWords) {
        const index = activeText.indexOf(word);
        if (index === 0 || (index > 0 && activeText[index - 1] === ' ')) {
          wakeWordIndex = index;
          wakeWordLength = word.length;
          break;
        }
      }

      if (wakeWordIndex !== -1) {
        const commandText = activeText.substring(wakeWordIndex + wakeWordLength).trim();
        
        // Option A: User spoke wake word + command together in one breath
        if (commandText.length > 2 && finalTranscript) {
          clearTimeout(commandTimeout);
          executeCommand(commandText);
          wakeWordDetectedRef.current = false;
          setCurrentSpeech('');
        } else if (!wakeWordDetectedRef.current) {
          // User spoke wake word alone (greeting phase)
          wakeWordDetectedRef.current = true;
          setVoiceState('LISTENING');
          setFeedback('AWAITING PROTOCOL INSTRUCTIONS...');
          speak('Hello Rajvardhan. How can I help you today?');
          
          if (commandTimeout) clearTimeout(commandTimeout);
          commandTimeout = setTimeout(() => {
            wakeWordDetectedRef.current = false;
            setVoiceState('SLEEPING');
            setFeedback('AWAITING ACTIVATION.');
            setCurrentSpeech('');
          }, 8000);
        }
      } else if (wakeWordDetectedRef.current && finalTranscript && activeText.length > 1) {
        // Option B: Wake word was previously triggered, now user said the follow-up command
        clearTimeout(commandTimeout);
        executeCommand(activeText);
        wakeWordDetectedRef.current = false;
        setCurrentSpeech('');
      }
    };

    rec.onend = () => {
      // Keep listening continuously
      if (voiceState !== 'PROCESSING' && voiceState !== 'EXECUTING') {
        try { rec.start(); } catch (e) {}
      }
    };

    recognitionRef.current = rec;
    
    // Start listening on mount
    try {
      rec.start();
    } catch(e) {}

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      }
    };
  }, []);

  const executeCommand = (command: string) => {
    if (!socket) return;
    setVoiceState('PROCESSING');
    setFeedback(`SENDING INSTRUCTION: "${command.toUpperCase()}"`);
    socket.emit('command:voice', {
      text: command,
      username: user?.username || 'admin',
      apiKey: openaiKey
    });
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCommand.trim()) return;
    executeCommand(manualCommand);
    setManualCommand('');
  };

  // HTML5 Canvas AI Core Visualizer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let particles: { x: number; y: number; r: number; angle: number; speed: number; dist: number }[] = [];
    const maxParticles = 60;

    // Initialize particles
    for (let i = 0; i < maxParticles; i++) {
      particles.push({
        x: 0,
        y: 0,
        r: Math.random() * 2 + 1,
        angle: Math.random() * Math.PI * 2,
        speed: (Math.random() * 0.02 + 0.005),
        dist: Math.random() * 80 + 30
      });
    }

    const resizeCanvas = () => {
      canvas.width = 300;
      canvas.height = 300;
    };
    resizeCanvas();

    let rotation = 0;
    let pulse = 0;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      // Adjust animation speed based on THOR state
      let pulseSpeed = 0.05;
      let particleSpeedMultiplier = 1;
      let coreColor = 'rgba(0, 240, 255, '; // Cyan

      if (voiceState === 'LISTENING') {
        pulseSpeed = 0.15;
        particleSpeedMultiplier = 2.5;
        coreColor = 'rgba(234, 179, 8, '; // Yellow
      } else if (voiceState === 'PROCESSING') {
        pulseSpeed = 0.25;
        particleSpeedMultiplier = 4;
        coreColor = 'rgba(189, 0, 255, '; // Purple
      } else if (voiceState === 'EXECUTING') {
        pulseSpeed = 0.3;
        particleSpeedMultiplier = 5;
        coreColor = 'rgba(16, 185, 129, '; // Emerald
      }

      pulse += pulseSpeed;
      rotation += 0.005 * particleSpeedMultiplier;

      // Draw glowing background radial gradient
      const glowGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, 140);
      glowGrad.addColorStop(0, coreColor + '0.15)');
      glowGrad.addColorStop(1, 'rgba(3, 7, 18, 0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, 140, 0, Math.PI * 2);
      ctx.fill();

      // Draw Rotating outer ring
      ctx.strokeStyle = coreColor + '0.2)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 110, 0, Math.PI * 2);
      ctx.stroke();

      // Draw segmented Outer ring
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);
      ctx.strokeStyle = coreColor + '0.6)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, 100, i * Math.PI / 2 + 0.2, (i + 1) * Math.PI / 2 - 0.2);
        ctx.stroke();
      }
      ctx.restore();

      // Draw segmented Inner ring
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-rotation * 1.5);
      ctx.strokeStyle = coreColor + '0.8)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 8; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, 85, i * Math.PI / 4 + 0.1, (i + 1) * Math.PI / 4 - 0.1);
        ctx.stroke();
      }
      ctx.restore();

      // Draw Pulsing Core Orb
      const pulseRadius = 55 + Math.sin(pulse) * 4;
      const coreGrad = ctx.createRadialGradient(cx, cy, 5, cx, cy, pulseRadius);
      coreGrad.addColorStop(0, '#ffffff');
      coreGrad.addColorStop(0.2, coreColor + '1)');
      coreGrad.addColorStop(0.8, coreColor + '0.4)');
      coreGrad.addColorStop(1, 'rgba(0,0,0,0)');
      
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, pulseRadius, 0, Math.PI * 2);
      ctx.fill();

      // Draw orbital particles
      particles.forEach((p) => {
        p.angle += p.speed * particleSpeedMultiplier;
        p.x = cx + Math.cos(p.angle) * p.dist;
        p.y = cy + Math.sin(p.angle) * p.dist;

        ctx.fillStyle = coreColor + (0.3 + Math.random() * 0.7) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();

        // Subtle connectors to center
        if (Math.random() > 0.98 && voiceState !== 'SLEEPING') {
          ctx.strokeStyle = coreColor + '0.15)';
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
      });

      // Central core text info
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = '10px Share Tech Mono';
      ctx.textAlign = 'center';
      ctx.fillText(voiceState, cx, cy + 4);

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [voiceState]);

  // Handle building workflows
  const addStepToWf = () => {
    if (!newStepValue && newStepAction !== 'screenshot' && newStepAction !== 'lock' && newStepAction !== 'shutdown' && newStepAction !== 'restart') return;
    
    let stepObj: any = { action: newStepAction };
    if (newStepAction === 'open-app' || newStepAction === 'close-app') {
      stepObj.target = newStepValue;
    } else if (newStepAction === 'open-url') {
      stepObj.url = newStepValue;
    } else if (newStepAction === 'volume') {
      stepObj.value = isNaN(parseInt(newStepValue)) ? newStepValue : parseInt(newStepValue);
    }
    
    setWfSteps([...wfSteps, stepObj]);
    setNewStepValue('');
  };

  const saveWorkflow = async () => {
    if (!wfName || !wfTrigger || wfSteps.length === 0) return;
    
    try {
      const res = await fetch('http://localhost:3001/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: wfName,
          description: wfDesc,
          triggerPhrase: wfTrigger,
          steps: wfSteps
        })
      });
      if (res.ok) {
        addConsoleMsg(`NEW WORKFLOW "${wfName.toUpperCase()}" CREATED.`);
        setWfName('');
        setWfTrigger('');
        setWfDesc('');
        setWfSteps([]);
        fetchWorkflows();
      }
    } catch (e) {}
  };

  const handleLogout = () => {
    localStorage.removeItem('thor_user');
    router.push('/login');
  };

  return (
    <div className="relative min-h-screen bg-gray-950 text-cyan-400 p-4 font-mono select-none overflow-hidden flex flex-col justify-between">
      {/* Sci-Fi HUD Background Elements */}
      <div className="hud-grid"></div>
      <div className="scanlines"></div>
      <div className="scanner-bar"></div>

      {/* Top Banner HUD */}
      <header className="relative z-10 flex justify-between items-center border-b border-cyan-500/20 pb-3 text-xs tracking-wider text-cyan-500/80">
        <div className="flex items-center gap-3">
          <div className="relative flex h-3 w-3">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${agentOnline ? 'bg-cyan-400' : 'bg-red-500'}`}></span>
            <span className={`relative inline-flex rounded-full h-3 w-3 ${agentOnline ? 'bg-cyan-500' : 'bg-red-600'}`}></span>
          </div>
          <span className="font-orbitron font-bold">THOR COMMAND HUD</span>
          <span className="px-2 py-0.5 border border-cyan-500/30 rounded text-[9px]">SECURITY LEVEL: ALPHA</span>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Monitor className="w-3 h-3" />
            <span className="text-[10px] text-cyan-200">{stats.activeWindow}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5" />
            <span>PORT 3001: ONLINE</span>
          </div>
          <button 
            onClick={handleLogout} 
            className="flex items-center gap-1 hover:text-red-400 hover:border-red-400/40 border border-transparent rounded px-1.5 py-0.5 transition"
          >
            <LogOut className="w-3 h-3" />
            <span>TERMINATE</span>
          </button>
        </div>
      </header>

      {/* Main Grid Content */}
      <main className="relative z-10 grid grid-cols-12 gap-4 my-4 flex-1">
        
        {/* Left column: System stats & Quick Controls */}
        <section className="col-span-12 md:col-span-3 flex flex-col gap-4">
          
          {/* System Monitor Panel */}
          <div className="glass-panel p-4 rounded border border-cyan-500/20 relative flex-1 flex flex-col justify-between">
            <div className="flex items-center gap-2 border-b border-cyan-500/20 pb-2 mb-3">
              <Activity className="w-4 h-4 text-cyan-500 animate-pulse" />
              <h2 className="text-xs uppercase font-semibold text-cyan-300">System Diagnostics</h2>
            </div>

            {/* Stats list */}
            <div className="space-y-4 my-2 flex-1 flex flex-col justify-around">
              {/* CPU */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="flex items-center gap-1"><Cpu className="w-3 h-3" /> CPU UTILIZATION</span>
                  <span className="text-cyan-200">{stats.cpu}%</span>
                </div>
                <div className="w-full bg-cyan-950/50 rounded-full h-1.5 border border-cyan-500/20">
                  <div 
                    className="bg-cyan-400 h-1.5 rounded-full shadow-[0_0_8px_var(--thor-blue)] transition-all duration-300"
                    style={{ width: `${stats.cpu}%` }}
                  ></div>
                </div>
              </div>

              {/* RAM */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="flex items-center gap-1"><CircleDot className="w-3 h-3" /> RAM COMMITMENT</span>
                  <span className="text-cyan-200">{stats.ram}%</span>
                </div>
                <div className="w-full bg-cyan-950/50 rounded-full h-1.5 border border-cyan-500/20">
                  <div 
                    className="bg-purple-500 h-1.5 rounded-full shadow-[0_0_8px_var(--thor-purple)] transition-all duration-300"
                    style={{ width: `${stats.ram}%` }}
                  ></div>
                </div>
              </div>

              {/* Battery */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="flex items-center gap-1"><Battery className="w-3.5 h-3.5" /> POWER RESERVES</span>
                  <span className="text-cyan-200">{stats.battery}%</span>
                </div>
                <div className="w-full bg-cyan-950/50 rounded-full h-1.5 border border-cyan-500/20">
                  <div 
                    className="bg-emerald-500 h-1.5 rounded-full shadow-[0_0_8px_#10b981] transition-all duration-300"
                    style={{ width: `${stats.battery}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {/* System Status message */}
            <div className="text-[10px] text-cyan-500/60 border-t border-cyan-500/10 pt-2 flex items-center justify-between">
              <span>AGENTS ACTIVE: 6/6</span>
              <span>HOST: WINDOWS CLIENT</span>
            </div>
          </div>

          {/* Quick System Action panel */}
          <div className="glass-panel p-4 rounded border border-cyan-500/20 flex flex-col justify-between">
            <div className="flex items-center gap-2 border-b border-cyan-500/20 pb-2 mb-3">
              <Lock className="w-4 h-4 text-cyan-500" />
              <h2 className="text-xs uppercase font-semibold text-cyan-300">Quick Commands</h2>
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button 
                onClick={() => executeCommand('lock my pc')}
                className="py-2 border border-cyan-500/30 bg-cyan-950/30 rounded hover:bg-cyan-500 hover:text-black transition flex items-center justify-center gap-1"
              >
                <Lock className="w-3.5 h-3.5" /> LOCK HOST
              </button>
              <button 
                onClick={() => executeCommand('take a screenshot')}
                className="py-2 border border-cyan-500/30 bg-cyan-950/30 rounded hover:bg-cyan-500 hover:text-black transition flex items-center justify-center gap-1"
              >
                <Monitor className="w-3.5 h-3.5" /> SCREENSHOT
              </button>
              <button 
                onClick={() => executeCommand('mute')}
                className="py-2 border border-cyan-500/30 bg-cyan-950/30 rounded hover:bg-cyan-500 hover:text-black transition flex items-center justify-center gap-1"
              >
                <Volume2 className="w-3.5 h-3.5" /> MUTE SYSTEM
              </button>
              <button 
                onClick={() => executeCommand('open chrome')}
                className="py-2 border border-cyan-500/30 bg-cyan-950/30 rounded hover:bg-cyan-500 hover:text-black transition flex items-center justify-center gap-1"
              >
                <PlayCircle className="w-3.5 h-3.5" /> RUN CHROME
              </button>
            </div>
          </div>

        </section>

        {/* Center: Animated AI Core & Audio wave HUD */}
        <section className="col-span-12 md:col-span-6 flex flex-col justify-between items-center glass-panel p-6 rounded border border-cyan-500/20 relative">
          {/* Top layout corners */}
          <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-cyan-400"></div>
          <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-cyan-400"></div>
          <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-cyan-400"></div>
          <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-cyan-400"></div>

          {/* THOR Core Visualizer */}
          <div className="relative flex-1 flex items-center justify-center w-full min-h-[300px]">
            <canvas ref={canvasRef} className="ai-core-glow rounded-full" />
            
            {/* Listening state circle indicator */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className={`w-[260px] h-[260px] rounded-full border border-dashed transition-all duration-1000 ${
                voiceState === 'LISTENING' ? 'border-yellow-500/60 animate-spin-slow' :
                voiceState === 'PROCESSING' ? 'border-purple-500/60 animate-ping' :
                voiceState === 'EXECUTING' ? 'border-emerald-500/60' :
                'border-cyan-500/20'
              }`}></div>
            </div>
          </div>

          {/* Feedback & Recognition Panel */}
          <div className="w-full text-center mt-4">
            {/* Live speech feedback */}
            <div className="h-6 text-sm text-cyan-300 font-bold uppercase mb-2 tracking-wider flex items-center justify-center gap-2">
              {voiceState === 'LISTENING' && <span className="inline-block w-2.5 h-2.5 bg-yellow-500 rounded-full animate-ping"></span>}
              {voiceState === 'PROCESSING' && <span className="inline-block w-2.5 h-2.5 bg-purple-500 rounded-full animate-pulse"></span>}
              {currentSpeech ? `"${currentSpeech.toUpperCase()}"` : `STATE: ${voiceState}`}
            </div>

            {/* Action Response Text */}
            <div className="bg-black/60 border border-cyan-500/30 rounded-lg p-3 min-h-[60px] flex items-center justify-center relative shadow-[0_0_15px_rgba(0,240,255,0.05)]">
              <span className="text-xs uppercase text-cyan-100 tracking-widest leading-relaxed">
                {feedback}
              </span>
            </div>

            {/* Wake Word indicator */}
            <div className="flex justify-center gap-8 text-[9px] text-cyan-600/70 mt-3 font-semibold">
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${voiceState === 'LISTENING' ? 'bg-yellow-400 shadow-[0_0_4px_#fbbf24]' : 'bg-cyan-900'}`}></div>
                <span>SPEECH DETECTED</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${speechSupported ? 'bg-cyan-400' : 'bg-red-600'}`}></div>
                <span>WAKE WORD WIDEBAND [THOR]</span>
              </div>
            </div>
          </div>
        </section>

        {/* Right column: HUD Tabbed Panel (Console Logs, Automation builder, settings) */}
        <section className="col-span-12 md:col-span-3 flex flex-col glass-panel rounded border border-cyan-500/20 relative">
          
          {/* Tabs navigation */}
          <div className="flex border-b border-cyan-500/20 text-[10px] uppercase font-bold tracking-widest text-center">
            <button 
              onClick={() => setActiveTab('console')}
              className={`flex-1 py-3 border-r border-cyan-500/10 flex items-center justify-center gap-1 transition ${activeTab === 'console' ? 'bg-cyan-950/40 text-cyan-300 border-b-2 border-b-cyan-400' : 'text-cyan-500/60 hover:text-cyan-300'}`}
            >
              <Terminal className="w-3.5 h-3.5" /> TIMELINE
            </button>
            <button 
              onClick={() => setActiveTab('automation')}
              className={`flex-1 py-3 border-r border-cyan-500/10 flex items-center justify-center gap-1 transition ${activeTab === 'automation' ? 'bg-cyan-950/40 text-cyan-300 border-b-2 border-b-cyan-400' : 'text-cyan-500/60 hover:text-cyan-300'}`}
            >
              <Play className="w-3.5 h-3.5" /> FLOW
            </button>
            <button 
              onClick={() => setActiveTab('settings')}
              className={`flex-1 py-3 flex items-center justify-center gap-1 transition ${activeTab === 'settings' ? 'bg-cyan-950/40 text-cyan-300 border-b-2 border-b-cyan-400' : 'text-cyan-500/60 hover:text-cyan-300'}`}
            >
              <Settings className="w-3.5 h-3.5" /> SYSTEM
            </button>
          </div>

          {/* Tab content panel */}
          <div className="flex-1 p-3 overflow-y-auto max-h-[460px] relative">
            <AnimatePresence mode="wait">
              {activeTab === 'console' && (
                <motion.div
                  key="console"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-2 h-full flex flex-col justify-between"
                >
                  {/* Console Logs list */}
                  <div className="space-y-2 overflow-y-auto max-h-[360px] pr-1">
                    {logs.map((log) => (
                      <div 
                        key={log.id} 
                        className={`text-[10px] p-2 rounded border bg-black/40 ${
                          log.text === 'SYS_MSG' ? 'border-cyan-500/10 text-cyan-500/70' :
                          log.status === 'SUCCESS' ? 'border-emerald-500/20 text-emerald-400' : 
                          log.status === 'FAILED' ? 'border-red-500/20 text-red-400' : 
                          'border-yellow-500/20 text-yellow-300'
                        }`}
                      >
                        <div className="flex justify-between font-semibold border-b border-white/5 pb-1 mb-1 text-[9px]">
                          <span>INTENT: {log.intent.toUpperCase()}</span>
                          <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <div className="break-words">
                          {log.text !== 'SYS_MSG' && <span className="text-cyan-300/80">Spoken: </span>}
                          {log.text === 'SYS_MSG' ? log.action : log.text}
                        </div>
                        {log.text !== 'SYS_MSG' && (
                          <div className="mt-1 flex items-center justify-between text-[9px] opacity-75">
                            <span>Action: {log.action}</span>
                            <span className="flex items-center gap-0.5">
                              {log.status === 'SUCCESS' && <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />}
                              {log.status === 'FAILED' && <AlertCircle className="w-2.5 h-2.5 text-red-500" />}
                              {log.status}
                            </span>
                          </div>
                        )}
                        {log.errorMsg && (
                          <div className="text-red-500 mt-0.5 text-[9px] border-t border-red-500/10 pt-0.5">
                            Error: {log.errorMsg}
                          </div>
                        )}
                        {log.text !== 'SYS_MSG' && (log.processingTime !== undefined || log.tokensUsed !== undefined) && (
                          <div className="mt-1.5 text-[8px] text-cyan-500/50 border-t border-cyan-500/10 pt-1 flex justify-between font-mono">
                            {log.processingTime ? <span>LATENCY: {(log.processingTime / 1000).toFixed(2)}s</span> : <span></span>}
                            {log.tokensUsed ? <span>TOKENS: {log.tokensUsed}</span> : <span></span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Manual input prompt */}
                  <form onSubmit={handleManualSubmit} className="mt-4 border-t border-cyan-500/25 pt-3">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="ENTER DIRECT ACCESS COMMAND..."
                        value={manualCommand}
                        onChange={e => setManualCommand(e.target.value)}
                        className="w-full bg-black/60 border border-cyan-500/30 rounded px-2.5 py-1.5 pr-8 text-cyan-200 placeholder-cyan-700/60 focus:outline-none focus:border-cyan-400 text-[10px]"
                      />
                      <button 
                        type="submit" 
                        className="absolute right-1 top-1 p-1 hover:text-white text-cyan-500 transition"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}

              {activeTab === 'automation' && (
                <motion.div
                  key="automation"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  {/* Workflow list */}
                  <div className="space-y-2">
                    <h3 className="text-xs uppercase font-semibold text-cyan-300 border-b border-cyan-500/10 pb-1 mb-2">Macro Workflows</h3>
                    {workflows.map((wf) => (
                      <div key={wf.id} className="p-2 border border-cyan-500/20 bg-black/40 rounded flex items-center justify-between">
                        <div className="flex-1 min-w-0 pr-2">
                          <div className="font-semibold text-xs text-cyan-200 truncate">{wf.name}</div>
                          <div className="text-[9px] text-cyan-600 truncate">"{wf.triggerPhrase}"</div>
                        </div>
                        <button 
                          onClick={() => executeCommand(wf.triggerPhrase)}
                          className="p-1.5 border border-cyan-500/30 bg-cyan-950/20 hover:bg-cyan-500 hover:text-black rounded text-[10px] flex items-center gap-1 transition"
                        >
                          <PlayCircle className="w-3.5 h-3.5" /> RUN
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Workflow builder */}
                  <div className="border border-cyan-500/20 bg-black/40 rounded p-3 text-xs space-y-3">
                    <h3 className="font-semibold text-cyan-300 uppercase pb-1 border-b border-cyan-500/10">Creator Engine</h3>
                    <div>
                      <input 
                        type="text" 
                        placeholder="Macro Name" 
                        value={wfName}
                        onChange={e => setWfName(e.target.value)}
                        className="w-full bg-black/60 border border-cyan-500/25 rounded px-2 py-1 text-cyan-200 text-[10px] focus:outline-none mb-1.5"
                      />
                      <input 
                        type="text" 
                        placeholder="Voice Trigger Phrase" 
                        value={wfTrigger}
                        onChange={e => setWfTrigger(e.target.value)}
                        className="w-full bg-black/60 border border-cyan-500/25 rounded px-2 py-1 text-cyan-200 text-[10px] focus:outline-none"
                      />
                    </div>

                    {/* Step builder */}
                    <div className="space-y-1.5 border-t border-cyan-500/10 pt-2">
                      <div className="text-[10px] text-cyan-500">Macro steps ({wfSteps.length})</div>
                      <div className="space-y-1 max-h-20 overflow-y-auto pr-1">
                        {wfSteps.map((st, i) => (
                          <div key={i} className="flex justify-between items-center text-[9px] bg-black/30 p-1 border border-cyan-500/10 rounded">
                            <span className="truncate">{i+1}. {st.action} ({st.target || st.url || st.value})</span>
                            <button onClick={() => setWfSteps(wfSteps.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-300">
                              <Trash2 className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* Add step input */}
                      <div className="flex gap-1.5 items-center">
                        <select 
                          value={newStepAction}
                          onChange={e => setNewStepAction(e.target.value)}
                          className="bg-black border border-cyan-500/30 rounded text-[9px] p-1 text-cyan-300"
                        >
                          <option value="open-app">Open App</option>
                          <option value="close-app">Close App</option>
                          <option value="open-url">Open URL</option>
                          <option value="volume">Set Volume</option>
                          <option value="screenshot">Screenshot</option>
                          <option value="lock">Lock Host</option>
                        </select>
                        
                        {newStepAction !== 'screenshot' && newStepAction !== 'lock' && (
                          <input 
                            type="text" 
                            placeholder="Val / Target"
                            value={newStepValue}
                            onChange={e => setNewStepValue(e.target.value)}
                            className="flex-1 bg-black border border-cyan-500/30 rounded text-[9px] p-1 text-cyan-100"
                          />
                        )}
                        
                        <button 
                          onClick={addStepToWf}
                          className="p-1 border border-cyan-500/30 hover:border-cyan-400 text-cyan-300 rounded hover:bg-cyan-500 hover:text-black transition"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <button 
                      onClick={saveWorkflow}
                      disabled={!wfName || !wfTrigger || wfSteps.length === 0}
                      className="w-full bg-cyan-950 border border-cyan-400 text-cyan-400 font-bold py-1.5 rounded hover:bg-cyan-500 hover:text-black text-[10px] tracking-wider uppercase transition disabled:opacity-40"
                    >
                      COMPILE WORKFLOW
                    </button>
                  </div>
                </motion.div>
              )}

              {activeTab === 'settings' && (
                <motion.div
                  key="settings"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4 text-xs"
                >
                  <h3 className="text-xs uppercase font-semibold text-cyan-300 border-b border-cyan-500/10 pb-1">AI Cognitive Keys</h3>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] text-cyan-600 mb-1">OPENAI API KEY</label>
                      <input 
                        type="password" 
                        placeholder="Paste OpenAI API Key..." 
                        value={openaiKey}
                        onChange={e => {
                          const val = e.target.value;
                          setOpenaiKey(val);
                          localStorage.setItem('thor_openai_key', val);
                        }}
                        className="w-full bg-black/60 border border-cyan-500/30 rounded px-2.5 py-1.5 text-cyan-200 placeholder-cyan-700/60 focus:outline-none focus:border-cyan-400 text-[10px]"
                      />
                      <p className="text-[8px] text-cyan-600 mt-1">Key is stored locally and used for real-time cognitive reasoning.</p>
                    </div>

                    <h3 className="text-xs uppercase font-semibold text-cyan-300 border-b border-cyan-500/10 pb-1 mt-4">Vocal Synthesis</h3>
                    
                    {/* Volume */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-1">
                        <span>VOLUME</span>
                        <span>{Math.round(speechVolume * 100)}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="1" 
                        step="0.1" 
                        value={speechVolume}
                        onChange={e => setSpeechVolume(parseFloat(e.target.value))}
                        className="w-full accent-cyan-400 h-1 bg-cyan-950 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Speed/Rate */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-1">
                        <span>CADENCE RATE</span>
                        <span>{speechRate.toFixed(2)}x</span>
                      </div>
                      <input 
                        type="range" 
                        min="0.5" 
                        max="2" 
                        step="0.05" 
                        value={speechRate}
                        onChange={e => setSpeechRate(parseFloat(e.target.value))}
                        className="w-full accent-cyan-400 h-1 bg-cyan-950 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Pitch */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-1">
                        <span>PITCH RESONANCE</span>
                        <span>{speechPitch.toFixed(2)}Hz</span>
                      </div>
                      <input 
                        type="range" 
                        min="0.5" 
                        max="2" 
                        step="0.05" 
                        value={speechPitch}
                        onChange={e => setSpeechPitch(parseFloat(e.target.value))}
                        className="w-full accent-cyan-400 h-1 bg-cyan-950 rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

      </main>

      {/* Screen corners / Border footer info */}
      <footer className="relative z-10 border-t border-cyan-500/20 pt-2 text-[9px] text-cyan-600/70 flex justify-between uppercase">
        <span>CORE RESONANCE: STABLE (99.8%)</span>
        <span>Awaiting vocal prompt... Speak "Thor..."</span>
        <span>Matrix Grid coordinates: Z-744</span>
      </footer>
    </div>
  );
}
