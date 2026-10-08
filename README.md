<p align="center">
  <img src="media/brand/orion-512.png" width="96" alt="Orion Store logo">
</p>

<h1 align="center">Orion Store website</h1>

<p align="center">
  The official website of <a href="https://github.com/RookieEnough/Orion-Store">Orion Store</a>, the free, open-source Android app store that installs apps straight from their public releases on GitHub, GitLab and Codeberg.
</p>

<p align="center">
  <a href="https://github.com/RookieEnough/Orion-Store">App</a> ·
  <a href="https://rookieenough.github.io/Orion-Docs/">Docs</a> ·
  <a href="https://github.com/RookieEnough/Orion-Data">Catalog</a> ·
  <a href="https://github.com/RookieEnough/Morphe-AutoBuilds">Morphe AutoBuilds</a>
</p>

---

A single animated page, built with no framework and no build step to visit it. It's one `index.html`, plain CSS and native ES modules, with every library vendored locally, so it runs from any static host and works with JavaScript off.

## Contents

- [What's on the page](#whats-on-the-page)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Run it locally](#run-it-locally)
- [Editing content](#editing-content)
- [The build script](#the-build-script)
- [Deploy](#deploy)
- [Regenerating assets](#regenerating-assets)
- [Performance and accessibility](#performance-and-accessibility)
- [Credits](#credits)
- [License](#license)

## What's on the page

| Section | What it shows |
| --- | --- |
| Hero | A real-time WebGL mark (glass prism, indigo orb, brushed-metal cube) built to the app icon's geometry, with live GitHub stars |
| Engineered by subtraction | What Orion leaves out: accounts, trackers, servers |
| Three shapes, one chain of custody | How an app travels from its developer's release to your phone |
| Inside the app | A scroll-driven phone that steps through the app's main screens |
| Watch it work | The YouTube walkthrough, behind a click-to-load privacy-enhanced player |
| Unretouched | A draggable gallery of real screenshots |
| Ecosystem | The four public repositories that make up the whole backend |
| Releases | Every release with its download count, drawn as a constellation |
| FAQ, Developer, Support | Common questions, the developer, and ways to support the project (UPI, Ko-fi, PayPal, free help) with interactive 3D objects |
| Get Orion | The download, linked to the latest release |

## Tech stack

- **HTML, CSS, ES modules.** No framework, no bundler, no `npm install`.
- **[GSAP](https://gsap.com) 3.15** with ScrollTrigger and SplitText for all choreography.
- **[Lenis](https://github.com/darkroomengineering/lenis) 1.3** for smooth scrolling, driven by GSAP's ticker.
- **[three.js](https://threejs.org) r186**, trimmed to the classes the site actually uses (`vendor/three.subset.min.js`).
- **Space Grotesk** and **Space Mono**, self-hosted as WOFF2.
- **Node** (no packages) for `tools/build.mjs`, and **Python** for the optional local server.

## Project structure

```
├── index.html               All content; readable with JavaScript off
├── css/site.css             Layout, type and every static state
├── js/
│   ├── main.js              Smooth scroll, scroll choreography, menu, gallery, video, releases
│   ├── scene.js             The hero's WebGL mark
│   ├── gifts.js             The support section's 3D objects (chai glass, mug, coin, star)
│   ├── studio.js            The studio environment map both WebGL files light with
│   ├── live.js              Live GitHub stars, latest version and download totals
│   └── util.js              Small helpers shared by main.js and live.js
├── vendor/                  GSAP, ScrollTrigger, SplitText, Lenis, the three.js subset
├── fonts/                   Self-hosted WOFF2 fonts
├── media/
│   ├── brand/               Logo, favicons, UPI QR
│   ├── screens/             App screenshots + captions.txt
│   ├── dev/                 Developer photo
│   └── og/                  Social share card
├── tools/
│   ├── build.mjs            Bakes releases, icons, gallery and version stamps into index.html
│   ├── releases.snapshot.json  Release data the build bakes in
│   ├── sprite.svg.html      Every available icon; the build keeps only the used ones
│   ├── serve.py             Local server with caching turned off
│   ├── og.html              Source for the social share card
│   ├── upi-qr.mjs           Generates the styled UPI QR
│   └── three-subset.js      Entry point for rebuilding the three.js subset
└── .github/workflows/deploy.yml   Builds and publishes to Cloudflare Pages
```

## Run it locally

ES modules don't load from `file://`, so serve the folder over HTTP:

```sh
git clone https://github.com/RookieEnough/Orion-Website.git
cd Orion-Website
python tools/serve.py          # http://127.0.0.1:5173
```

`serve.py` is `python -m http.server` with caching turned off, so every edit shows on the next reload. Pass a port to change it: `python tools/serve.py 8080`. Any other static server works too (`npx serve`, for example).

## Editing content

After any edit to the screenshots, CSS, JS or media, run the build so the page picks it up:

```sh
node tools/build.mjs
```

Pushing to `main` runs the same build in GitHub Actions before deploying, so you don't have to commit its output by hand. Running it locally is only needed to preview.

### Screenshots

Drop any `.jpg`, `.png`, `.webp` or `.avif` into `media/screens/`. Every image the page doesn't already use joins the end of the gallery.

To give a screenshot a title and subtitle, add a line to `media/screens/captions.txt`:

```
file name           | Title            | Subtitle
app-bundles.jpg     | De-Google bundle | Seven privacy apps, one download
```

- Screenshots appear in the order they're listed.
- Leave the title empty (`file.jpg | | Subtitle`) to keep the one made from the file name. Leave the subtitle off (`file.jpg | Title`) for a title alone.
- A file that isn't listed goes after the listed ones and is captioned from its name (`dark-mode.jpg` → "Dark mode"), so name files descriptively.
- To remove a screenshot, delete the file and its line.

### Fixed slots

These slots already point at a file path; to fill one, add a file at that path. Slots without a file are hidden automatically. Add `?slots` to the URL (`http://127.0.0.1:5173/?slots`) to see every slot with its path and recommended size.

| Where | File | Size |
| --- | --- | --- |
| Inside (phone) | `media/screens/discover.jpg` | 720 × 1500 |
| | `media/screens/source-gitlab.jpg` | 720 × 1500 |
| | `media/screens/update-center.jpg` | 720 × 1500 |
| | `media/screens/sentinel.jpg` | 720 × 1500 |
| | `media/screens/settings.jpg` | 720 × 1500 |
| | `media/screens/hall-of-fame.jpg` | 720 × 1500 |
| | `media/screens/personalize.jpg` | 720 × 1500 |
| Gallery | `media/screens/catalog-android.jpg` | any phone shot |
| | `media/screens/catalog-pc.jpg` | any |
| | `media/screens/catalog-tv.jpg` | any |
| | `media/screens/source-codeberg.jpg` | any |
| | `media/screens/my-apps.jpg` | 720 × 1500 |
| | `media/screens/developer.jpg` | any |
| | `media/screens/shizuku.jpg` | 720 × 1500 |
| Developer | `media/dev/avatar.jpg` | 800 × 800 |

`shizuku.jpg` isn't added yet, so the browser console shows a 404 for it until it is.

### The video

In `index.html`, change the `href` of the film's play button (`data-film-play`) to any YouTube link (`watch?v=`, `youtu.be/`, `shorts/` or `embed/`). That one link sets both the poster, which is the video's own YouTube thumbnail (re-fetched daily, so a new thumbnail shows up on its own), and what plays. The player is a `youtube-nocookie.com` embed that loads only after the visitor presses play.

### Live numbers

Star counts, release rows and download totals are baked into the HTML, so the page is complete as shipped. On load, `js/live.js` refreshes them from the public GitHub API and caches the result for an hour. If the API is offline or rate-limited, the baked numbers stay and nobody sees a gap.

## The build script

`tools/build.mjs` has no dependencies and rewrites only the regions between `<!--name:start-->` / `<!--name:end-->` markers in `index.html`. Running it twice produces the same file.

1. **Releases:** the release rows, from `tools/releases.snapshot.json`.
2. **Sprite:** the inline icon sprite, pruned to the icons the page uses.
3. **Screens:** gallery frames for screenshots the page doesn't use yet, captioned from `captions.txt`.
4. **Version stamps:** a `?v=<content hash>` on every local CSS, JS and media URL, plus an import map that does the same for module imports. Browsers never serve a stale file, and an unchanged file stays cached.

To refresh the release snapshot by hand (needs the [GitHub CLI](https://cli.github.com)):

```sh
gh api "repos/RookieEnough/Orion-Store/releases?per_page=100" \
  --jq '[.[] | select(.draft | not) | {tag: .tag_name, name: (.name // .tag_name), date: (.published_at[:10]), downloads: ([.assets[].download_count] | add // 0), size: ([.assets[] | select(.name | endswith(".apk")) | .size] | first // 0)}]' \
  > tools/releases.snapshot.json
node tools/build.mjs
```

The deploy workflow does this on every run, so the live site doesn't depend on the committed snapshot being current.

## Deploy

### Cloudflare Pages (automatic)

`.github/workflows/deploy.yml` publishes the site to `https://orion-store.pages.dev`:

| Trigger | Why |
| --- | --- |
| Every push to `main` | Content and code changes go live in about a minute |
| Every 6 hours | Picks up new Orion Store releases and download counts (they live in another repo, so they can't trigger this one) |
| **Actions → Deploy to Cloudflare Pages → Run workflow** | Deploy on demand |

Each run refreshes the release snapshot, runs the build, copies only the public files (leaving out `tools/`, docs, `LICENSE` and `captions.txt`), and uploads them with Cloudflare's `wrangler` CLI. It never commits back to the repo.

**One-time setup**

1. **Cloudflare account:** sign up free at [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up). You don't need a domain or a card.
2. **API token:** go to **My Profile → API Tokens → Create Token → Create Custom Token**. Set the permission to **Account · Cloudflare Pages · Edit**, and under Account Resources include your account. Create it and copy the token; Cloudflare shows it only once.
3. **Account ID:** it's the 32-character code in the dashboard URL (`dash.cloudflare.com/<account-id>/…`), and it's also shown under **Workers & Pages**.
4. **GitHub secrets:** in this repo, go to **Settings → Secrets and variables → Actions → New repository secret** and add:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
5. **Run it:** open **Actions → Deploy to Cloudflare Pages → Run workflow**. The first run creates the Pages project. The log ends with the deployment URL.

Until the secrets are set, runs finish with a warning instead of failing.

**Settings**

- **Site name:** `PAGES_PROJECT` at the top of the workflow sets the address (`https://<name>.pages.dev`). If the name is taken, Cloudflare adds a suffix; the log shows the real address.
- **Link previews:** once you know the final address, make the `og:image` meta tag in `index.html` absolute (`https://orion-store.pages.dev/media/og/orion-og.jpg`) so shared links show the card on Discord, X and WhatsApp.
- **Custom domain:** in Cloudflare, go to **Workers & Pages → orion-store → Custom domains**.
- **Rollback:** under **Deployments**, open an older deployment's **⋯** menu and choose **Rollback**.
- **Inactive repos:** GitHub pauses scheduled runs in a repo with no commits for 60 days. Re-enable them from the Actions tab.

**Troubleshooting**

| Error | Fix |
| --- | --- |
| `Authentication error [code: 10000]` | The token is wrong or lacks **Cloudflare Pages · Edit**. Make a new one and update the secret. |
| `Project not found` | `PAGES_PROJECT` must be lowercase letters, numbers and dashes. |
| `marker … not found` | A `<!--…:start-->` / `<!--…:end-->` pair was removed from `index.html`. Put it back. |
| `captions.txt lists files that are not in media/screens` | A warning only: a caption line names a missing file, usually a typo. |

### Any other static host

The repo works as-is on any static host:

- **GitHub Pages:** Settings → Pages → deploy from `main`, root folder. `.nojekyll` stops Jekyll from processing it.
- **Netlify, Vercel, Cloudflare Pages (Git integration):** leave the build command empty and set the output directory to the repo root.

On these hosts the release rows come from the committed snapshot. Live numbers still refresh in the browser.

## Regenerating assets

### UPI QR

`media/brand/upi-qr.svg` is generated from the UPI ID by `tools/upi-qr.mjs`. It needs the `qrcode` package, which you can install in any scratch folder (`npm i qrcode`):

```sh
QRCODE_FROM=/path/to/scratch-folder node tools/upi-qr.mjs
node tools/build.mjs
```

### Social card

`tools/og.html` is the source for `media/og/orion-og.jpg`. Open `http://127.0.0.1:5173/tools/og.html` at 1200 × 630 and save a screenshot over the JPG.

### three.js subset

`vendor/three.subset.min.js` contains only what `js/scene.js`, `js/gifts.js` and `js/studio.js` import (listed in `tools/three-subset.js`). If you import something new, add it there and rebuild:

```sh
npm i three@0.186 esbuild    # in any scratch folder
npx esbuild tools/three-subset.js --bundle --format=esm --minify --legal-comments=eof \
  --outfile=vendor/three.subset.min.js \
  --alias:three=./node_modules/three/build/three.module.js \
  "--alias:three/addons=./node_modules/three/examples/jsm"
```

## Performance and accessibility

- **No WebGL on first paint.** The 3D scenes load only on capable devices with motion allowed, and the support objects load only when their section is near. Rendering pauses when a scene is offscreen or the tab is hidden.
- **Lazy media.** Screenshots load lazily. The video player isn't loaded until someone presses play.
- **Everything is local.** Fonts and libraries are self-hosted and version-stamped, so there are no third-party requests until the visitor asks for the video.
- **Reduced motion.** With `prefers-reduced-motion`, the page is fully static: no smooth scroll, no scrubbed animation, no 3D.
- **Works without JavaScript.** All content is in the HTML. If scripts fail, anything waiting on them appears after 4 seconds anyway.
- **Accessible split text.** Headings keep an unsplit accessible name; the animated words are hidden from screen readers.
- **Keyboard navigation and focus.** Every control is reachable by keyboard, with visible focus.

## Credits

- Design and development: [Sarthak Sinha (RookieEnough)](https://github.com/RookieEnough)
- [GSAP](https://gsap.com) by GreenSock, under the [GSAP Standard License](https://gsap.com/standard-license)
- [Lenis](https://github.com/darkroomengineering/lenis) by darkroom.engineering, MIT
- [three.js](https://threejs.org), MIT
- [Space Grotesk](https://github.com/floriankarsten/space-grotesk) and [Space Mono](https://github.com/googlefonts/spacemono), SIL Open Font License 1.1

## License

The website's own code is licensed under [GPL-3.0](LICENSE), like Orion Store itself. The vendored libraries and fonts keep their own licenses, listed above.
