const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let clampPetPosition,sanitizePreferences,selectPetTask;
require('node:test').before(async()=>{({clampPetPosition,sanitizePreferences,selectPetTask}=await import('../shared/desktopPet.mjs'))});
const {createRequire}=require('node:module'),ts=require('typescript'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function tsModule(relative){
 const filename=path.join(root,relative),exports={};
 const source=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(source,{exports,require:createRequire(filename),Date,Math,crypto:require('node:crypto').webcrypto,AbortController,DOMException,fetch:()=>{},console});return exports;
}
test('saved positions recover onto negative-origin and small displays',()=>{
 assert.deepEqual(clampPetPosition({x:99999,y:-99999},{x:-1920,y:-100,width:1920,height:1080}),{x:-320,y:-100});
 assert.deepEqual(clampPetPosition({x:500,y:500},{x:0,y:0,width:200,height:300}),{x:0,y:0});
 assert.equal(sanitizePreferences({scale:NaN}).scale,1);assert.equal(sanitizePreferences({scale:20}).scale,1.4);
});
test('attention, active work, short completion and acknowledgements have distinct priority',()=>{
 const task=(id,phase,extra={})=>({id,phase,updatedAt:10000,titleKey:'agentTask',target:{kind:'agent'},...extra});
 assert.equal(selectPetTask([task('done','completed'),task('work','working')],12000).id,'work');
 assert.equal(selectPetTask([task('wait','waiting'),task('error','failed'),task('work','working')],12000).id,'error');
 assert.equal(selectPetTask([task('done','completed')],19000),undefined);
 assert.equal(selectPetTask([task('error','failed',{acknowledged:true})],12000),undefined);
});
test('animation uses real atlas frame counts and all sixteen look directions',()=>{
 const {ANIMATIONS,animationCell,lookCell}=tsModule('src/pet/atlas.ts');
 for(const name of Object.keys(ANIMATIONS))for(let t=0;t<4000;t+=17){const cell=animationCell(name,t);assert(cell.column<ANIMATIONS[name].durations.length);assert(cell.row<9)}
 const directions=new Set();for(let i=0;i<16;i++){const radians=i*Math.PI/8;const cell=lookCell(Math.sin(radians)*100,-Math.cos(radians)*100);directions.add(cell.row+':'+cell.column)}assert.equal(directions.size,16);
 assert.deepEqual(JSON.parse(JSON.stringify(animationCell('jump',400,true))),{row:4,column:0});
});
test('bundled sprite is the original full atlas and each desktop entry is packaged',()=>{
 const png=fs.readFileSync(path.join(root,'public/pets/lemy.png'));assert.equal(png.readUInt32BE(16),1536);assert.equal(png.readUInt32BE(20),2288);
 const config=fs.readFileSync(path.join(root,'vite.config.ts'),'utf8');assert(config.includes("entry: 'electron/petPreload.ts'"));assert(config.includes("'pet.html'"));
 const builder=JSON.parse(fs.readFileSync(path.join(root,'electron-builder.json')));assert(builder.files.includes('dist/**/*'));assert(builder.files.includes('dist-electron/**/*'));
});
test('the character reaches every screen edge without label clearance constraints',async()=>{
 const {layoutPet}=await import('../shared/desktopPet.mjs');const area={x:0,y:0,width:1280,height:800};
 for(const point of [{x:0,y:0},{x:1136,y:0},{x:0,y:644},{x:1136,y:644}]){
  const result=layoutPet(point,area,1);assert.deepEqual(result.point,point);assert.equal(result.bounds.x+result.bodyX,point.x);assert.equal(result.bounds.y+result.bodyY,point.y);assert(result.bounds.y>=0&&result.bounds.y+result.bounds.height<=800);
 }
});
test('interior drawing windows center the character while edge clamping preserves its position',async()=>{
 const {layoutPet}=await import('../shared/desktopPet.mjs');
 for(const scale of [.65,1,1.4])for(const area of [{x:0,y:0,width:1280,height:800},{x:-1920,y:-100,width:1920,height:1080}]){
  const point={x:area.x+area.width/2-72*scale,y:area.y+300};const l=layoutPet(point,area,scale);
  assert(Math.abs(l.bodyX+72*scale-l.bounds.width/2)<=.5);
  assert.equal(l.bounds.x+l.bodyX,l.point.x);
  for(const x of [area.x,area.x+area.width-144*scale]){const edge=layoutPet({x,y:point.y},area,scale);assert.equal(edge.bounds.x+edge.bodyX,edge.point.x);assert(edge.bounds.x>=area.x&&edge.bounds.x+edge.bounds.width<=area.x+area.width)}
 }
});
function agentModule(fetchImpl){
 const filename=path.join(root,'src/api/agentChat.ts'),exports={},tasks=[];
 const store={getState:()=>({tasks,upsertTask:t=>{const index=tasks.findIndex(old=>old.id===t.id);if(index<0)tasks.push(t);else tasks[index]=t}})};
 const requireStub=name=>name.includes('petStore')?{usePetStore:store}:name.includes('chatStore')?{useChatStore:{getState:()=>({activeConversationId:'conversation-fixture'})}}:{api:{}};
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(code,{exports,require:requireStub,fetch:fetchImpl,AbortController,DOMException,TextDecoder,TextEncoder,crypto:require('node:crypto').webcrypto,console,Math,Number});return{api:exports,tasks};
}
function stream(events){
 const chunk=new TextEncoder().encode(events.map(event=>'data: '+JSON.stringify(event)+'\n\n').join(''));
 let sent=false;return{ok:true,body:{getReader:()=>({read:async()=>sent?{done:true}:(sent=true,{done:false,value:chunk})})}};
}
async function agentCase(events){
 const env=agentModule(async()=>stream(events));let done;
 const finished=new Promise(resolve=>done=resolve);
 env.api.chatStream({messages:[],provider:'ollama'},{onToolCall(){},onToolResult(){},onTextDelta(){},onError(){},onDone:done});await finished;return env;
}
test('real Agent SSE reports progress/completion and preserves failure on done',async()=>{
 let env=await agentCase([{type:'task_progress',pct:42},{type:'done'}]);assert.equal(env.tasks[0].phase,'completed');assert.equal(env.tasks[0].target.id,'conversation-fixture');
 env=await agentCase([{type:'error',error_key:'fixture-error'},{type:'done'}]);assert.equal(env.tasks[0].phase,'failed');
});
test('aborted Agent requests are stopped, and late callbacks cannot restore reset tasks',async()=>{
 let rejectFetch;
 const env=agentModule((_url,options)=>new Promise((_resolve,reject)=>{rejectFetch=reject;options.signal.addEventListener('abort',()=>reject(new DOMException('Stopped','AbortError')))}));
 let done;const finished=new Promise(resolve=>done=resolve);
 const controller=env.api.chatStream({messages:[],provider:'ollama'},{onToolCall(){},onToolResult(){},onTextDelta(){},onError(){},onDone:done});controller.abort();await finished;assert.equal(env.tasks[0].phase,'cancelled');assert(rejectFetch);
 let deliver;
 const late=agentModule(()=>new Promise(resolve=>deliver=resolve));const completed=new Promise(resolve=>{
  late.api.chatStream({messages:[],provider:'ollama'},{onToolCall(){},onToolResult(){},onTextDelta(){},onError(){},onDone:resolve});
 });late.tasks.splice(0);deliver(stream([{type:'done'}]));await completed;assert.equal(late.tasks.length,0);
});
test('macOS presentation joins fullscreen Spaces, raises without focus, and respects opting out',()=>{
 const {applyPetPresentation}=tsModule('electron/pet/presentation.ts');const calls=[];let all=false,visible=true,destroyed=false;
 const win={isDestroyed:()=>destroyed,isVisible:()=>visible,isVisibleOnAllWorkspaces:()=>all,setVisibleOnAllWorkspaces:(value,options)=>{all=value;calls.push(['spaces',value,options])},setAlwaysOnTop:(...args)=>calls.push(['top',...args]),moveTop:()=>calls.push(['raise']),focus:()=>{throw Error('Must not steal focus')}};
 applyPetPresentation(win,true,'darwin',true);assert.equal(all,true);assert(calls.some(c=>c[0]==='spaces'&&c[2].visibleOnFullScreen===true));assert(calls.some(c=>c[0]==='spaces'&&c[2].skipTransformProcessType===true));assert(calls.some(c=>c[0]==='top'&&c[2]==='screen-saver'));assert(calls.some(c=>c[0]==='raise'));
 const before=calls.filter(c=>c[0]==='spaces').length;applyPetPresentation(win,true,'darwin',true);assert.equal(calls.filter(c=>c[0]==='spaces').length,before,'Focus changes must not repeatedly transform Space membership');
 calls.length=0;applyPetPresentation(win,false,'darwin',true);assert.equal(all,true);assert(calls.some(c=>c[0]==='top'&&c[1]===false));assert(!calls.some(c=>c[0]==='raise'));
 calls.length=0;applyPetPresentation(win,true,'win32',true);assert(!calls.some(c=>c[0]==='spaces'));assert(calls.some(c=>c[0]==='top'&&c[2]==='floating'));
 destroyed=true;calls.length=0;applyPetPresentation(win,true,'darwin',true);assert.equal(calls.length,0);
});
