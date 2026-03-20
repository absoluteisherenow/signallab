# Deployment Guide - Night Manoeuvres Dashboard

## Quick Start to Production

### Option 1: Deploy to Vercel (Recommended)

**Prerequisites:**
- GitHub account
- Vercel account (free)

**Steps:**

1. **Push to GitHub**
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/signal-lab-rebuild.git
   git branch -M main
   git push -u origin main
   ```

2. **Import to Vercel**
   - Go to [vercel.com/new](https://vercel.com/new)
   - Select "Import Git Repository"
   - Paste GitHub URL
   - Click "Import"
   - Click "Deploy"

3. **Custom Domain (Optional)**
   - In Vercel Dashboard → Settings → Domains
   - Add your custom domain
   - Update DNS records as instructed

**Result:** Live at `signal-lab-rebuild.vercel.app` (or your custom domain)

---

### Option 2: Deploy to Self-Hosted Server

**Prerequisites:**
- Linux server (Ubuntu 20.04+ recommended)
- Node.js 18+
- Nginx or Apache
- PM2 (for process management)

**Steps:**

1. **Clone & Setup**
   ```bash
   git clone https://github.com/YOUR_USERNAME/signal-lab-rebuild.git
   cd signal-lab-rebuild
   npm install
   ```

2. **Build**
   ```bash
   npm run build
   ```

3. **Run with PM2**
   ```bash
   npm install -g pm2
   pm2 start npm --name "signal-lab" -- start
   pm2 save
   pm2 startup
   ```

4. **Nginx Configuration**
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
       }
   }
   ```

5. **SSL Certificate (Let's Encrypt)**
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d yourdomain.com
   ```

---

### Option 3: Docker Deployment

**Dockerfile** (create in project root):

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

**Build & Run:**
```bash
docker build -t signal-lab:latest .
docker run -p 3000:3000 signal-lab:latest
```

---

## Environment Variables

Create `.env.local` with:

```env
NEXT_PUBLIC_APP_NAME=Night Manoeuvres
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

---

## Post-Deployment Checklist

- [ ] Verify all pages load correctly
- [ ] Test navigation between sections
- [ ] Check gig detail pages (especially logistics contact fields)
- [ ] Test invoicing calculations
- [ ] Verify responsive design on mobile
- [ ] Test links to Broadcast Lab & SONIX
- [ ] Check favicon loads
- [ ] Verify page titles are correct
- [ ] Test form inputs (settings page)
- [ ] Monitor performance with Vercel Analytics

---

## Performance Optimization

### CDN Caching
- Images: cache-control: public, max-age=31536000
- CSS/JS: cache-control: public, max-age=31536000, immutable

### Image Optimization
Current: No image optimization needed (component-based design)

### Web Vitals
Target:
- **LCP** (Largest Contentful Paint): < 2.5s
- **FID** (First Input Delay): < 100ms
- **CLS** (Cumulative Layout Shift): < 0.1

---

## Monitoring & Debugging

### Vercel Insights
- Dashboard → Analytics → Web Vitals
- Monitor real user metrics

### Local Testing
```bash
npm run build
npm start
# Then navigate to http://localhost:3000
```

### Production Logs
```bash
# Vercel
vercel logs signal-lab-rebuild

# Self-hosted
pm2 logs signal-lab
```

---

## Troubleshooting

### Build Fails
```bash
# Clear cache and rebuild
rm -rf .next node_modules
npm install
npm run build
```

### Port Already in Use (3000)
```bash
# Change port
PORT=3001 npm start
```

### CORS Issues
- Currently no external API calls
- When adding backend, update `next.config.js`

---

## Updating & Maintenance

### Deploy Updates
```bash
# Pull latest changes
git pull origin main

# Rebuild & restart
npm run build
pm2 restart signal-lab
```

### Database Setup (Future)
When adding persistence:
```bash
# Run migrations
npm run migrate

# Seed data
npm run seed
```

---

## Support

For deployment issues:
- Check Vercel status page
- Review build logs
- Test locally first: `npm run dev`

---

**Ready to deploy! 🚀**
