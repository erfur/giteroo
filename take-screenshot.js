const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  
  // Wait a bit for any animations to complete
  await new Promise(r => setTimeout(r, 1000));
  
  await page.screenshot({ 
    path: 'screenshot.png',
    fullPage: true
  });
  
  console.log('Screenshot saved to screenshot.png');
  
  await browser.close();
})();
