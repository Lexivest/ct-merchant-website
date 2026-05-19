import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Injects <link rel="preload" as="image"> for the hero banner so the browser
// starts downloading it before React even executes. Without this, the browser
// only discovers the banner URL when JS renders the <img> tag — 2-4 s later.
// The hook captures the Rollup-hashed filename at build time and writes it into
// the HTML shell before Cloudflare Pages deploys it.
function bannerPreloadPlugin() {
  let bannerAssetPath = null

  return {
    name: 'ctm-banner-preload',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        if (/banner[^/]*\.(?:jpg|jpeg|webp|avif)$/i.test(fileName)) {
          bannerAssetPath = '/' + fileName
          break
        }
      }
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        if (!bannerAssetPath) return html
        const tag = `<link rel="preload" as="image" href="${bannerAssetPath}" fetchpriority="high">`
        return html.replace('</head>', `  ${tag}\n  </head>`)
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), bannerPreloadPlugin()],
})