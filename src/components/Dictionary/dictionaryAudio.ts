/** Compact audio controls inside the isolated dictionary document. */
export interface AudioLabels { play: string; failed: string }

export function audioButton(document: Document, src: string, labels: AudioLabels): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.setAttribute('data-metalingo-audio', src)
  button.setAttribute('aria-label', labels.play)
  button.setAttribute('aria-pressed', 'false')
  button.title = labels.play
  button.disabled = !src
  button.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.06A4.5 4.5 0 0 0 16.5 12zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z"/></svg>'
  return button
}

export const dictionaryAudioStyles = `
button[data-metalingo-audio]{all:unset;display:inline-flex!important;align-items:center;justify-content:center;width:26px!important;height:26px!important;box-sizing:border-box;vertical-align:middle;margin:0 3px;cursor:pointer;border-radius:50%;line-height:1;color:inherit}
button[data-metalingo-audio]:hover,button[data-metalingo-audio][aria-pressed=true]{background:rgba(100,140,210,.18)}
button[data-metalingo-audio]:focus-visible{outline:2px solid currentColor;outline-offset:2px}
button[data-metalingo-audio]:disabled{opacity:.4;cursor:default}
button[data-metalingo-audio] svg{width:18px!important;height:18px!important;pointer-events:none}
`

export function dictionaryAudioBridge(labels: AudioLabels): string {
  return `let playingAudio=null,playingButton=null;
document.addEventListener('click',e=>{
  const button=e.target.closest('button[data-metalingo-audio]');
  if(!button||button.disabled)return;
  e.preventDefault();
  if(playingAudio){playingAudio.pause();playingButton.setAttribute('aria-pressed','false')}
  const audio=new Audio(button.getAttribute('data-metalingo-audio'));
  playingAudio=audio;playingButton=button;
  button.setAttribute('aria-pressed','true');
  const done=()=>{if(playingAudio===audio){button.setAttribute('aria-pressed','false');playingAudio=null}};
  audio.addEventListener('ended',done);
  audio.addEventListener('error',()=>{button.title=${JSON.stringify(labels.failed)};done()});
  audio.play().catch(()=>{button.title=${JSON.stringify(labels.failed)};done()});
});`
}
