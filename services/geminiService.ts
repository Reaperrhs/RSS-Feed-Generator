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

export const generateRSSFromURL = async (url: string): Promise<string> => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OpenRouter API Key is missing. Please add it to your settings or .env.local file.");
  }

  try {
    const htmlContent = await fetchWebPage(url);

    // Clean up HTML to save tokens (remove large scripts/styles)
    // Simple regex to remove script and style tags
    const cleanedHtml = htmlContent
      ? htmlContent.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gmi, "")
        .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gmi, "")
        .replace(/\s+/g, " ").substring(0, 100000) // Limit to ~100k chars for safety
      : "Could not fetch live content. Please generate based on your existing knowledge of the site structure.";

    const prompt = `
      Task: Create a valid RSS 2.0 XML feed for the website: ${url}
      
      Source Content:
      Below is the raw HTML content fetched from the website. You MUST use this content to extract the articles.
      
      HTML START
      ${cleanedHtml}
      HTML END
      
      Steps:
      1. Analyze the provided HTML to identify the distinct news articles or blog posts. Look for repeated patterns (cards, list items, <article> tags).
      2. For each item found in the HTML, extract:
         - Title: The text found in the headline element (h1, h2, h3).
         - Post URL: The 'href' from the anchor tag linking to the full post. MUST be fully qualified (start with http). If the href is relative (e.g., /news/123), prepend the base URL (${url}).
         - Publish Date: Try to find a date in <time> tags or meta data. If none, use the current date or a reasonable estimate based on the content.
         - Content Snippet: The excerpt or summary text found in the card.
         - Image URL: Extract the 'src' from the article's thumbnail image or 'srcset'.
      
      Strict Requirements:
      - NO Hallucinated Links: You must ONLY include items found in the HTML.
      - RSS Format: Root <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/">.
      - Item Tags: 
        - <title>, <link>, <description>
        - <pubDate>
        - <guid isPermaLink="true">
        - <enclosure url="..." type="image/jpeg" length="0" />
        - <media:content url="..." medium="image" />
      - XML Declaration: Exactly <?xml version="1.0" encoding="UTF-8"?>
      - ESCAPING: Ensure internal ampersands in URLs are &amp;
      - Output: RETURN ONLY THE XML. No markdown, no conversational text.
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
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    let text = data.choices[0]?.message?.content || "";

    console.log("OpenRouter Response:", text);

    // 1. Try to extract from markdown code blocks first
    const markdownMatch = text.match(/```(?:xml)?\s*([\s\S]*?)\s*```/);
    if (markdownMatch) {
      text = markdownMatch[1];
    }

    // 2. Find the index of the XML declaration or RSS root tag
    const xmlDeclIndex = text.indexOf('<?xml');
    const rssTagIndex = text.indexOf('<rss');

    let startIndex = -1;
    if (xmlDeclIndex !== -1) {
      startIndex = xmlDeclIndex;
    } else if (rssTagIndex !== -1) {
      if (xmlDeclIndex === -1 || rssTagIndex < xmlDeclIndex) {
        startIndex = rssTagIndex;
      }
    }

    if (startIndex !== -1) {
      text = text.substring(startIndex);
    } else {
      if (text.length < 50 && (text.toLowerCase().includes("cannot") || text.toLowerCase().includes("sorry"))) {
        throw new Error("The AI could not generate a feed for this URL. It might be inaccessible or lack recent content.");
      }
    }

    // 3. Trim trailing content after the closing tag
    const closingTagIndex = text.lastIndexOf('</rss>');
    if (closingTagIndex !== -1) {
      text = text.substring(0, closingTagIndex + 6);
    }

    // 4. Sanitize unescaped ampersands in URLs (Common issue with AI)
    // This looks for & character that is NOT part of an existing entity like &amp;
    text = text.replace(/&(?!(?:amp|lt|gt|quot|apos);)/g, '&amp;');

    // 5. Force XML version to 1.0 if AI produces 2.0 (Common LLM hallucination)
    text = text.replace(/<\?xml\s+version=["']2\.0["']/, '<?xml version="1.0"');

    return text.trim();
  } catch (error: any) {
    console.error("OpenRouter API Error:", error);
    if (error.message.includes("AI could not generate")) {
      throw error;
    }
    throw new Error(error.message || "Failed to generate RSS feed. The AI response was not valid XML.");
  }
};