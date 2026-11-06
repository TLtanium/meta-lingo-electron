const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),ts=require(root+'/node_modules/typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,file);require.extensions['.mjs']=require.extensions['.ts'];
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'metalingo-spaces-test-'));app.setPath('userData',profile);
let main,other,pet;let exitCode=0;
if(process.platform!=='darwin'){console.log('SKIP: macOS fullscreen Space check');app.exit(0)}
const python=process.env.METALINGO_TEST_PYTHON||'python3',windowList=path.join(root,'scripts/native_window_order.py');const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn,label){for(let i=0;i<80;i++){if(await fn())return;await delay(150)}throw Error('Timed out: '+label)}
function onscreen(){return JSON.parse(execFileSync(python,[windowList,String(process.pid)],{encoding:'utf8'}))}
function nativeId(win){return Number(win.getMediaSourceId().split(':')[1])}
function inspect(label,fullscreen){const windows=onscreen();const a=windows.findIndex(w=>w.id===nativeId(pet.window)),b=windows.findIndex(w=>w.id===nativeId(fullscreen));assert(a>=0,'Lemy must exist in active fullscreen Space');assert(b>=0,'Target fullscreen window must be on screen');assert(a<b,'Lemy must be above the fullscreen window');assert(pet.window.isVisibleOnAllWorkspaces());assert(!pet.window.isFocused(),'Restoring topmost must not focus the pet');console.log('PASS:',label,'— pet visible above fullscreen, focus retained')}
app.whenReady().then(async()=>{try{
 main=new BrowserWindow({show:false,width:900,height:650,title:'Meta-Lingo fullscreen QA',webPreferences:{preload:root+'/dist-electron/preload.js',contextIsolation:true,nodeIntegration:false}});await main.loadURL('data:text/html,<body style="background:navy;color:white">Meta-Lingo fullscreen QA</body>');
 pet=require(root+'/electron/pet/ipc.ts').registerPetHandlers({getMain:()=>main,userData:profile,preload:root+'/dist-electron/petPreload.js',renderer:root+'/dist/pet.html'});
 for(const event of ['enter-full-screen','leave-full-screen','focus','restore'])main.on(event,()=>pet.refreshPresentation());
 main.show();app.focus({steal:true});main.focus();await delay(500);
 const originalDock=app.dock.isVisible();assert(originalDock,'Control application must start with its Dock icon visible');
 const assertMainUnchanged=()=>{assert(main.isVisible(),'Showing Lemy must not hide the main window');assert(!app.isHidden(),'Showing Lemy must not hide the application');assert.equal(app.dock.isVisible(),originalDock,'Showing Lemy must not hide the Dock icon');assert(main.isFocused(),'Showing Lemy must not take focus from the main window')};
 const snapshot={preferences:{enabled:true,scale:1,roaming:false,alwaysOnTop:true},language:'zh',dark:false,tasks:[]};await main.webContents.executeJavaScript(`electronAPI.pet.sync(${JSON.stringify(snapshot)})`);await wait(()=>pet.window?.isVisible(),'pet ready');await delay(750);assertMainUnchanged();
 for(let n=0;n<2;n++){await main.webContents.executeJavaScript(`electronAPI.pet.sync({...${JSON.stringify(snapshot)},preferences:{...${JSON.stringify(snapshot.preferences)},enabled:false}})`);assertMainUnchanged();await main.webContents.executeJavaScript(`electronAPI.pet.sync(${JSON.stringify(snapshot)})`);await wait(()=>pet.window?.isVisible(),'pet reopen');await delay(650);assertMainUnchanged()}
 console.log('PASS: opening/reopening Lemy preserves the visible main window, Dock icon and keyboard focus');
 main.setFullScreen(true);await wait(()=>main.isFullScreen(),'main fullscreen');await wait(()=>onscreen().some(w=>w.id===nativeId(main)),'main fullscreen onscreen');await delay(800);inspect('MAIN_FULLSCREEN',main);
 other=new BrowserWindow({show:false,width:900,height:650,title:'Second fullscreen QA'});await other.loadURL('data:text/html,<body style="background:maroon;color:white">Second fullscreen QA</body>');other.show();app.focus({steal:true});other.focus();other.setFullScreen(true);await wait(()=>other.isFullScreen(),'second fullscreen');await wait(()=>onscreen().some(w=>w.id===nativeId(other)),'second fullscreen onscreen');await delay(800);inspect('SECOND_FULLSCREEN',other);
 main.show();app.focus({steal:true});main.focus();await wait(()=>onscreen().some(w=>w.id===nativeId(main)),'return to main Space');await delay(800);inspect('RETURN_MAIN',main);
 await main.webContents.executeJavaScript(`electronAPI.pet.sync({...${JSON.stringify(snapshot)},preferences:{...${JSON.stringify(snapshot.preferences)},alwaysOnTop:false}})`);assert(!pet.window.isAlwaysOnTop());assert(pet.window.isVisibleOnAllWorkspaces());
 await main.webContents.executeJavaScript(`electronAPI.pet.sync(${JSON.stringify(snapshot)})`);pet.refreshPresentation();await delay(750);inspect('REENABLE_TOPMOST',main);
 main.setFullScreen(false);await wait(()=>!main.isFullScreen(),'leave fullscreen');await delay(900);assert(pet.window.isAlwaysOnTop()&&pet.window.isVisibleOnAllWorkspaces());
 console.log('PASS: real macOS fullscreen entry, second fullscreen Space, return, topmost opt-out/re-enable and exit, with native on-screen ordering and no pet focus.');
}catch(e){console.error(e);exitCode=1}finally{
 if(other&&!other.isDestroyed())other.setFullScreen(false);if(main&&!main.isDestroyed())main.setFullScreen(false);await delay(500);pet?.dispose();other?.destroy();main?.destroy();try{fs.rmSync(profile,{recursive:true,force:true})}catch{}app.exit(exitCode)
}});
