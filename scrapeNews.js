const puppeteer = require("puppeteer");

async function scrapeNews(url) {
    console.log("Scraping:", url);
    const browser = await puppeteer.launch({
        executablePath: "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--hide-scrollbars',
            '--mute-audio'
        ],
        headless: true,
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });

    const data = await page.evaluate(() => {
        const title = document.querySelector("h1")?.innerText || "No title";
        const content = Array.from(document.querySelectorAll("p"))
            .map(p => p.innerText)
            .join(" ")
            .slice(0, 4000); // Limit to 4k tokens
        return { title, content };
    });

    await browser.close();
    return data;
}

module.exports = scrapeNews;
