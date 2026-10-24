import test from 'node:test';
import assert from 'node:assert/strict';
import {answerAssistant} from '../lib/assistant-agent.js';

const input={apiKey:'provider-test-key',model:'gemini-flash-lite-latest',messages:[{role:'user',content:'Explain my latest result.'}],context:{latestDevelopmentRunId:'saved-run',runs:[{id:'saved-run',profit:243.31}]}};
const generated=parts=>Response.json({candidates:[{content:{role:'model',parts:parts.map(part=>part.functionCall?{...part,thoughtSignature:'test-signature'}:part)},finishReason:'STOP'}],usageMetadata:{promptTokenCount:5,candidatesTokenCount:10,totalTokenCount:15}});
const busy=status=>Response.json({error:{code:status,message:'Temporarily unavailable',status:status===429?'RESOURCE_EXHAUSTED':'UNAVAILABLE'}},{status});

test('greetings reply on the first call without a workspace read or site action',async()=>{
 for(const greeting of ['whatsup','hello??','yo','ahoj!']){
  const events=[],calls=[];
  const result=await answerAssistant({...input,messages:[{role:'user',content:greeting}],onActivity:text=>events.push(text),providerFetch:async(_url,init)=>{calls.push(JSON.parse(init.body));return generated([{text:'Hey! What would you like to work on?'}]);}});
  assert.equal(calls.length,1);assert.ok(result.answer.startsWith('Hey!'));assert.deepEqual(result.actions,[]);
  assert.ok(!events.includes('Reading your workspace…'));assert.ok(!JSON.stringify(calls[0].contents).includes('saved-run'));
 }
});

test('an empty first reply falls back instead of silently completing the turn',async()=>{
 const events=[];let calls=0;
 const result=await answerAssistant({...input,messages:[{role:'user',content:'hello'}],onActivity:text=>events.push(text),providerFetch:async()=>generated(++calls===1?[]:[{text:'Hello!'}])});
 assert.equal(calls,2);assert.equal(result.answer,'Hello!');assert.ok(events.includes('Trying another available model…'));
});

test('workspace activity is emitted by a real context tool, and context reads cannot loop',async()=>{
 const events=[],bodies=[];
 await answerAssistant({...input,onActivity:text=>events.push(text),providerFetch:async(_url,init)=>{const body=JSON.parse(init.body);bodies.push(body);return generated(bodies.length===1?[{functionCall:{name:'read_context',args:{}}}]:[{text:'Your measured result is available.'}]);}});
 assert.deepEqual(events,['Reading your workspace…','Preparing a reply…']);
 assert.ok(!JSON.stringify(bodies[1].tools).includes('"name":"read_context"'));
});

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
  assert.equal(result.model,'gemini-3.6-flash');
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

test('the default assistant uses distinct current models for its bounded fallback',async()=>{
  const models=[];
  const providerFetch=async(url,init)=>{
    models.push(new URL(url).pathname.split('/models/')[1].split(':')[0]);
    if(models.at(-1)==='gemini-3.6-flash')return busy(503);
    const hasContext=JSON.parse(init.body).contents.some(message=>message.parts?.some(part=>part.functionResponse));
    return hasContext?generated([{text:'Available on the fallback.'}]):generated([{functionCall:{name:'read_context',args:{}}}]);
  };
  const {model:_,...defaultInput}=input;
  const result=await answerAssistant({...defaultInput,providerFetch});
  assert.deepEqual(models,['gemini-3.6-flash','gemini-3.5-flash-lite','gemini-3.5-flash-lite']);
  assert.equal(result.answer,'Available on the fallback.');
});
