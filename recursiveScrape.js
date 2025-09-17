// const puppeteer = require("puppeteer");
let logMessage = require('./logger.js')

// const visited = new Set();

// async function crawl(page, url, depth = 2) {
//     if (visited.has(url) || depth === 0) return;
//     visited.add(url);

//     try {
//         await page.goto(url, { timeout: 30000, waitUntil: "domcontentloaded" });

//         // ✅ Get current URL after redirect (if any)
//         const currentUrl = page.url();

//         // ✅ Get page title
//         const title = await page.title();

//         // ✅ Get visible text content of the page
//         const textContent = await page.evaluate(() => {
//             return document.body.innerText;
//         });
//         const logData = {
//             RequestUTC: new Date().toISOString(),
//             Scraped: JSON.stringify(title),
//             URL: JSON.stringify(currentUrl),
//             Content: JSON.stringify(textContent.slice(0, 200))
//         };
//         //  console.log('logData', logData)
//         logMessage('logData', JSON.stringify(logData));
//         // console.log(`📰 Scraped: ${title}`);
//         // console.log(`🔗 URL: ${currentUrl}`);
//         // console.log(`📄 Content:`, textContent.slice(0, 200) + "...");

//         // 👉 store `title`, `currentUrl`, `textContent` to ChromaDB or JSON

//         // ✅ Extract all internal links
//         const links = await page.$$eval("a", anchors =>
//             anchors
//                 .map(a => a.href)
//                 .filter(href =>
//                     href.startsWith("http") &&
//                     !href.includes("#") &&
//                     !href.includes("mailto:") &&
//                     !href.includes("tel:")
//                 )
//         );

//         // Recurse
//         for (const link of links) {
//             if (!visited.has(link)) {
//                 await crawl(page, link, depth - 1);
//             }
//         }
//     } catch (err) {
//         console.error(`❌ Error crawling ${url}: ${err.message}`);
//     }
// }

// // Bootstrapping the crawler
// (async () => {
//     const browser = await puppeteer.launch({ headless: true });
//     const page = await browser.newPage();

//     //  const startUrl = "https://techcrunch.com"; // Replace with your seed URL
//     const startUrl = "https://www.producthunt.com"; // Replace with your seed URL
//     await crawl(page, startUrl, 2);

//     await browser.close();
// })();



//************************** */
// const { Semaphore } = require('async-mutex'); // npm install async-mutex

// async function recursiveScraper(startUrl, maxDepth = 3, currentDepth = 0, visitedUrls = new Set()) {
//     if (visitedUrls.has(startUrl) || currentDepth > maxDepth) return [];

//     visitedUrls.add(startUrl);
//     const browser = await puppeteer.launch({ headless: "new" });
//     const page = await browser.newPage();

//     try {
//         console.log(`Scraping: ${startUrl} (Depth: ${currentDepth})`);
//         await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

//         // Compatible wait method
//         await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

//         const pageData = await page.evaluate(() => ({
//             title: document.title,
//             headings: Array.from(document.querySelectorAll('h1, h2, h3')).map(h => h.textContent.trim()),
//             links: Array.from(document.querySelectorAll('a')).map(a => ({
//                 text: a.textContent.trim(),
//                 href: a.href
//             }))
//         }));

//         console.log(`Found ${pageData.links.length} links on ${startUrl}`);

//         const validLinks = pageData.links
//             .filter(link => link.href && link.href.startsWith('http'))
//             .map(link => link.href);

//         let nestedData = [];
//         for (const link of validLinks) {
//             try {
//                 const results = await recursiveScraper(
//                     link,
//                     maxDepth,
//                     currentDepth + 1,
//                     visitedUrls
//                 );
//                 nestedData = nestedData.concat(results);

//                 const logData = {
//                     RequestUTC: new Date().toISOString(),
//                     startUrl: JSON.stringify(link),
//                     result: JSON.stringify(results),
//                     Content: JSON.stringify(nestedData)
//                 };

//                 logMessage('logData', JSON.stringify(logData));

//             } catch (error) {
//                 console.error(`Error scraping ${link}:`, error.message);
//             }
//         }

//         await browser.close();
//         return [{ url: startUrl, data: pageData }, ...nestedData];
//     } catch (error) {
//         console.error(`Error processing ${startUrl}:`, error);
//         await browser.close();
//         return [];
//     }
// }

// // Usage remains the same
// (async () => {
//     const startUrl = "https://www.producthunt.com";
//     const maxDepth = 2;
//     const allData = await recursiveScraper(startUrl, maxDepth);
//     console.log('Scraping complete!', allData.length, 'pages scraped');
// })();


const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function handleVerifications(page) {
    const challengeSelectors = [
        'text/Verifying you are human',
        '#cf-challenge-running', // Cloudflare JS challenge
        '.hcaptcha-box', // hCaptcha box
    ];

    for (const selector of challengeSelectors) {
        try {
            await page.waitForSelector(selector, { timeout: 5000 });
            console.log(`⏳ Waiting for challenge to finish (${selector})...`);
            await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 });
            break;
        } catch (err) {
            // Not found; move on
        }
    }
}

async function recursiveScraper(startUrl, maxDepth = 3, currentDepth = 0, visitedUrls = new Set()) {
    if (visitedUrls.has(startUrl) || currentDepth > maxDepth) return [];

    visitedUrls.add(startUrl);
    const browser = await puppeteer.launch({
        headless: true, // Set to false to see browser
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    try {
        console.log(`🔎 Scraping: ${startUrl} (Depth: ${currentDepth})`);
        await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

        await handleVerifications(page);
        await delay(1000 + Math.random() * 2000);

        const pageData = await page.evaluate(() => ({
            title: document.title,
            headings: Array.from(document.querySelectorAll('h1, h2, h3')).map(h => h.textContent.trim()),
            links: Array.from(document.querySelectorAll('a')).map(a => ({
                text: a.textContent.trim(),
                href: a.href
            }))
        }));

        console.log(`🔗 Found ${pageData.links.length} links on ${startUrl}`);

        const validLinks = pageData.links
            .filter(link => link.href && link.href.startsWith('http'))
            .map(link => link.href);

        let nestedData = [];
        for (const link of validLinks) {
            try {
                const results = await recursiveScraper(
                    link,
                    maxDepth,
                    currentDepth + 1,
                    visitedUrls
                );
                nestedData = nestedData.concat(results);

                const logData = {
                    RequestUTC: new Date().toISOString(),
                    startUrl: JSON.stringify(link),
                    result: JSON.stringify(results),
                    Content: JSON.stringify(nestedData)
                };

                logMessage('logData', JSON.stringify(logData));

            } catch (error) {
                console.error(`❌ Error scraping ${link}:`, error.message);
            }
        }

        await browser.close();
        return [{ url: startUrl, data: pageData }, ...nestedData];
    } catch (error) {
        console.error(`❌ Error processing ${startUrl}:`, error.message);
        await browser.close();
        return [];
    }
}


// Usage
(async () => {
    //const startUrl = "https://www.producthunt.com";
    const startUrl = "https://www.bestbuy.com/site/all-computers-tablets-on-sale/laptops-on-sale/pcmcat1720704669400.c?id=pcmcat1720704669400";
    const maxDepth = 2;
    const allData = await recursiveScraper(startUrl, maxDepth);
    console.log('✅ Scraping complete!', allData.length, 'pages scraped');
})();
