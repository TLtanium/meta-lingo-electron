import { contextBridge } from 'electron'
import { createPetBridge } from './pet/bridge'
contextBridge.exposeInMainWorld('desktopPetAPI',createPetBridge())
