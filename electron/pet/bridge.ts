import { ipcRenderer } from 'electron'
import type { DesktopPetAPI } from '../../shared/desktopPet.mjs'
function listen<T>(channel:string,callback:(payload:T)=>void){
  const listener=(_event:Electron.IpcRendererEvent,payload:T)=>callback(payload)
  ipcRenderer.on(channel,listener)
  return ()=>ipcRenderer.removeListener(channel,listener)
}
export function createPetBridge(): DesktopPetAPI {
  return {
    sync:snapshot=>ipcRenderer.invoke('pet:sync',snapshot),
    getSnapshot:()=>ipcRenderer.invoke('pet:get'),
    onSnapshot:callback=>listen('pet:snapshot',callback),
    onAction:callback=>listen('pet:action',callback),
    onMotion:callback=>listen('pet:motion',callback),
    action:action=>ipcRenderer.invoke('pet:action',action),
    hit:active=>ipcRenderer.send('pet:hit',active),
    interaction:active=>ipcRenderer.send('pet:interaction',active),
    drag:active=>ipcRenderer.send('pet:drag',active),
    reset:()=>ipcRenderer.invoke('pet:reset'),
  }
}
