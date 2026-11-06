import type { PetAction } from '../../shared/desktopPet.mjs'
import { usePetStore } from '../stores/petStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useChatStore } from '../stores/chatStore'
import { useTabStore } from '../stores/tabStore'

export function handlePetAction(action:PetAction){
 const pet=usePetStore.getState()
 if(action.type==='hide'){pet.updatePreferences({enabled:false});return}
 if(action.type==='preferences'){pet.updatePreferences({...(action.scale!==undefined?{scale:action.scale}:{}),...(action.roaming!==undefined?{roaming:action.roaming}:{}),...(action.alwaysOnTop!==undefined?{alwaysOnTop:action.alwaysOnTop}:{})});return}
 if(action.type==='acknowledge'){pet.acknowledge(action.taskId);return}
 const target=action.taskId?pet.tasks.find(t=>t.id===action.taskId)?.target:undefined
 const tabs=useTabStore.getState()
 if(action.destination==='chat'||target?.kind==='agent'){
  if(target?.kind==='agent'&&target.id&&useChatStore.getState().conversations.some(c=>c.id===target.id))useChatStore.getState().setActiveConversation(target.id)
  useSettingsStore.getState().setAgentMode(true)
  window.dispatchEvent(new Event('meta-lingo:pet-open-chat'))
  return
 }
 useSettingsStore.getState().setAgentMode(false)
 if(target?.kind==='tab'&&tabs.tabs.some(t=>t.id===target.id)){tabs.setActiveTab(target.id);return}
 if(target?.kind==='corpus'){
  const existing=tabs.tabs.find(t=>t.type==='corpus')
  const props={petCorpusId:target.id,petNavigationToken:Date.now()}
  if(existing){tabs.updateTab(existing.id,{props:{...existing.props,...props}});tabs.setActiveTab(existing.id)}
  else tabs.openTab({type:'corpus',title:'corpus.title',props})
  return
 }
 if(action.destination==='help'){tabs.openTab({type:'help',title:'help.title'});return}
 // Task-list UI is shown by the pet. The native app action without a task simply
 // returns to the current workspace; it does not invent a result destination.
 if(action.destination==='home')tabs.setActiveTab('home')
}
