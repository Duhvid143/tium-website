import { chromium } from 'playwright';
import { exec } from 'child_process';
import path from 'path';

async function capture() {
  console.log("Starting temporary Vercel server on port 3005...");
  
  // Start vercel dev on port 3005
  const serverProcess = exec('npx vercel dev --listen 3005', {
    cwd: process.cwd(),
    env: {
      ...process.env
    }
  });

  // Log server output to console
  serverProcess.stdout.on('data', data => console.log(`[Server] ${data.trim()}`));
  serverProcess.stderr.on('data', data => console.log(`[Server Err] ${data.trim()}`));

  console.log("Waiting 5 seconds for server to start up...");
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log("Launching headless browser to capture screenshot...");
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
    deviceScaleFactor: 2 // HiDPI Retina Resolution
  });

  const page = await context.newPage();
  
  try {
    console.log("Navigating to http://localhost:3005/shop.html...");
    await page.goto('http://localhost:3005/shop.html', { waitUntil: 'networkidle' });
    
    const screenshotPath = '/Users/Tic/.gemini/antigravity/brain/05ed7dea-22f0-48c8-9f67-5d8d50cb3ef2/shop-preview.png';
    console.log(`Capturing screenshot to ${screenshotPath}...`);
    
    await page.screenshot({
      path: screenshotPath,
      fullPage: true
    });
    
    console.log("Screenshot captured successfully!");
  } catch (err) {
    console.error("Screenshot capture failed:", err);
  } finally {
    console.log("Closing browser and stopping server...");
    await browser.close();
    serverProcess.kill('SIGTERM');
    console.log("Done!");
    process.exit(0);
  }
}

capture();
