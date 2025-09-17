require("dotenv").config();
const { OpenAI } = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const { ChromaClient } = require("chromadb");
require("@chroma-core/default-embed"); // this registers the default embedder
const chroma = new ChromaClient({
    path: "http://localhost:8000",  // must match the running server
});

const collectionName = "news_articles";

async function embed(text) {
    const res = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: text,
    });
    return res.data[0].embedding;
}

async function storeArticle({ id, title, content }) {
    const embedding = await embed(content);
    const collection = await chroma.getOrCreateCollection({ name: collectionName });
    await collection.add({
        ids: [id],
        embeddings: [embedding],
        documents: [content],
        metadatas: [{ title }]
    });
    return { id, title };
}

async function search(query) {
    const embedding = await embed(query);
    const collection = await chroma.getOrCreateCollection({ name: collectionName });
    const results = await collection.query({
        queryEmbeddings: [embedding],
        nResults: 1
    });
    return results;
}

async function listAllRecords() {
    const collection = await chroma.getOrCreateCollection({ name: collectionName });

    const results = await collection.get(); // fetch all records
    // console.log("Total Records:", results.ids.length);
    // console.log('results', results)
    // results.ids.forEach((id, i) => {
    //     console.log(`\n🔹 ID: ${id}`);
    //     console.log(`📄 Document: ${results.documents[i].slice(0, 100)}...`); // trimmed
    //     console.log(`📝 Metadata:`, results.metadatas[i]);
    // });

    return results;
}

async function createTuneFile() {
    const collection = await chroma.getOrCreateCollection({ name: collectionName });

    const results = await collection.get(); // fetch all records
    console.log("Total Records:", results.ids.length);
    // console.log('results', results)
    // results.ids.forEach((id, i) => {
    //     console.log(`\n🔹 ID: ${id}`);
    //     console.log(`📄 Document: ${results.documents[i].slice(0, 100)}...`); // trimmed
    //     console.log(`📝 Metadata:`, results.metadatas[i]);
    // });

    return {
        documents: results.documents || [],
        metadatas: results.metadatas || [],
    };
}

// listAllRecords();

module.exports = { storeArticle, search, listAllRecords, createTuneFile };
