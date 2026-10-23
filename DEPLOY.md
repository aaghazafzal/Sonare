# Vercel pe deploy karna

Repo: <https://github.com/aaghazafzal/Sonare>. Ye ek static site hai (Vite), koi server ya database nahi chahiye.

## Ek baar ka setup (GitHub se import)

1. <https://vercel.com/new> kholo aur **aaghazafzal** wale GitHub account se login karo.
   Agar Vercel pehle se `aaghaz370` se connected hai, to "Add GitHub Account" / "Adjust GitHub App Permissions"
   se `aaghazafzal` account add karke `Sonare` repo ko access do.
2. **Sonare** repo ke aage **Import** dabao.
3. Settings Vercel khud `vercel.json` se le lega. Check kar lo:
   - Framework Preset: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`
   - Environment variables: kuch nahi chahiye
4. **Deploy** dabao. Build me ~1 minute lagta hai. Log me `copied 3194 samples to dist/audio` dikhna chahiye.

Iske baad har `git push` (main branch) pe Vercel apne aap naya deploy kar dega. Dusri branches ka preview URL alag milta hai.

> Vercel CLI (`vercel deploy`) se upload mat karna: Hobby plan pe CLI upload ki limit 100 MB hai aur samples ~119 MB ke hain.
> GitHub import me build Vercel ke server pe hota hai, wahan ye limit nahi lagti.

## Deploy ke baad kya test karna hai

- **Play**: koi bhi instrument chuno → pehli baar click karte hi sound aana chahiye (browser audio ko pehle click tak rok ke rakhta hai,
  upar ek "Sound is paused…" pill dikhegi).
- Pehli baar har instrument ke samples download hote hain (heading ke paas spinner). Uske baad browser cache se turant load honge.
- **Studio**: Play dabao → demo beat bajni chahiye. Export WAV try karo.
- **Vocal recording**: mic sirf HTTPS pe chalta hai — Vercel ka URL HTTPS hi hota hai, to theek hai. Browser mic permission maangega.
- **MIDI keyboard**: Chrome / Edge me chalta hai. Safari aur Firefox me Web MIDI nahi hai.
- **Home page**: `https://<your-site>/` khulte hi Home aana chahiye; link share karne pe preview image (`og-image.png`) dikhni chahiye.
- **Install app**: Chrome/Edge me address bar me install icon, ya Settings → Interface → *Install app*. iPhone pe Safari → Share →
  *Add to Home Screen*. Install ke baad app offline bhi khulta hai (jo sounds ek baar baj chuke hain wo bhi).
- **Songs**: Play → Big piano → *Songs* tile (phone pe header ka cap button). Wait mode me lit key dabate hi gaana aage badhna chahiye.
- **Safari (iPhone/Mac)**: har `.ogg` sample ki ek `.m4a` (AAC) copy repo me hai. Jo browser Ogg nahi chala sakta, wo apne aap `.m4a` uthata hai.

## Kuch dhyan rakhne wali baatein

- Free (Hobby) plan me 100 GB/month bandwidth milti hai. Ek user agar 10–15 instruments try kare to ~10–20 MB download karta hai,
  to normal testing ke liye kaafi hai. Audio files 1 saal ke liye cache hoti hain (`vercel.json` me header set hai).
- Sessions aur recordings user ke apne browser me save hote hain (localStorage + IndexedDB), server pe kuch nahi jaata.
- Domain badlo to `index.html` (canonical / og:url), `public/robots.txt` aur `public/sitemap.xml` me URL update karna.
- Naya version deploy hone pe service worker apne aap update ho jaata hai (agli baar page kholne pe).
- Public launch se pehle `Audio/` ke samples ka license confirm kar lena (bahut se sets CC-BY lagte hain, unme credit dena padta hai).

## Naye samples add karne ke baad

`Audio/` me naya instrument folder daalo, phir Safari ke liye AAC copies banao (ffmpeg chahiye) aur commit karo:

```bash
npm run manifest
npm run convert-samples
```

## Projects aur backup

Studio ke projects browser me apne aap save hote hain (File → My projects). Doosre device pe le jaane ke liye
File → Save session file — recordings bhi usi file me hoti hain.

## Local me production build check karna

```bash
npm run build
npm run preview
```
