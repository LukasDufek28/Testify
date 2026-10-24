import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const compiled=await build({entryPoints:['src/assistant-transport.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {readAssistantReply}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const stream=chunks=>new Response(new ReadableStream({start(controller){for(const chunk of chunks)controller.enqueue(new TextEncoder().encode(chunk));controller.close();}}),{headers:{'Content-Type':'text/event-stream'}});
test('activity transport decodes split UTF-8 frames and returns only a complete final reply',async()=>{
 const activity=[];
 const result=await readAssistantReply(stream(['event: act','ivity\r\ndata: {"text":"Preparing a reply…"}\r\n\r','\nevent: result\ndata: {"answer":"Hello!","actions":[]}\n\n']),text=>activity.push(text));
 assert.deepEqual(activity,['Preparing a reply…']);assert.equal(result.answer,'Hello!');
 const bytes=new TextEncoder().encode('event: result\ndata: {"answer":"Čau!"}\n\n');
 const response=new Response(new ReadableStream({start(c){for(const byte of bytes)c.enqueue(Uint8Array.of(byte));c.close();}}),{headers:{'Content-Type':'text/event-stream'}});
 assert.equal((await readAssistantReply(response,()=>{})).answer,'Čau!');
});
test('transport exposes stream failures, truncated replies and normal JSON errors',async()=>{
 await assert.rejects(readAssistantReply(stream(['event: error\ndata: {"error":"Gemini is busy."}\n\n']),()=>{}),/Gemini is busy/);
 await assert.rejects(readAssistantReply(stream(['event: activity\ndata: {"text":"Preparing a reply…"}\n\n']),()=>{}),/interrupted/);
 await assert.rejects(readAssistantReply(Response.json({error:'Sign in again.'},{status:401}),()=>{}),/Sign in again/);
 assert.deepEqual(await readAssistantReply(Response.json({answer:'JSON compatibility'}),()=>{}),{answer:'JSON compatibility'});
});
