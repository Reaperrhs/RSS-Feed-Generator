export const generateRSSFromURL = async (url: string): Promise<string> => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OpenRouter API Key is missing. Please add it to your settings or .env.local file.");
  }

  try {
    const prompt = `
      Task: Create a valid RSS 2.0 XML feed for the website: ${url}
      
      Steps:
      1. Use your knowledge or simulated search to find the 5-10 most recent articles, blog posts, or news items from this specific URL.
      2. For each item, you MUST extract:
         - Title: The clear, concise headline of the post.
         - Post URL: The direct, permanent link to the full article.
         - Publish Date: The original date/time the post was published (RFC-822 format).
         - Content Snippet: A meaningful 2-3 sentence summary or excerpt from the start of the article.
         - Image URL: A high-quality representative image or thumbnail for the post.
      3. Generate the XML string.
      
      Requirements:
      - Start with exactly: <?xml version="1.0" encoding="UTF-8"?>
      - Root element must be <rss version="2.0">.
      - Contain a <channel> with title, link, description.
      - Each <item> MUST include: <title>, <link>, <description> (the content snippet), <pubDate> (RFC-822), and <enclosure url="..." type="image/jpeg" length="0" /> for the Image URL.
      - Ensure all URLs in <link> and <enclosure url="..."> tags are valid.
      - STRICTLY RETURN ONLY THE XML STRING.
      - Do not include markdown formatting (like \`\`\`xml).
      - Do not include any conversational text before or after the XML.
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