# Cloudflare Pages pe deploy karna (sonare.website)

Sonare ek static site hai (Vite build) — koi server ya database nahi chahiye. Hosting **Cloudflare Pages** pe hai kyunki
free plan me bandwidth ki limit nahi hai aur commercial use allowed hai. Site me ~5,750 files hain (limit 20,000) aur koi
file 25 MB se badi nahi hai, to sab free plan me fit hai.

Jo settings repo me pehle se hain:

- `public/_headers` — security headers (CSP, mic/MIDI permission) aur caching: samples 1 saal, service worker hamesha fresh.
- `public/404.html` — galat URL pe dikhne wala page (Cloudflare isse 404 status ke saath bhejta hai).
- `.nvmrc` — build Node 22 pe chalega.
- `index.html`, `robots.txt`, `sitemap.xml` — sab `https://sonare.website` pe set hain.

## 1. Domain ko Cloudflare me laao (ek baar)

1. <https://dash.cloudflare.com> pe account banao / login karo.
2. **Add a domain** → `sonare.website` likho → **Free** plan chuno.
3. Cloudflare do nameservers dega (jaise `xxx.ns.cloudflare.com`). Jahan se domain kharida hai (registrar) wahan
   domain ki settings me **Nameservers → Custom** karke yahi do daal do.
4. Nameserver badalne me kuch minute se 24 ghante tak lag sakte hain. Cloudflare email karega jab domain **Active** ho jaaye.
5. Domain active hone ke baad: **SSL/TLS → Overview → Full**, aur **SSL/TLS → Edge Certificates → Always Use HTTPS: On**.

## 2. Pages project banao (GitHub se)

1. Dashboard me **Workers & Pages → Create → Pages → Import an existing Git repository**.
2. **aaghazafzal** GitHub account connect karo aur sirf **Sonare** repo ka access do (repo private ho tab bhi chalega).
3. Build settings:
   - Production branch: `main`
   - Framework preset: **None** (ya Vite)
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Environment variable: `NODE_VERSION` = `22` (`.nvmrc` bhi hai, ye double safety hai)
4. **Save and Deploy**. Build me 1–3 minute lagte hain; log me `copied 5684 samples to dist/audio` dikhna chahiye.
5. Pehle `https://sonare-xxx.pages.dev` jaisa address milega — usse ek baar khol ke check kar lo.

Iske baad har `git push` (main) pe Cloudflare apne aap naya version deploy karega. Dusri branch ka alag preview link milta hai.

## 3. Custom domain jodo

1. Pages project → **Custom domains → Set up a custom domain** → `sonare.website` → Activate.
   Domain Cloudflare pe hi hai, to DNS record apne aap ban jaata hai.
2. Wahi dobara `www.sonare.website` ke liye karo.
3. `www` ko main domain pe bhejne ke liye: domain ke dashboard me **Rules → Redirect Rules → Create rule → "Redirect from WWW to root"**
   template chuno → Deploy. Isse Google ko ek hi address dikhega.
4. 5–10 minute me `https://sonare.website` live ho jaayega (SSL certificate Cloudflare khud lagata hai).

## 4. Vercel ka kya karna hai

- Domain sirf Cloudflare Pages pe point karna hai — Vercel pe `sonare.website` add mat karna.
- Cloudflare wala live hone ke baad Vercel project ko **Settings → Git → Disconnect** kar do (ya project delete), taaki do jagah
  build na chale. `vercel.json` repo me rehne do — usme bhi wahi headers hain, kabhi wapas Vercel pe jaana ho to kaam aayega.

## Deploy ke baad kya test karna hai

- **Home** (`https://sonare.website/`): piano wali window chalni chahiye; keys dabane pe sound aaye.
  Link WhatsApp/Twitter pe share karo → logo wali preview image dikhni chahiye.
- **Play**: koi bhi instrument chuno → pehle click pe sound (browser audio ko pehle click tak rokta hai, upar "Sound is paused…" pill dikhegi).
- **Studio**: Play dabao → beat bajni chahiye. File → Export audio → WAV aur MP3 dono try karo.
- **Vocal recording**: mic sirf HTTPS pe chalta hai — browser permission maangega.
- **MIDI keyboard**: Chrome / Edge me chalta hai (Safari aur Firefox me Web MIDI nahi hai).
- **Songs**: Play → Big piano → *Songs* tile (phone pe header ka cap button). Wait mode me lit key dabate hi gaana aage badhe.
- **Install app**: Chrome/Edge me address bar ka install icon, ya Settings → Interface → *Install app*. iPhone: Safari → Share →
  *Add to Home Screen*. Install ke baad app offline bhi khulta hai.
- **Galat link** (`https://sonare.website/kuch-bhi`): "This page hit a wrong note" wala 404 page aana chahiye.
- **Asli phone**: ek iPhone (Safari) aur ek Android (Chrome) pe upar ke steps ek baar zaroor chalana.

## Kuch dhyan rakhne wali baatein

- Projects aur recordings user ke apne browser me save hote hain (localStorage + IndexedDB), server pe kuch nahi jaata.
- Naya version deploy hone pe service worker apne aap update ho jaata hai (agli baar page kholne pe).
- Domain kabhi badle to `index.html` (canonical, og:url, og:image, JSON-LD), `public/robots.txt` aur `public/sitemap.xml` me URL badalna.
- Site me koi third-party script nahi hai. Kabhi analytics ya ads jodo to `public/_headers` (aur `vercel.json`) ki
  `Content-Security-Policy` me unka domain allow karna padega, warna browser unhe block kar dega — aur privacy policy bhi update karni hogi.
- Free plan me 500 builds/month milte hain — har push ek build hai, normal kaam ke liye kaafi hai.

## Naye samples add karne ke baad

`Audio/` me naya instrument folder daalo, phir Safari ke liye AAC copies banao (ffmpeg chahiye) aur commit karo:

```bash
npm run manifest
npm run convert-samples
```

## Local me production build check karna

```bash
npm run build
npm run preview
```
