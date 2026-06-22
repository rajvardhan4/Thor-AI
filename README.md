# Thor AI - Advanced Voice Controlled Companion & Assistant

Thor is an ultra-futuristic, cinematic voice companion inspired by sci-fi heads-up displays (HUDs). It continuously listens for wake words, answers conversational queries using a stateful memory brain, and automates OS commands on a Windows host machine via a lightweight local agent.

---

## 1. Project Architecture

The system consists of three main components:
1. **Frontend (`/frontend`)**: A Next.js 16 (App Router) client with an animated canvas visualizer core, real-time CPU/RAM/Battery metrics, login screen, and continuous Web Speech API voice capture.
2. **Backend (`/backend`)**: An Express + Socket.IO server orchestration layer that routes parsed LLM intents to the local machine agent and manages session credentials.
3. **Local Desktop Agent (`/agent`)**: A Node.js application running locally on Windows. It queries system stats and triggers system actions (opening apps, screenshots, lock, volume) via Windows PowerShell.

---

## 2. Production Deployment Guide

To deploy Thor AI to a live cloud environment:

### Step A: Deploy the Database
1. Provision a free PostgreSQL database on [Neon.tech](https://neon.tech) or [Supabase](https://supabase.com).
2. Save your connection string (e.g. `postgresql://user:pass@ep-cool-cloud.neon.tech/thor`).

### Step B: Deploy the Backend (Socket.IO + Prisma)
WebSockets require a persistent host. Deploy the backend on **Render.com** or **Railway.app**:
1. Create a new **Web Service** pointing to the repository.
2. Root directory: `backend`
3. Build Command: `npm install && npx prisma db push`
4. Start Command: `npm start`
5. Configure Environment Variables:
   - `DATABASE_URL`: Your cloud PostgreSQL connection string.
   - `LLM_PROVIDER`: `"openai-compatible"` (or `"gemini"`).
   - `LLM_API_KEY`: Your SambaNova or OpenAI API Key.
   - `LLM_API_URL`: `https://api.sambanova.ai/v1`
   - `LLM_MODEL`: `gpt-oss-120b`

### Step C: Deploy the Frontend (Next.js)
Deploy the frontend to **Vercel**:
1. Connect your GitHub repository to Vercel.
2. Select `frontend` as the root directory of the project.
3. Vercel will automatically detect Next.js settings.
4. Configure Environment Variables:
   - `NEXT_PUBLIC_SOCKET_SERVER_URL`: The URL of your newly deployed Render Web Service (e.g., `https://thor-backend.onrender.com`).
5. Click **Deploy**.

### Step D: Run the Local Windows Agent
1. In your local Windows terminal, open the agent directory:
   ```powershell
   cd agent
   ```
2. Modify `agent/.env` to point to the production server:
   ```env
   BACKEND_URL="https://thor-backend.onrender.com"
   ```
3. Start the agent:
   ```powershell
   npm start
   ```
4. Access the frontend dashboard URL provided by Vercel!

---

## 3. Local Development Startup

If you want to run everything locally:
1. Make sure you have Node.js installed.
2. From the root directory, install all workspace packages:
   ```powershell
   npm run install:all
   ```
3. Run the services concurrently:
   ```powershell
   npm run dev
   ```
4. Navigate to `http://localhost:3000/login` (Default credentials: `admin` / `thor`).
