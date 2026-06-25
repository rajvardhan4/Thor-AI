'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { 
  Mic, MicOff, Cpu, Settings, Terminal, Activity, 
  Volume2, Lock, Play, Plus, Trash2, LogOut, 
  Battery, Monitor, Server, CircleDot, PlayCircle, Send, CheckCircle2, AlertCircle, ShieldAlert
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
  const [feedback, setFeedback] = useState('SYSTEM ONLINE. AWAITING ACTIVATION.');
  const [currentSpeech, setCurrentSpeech] = useState('');
  const [voiceState, setVoiceState] = useState<'SLEEPING' | 'LISTENING' | 'PROCESSING' | 'EXECUTING'>('SLEEPING');
  
  // Dialog States
  const [permissionOpen, setPermissionOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<any>(null);
  const [confirmMessage, setConfirmMessage] = useState('');

  // Pipeline Status Tracker: Listen -> Understand -> Think -> Respond -> Execute -> Verify -> Report
  const [activePipelineStep, setActivePipelineStep] = useState<string>('Report'); 

  // Chat History
  const [messages, setMessages] = useState<{ sender: 'user' | 'thor'; text: string; time: string }[]>([]);

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
  const [speechPitch, setSpeechPitch] = useState(1.0); 
  const [speechRate, setSpeechRate] = useState(1.0);

  // Authentication check & load settings
  useEffect(() => {
    const savedUser = localStorage.getItem('thor_user');
    if (!savedUser) {
      router.push('/login');
    } else {
      const parsedUser = JSON.parse(savedUser);
      setUser(parsedUser);
      // Seed initial greeting
      setMessages([
        { 
          sender: 'thor', 
          text: `Welcome Back, ${parsedUser.fullName}. Your Personal AI Assistant Is Ready.`, 
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
        }
      ]);
    }

    const savedKey = localStorage.getItem('thor_openai_key');
    if (savedKey) {
      setOpenaiKey(savedKey);
    }
  }, [router]);

  const getBackendUrl = () => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'http://localhost:3001';
    return socketUrl.endsWith('/') ? socketUrl.slice(0, -1) : socketUrl;
  };

  // Establish WebSocket Connection
  useEffect(() => {
    const socketUrl = getBackendUrl();
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
      setActivePipelineStep('Understand');
      setFeedback(`INTENT DETECTED: ${data.parsed.intent.toUpperCase()}`);
      
      // Update chat history with user spoken message
      setMessages(prev => [
        ...prev, 
        { sender: 'user', text: data.text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
      ]);

      // Check for permission constraints before execution
      if (data.parsed.mode === 'action') {
        const isPermissionRequired = !user?.desktopAutomationGranted;
        const sensitiveAction = data.parsed.plan.find((step: any) => 
          step.action === 'shutdown' || 
          step.action === 'restart' || 
          (step.action === 'file' && (step.parameters?.operation === 'delete' || step.parameters?.operation === 'clean-downloads'))
        );

        if (isPermissionRequired) {
          // Open permission request dialogue
          setPendingPayload(data);
          setPermissionOpen(true);
          setVoiceState('SLEEPING');
          speak("To perform desktop automation, I need permission to control your local computer. Would you like to allow access?");
          return;
        }

        if (sensitiveAction) {
          // Open confirmation dialogue for sensitive tasks
          setPendingPayload(data);
          setConfirmMessage(`I am about to execute a sensitive action: ${sensitiveAction.action.toUpperCase()}. Do you want to proceed?`);
          setConfirmOpen(true);
          setVoiceState('SLEEPING');
          speak(`I require verification before executing this sensitive ${sensitiveAction.action} protocol. Please confirm.`);
          return;
        }

        // Proceed directly
        executeParsedAction(data);
      } else {
        // Conversation mode
        executeParsedAction(data);
      }
    });

    s.on('command:execution-result', (data: any) => {
      setVoiceState('EXECUTING');
      setActivePipelineStep('Execute');
      
      if (data.success) {
        setFeedback(data.feedback || 'COMMAND COMPLETED.');
        if (data.speechReply) {
          // Add Thor response to chat history
          setMessages(prev => [
            ...prev,
            { sender: 'thor', text: data.speechReply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
          ]);
          
          setActivePipelineStep('Respond');
          speak(data.speechReply, () => {
            setActivePipelineStep('Verify');
            setTimeout(() => {
              setActivePipelineStep('Report');
              if (!data.isPartial) {
                setVoiceState('SLEEPING');
                setFeedback('AWAITING PROTOCOL INSTRUCTIONS...');
              }
            }, 1000);
          });
        } else {
          setActivePipelineStep('Verify');
          setTimeout(() => {
            setActivePipelineStep('Report');
            if (!data.isPartial) {
              setVoiceState('SLEEPING');
              setFeedback('AWAITING PROTOCOL INSTRUCTIONS...');
            }
          }, 1000);
        }
      } else {
        setFeedback(`ERROR: ${data.error}`);
        const errText = data.speechReply || `Error: ${data.error}`;
        setMessages(prev => [
          ...prev,
          { sender: 'thor', text: errText, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
        ]);
        
        speak(errText, () => {
          setVoiceState('SLEEPING');
          setActivePipelineStep('Report');
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
  }, [user]);

  // Execute actual command payload
  const executeParsedAction = (payload: any) => {
    if (!socket) return;
    setActivePipelineStep('Think');
    
    // Play initial response preview if specified
    if (payload.parsed.speechReply && payload.parsed.mode === 'action') {
      speak(payload.parsed.speechReply);
      setMessages(prev => [
        ...prev,
        { sender: 'thor', text: payload.parsed.speechReply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
      ]);
    }
    
    socket.emit('command:voice', {
      text: payload.text,
      username: user?.username || 'admin',
      apiKey: openaiKey,
      skipParsing: true, 
      preParsed: payload.parsed
    });
  };

  // Grant desktop automation permission
  const handleGrantPermission = async () => {
    if (!user) return;
    setPermissionOpen(false);

    try {
      const res = await fetch(`${getBackendUrl()}/api/user/permissions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, granted: true })
      });
      const data = await res.json();

      if (data.success) {
        const updatedUser = { ...user, desktopAutomationGranted: true };
        setUser(updatedUser);
        localStorage.setItem('thor_user', JSON.stringify(updatedUser));
        addConsoleMsg('DESKTOP AUTOMATION ACCESS GRANTED.');
        
        if (pendingPayload) {
          executeParsedAction(pendingPayload);
          setPendingPayload(null);
        }
      }
    } catch (e) {
      addConsoleMsg('FAILED TO UPDATE SYSTEM PERMISSIONS.');
    }
  };

  // Revoke desktop automation permission
  const handleRevokePermission = async () => {
    if (!user) return;
    
    try {
      const res = await fetch(`${getBackendUrl()}/api/user/permissions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, granted: false })
      });
      const data = await res.json();

      if (data.success) {
        const updatedUser = { ...user, desktopAutomationGranted: false };
        setUser(updatedUser);
        localStorage.setItem('thor_user', JSON.stringify(updatedUser));
        addConsoleMsg('DESKTOP AUTOMATION ACCESS REVOKED.');
      }
    } catch (e) {
      addConsoleMsg('FAILED TO REVOKE SYSTEM PERMISSIONS.');
    }
  };

  // Confirm sensitive action execution
  const handleConfirmAction = () => {
    setConfirmOpen(false);
    if (pendingPayload) {
      executeParsedAction(pendingPayload);
      setPendingPayload(null);
    }
  };

  // Cancel pending dialogue actions
  const handleCancelDialog = () => {
    setPermissionOpen(false);
    setConfirmOpen(false);
    setPendingPayload(null);
    setVoiceState('SLEEPING');
    speak("Action aborted.");
  };

  // Fetch API logs & workflows
  const fetchLogs = async () => {
    try {
      const res = await fetch(`${getBackendUrl()}/api/logs`);
      const data = await res.json();
      setLogs(data);
    } catch (e) {}
  };

  const fetchWorkflows = async () => {
    try {
      const res = await fetch(`${getBackendUrl()}/api/workflows`);
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
      try {
        if (recognitionRef.current) {
          recognitionRef.current.onend = null; 
          recognitionRef.current.stop();
        }
      } catch (e) {}

      window.speechSynthesis.cancel(); 
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

      // Wake Word check: "Thor"
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
        
        if (commandText.length > 2 && finalTranscript) {
          clearTimeout(commandTimeout);
          executeCommand(commandText);
          wakeWordDetectedRef.current = false;
          setCurrentSpeech('');
        } else if (!wakeWordDetectedRef.current) {
          wakeWordDetectedRef.current = true;
          setVoiceState('LISTENING');
          setActivePipelineStep('Listen');
          setFeedback('AWAITING PROTOCOL INSTRUCTIONS...');
          
          const helloReply = `Hello ${user?.fullName || 'Rajvardhan'}. How can I assist you today?`;
          setMessages(prev => [
            ...prev,
            { sender: 'thor', text: helloReply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
          ]);
          speak(helloReply);
          
          if (commandTimeout) clearTimeout(commandTimeout);
          commandTimeout = setTimeout(() => {
            wakeWordDetectedRef.current = false;
            setVoiceState('SLEEPING');
            setActivePipelineStep('Report');
            setFeedback('AWAITING ACTIVATION.');
            setCurrentSpeech('');
          }, 8000);
        }
      } else if (wakeWordDetectedRef.current && finalTranscript && activeText.length > 1) {
        clearTimeout(commandTimeout);
        executeCommand(activeText);
        wakeWordDetectedRef.current = false;
        setCurrentSpeech('');
      }
    };

    rec.onend = () => {
      if (voiceState !== 'PROCESSING' && voiceState !== 'EXECUTING') {
        try { rec.start(); } catch (e) {}
      }
    };

    recognitionRef.current = rec;
    
    try {
      rec.start();
    } catch(e) {}

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      }
    };
  }, [user, voiceState]);

  const executeCommand = (command: string) => {
    if (!socket) return;
    setVoiceState('PROCESSING');
    setActivePipelineStep('Understand');
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
      canvas.width = 240;
      canvas.height = 240;
    };
    resizeCanvas();

    let rotation = 0;
    let pulse = 0;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      let pulseSpeed = 0.05;
      let particleSpeedMultiplier = 1;
      let coreColor = 'rgba(0, 240, 255, '; 

      if (permissionOpen) {
        coreColor = 'rgba(59, 130, 246, '; 
        pulseSpeed = 0.1;
      } else if (confirmOpen) {
        coreColor = 'rgba(239, 68, 68, '; 
        pulseSpeed = 0.15;
      } else if (voiceState === 'LISTENING') {
        pulseSpeed = 0.15;
        particleSpeedMultiplier = 2.5;
        coreColor = 'rgba(234, 179, 8, '; 
      } else if (voiceState === 'PROCESSING') {
        pulseSpeed = 0.25;
        particleSpeedMultiplier = 4;
        coreColor = 'rgba(168, 85, 247, '; 
      } else if (voiceState === 'EXECUTING') {
        pulseSpeed = 0.3;
        particleSpeedMultiplier = 5;
        coreColor = 'rgba(16, 185, 129, '; 
      }

      pulse += pulseSpeed;
      rotation += 0.005 * particleSpeedMultiplier;

      const glowGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 110);
      glowGrad.addColorStop(0, coreColor + '0.18)');
      glowGrad.addColorStop(1, 'rgba(3, 7, 18, 0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, 110, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = coreColor + '0.2)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 90, 0, Math.PI * 2);
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);
      ctx.strokeStyle = coreColor + '0.6)';
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, 80, i * Math.PI / 2 + 0.2, (i + 1) * Math.PI / 2 - 0.2);
        ctx.stroke();
      }
      ctx.restore();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-rotation * 1.3);
      ctx.strokeStyle = coreColor + '0.8)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, 68, i * Math.PI / 3 + 0.15, (i + 1) * Math.PI / 3 - 0.15);
        ctx.stroke();
      }
      ctx.restore();

      const pulseRadius = 42 + Math.sin(pulse) * 3;
      const coreGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, pulseRadius);
      coreGrad.addColorStop(0, '#ffffff');
      coreGrad.addColorStop(0.2, coreColor + '1)');
      coreGrad.addColorStop(0.8, coreColor + '0.4)');
      coreGrad.addColorStop(1, 'rgba(0,0,0,0)');
      
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, pulseRadius, 0, Math.PI * 2);
      ctx.fill();

      particles.forEach((p) => {
        p.angle += p.speed * particleSpeedMultiplier;
        p.x = cx + Math.cos(p.angle) * p.dist;
        p.y = cy + Math.sin(p.angle) * p.dist;

        ctx.fillStyle = coreColor + (0.3 + Math.random() * 0.7) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '8px Share Tech Mono';
      ctx.textAlign = 'center';
      const label = permissionOpen ? 'APPROVAL' : confirmOpen ? 'CONFIRM' : voiceState;
      ctx.fillText(label, cx, cy + 3);

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [voiceState, permissionOpen, confirmOpen]);

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
      const res = await fetch(`${getBackendUrl()}/api/workflows`, {
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

  const pipelineSteps = ['Listen', 'Understand', 'Think', 'Respond', 'Execute', 'Verify', 'Report'];

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
          <span className="font-orbitron font-bold">THOR OPERATING ASSISTANT</span>
          <span className="px-2 py-0.5 border border-cyan-500/30 rounded text-[9px]">SECURITY LEVEL: ALPHA</span>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Monitor className="w-3 h-3" />
            <span className="text-[10px] text-cyan-200">{stats.activeWindow}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5" />
            <span>CLOUD SERVER: ONLINE</span>
          </div>
          <button 
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1 hover:text-cyan-200 transition border border-cyan-500/30 rounded px-2 py-0.5"
          >
            <Settings className="w-3 h-3 animate-spin-slow" />
            <span>SETTINGS</span>
          </button>
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
        
        {/* Left Column: Diagnostics & Quick Controls */}
        <section className="col-span-12 md:col-span-3 flex flex-col gap-4">
          
          {/* System Diagnostics Panel */}
          <div className="glass-panel p-4 rounded border border-cyan-500/20 relative flex-1 flex flex-col justify-between">
            <div className="flex items-center gap-2 border-b border-cyan-500/20 pb-2 mb-3">
              <Activity className="w-4 h-4 text-cyan-500 animate-pulse" />
              <h2 className="text-xs uppercase font-semibold text-cyan-300">System Diagnostics</h2>
            </div>

            <div className="space-y-4 my-2 flex-1 flex flex-col justify-around">
              {/* CPU */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="flex items-center gap-1"><Cpu className="w-3 h-3" /> CPU UTILIZATION</span>
                  <span className="text-cyan-200">{stats.cpu}%</span>
                </div>
                <div className="w-full bg-cyan-950/50 rounded-full h-1.5 border border-cyan-500/20">
                  <div 
                    className="bg-cyan-400 h-1.5 rounded-full shadow-[0_0_8px_rgba(0,240,255,0.6)] transition-all duration-300"
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
                    className="bg-purple-500 h-1.5 rounded-full shadow-[0_0_8px_rgba(168,85,247,0.6)] transition-all duration-300"
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
                    className="bg-emerald-500 h-1.5 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.6)] transition-all duration-300"
                    style={{ width: `${stats.battery}%` }}
                  ></div>
                </div>
              </div>
            </div>

            <div className="text-[10px] text-cyan-500/60 border-t border-cyan-500/10 pt-2 flex items-center justify-between">
              <span>AUTOMATION: {user?.desktopAutomationGranted ? 'AUTHORIZED' : 'RESTRICTED'}</span>
              <span>HOST: WIN-CLIENT</span>
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

        {/* Center Panel: core visualizer, greetings, microphone animations, and dialogues */}
        <section className="col-span-12 md:col-span-6 flex flex-col justify-between items-center glass-panel p-6 rounded border border-cyan-500/20 relative overflow-y-auto">
          {/* Top layout corners */}
          <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-cyan-400"></div>
          <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-cyan-400"></div>
          <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-cyan-400"></div>
          <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-cyan-400"></div>

          {/* User OS Greeting */}
          <div className="w-full text-center my-2 border-b border-cyan-500/10 pb-4">
            <h1 className="text-cyan-500/60 text-[10px] tracking-[0.25em] uppercase font-bold mb-1">SYSTEM STATUS: INITIALIZED</h1>
            <p className="text-xs text-cyan-300 font-semibold tracking-wider">Welcome Back</p>
            <h2 className="text-xl font-orbitron font-bold text-white tracking-widest my-1 uppercase">Hello, {user?.fullName || 'Rajvardhan'}</h2>
            <p className="text-[10px] text-cyan-400/80 tracking-widest">Your Personal AI Assistant Is Ready</p>
          </div>

          {/* THOR Core Canvas */}
          <div className="relative flex-1 flex items-center justify-center w-full min-h-[220px]">
            <canvas ref={canvasRef} className="ai-core-glow rounded-full" />
            
            {/* Pulsing ring outer microphone overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className={`w-[200px] h-[200px] rounded-full border border-dashed transition-all duration-1000 ${
                voiceState === 'LISTENING' ? 'border-yellow-500/60 animate-spin-slow scale-105' :
                voiceState === 'PROCESSING' ? 'border-purple-500/60 animate-ping' :
                voiceState === 'EXECUTING' ? 'border-emerald-500/60 scale-95' :
                'border-cyan-500/20'
              }`}></div>
            </div>
          </div>

          {/* Interactive Dialogues Panel */}
          <div className="w-full relative mt-4 space-y-4">
            <AnimatePresence>
              {/* Permission prompt */}
              {permissionOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 15 }}
                  className="bg-blue-950/80 border border-blue-500/50 rounded-lg p-4 text-center glass-panel shadow-[0_0_20px_rgba(59,130,246,0.2)]"
                >
                  <ShieldAlert className="w-8 h-8 text-blue-400 mx-auto mb-2 animate-bounce" />
                  <p className="text-xs text-blue-200 font-semibold leading-relaxed mb-4">
                    To perform desktop automation, I need permission to control your local computer. Would you like to allow access?
                  </p>
                  <div className="flex justify-center gap-4 text-xs font-bold">
                    <button onClick={handleGrantPermission} className="px-4 py-1.5 bg-blue-500 text-black rounded hover:bg-blue-400 transition tracking-widest uppercase">
                      Grant Access
                    </button>
                    <button onClick={handleCancelDialog} className="px-4 py-1.5 border border-blue-400/40 text-blue-400 rounded hover:bg-blue-400/10 transition tracking-widest uppercase">
                      Deny
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Confirmation prompt */}
              {confirmOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 15 }}
                  className="bg-red-950/80 border border-red-500/50 rounded-lg p-4 text-center glass-panel shadow-[0_0_20px_rgba(239,68,68,0.2)]"
                >
                  <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2 animate-pulse" />
                  <p className="text-xs text-red-200 font-semibold leading-relaxed mb-4">{confirmMessage}</p>
                  <div className="flex justify-center gap-4 text-xs font-bold">
                    <button onClick={handleConfirmAction} className="px-4 py-1.5 bg-red-600 text-white rounded hover:bg-red-500 transition tracking-widest uppercase">
                      Confirm Action
                    </button>
                    <button onClick={handleCancelDialog} className="px-4 py-1.5 border border-red-400/40 text-red-400 rounded hover:bg-red-400/10 transition tracking-widest uppercase">
                      Cancel
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Live speech feedback & mic states */}
            {!permissionOpen && !confirmOpen && (
              <div className="w-full text-center">
                <div className="h-6 text-xs text-cyan-300 font-bold uppercase mb-2 tracking-wider flex items-center justify-center gap-2 font-mono">
                  {voiceState === 'LISTENING' ? (
                    <>
                      <span className="inline-block w-2 h-2 bg-yellow-500 rounded-full animate-ping"></span>
                      <span className="text-yellow-400 animate-pulse font-bold tracking-widest">THOR LISTENING...</span>
                    </>
                  ) : voiceState === 'PROCESSING' ? (
                    <>
                      <span className="inline-block w-2 h-2 bg-purple-500 rounded-full animate-pulse"></span>
                      <span className="text-purple-400 font-bold tracking-widest">THOR THINKING...</span>
                    </>
                  ) : voiceState === 'EXECUTING' ? (
                    <>
                      <span className="inline-block w-2 h-2 bg-emerald-500 rounded-full animate-bounce"></span>
                      <span className="text-emerald-400 animate-pulse font-bold tracking-widest">THOR EXECUTING TASK...</span>
                    </>
                  ) : (
                    <span className="text-cyan-500/60 font-semibold tracking-wider">AWAITING WAKE WORD: "THOR"</span>
                  )}
                </div>

                <div className="bg-black/60 border border-cyan-500/30 rounded-lg p-3 min-h-[50px] flex items-center justify-center relative shadow-[0_0_15px_rgba(0,240,255,0.05)]">
                  <span className="text-[10px] uppercase text-cyan-100 tracking-widest leading-relaxed">
                    {currentSpeech ? `"${currentSpeech.toUpperCase()}"` : feedback}
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Right Column: Redesigned HUD Chat Timeline & Pipeline Monitor */}
        <section className="col-span-12 md:col-span-3 flex flex-col gap-4">
          
          {/* Timeline / Live Chat History panel */}
          <div className="glass-panel p-4 rounded border border-cyan-500/20 flex flex-col justify-between h-[300px]">
            <div className="flex items-center gap-2 border-b border-cyan-500/20 pb-2 mb-2">
              <Terminal className="w-4 h-4 text-cyan-500" />
              <h2 className="text-xs uppercase font-semibold text-cyan-300">Vocal Timeline</h2>
            </div>

            {/* Chat message thread */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 my-2 flex flex-col-reverse text-[9px]">
              {[...messages].reverse().map((msg, index) => (
                <div key={index} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`p-2 rounded max-w-[85%] border leading-relaxed ${
                    msg.sender === 'user' 
                      ? 'bg-cyan-950/20 border-cyan-500/30 text-cyan-200' 
                      : 'bg-black/40 border-cyan-500/10 text-cyan-400'
                  }`}>
                    <span className="font-semibold block opacity-60 mb-0.5 text-[8px]">
                      {msg.sender === 'user' ? 'USER' : 'THOR'} • {msg.time}
                    </span>
                    <span className="break-words font-mono text-[9px] uppercase tracking-wide">{msg.text}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Direct access command field */}
            <form onSubmit={handleManualSubmit} className="border-t border-cyan-500/20 pt-2">
              <div className="relative">
                <input
                  type="text"
                  placeholder="DIRECT COMMANDS ACCESS..."
                  value={manualCommand}
                  onChange={e => setManualCommand(e.target.value)}
                  className="w-full bg-black/60 border border-cyan-500/30 rounded px-2.5 py-1.5 pr-8 text-cyan-200 placeholder-cyan-700/60 focus:outline-none focus:border-cyan-400 text-[9px]"
                />
                <button 
                  type="submit" 
                  className="absolute right-1 top-1 p-1 hover:text-white text-cyan-500 transition"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </div>

          {/* AI Task Execution Pipeline Monitor */}
          <div className="glass-panel p-4 rounded border border-cyan-500/20 flex flex-col justify-between flex-1">
            <div className="flex items-center gap-2 border-b border-cyan-500/20 pb-2 mb-3">
              <Cpu className="w-4 h-4 text-cyan-500" />
              <h2 className="text-xs uppercase font-semibold text-cyan-300">Execution Pipeline</h2>
            </div>

            {/* Stepped progress indicators */}
            <div className="flex-1 flex flex-col justify-around my-2 text-[9px]">
              {pipelineSteps.map((step) => {
                const isActive = activePipelineStep === step;
                return (
                  <div key={step} className="flex items-center gap-3">
                    <div className={`relative flex h-2 w-2 rounded-full ${
                      isActive 
                        ? 'bg-yellow-400 shadow-[0_0_8px_#eab308] animate-pulse' 
                        : 'bg-cyan-950 border border-cyan-500/30'
                    }`}>
                      {isActive && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>}
                    </div>
                    <span className={`tracking-wider uppercase transition-colors ${
                      isActive ? 'text-yellow-400 font-bold' : 'text-cyan-600/70'
                    }`}>
                      {step}
                    </span>
                    {isActive && (
                      <span className="text-[8px] bg-yellow-400/10 border border-yellow-400/20 text-yellow-500 px-1 rounded font-semibold uppercase animate-pulse">
                        Active
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Execution logs */}
            <div className="text-[8px] border-t border-cyan-500/10 pt-2 flex items-center justify-between text-cyan-600/70">
              <span>LATENCY: 0.12s</span>
              <span>COGNITIVE LAYER: STABLE</span>
            </div>
          </div>

        </section>

      </main>

      {/* Futuristic Settings Floating Overlay */}
      <AnimatePresence>
        {settingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm select-none p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-gray-950 border border-cyan-500/40 rounded-lg p-6 relative glass-panel shadow-[0_0_50px_rgba(0,240,255,0.15)]"
            >
              <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-cyan-400"></div>
              <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-cyan-400"></div>
              <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-cyan-400"></div>
              <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-cyan-400"></div>

              <h2 className="text-sm font-orbitron font-bold uppercase text-cyan-300 border-b border-cyan-500/20 pb-3 mb-4">
                THOR System Configuration
              </h2>

              <div className="space-y-4 text-xs">
                {/* Desktop Automation Toggle */}
                <div className="flex items-center justify-between border-b border-cyan-500/10 pb-3">
                  <div>
                    <p className="font-semibold text-cyan-100">Desktop Control authorization</p>
                    <p className="text-[9px] text-cyan-500/60 mt-0.5">Allows agent to execute system commands</p>
                  </div>
                  <button 
                    onClick={() => {
                      if (user?.desktopAutomationGranted) {
                        handleRevokePermission();
                      } else {
                        handleGrantPermission();
                      }
                    }}
                    className={`px-3 py-1 border rounded text-[10px] font-bold uppercase transition ${
                      user?.desktopAutomationGranted 
                        ? 'border-emerald-500/50 bg-emerald-950/20 text-emerald-400 hover:bg-emerald-500 hover:text-black' 
                        : 'border-red-500/50 bg-red-950/20 text-red-400 hover:bg-red-500 hover:text-white'
                    }`}
                  >
                    {user?.desktopAutomationGranted ? 'Authorized' : 'Restricted'}
                  </button>
                </div>

                {/* API Key settings */}
                <div>
                  <label className="block text-[10px] text-cyan-600 mb-1">COGNITIVE BRAIN KEY (OPENAI)</label>
                  <input 
                    type="password" 
                    placeholder="Enter OpenAI key..." 
                    value={openaiKey}
                    onChange={e => {
                      const val = e.target.value;
                      setOpenaiKey(val);
                      localStorage.setItem('thor_openai_key', val);
                    }}
                    className="w-full bg-black/60 border border-cyan-500/30 rounded px-2.5 py-1.5 text-cyan-200 placeholder-cyan-700/60 focus:outline-none focus:border-cyan-400 text-[10px]"
                  />
                </div>

                {/* Vocal Synthesis Cadence */}
                <div className="space-y-3 pt-2">
                  <h3 className="text-[10px] text-cyan-500 font-bold uppercase tracking-wider">Vocal Synthesis</h3>
                  
                  {/* Volume */}
                  <div>
                    <div className="flex justify-between text-[9px] mb-1">
                      <span>VOLUME</span>
                      <span>{Math.round(speechVolume * 100)}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="1" step="0.1" 
                      value={speechVolume}
                      onChange={e => setSpeechVolume(parseFloat(e.target.value))}
                      className="w-full accent-cyan-400 h-1 bg-cyan-950 rounded"
                    />
                  </div>

                  {/* Cadence */}
                  <div>
                    <div className="flex justify-between text-[9px] mb-1">
                      <span>CADENCE RATE</span>
                      <span>{speechRate.toFixed(2)}x</span>
                    </div>
                    <input 
                      type="range" min="0.5" max="2" step="0.05" 
                      value={speechRate}
                      onChange={e => setSpeechRate(parseFloat(e.target.value))}
                      className="w-full accent-cyan-400 h-1 bg-cyan-950 rounded"
                    />
                  </div>

                  {/* Pitch */}
                  <div>
                    <div className="flex justify-between text-[9px] mb-1">
                      <span>PITCH RESONANCE</span>
                      <span>{speechPitch.toFixed(2)}Hz</span>
                    </div>
                    <input 
                      type="range" min="0.5" max="2" step="0.05" 
                      value={speechPitch}
                      onChange={e => setSpeechPitch(parseFloat(e.target.value))}
                      className="w-full accent-cyan-400 h-1 bg-cyan-950 rounded"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end border-t border-cyan-500/20 pt-3">
                <button 
                  onClick={() => setSettingsOpen(false)}
                  className="px-4 py-1.5 bg-cyan-950 border border-cyan-400 text-cyan-400 rounded hover:bg-cyan-400 hover:text-black transition text-xs font-bold uppercase tracking-wider"
                >
                  Save & Exit
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Screen corners / Border footer info */}
      <footer className="relative z-10 border-t border-cyan-500/20 pt-2 text-[9px] text-cyan-600/70 flex justify-between uppercase">
        <span>CORE RESONANCE: STABLE (99.8%)</span>
        <span>Awaiting vocal prompt... Speak "Thor..."</span>
        <span>Matrix Grid coordinates: Z-744</span>
      </footer>
    </div>
  );
}
