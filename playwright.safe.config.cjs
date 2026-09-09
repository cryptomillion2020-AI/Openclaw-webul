const path=require('node:path');
const url=new URL(process.env.WEBUI_TEST_BASE_URL || 'http://127.0.0.1:1');
if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port)throw new Error('An isolated loopback fixture URL is required');
module.exports={
 testDir:path.join(__dirname,'e2e'),
 testMatch:['safe-preparation.spec.cjs','trading-live-20260909.spec.cjs','trading-route-denial-v2.spec.cjs'],
 grepInvert:/live public API/,
 workers:1,timeout:25000,retries:0,reporter:[['list']],
 outputDir:process.env.WEBUI_TEST_OUTPUT || path.join(__dirname,'test-results'),
 use:{baseURL:url.origin,headless:true,viewport:{width:1440,height:1000},screenshot:'off',trace:'off',video:'off',serviceWorkers:'block',launchOptions:{args:['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']}},
};
