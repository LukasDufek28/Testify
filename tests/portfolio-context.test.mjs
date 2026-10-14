import test from "node:test";
import assert from "node:assert/strict";
import { summarizeDevelopmentPortfolio } from "../lib/shared/research.js";
import { createGenerationHandler } from "../api/generate-strategy.js";
import { exampleStrategy } from "../lib/shared/types.js";
const run = (capital, pnl, symbol="BTC-USD") => ({symbol, research:{phase:"development"}, settings:{capital,start:100,end:200,feeBps:6,slippageBps:2}, granularity:14400, metrics:{netReturnPct:pnl/capital*100,totalFees:capital*.01}, curve:[{time:100,equity:capital},{time:200,equity:capital+pnl}], trades:[{pnl,reason:"Signal",rMultiple:pnl>0?1.5:-1}]});
test("portfolio summary normalizes capitals, pools trades and matches summed returns",()=>{
 const value=summarizeDevelopmentPortfolio([run(1000,-100),run(2000,300,"ETH-USD")]);
 assert.ok(Math.abs(value.netReturnPct-5)<1e-10);
 assert.equal(value.netProfit,50); assert.equal(value.totalFees,20);
 assert.equal(value.profitFactor,1.5); assert.equal(value.winRatePct,50);
 assert.equal(value.averageTradePnl,25); assert.equal(value.averageRMultiple,.25);
 assert.equal(value.sharpe,null); assert.equal(value.effectiveSleeveCapital,2000);
 assert.throws(()=>summarizeDevelopmentPortfolio([{...run(1000,1),research:{phase:"validation"}}]),/development/);
});
test("300 runs produce bounded summary without individual trades or curves",()=>{
 const value=summarizeDevelopmentPortfolio(Array.from({length:300},(_,i)=>run(1000,1,`MARKET-${i}`)));
 assert.equal(value.runCount,300);assert.equal(value.bestMarkets.length,5);
 assert.ok(JSON.stringify(value).length<4000);
 assert.equal(value.trades,undefined);assert.equal(value.curve,undefined);
});
test("generation endpoint rejects validation summaries and duplicate context",async()=>{
 const handler=createGenerationHandler(async()=>({id:"test"}));
 for(const portfolio of [{...summarizeDevelopmentPortfolio([run(1000,1)]),phase:"validation"},{...summarizeDevelopmentPortfolio([run(1000,1)]),curve:[]}]){
 let status;let body;
 const response={setHeader(){},status(value){status=value;return this},json(value){body=value;return this}};
 await handler({method:"POST",headers:{},body:{mode:"revise",strategy:exampleStrategy,idea:"Reduce costs",portfolio}},response);
 assert.equal(status,400);assert.match(body.error,/portfolio/);
 }
});
test("Gemini receives one compact portfolio context for 300 runs",async()=>{
 const oldFetch=globalThis.fetch,oldKey=process.env.GEMINI_API_KEY;
 process.env.GEMINI_API_KEY="fixture";
 const portfolio=summarizeDevelopmentPortfolio(Array.from({length:300},()=>run(1000,1)));
 let prompt;
 globalThis.fetch=async(_url,options)=>{prompt=JSON.parse(options.body).contents[0].parts[0].text;return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(exampleStrategy)}]}}]})}};
 try{
 const response={statusCode:200,setHeader(){},status(value){this.statusCode=value;return this},json(value){this.body=value;return this}};
 await createGenerationHandler(async()=>({id:"test"}))({method:"POST",headers:{},body:{mode:"revise",strategy:exampleStrategy,idea:"Reduce fee drag",portfolio,results:[]}},response);
 assert.equal(response.statusCode,200);assert.ok(prompt.includes('"runCount":300'));assert.ok(prompt.includes('ONE aggregate'));assert.ok(!prompt.includes('"curve":'));assert.ok(!prompt.includes('"trades":'));
 }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey;}
});
