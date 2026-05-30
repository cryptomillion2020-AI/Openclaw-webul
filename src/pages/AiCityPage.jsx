import { useEffect, useRef, useState, useCallback, useMemo } from "react";

// ============================================
// AI-City — Dynamic Living City
// Buildings persist forever when tasks complete
// New tasks spawn NEW buildings at city edge
// City expands outward like SimCity
// ============================================

const TW = 80;
const TH = 40;
const SCALE = 0.68;
const FH = 11; // floor height px

// Pre-computed city plot positions — city expands outward from center
const PLOT_GRID = [
  // Core district (tasks 1-12)
  {tx:4, ty:4}, {tx:8, ty:4}, {tx:12,ty:4}, {tx:16,ty:4},
  {tx:4, ty:8}, {tx:8, ty:8}, {tx:12,ty:8}, {tx:16,ty:8},
  {tx:4, ty:12},{tx:8, ty:12},{tx:12,ty:12},{tx:16,ty:12},
  // Expansion ring 1 (tasks 13-24)
  {tx:0, ty:4}, {tx:0, ty:8}, {tx:0, ty:12},{tx:0, ty:0},
  {tx:4, ty:0}, {tx:8, ty:0}, {tx:12,ty:0}, {tx:16,ty:0},
  {tx:20,ty:0}, {tx:20,ty:4},{tx:20,ty:8}, {tx:20,ty:12},
  // Expansion ring 2 (tasks 25+)
  {tx:0, ty:16},{tx:4, ty:16},{tx:8, ty:16},{tx:12,ty:16},
  {tx:16,ty:16},{tx:20,ty:16},{tx:24,ty:4},{tx:24,ty:8},
  {tx:24,ty:12},{tx:24,ty:16},{tx:4, ty:20},{tx:8, ty:20},
];

// Building style per agent role
const AGENT_STYLES = {
  sevin:     { style:"skyscraper",    wall:"#2a4020", glass:"#FFD700", maxFloors:14 },
  overseer:  { style:"tower_podium",  wall:"#1a3a5a", glass:"#64B5F6", maxFloors:12 },
  elevin:    { style:"corporate",     wall:"#1a3a20", glass:"#81C784", maxFloors:10 },
  tika:      { style:"civic_dome",    wall:"#2e1248", glass:"#CE93D8", maxFloors:9  },
  navigator: { style:"skyscraper",    wall:"#4a2a0a", glass:"#FF8A65", maxFloors:11 },
  quant:     { style:"tower_podium",  wall:"#4a3a0a", glass:"#FFB74D", maxFloors:13 },
  cosmos:    { style:"civic_dome",    wall:"#4a0a2a", glass:"#F48FB1", maxFloors:8  },
  axis:      { style:"corporate",     wall:"#4a1a0a", glass:"#FFAB91", maxFloors:7  },
  comms:     { style:"corporate",     wall:"#063838", glass:"#4DD0E1", maxFloors:9  },
  nexus:     { style:"skyscraper",    wall:"#252f38", glass:"#B0BEC5", maxFloors:10 },
  roots:     { style:"civic_dome",    wall:"#1a3a18", glass:"#A5D6A7", maxFloors:8  },
  stan:      { style:"corporate",     wall:"#1e2050", glass:"#9FA8DA", maxFloors:10 },
};

const AGENT_META = {
  sevin:     {name:"SEVIN",     color:"#FFD700",glow:"#FFF59D",eye:"#FFF176",hair:"#B8860B",blush:"#FF8A65"},
  overseer:  {name:"OVERSEER",  color:"#42A5F5",glow:"#90CAF9",eye:"#90CAF9",hair:"#1565C0",blush:"#EF9A9A"},
  elevin:    {name:"ELEVIN",    color:"#66BB6A",glow:"#A5D6A7",eye:"#A5D6A7",hair:"#2E7D32",blush:"#F48FB1"},
  tika:      {name:"TIKA",      color:"#AB47BC",glow:"#CE93D8",eye:"#E1BEE7",hair:"#6A1B9A",blush:"#CE93D8"},
  navigator: {name:"NAVIGATOR", color:"#FF7043",glow:"#FFAB91",eye:"#FFCCBC",hair:"#BF360C",blush:"#FF8A65"},
  quant:     {name:"QUANT",     color:"#FFA726",glow:"#FFCC80",eye:"#FFE0B2",hair:"#E65100",blush:"#FFAB91"},
  cosmos:    {name:"COSMOS",    color:"#EC407A",glow:"#F48FB1",eye:"#FCE4EC",hair:"#880E4F",blush:"#F06292"},
  axis:      {name:"AXIS",      color:"#FF7043",glow:"#FFAB91",eye:"#FFCCBC",hair:"#BF360C",blush:"#FF8A65"},
  comms:     {name:"COMMS",     color:"#26C6DA",glow:"#80DEEA",eye:"#B2EBF2",hair:"#006064",blush:"#80CBC4"},
  nexus:     {name:"NEXUS",     color:"#78909C",glow:"#B0BEC5",eye:"#ECEFF1",hair:"#37474F",blush:"#EF9A9A"},
  roots:     {name:"ROOTS",     color:"#4CAF50",glow:"#A5D6A7",eye:"#C8E6C9",hair:"#1B5E20",blush:"#FFAB91"},
  stan:      {name:"STAN",      color:"#7E57C2",glow:"#D1C4E9",eye:"#EDE7F6",hair:"#4527A0",blush:"#B0BEC5"},
};

const STATES = {ACTIVE:"active",PENDING:"pending",IDLE:"idle",SLEEPING:"sleeping"};

// Simulated tasks for demo (replaced by real wsData when available)
const DEMO_TASKS = [
  {id:"t1", agentId:"sevin",     label:"Web UI Architecture",  status:"active",   progress:72},
  {id:"t2", agentId:"overseer",  label:"Sprint Coordination",  status:"active",   progress:55},
  {id:"t3", agentId:"elevin",    label:"Frontend Build",       status:"active",   progress:88},
  {id:"t4", agentId:"tika",      label:"Market Research",      status:"pending",  progress:30},
  {id:"t5", agentId:"navigator", label:"Trade Projections",    status:"active",   progress:45},
  {id:"t6", agentId:"quant",     label:"Strategy Analysis",    status:"active",   progress:91},
  {id:"t7", agentId:"cosmos",    label:"Sprite Design",        status:"idle",     progress:100},
  {id:"t8", agentId:"axis",      label:"Task Scheduling",      status:"idle",     progress:60},
  {id:"t9", agentId:"comms",     label:"Discord Routing",      status:"sleeping", progress:20},
  {id:"t10",agentId:"nexus",     label:"Data Consolidation",   status:"idle",     progress:15},
  {id:"t11",agentId:"roots",     label:"Health Monitoring",    status:"idle",     progress:5},
  {id:"t12",agentId:"stan",      label:"Technical Analysis",   status:"sleeping", progress:0},
];

const iso = (tx,ty) => ({x:(tx-ty)*(TW/2), y:(tx+ty)*(TH/2)});
const darken  = (h,n) => { const[r,g,b]=hr(h); return`rgb(${Math.max(0,r-n)},${Math.max(0,g-n)},${Math.max(0,b-n)})`; };
const lighten = (h,n) => { const[r,g,b]=hr(h); return`rgb(${Math.min(255,r+n)},${Math.min(255,g+n)},${Math.min(255,b+n)})`; };
const hr = h => { const n=parseInt((h||"#888").replace("#","").padEnd(6,"0"),16); return[(n>>16)&255,(n>>8)&255,n&255]; };

export default function AiCityPage({ wsData }) {
  const canvasRef = useRef(null);
  const animRef   = useRef(null);
  const stateRef  = useRef({});

  const [isNight, setIsNight]   = useState(false);
  const [selectedBuilding, setSelectedBuilding] = useState(null);

  // Core city state: array of placed buildings (persists across task changes)
  // Each entry: { id, taskId, agentId, label, progress, status, plotPos, style, permanent }
  const [cityBuildings, setCityBuildings] = useState([]);
  const [plotIndex, setPlotIndex] = useState(0); // next available plot

  // Agent positions on roads
  const [agentPositions, setAgentPositions] = useState(() =>
    Object.fromEntries(Object.keys(AGENT_META).map(id => {
      const style = AGENT_STYLES[id];
      return [id, {
        x: 2 + Math.random()*4, y: 2 + Math.random()*4,
        tx:2, ty:2, walkTimer:60+Math.random()*80, bob:Math.random()*Math.PI*2
      }];
    }))
  );

  // ── SYNC TASKS → CITY BUILDINGS ──────────────────────────────────
  useEffect(() => {
    const tasks = wsData?.tasks || DEMO_TASKS;

    setCityBuildings(prev => {
      const next = [...prev];
      let nextPlot = plotIndex;

      tasks.forEach(task => {
        const existing = next.find(b => b.taskId === task.id);
        if (existing) {
          // Update progress
          existing.progress = task.progress;
          // Mark permanent when complete
          if (task.progress >= 100 || task.status === "complete") {
            existing.status = "complete";
            existing.permanent = true;
          } else {
            existing.status = task.status;
          }
        } else {
          // New task — assign next available plot
          if (nextPlot < PLOT_GRID.length) {
            const plotPos = PLOT_GRID[nextPlot];
            const agentStyle = AGENT_STYLES[task.agentId] || AGENT_STYLES.nexus;
            next.push({
              id: `building-${task.id}`,
              taskId: task.id,
              agentId: task.agentId,
              label: task.label,
              progress: task.progress || 0,
              status: task.status,
              permanent: task.progress >= 100,
              plotPos,
              ...agentStyle,
            });
            nextPlot++;
          }
        }
      });

      setPlotIndex(nextPlot);
      return next;
    });
  }, [wsData]);

  // Demo: simulate progress ticking
  useEffect(() => {
    if (wsData?.tasks) return; // real data present, skip simulation
    const iv = setInterval(() => {
      setCityBuildings(prev => prev.map(b => {
        if (b.permanent) return b;
        const rate = b.status==="active"?0.35:b.status==="idle"?0.07:0;
        const newProg = Math.min(100, b.progress + rate);
        return {
          ...b,
          progress: newProg,
          permanent: newProg >= 99.9,
          status: newProg >= 99.9 ? "complete" : b.status,
        };
      }));
    }, 100);
    return () => clearInterval(iv);
  }, [wsData]);

  // Move agents toward their active building site
  useEffect(() => {
    const iv = setInterval(() => {
      setAgentPositions(prev => {
        const next = {...prev};
        Object.keys(next).forEach(agentId => {
          const pos = {...next[agentId]};
          const building = cityBuildings.find(b => b.agentId === agentId && !b.permanent);
          const target = building
            ? {x: building.plotPos.tx + 0.5, y: building.plotPos.ty + 2.5}
            : {x: (PLOT_GRID[0].tx + 2), y: (PLOT_GRID[0].ty + 2)};

          const dx = pos.tx - pos.x, dy = pos.ty - pos.y;
          const dist = Math.sqrt(dx*dx+dy*dy);
          if (dist > 0.07) {
            pos.x += (dx/dist)*0.05;
            pos.y += (dy/dist)*0.05;
          } else {
            pos.x = pos.tx; pos.y = pos.ty;
            pos.walkTimer--;
            if (pos.walkTimer <= 0) {
              const bx = target.x + (Math.random()-0.5)*2;
              const by = target.y + (Math.random()-0.5)*1;
              pos.tx = bx; pos.ty = by;
              pos.walkTimer = 60 + Math.random()*80;
            }
          }
          next[agentId] = pos;
        });
        return next;
      });
    }, 50);
    return () => clearInterval(iv);
  }, [cityBuildings]);

  // ── DRAW HELPERS ──────────────────────────────────────────────────
  const cuboid = useCallback((ctx,sx,sy,fw,fd,h,cT,cL,cR)=>{
    if(h<=0) return;
    const hw=fw/2,hd=fd/2;
    ctx.beginPath();
    ctx.moveTo(sx,sy); ctx.lineTo(sx+hw,sy-hd); ctx.lineTo(sx+hw,sy-hd-h);
    ctx.lineTo(sx,sy-h); ctx.lineTo(sx-hw,sy-hd-h); ctx.lineTo(sx-hw,sy-hd);
    ctx.closePath(); ctx.fillStyle=cT; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(sx-hw,sy-hd); ctx.lineTo(sx,sy); ctx.lineTo(sx,sy-h); ctx.lineTo(sx-hw,sy-hd-h);
    ctx.closePath(); ctx.fillStyle=cL; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(sx+hw,sy-hd); ctx.lineTo(sx,sy); ctx.lineTo(sx,sy-h); ctx.lineTo(sx+hw,sy-hd-h);
    ctx.closePath(); ctx.fillStyle=cR; ctx.fill();
    ctx.strokeStyle="rgba(0,0,0,0.22)"; ctx.lineWidth=0.5;
    ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(sx,sy-h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx-hw,sy-hd); ctx.lineTo(sx-hw,sy-hd-h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx+hw,sy-hd); ctx.lineTo(sx+hw,sy-hd-h); ctx.stroke();
  },[]);

  const drawWindows = useCallback((ctx,sx,sy,fw,fd,floors,glass,night,t)=>{
    for(let f=0;f<floors;f++){
      const fy=sy-(f+0.6)*FH;
      for(let w=0;w<3;w++){
        const lx=sx-fw*0.35+w*(fw*0.28);
        const isLit=night?(Math.sin(t*0.001+f*3.7+w*5.1)>0.1):true;
        ctx.globalAlpha=isLit?(night?0.85:0.4):(night?0.05:0.04);
        ctx.fillStyle=isLit?(night?lighten(glass,15):glass+"77"):(night?"#040918":"rgba(0,0,0,0.2)");
        ctx.fillRect(lx-2.5,fy-3,5,FH*0.55);
        const rx=sx+fw*0.06+w*(fw*0.27);
        const isLit2=night?(Math.sin(t*0.001+f*4.2+w*6.3+1)>0.1):true;
        ctx.globalAlpha=isLit2?(night?0.75:0.3):(night?0.04:0.03);
        ctx.fillStyle=isLit2?(night?lighten(glass,10):glass+"55"):(night?"#040918":"rgba(0,0,0,0.15)");
        ctx.fillRect(rx-2.5,fy-3,5,FH*0.55);
      }
    }
    ctx.globalAlpha=1;
  },[]);

  // ── EMPTY LOT ─────────────────────────────────────────────────────
  const drawEmptyLot = useCallback((ctx,sx,sy,fw,fd,label,night)=>{
    const hw=fw/2,hd=fd/2;
    ctx.beginPath();
    ctx.moveTo(sx,sy); ctx.lineTo(sx+hw,sy-hd);
    ctx.lineTo(sx,sy-fd); ctx.lineTo(sx-hw,sy-hd);
    ctx.closePath();
    ctx.fillStyle=night?"#1a1510":"#2a2018"; ctx.fill();
    ctx.strokeStyle="rgba(255,200,0,0.35)"; ctx.lineWidth=0.8;
    ctx.setLineDash([4,4]); ctx.stroke(); ctx.setLineDash([]);
    [[sx,sy],[sx+hw,sy-hd],[sx,sy-fd],[sx-hw,sy-hd]].forEach(([px,py])=>{
      ctx.strokeStyle="#cc8800"; ctx.lineWidth=1.2;
      ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(px,py-7); ctx.stroke();
      ctx.fillStyle="#ffcc00"; ctx.shadowColor="#ffcc00"; ctx.shadowBlur=3;
      ctx.beginPath(); ctx.arc(px,py-7,1.8,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
    });
    ctx.font="bold 7px 'Plus Jakarta Sans',Arial,sans-serif";
    ctx.fillStyle="rgba(255,200,0,0.7)"; ctx.textAlign="center";
    ctx.fillText(label,sx,sy-hd/2+2);
  },[]);

  // ── SCAFFOLDING ───────────────────────────────────────────────────
  const drawScaffolding = useCallback((ctx,sx,sy,fw,fd,curH,night)=>{
    const hw=fw/2+3,hd=fd/2+3,scH=curH+12;
    const sc=night?"rgba(160,120,50,0.6)":"rgba(190,145,60,0.7)";
    ctx.strokeStyle=sc; ctx.lineWidth=0.9;
    [[sx-hw,sy-hd],[sx,sy],[sx+hw,sy-hd],[sx,sy-fd]].forEach(([cx,cy])=>{
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx,cy-scH); ctx.stroke();
    });
    ctx.strokeStyle=night?"rgba(140,100,40,0.45)":"rgba(170,130,50,0.55)"; ctx.lineWidth=0.7;
    for(let p=0;p<scH;p+=11){
      ctx.beginPath();
      ctx.moveTo(sx-hw,sy-hd-p); ctx.lineTo(sx,sy-p); ctx.lineTo(sx+hw,sy-hd-p); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx-hw,sy-hd-p); ctx.lineTo(sx,sy-fd-p); ctx.stroke();
    }
    ctx.strokeStyle=sc; ctx.lineWidth=0.5;
    for(let p=0;p<scH;p+=22){
      ctx.beginPath(); ctx.moveTo(sx,sy-p); ctx.lineTo(sx+hw,sy-hd-p-11); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx,sy-p-11); ctx.lineTo(sx+hw,sy-hd-p); ctx.stroke();
    }
  },[]);

  // ── DRAW BUILDING ─────────────────────────────────────────────────
  const drawBuilding = useCallback((ctx,b,night,t)=>{
    const sc=iso(b.plotPos.tx,b.plotPos.ty);
    const sx=sc.x,sy=sc.y;
    const fw=TW*0.84,fd=TH*0.84;
    const hw=fw/2,hd=fd/2;
    const maxH=b.maxFloors*FH;
    const pct=Math.min(100,b.progress);
    const curH=maxH*(pct/100);
    const builtFloors=Math.floor((pct/100)*b.maxFloors);
    const isDone=pct>=99.5;

    if(pct<1){drawEmptyLot(ctx,sx,sy,fw,fd,b.label,night);return;}

    // Ground plaza
    ctx.beginPath();
    ctx.moveTo(sx,sy); ctx.lineTo(sx+hw,sy-hd);
    ctx.lineTo(sx,sy-fd); ctx.lineTo(sx-hw,sy-hd);
    ctx.closePath();
    ctx.fillStyle=night?"#1e2835":"#2e3c4e"; ctx.fill();

    const topC  =lighten(b.wall,night?-25:22);
    const leftC =darken(b.wall, night?20:5);
    const rightC=lighten(b.wall,night?-18:10);

    if(b.style==="tower_podium"&&pct>15){
      const podH=Math.min(FH*2,curH);
      cuboid(ctx,sx,sy,fw*1.1,fd*1.1,podH,lighten(b.wall,28),darken(b.wall,12),lighten(b.wall,14));
      if(curH>podH){
        const tH=curH-podH;
        cuboid(ctx,sx,sy-podH,fw*0.86,fd*0.86,tH,topC,leftC,rightC);
        drawWindows(ctx,sx,sy-podH,fw*0.86,fd*0.86,Math.max(0,builtFloors-2),b.glass,night,t);
      }
    } else if(b.style==="civic_dome"){
      const baseH=curH*0.72;
      cuboid(ctx,sx,sy,fw,fd,baseH,topC,leftC,rightC);
      drawWindows(ctx,sx,sy,fw,fd,Math.floor(builtFloors*0.7),b.glass,night,t);
      if(pct>50){
        const dp=(pct-50)/50;
        const domeY=sy-baseH;
        const dRX=fw*0.42*dp,dRY=TH*0.5*dp;
        ctx.save(); ctx.globalAlpha=0.82;
        const dg=ctx.createRadialGradient(sx-4,domeY-dRY*0.8,1,sx,domeY,dRX);
        dg.addColorStop(0,lighten(b.glass,40));
        dg.addColorStop(0.5,b.glass+(night?"bb":"77"));
        dg.addColorStop(1,b.glass+"22");
        ctx.fillStyle=dg;
        ctx.beginPath(); ctx.ellipse(sx,domeY,dRX,dRY,0,Math.PI,0); ctx.fill();
        ctx.strokeStyle="rgba(255,255,255,0.3)"; ctx.lineWidth=1;
        ctx.beginPath(); ctx.ellipse(sx,domeY,dRX,dRY,0,Math.PI,0); ctx.stroke();
        ctx.restore();
      }
    } else if(b.style==="skyscraper"&&pct>10){
      const c=0.45, s1H=Math.min(curH,maxH*c);
      cuboid(ctx,sx,sy,fw,fd,s1H,lighten(b.wall,28),darken(b.wall,8),lighten(b.wall,16));
      drawWindows(ctx,sx,sy,fw,fd,Math.min(builtFloors,Math.floor(b.maxFloors*c)),b.glass,night,t);
      if(curH>maxH*c){
        const s2H=curH-maxH*c;
        cuboid(ctx,sx,sy-maxH*c,fw*0.84,fd*0.84,s2H,topC,leftC,rightC);
        drawWindows(ctx,sx,sy-maxH*c,fw*0.84,fd*0.84,Math.max(0,builtFloors-Math.floor(b.maxFloors*c)),b.glass,night,t);
      }
    } else {
      cuboid(ctx,sx,sy,fw,fd,curH,topC,leftC,rightC);
      drawWindows(ctx,sx,sy,fw,fd,builtFloors,b.glass,night,t);
      // Horizontal accent bands every 3 floors
      for(let band=3;band<builtFloors;band+=3){
        const by=sy-band*FH;
        ctx.globalAlpha=0.2; ctx.strokeStyle=lighten(b.wall,60); ctx.lineWidth=1;
        ctx.beginPath();
        ctx.moveTo(sx-hw,by-hd); ctx.lineTo(sx,by); ctx.lineTo(sx+hw,by-hd);
        ctx.stroke(); ctx.globalAlpha=1;
      }
    }

    // Rooftop
    if(pct>25&&b.style!=="civic_dome"){
      const roofY=sy-curH;
      const rw=b.style==="tower_podium"?fw*0.86:b.style==="skyscraper"?fw*0.84:fw;
      const rh=b.style==="tower_podium"?fd*0.86:b.style==="skyscraper"?fd*0.84:fd;
      ctx.beginPath();
      ctx.moveTo(sx,roofY); ctx.lineTo(sx+rw/2,roofY-rh/2);
      ctx.lineTo(sx,roofY-rh); ctx.lineTo(sx-rw/2,roofY-rh/2);
      ctx.closePath(); ctx.fillStyle=darken(b.wall,15); ctx.fill();
      ctx.strokeStyle=night?b.glass+"bb":b.glass+"55"; ctx.lineWidth=night?1.8:1;
      ctx.shadowColor=night?b.glass:"transparent"; ctx.shadowBlur=night?12:0;
      ctx.beginPath();
      ctx.moveTo(sx-rw/2,roofY-rh/2); ctx.lineTo(sx,roofY-rh); ctx.lineTo(sx+rw/2,roofY-rh/2);
      ctx.stroke(); ctx.shadowBlur=0;
    }

    // Antenna on tall complete buildings
    if(isDone&&b.maxFloors>9&&b.style!=="civic_dome"){
      const roofFd=b.style==="skyscraper"?fd*0.84:fd;
      const antBase=sy-curH-roofFd/2;
      ctx.strokeStyle=lighten(b.wall,70); ctx.lineWidth=1.2;
      ctx.beginPath(); ctx.moveTo(sx,antBase); ctx.lineTo(sx,antBase-22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx-4,antBase-14); ctx.lineTo(sx+4,antBase-14); ctx.stroke();
      const blink=Math.sin(t*0.004)>0;
      ctx.fillStyle=blink&&night?"#ff4444":"#881111";
      ctx.shadowColor=blink&&night?"#ff0000":"transparent"; ctx.shadowBlur=blink&&night?10:0;
      ctx.beginPath(); ctx.arc(sx,antBase-22,2.5,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
    }

    // Scaffolding while building
    if(pct>2&&pct<96) drawScaffolding(ctx,sx,sy,fw,fd,curH,night);

    // Completion sparkle burst (just finished)
    if(isDone){
      const meta=AGENT_META[b.agentId];
      if(meta){
        for(let sp=0;sp<3;sp++){
          const ang=sp/3*Math.PI*2+t*0.0005;
          const r=22+sp*6;
          ctx.globalAlpha=0.25;
          ctx.fillStyle=meta.glow; ctx.shadowColor=meta.glow; ctx.shadowBlur=8;
          ctx.beginPath();
          ctx.arc(sx+Math.cos(ang)*r,sy-curH/2+Math.sin(ang)*r*0.5,2.5,0,Math.PI*2);
          ctx.fill(); ctx.shadowBlur=0; ctx.globalAlpha=1;
        }
      }
    }

    // Progress indicator
    if(!isDone){
      const meta=AGENT_META[b.agentId];
      const barW=44,barH=5,barX=sx-barW/2;
      const barY=sy-curH-(pct<3?12:8);
      ctx.fillStyle="rgba(0,0,0,0.55)";
      ctx.beginPath(); ctx.roundRect(barX,barY,barW,barH,2); ctx.fill();
      const g=ctx.createLinearGradient(barX,0,barX+barW,0);
      g.addColorStop(0,meta?.color||"#17c1e8"); g.addColorStop(1,meta?.glow||"#01B574");
      ctx.fillStyle=g;
      ctx.beginPath(); ctx.roundRect(barX,barY,barW*(pct/100),barH,2); ctx.fill();
      ctx.font="bold 7px 'Plus Jakarta Sans',Arial,sans-serif";
      ctx.fillStyle="rgba(255,255,255,0.85)"; ctx.textAlign="center";
      ctx.fillText(`${Math.round(pct)}%`,sx,barY-2);
    }

    // Label
    ctx.font="bold 7.5px 'Plus Jakarta Sans',Arial,sans-serif";
    ctx.textAlign="center";
    ctx.fillStyle=night?"rgba(255,255,255,0.4)":"rgba(255,255,255,0.55)";
    ctx.fillText(b.label,sx,sy+15);
  },[cuboid,drawWindows,drawEmptyLot,drawScaffolding]);

  // ── TERRAIN ───────────────────────────────────────────────────────
  const drawTerrain = useCallback((ctx,night,buildings)=>{
    // Compute map bounds from placed buildings + margin
    const xs=buildings.map(b=>b.plotPos.tx), ys=buildings.map(b=>b.plotPos.ty);
    const minX=Math.max(0,(Math.min(...xs,0))-3);
    const maxX=Math.max(...xs,20)+4;
    const minY=Math.max(0,(Math.min(...ys,0))-3);
    const maxY=Math.max(...ys,20)+4;

    for(let y=maxY;y>=minY;y--) for(let x=minX;x<=maxX;x++){
      const sc=iso(x,y);
      const isRH=(y%4===0), isRV=(x%4===0), isCross=isRH&&isRV;
      const isPark=((x+y)%6===3&&!isRH&&!isRV);
      let fill;
      if(isCross)        fill=night?"#1e2838":"#344a5a";
      else if(isRH||isRV)fill=night?"#181f2c":"#283544";
      else if(isPark)    fill=night?"#0e1c0e":"#183616";
      else               fill=night?"#121e10":"#1e3818";
      const hw=TW/2,hh=TH/2;
      ctx.beginPath();
      ctx.moveTo(sc.x,sc.y); ctx.lineTo(sc.x+hw,sc.y-hh);
      ctx.lineTo(sc.x,sc.y-TH); ctx.lineTo(sc.x-hw,sc.y-hh);
      ctx.closePath(); ctx.fillStyle=fill; ctx.fill();
      ctx.strokeStyle=night?"rgba(255,255,255,0.04)":"rgba(255,255,255,0.07)";
      ctx.lineWidth=0.4; ctx.stroke();
      // Road line
      if((isRH||isRV)&&!isCross){
        ctx.globalAlpha=0.22;
        ctx.strokeStyle=night?"rgba(255,255,180,0.7)":"rgba(255,255,100,0.45)";
        ctx.lineWidth=0.6; ctx.setLineDash([4,7]);
        ctx.beginPath(); ctx.moveTo(sc.x,sc.y-1); ctx.lineTo(sc.x,sc.y-TH+1);
        ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha=1;
      }
      // Park grass
      if(isPark){
        ctx.globalAlpha=0.22; ctx.fillStyle=night?"#1a4016":"#3a7028";
        ctx.beginPath();
        ctx.moveTo(sc.x,sc.y-2); ctx.lineTo(sc.x+hw*0.65,sc.y-hh*0.65-2);
        ctx.lineTo(sc.x,sc.y-TH+2); ctx.lineTo(sc.x-hw*0.65,sc.y-hh*0.65-2);
        ctx.closePath(); ctx.fill(); ctx.globalAlpha=1;
      }
    }
  },[]);

  // ── TREE ──────────────────────────────────────────────────────────
  const drawTree = useCallback((ctx,tx,ty,night,t)=>{
    const sc=iso(tx,ty);
    const sx=sc.x,sy=sc.y,bob=Math.sin(t*0.0015+tx*1.7+ty)*1.2;
    ctx.globalAlpha=0.15; ctx.fillStyle="#000";
    ctx.beginPath(); ctx.ellipse(sx+2,sy+1,11,5,0,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1;
    ctx.fillStyle=night?"#3a2010":"#5D4037";
    ctx.fillRect(sx-2,sy-12+bob,4,10);
    [[17,0,night?"#0e240e":"#1B5E20"],[14,5,night?"#123012":"#2E7D32"],[10,10,night?"#163816":"#388E3C"],[7,14,night?"#1a4018":"#4CAF50"]].forEach(([r,l,c])=>{
      ctx.fillStyle=c; ctx.strokeStyle="rgba(0,0,0,0.18)"; ctx.lineWidth=0.4;
      ctx.beginPath(); ctx.ellipse(sx,sy-14-l+bob,r,r*0.65,0,0,Math.PI*2);
      ctx.fill(); ctx.stroke();
    });
  },[]);

  // ── ANIME ANDROID ─────────────────────────────────────────────────
  const drawAndroid = useCallback((ctx,agentId,pos,buildings,t)=>{
    const meta=AGENT_META[agentId]; if(!meta) return;
    const sc=iso(pos.x,pos.y);
    const sx=sc.x,bob=Math.sin(t*0.003+pos.bob)*2;
    const sy=sc.y-13+bob;
    const activeBuild=buildings.find(b=>b.agentId===agentId&&!b.permanent);
    const state=!activeBuild?"idle":activeBuild.status==="active"?"active":activeBuild.status==="pending"?"pending":"idle";
    const isActive=state==="active",isPending=state==="pending";

    ctx.save();
    ctx.globalAlpha=0.2; ctx.fillStyle="#000";
    ctx.beginPath(); ctx.ellipse(sx,sc.y,8,4,0,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1;
    if(isActive){ctx.shadowColor=meta.glow; ctx.shadowBlur=20;}

    // Legs
    const fb=isPending?Math.sin(t*0.012)*3:0;
    ctx.fillStyle=darken(meta.color,30); ctx.strokeStyle="rgba(0,0,0,0.65)"; ctx.lineWidth=1.1;
    ctx.beginPath(); ctx.roundRect(sx-5,sy+12,5,7+fb,2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(sx+1,sy+12,5,7-fb,2); ctx.fill(); ctx.stroke();
    ctx.fillStyle=darken(meta.color,45);
    ctx.beginPath(); ctx.ellipse(sx-3,sy+19+fb,3.5,2,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx+4,sy+19-fb,3.5,2,0,0,Math.PI*2); ctx.fill();

    // Torso
    ctx.fillStyle=meta.color; ctx.strokeStyle="rgba(0,0,0,0.7)"; ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.roundRect(sx-6,sy,12,11,3); ctx.fill(); ctx.stroke();
    ctx.fillStyle="rgba(0,0,0,0.2)"; ctx.beginPath(); ctx.roundRect(sx-3,sy+2,8,6,2); ctx.fill();
    const lc=isActive?"#00ff88":isPending?"#ffaa00":"#445566";
    ctx.fillStyle=lc; ctx.shadowColor=lc; ctx.shadowBlur=isActive?12:4;
    ctx.beginPath(); ctx.arc(sx,sy+5.5,1.8,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;

    // Arms
    ctx.fillStyle=darken(meta.color,20); ctx.strokeStyle="rgba(0,0,0,0.6)"; ctx.lineWidth=1;
    if(isActive){
      const w=Math.sin(t*0.007)*7;
      ctx.beginPath(); ctx.roundRect(sx-10,sy-3+w*0.3,4,8,2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(sx+7,sy-3-w*0.3,4,8,2); ctx.fill(); ctx.stroke();
      ctx.fillStyle=lighten(meta.color,30);
      ctx.beginPath(); ctx.arc(sx-8,sy-3+w*0.3,2.8,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(sx+9,sy-3-w*0.3,2.8,0,Math.PI*2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.roundRect(sx-10,sy+2,4,8,2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(sx+7,sy+2,4,8,2); ctx.fill(); ctx.stroke();
    }
    ctx.shadowBlur=0;

    // Head (chibi)
    const hy=sy-14;
    ctx.fillStyle=darken(meta.hair,15); ctx.strokeStyle="rgba(0,0,0,0.6)"; ctx.lineWidth=1;
    ctx.beginPath(); ctx.ellipse(sx,hy-2,9.5,11,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle=lighten(meta.color,42); ctx.strokeStyle="rgba(0,0,0,0.7)"; ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.ellipse(sx,hy,7.5,9,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle="rgba(255,255,255,0.13)";
    ctx.beginPath(); ctx.ellipse(sx-2,hy-3,3.5,4.5,0.3,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=meta.hair; ctx.strokeStyle="rgba(0,0,0,0.55)"; ctx.lineWidth=0.9;
    ctx.beginPath();
    ctx.moveTo(sx-8.5,hy-1); ctx.quadraticCurveTo(sx-4,hy-14,sx,hy-13);
    ctx.quadraticCurveTo(sx+4,hy-14,sx+8.5,hy-1);
    ctx.lineTo(sx+7.5,hy-5); ctx.quadraticCurveTo(sx,hy-16,sx-7.5,hy-5);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle="rgba(255,255,255,0.2)";
    ctx.beginPath(); ctx.ellipse(sx-2,hy-9,2.8,2.2,0.4,0,Math.PI*2); ctx.fill();

    // Big anime eyes
    ctx.fillStyle="rgba(255,255,255,0.95)";
    ctx.beginPath(); ctx.ellipse(sx-3,hy-1,3.2,4.2,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx+3,hy-1,3.2,4.2,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=meta.eye;
    ctx.shadowColor=isActive?meta.glow:"transparent"; ctx.shadowBlur=isActive?8:0;
    ctx.beginPath(); ctx.ellipse(sx-3,hy-1,2.4,3.4,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx+3,hy-1,2.4,3.4,0,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
    const dx2=isPending?Math.sin(t*0.015)*1:0;
    ctx.fillStyle="rgba(0,0,0,0.85)";
    ctx.beginPath(); ctx.ellipse(sx-3+dx2,hy-1,1.4,2.1,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx+3+dx2,hy-1,1.4,2.1,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="rgba(255,255,255,0.97)";
    ctx.beginPath(); ctx.arc(sx-2,hy-2.5,1,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx+4,hy-2.5,1,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle="rgba(0,0,0,0.75)"; ctx.lineWidth=1.1;
    ctx.beginPath(); ctx.ellipse(sx-3,hy-1,3.2,4.2,0,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(sx+3,hy-1,3.2,4.2,0,0,Math.PI*2); ctx.stroke();

    // Blush
    ctx.globalAlpha=isActive?0.6:0.28; ctx.fillStyle=meta.blush;
    ctx.beginPath(); ctx.ellipse(sx-7,hy+1,2.8,1.8,0.3,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx+7,hy+1,2.8,1.8,-0.3,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=1;

    // Mouth
    ctx.strokeStyle="rgba(0,0,0,0.6)"; ctx.lineWidth=1;
    if(isActive){
      ctx.beginPath(); ctx.arc(sx,hy+4,2.8,0.1,Math.PI-0.1); ctx.stroke();
    } else if(isPending){
      ctx.beginPath(); ctx.moveTo(sx-2.5,hy+4.5);
      ctx.quadraticCurveTo(sx,hy+3.5,sx+2.5,hy+4.5); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(sx-2.5,hy+4); ctx.lineTo(sx+2.5,hy+4); ctx.stroke();
    }

    // Active sparkles
    if(isActive){
      for(let sp=0;sp<4;sp++){
        const sph=((t*0.002+sp*0.4)%1);
        const ang=sp/4*Math.PI*2+t*0.001;
        ctx.globalAlpha=(1-sph)*0.85;
        ctx.fillStyle=sp%2===0?meta.glow:"#ffffff"; ctx.shadowColor=meta.glow; ctx.shadowBlur=5;
        ctx.save(); ctx.translate(sx+Math.cos(ang)*(12+sp*2),hy+Math.sin(ang)*6); ctx.rotate(t*0.005+sp);
        const ss=1.8*(1-sph);
        ctx.beginPath();
        ctx.moveTo(0,-ss*2); ctx.lineTo(ss*0.5,-ss*0.5); ctx.lineTo(ss*2,0); ctx.lineTo(ss*0.5,ss*0.5);
        ctx.lineTo(0,ss*2); ctx.lineTo(-ss*0.5,ss*0.5); ctx.lineTo(-ss*2,0); ctx.lineTo(-ss*0.5,-ss*0.5);
        ctx.closePath(); ctx.fill(); ctx.restore(); ctx.shadowBlur=0; ctx.globalAlpha=1;
      }
    }

    // Pending sweat drop
    if(isPending){
      ctx.fillStyle="#90CAF9"; ctx.globalAlpha=0.9;
      const swY=hy-11+Math.sin(t*0.006)*2;
      ctx.beginPath(); ctx.moveTo(sx+11,swY-5);
      ctx.bezierCurveTo(sx+14,swY-2,sx+14,swY+2,sx+11,swY+2);
      ctx.bezierCurveTo(sx+8,swY+2,sx+8,swY-2,sx+11,swY-5);
      ctx.fill(); ctx.globalAlpha=1;
    }

    // Name tag
    ctx.globalAlpha=0.9; ctx.fillStyle="rgba(0,0,0,0.65)";
    ctx.beginPath(); ctx.roundRect(sx-15,sy+20,30,10,3); ctx.fill();
    ctx.font="bold 7px 'Plus Jakarta Sans',Arial,sans-serif";
    ctx.fillStyle=meta.color; ctx.textAlign="center";
    ctx.fillText(meta.name,sx,sy+28); ctx.globalAlpha=1;
    ctx.restore();
  },[]);

  // ── MAIN RENDER ───────────────────────────────────────────────────
  const render = useCallback((t) => {
    const canvas=canvasRef.current; if(!canvas) return;
    const ctx=canvas.getContext("2d");
    const W=canvas.width,H=canvas.height;
    const {night,buildings,agentPos}=stateRef.current;

    ctx.clearRect(0,0,W,H);

    // Sky
    const sky=ctx.createLinearGradient(0,0,0,H);
    if(night){sky.addColorStop(0,"#010a1e");sky.addColorStop(1,"#030f2c");}
    else{sky.addColorStop(0,"#091530");sky.addColorStop(0.5,"#122045");sky.addColorStop(1,"#1a2c58");}
    ctx.fillStyle=sky; ctx.fillRect(0,0,W,H);

    // Stars
    if(night){
      for(let s=0;s<180;s++){
        const stx=(s*193+70)%W,sty=(s*107+15)%(H*0.45);
        const tw=Math.sin(t*0.001+s*0.8)*0.35+0.65;
        ctx.globalAlpha=tw*0.65;
        ctx.fillStyle=s%7===0?"#17c1e8":s%9===0?"#CE93D8":"white";
        ctx.beginPath(); ctx.arc(stx,sty,s%4===0?1.5:0.9,0,Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha=1;
    }

    ctx.save();
    ctx.translate(W*0.5, H*0.36);
    ctx.scale(SCALE, SCALE);

    // Terrain
    drawTerrain(ctx,night,buildings);

    // Trees between roads
    const treePts=[];
    buildings.forEach(b=>{
      treePts.push({x:b.plotPos.tx+2,y:b.plotPos.ty},{x:b.plotPos.tx,y:b.plotPos.ty+2});
    });
    if(treePts.length===0) for(let i=0;i<8;i++) treePts.push({x:i*2,y:2});

    const items=[
      ...treePts.slice(0,20).map(tr=>({sort:tr.x+tr.y-0.3,draw:()=>drawTree(ctx,tr.x,tr.y,night,t)})),
      ...buildings.map(b=>({sort:b.plotPos.tx+b.plotPos.ty-0.1,draw:()=>drawBuilding(ctx,b,night,t)})),
      ...Object.entries(agentPos).map(([id,pos])=>({
        sort:pos.x+pos.y+0.2,
        draw:()=>drawAndroid(ctx,id,pos,buildings,t)
      })),
    ];
    items.sort((a,b)=>a.sort-b.sort);
    items.forEach(i=>i.draw());

    ctx.restore();

    // Vignette
    const vig=ctx.createRadialGradient(W/2,H/2,H*0.2,W/2,H/2,H*0.92);
    vig.addColorStop(0,"transparent");
    vig.addColorStop(1,night?"rgba(0,0,0,0.7)":"rgba(0,0,0,0.4)");
    ctx.fillStyle=vig; ctx.fillRect(0,0,W,H);
  },[drawTerrain,drawTree,drawBuilding,drawAndroid]);

  useEffect(()=>{
    stateRef.current={night:isNight,buildings:cityBuildings,agentPos:agentPositions};
  },[isNight,cityBuildings,agentPositions]);

  useEffect(()=>{
    const canvas=canvasRef.current; if(!canvas) return;
    const resize=()=>{
      const dpr=window.devicePixelRatio||1;
      const w=canvas.offsetWidth,h=canvas.offsetHeight;
      canvas.width=w*dpr; canvas.height=h*dpr;
      canvas.getContext("2d").scale(dpr,dpr);
    };
    resize(); window.addEventListener("resize",resize);
    let running=true;
    const loop=t=>{if(!running)return;render(t);animRef.current=requestAnimationFrame(loop);};
    animRef.current=requestAnimationFrame(loop);
    return()=>{running=false;cancelAnimationFrame(animRef.current);window.removeEventListener("resize",resize);};
  },[render]);

  const ctrlBtn={padding:"6px 14px",borderRadius:8,border:"1px solid rgba(255,255,255,0.1)",cursor:"pointer",fontSize:12,fontWeight:600,background:"rgba(255,255,255,0.06)",color:"rgba(255,255,255,0.6)",transition:"all 0.2s",fontFamily:"'Plus Jakarta Sans',sans-serif"};
  const activeBtn={background:"linear-gradient(310deg,#17c1e8,#0075FF)",color:"white",borderColor:"transparent",boxShadow:"0 3px 8px rgba(23,193,232,0.4)"};

  const completedCount=cityBuildings.filter(b=>b.permanent).length;
  const activeCount=cityBuildings.filter(b=>b.status==="active").length;

  return(
    <div style={{position:"relative",height:"calc(100vh - 120px)",display:"flex",flexDirection:"column",gap:10,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div>
          <h2 style={{color:"#fff",fontSize:18,fontWeight:800,margin:0}}>AI-City</h2>
          <p style={{color:"rgba(255,255,255,0.4)",fontSize:12,margin:"2px 0 0"}}>
            {completedCount} buildings complete · {activeCount} under construction · city expands with every task
          </p>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setIsNight(false)} style={{...ctrlBtn,...(!isNight?activeBtn:{})}}>☀️ Day</button>
          <button onClick={()=>setIsNight(true)}  style={{...ctrlBtn,...(isNight?activeBtn:{})}}>🌙 Night</button>
        </div>
      </div>

      <div style={{flex:1,display:"flex",gap:12,minHeight:0}}>
        <div style={{flex:1,borderRadius:20,overflow:"hidden",position:"relative",background:"rgba(0,0,0,0.45)",border:"1px solid rgba(255,255,255,0.1)"}}>
          <canvas ref={canvasRef} style={{width:"100%",height:"100%",display:"block"}}/>
          {isNight&&<div style={{position:"absolute",top:14,right:18,fontSize:26,filter:"drop-shadow(0 0 10px rgba(150,200,255,0.6))"}}>🌙</div>}
        </div>

        {/* City status panel */}
        <div style={{width:192,flexShrink:0,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:20,padding:"14px 10px",backdropFilter:"blur(21px)",display:"flex",flexDirection:"column",gap:4,overflowY:"auto"}}>
          <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.3)",textTransform:"uppercase",letterSpacing:1,marginBottom:5}}>City Districts</div>
          {cityBuildings.length===0&&(
            <div style={{color:"rgba(255,255,255,0.25)",fontSize:11,textAlign:"center",padding:"20px 0"}}>
              Awaiting tasks from agents...
            </div>
          )}
          {cityBuildings.map(b=>{
            const meta=AGENT_META[b.agentId];
            const pct=Math.round(b.progress);
            return(
              <div key={b.id} onClick={()=>setSelectedBuilding(s=>s?.id===b.id?null:b)} style={{padding:"7px 9px",borderRadius:10,cursor:"pointer",background:selectedBuilding?.id===b.id?"rgba(255,255,255,0.08)":"rgba(255,255,255,0.02)",border:`1px solid ${selectedBuilding?.id===b.id?(meta?.color||"#17c1e8")+"44":"rgba(255,255,255,0.05)"}`,transition:"all 0.15s"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                  <div style={{width:7,height:7,borderRadius:"50%",background:meta?.color||"#888",boxShadow:b.status==="active"?`0 0 6px ${meta?.color||"#888"}`:"none",flexShrink:0}}/>
                  <span style={{fontSize:10,fontWeight:700,color:"#fff",letterSpacing:0.3,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.label}</span>
                  <span style={{fontSize:10,fontWeight:700,color:b.permanent?"#01B574":meta?.color||"#888"}}>{pct}%</span>
                </div>
                <div style={{height:3,background:"rgba(255,255,255,0.07)",borderRadius:2,overflow:"hidden",marginBottom:3}}>
                  <div style={{height:"100%",width:`${pct}%`,background:b.permanent?`linear-gradient(90deg,#01B574,#00d09c)`:`linear-gradient(90deg,${meta?.color||"#888"},${meta?.glow||"#aaa"})`,borderRadius:2,transition:"width 0.5s"}}/>
                </div>
                <div style={{fontSize:9,color:"rgba(255,255,255,0.28)"}}>{meta?.name||b.agentId} · {b.permanent?"✅ Complete":b.status}</div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedBuilding&&(()=>{
        const meta=AGENT_META[selectedBuilding.agentId];
        return(
          <div style={{position:"absolute",bottom:55,left:16,background:"rgba(6,11,38,0.96)",border:`1px solid ${meta?.color||"#17c1e8"}55`,borderRadius:16,padding:"12px 16px",backdropFilter:"blur(21px)",boxShadow:`0 8px 32px rgba(0,0,0,0.5)`,minWidth:210,zIndex:10}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
              <div style={{width:12,height:12,borderRadius:"50%",background:meta?.color||"#888",boxShadow:`0 0 10px ${meta?.color||"#888"}`}}/>
              <span style={{fontSize:13,fontWeight:800,color:"#fff"}}>{selectedBuilding.label}</span>
              <button onClick={()=>setSelectedBuilding(null)} style={{marginLeft:"auto",background:"none",border:"none",color:"rgba(255,255,255,0.4)",cursor:"pointer",fontSize:18,lineHeight:1}}>×</button>
            </div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.6)",lineHeight:1.9}}>
              <div>Agent: <span style={{color:meta?.color||"#888"}}>{meta?.name||selectedBuilding.agentId}</span></div>
              <div>Status: <span style={{color:"#fff"}}>{selectedBuilding.permanent?"✅ Complete":selectedBuilding.status}</span></div>
              <div>Progress: <span style={{color:meta?.color||"#888"}}>{Math.round(selectedBuilding.progress)}%</span></div>
              <div>Style: <span style={{color:"#fff"}}>{selectedBuilding.style}</span></div>
              {selectedBuilding.permanent&&<div style={{color:"#01B574",fontWeight:700,marginTop:4}}>🏙️ Permanent landmark</div>}
            </div>
          </div>
        );
      })()}

      <div style={{display:"flex",gap:18,padding:"6px 14px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:10,flexShrink:0,flexWrap:"wrap"}}>
        {[["🟡","Empty lot — task pending","rgba(255,200,0,0.7)"],["🏗️","Scaffolding — building in progress","#17c1e8"],["✅","Complete — permanent landmark","#01B574"],["🌆","City expands with every new task","#FFA726"]].map(([icon,label,color])=>(
          <div key={label} style={{display:"flex",alignItems:"center",gap:5,fontSize:11}}>
            <span>{icon}</span><span style={{color}}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
