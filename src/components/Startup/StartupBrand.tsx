import { useId } from 'react'
import brand from '../../../assets/Background.png'

/** Keep the approved source untouched; remove its white paper only at render time. */
export default function StartupBrand() {
  const id = `startup-ink-${useId().replace(/:/g, '')}`
  return <svg className="startup-brand" viewBox="360 220 960 510" role="img" aria-label="Meta-Lingo">
    <defs>
      <filter id={id} colorInterpolationFilters="sRGB">
        <feColorMatrix in="SourceGraphic" type="matrix"
          values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -.2126 -.7152 -.0722 0 1" result="ink-alpha" />
        <feComponentTransfer in="ink-alpha" result="ink-mask">
          <feFuncA type="linear" slope="1.08" intercept="-0.08" />
        </feComponentTransfer>
        <feFlood floodColor="currentColor" result="ink-color" />
        <feComposite in="ink-color" in2="ink-mask" operator="in" />
      </filter>
    </defs>
    <image href={brand} width="1672" height="941" filter={`url(#${id})`} />
  </svg>
}
