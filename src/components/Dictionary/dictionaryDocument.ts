/** Build an isolated document: dictionary HTML never runs with application privileges. */
import { API_BASE_URL } from '../../api/client'
import { audioButton, dictionaryAudioBridge, dictionaryAudioStyles, type AudioLabels } from './dictionaryAudio'
export function dictionaryDocument(html: string, dictionaryId: string, dark: boolean, labels: AudioLabels = { play: 'Play pronunciation', failed: 'Audio unavailable' }): string {
  const base = `${API_BASE_URL}/api/dictionary/resources/${encodeURIComponent(dictionaryId)}/`
  const document = new DOMParser().parseFromString(html, 'text/html')
  document.querySelectorAll('script,iframe,object,embed,base,meta,form,frame,frameset').forEach(node => node.remove())
  const resource = (value: string) => {
    const path = value.replace(/^sound:\/\//i, '').replace(/\\/g, '/').replace(/^\/+/, '')
    if (/^(https?:|data:|javascript:|vbscript:|file:|blob:)/i.test(path) || path.split('/').includes('..')) return ''
    return base + path.split('/').map(encodeURIComponent).join('/')
  }
  document.querySelectorAll('*').forEach(node => {
    Array.from(node.attributes).forEach(attribute => {
      const key = attribute.name.toLowerCase()
      if (key.startsWith('on') || key.startsWith('data-metalingo-') || ['srcdoc', 'nonce', 'integrity', 'formaction', 'action', 'srcset', 'target'].includes(key)) node.removeAttribute(attribute.name)
    })
    if (node.hasAttribute('src')) node.setAttribute('src', resource(node.getAttribute('src') || ''))
    if (node.tagName === 'LINK') {
      if (node.getAttribute('rel')?.toLowerCase() !== 'stylesheet') node.remove()
      else node.setAttribute('href', resource(node.getAttribute('href') || ''))
    }
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') || ''
      if (/^sound:\/\//i.test(href)) {
        node.replaceWith(audioButton(document, resource(href), labels))
      } else if (/^entry:\/\//i.test(href)) {
        try { node.setAttribute('data-word', decodeURIComponent(href.slice(8).split('#')[0])) } catch { node.setAttribute('data-word', href.slice(8).split('#')[0]) }; node.setAttribute('href', '#')
      } else if (!href.startsWith('#')) node.removeAttribute('href')
    }
  })
  document.querySelectorAll('audio').forEach(node => {
    const src = node.getAttribute('src') || node.querySelector('source[src]')?.getAttribute('src') || ''
    node.replaceWith(audioButton(document, src, labels))
  })
  const nonce = crypto.randomUUID().replace(/-/g, '')
  const origin = new URL(API_BASE_URL).origin
  // Only our nonce-bearing navigation/size bridge can execute; imported scripts are removed.
  const bridge = dictionaryAudioBridge(labels) + `document.addEventListener('click',e=>{const a=e.target.closest('a[data-word]');if(a){e.preventDefault();parent.postMessage({type:'dictionary-word',word:a.dataset.word},'*')}});const resize=()=>parent.postMessage({type:'dictionary-height',height:document.documentElement.scrollHeight},'*');new ResizeObserver(resize).observe(document.body);resize();`
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${origin} data:; media-src ${origin}; font-src ${origin} data:; style-src 'unsafe-inline' ${origin}; script-src 'nonce-${nonce}'; connect-src 'none'; base-uri ${origin}; form-action 'none'"><base href="${base}">${document.head.innerHTML}<style>:root{color-scheme:${dark ? 'dark' : 'light'}}body{font:16px/1.7 system-ui,sans-serif;margin:16px;color:${dark ? '#eee' : '#222'};overflow-wrap:anywhere}img{max-width:100%}a{color:${dark ? '#90caf9' : '#1565c0'};cursor:pointer}${dictionaryAudioStyles}</style></head><body>${document.body.innerHTML}<script nonce="${nonce}">${bridge}</script></body></html>`
}
