const {app,BrowserWindow,ipcMain,screen,nativeTheme}=require('electron'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),ts=require(root+'/node_modules/typescript');require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,file);
const {registerStartupRestart}=require(root+'/electron/restartApplication.ts');
const {startupWindowOptions,registerStartupAppearance}=require(root+'/electron/startupAppearance.ts');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'metalingo-startup-native-'));app.setPath('userData',profile);const delay=ms=>new Promise(r=>setTimeout(r,ms));let win,backdrop;let seq=0;const state={stage:'initializing',message:'',progress:0,backendReady:false,seq:seq++,attemptId:0};
async function waitFor(fn){for(let i=0;i<100;i++){if(await fn())return;await delay(100)}throw Error('Timed out waiting for startup UI')}
function status(stage,ready=false){Object.assign(state,{stage,backendReady:ready,progress:ready?100:40,seq:seq++});win.webContents.send('startup-status-changed',state)}
app.whenReady().then(async()=>{try{
 const area=screen.getPrimaryDisplay().workArea;const width=Math.min(1100,area.width-80),height=Math.min(720,area.height-80),x=area.x+40,y=area.y+40;
 backdrop=new BrowserWindow({x:x-8,y:y-8,width:width+16,height:height+16,frame:false,show:false,backgroundColor:'#206f9b'});await backdrop.loadURL('data:text/html,<style>body{margin:0;background:linear-gradient(120deg,%23183c68,%236cabc4,%23d3a893);height:100vh}</style>');backdrop.showInactive();
 win=new BrowserWindow({x,y,width,height,show:false,...startupWindowOptions(),titleBarStyle:process.platform==='darwin'?'hiddenInset':'hidden',webPreferences:{preload:root+'/dist-electron/preload.js',contextIsolation:true,nodeIntegration:false}});
 registerStartupAppearance(ipcMain,()=>win,process.platform,undefined,nativeTheme);ipcMain.handle('get-startup-status',()=>state);ipcMain.handle('pet:sync',()=>{});ipcMain.handle('set-title-bar-overlay',()=>true);ipcMain.handle('is-fullscreen',()=>false);let prompts=0;registerStartupRestart({ipc:ipcMain,dialog:{showMessageBox:async()=>{prompts++;return{response:1}}},getMain:()=>win,canRestart:()=>state.stage==='error',shutdown:async()=>{throw Error('Cancel must not shut down')},relaunch:()=>{throw Error('Cancel must not relaunch')},exit:()=>{},onFailure:()=>{}});
 // These fixed, read-only stubs prevent the isolated test from accessing real user data.
 win.webContents.session.webRequest.onBeforeRequest({urls:['http://127.0.0.1:8000/*']},(_d,cb)=>cb({cancel:true}));
 const source=process.env.METALINGO_STARTUP_DEV_URL;if(source)await win.loadURL(source);else await win.loadFile(root+'/dist/index.html');win.show();
 await waitFor(()=>win.webContents.executeJavaScript(`!!document.querySelector('.startup-glass')`));await delay(500);
 assert.equal(await win.webContents.executeJavaScript(`getComputedStyle(document.body).backgroundColor`),'rgba(0, 0, 0, 0)');assert.equal(await win.webContents.executeJavaScript(`document.querySelector('.startup-splash').innerText`),'');
 assert.equal(await win.webContents.executeJavaScript(`document.querySelector('.startup-splash').dataset.version`),'v'+require(root+'/package.json').version);
 const picture=await win.webContents.capturePage();fs.writeFileSync('/tmp/metalingo-startup-native-layer.png',picture.toPNG());
 if(process.platform==='darwin'){
  try{const bounds=win.getBounds();execFileSync('/usr/sbin/screencapture',['-x','-R'+[bounds.x,bounds.y,bounds.width,bounds.height].join(','),'/tmp/metalingo-startup-native-glass.png']);console.log('Saved actual compositor screenshot.')}catch(e){console.log('Compositor screenshot unavailable: '+e.message)}
 }
 await win.webContents.executeJavaScript(`localStorage.setItem('meta-lingo-settings',JSON.stringify({state:{darkMode:true,language:'en'},version:0}))`);win.reload();
 await waitFor(()=>win.webContents.executeJavaScript(`!!document.querySelector('.startup-glass.startup-dark')`));await delay(450);
 assert.equal(await win.webContents.executeJavaScript(`document.querySelector('.startup-splash').innerText`),'');
 fs.writeFileSync('/tmp/metalingo-startup-native-dark-layer.png',(await win.webContents.capturePage()).toPNG());
 if(process.platform==='darwin'){const r=win.getBounds();try{execFileSync('/usr/sbin/screencapture',['-x','-R'+[r.x,r.y,r.width,r.height].join(','),'/tmp/metalingo-startup-native-dark.png'])}catch{}}
 status('error');await waitFor(()=>win.webContents.executeJavaScript(`!!document.querySelector('.startup-error button')`));await waitFor(()=>prompts===1);assert.equal(await win.webContents.executeJavaScript(`document.querySelector('.startup-error button').innerText`),'Restart application');await waitFor(()=>win.webContents.executeJavaScript(`!document.querySelector('.startup-error button').disabled`));await win.webContents.executeJavaScript(`document.querySelector('.startup-error button').click()`);await waitFor(()=>prompts===2);
 status('ready',true);await waitFor(()=>win.webContents.executeJavaScript(`!!document.querySelector('.app-workspace-enter')&&!document.querySelector('.startup-splash')`));assert.equal(await win.webContents.executeJavaScript(`document.documentElement.classList.contains('startup-native-glass')`),false);assert.notEqual(await win.webContents.executeJavaScript(`getComputedStyle(document.body).backgroundColor`),'rgba(0, 0, 0, 0)');assert.equal(win.getBackgroundColor().toLowerCase(),'#0d0d12');
 console.log('PASS: real Electron '+(source?'development':'file://')+' supplied brand, light/dark native material/transparent body, localized full-restart request/cancellation, backend-ready transition, material release and opaque workspace. No real backend or user resources loaded.');
}catch(e){console.error(e);process.exitCode=1}finally{win?.destroy();backdrop?.destroy();app.quit();fs.rmSync(profile,{recursive:true,force:true})}});
