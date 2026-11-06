import { useEffect, useRef, useState } from 'react'
import { selectPetTask, type PetAction, type PetMotion, type PetSnapshot } from '../../shared/desktopPet.mjs'
import Sprite from './Sprite'
import PetIcon from './PetIcon'
import { petStrings } from './strings'
import type { PetAnimation } from './atlas'
import { CELL } from './atlas'
import './pet.css'

interface Props {
 snapshot:PetSnapshot; motion:PetMotion; native?:boolean
 onAction:(action:PetAction)=>void; onDrag:(active:boolean)=>void
 onHit?:(active:boolean)=>void; onInteraction?:(active:boolean)=>void
 onPointerMove?:(event:React.PointerEvent)=>void
}
export default function PetView({snapshot,motion,native=false,onAction,onDrag,onHit,onInteraction,onPointerMove}:Props){
 const s=petStrings[snapshot.language],canvasRef=useRef<HTMLCanvasElement>(null),panelRef=useRef<HTMLDivElement>(null)
 const [panel,setPanel]=useState<'menu'|'tasks'|null>(null),[hover,setHover]=useState(false),[clock,setClock]=useState(Date.now())
 const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches)
 const [frameTop,setFrameTop]=useState(0)
 const drag=useRef<{x:number;y:number;started:boolean}|null>(null),clickTimer=useRef<ReturnType<typeof setTimeout>>()
 const hitRef=useRef<boolean>(),wasDragging=useRef(false),[greeting,setGreeting]=useState(Date.now()+900)
 const chosen=selectPetTask(snapshot.tasks,clock),active=snapshot.tasks.filter(t=>t.phase==='working'||t.phase==='waiting').length
 const width=motion.viewWidth??320,height=motion.viewHeight??560,spriteWidth=144*snapshot.preferences.scale,spriteHeight=156*snapshot.preferences.scale
 const bodyX=motion.bodyX??(width-spriteWidth)/2,bodyY=motion.bodyY??height-spriteHeight-12
 const above=bodyY>height-bodyY-spriteHeight
 const available=above?bodyY:height-bodyY-spriteHeight
 const panelWidth=Math.max(1,Math.min(280,width-16))
 const floatingStyle:React.CSSProperties={right:'auto',left:Math.max(8,Math.min(bodyX+spriteWidth/2-panelWidth/2,width-panelWidth-8)),width:panelWidth,...(above?{bottom:height-bodyY+12,top:'auto'}:{top:bodyY+spriteHeight+12,bottom:'auto'}),maxHeight:Math.max(60,available-24),maxWidth:width-16}
 const bubbleCenter=bodyX+spriteWidth/2
 const bubbleWidth=Math.max(1,Math.min(240,2*(Math.min(bubbleCenter,width-bubbleCenter)-8)))
 const bubbleStyle:React.CSSProperties={left:bubbleCenter,top:above?bodyY+frameTop*spriteHeight/CELL.height-8:bodyY+spriteHeight+8,right:'auto',bottom:'auto',transform:above?'translate(-50%, -100%)':'translateX(-50%)',width:'max-content',minWidth:Math.min(120,bubbleWidth),maxWidth:bubbleWidth}
 useEffect(()=>{const id=setInterval(()=>setClock(Date.now()),200);return()=>clearInterval(id)},[])
 useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key==='Escape')setPanel(null)};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[])
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const change=()=>setReduced(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change)},[])
 useEffect(()=>{onInteraction?.(!!panel||hover);return()=>onInteraction?.(false)},[panel,hover,onInteraction])
 useEffect(()=>{
  if(wasDragging.current&&!motion.dragging)setGreeting(Date.now()+700)
  wasDragging.current=motion.dragging
 },[motion.dragging])
 useEffect(()=>()=>{clearTimeout(clickTimer.current);onDrag(false)},[onDrag])
 const inside=(element:HTMLElement|null,x:number,y:number)=>{const r=element?.getBoundingClientRect();return !!r&&x>=r.left&&x<r.right&&y>=r.top&&y<r.bottom}
 useEffect(()=>{
  if(!native)return
  const {x,y}=motion;let hit=inside(panelRef.current,x,y)
  const canvas=canvasRef.current
  if(canvas&&inside(canvas,x,y)){
   const r=canvas.getBoundingClientRect(),cx=Math.floor((x-r.left)*canvas.width/r.width),cy=Math.floor((y-r.top)*canvas.height/r.height)
   try{hit=hit||!!(canvas.getContext('2d',{willReadFrequently:true})?.getImageData(cx,cy,1,1).data[3])}catch{hit=true}
  }
  // Bubble buttons have their own small, explicit interactive region.
  const bubble=document.querySelector<HTMLElement>('.lemy-bubble')
  hit=hit||inside(bubble,x,y)||!!drag.current?.started
  if(hitRef.current!==hit){hitRef.current=hit;onHit?.(hit)}
  setHover(inside(canvas,x,y))
 },[motion.x,motion.y,motion.dragging,panel,native,onHit,clock])
 let animation:PetAnimation='idle'
 if(chosen)animation=chosen.phase==='failed'?'failed':chosen.phase==='waiting'?'waiting':chosen.phase==='working'?'work':clock-chosen.updatedAt<1100?'jump':'review'
 else if(clock<greeting)animation='wave'
 else if(motion.walking)animation=motion.walking===1?'right':'left'
 if(motion.dragging)animation='waiting'
 const rect=canvasRef.current?.getBoundingClientRect()
 const dx=motion.x-(rect?rect.left+rect.width/2:0),dy=motion.y-(rect?rect.top+rect.height*.32:0)
 const look=!chosen&&animation==='idle'&&!panel&&!motion.walking&&Math.hypot(dx,dy)<300&&Math.hypot(dx,dy)>22?{x:dx,y:dy}:undefined
 const openTask=(id?:string)=>{onAction({type:'open',destination:'tasks',taskId:id});if(id)onAction({type:'acknowledge',taskId:id});setPanel(null)}
 const toggle=()=>{setPanel(old=>old?null:'menu');setGreeting(Date.now()+700)}
 return <div className={`lemy-stage ${snapshot.dark?'lemy-dark':''}`} style={{'--lemy-size':`${156*snapshot.preferences.scale}px`} as React.CSSProperties}>
  {(chosen||hover)&&!panel&&<button style={bubbleStyle} className={`lemy-bubble ${above?'lemy-bubble-above':'lemy-bubble-below'} ${chosen?.phase==='failed'?'lemy-error':''}`} title={chosen?`${s[chosen.phase]} · ${s[chosen.titleKey as keyof typeof s]||chosen.titleKey}`:s.idle} onClick={()=>chosen?openTask(chosen.id):toggle()} aria-label={chosen?s.open:s.title}>
   {chosen?<><strong>{s[chosen.phase]}</strong><span>{active>1?`${active} ${s.active}`:s[chosen.titleKey as keyof typeof s]||chosen.titleKey}{chosen.progress!==undefined&&chosen.phase==='working'?` · ${Math.round(chosen.progress)}%`:''}</span></>:<span>{s.idle}</span>}
  </button>}
  {panel&&<div ref={panelRef} className="lemy-panel" style={floatingStyle} aria-label={s.title}>
   <div className="lemy-panel-header"><strong>{panel==='tasks'?s.tasks:'Lemy'}</strong><button onClick={()=>setPanel(null)} aria-label={s.close}>×</button></div>
   {panel==='menu'?<>
    <div className="lemy-shortcuts">
     <button onClick={()=>{onAction({type:'open',destination:'chat'});setPanel(null)}}><PetIcon name="chat"/><span>{s.chat}</span></button>
     <button onClick={()=>setPanel('tasks')}><PetIcon name="tasks"/><span>{s.tasks}{active?` (${active})`:''}</span></button>
     <button onClick={()=>onAction({type:'open',destination:'home'})}><PetIcon name="home"/><span>{s.home}</span></button>
     <button onClick={()=>onAction({type:'open',destination:'help'})}><PetIcon name="help"/><span>{s.help}</span></button>
    </div>
    <div className="lemy-settings">
     <label><input type="checkbox" checked={snapshot.preferences.roaming} onChange={e=>onAction({type:'preferences',roaming:e.target.checked})}/>{s.roaming}</label>
     {native&&<label><input type="checkbox" checked={snapshot.preferences.alwaysOnTop} onChange={e=>onAction({type:'preferences',alwaysOnTop:e.target.checked})}/>{s.top}</label>}
     <div className="lemy-size"><span>{s.size}</span>{[[.75,s.small],[1,s.normal],[1.3,s.large]].map(([scale,label])=><button key={scale} aria-pressed={Math.abs(snapshot.preferences.scale-Number(scale))<.05} onClick={()=>onAction({type:'preferences',scale:Number(scale)})}>{label}</button>)}</div>
    </div>
    {!native&&<p className="lemy-preview-hint">{s.browser}</p>}
    <button className="lemy-hide" onClick={()=>onAction({type:'hide'})}>{s.hide}</button>
   </>:<>
    <div className="lemy-task-list">{snapshot.tasks.length?[...snapshot.tasks].reverse().map(task=><button key={task.id} className="lemy-task" onClick={()=>openTask(task.id)}>
     <span><strong>{s[task.titleKey as keyof typeof s]||task.titleKey}</strong><em>{s[task.phase]}</em></span>
     {task.phase==='working'&&task.progress!==undefined&&<progress max="100" value={task.progress}/>}
     {task.detail&&<small>{task.detail}</small>}
    </button>):<p>{s.empty}</p>}</div>
    <button className="lemy-hide" onClick={()=>onAction({type:'acknowledge'})}>{s.acknowledge}</button>
   </>}
  </div>}
  <Sprite canvasRef={canvasRef} onFrameTop={setFrameTop} className="lemy-sprite" style={{left:bodyX,top:bodyY,right:'auto',bottom:'auto'}} animation={animation} look={look} scale={snapshot.preferences.scale} reduced={reduced} role="button" tabIndex={0} aria-label={s.drag}
   onMouseEnter={()=>setHover(true)} onMouseLeave={()=>{if(!drag.current)setHover(false)}}
   onContextMenu={event=>{event.preventDefault();setPanel('menu')}}
   onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();toggle()}if(event.key==='Escape')setPanel(null)}}
   onPointerDown={event=>{if(event.button!==0)return;drag.current={x:event.screenX,y:event.screenY,started:false};event.currentTarget.setPointerCapture(event.pointerId)}}
   onPointerMove={event=>{
    const d=drag.current
    if(d&&!d.started&&Math.hypot(event.screenX-d.x,event.screenY-d.y)>4){d.started=true;onDrag(true);setPanel(null)}
    onPointerMove?.(event)
   }}
   onPointerUp={event=>{const d=drag.current;drag.current=null;onDrag(false);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);if(d&&!d.started){clearTimeout(clickTimer.current);clickTimer.current=setTimeout(toggle,230)}}}
   onPointerCancel={()=>{drag.current=null;onDrag(false)}}
   onDoubleClick={()=>{clearTimeout(clickTimer.current);onAction({type:'open',destination:'chat'});setPanel(null)}}
  />
 </div>
}
