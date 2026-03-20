# Night Manoeuvres - Signal Lab Dashboard

Professional DJ & Event Management Dashboard built with Next.js, React, and Tailwind CSS.

## Features

### 🎭 Core Navigation
- **TOURING**: Dashboard & Gigs management
- **PREP**: Playlists & Tasks
- **BUSINESS**: Finances & Settings

### 📊 Dashboard
- Forthcoming shows overview
- Quick statistics
- Easy gig navigation

### 🎤 Gig Management
- **LOGISTICS**: 33+ contact fields including:
  - Venue Manager
  - Promoter
  - Sound Engineer
  - Logistics Coordinator
  - Host/Emcee
  - Security Lead
  - Permits & Regulations
  
- **INVOICING**:
  - Contracts tracking
  - Invoice management
  - Payment tracking
  - Expense tracking
  - Profit calculation

### 🎵 PREP Section
- **Playlists**: Manage music collections with Rekordbox integration
- **Tasks**: Event preparation checklist

### 💰 BUSINESS Section
- **Finances**: Revenue & expense tracking
- **Settings**: Profile & preference management

### 🔗 Cross-Platform Integration
- Broadcast Lab integration
- SONIX automation links

## Design

- **Brand Colors**: Premium Dark
  - Black: `#0F0E0C`
  - Silver: `#C0C0C0`
  - Dark Gray: `#1A1815`, `#2D2924`
  - Light: `#E8E8E8`

- **Style**: Modern, sleek design inspired by Linear.app and GitHub
- **Typography**: Clean sans-serif with system fonts
- **Responsive**: Fully responsive on desktop, tablet, and mobile

## Tech Stack

- **Framework**: Next.js 14
- **UI**: React 18
- **Styling**: Tailwind CSS 3
- **Icons**: Lucide React
- **Language**: TypeScript
- **Deployment**: Vercel-ready

## Getting Started

### Prerequisites
- Node.js 18+ (recommend v22)
- npm or yarn

### Installation

```bash
# Clone or download the project
cd signal-lab-rebuild

# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
npm run build
npm start
```

## Deployment

### Deploy to Vercel

1. Push code to GitHub (or connect repository)
2. Import project in [Vercel Dashboard](https://vercel.com)
3. Click "Deploy"

The project includes `vercel.json` for optimal Vercel configuration.

## Project Structure

```
src/
├── app/
│   ├── layout.tsx           # Root layout
│   ├── globals.css          # Global styles
│   ├── page.tsx             # Dashboard (/)
│   ├── gigs/
│   │   ├── page.tsx         # Gigs list
│   │   └── [id]/page.tsx    # Gig detail
│   ├── prep/
│   │   ├── playlists/page.tsx
│   │   └── tasks/page.tsx
│   └── business/
│       ├── finances/page.tsx
│       └── settings/page.tsx
│
├── components/
│   ├── layout/
│   │   └── Navigation.tsx   # Main navigation
│   ├── dashboard/
│   │   ├── Dashboard.tsx
│   │   └── Header.tsx
│   ├── gigs/
│   │   ├── GigDetail.tsx
│   │   └── GigsList.tsx
│   ├── prep/
│   │   ├── PlaylistsPage.tsx
│   │   └── TasksPage.tsx
│   └── business/
│       ├── FinancesPage.tsx
│       └── SettingsPage.tsx
│
└── lib/
    └── (utilities and helpers)
```

## Color Reference

```css
/* Premium Dark Theme */
--night-black: #0F0E0C;
--night-silver: #C0C0C0;
--night-gray: #1A1815;
--night-dark-gray: #2D2924;
--night-light: #E8E8E8;

/* Accents */
--green-400: #4ade80;
--yellow-400: #facc15;
--red-400: #f87171;
```

## Key Pages

- **Dashboard** (`/`): Upcoming shows overview
- **Gigs** (`/gigs`): All bookings
- **Gig Detail** (`/gigs/[id]`): Full gig logistics & invoicing
- **Playlists** (`/prep/playlists`): Music management with Rekordbox
- **Tasks** (`/prep/tasks`): Preparation checklist
- **Finances** (`/business/finances`): Revenue & expense tracking
- **Settings** (`/business/settings`): Profile & preferences

## Future Enhancements

- [ ] Backend API integration
- [ ] Database persistence
- [ ] Authentication & user accounts
- [ ] Real-time Rekordbox sync
- [ ] PDF invoice generation
- [ ] Email notifications
- [ ] Calendar sync (Google Calendar, iCal)
- [ ] Mobile app (React Native)

## License

Private. All rights reserved.

## Support

For issues or features, contact the development team.

---

**Built with ❤️ for professional DJs and event managers.**
