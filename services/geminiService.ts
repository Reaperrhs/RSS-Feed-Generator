const fetchWebPage = async (url: string): Promise<string> => {
  try {
    // using allorigins as a free CORS proxy
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error("Failed to fetch page content");
    const data = await response.json();
    return data.contents;
  } catch (error) {
    console.warn("Proxy fetch failed, falling back to direct knowledge:", error);
    return ""; // Fallback to empty string to let AI use knowledge if fetch fails
  }
};

// Helper to escape XML characters and remove invalid control characters
const escapeXml = (unsafe: string): string => {
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
    // Remove control characters (0-8, 11-12, 14-31, 127) which are invalid in XML 1.0
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
};

export const generateRSSFromURL = async (url: string): Promise<string> => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OpenRouter API Key is missing. Please add it to your settings or .env.local file.");
  }

  try {
    const htmlContent = await fetchWebPage(url);

    // Clean up HTML to save tokens
    const cleanedHtml = htmlContent
      ? htmlContent.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gmi, "")
        .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gmi, "")
        .replace(/\s+/g, " ").substring(0, 100000)
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
            "description": "Short summary (Required, use Title if no summary found)",
            "pubDate": "Date string",
            "image": "Image URL (optional)"
          }
        ]
      }
      
      Requirements:
      1. Extract REAL items from the HTML. Do not hallucinate.
      2. If a link is relative (e.g., "/news/123"), keep it relative. The system will handle normalization.
      3. For images, look in <img> 'src' or 'data-src', or use the first image in the card.
    `;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": window.location.origin,
        "X-Title": "RSS Gen AI",
        "Content-Type": "application/json"
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

    console.log("Raw AI Response:", content);

    // Parse JSON
    let parsedData;
    try {
      parsedData = JSON.parse(content);
    } catch (e) {
      // Fallback: try to find JSON block if strict mode failed
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Failed to parse AI response as JSON");
      }
    }

    // Safely get items array
    const items = Array.isArray(parsedData.items) ? parsedData.items : [];

    // Generate XML with URL Normalization
    const rssItems = items.map((item: any) => {
      // Normalize Link
      let finalLink = item.link;
      try {
        finalLink = new URL(item.link, url).href;
      } catch (e) {
        console.warn(`Failed to normalize link: ${item.link}`, e);
        // Fallback to original link if normalization fails
      }

      // Normalize Image
      let finalImage = item.image;
      if (finalImage) {
        try {
          finalImage = new URL(finalImage, url).href;
        } catch (e) { console.warn(`Failed to normalize image: ${item.image}`); }
      }

      const imgTag = finalImage
        ? `<enclosure url="${escapeXml(finalImage)}" type="image/jpeg" length="0" />
           <media:content url="${escapeXml(finalImage)}" medium="image" />`
        : '';

      // Ensure description is never empty
      const description = item.description || item.title || 'No description available';

      return `
        <item>
          <title>${escapeXml(item.title || 'No Title')}</title>
          <link>${escapeXml(finalLink || '#')}</link>
          <guid isPermaLink="true">${escapeXml(finalLink || '#')}</guid>
          <description>${escapeXml(description)}</description>
          <pubDate>${escapeXml(item.pubDate || new Date().toUTCString())}</pubDate>
          ${imgTag}
        </item>
      `;
    }).join('');

    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(parsedData.title || 'Generated Feed')}</title>
    <link>${escapeXml(url)}</link>
    <description>${escapeXml(parsedData.description || 'RSS feed generated by AI')}</description>
    ${rssItems}
  </channel>
</rss>`;

    return rssXml.trim();

  } catch (error: any) {
    console.error("OpenRouter API Error:", error);
    throw new Error(error.message || "Failed to generate RSS feed.");
  }
};