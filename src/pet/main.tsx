import React, { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { DesktopPetAPI, PetMotion, PetSnapshot } from '../../shared/desktopPet.mjs'
import PetView from './PetView'
declare global { interface Window { desktopPetAPI?:DesktopPetAPI } }
function DesktopPet(){
 const [snapshot,setSnapshot]=useState<PetSnapshot|null>(null),[motion,setMotion]=useState<PetMotion>({x:-1000,y:-1000,dragging:false,walking:0})
 const api=window.desktopPetAPI
 useEffect(()=>{if(!api)return;let active=true;const off=api.onSnapshot(value=>setSnapshot(value)),offMotion=api.onMotion(setMotion);api.getSnapshot().then(value=>{if(active&&value)setSnapshot(value)});return()=>{active=false;off();offMotion()}},[api])
 useEffect(()=>{
  const move=(event:MouseEvent)=>setMotion(old=>({...old,x:event.clientX,y:event.clientY}))
  window.addEventListener('mousemove',move)
  return()=>window.removeEventListener('mousemove',move)
 },[])
 const action=useCallback((value:Parameters<DesktopPetAPI['action']>[0])=>{void api?.action(value)},[api])
 const drag=useCallback((value:boolean)=>api?.drag(value),[api]),hit=useCallback((value:boolean)=>api?.hit(value),[api]),interaction=useCallback((value:boolean)=>api?.interaction(value),[api])
 if(!snapshot)return null
 return <PetView snapshot={snapshot} motion={motion} native onAction={action} onDrag={drag} onHit={hit} onInteraction={interaction}/>
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><DesktopPet/></React.StrictMode>)
