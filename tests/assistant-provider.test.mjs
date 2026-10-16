import test from 'node:test';
import assert from 'node:assert/strict';
import {answerAssistant} from '../lib/assistant-agent.js';

const input={apiKey:'provider-test-key',model:'gemini-flash-lite-latest',messages:[{role:'user',content:'Explain my latest result.'}],context:{latestDevelopmentRunId:'saved-run',runs:[{id:'saved-run',profit:243.31}]}};
const generated=parts=>Response.json({candidates:[{content:{role:'model',parts:parts.map(part=>part.functionCall?{...part,thoughtSignature:'test-signature'}:part)},finishReason:'STOP'}],usageMetadata:{promptTokenCount:5,candidatesTokenCount:10,totalTokenCount:15}});
const busy=status=>Response.json({error:{code:status,message:'Temporarily unavailable',status:status===429?'RESOURCE_EXHAUSTED':'UNAVAILABLE'}},{status});

test('assistant falls back from an overloaded model and reads the same workspace before replying',async()=>{
  const calls=[];
  const providerFetch=async(url,init)=>{
    const body=JSON.parse(init.body);calls.push({url:String(url),body});
    if(String(url).includes(input.model))return busy(503);
    return body.contents.some(message=>message.parts?.some(part=>part.functionResponse))
      ? generated([{text:'Net profit was **$243.31**.'}])
      : generated([{functionCall:{name:'read_context',args:{}}}]);
  };
  const result=await answerAssistant({...input,providerFetch});
  assert.equal(result.model,'gemini-3.5-flash');
  assert.equal(result.answer,'Net profit was **$243.31**.');
  assert.deepEqual(result.actions,[]);
  assert.equal(calls.length,3);
  assert.match(JSON.stringify(calls.at(-1).body.contents),/saved-run/);
  assert.match(JSON.stringify(calls.at(-1).body.contents),/243.31/);
});

test('a timed-out model yields to the fallback within the bounded attempt budget',async()=>{
  let calls=0;
  const providerFetch=async(url,init)=>{
    calls++;
    if(String(url).includes(input.model))return new Promise((_,reject)=>{
      if(init.signal.aborted)reject(init.signal.reason);
      else init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true});
    });
    const hasContext=JSON.parse(init.body).contents.some(message=>message.parts?.some(part=>part.functionResponse));
    return hasContext?generated([{text:'Available again.'}]):generated([{functionCall:{name:'read_context',args:{}}}]);
  };
  const result=await answerAssistant({...input,providerFetch,attemptTimeoutMs:30});
  assert.equal(result.answer,'Available again.');
  assert.equal(calls,3);
});

test('authentication and invalid-request errors do not retry a different model',async()=>{
  for(const status of [400,401,403]){
    let calls=0;
    await assert.rejects(answerAssistant({...input,providerFetch:async()=>{calls++;return busy(status);}}),error=>error.statusCode===status);
    assert.equal(calls,1);
  }
});

test('exhausted provider quota retains a useful 429 error after fallback failure',async()=>{
  let calls=0;
  await assert.rejects(answerAssistant({...input,providerFetch:async()=>busy(++calls===1?429:503)}),error=>error.statusCode===429);
  assert.equal(calls,2);
});

test('failover returns a requested settings action once without performing it on the server',async()=>{
  let primaryCalls=0;
  const providerFetch=async(url,init)=>{
    const hasContext=JSON.parse(init.body).contents.some(message=>message.parts?.some(part=>part.functionResponse));
    if(String(url).includes(input.model)){
      primaryCalls++;
      return hasContext?busy(503):generated([{functionCall:{name:'read_context',args:{}}}]);
    }
    return hasContext?generated([{functionCall:{name:'update_settings',args:{capital:20000}}}]):generated([{functionCall:{name:'read_context',args:{}}}]);
  };
  const result=await answerAssistant({...input,providerFetch});
  assert.equal(primaryCalls,2);
  assert.equal(result.actions.length,1);
  assert.equal(result.actions[0].name,'update_settings');
  assert.deepEqual(result.actions[0].input,{capital:20000});
});
