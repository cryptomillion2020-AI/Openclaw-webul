const {test,expect}=require('@playwright/test');const path=require('node:path');
test.beforeEach(async({context,page})=>{await context.setExtraHTTPHeaders({'x-fixture-owner':require('node:crypto').randomUUID()});page.on('dialog',d=>d.accept());await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin==='http://127.0.0.1:5197')return r.continue();return r.abort();});});
async function desk(page){await page.goto('/?page=trading');await page.waitForLoadState('networkidle');const hide=page.getByRole('button',{name:'Hide sidebar'});if(await hide.isVisible())await hide.click();await page.getByRole('button',{name:'Paper workspace',exact:true}).click();await expect(page.getByText(/ISOLATED TEST LEDGER/)).toBeVisible();}
async function ticket(page,qty='1'){await page.getByLabel('Quantity',{exact:true}).fill(qty);await page.getByLabel('Confirm this specific PAPER ticket').check();}
test('chart points at BloFin, is display-only, and refuses unknown venue instruments without fallback',async({page},info)=>{
 await desk(page);const surface=page.getByTestId('tradingview-surface');
 await expect(surface).toHaveAttribute('data-display-symbol','BLOFIN:BTCUSDT.P');
 // Selecting a BloFin perp visibly repoints exchange:ticker; stays BloFin, never Binance/AAPL.
 await page.getByLabel('BloFin chart instrument').fill('ETH-USDT');await page.getByRole('button',{name:'Apply chart symbol'}).click();await page.getByRole('combobox',{name:'Chart interval',exact:true}).selectOption('60');
 await expect(surface).toHaveAttribute('data-display-symbol','BLOFIN:ETHUSDT.P');
 // The paper instrument is independent of the chart selection.
 await expect(page.getByTestId('selected-instrument')).toContainText('BTC-USDT');
 // Unknown-on-venue -> explicit unavailable, NO silent fallback (display symbol unchanged).
 await page.getByLabel('BloFin chart instrument').fill('FAKE-USDT');await page.getByRole('button',{name:'Apply chart symbol'}).click();
 await expect(page.getByTestId('tradingview-venue-error')).toContainText('Not available on BloFin');
 await expect(surface).toHaveAttribute('data-display-symbol','BLOFIN:ETHUSDT.P');
 await page.locator('.tradingview-surface').screenshot({path:path.resolve('../revision-v2-evidence/'+info.project.name+'-chart-selector.png')});
});
test('ledger refresh exposes explicit states and distinguishes auth-expiry from network',async({page})=>{
 await desk(page);const rs=page.getByTestId('refresh-state');
 await expect(rs).toHaveAttribute('data-refresh-state','success');await expect(rs).toContainText('Last refreshed');
 await page.route('**/api/trading/paper/ledger',r=>r.fulfill({status:401,json:{error:'authentication_required'}}));
 await page.getByRole('button',{name:'Refresh paper ledger'}).click();
 await expect(rs).toHaveAttribute('data-refresh-state','error');await expect(rs).toContainText('[auth]');
 await page.route('**/api/trading/paper/status',r=>r.abort());
 await page.getByRole('button',{name:'Refresh paper ledger'}).click();
 await expect(rs).toContainText('[network]');
});
test('instrument search uses the BloFin catalog; catalog-only instruments cannot be paper-filled',async({page},info)=>{
 await desk(page);
 await page.getByLabel('Search BloFin instruments').fill('SOL');
 await expect(page.getByTestId('catalog-results')).toContainText('SOL-USDT');
 await page.getByRole('button',{name:/^SOL-USDT/}).first().click();
 await expect(page.getByTestId('selected-instrument')).toContainText('SOL-USDT');
 await expect(page.getByTestId('not-fillable')).toBeVisible();
 await page.getByLabel('Quantity',{exact:true}).fill('1');await page.getByLabel('Confirm this specific PAPER ticket').check();
 await expect(page.getByRole('button',{name:'Confirm & submit paper trade'})).toBeDisabled();
 // Spot is catalog-listed under its own verified endpoint but never paper-fillable.
 await page.getByRole('button',{name:/^Spot \(/}).click();
 await page.getByLabel('Search BloFin instruments').fill('ETH-USDT');
 await expect(page.getByTestId('catalog-results')).toContainText('SPOT');
 await page.locator('[aria-label="Paper controls"]').screenshot({path:path.resolve('../revision-v2-evidence/'+info.project.name+'-catalog-search.png')});
});
test('no risk setup required or fabricated account',async({page})=>{await desk(page);await expect(page.getByText('Risk policy setup',{exact:false})).toHaveCount(0);await expect(page.getByLabel('Leverage',{exact:true})).toHaveCount(0);await expect(page.getByText(/No capital, leverage or account balance is assumed/)).toBeVisible();});
test('actual candidate UI: submit, simulated fill, reduce, close, cancel and history',async({page},info)=>{const errors=[];page.on('pageerror',e=>errors.push(e.message));await desk(page);await ticket(page);await page.getByRole('button',{name:'Confirm & submit paper trade'}).click();await expect(page.getByRole('button',{name:'Simulate eligible fill'}).last()).toBeVisible();await page.locator('.trading-workspace').screenshot({path:path.resolve('../revision-v2-evidence/'+info.project.name+'-pending-controls.png')});await page.getByRole('button',{name:'Simulate eligible fill'}).last().click();await expect(page.getByRole('button',{name:'Close position'}).last()).toBeVisible();await page.locator('.trading-workspace').screenshot({path:path.resolve('../revision-v2-evidence/'+info.project.name+'-position-controls.png')});await page.getByLabel('Reduce quantity BTC-USDT').last().fill('0.25');await page.getByRole('button',{name:'Reduce position',exact:true}).last().click();await expect(page.getByText('Quantity 0.75 · Average entry', {exact:false})).toBeVisible();await page.getByRole('button',{name:'Close position',exact:true}).last().click();await expect(page.getByRole('button',{name:'Close position',exact:true})).toHaveCount(0);await ticket(page);await page.getByRole('button',{name:'Confirm & submit paper trade'}).click();await page.getByRole('button',{name:'Cancel remaining quantity'}).last().click();await expect(page.getByRole('button',{name:'Cancel remaining quantity'})).toHaveCount(0);await expect(page.locator('[aria-label="Paper controls"]')).toContainText('cancel');await page.locator('.trading-workspace').screenshot({path:path.resolve('../revision-v2-evidence/'+info.project.name+'-paper-controls.png')});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);});
test('negative UI: oversized ticket refused; changing ticket clears confirmation',async({page},info)=>{await desk(page);await ticket(page,'1000000000001');await page.getByRole('button',{name:'Confirm & submit paper trade'}).click();await expect(page.getByRole('alert')).toContainText('invalid values');await page.getByLabel('Quantity',{exact:true}).fill('1');await expect(page.getByLabel('Confirm this specific PAPER ticket')).not.toBeChecked();await page.locator('.trading-workspace').screenshot({path:path.resolve('../revision-v2-evidence/'+info.project.name+'-paper-negative.png')});});
test('HTTP negative boundaries, no real-money calls even in tests',async({request})=>{for(const endpoint of ['live','order','broker','paper/live']){const r=await request.post('/api/trading/'+endpoint,{data:{mode:'live',architect_authorized:true}});expect(r.status()).toBe(404);}expect((await request.get('/api/trading/paper/ledger',{headers:{'x-fixture-unauthenticated':'1'}})).status()).toBe(401);expect((await request.post('/api/trading/paper/submit',{headers:{'Idempotency-Key':'forged-request'},data:{draft:{mode:'paper',instrument_class:'crypto_perp',symbol:'BTC-USDT',side:'buy',type:'market',quantity:1,price:null,leverage:1,risk_amount:500,policy_version:'ISOLATED-TEST-ONLY-v1'},approval:'forged'}})).status()).toBe(403);expect((await request.post('/api/trading/paper/cancel',{headers:{Origin:'https://untrusted.invalid'},data:{id:'none'}})).status()).toBe(403);});
for(const code of ['per_trade_approval_required','approval_already_used'])test('renew confirmation after '+code,async({page})=>{
 await desk(page);let requests=0,failed=false;page.on('request',r=>{if(r.url().endsWith('/paper/approval'))requests++;});
 await page.route('**/api/trading/paper/submit',r=>{if(!failed){failed=true;return r.fulfill({status:403,json:{error:code}});}return r.continue();});
 await ticket(page,'0.1');await page.getByRole('button',{name:'Confirm & submit paper trade'}).click();await expect(page.getByRole('alert')).toContainText(code.replaceAll('_',' '));
 await expect(page.getByLabel('Confirm this specific PAPER ticket')).not.toBeChecked();await expect(page.getByLabel('Quantity',{exact:true})).toHaveValue('0.1');expect(requests).toBe(1);
 await page.getByLabel('Confirm this specific PAPER ticket').check();await page.getByRole('button',{name:'Confirm & submit paper trade'}).click();await expect(page.getByRole('button',{name:'Cancel remaining quantity'}).last()).toBeVisible();expect(requests).toBe(2);
 await page.getByRole('button',{name:'Cancel remaining quantity'}).last().click();
});
test('production validation refuses fixture kind and cross-site form POST',async({request})=>{
 const fixture=await request.post('/api/trading/paper/policy/validate',{data:{kind:'fixture'}});expect(fixture.status()).toBe(422);expect((await fixture.json()).error).toBe('operational_policy_kind_required');
 const form=await request.post('/api/trading/paper/approval',{headers:{'Content-Type':'text/plain'},data:'{}'});expect(form.status()).toBe(415);
});
