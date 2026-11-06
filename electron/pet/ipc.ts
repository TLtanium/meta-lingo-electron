import { ipcMain } from 'electron'
import { sanitizePreferences, type PetAction, type PetSnapshot } from '../../shared/desktopPet.mjs'
import { PetWindow, type PetWindowOptions } from './window'

export function registerPetHandlers(options: PetWindowOptions) {
  const pet=new PetWindow(options)
  const isMain=(sender: Electron.WebContents)=>options.getMain()?.webContents===sender
  const isPet=(sender: Electron.WebContents)=>pet.window?.webContents===sender
  const authorized=(sender: Electron.WebContents)=>isMain(sender)||isPet(sender)
  ipcMain.handle('pet:sync',(event,value:PetSnapshot)=>{
    if(!isMain(event.sender)||!value||!Array.isArray(value.tasks))return
    pet.sync({preferences:sanitizePreferences(value.preferences??{}),language:value.language==='en'?'en':'zh',dark:value.dark===true,reducedMotion:value.reducedMotion===true,
      tasks:value.tasks.filter(t=>t&&typeof t.id==='string'&&typeof t.titleKey==='string'&&['working','waiting','completed','failed','cancelled'].includes(t.phase)&&t.target&&['agent','corpus','tab'].includes(t.target.kind)).slice(-120)})
  })
  ipcMain.handle('pet:get',event=>authorized(event.sender)?pet.snapshot:null)
  ipcMain.handle('pet:action',(event,action:PetAction)=>{
    if(!authorized(event.sender)||!action||typeof action!=='object')return
    if(action.type==='hide'||action.type==='acknowledge')pet.action(action)
    if(action.type==='open'&&['chat','tasks','home','help'].includes(action.destination))pet.action(action)
    if(action.type==='preferences'){
      pet.action({type:'preferences',...(typeof action.scale==='number'&&Number.isFinite(action.scale)?{scale:Math.max(.65,Math.min(1.4,action.scale))}:{}),...(typeof action.roaming==='boolean'?{roaming:action.roaming}:{}),...(typeof action.alwaysOnTop==='boolean'?{alwaysOnTop:action.alwaysOnTop}:{})})
    }
  })
  ipcMain.on('pet:hit',(event,active)=>{if(isPet(event.sender)&&typeof active==='boolean')pet.hit(active)})
  ipcMain.on('pet:interaction',(event,active)=>{if(isPet(event.sender)&&typeof active==='boolean')pet.interaction(active)})
  ipcMain.on('pet:drag',(event,active)=>{if(isPet(event.sender)&&typeof active==='boolean')pet.drag(active)})
  ipcMain.handle('pet:reset',event=>{if(isMain(event.sender))pet.reset()})
  return pet
}
