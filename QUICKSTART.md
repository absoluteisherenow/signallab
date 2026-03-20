# Quick Start Guide - Night Manoeuvres Dashboard

## ⚡ Start Development (2 minutes)

```bash
cd signal-lab-rebuild
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000)

## 🚀 Deploy to Vercel (5 minutes)

1. **Push to GitHub**
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/signal-lab-rebuild.git
   git push -u origin main
   ```

2. **Visit [vercel.com/new](https://vercel.com/new)**
   - Click "Import Git Repository"
   - Paste your GitHub repo URL
   - Click "Import"
   - Click "Deploy"

3. **Done!** Your dashboard is live at `signal-lab-rebuild.vercel.app`

## 📋 Project Overview

### Routes
| Path | Feature | Status |
|------|---------|--------|
| `/` | Dashboard - Forthcoming Shows | ✅ |
| `/gigs` | All Bookings | ✅ |
| `/gigs/[id]` | Logistics (33+ fields) + Invoicing | ✅ |
| `/prep/playlists` | Rekordbox Integration | ✅ |
| `/prep/tasks` | Event Prep Checklist | ✅ |
| `/business/finances` | Revenue & Expenses | ✅ |
| `/business/settings` | Profile Management | ✅ |

### Design
- **Colors**: Black #0F0E0C, Silver #C0C0C0
- **Style**: Modern, sleek (Linear.app/GitHub inspired)
- **Responsive**: Mobile, Tablet, Desktop
- **Icons**: Lucide React

## 🏗️ Tech Stack

```
Frontend Framework: Next.js 14 + React 18
Styling: Tailwind CSS 3
Language: TypeScript
Icons: Lucide React
Hosting: Vercel (or self-hosted)
```

## 📁 Key Files

```
src/
├── app/              # Page routes
├── components/       # Reusable components
│   ├── layout/Navigation.tsx     (main nav)
│   ├── dashboard/                 (overview)
│   ├── gigs/                      (logistics + invoicing)
│   ├── prep/                      (playlists + tasks)
│   └── business/                  (finances + settings)
└── globals.css       # Styles

tailwind.config.ts   # Colors & theme
```

## 🎨 Colors Reference

```css
Night Black:   #0F0E0C
Night Silver:  #C0C0C0
Night Gray:    #1A1815
Dark Gray:     #2D2924
Light:         #E8E8E8
```

## 🔧 Common Tasks

### Add a New Page
```
1. Create file: src/app/my-section/page.tsx
2. Add route to Navigation.tsx
3. Build component
```

### Customize Colors
Edit `tailwind.config.ts` → `theme.extend.colors`

### Change Brand Name
Update `NIGHT MANOEUVRES` text in:
- `Navigation.tsx` (logo/header)
- `README.md`
- `package.json` (name field)

### Build for Production
```bash
npm run build
npm start
```

## ✨ Features Included

✅ Premium Dark Theme  
✅ 3-Part Navigation (TOURING, PREP, BUSINESS)  
✅ Dashboard with 4 sample gigs  
✅ 7+ Contact fields per gig  
✅ Full invoicing (contracts, invoices, payments, expenses)  
✅ Profit margin calculations  
✅ Playlists with Rekordbox sync  
✅ Task management  
✅ Financial tracking  
✅ Settings/Profile  
✅ Cross-links to Broadcast Lab & SONIX  
✅ Mobile responsive  
✅ Vercel ready  

## 🐛 Troubleshooting

### Port 3000 already in use?
```bash
PORT=3001 npm run dev
```

### Build fails?
```bash
rm -rf .next node_modules
npm install
npm run build
```

### Vercel deployment fails?
Check build logs in Vercel Dashboard → Deployments

## 📚 Documentation

- **README.md** - Full feature documentation
- **DEPLOYMENT.md** - Detailed deployment options
- **BUILD_CHECKLIST.md** - Pre-deployment verification
- **This file** - Quick start guide

## 🎯 Next Steps

1. **Local Testing**: `npm run dev`
2. **Production Build**: `npm run build`
3. **Deploy**: Push to GitHub → Vercel → Done ✨

---

**Built with ❤️ for professional DJs and event managers.**

Ready to deploy? Run: `npm install && npm run build` 🚀
