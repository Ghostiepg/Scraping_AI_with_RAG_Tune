/**
 * Multilingual (Hindi/English) Ayurvedic PDF RAG in Node.js
 * ---------------------------------------------------------
 * Features:
 * - Ingest a single (or multiple) PDF(s) in Hindi/English
 * - Store embeddings locally with Chroma (no cloud cost)
 * - Answer in the *same language as the user question* (Hindi ↔ English)
 * - Simple hybrid retrieval (vector + keyword) and optional rerank hook
 *
 * Requirements:
 *   npm i langchain @langchain/openai @langchain/community chromadb pdf-parse dotenv
 *   // If you want basic language detection (optional):
 *   npm i franc
 *
 * Env:
 *   OPENAI_API_KEY=sk-...
 *
 * Run:
 *   node rag_hindi_english.js ingest ./data/ayurvedic.pdf
 *   node rag_hindi_english.js ask "सर्दी-खांसी के लिए आयुर्वेदिक उपाय क्या हैं?"
 *   node rag_hindi_english.js ask "What are ayurvedic remedies for seasonal cold?"
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { ChatPromptTemplate } from "langchain/prompts";
import { RunnableSequence } from "langchain/runnables";
import { StringOutputParser } from "langchain/schema/output_parser";

import { OpenAIEmbeddings, ChatOpenAI } from "@langchain/openai";
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

// Optional language detection (uncomment to use):
// import { franc } from 'franc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHROMA_DIR = path.join(__dirname, 'chroma-store');

/**
 * Hindi-aware + generic splitter
 * - Splits on headings and Devanagari punctuation when possible, then falls back to token-sized chunks
 */
function createHindiAwareSplitter() {
    return new RecursiveCharacterTextSplitter({
        chunkSize: 900,        // keep ~700–900 chars per chunk for good recall in Hindi
        chunkOverlap: 120,     // small overlap
        separators: [
            "\n## ", "\n# ", "\n### ",
            /[।!?]/,            // Devanagari danda + punctuation
            "\n\n", "\n", " ", ""
        ]
    });
}

async function getVectorStore() {
    const embeddings = new OpenAIEmbeddings({ model: "text-embedding-3-large" }); // multilingual
    return new Chroma(embeddings, {
        collectionName: 'ayurvedic-hindi-en',
        url: undefined, // local
        collectionMetadata: { createdAt: new Date().toISOString() },
        directory: CHROMA_DIR,
    });
}

async function ingestPDF(pdfPath) {
    if (!fs.existsSync(pdfPath)) throw new Error(`PDF not found: ${pdfPath}`);
    const loader = new PDFLoader(pdfPath, { splitPages: true });
    const docs = await loader.load();

    const splitter = createHindiAwareSplitter();
    const splits = await splitter.splitDocuments(docs);

    // Attach small metadata for filtering
    const enriched = splits.map(d => ({
        ...d,
        metadata: {
            ...d.metadata,
            source: path.basename(pdfPath),
            langHint: guessLangHint(d.pageContent)
        }
    }));

    const store = await getVectorStore();
    await store.addDocuments(enriched);
    console.log(`✅ Ingested ${enriched.length} chunks from ${pdfPath}`);
}

function guessLangHint(text) {
    // Very light heuristic: check for Devanagari range
    const dev = /[\u0900-\u097F]/.test(text);
    return dev ? 'hi' : 'en';

    // Or use franc for more robust detection:
    // const code = franc(text || '', { minLength: 10 });
    // return code === 'hin' ? 'hi' : 'en';
}

/**
 * Hybrid retriever: vector similarity + lightweight keyword filter
 * You can upgrade with a reranker (e.g., bge-reranker) if needed.
 */
async function hybridRetrieve(store, query, k = 6) {
    // 1) Vector search
    const vectorResults = await store.similaritySearch(query, k * 2);

    // 2) Keyword filter (keep chunks containing any query keyword)
    const qTokens = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const keywordScored = vectorResults.map(d => {
        const text = (d.pageContent || '').toLowerCase();
        const matches = qTokens.reduce((acc, t) => acc + (text.includes(t) ? 1 : 0), 0);
        return { doc: d, matches };
    }).sort((a, b) => b.matches - a.matches);

    // Merge: top by matches, fall back to vector order
    const unique = new Map();
    [...keywordScored, ...vectorResults.map(d => ({ doc: d, matches: 0 }))].forEach(r => {
        unique.set(r.doc.id || r.doc.pageContent.slice(0, 64), r.doc);
    });

    return Array.from(unique.values()).slice(0, k);
}

function buildPrompt() {
    return ChatPromptTemplate.fromMessages([
        ["system", `You are a precise, citation-friendly assistant for Ayurvedic knowledge.\n\nRESPONSE RULES:\n- ALWAYS answer in the SAME LANGUAGE as the user's question (Hindi or English).\n- If the question is in Hindi, reply in fluent, natural Hindi. If in English, reply in clear English.\n- Cite sources using short titles like (source: <filename>, p.<page>).\n- If information is not present in the provided context, say you don't know and suggest consulting a qualified Ayurvedic practitioner.\n- Keep medical safety in mind: warn about allergies, interactions, and consulting a doctor for serious conditions.\n`],
        ["human", `Question: {question}\n\nContext:\n{context}\n\nAnswer:`]
    ]);
}

function formatDocs(docs) {
    return docs.map(d => {
        const p = d.metadata?.loc?.pageNumber || d.metadata?.pdf?.page || d.metadata?.page || '?';
        const source = d.metadata?.source || 'doc.pdf';
        return `${d.pageContent}\n\n(source: ${source}, p.${p})`;
    }).join('\n\n---\n\n');
}

async function ask(question) {
    const store = await getVectorStore();
    const docs = await hybridRetrieve(store, question, 6);

    const prompt = buildPrompt();
    const model = new ChatOpenAI({ model: 'gpt-4o-mini', temperature: 0.2 });

    const chain = RunnableSequence.from([
        {
            question: (i) => i.question,
            context: async (i) => formatDocs(docs)
        },
        prompt,
        model,
        new StringOutputParser()
    ]);

    const answer = await chain.invoke({ question });
    return { answer, usedDocs: docs };
}

// CLI runner
const [, , cmd, arg1] = process.argv;
(async () => {
    try {
        if (cmd === 'ingest') {
            const pdf = arg1 || path.join(__dirname, 'data', 'ayurvedic.pdf');
            await ingestPDF(pdf);
        } else if (cmd === 'ask') {
            const question = arg1 || 'सर्दी-खांसी के लिए क्या आयुर्वेदिक उपाय हैं?';
            const { answer, usedDocs } = await ask(question);
            console.log('\n\n==== ANSWER ====\n');
            console.log(answer);
            console.log('\n\n==== CONTEXT USED ====');
            usedDocs.forEach((d, i) => {
                const p = d.metadata?.loc?.pageNumber || d.metadata?.page || '?';
                const src = d.metadata?.source || 'doc.pdf';
                console.log(`\n[${i + 1}] ${src} p.${p}\n${(d.pageContent || '').slice(0, 300)}...`);
            });
        } else {
            console.log('Usage:\n  node rag_hindi_english.js ingest ./data/ayurvedic.pdf\n  node rag_hindi_english.js ask "<your question in Hindi or English>"');
        }
    } catch (e) {
        console.error('Error:', e);
    }
})();
