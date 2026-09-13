// V2 instrument: v1 tradingview.spec.cjs:124 required non-JSON 404s from Vite.
// Evidence: browser-regression.log shows an actual 404 JSON denial, not an accepted route.
// Preserve v1. Retain mandatory HTTP 404 and additionally assert explicit refusal + admitted=false.
const {test,expect}=require('./isolated-fixtures.cjs');
test('v2 unsupported and real-money API routes return explicit non-admission',async({request})=>{
 for(const route of ['/api/orders','/api/broker','/api/webhooks','/api/credentials','/api/trading/order','/api/trading/live']){
  const response=await request.post(route,{data:{canary:'harmless-denial-check'},failOnStatusCode:false});
  expect(response.status()).toBe(404);expect(await response.json()).toEqual({error:'unsupported_or_live_route_disabled',admitted:false});
 }
});
// V1 disclosure predates the independently sourced BloFin perpetual panel.
// Preserve the equity authority and prohibit TradingView consumption, while naming both local sources.
test('v2 chart disclosure separates equity and perpetual quote authority',async({page})=>{
 await page.goto('/?page=trading');
 const copy=page.getByTestId('tradingview-disclosure');
 await expect(copy).toContainText('Equity reference quotes come from local Market Context at equity_prices[symbol]');
 await expect(copy).toContainText('perpetual quotes come from the independent BloFin public publisher');
 await expect(copy).toContainText('TradingView is not our quote backend.');
 await expect(page.getByText('Visualization only · not quote authority')).toBeVisible();
});
