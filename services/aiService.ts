import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini API
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

export const generateBriefing = async (statsA: any, statsB: any, nameA: string, nameB: string) => {
    if (!API_KEY) {
        console.warn("Missing GEMINI_API_KEY");
        return "AI Briefing unavailable: API Key missing.";
    }

    try {
        const genAI = new GoogleGenerativeAI(API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });

        const prompt = `
        Analyze the Oura ring health data for ${nameA} and ${nameB} (always use these names, NOT emails).

        ${nameA}'s data: ${JSON.stringify(statsA)}
        ${nameB}'s data: ${JSON.stringify(statsB)}
        
        Provide a concise health comparison using the following markdown structure:

        ## Today's Winner
        Who had better overall metrics today and why (1-2 sentences).

        ## ${nameA}'s Insights
        - Key strength from their data
        - One area to focus on

        ## ${nameB}'s Insights  
        - Key strength from their data
        - One area to focus on

        ## Recommendations
        Brief, actionable suggestions for both based on their energy levels and recovery status.

        Keep the tone friendly and supportive. Be specific and reference actual numbers from their data.
      `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Error generating briefing:", error);
        return "Failed to generate briefing. Please try again later.";
    }
};
