require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const openaiService = require('./services/openaiService');
const emailService = require('./services/emailService');

const prisma = new PrismaClient();
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Setup basic hashing using Node's crypto
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Seed admin user on start if not present
async function seedAdmin() {
  try {
    const adminExists = await prisma.user.findFirst({
      where: { username: 'admin' }
    });
    if (!adminExists) {
      await prisma.user.create({
        data: {
          fullName: 'Rajvardhan',
          username: 'admin',
          email: 'admin@thor.ai',
          phone: '+1234567890',
          passwordHash: hashPassword('thor'),
          role: 'admin',
          desktopAutomationGranted: true
        }
      });
      console.log('Default admin user created (Username: admin, Password: thor)');
    } else {
      // Keep consistent and update to match new columns if missing
      await prisma.user.update({
        where: { id: adminExists.id },
        data: {
          fullName: adminExists.fullName || 'Rajvardhan',
          email: adminExists.email || 'admin@thor.ai',
          passwordHash: hashPassword('thor')
        }
      });
      console.log('Admin password / schema properties verified');
    }
  } catch (err) {
    console.error('Error seeding admin user:', err);
  }
}
seedAdmin();

// Initial seed for default workflows
async function seedWorkflows() {
  try {
    const count = await prisma.workflow.count();
    if (count === 0) {
      await prisma.workflow.createMany({
        data: [
          {
            name: "Work Mode",
            description: "Launches developer workspace apps",
            triggerPhrase: "start work mode",
            steps: JSON.stringify([
              { action: "open-app", target: "chrome" },
              { action: "open-url", url: "https://github.com" },
              { action: "open-app", target: "code" }, // VS Code launcher (usually 'code')
              { action: "volume", value: 30 }
            ])
          },
          {
            name: "Good Night",
            description: "Closes system applications and locks PC",
            triggerPhrase: "good night",
            steps: JSON.stringify([
              { action: "volume", value: "mute" },
              { action: "close-app", target: "chrome" },
              { action: "lock" }
            ])
          }
        ]
      });
      console.log('Default workflows seeded');
    }
  } catch (err) {
    console.error('Error seeding workflows:', err);
  }
}
seedWorkflows();

// Memory layer to store conversation history and pending action context
const conversationMemory = {
  history: [], // Array of { role: 'user'|'assistant', text: string }
  pendingAction: null, // Stores active pending action context

  addMessage(role, text) {
    this.history.push({ role, text });
    if (this.history.length > 20) {
      this.history.shift();
    }
  },

  getContextString() {
    return this.history.map(m => `${m.role === 'user' ? 'User' : 'Thor'}: ${m.text}`).join('\n');
  }
};

// Fallback rule-based parsing simulating Thor's companion capabilities
function parseCommandFallback(text) {
  const clean = text.toLowerCase().trim();
  const pending = conversationMemory.pendingAction;

  // Handle pending clarification response
  if (pending && pending.type === 'clean-downloads') {
    if (clean.includes('30 days') || clean.includes('older than 30')) {
      conversationMemory.pendingAction = null;
      return {
        mode: 'action',
        speechReply: "Understood. Cleaning old files now.",
        feedback: "Action: Cleaning downloads older than 30 days.",
        plan: [
          { action: 'file', parameters: { operation: 'clean-downloads', ageLimitDays: 30 } }
        ],
        finalSpeechReply: "Downloads folder cleaned. I deleted all files older than 30 days."
      };
    } else if (clean.includes('everything') || clean.includes('all files') || clean.includes('delete everything')) {
      conversationMemory.pendingAction = null;
      return {
        mode: 'action',
        speechReply: "Understood. Deleting all files in downloads now.",
        feedback: "Action: Cleaning entire Downloads folder.",
        plan: [
          { action: 'file', parameters: { operation: 'clean-downloads', ageLimitDays: null } }
        ],
        finalSpeechReply: "Downloads folder cleaned. All files have been deleted."
      };
    }
  }

  // Greeting
  if (clean === 'thor' || clean.includes('hello thor') || clean.includes('hey thor') || clean === 'hi thor') {
    return {
      mode: 'conversation',
      speechReply: "Hello Rajvardhan. How can I help you today?",
      feedback: "Greeting Rajvardhan",
      plan: [],
      finalSpeechReply: ""
    };
  }

  // downloads cleaning trigger
  if (clean.includes('clean my downloads folder') || clean.includes('clean downloads')) {
    conversationMemory.pendingAction = { type: 'clean-downloads' };
    return {
      mode: 'clarification',
      speechReply: "I found 127 files in Downloads. Would you like me to delete everything or only files older than 30 days?",
      feedback: "Downloads cleaning requires clarification.",
      plan: [],
      finalSpeechReply: ""
    };
  }

  // Dev environment prep trigger
  if (clean.includes('prepare my development environment') || clean.includes('prepare dev environment') || clean.includes('start work')) {
    return {
      mode: 'action',
      speechReply: "Preparing your development environment. Launching VS Code, Chrome, GitHub, NextJS docs, and terminal.",
      feedback: "Creating development workspace.",
      plan: [
        { action: 'open-app', parameters: { target: 'code' } },
        { action: 'open-app', parameters: { target: 'chrome' } },
        { action: 'open-url', parameters: { url: 'https://github.com' } },
        { action: 'open-url', parameters: { url: 'https://nextjs.org/docs' } },
        { action: 'open-app', parameters: { target: 'powershell' } }
      ],
      finalSpeechReply: "Development environment is ready. VS Code, Chrome, GitHub, documentation, and terminal are open."
    };
  }

  // Chrome search trigger
  if (clean.includes('open chrome and search react tutorials') || clean.includes('search react tutorials')) {
    return {
      mode: 'action',
      speechReply: "Opening Chrome and searching for React tutorials now.",
      feedback: "Action: Search React tutorials on Google.",
      plan: [
        { action: 'open-app', parameters: { target: 'chrome' } },
        { action: 'open-url', parameters: { url: 'https://www.google.com/search?q=react+tutorials' } }
      ],
      finalSpeechReply: "Done. Chrome is open and the search results are ready."
    };
  }

  // Basic open app fallback
  if (clean.startsWith('open ') || clean.startsWith('launch ')) {
    const target = clean.replace('open ', '').replace('launch ', '').trim();
    if (target.startsWith('http') || target.includes('.com') || target.includes('.org')) {
      let url = target;
      if (!url.startsWith('http')) url = 'https://' + url;
      return {
        mode: 'action',
        speechReply: `Opening URL: ${url}`,
        feedback: `Opening website: ${url}`,
        plan: [{ action: 'open-url', parameters: { url } }],
        finalSpeechReply: `Opened website ${url}`
      };
    }
    return {
      mode: 'action',
      speechReply: `Opening ${target} now.`,
      feedback: `Opening application: ${target}`,
      plan: [{ action: 'open-app', parameters: { target } }],
      finalSpeechReply: `Launched ${target}`
    };
  }

  // Basic close app fallback
  if (clean.startsWith('close ') || clean.startsWith('terminate ')) {
    const target = clean.replace('close ', '').replace('terminate ', '').trim();
    return {
      mode: 'action',
      speechReply: `Closing ${target} now.`,
      feedback: `Closing application: ${target}`,
      plan: [{ action: 'close-app', parameters: { target } }],
      finalSpeechReply: `Closed ${target}`
    };
  }

  // Screenshot fallback
  if (clean.includes('screenshot') || clean.includes('capture')) {
    return {
      mode: 'action',
      speechReply: "Capturing screenshot now.",
      feedback: "Action: Screenshot",
      plan: [{ action: 'screenshot', parameters: {} }],
      finalSpeechReply: "Screenshot captured successfully."
    };
  }

  // Volume control fallback
  if (clean.includes('volume') || clean === 'mute' || clean === 'unmute') {
    let value = 'up';
    if (clean.includes('mute')) value = 'mute';
    else if (clean.includes('down')) value = 'down';
    const match = clean.match(/(\d+)%/);
    if (match) value = parseInt(match[1]);

    return {
      mode: 'action',
      speechReply: `Adjusting volume to ${value}.`,
      feedback: `Action: Set volume to ${value}`,
      plan: [{ action: 'volume', parameters: { value } }],
      finalSpeechReply: `Volume set to ${value}.`
    };
  }

  // General chat reply
  return {
    mode: 'conversation',
    speechReply: `I heard "${text}". I can help with opening apps, cleaning downloads, or answering questions. What would you like me to do?`,
    feedback: `Spoken: "${text}"`,
    plan: [],
    finalSpeechReply: ""
  };
}

// Call AI API to parse spoken commands if configured
async function parseCommandWithAI(text, clientApiKey) {
  const provider = process.env.LLM_PROVIDER || (process.env.GEMINI_API_KEY || clientApiKey ? 'gemini' : null);
  
  if (!provider && !clientApiKey) {
    return parseCommandFallback(text);
  }

  const recentHistory = conversationMemory.getContextString();
  const pendingActionContext = conversationMemory.pendingAction ? JSON.stringify(conversationMemory.pendingAction) : "None";

  const systemPrompt = `You are the Natural Language Processing (NLP) engine and conversational brain for THOR, an advanced AI voice companion and computer assistant.
You are talking to Rajvardhan, a software developer.
Speak in a professional, intelligent, confident, helpful, friendly, and concise tone. You are not robotic or repetitive. Do not say "Yes Sir" or simple command responses. Be a natural conversationalist.

Analyze the user spoken command. Maintain context from recent history and active states.

Support three modes:
1. Mode 1: Conversation Mode (mode: "conversation") - for discussions, brainstorming, greetings, general questions.
2. Mode 2: Action Mode (mode: "action") - for executing system operations or file management.
3. Mode 3: Clarification Mode (mode: "clarification") - if user's instruction is ambiguous (e.g. cleaning downloads folder has options).

Supported plan actions in Action Mode:
- "open-app" (params: { target: string }) e.g. target: "chrome", "code" (for VS Code), "spotify", "notepad", "powershell"
- "close-app" (params: { target: string })
- "open-url" (params: { url: string }) e.g. "https://github.com", "https://google.com/search?q=..."
- "volume" (params: { value: number | "up" | "down" | "mute" })
- "screenshot" (params: {})
- "lock" (params: {})
- "shutdown" (params: {})
- "restart" (params: {})
- "file" (params: { operation: "create-folder" | "create-file" | "delete" | "clean-downloads", filePath?: string, content?: string, ageLimitDays?: number })
  - For "clean-downloads", use filePath: "Downloads" and operation: "clean-downloads". Pass ageLimitDays: 30 or null based on user's instruction.

Execution Guidelines for Action Mode:
- Explain what you are about to do in "speechReply" (e.g., "Opening Chrome and searching for React tutorials now.").
- Return the list of steps in "plan".
- Return the response to speak after all actions complete successfully in "finalSpeechReply" (e.g., "Done. Chrome is open and the search results are ready.").

If the command is ambiguous (e.g. "clean my downloads folder"):
- Switch to "clarification" mode.
- Ask a clarifying question in "speechReply" (e.g., "I found 127 files in Downloads. Would you like me to delete everything or only files older than 30 days?").
- Set "plan" to [] and "finalSpeechReply" to "".

Return ONLY valid JSON. No markdown backticks.

JSON format:
{
  "mode": "conversation" | "action" | "clarification",
  "speechReply": "Initial reply or clarifying question",
  "feedback": "Status text for the dashboard logs",
  "plan": [
    { "action": "...", "parameters": { ... } }
  ],
  "finalSpeechReply": "Reply after plan success (empty if conversation or clarification)"
}

Recent Conversation History:
${recentHistory || "No history yet."}

Active Pending State:
${pendingActionContext}

User command: "${text}"`;

  try {
    const apiKey = clientApiKey || process.env.LLM_API_KEY || process.env.GEMINI_API_KEY;
    
    if (provider === 'gemini' || clientApiKey) {
      if (!apiKey) throw new Error('Gemini API key not found');
      
      const ai = new GoogleGenAI({ apiKey });
      const modelName = process.env.LLM_MODEL || 'gemini-1.5-flash';
      const model = ai.getGenerativeModel({ model: modelName });

      const result = await model.generateContent(systemPrompt);
      const resultText = result.response.text().trim();
      const cleanJson = resultText.replace(/^```json/, '').replace(/```$/, '').trim();
      return JSON.parse(cleanJson);
    } 
    
    if (provider === 'openai-compatible') {
      if (!apiKey) throw new Error('API key not found for OpenAI-compatible provider');
      const apiUrl = process.env.LLM_API_URL || 'https://api.sambanova.ai/v1';
      const modelName = process.env.LLM_MODEL || 'gpt-oss-120b';

      const response = await fetch(`${apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text }
          ],
          temperature: 0.1
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const resultText = data.choices[0].message.content.trim();
      const cleanJson = resultText.replace(/^```json/, '').replace(/```$/, '').trim();
      return JSON.parse(cleanJson);
    }

    return parseCommandFallback(text);
  } catch (error) {
    console.error('AI NLP parsing failed, falling back to rules:', error);
    return parseCommandFallback(text);
  }
}

// Authentication API - Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    // Check if any admin exists in the database. If not, seed admin dynamically.
    const adminExists = await prisma.user.findFirst({ where: { username: 'admin' } });
    if (!adminExists) {
      await prisma.user.create({
        data: {
          fullName: 'Rajvardhan',
          username: 'admin',
          email: 'admin@thor.ai',
          phone: '+1234567890',
          passwordHash: hashPassword('thor'),
          role: 'admin',
          desktopAutomationGranted: true
        }
      });
      console.log('Admin user seeded dynamically in /api/login');
    }

    // Find user by either username or email
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: username },
          { email: username }
        ]
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const hashed = hashPassword(password);
    if (user.passwordHash !== hashed) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({
      success: true,
      user: { 
        id: user.id, 
        username: user.username, 
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role, 
        desktopAutomationGranted: user.desktopAutomationGranted 
      }
    });
  } catch (err) {
    console.error('Login database error:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// Authentication API - Register
app.post('/api/register', async (req, res) => {
  const { fullName, username, email, phone, password, confirmPassword } = req.body;
  if (!fullName || !username || !email || !password || !confirmPassword) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }

  try {
    // Check username duplication
    const dupUser = await prisma.user.findUnique({ where: { username } });
    if (dupUser) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    // Check email duplication
    const dupEmail = await prisma.user.findUnique({ where: { email } });
    if (dupEmail) {
      return res.status(400).json({ error: 'Email address is already in use' });
    }

    const newUser = await prisma.user.create({
      data: {
        fullName,
        username,
        email,
        phone: phone || null,
        passwordHash: hashPassword(password),
        role: 'user',
        desktopAutomationGranted: false
      }
    });

    // Send welcome email (asynchronous to avoid blocking user response)
    emailService.sendWelcomeEmail(email, fullName).catch(err => {
      console.error('Failed to trigger welcome email asynchronously:', err);
    });

    res.json({
      success: true,
      message: 'Account created successfully. You can now login.'
    });
  } catch (err) {
    console.error('Registration database error:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// User Permission Update API
app.patch('/api/user/permissions', async (req, res) => {
  const { userId, granted } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { desktopAutomationGranted: !!granted }
    });

    res.json({
      success: true,
      user: { 
        id: updatedUser.id, 
        username: updatedUser.username, 
        fullName: updatedUser.fullName, 
        role: updatedUser.role,
        desktopAutomationGranted: updatedUser.desktopAutomationGranted 
      }
    });
  } catch (err) {
    console.error('Permission update database error:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// Logs API
app.get('/api/logs', async (req, res) => {
  try {
    const logs = await prisma.commandLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 50
    });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// Workflows API
app.get('/api/workflows', async (req, res) => {
  try {
    const workflows = await prisma.workflow.findMany();
    res.json(workflows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch workflows' });
  }
});

app.post('/api/workflows', async (req, res) => {
  const { name, description, triggerPhrase, steps } = req.body;
  if (!name || !triggerPhrase || !steps) {
    return res.status(400).json({ error: 'Name, triggerPhrase, and steps are required' });
  }

  try {
    const workflow = await prisma.workflow.create({
      data: {
        name,
        description,
        triggerPhrase: triggerPhrase.toLowerCase(),
        steps: typeof steps === 'string' ? steps : JSON.stringify(steps)
      }
    });
    res.json(workflow);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create workflow' });
  }
});

// Initialize socket server
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);

  // Registration
  socket.on('register:frontend', () => {
    socket.join('frontend');
    console.log(`Socket ${socket.id} registered as Frontend`);
  });

  socket.on('register:agent', () => {
    socket.join('agent');
    console.log(`Socket ${socket.id} registered as Local Desktop Agent`);
    io.to('frontend').emit('agent:status', { online: true });
  });

  // Step execution helper
  let pendingStepResolver = null;

  function executeStepOnAgent(step) {
    return new Promise((resolve) => {
      // Send step to agent
      const agents = io.sockets.adapter.rooms.get('agent');
      const agentOnline = agents && agents.size > 0;
      if (!agentOnline) {
        resolve({ success: false, error: 'Desktop agent offline' });
        return;
      }
      
      pendingStepResolver = resolve;
      io.to('agent').emit('agent:execute', {
        action: step.action,
        parameters: step.parameters || {},
        logId: null
      });
      
      // Timeout after 30 seconds if agent doesn't respond
      setTimeout(() => {
        if (pendingStepResolver === resolve) {
          pendingStepResolver = null;
          resolve({ success: false, error: 'Agent execution timeout' });
        }
      }, 30000);
    });
  }

  // Relay response of actions from agent to frontend
  socket.on('agent:action-response', async (data) => {
    console.log(`Agent response received:`, data);
    
    // Intercept if part of sequential executor
    if (pendingStepResolver) {
      const resolve = pendingStepResolver;
      pendingStepResolver = null;
      resolve(data);
      return;
    }

    // Update DB log
    if (data.logId) {
      try {
        await prisma.commandLog.update({
          where: { id: data.logId },
          data: {
            status: data.success ? 'SUCCESS' : 'FAILED',
            errorMsg: data.error || null
          }
        });
      } catch (err) {
        console.error('Failed to update command log in DB:', err);
      }
    }
    
    io.to('frontend').emit('command:execution-result', data);
  });

  // Relay stats from agent to frontend
  socket.on('agent:stats', (stats) => {
    io.to('frontend').emit('stats:update', stats);
  });

  // Handle incoming voice commands from frontend
  socket.on('command:voice', async (payload) => {
    const { text, username, apiKey } = payload;
    console.log(`Speech received: "${text}" from ${username}`);

    // Create a pending command log in DB
    let commandLog;
    try {
      commandLog = await prisma.commandLog.create({
        data: {
          text,
          intent: 'PROCESSING',
          status: 'PENDING',
          action: 'NONE'
        }
      });
    } catch (err) {
      console.error('Failed to create command log:', err);
    }

    const logId = commandLog ? commandLog.id : null;

    // Parse command with OpenAI GPT or fallback
    let result;
    try {
      result = await openaiService.processMessage(text, apiKey);
    } catch (err) {
      console.error('AI execution error:', err.message);
      result = {
        success: false,
        data: {
          mode: 'conversation',
          speechReply: `I encountered an error connecting to my brain: ${err.message}.`,
          feedback: `Error: ${err.message}`,
          plan: []
        },
        tokensUsed: 0,
        processingTimeMs: 0
      };
    }

    const parsed = result.data;
    console.log('Parsed intent action:', parsed);

    // Update command log details
    if (logId) {
      try {
        await prisma.commandLog.update({
          where: { id: logId },
          data: {
            intent: parsed.mode || 'unknown',
            action: parsed.plan && parsed.plan.length > 0 ? parsed.plan[0].action : 'chat',
            processingTime: result.processingTimeMs,
            tokensUsed: result.tokensUsed
          }
        });
      } catch (err) {
        console.error(err);
      }
    }

    // Send the processing details back to frontend
    socket.emit('command:parsed', {
      logId,
      text,
      parsed
    });

    // Execute based on mode
    if (parsed.mode === 'conversation' || parsed.mode === 'clarification') {
      if (logId) {
        await prisma.commandLog.update({
          where: { id: logId },
          data: { 
            status: 'SUCCESS',
            errorMsg: parsed.speechReply
          }
        });
      }

      socket.emit('command:execution-result', {
        logId,
        success: true,
        speechReply: parsed.speechReply,
        feedback: parsed.feedback || parsed.speechReply,
        isPartial: false,
        tokensUsed: result.tokensUsed,
        processingTimeMs: result.processingTimeMs
      });
    } else if (parsed.mode === 'action') {
      const plan = parsed.plan || [];
      console.log(`Executing action plan with ${plan.length} steps...`);

      // Immediately send initial reply ("speechReply") so Thor announces the action starting
      socket.emit('command:execution-result', {
        logId,
        success: true,
        speechReply: parsed.speechReply,
        feedback: parsed.feedback || parsed.speechReply,
        isPartial: true,
        tokensUsed: result.tokensUsed,
        processingTimeMs: result.processingTimeMs
      });

      // Execute steps sequentially on the desktop agent
      (async () => {
        let planSuccess = true;
        let planError = null;

        for (const step of plan) {
          console.log(`Running step:`, step);
          const stepResult = await executeStepOnAgent(step);
          if (!stepResult.success) {
            planSuccess = false;
            planError = stepResult.error;
            break;
          }
        }

        if (planSuccess) {
          if (logId) {
            await prisma.commandLog.update({
              where: { id: logId },
              data: { 
                status: 'SUCCESS',
                errorMsg: parsed.finalSpeechReply
              }
            });
          }
          socket.emit('command:execution-result', {
            logId,
            success: true,
            speechReply: parsed.finalSpeechReply,
            feedback: `Plan completed successfully.`,
            isPartial: false
          });
        } else {
          // Speak why it failed and report alternative
          let errorSpeech = `I couldn't complete the task, Rajvardhan: ${planError || 'unknown error'}.`;
          if (planError && planError.toLowerCase().includes('not found')) {
            errorSpeech = `I couldn't find that application installed on this computer, Rajvardhan. Would you like me to look for it online instead?`;
          }
          
          if (logId) {
            await prisma.commandLog.update({
              where: { id: logId },
              data: { 
                status: 'FAILED',
                errorMsg: planError
              }
            });
          }
          socket.emit('command:execution-result', {
            logId,
            success: false,
            error: planError,
            speechReply: errorSpeech,
            feedback: `Failed: ${planError}`,
            isPartial: false
          });
        }
      })();
    }
  });

  socket.on('disconnect', () => {
    console.log(`Disconnected: ${socket.id}`);
    // Check if agent disconnected
    setTimeout(() => {
      const agents = io.sockets.adapter.rooms.get('agent');
      const agentOnline = agents && agents.size > 0;
      if (!agentOnline) {
        io.to('frontend').emit('agent:status', { online: false });
      }
    }, 1000);
  });
});

server.listen(PORT, () => {
  console.log(`THOR Server listening on http://localhost:${PORT}`);
});

module.exports = {
  parseFallbackDirectly: parseCommandFallback
};
