import { useCallback, useEffect, useRef, useState } from 'react'
import { type PetMotion, type PetSnapshot, layoutPet } from '../../shared/desktopPet.mjs'
import { usePetStore } from '../stores/petStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useCorpusStore } from '../stores/corpusStore'
import { handlePetAction } from './navigation'
import PetView from './PetView'
import { getNativePetAPI } from './native'

function BrowserPet({snapshot}:{snapshot:PetSnapshot}){
 const [position,setPosition]=useState(()=>{try{const p=JSON.parse(localStorage.getItem('meta-lingo-pet-position')||'null');if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y))return layoutPet(p,{x:0,y:0,width:innerWidth,height:innerHeight},snapshot.preferences.scale).point}catch{/*default*/}return {x:Math.max(0,innerWidth-168),y:Math.max(0,innerHeight-180)}})
 const [motion,setMotion]=useState<PetMotion>({x:-1000,y:-1000,dragging:false,walking:0})
 const cursor=useRef({x:0,y:0}),anchor=useRef<{x:number;y:number;cx:number;cy:number}>(),interaction=useRef(false)
 const positionRef=useRef(position);positionRef.current=position
 const save=useCallback(()=>{localStorage.setItem('meta-lingo-pet-position',JSON.stringify(positionRef.current))},[])
 const drag=useCallback((active:boolean)=>{
  if(active){anchor.current={...positionRef.current,cx:cursor.current.x,cy:cursor.current.y}}
  else {if(anchor.current)save();anchor.current=undefined}
  setMotion(old=>({...old,dragging:active,walking:0}))
 },[save])
 const interact=useCallback((active:boolean)=>{interaction.current=active},[])
 useEffect(()=>{
  const move=(e:PointerEvent)=>{
   cursor.current={x:e.clientX,y:e.clientY}
   setMotion(old=>({...old,x:e.clientX,y:e.clientY}))
   if(anchor.current){const a=anchor.current;setPosition(layoutPet({x:a.x+e.clientX-a.cx,y:a.y+e.clientY-a.cy},{x:0,y:0,width:innerWidth,height:innerHeight},snapshot.preferences.scale).point)}
  }
  const resize=()=>setPosition(p=>layoutPet(p,{x:0,y:0,width:innerWidth,height:innerHeight},snapshot.preferences.scale).point)
  const release=()=>drag(false)
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',release);window.addEventListener('blur',release);window.addEventListener('resize',resize)
  return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',release);window.removeEventListener('blur',release);window.removeEventListener('resize',resize)}
 },[drag,snapshot.preferences.scale])
 useEffect(()=>{
  if(!snapshot.preferences.roaming||matchMedia('(prefers-reduced-motion: reduce)').matches)return
  let step:ReturnType<typeof setInterval>|undefined
  const id=setInterval(()=>{
   if(anchor.current||interaction.current||snapshot.tasks.some(t=>t.phase==='working'||t.phase==='waiting'||(t.phase==='failed'&&!t.acknowledged)))return
   const direction:1|-1=Math.random()<.5?-1:1;let n=0
   clearInterval(step);step=setInterval(()=>{
    if(anchor.current||interaction.current||n++>30){clearInterval(step);setMotion(m=>({...m,walking:0}));save();return}
    setPosition(p=>layoutPet({x:p.x+direction*2,y:p.y},{x:0,y:0,width:innerWidth,height:innerHeight},snapshot.preferences.scale).point);setMotion(m=>({...m,walking:direction}))
   },50)
  },22000)
  return()=>{clearInterval(id);clearInterval(step);setMotion(m=>({...m,walking:0}))}
 },[snapshot.preferences.roaming,snapshot.tasks,snapshot.preferences.scale,save])
 const layout=layoutPet(position,{x:0,y:0,width:innerWidth,height:innerHeight},snapshot.preferences.scale)
 return <div data-testid="lemy-browser-pet" style={{position:'fixed',left:layout.bounds.x,top:layout.bounds.y,width:layout.bounds.width,height:layout.bounds.height,zIndex:1600,pointerEvents:'none'}}><PetView snapshot={snapshot} motion={{...motion,bodyX:layout.bodyX,bodyY:layout.bodyY,viewWidth:layout.bounds.width,viewHeight:layout.bounds.height}} onAction={handlePetAction} onDrag={drag} onInteraction={interact}/></div>
}

export default function PetHost(){
 const preferences=usePetStore(s=>s.preferences),tasks=usePetStore(s=>s.tasks)
 const language=useSettingsStore(s=>s.language),dark=useSettingsStore(s=>s.darkMode)
 const [reducedMotion,setReducedMotion]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches)
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const change=()=>setReducedMotion(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change)},[])
 const native=getNativePetAPI()
 useEffect(()=>{
  const update=()=>{
   const state=usePetStore.getState()
   const live=new Set<string>()
   for(const task of useCorpusStore.getState().processingTasks.values()){
    const id='corpus:'+task.taskId;live.add(id)
    const phase=task.status==='completed'?'completed':task.status==='failed'?'failed':task.status==='cancelled'?'cancelled':task.status==='waiting'?'waiting':'working'
    const old=state.tasks.find(t=>t.id===id)
    if(!old&&(phase==='completed'||phase==='failed'||phase==='cancelled'))continue
    state.upsertTask({id,titleKey:'corpusTask',phase,progress:Number.isFinite(task.progress)?Math.max(0,Math.min(100,task.progress)):undefined,detail:task.message?.slice(0,160),target:{kind:'corpus',id:task.corpusId}})
   }
   // Disappearance without a terminal update is not evidence of success.
   for(const task of state.tasks)if(task.id.startsWith('corpus:')&&task.phase==='working'&&!live.has(task.id))state.upsertTask({...task,phase:'cancelled'})
  }
  update();return useCorpusStore.subscribe(update)
 },[])
 useEffect(()=>{
  if(!native)return
  return native.onAction(handlePetAction)
 },[native])
 useEffect(()=>{
  if(!native)return
  void native.sync({preferences,language:language==='en'?'en':'zh',dark,tasks,reducedMotion}).catch(error=>{
   console.error('Desktop pet unavailable:',error)
   // A failed native renderer must leave the entry point usable for a retry.
   if(preferences.enabled)usePetStore.getState().updatePreferences({enabled:false})
  })
 },[native,preferences,language,dark,tasks,reducedMotion])
 if(native||!preferences.enabled)return null
 return <BrowserPet snapshot={{preferences,language:language==='en'?'en':'zh',dark,tasks}}/>
}
