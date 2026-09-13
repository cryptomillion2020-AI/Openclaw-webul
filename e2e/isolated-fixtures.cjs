const base=require('@playwright/test');
exports.expect=base.expect;
exports.test=base.test.extend({
 networkIsolation:[async({context,baseURL},use)=>{
  const origin=new URL(baseURL).origin;
  await context.route('**/*',r=>{
   const url=new URL(r.request().url());
   if(url.origin===origin)return r.continue();
   if(url.hostname==='www.tradingview-widget.com')return r.fulfill({status:200,contentType:'text/html',body:'<title>ISOLATED CHART FIXTURE — NOT LIVE DATA</title>'});
   return r.abort('blockedbyclient');
  });
  await context.routeWebSocket(/^(?!ws:\/\/127\.0\.0\.1:).*$/,ws=>ws.close());
  await use();
 },{auto:true}],
});
