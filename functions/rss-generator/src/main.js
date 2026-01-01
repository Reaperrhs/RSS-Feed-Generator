import { Client } from 'node-appwrite';

/**
 * RSS Feed Generator Function
 * 
 * required variables:
 * - OPENROUTER_API_KEY
 */

export default async ({ req, res, log, error }) => {
    const url = req.query.url || req.body.url;

    if (!url) {
        return res.json({ error: "Missing 'url' parameter" }, 400);
    }

    try {
        const rssXml = await generateRSSFromURL(url, process.env.OPENROUTER_API_KEY);

        return res.send(rssXml, 200, {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600" // Cache for 1 hour
        });
    } catch (e) {
        error("RSS Generation Failed: " + e.message);
        return res.json({ error: e.message }, 500);
    }
};

// --- Helper Functions (Ported from geminiService.ts) ---

const fetchWebPage = async (url, tryFeedFallback = false) => {
    // Helper for AllOrigins fallback
    const fetchViaAllOrigins = async (targetUrl) => {
        try {
            const aoUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
            const response = await fetch(aoUrl);
            if (response.ok) {
                const data = await response.json();
                return data.contents || "";
            }
        } catch (e) {
            console.warn("AllOrigins fallback failed for:", targetUrl);
        }
        return "";
    };

    try {
        // Direct call to Crawl4AI (bypassing Vite proxy)
        const response = await fetch("https://crawl4ai.onekindpromo.com/crawl", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                urls: [url],
                crawler_params: {
                    headless: true,
                    magic_mode: true,
                    user_agent_mode: "random"
                }
            })
        });

        if (!response.ok) throw new Error("Failed to fetch page content from Crawl4AI");

        const data = await response.json();

        if (data.results && data.results.length > 0) {
            const result = data.results[0];

            // Aggressive Fallback for ANY bot sign or non-200 status
            if (result.status_code !== 200 || (result.html && result.html.length < 500) || (result.html && result.html.includes("Just a moment..."))) {
                console.warn("Crawl4AI blocked or empty. Attempting fallback...");
                // ... (existing fallback logic)
                return await fetchViaAllOrigins(url);
            }

            return result.cleaned_html || result.html || "";
        }
        return "";
    } catch (error) {
        console.warn("Crawl4AI fetch failed, falling back:", error);
        return await fetchViaAllOrigins(url);
    }
};

const escapeXml = (unsafe) => {
    return unsafe
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
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
};

const generateRSSFromURL = async (url, apiKey) => {
    if (!apiKey) {
        throw new Error("OpenRouter API Key is missing in function environment variables.");
    }

    try {
        const htmlContent = await fetchWebPage(url, true);

        const cleanedHtml = htmlContent
            ? htmlContent.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gmi, "")
                .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gmi, "")
                .replace(/\s+/g, " ").substring(0, 150000)
            : "Could not fetch live content. Generate based on knowledge.";

        const prompt = `
      Task: Analyze the provided HTML and extract news articles/posts into a strict JSON format.
      
      Target Website: ${url}
      
      HTML Content:
      ${cleanedHtml}
      
      Output Format:
      Return ONLY a JSON object with this schema:
      {
        "title": "Site Title",
        "description": "Site Description",
        "items": [
          {
            "title": "Article Title",
            "link": "URL (absolute or relative)",
            "description": "Short summary (Extract if available, otherwise GENERATE a 1-sentence summary based on the title)",
            "pubDate": "Date string",
            "image": "Image URL (optional)"
          }
        ]
      }
      
      Requirements:
      1. Extract REAL items from the HTML.
      2. If a link is relative, keep it relative.
      3. Generate a description if missing.
      4. **CRITICAL**: Extract the image URL from the <img> tag within the article card. Look for 'src', 'data-src', or 'data-lazy-src'. Note that valid article images often have 'loading="lazy"' or specific classes like 'wp-image-...'.
      5. Do not use 1x1 pixels or logos.
    `;

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "X-Title": "RSS Gen AI Backend"
            },
            body: JSON.stringify({
                "model": "google/gemini-2.0-flash-001",
                "messages": [
                    { "role": "user", "content": prompt }
                ],
                "response_format": { "type": "json_object" }
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || `OpenRouter API error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices[0]?.message?.content || "";

        let parsedData;
        try {
            let cleanContent = content;
            const markdownMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (markdownMatch) cleanContent = markdownMatch[1];

            cleanContent = cleanContent
                // eslint-disable-next-line no-control-regex
                .replace(/[\x00-\x1F\x7F]/g, "")
                .replace(/\\u(?![0-9a-fA-F]{4})/g, "\\\\u");

            parsedData = JSON.parse(cleanContent);
        } catch (e) {
            // Fallback parse
            const firstOpen = content.indexOf('{');
            const lastClose = content.lastIndexOf('}');
            if (firstOpen !== -1 && lastClose !== -1) {
                parsedData = JSON.parse(content.substring(firstOpen, lastClose + 1));
            } else {
                throw new Error("Failed to parse AI response JSON");
            }
        }

        const items = Array.isArray(parsedData.items) ? parsedData.items : [];

        // Deep Enrichment (Simplified for backend - serial execution to avoid timeout/rate limits if possible, or Promise.all)
        const enrichedItems = await Promise.all(items.map(async (item) => {
            let finalLink = item.link;
            try { finalLink = new URL(item.link, url).href; } catch (e) { }

            let finalImage = item.image;
            if (finalImage) {
                try { finalImage = new URL(finalImage, url).href; } catch (e) { }
                if (finalImage.match(/(?<!wp-content.*)logo|(?<!wp-content.*)icon|avatar/i) && !finalImage.includes('uploads')) finalImage = null;
            }

            if (finalLink && !finalImage) {
                try {
                    const articleHtml = await fetchWebPage(finalLink, false);
                    if (articleHtml) {
                        // Robust Meta Tag Extraction
                        const ogMatch = articleHtml.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
                            || articleHtml.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);

                        const twitterMatch = articleHtml.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)
                            || articleHtml.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);

                        if (ogMatch) finalImage = ogMatch[1];
                        else if (twitterMatch) finalImage = twitterMatch[1];
                    }
                } catch (e) { }
            }

            const imgTag = finalImage
                ? `<enclosure url="${escapeXml(finalImage)}" type="image/jpeg" length="0" />
           <media:content url="${escapeXml(finalImage)}" medium="image" />`
                : '';

            return `
        <item>
          <title>${escapeXml(item.title || 'No Title')}</title>
          <link>${escapeXml(finalLink || '#')}</link>
          <guid isPermaLink="true">${escapeXml(finalLink || '#')}</guid>
          <description>${escapeXml(item.description || item.title || '')}</description>
          <pubDate>${escapeXml(item.pubDate || new Date().toUTCString())}</pubDate>
          ${imgTag}
        </item>
      `;
        }));

        return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(parsedData.title || 'Generated Feed')}</title>
    <link>${escapeXml(url)}</link>
    <description>${escapeXml(parsedData.description || 'RSS feed generated by AI')}</description>
    ${enrichedItems.join('')}
  </channel>
</rss>`.trim();

    } catch (error) {
        console.error("RSS Gen Error:", error);
        throw error;
    }
};
