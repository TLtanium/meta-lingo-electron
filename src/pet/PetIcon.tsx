export default function PetIcon({name}:{name:'chat'|'tasks'|'home'|'help'}){
 const paths={chat:'M4 4h16v12H9l-5 4V4Z',tasks:'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',home:'m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8',help:'M9.5 8a2.5 2.5 0 0 1 5 .5c0 2-2.5 2-2.5 4M12 17h.01'}
 return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>{name==='help'&&<circle cx="12" cy="12" r="10"/>}<path d={paths[name]}/></svg>
}
