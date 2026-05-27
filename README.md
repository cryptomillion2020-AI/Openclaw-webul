# OpenClaw Master Workflow UI

**Phase 5 v1.1 — Web Dashboard Scaffold**

This is the frontend dashboard for the OpenClaw Master Workflow system, providing real-time visibility into agent status, QUANT proposals, emergency controls, and system operations.

---

## Technology Stack

- **React 18** — UI framework
- **Vite 5** — Build tool and dev server
- **Tailscale VPN** — Secure remote access (100.x.x.x private network)
- **Cloudflare Pages** — Production deployment (pending)
- **Cloudflare Workers + Durable Objects** — WebSocket bridge for bus.py event stream (Phase 5 build proper)

---

## Local Development

### Prerequisites
- Node.js 18+ and npm
- Tailscale VPN configured and running

### Setup
```bash
cd /home/k/.openclaw/workspace-webui
npm install
npm run dev
```

The dev server will start on `http://0.0.0.0:5173` (accessible via Tailscale IP from any device on the Tailnet).

### Access
Once Tailscale is operational:
- **Local:** `http://localhost:5173`
- **Remote (via Tailscale):** `http://100.x.x.x:5173` (replace with actual Tailscale IP)

---

## Production Deployment via Cloudflare Pages

### Step 1: Git Repository Setup
```bash
cd /home/k/.openclaw/workspace-webui
git init
git add .
git commit -m "Initial Web UI scaffold"
git remote add origin <YOUR_GIT_REPO_URL>
git push -u origin main
```

### Step 2: Cloudflare Pages Configuration
1. Log in to Cloudflare Dashboard
2. Navigate to **Pages** → **Create a project**
3. Connect your Git repository (GitHub, GitLab, or Bitbucket)
4. Configure build settings:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** `/` (or specify if using monorepo)
5. Deploy

### Step 3: Custom Domain (Optional)
- Add custom domain in Cloudflare Pages settings
- Cloudflare automatically provisions SSL certificate
- DNS configuration handled via Cloudflare DNS

---

## WebSocket Bridge (Phase 5 Build Proper)

**Current Status:** Not yet implemented — scaffold only

The production system will require a Cloudflare Worker to bridge the local `bus.py` event stream to the Web UI:

### Architecture
```
bus.py (local) 
  → SSE/WebSocket server (local Python)
  → Cloudflare Tunnel (or Tailscale Funnel)
  → Cloudflare Worker (WebSocket handler)
  → Durable Object (connection state)
  → Web UI (React client)
```

### Implementation (Future)
- Worker script to handle WebSocket connections
- Durable Object to manage connection state and message routing
- Authentication layer (OAuth or API key)
- Rate limiting and DDoS protection

---

## Dashboard Sections (Current Scaffold)

### 1. Agent Status
Real-time status indicators for all agents:
- SEVIN, OVERSEER, QUANT, NEXUS, ELEVIN, etc.
- Status: Online (green), Pending (yellow), Offline (gray)

### 2. QUANT Proposals
Display trading proposals awaiting approval:
- Proposal details
- Risk assessment
- Approve/Reject controls

### 3. Kill Switch
Emergency stop for all autonomous trading:
- Single-click halt
- Manual restart required after activation

### 4. OAuth & Integrations
Connection status for external services:
- Fidelity, Schwab (brokerage APIs)
- Google Calendar, email, etc.

### 5. System Log
Real-time event stream:
- Agent actions
- System events
- Error/warning messages

### 6. Mode 3 Toggle
Operational mode control:
- Mode 1: Manual (all actions require approval)
- Mode 2: Semi-autonomous (high-value decisions require approval)
- Mode 3: Fully autonomous (within risk parameters)

---

## Security Considerations

- **Tailscale VPN:** All remote access routed through encrypted VPN
- **No public exposure:** Dev server binds to Tailscale IP only
- **OAuth required:** Production deployment will enforce authentication
- **Rate limiting:** Cloudflare Workers enforce request limits
- **Kill switch:** Hardware-level emergency stop (not just software toggle)

---

## Next Steps (Post-Scaffold)

1. **Architect approval:** Tailscale installation + Cloudflare account access
2. **npm install:** Install dependencies
3. **Test local dev server:** Verify React + Vite build works
4. **WebSocket bridge:** Build Cloudflare Worker for bus.py event stream
5. **OAuth integration:** Add authentication layer
6. **Production deployment:** Push to Cloudflare Pages
7. **Custom domain:** Configure DNS (domain TBD by Architect)

---

**Phase 5 v1.1 Status:** Scaffold complete — awaiting Architect credentials for Tailscale + Cloudflare deployment
