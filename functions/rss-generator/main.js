import fs from 'fs';
import path from 'path';

// Force deployment update 6 (Native Fetch)

/**
 * RSS Feed Generator Function
 * 
 * required variables:
 * - OPENROUTER_API_KEY_SECURE
 */

export default async ({ req, res, log, error }) => {
    try {
        // Debug logging
        log("RSS Generator v5.1 Debug Start");
        log("Node Version: " + process.version);
        log("Fetch available: " + (typeof fetch));

        const query = req.query || {};
        const body = req.body || {};
        const paramUrl = query.url || body.url;
        // Decode URL if it appears encoded (e.g. starts with http%3A)
        const url = (paramUrl && paramUrl.includes('%3A')) ? decodeURIComponent(paramUrl) : paramUrl;
        const cacheTime = parseInt(query.cache) || 3600;
        const finalCacheTime = Math.max(60, Math.min(604800, cacheTime));

        if (!url) {
            return res.json({ error: "Missing 'url' parameter" }, 400);
        }

        const apiKey = process.env.OPENROUTER_API_KEY_SECURE || process.env.OPENROUTER_API_KEY;
        log("API Key present: " + (!!apiKey));
        if (!apiKey) {
            throw new Error("Missing API Key. Please set OPENROUTER_API_KEY.");
        }

        const rssXml = await generateRSSFromURL(url, apiKey, log);

        return res.send(rssXml, 200, {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": `public, max-age=${finalCacheTime}`
        });
    } catch (e) {
        log("ERROR CAUGHT: " + e.message);
        if (e.stack) log(e.stack);
        error("RSS Gen Failed: " + e.message);
        // Return JSON with error
        // Return XML with error so n8n RSS node doesn't crash
        const xmlError = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Error: ${escapeXml(e.message)}</title>
    <description>
      <![CDATA[
      Function Crash Details:
      Error: ${e.message}
      Type: ${e.name}
      Stack: ${e.stack ? e.stack.substring(0, 500) : "no stack"}
      ]]>
    </description>
  </channel>
</rss>`;
        return res.send(xmlError, 200, { 'Content-Type': 'application/xml' });
    }
};

// --- Helper Functions ---

const fetchWebPage = async (url) => {
    // Helper for AllOrigins fallback
    const fetchViaAllOrigins = async (targetUrl) => {
        const aoUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000); // 7s fallback timeout
        try {
            const response = await fetch(aoUrl, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (response.ok) {
                const data = await response.json();
                return data.contents || "";
            }
        } catch (e) {
            clearTimeout(timeoutId);
            console.warn("AllOrigins fallback failed or timed out:", targetUrl);
        }
        return "";
    };

    try {
        // Use Jina.ai Reader for LLM-friendly Markdown
        const jinaUrl = `https://r.jina.ai/${url}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s primary timeout

        const response = await fetch(jinaUrl, {
            headers: {
                "X-Target-Selector": "body", // Optional: focus on body
                "X-Return-Format": "markdown"
            },
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error("Jina.ai fetch failed");

        const text = await response.text();
        if (!text || text.length < 100 || text.includes("Just a moment...")) {
            throw new Error("Jina.ai content invalid");
        }
        return text;

    } catch (error) {
        console.warn("Jina.ai fetch failed, falling back:", error.message);
        return await fetchViaAllOrigins(url);
    }
};

const escapeXml = (unsafe) => {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
        .replace(/[<>&'"]/g, (c) => {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '\'': return '&apos;';
                case '"': return '&quot;';
                default: return c;
            }
        })
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
};

const cdata = (content) => {
    if (content === null || content === undefined) return '';
    const safeContent = String(content).replace(/]]>/g, ']]]]><![CDATA[>');
    return `<![CDATA[${safeContent}]]>`;
};

const generateRSSFromURL = async (url, apiKey, log) => {
    if (!apiKey) throw new Error("OpenRouter API Key is missing.");

    try {
        const htmlContent = await fetchWebPage(url);
        // Simplified content cleaning
        const cleanedHtml = htmlContent
            ? htmlContent.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gmi, "")
                .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gmi, "")
                .replace(/\s+/g, " ").substring(0, 150000)
            : "No live content available.";

        if (cleanedHtml === "No live content available.") {
            if (log) log("Fetch failed - preventing hallucination.");
            return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Error: Could not fetch content</title>
    <description>The target website could not be reached or blocked the request.</description>
    <item>
      <title>Error: Fetch Failed</title>
      <description>Could not retrieve live content from ${escapeXml(url)}</description>
      <link>${escapeXml(url)}</link>
      <guid>${escapeXml(url)}#error</guid>
      <pubDate>${new Date().toUTCString()}</pubDate>
    </item>
  </channel>
</rss>`;
        }

        const prompt = `
        You are a premium RSS feed generator.
        Extract the latest news items from the following content.
        
        OUTPUT FORMAT:
        Return a JSON object: {"title": "Feed Title", "description": "Feed Description", "items": [{"title": "Item Title", "description": "DETAILED 30-50 word summary of the news story", "link": "Absolute URL", "image": "URL to main article image", "pubDate": "Date string"}]}

        CRITICAL RULES:
        1. DESCRIPTION: Provide a UNIQUE and SUBSTANTIAL summary (minimum 30 words). This MUST be the actual news content, not a placeholder.
        2. IMAGE: You MUST extract the main high-res image URL for each item.
        3. EXTRACT REAL ITEMS ONLY.
        
        Target Website: ${url}
        Content:
        ${cleanedHtml} 
        `;

        const aiController = new AbortController();
        const aiTimeoutId = setTimeout(() => aiController.abort(), 12000); // 12s AI timeout

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "X-Title": "RSS Gen AI Backend"
            },
            signal: aiController.signal,
            body: JSON.stringify({
                "model": "google/gemini-2.0-flash-001",
                "messages": [{ "role": "user", "content": prompt }],
                "response_format": { "type": "json_object" },
                "max_tokens": 8192
            })
        });
        clearTimeout(aiTimeoutId);

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`OpenRouter Error ${response.status}: ${text.substring(0, 100)}`);
        }

        const data = await response.json();
        const content = data.choices[0]?.message?.content || "";

        let parsedData;
        try {
            let cleanContent = content.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, "$1").trim();
            // Basic JSON repair for truncation
            if (!cleanContent.endsWith('}')) {
                if (cleanContent.includes('"items": [')) {
                    cleanContent = cleanContent.substring(0, cleanContent.lastIndexOf('}') + 1);
                    if (!cleanContent.endsWith(']}')) cleanContent += ']}';
                    if (!cleanContent.startsWith('{')) cleanContent = '{' + cleanContent;
                }
            }
            parsedData = JSON.parse(cleanContent);
        } catch (e) {
            const firstOpen = content.indexOf('{');
            const lastClose = content.lastIndexOf('}');
            if (firstOpen !== -1 && lastClose !== -1) {
                try {
                    parsedData = JSON.parse(content.substring(firstOpen, lastClose + 1));
                } catch (innerE) {
                    throw new Error("JSON Parse Failed: " + e.message + " | Content head: " + content.substring(0, 100));
                }
            } else {
                throw new Error("Failed to parse AI response: " + content.substring(0, 100));
            }
        }

        const items = Array.isArray(parsedData.items) ? parsedData.items : [];
        const itemsToProcess = items.slice(0, 3); // Reduce to 3 for reliability under 30s

        // Parallel Processing for Speed
        const enrichedItems = await Promise.all(itemsToProcess.map(async (item) => {
            let finalLink = item.link;
            try { finalLink = new URL(item.link, url).href; } catch (e) { }

            let finalImage = item.image;
            if (finalImage) {
                try { finalImage = new URL(finalImage, url).href; } catch (e) { }
                if (finalImage && finalImage.match(/(?<!wp-content.*)logo|(?<!wp-content.*)icon|avatar/i) && !finalImage.includes('uploads')) finalImage = null;
            }

            if (finalLink && !finalImage) {
                try {
                    // Quick 6s fetch for enrichment
                    const controller = new AbortController();
                    const tId = setTimeout(() => controller.abort(), 4000); // 4s enrichment timeout

                    const jinaUrl = `https://r.jina.ai/${finalLink}`;
                    const res = await fetch(jinaUrl, {
                        headers: {
                            "X-Return-Format": "markdown",
                            "X-Target-Selector": "body"
                        },
                        signal: controller.signal
                    });
                    clearTimeout(tId);

                    if (res.ok) {
                        const articleHtml = await res.text();
                        const ogMatch = articleHtml.match(/!\[.*?\]\((https?:\/\/[^\)]+)\)/i) // Jina markdown image
                            || articleHtml.match(/og:image: (https?:\/\/[^\s]+)/i);
                        if (ogMatch) finalImage = ogMatch[1];
                    }
                } catch (e) {
                    if (log) log(`Enrichment failed for ${finalLink}: ${e.message}`);
                }
            }

            const mediaTag = finalImage
                ? `<media:content url="${escapeXml(finalImage)}" medium="image" />`
                : '';
            const thumbnailTag = finalImage
                ? `<media:thumbnail url="${escapeXml(finalImage)}" />`
                : '';
            const enclosureTag = finalImage
                ? `<enclosure url="${escapeXml(finalImage)}" type="image/jpeg" length="0" />`
                : '';

            // Move image to end so n8n picks up text snippet first
            const descriptionWithImage = `${item.description || item.title || ''}${finalImage ? `<br/><img src="${escapeXml(finalImage)}" style="max-width:100%;height:auto;margin-top:10px;" />` : ''}`;

            return `
            <item>
              <title>${escapeXml(item.title || 'No Title')}</title>
              <link>${escapeXml(finalLink || '#')}</link>
              <guid isPermaLink="false">${escapeXml(finalLink || '#')}?t=${Date.now()}</guid>
              <description>${cdata(descriptionWithImage)}</description>
              <pubDate>${escapeXml(item.pubDate || new Date().toUTCString())}</pubDate>
              ${mediaTag}
              ${thumbnailTag}
              ${enclosureTag}
            </item>
          `;
        }));

        return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(parsedData.title || 'Generated Feed')}</title>
    <link>${escapeXml(url)}</link>
    <description>${cdata(parsedData.description || 'RSS feed generated by AI')}</description>
    ${enrichedItems.join('')}
  </channel>
</rss>`.trim();

    } catch (error) {
        if (log) log("RSS Gen Error Trace: " + error.stack);
        throw error;
    }
};
