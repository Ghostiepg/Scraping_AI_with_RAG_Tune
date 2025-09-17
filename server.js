const express = require("express");
const fs = require("fs");
const { storeArticle, search, listAllRecords } = require("./vectorStore");
const scrapeNews = require("./scrapeNews");
const { OpenAI } = require("openai");
const axios = require('axios');
const cheerio = require("cheerio");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// require('./recursiveScrape');

const app = express();
app.use(express.json());

app.post("/scrape", async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).send("URL required");

    try {
        const article = await scrapeNews(url);
        const id = Date.now().toString();
        const result = await storeArticle({ id, ...article });
        res.json({ success: true, article: result });
    } catch (err) {
        res.status(500).send("Scrape failed: " + err.message);
    }
});

app.get("/list", async (req, res) => {
    try {
        console.log('---list---');
        const results = await listAllRecords();
        res.json(results);
    } catch (err) {
        res.status(500).send("Search failed: " + err.message);
    }
});


app.get("/tuning", async (req, res) => {
    try {
        const results = await listAllRecords(); // assumes it returns { documents, metadatas }

        if (!results.documents || !results.metadatas) {
            return res.status(404).json({ error: "No documents found in vector DB." });
        }

        // Generate fine-tune dataset
        const fineTuneData = results.documents.map((doc, i) => ({
            prompt: `Summarize this mobile product:\n\n${doc}`,
            completion: results.metadatas[i]?.title || "Mobile summary"
        }));

        // Save as JSONL
        fs.writeFileSync("mobile-finetune.jsonl", fineTuneData.map(JSON.stringify).join("\n"));

        console.log("✅ mobile-finetune.jsonl created");
        res.json({
            count: fineTuneData.length,
            sample: fineTuneData.slice(0, 3),
            message: "mobile-finetune.jsonl created successfully"
        });
    } catch (err) {
        console.error("❌ Error in /list:", err.message);
        res.status(500).send("Error: " + err.message);
    }
});


//{"q":"which is mobile best for low budget?"}
app.post("/query", async (req, res) => {
    try {
        const { q } = req.body;
        const results = await search(q);
        res.json(results);
    } catch (err) {
        res.status(500).send("Search failed: " + err.message);
    }
});


app.post("/query_real_data", async (req, res) => {
    try {
        const { q } = req.body;
        const results = await search(q);

        const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
        const { data } = await axios.get(url, {
            headers: { "User-Agent": "Mozilla/5.0" }
        });
        const $ = cheerio.load(data);
        const response = [];
        $(".result__title a").each(async (i, el) => {
            // response.push({
            //     title: $(el).text(),
            //     link: $(el).attr("href")
            // });
            // console.log('--0--0', $(el).attr("href"));

            const url = new URL(`https:${$(el).attr("href")}`);

            // Get the value of the 'uddg' query parameter, which contains the original URL
            const originalUrl = url.searchParams.get('uddg');

            // Log the decoded URL
            console.log(originalUrl);

            const article = await scrapeNews(originalUrl);
            const id = Date.now().toString();
            const result = await storeArticle({ id, ...article });
            console.log('result--', result);
        });
        //  return results;
        // console.log('response', response);



        const context = results.documents.map((doc, i) =>
            `Article ${i + 1}: ${doc.slice(0, 1000)}\n`
        ).join("\n");

        const completion = await openai.chat.completions.create({
            model: "gpt-4", // or gpt-3.5-turbo
            messages: [
                { role: "system", content: "You are a news assistant summarizing Indian news" },
                { role: "user", content: `${context}\n\nNow answer this question:\n${q}` }
            ]
        });

        res.send({ answer: completion.choices[0].message.content });


        // try {
        //     const results = await search(q);
        //     res.json(results);
        // } catch (err) {
        //     res.status(500).send("Search failed: " + err.message);
        // }
    } catch (error) {
        console.log('Error From Query', error)
    }
});


app.listen(3000, () => console.log("News scraper running on http://localhost:3000"));
