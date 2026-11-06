import { BrowserWindow, screen } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { applyPetPresentation } from './presentation'
import { layoutPet, selectPetTask, type PetAction, type PetMotion, type PetSnapshot } from '../../shared/desktopPet.mjs'

export interface PetWindowOptions {
  getMain: () => BrowserWindow | null
  userData: string
  preload: string
  renderer: string
  developmentUrl?: string
}
export class PetWindow {
  window: BrowserWindow | null = null
  snapshot: PetSnapshot | null = null
  private timer?: ReturnType<typeof setInterval>
  private presentationTimers: ReturnType<typeof setTimeout>[] = []
  private ready = false
  private dragStart?: { cursor: {x:number;y:number}; window: {x:number;y:number}; at: number }
  private interactive = false
  private interacting = false
  private nextWalk = Date.now()+20000
  private walkUntil = 0
  private walkDirection: -1 | 1 = 1
  private lastTick = Date.now()
  private lastMotion = ''
  private body = { x: 0, y: 0 }
  private frame = { x: 16, y: 12 }
  private readonly positionFile: string
  constructor(private options: PetWindowOptions) {
    this.positionFile = path.join(options.userData, 'desktop-pet-position.json')
    screen.on('display-removed', this.recover)
    screen.on('display-metrics-changed', this.recover)
  }
  private recover = () => {
    if (!this.window || this.window.isDestroyed()) return
    this.place(this.body)
  }
  private place(point:{x:number;y:number}, area = screen.getDisplayMatching({...point,width:144,height:156}).workArea) {
    const layout=layoutPet(point,area,this.snapshot?.preferences.scale??1)
    this.body=layout.point;this.frame={x:layout.bodyX,y:layout.bodyY}
    if(this.window&&!this.window.isDestroyed())this.window.setBounds(layout.bounds,false)
    return layout
  }
  private remember() {
    if (!this.window || this.window.isDestroyed()) return
    try {
      fs.mkdirSync(path.dirname(this.positionFile),{recursive:true})
      fs.writeFileSync(this.positionFile,JSON.stringify(this.body))
    } catch(error) { console.warn('[Lemy] Could not save position:',error) }
  }
  sync(snapshot: PetSnapshot) {
    const previousScale=this.snapshot?.preferences.scale
    this.snapshot=snapshot
    if (!snapshot.preferences.enabled) { this.destroy(); return }
    if (!this.window) this.create()
    else if(previousScale!==snapshot.preferences.scale)this.place(this.body)
    if (this.window) applyPetPresentation(this.window, snapshot.preferences.alwaysOnTop)
    this.window?.webContents.send('pet:snapshot', snapshot)
  }
  private create() {
    const area=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
    let point={x:area.x+area.width-144*(this.snapshot?.preferences.scale??1)-24,y:area.y+area.height-156*(this.snapshot?.preferences.scale??1)-20}
    try {
      const saved=JSON.parse(fs.readFileSync(this.positionFile,'utf8'))
      if(Number.isFinite(saved.x)&&Number.isFinite(saved.y)) point={x:saved.x,y:saved.y}
    } catch { /* first launch */ }
    const layout=this.place(point)
    this.window=new BrowserWindow({
      ...layout.bounds,transparent:true,frame:false,hasShadow:false,
      ...(process.platform==='darwin'?{type:'panel'}:{}),
      resizable:false,minimizable:false,maximizable:false,fullscreenable:false,skipTaskbar:true,
      show:false,backgroundColor:'#00000000',title:'Lemy · Meta-Lingo',
      webPreferences:{preload:this.options.preload,contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false},
    })
    const win=this.window
    applyPetPresentation(win, this.snapshot?.preferences.alwaysOnTop ?? true)
    win.setIgnoreMouseEvents(true,{forward:true})
    this.interactive=false
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}))
    win.webContents.on('will-navigate',event=>event.preventDefault())
    win.once('ready-to-show',()=>{
      if(win.isDestroyed()||!this.snapshot?.preferences.enabled)return
      this.ready=true;this.lastMotion='';win.showInactive();this.refreshPresentation();win.webContents.send('pet:snapshot',this.snapshot)
    })
    win.on('closed',()=>{ if(this.window===win)this.window=null; this.stopTimer() })
    win.on('blur',()=>this.drag(false))
    if(this.options.developmentUrl) void win.loadURL(new URL('pet.html',this.options.developmentUrl+'/').href)
    else void win.loadFile(this.options.renderer)
    this.lastTick=Date.now();this.nextWalk=Date.now()+20000
    this.timer=setInterval(()=>this.tick(),50)
  }
  hit(active:boolean) {
    if (!this.window || this.window.isDestroyed() || active===this.interactive)return
    this.interactive=active
    this.window.setIgnoreMouseEvents(!active,{forward:true})
  }
  interaction(active:boolean) { this.interacting=active; if(active)this.walkUntil=0 }
  drag(active:boolean) {
    if(!this.window || this.window.isDestroyed())return
    if(active){
      this.dragStart={cursor:screen.getCursorScreenPoint(),window:{...this.body},at:Date.now()};this.walkUntil=0
    } else if(this.dragStart){this.dragStart=undefined;this.remember();this.nextWalk=Date.now()+20000}
  }
  private tick() {
    const win=this.window;if(!win||win.isDestroyed())return
    const now=Date.now(),dt=Math.min(100,now-this.lastTick)/1000;this.lastTick=now
    const cursor=screen.getCursorScreenPoint()
    let walking: -1|0|1=0
    if(this.dragStart){
      if(now-this.dragStart.at>30000) this.drag(false)
      else {
        const point={x:this.dragStart.window.x+cursor.x-this.dragStart.cursor.x,y:this.dragStart.window.y+cursor.y-this.dragStart.cursor.y}
        const area=screen.getDisplayNearestPoint(cursor).workArea
        this.place(point,area)
      }
    } else if(this.snapshot?.preferences.roaming&&!this.snapshot.reducedMotion&&!this.interacting&&!selectPetTask(this.snapshot.tasks,now)){
      if(now>=this.nextWalk&&now>=this.walkUntil){
        this.walkDirection=Math.random()<.5?-1:1;this.walkUntil=now+1600;this.nextWalk=now+20000+Math.random()*20000
      }
      if(now<this.walkUntil){
        const previous=this.body.x
        this.place({x:this.body.x+this.walkDirection*Math.max(1,Math.round(32*dt)),y:this.body.y})
        if(this.body.x===previous)this.walkUntil=0
        else walking=this.walkDirection
        if(now+50>=this.walkUntil)this.remember()
      }
    } else this.walkUntil=0
    const actual=win.getBounds()
    const motion:PetMotion={x:cursor.x-actual.x,y:cursor.y-actual.y,dragging:!!this.dragStart,walking,bodyX:this.frame.x,bodyY:this.frame.y,viewWidth:actual.width,viewHeight:actual.height}
    const serialized=JSON.stringify(motion)
    if(serialized!==this.lastMotion){win.webContents.send('pet:motion',motion);this.lastMotion=serialized}
  }
  action(action:PetAction){
    const main=this.options.getMain()
    if(!main||main.isDestroyed())return
    if(action.type==='open'){
      if(main.isMinimized())main.restore()
      main.show();main.focus()
    }
    main.webContents.send('pet:action',action)
  }
  /** Called after native fullscreen/focus transitions, which can reorder windows. */
  refreshPresentation() {
    this.presentationTimers.forEach(clearTimeout)
    this.presentationTimers=[]
    const restore=()=>{
      const win=this.window
      if(!win||win.isDestroyed()||!this.snapshot?.preferences.enabled)return
      const top=this.snapshot.preferences.alwaysOnTop
      applyPetPresentation(win,top,process.platform,true)
      if(top&&this.ready&&!win.isVisible()){win.showInactive();win.moveTop()}
    }
    restore()
    // Native Space animations can finish after focus/fullscreen callbacks.
    if(this.snapshot?.preferences.enabled&&this.snapshot.preferences.alwaysOnTop){
      this.presentationTimers=[setTimeout(restore,120),setTimeout(restore,550)]
    }
  }
  private stopTimer(){if(this.timer)clearInterval(this.timer);this.timer=undefined;this.presentationTimers.forEach(clearTimeout);this.presentationTimers=[];this.ready=false;this.dragStart=undefined;this.interacting=false;this.lastMotion=''}
  destroy(){this.stopTimer();const win=this.window;this.window=null;if(win&&!win.isDestroyed())win.destroy()}
  reset(){this.snapshot=null;this.destroy();fs.rmSync(this.positionFile,{force:true})}
  dispose(){this.destroy();screen.removeListener('display-removed',this.recover);screen.removeListener('display-metrics-changed',this.recover)}
}
