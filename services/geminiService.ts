export const generateRSSFromURL = async (url: string): Promise<string> => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OpenRouter API Key is missing. Please add it to your settings or .env.local file.");
  }

  try {
    const prompt = `
      Task: Create a valid RSS 2.0 XML feed for the website: ${url}
      
      Steps:
      1. Use your knowledge and browsing capabilities to find the 5-10 most recent, real articles from this specific URL.
      2. For each item, you MUST extract:
         - Title: The clear, concise headline.
         - Post URL: The direct, permanent link. CRITICAL: DO NOT hallucinate. Use the site's actual URL pattern. Ensure it starts with http/https and resides on the domain of ${url}.
         - Publish Date: Original date (RFC-822).
         - Content Snippet: A 2-3 sentence summary.
         - Image URL: Find the highest quality representative image. PREFER meta tags like og:image, twitter:image, or the main article header image.
      3. Generate the XML string.
      
      Strict Requirements:
      - NO Hallucinated Links: I will verify these links. If you are not sure, do not include the item.
      - RSS Format: Root <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/">.
      - Item Tags: 
        - <title>, <link>, <description> (the snippet).
        - <pubDate> (RFC-822 format).
        - <guid isPermaLink="true"> (the post URL).
        - <enclosure url="..." type="image/jpeg" length="0" /> (The Image URL).
        - <media:content url="..." medium="image" /> (The same Image URL for better compatibility).
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