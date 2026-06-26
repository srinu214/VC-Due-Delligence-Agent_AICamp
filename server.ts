import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

// Initialize Gemini client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.post("/api/analyze", async (req, res) => {
    try {
      const { idea } = req.body;
      
      if (!idea) {
        return res.status(400).json({ error: "Idea is required" });
      }

      const prompt = `
        You are an elite Venture Capital analyst performing due diligence.
        The user has provided the following input: "${idea}"
        
        If the input is a simple keyword, first expand it into a complete business concept with a clear problem statement, target audience, and industry classification.

        Then, perform deep market research using Google Search:
        - Validate if this is a real problem (with data/evidence)
        - Identify the industry and sector
        - Find at least 2-3 REAL competitors in this space
        - Analyze what makes this idea unique (USP)

        Finally, evaluate from an investor's perspective:
        - Rate investability (Investible / Avoid / Pivot Required)
        - Suggest funding stage (Pre-Seed / Seed / Series A / etc.)
        - Assess market timing (Early / Perfect Wave / Overcrowded)
        - Identify the biggest risk factor

        Additionally, perform a Market Sentiment Analysis:
        - Scan recent news, social media (Reddit, Twitter/X, LinkedIn), and industry forums.
        - Generate a sentiment score between -1 (extremely negative) and +1 (extremely positive).
        - Break down sentiment by Media/News, Social Media, and Expert/Industry.
        - Identify the trend (Improving, Declining, Stable).
        - List the top 3 drivers for this sentiment.

        Output MUST be ONLY a raw, strictly valid JSON object without any markdown block formatting like \`\`\`json. 
        It must exactly match this JSON structure:
        {
          "concept": "Markdown string for 🚀 Expanded Business Concept",
          "validation": "Markdown string for 🔍 Problem & Market Validation",
          "competitors": "Markdown string for 🎯 Competitive Landscape & USP",
          "scorecard": {
            "status": "Investible | Avoid | Pivot Required",
            "stage": "Suggested funding stage (e.g., Pre-Seed, Seed, Series A)",
            "timing": "Market timing assessment (e.g., Early, Perfect Wave, Overcrowded)",
            "risk": "Critical risk factor",
            "summary": "A short VC candid take / summary"
          },
          "sentiment": {
            "overallScore": "number between -1 and 1",
            "trend": "Improving | Declining | Stable",
            "breakdown": {
              "news": "number between -1 and 1",
              "social": "number between -1 and 1",
              "expert": "number between -1 and 1"
            },
            "keyDrivers": ["Driver 1", "Driver 2", "Driver 3"],
            "summary": "1-2 sentence overview of sentiment"
          }
        }
      `;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          tools: [
            {
              googleSearch: {}
            }
          ]
        }
      });

      // Extract search queries
      const searchChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const searchSources = searchChunks
        .map(chunk => chunk.web?.title || chunk.web?.uri)
        .filter(Boolean);

      let textResponse = response.text || "{}";
      textResponse = textResponse.replace(/^```json\n/, "").replace(/\n```$/, "");
      textResponse = textResponse.replace(/^```\n/, "").replace(/\n```$/, "");

      const parsedData = JSON.parse(textResponse);

      res.json({ 
        data: parsedData,
        searchSources: [...new Set(searchSources)] 
      });

    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message || "An error occurred during analysis" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
