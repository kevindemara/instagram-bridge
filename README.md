# Instagram Bridge for Styling Display

This is a Node.js companion script to bypass Instagram's server-side blocks.

## Setup
1. Ensure you have [Node.js](https://nodejs.org/) installed.
2. Open a terminal in this folder:
   `styling-display/instagram-bridge/`
3. Install dependencies:
   ```bash
   npm install
   ```

## Usage
1. Start the server:
   ```bash
   node server.js
   ```
   It will listen on `http://localhost:3000`.

2. Go to WordPress Admin > Styling Display > Generator.
3. Paste an Instagram Reel URL and click Fetch. The plugin will automatically try to communicate with this bridge first.

## Railway Deployment (Recommended)
1. Initialize a new git repository in this folder or upload these files to a new GitHub repository (`.gitignore` is included).
2. Go to [Railway.app](https://railway.app) and create a new project.
3. Choose "Deploy from GitHub repo" and select your new repository.
4. Railway will auto-detect the Node.js app.
5. Once deployed, copy the provided URL (e.g., `https://my-app.up.railway.app`).
6. Go to your WordPress Admin > Styling Display > Settings.
7. Enter the URL with `/fetch` appended: `https://my-app.up.railway.app/fetch`.

## Troubleshooting
- If fetching still fails, ensure the console window running `node server.js` shows "Fetching: [URL]" and no errors.
- Ensure port 3000 is not blocked by a firewall (for local use).
