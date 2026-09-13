const { test, expect } = require('./isolated-fixtures.cjs');
const fs=require('node:fs');const path=require('node:path');
const evidence=process.env.WEBUI_EVIDENCE_DIR;
const screenshot=async(page,name)=>{if(evidence)await page.locator('.main-content').screenshot({path:path.join(evidence,name+'.png')});};
const fixture=()=>({schema_version:'trading-webui-1',fixture:true,observed_at:new Date().toISOString(),live_mode:false,policy:{max_leverage:null,max_funding_cost_fraction:null,holding_horizon_intervals:null,risk_per_trade:null,architect_authorized:false},perp:{state:'fresh',source:'isolated BloFin-contract fixture',generated_at:new Date().toISOString(),ttl_seconds:300,rows:[{symbol:'BTC-USDT',last:100,bid:99,ask:101,mark:100,funding_rate:null,observed_at_ms:Date.now(),state:'fresh'}]},spot:{state:'unavailable',rows:[],reason:'No verified spot interface'},journal:{state:'unavailable',admission:false}});
const noThirdParty=async(page)=>page.route('https://www.tradingview-widget.com/**',r=>r.fulfill({status:200,contentType:'text/html',body:'<title>Isolated chart frame fixture</title>'}));

test('live public API, paper preflight, socket reconnect and main controls',async({page,request})=>{
 const errors=[],network=[],socketUrls=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/api/trading/'))network.push({url:new URL(r.url()).pathname,status:r.status()});});page.on('websocket',w=>socketUrls.push(w.url()));
 await page.addInitScript(()=>{const Native=window.WebSocket;window.__testSockets=[];window.WebSocket=class extends Native{constructor(...args){super(...args);window.__testSockets.push(this);}};});
 await page.goto('/?page=trading');await page.waitForLoadState('networkidle');
 await expect(page.getByText('Market API: connected',{exact:true})).toBeVisible();
 const api=await(await request.get('/api/trading/snapshot')).json();expect(api.fixture).toBeUndefined();expect(api.live_mode).toBe(false);expect(api.policy.max_leverage).toBeNull();
 await expect(page.locator('.tw-state')).toContainText(api.perp.state.toUpperCase());
 await screenshot(page,'live-trading-main');
 await page.getByLabel('Market type').selectOption('spot');await expect(page.getByText('Spot unavailable',{exact:true})).toBeVisible();await expect(page.locator('.trading-workspace table')).toHaveCount(0);
 await page.getByRole('button',{name:'Connections & policy',exact:true}).click();await expect(page.locator('.tw-policy')).toContainText('UNSET');await expect(page.locator('.tw-policy')).toContainText('NOT AUTHORIZED');
 await page.getByRole('button',{name:'Paper workspace',exact:true}).click();
 await page.getByLabel('Quantity (draft only)').fill('1');await page.getByRole('button',{name:'Check paper readiness',exact:true}).click();
 await expect(page.getByText('Server refused admission')).toBeVisible();await expect(page.locator('.tw-admission')).toContainText('risk policy unset');await expect(page.getByRole('button',{name:'Journal / order — disabled'})).toBeDisabled();
 await screenshot(page,'live-paper-refusal');
 await page.getByLabel('Quantity (draft only)').fill('2');await expect(page.getByText('Server refused admission')).toHaveCount(0);
 const before=socketUrls.length;await page.evaluate(()=>window.__testSockets.forEach(ws=>ws.close()));await expect(page.locator('.tw-connection')).toContainText('disconnected');
 await page.getByRole('button',{name:'Reconnect / refresh'}).click();await expect(page.locator('.tw-connection')).toContainText('Fleet socket: connected');expect(socketUrls.length).toBeGreaterThan(before);
 await page.getByRole('button',{name:'Navigate to Comms'}).click();await expect(page).toHaveURL(/page=comms/);await page.goBack();await expect(page.locator('.trading-workspace')).toBeVisible();
 expect(errors).toEqual([]);if(evidence)fs.writeFileSync(path.join(evidence,'live-browser-network.json'),JSON.stringify({errors,network,socketUrls,perpState:api.perp.state,sourceHash:api.perp.source_sha256},null,2));
});

test('isolated loading, empty, API error and recovery are explicit',async({page})=>{
 await noThirdParty(page);let mode='loading';
 await page.route('**/api/trading/snapshot',async route=>{
  if(mode==='loading')await new Promise(r=>setTimeout(r,1400));
  if(mode==='error')return route.fulfill({status:503,contentType:'application/json',body:'{}'});
  const f=fixture();f.perp.state='empty';f.perp.rows=[];
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(f)});
 });
 await page.goto('/?page=trading');await expect(page.getByText('Loading local public-market snapshot… No values inferred.')).toBeVisible();
 await expect(page.getByText('No perpetual data',{exact:true})).toBeVisible();await expect(page.getByText('FIXTURE — ISOLATED TEST DATA, NOT LIVE')).toBeVisible();await screenshot(page,'fixture-empty');
 mode='error';await page.getByRole('button',{name:'Reconnect / refresh'}).click();await expect(page.getByText(/Market API disconnected\. Last response/)).toBeVisible();await screenshot(page,'fixture-error');
 mode='empty';await page.getByRole('button',{name:'Reconnect / refresh'}).click();await expect(page.getByText('Market API: connected',{exact:true})).toBeVisible();
});

test('isolated stale/unknown-funding state and preflight failure are not optimistic',async({page})=>{
 await noThirdParty(page);await page.route('**/api/trading/snapshot',r=>{const f=fixture();f.perp.generated_at=new Date(Date.now()-400000).toISOString();return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(f)});});
 await page.route('**/api/trading/preflight',r=>r.fulfill({status:503,body:'unavailable'}));
 await page.goto('/?page=trading');await expect(page.locator('.tw-state')).toContainText('STALE');await expect(page.locator('.trading-workspace tbody')).toContainText('UNAVAILABLE');await screenshot(page,'fixture-stale');
 await page.getByRole('button',{name:'Paper workspace',exact:true}).click();await page.getByLabel('Quantity (draft only)').fill('1');await page.getByRole('button',{name:'Check paper readiness',exact:true}).click();await expect(page.getByText(/Readiness check unavailable/)).toBeVisible();
});

test('mobile desk and paper controls fit without document overflow',async({page})=>{
 await noThirdParty(page);await page.setViewportSize({width:390,height:844});await page.goto('/?page=trading');await page.waitForLoadState('networkidle');
 const hide=page.getByRole('button',{name:'Hide sidebar'});if(await hide.isVisible())await hide.click();
 await expect(page.locator('.trading-workspace')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 await screenshot(page,'mobile-trading');await page.getByRole('button',{name:'Paper workspace',exact:true}).click();await expect(page.getByLabel('Quantity (draft only)')).toBeVisible();await screenshot(page,'mobile-paper');
});
