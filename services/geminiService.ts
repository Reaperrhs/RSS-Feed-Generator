import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateRSSFromURL = async (url: string): Promise<string> => {
  try {
    const prompt = `
      Task: Create a valid RSS 2.0 XML feed for the website: ${url}
      
      Steps:
      1. Use Google Search to find the 5-10 most recent articles, blog posts, or news items from this specific URL.
      2. For each item, extract: Title, Link, Description/Snippet, PubDate, and a representative Image URL.
      3. Generate the XML string.
      
      Requirements:
      - Root element must be <rss version="2.0">.
      - Contain a <channel> with title, link, description.
      - Items must include <title>, <link>, <description>, <pubDate> (RFC-822 format), and <enclosure> for images.
      - STRICTLY RETURN ONLY THE XML STRING.
      - Do not include markdown formatting (like \`\`\`xml).
      - Do not include any conversational text before or after the XML.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingBudget: 1024 } 
      }
    });

    let text = response.text || '';

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
      // If valid XML declaration missing, but RSS tag present, start there
      // (Precedence to xmlDecl if both exist and xmlDecl is first, which is standard)
      if (xmlDeclIndex === -1 || rssTagIndex < xmlDeclIndex) {
         startIndex = rssTagIndex;
      }
    }

    if (startIndex !== -1) {
      text = text.substring(startIndex);
    } else {
        // If no XML tags found, throw a specific error to catch in UI
        if (text.length < 50 && (text.toLowerCase().includes("cannot") || text.toLowerCase().includes("sorry"))) {
             throw new Error("The AI could not generate a feed for this URL. It might be inaccessible or lack recent content.");
        }
    }

    // 3. Trim trailing content after the closing tag
    const closingTagIndex = text.lastIndexOf('</rss>');
    if (closingTagIndex !== -1) {
      text = text.substring(0, closingTagIndex + 6);
    }

    return text.trim();
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    // Pass through specific error messages
    if (error.message.includes("AI could not generate")) {
        throw error;
    }
    throw new Error("Failed to generate RSS feed. The AI response was not valid XML.");
  }
};