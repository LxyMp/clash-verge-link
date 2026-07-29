import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'fs'

const svg = readFileSync('src/assets/icons/icon.svg', 'utf-8')

// 16/24/32: toolbar（含 retina）；48: 管理页；128: 商店
for (const size of [16, 24, 32, 48, 128]) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0,0,0,0)',
  })
  const png = resvg.render().asPng()
  const out = `src/assets/icons/icon${size}.png`
  writeFileSync(out, png)
  console.log(`wrote ${out} (${png.length} bytes)`)
}
