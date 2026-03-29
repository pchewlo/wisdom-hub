# The Wisdom Hub

Your reading highlights, distilled into mental models.

## Deploy to Vercel (no coding required)

### Step 1: Upload to GitHub
1. Go to [github.com/new](https://github.com/new) and create a new repository called `wisdom-hub`
2. Keep it **Public** or **Private** — either works
3. Click **"uploading an existing file"** link on the next page
4. Drag all the files from this folder into the upload area
5. Click **"Commit changes"**

### Step 2: Deploy on Vercel
1. Go to [vercel.com](https://vercel.com) and sign up with your GitHub account
2. Click **"Add New → Project"**
3. Find `wisdom-hub` in your repos and click **Import**
4. Framework preset should auto-detect as **Vite** — leave it
5. Click **Deploy**

### Step 3: Add your API key (for the solver feature)
1. In your Vercel project, go to **Settings → Environment Variables**
2. Add: `ANTHROPIC_API_KEY` = your key from [console.anthropic.com](https://console.anthropic.com)
3. Click **Save**
4. Go to **Deployments** and click **"Redeploy"** on the latest deployment

That's it. Your Wisdom Hub is live.

## Local development (optional)
```
npm install
npm run dev
```
Create a `.env.local` file with your API key:
```
ANTHROPIC_API_KEY=sk-ant-...
```

## Project structure
```
├── api/solve.js      ← Vercel serverless function (solver backend)
├── src/
│   ├── App.jsx       ← Main React component
│   ├── data.json     ← Your highlights + model classifications
│   └── main.jsx      ← React entry point
├── index.html        ← HTML entry
├── package.json      ← Dependencies
└── vite.config.js    ← Build config
```
