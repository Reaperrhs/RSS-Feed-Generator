const fetchWebPage = async (url: string, tryFeedFallback = false): Promise<string> => {
  // Helper for AllOrigins fallback
  const fetchViaAllOrigins = async (targetUrl: string): Promise<string> => {
    try {
      // Use the 'get' endpoint which returns a JSON wrapper.
      // This is often more reliable for bypassing certain blocks as the response is buffered.
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
    // using self-hosted Crawl4AI for web scraping via local proxy to bypass CORS
    const response = await fetch("/crawl_proxy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
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

    // Crawl4AI returns results in an array for the 'results' key
    if (data.results && data.results.length > 0) {
      const result = data.results[0];

      // Explicitly check for Cloudflare or other bot challenges
      if (result.status_code === 307 || result.status_code === 403 || (result.html && result.html.includes("Just a moment..."))) {
        console.warn("Crawl4AI hit a bot wall (Cloudflare). Attempting AllOrigins fallback...");

        if (tryFeedFallback) {
          // Strategy: Try standard RSS feed locations first as they are often unprotected
          const baseUrl = new URL(url).origin;
          const feedPaths = ["/feed", "/rss", "/rss.xml"];

          for (const path of feedPaths) {
            const feedUrl = baseUrl + path;
            const feedContent = await fetchViaAllOrigins(feedUrl);
            if (feedContent && feedContent.length > 500) {
              console.log("Successfully retrieved feed content via AllOrigins:", feedUrl);
              return feedContent;
            }
          }
        }

        // If no feed found, try the original page via AllOrigins as a last resort
        return await fetchViaAllOrigins(url);
      }

      // Prefer cleaned_html as the prompt is optimized for HTML tags
      return result.cleaned_html || result.html || "";
    }

    return "";
  } catch (error) {
    console.warn("Crawl4AI fetch failed, falling back to AllOrigins/direct knowledge:", error);
    return await fetchViaAllOrigins(url);
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
  const apiKey = process.env.OPENROUTER_API_KEY_SECURE || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OpenRouter API Key is missing. Please add it to your settings or .env.local file.");
  }

  try {
    // tryFeedFallback = true for the main page to find RSS feeds as a bypass
    const htmlContent = await fetchWebPage(url, true);

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
            "description": "Short summary (Extract if available, otherwise GENERATE a 1-sentence summary based on the title)",
            "pubDate": "Date string",
            "image": "Image URL (optional)"
          }
        ]
      }
      
      Requirements:
      1. Extract REAL items from the HTML. Do NOT use your internal knowledge about the site (e.g., old 2023 articles). If the HTML is empty or blocked, return an empty items list.
      2. If a link is relative (e.g., "/news/123"), keep it relative. The system will handle normalization.
      3. For "description": 
         - Search for an excerpt/summary. 
         - **CRITICAL:** If NO summary is found in the HTML, you MUST GENERATE a short, engaging 1-sentence summary based on the article title.
      4. For images:
         - **STRICT CHECK:** Look for <img> tags. Check 'src', 'data-src', 'lazy-src', and 'srcset'.
         - Look for images in Elementor layouts (.elementor-post__thumbnail img) or WordPress thumbnails (.wp-post-image).
         - Also check if images are hosted on subdomains like 'media.example.com'.
         - If 'srcset' is present, extract the URL for the largest version.
        - Do NOT use 1x1 pixels, avatars, logos, icons, or placeholder images.
        - **IMPORTANT:** If the article has a featured image (often high in the HTML, with classes like 'wp-post-image' or in 'og:image' meta tag), prefer that.
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
      // Pre-process content to fix common JSON issues from LLMs
      let cleanContent = content;

      // 1. Remove markdown code blocks if present
      const markdownMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (markdownMatch) {
        cleanContent = markdownMatch[1];
      }

      // 2. Fix bad unicode escapes (e.g. \u00 which is invalid in some contexts or just malformed)
      // This is a heuristic: match \u followed by non-hex digits or incomplete hex
      // But more commonly, it's a single backslash that should be double escaped
      cleanContent = cleanContent
        // Escape unescaped backslashes that are NOT part of a valid escape sequence
        // This is tricky, so we'll try a safer approach:
        // Remove strictly invalid control characters first
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x1F\x7F]/g, "")
        // Attempt to fix common "Bad Unicode escape" by double-escaping backslashes that precede 'u' but aren't followed by 4 hex digits
        .replace(/\\u(?![0-9a-fA-F]{4})/g, "\\\\u");

      parsedData = JSON.parse(cleanContent);
    } catch (e: any) {
      console.warn("JSON Parse Failed first attempt:", e.message);
      // Fallback: try to find the first '{' and the last '}'
      try {
        const firstOpen = content.indexOf('{');
        const lastClose = content.lastIndexOf('}');
        if (firstOpen !== -1 && lastClose !== -1) {
          const jsonSubstring = content.substring(firstOpen, lastClose + 1);
          parsedData = JSON.parse(jsonSubstring);
        } else {
          throw e;
        }
      } catch (retryError) {
        console.error("Critical JSON Parse Error:", retryError);
        throw new Error(`Failed to parse AI response: ${e.message}. Raw: ${content.substring(0, 100)}...`);
      }
    }

    // Safely get items array
    const items = Array.isArray(parsedData.items) ? parsedData.items : [];

    // Post-process items to fetch missing images (Deep Extraction)
    // This is necessary for sites like cheaptravelvip.com where the list page hides images
    const enrichedItems = await Promise.all(items.map(async (item: any) => {
      let finalLink = item.link;
      try {
        finalLink = new URL(item.link, url).href;
      } catch (e) {
        // Link invalid
      }

      let finalImage = item.image;

      // If the AI returned a logo/icon/avatar, treat it as "no image" to trigger deep extraction
      const isLogo = (src: string) => {
        const lower = src.toLowerCase();
        return lower.includes("logo") || lower.includes("icon") || lower.includes("avatar") ||
          lower.includes("placeholder") || lower.includes("tr?id=");
      };

      if (finalImage && isLogo(finalImage)) {
        console.log(`AI extracted a logo-like image (${finalImage}), clearing to trigger deep extraction.`);
        finalImage = null;
      }

      if (finalImage) {
        try {
          finalImage = new URL(finalImage, url).href;
        } catch (e) { console.warn(`Failed to normalize image: ${item.image}`); }
      }

      if (finalLink && !finalImage) {
        // Deep Extraction: Fetch article page to find image
        // tryFeedFallback = false here as we only want the article HTML
        try {
          console.log(`Deep extracting image for: ${finalLink}`);
          const articleHtml = await fetchWebPage(finalLink, false);
          if (articleHtml) {
            // Priority list for images
            // 1. OG Image (Open Graph)
            // 2. Twitter Image
            // 3. Itemprop image
            // 4. Featured Image classes (wp-post-image, etc)
            // 5. First significant image

            const ogMatch = articleHtml.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
            const twitterMatch = articleHtml.match(/<meta[^>]*name=["'](?:twitter:image|twitter:image:src)["'][^>]*content=["']([^"']+)["']/i);
            const itempropMatch = articleHtml.match(/<(?:meta|link)[^>]*itemprop=["'](?:image|thumbnailUrl)["'][^>]*content=["']([^"']+)["']/i);
            const featuredMatch = articleHtml.match(/class=["'][^"']*(?:wp-post-image|featured-image|entry-thumb|post-thumbnail|attachment-)[^"']*["'][^>]*src=["']([^"']+)["']/i);

            // Priority: Featured classes > Twitter > OG > Itemprop
            // But also filter out logos and common tracking images
            const candidates = [
              featuredMatch?.[1],
              twitterMatch?.[1],
              ogMatch?.[1],
              itempropMatch?.[1]
            ].filter(src => src && !src.toLowerCase().includes("logo") && !src.toLowerCase().includes("icon") && !src.toLowerCase().includes("avatar") && !src.toLowerCase().includes("tr?id="));

            finalImage = candidates[0];

            if (!finalImage) {
              // Fallback to OG even if it has logo if nothing else found? 
              // Better to have no image than a generic logo for an article.
              // But let's check first significant image
              const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
              let m;
              while ((m = imgRegex.exec(articleHtml)) !== null) {
                const src = m[1];
                if (!src.includes("logo") && !src.includes("icon") && !src.includes("avatar") && !src.includes("/ad/")) {
                  finalImage = src;
                  break;
                }
              }
            }
            // Normalize found image
            if (finalImage) {
              try { finalImage = new URL(finalImage, finalLink).href; } catch (e) { }
            }
          }
        } catch (e) {
          console.warn(`Failed deep extraction for ${finalLink}:`, e);
        }
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
    }));

    const rssItems = enrichedItems; // Already formatted as strings

    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(parsedData.title || 'Generated Feed')}</title>
    <link>${escapeXml(url)}</link>
    <description>${escapeXml(parsedData.description || 'RSS feed generated by AI')}</description>
    ${rssItems.join('')}
  </channel>
</rss>`;

    return rss.trim();

  } catch (error: any) {
    console.error("OpenRouter API Error:", error);
    throw new Error(error.message || "Failed to generate RSS feed.");
  }
};