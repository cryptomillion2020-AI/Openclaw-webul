const {test,expect}=require('./isolated-fixtures.cjs');
const {createHash}=require('node:crypto');const fs=require('node:fs');const path=require('node:path');
test.beforeEach(async({context,baseURL})=>{
 const origin=new URL(baseURL).origin;
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.origin===origin)return route.continue();
  if(u.hostname==='www.tradingview-widget.com')return route.fulfill({status:200,contentType:'text/html',body:'<title>ISOLATED FRAME FIXTURE</title>'});
  return route.abort();
 });
});
test('candidate served assets equal its production build; no host-state snapshot',async({request})=>{
 const response=await request.get('/');expect(response.status()).toBe(200);const html=await response.text();
 for(const name of ['/index.html',...Array.from(html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g),x=>x[1])]){
  const r=await request.get(name);expect(r.status()).toBe(200);
  const expected=fs.readFileSync(path.join(__dirname,'../dist',name));
  expect(createHash('sha256').update(await r.body()).digest('hex')).toBe(createHash('sha256').update(expected).digest('hex'));
 }
 const s=await(await request.get('/api/trading/snapshot')).json();expect(s.fixture).toBe(true);expect(s.live_mode).toBe(false);expect(s.perp.state).toBe('unavailable');expect(s.journal.admission).toBe(false);expect(Object.values(s.safety_layers)).toEqual([false,false,false,false]);
});
test('isolated production desk: reconnect, no-data, paper refusal, spot and policy',async({page})=>{
 const errors=[];const sockets=[];page.on('pageerror',e=>errors.push(e.message));page.on('websocket',w=>sockets.push(w.url()));
 await page.goto('/?page=trading');await page.waitForLoadState('networkidle');
 await expect(page.getByText('Market API: connected',{exact:true})).toBeVisible();
 await expect(page.getByText('FIXTURE — ISOLATED TEST DATA, NOT LIVE')).toBeVisible();
 await expect(page.getByText('No perpetual data',{exact:true})).toBeVisible();
 await expect(page.locator('.tw-connection')).toContainText('Fleet socket: connected');
 const before=sockets.length;await page.getByRole('button',{name:'Reconnect / refresh'}).click();
 await expect.poll(()=>sockets.length).toBeGreaterThan(before);await expect(page.locator('.tw-connection')).toContainText('Fleet socket: connected');
 expect(sockets.every(u=>u===new URL('/ws',page.url()).href.replace('http:','ws:'))).toBe(true);
 await page.getByLabel('Market type').selectOption('spot');await expect(page.getByText('Spot unavailable',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Connections & policy',exact:true}).click();await expect(page.locator('.tw-policy')).toContainText('UNSET');
 await page.getByRole('button',{name:'Paper workspace',exact:true}).click();await page.getByLabel('Quantity (draft only)').fill('1');
 await page.getByRole('button',{name:'Check paper readiness',exact:true}).click();await expect(page.getByText('Server refused admission')).toBeVisible();
 await expect(page.locator('.tw-admission')).toContainText('risk policy unset');await expect(page.getByRole('button',{name:'Journal / order — disabled'})).toBeDisabled();
 await page.getByLabel('Quantity (draft only)').fill('2');await expect(page.getByText('Server refused admission')).toHaveCount(0);
 expect(errors).toEqual([]);
});
test('negative controls: forged authorization and every live route refuse admission',async({request})=>{
 for(const route of ['/api/orders','/api/broker','/api/webhooks','/api/credentials','/api/trading/order','/api/trading/live']){
  const r=await request.post(route,{data:{mode:'live',architect_authorized:true}});expect(r.status()).toBe(404);expect((await r.json()).admitted).toBe(false);
 }
 const r=await request.post('/api/trading/preflight',{data:{mode:'paper',symbol:'BTC-USDT',side:'buy',quantity:'1',instrument_class:'crypto_perp',architect_authorized:true}});
 expect((await r.json()).admitted).toBe(false);
 expect((await request.get('/api/trading/snapshot',{headers:{Origin:'https://untrusted.invalid'}})).status()).toBe(403);
});
