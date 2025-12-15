import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini API
const API_KEY = import.meta.env.GEMINI_API_KEY;

export const generateBriefing = async (statsA: any, statsB: any, nameA: string, nameB: string) => {
    if (!API_KEY) {
        console.warn("Missing GEMINI_API_KEY");
        return "AI Briefing unavailable: API Key missing.";
    }

    try {
        const genAI = new GoogleGenerativeAI(API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        const prompt = `
        Compare these two Oura ring stats for a couple, ${nameA} and ${nameB}:
        ${nameA}: ${JSON.stringify(statsA)}
        ${nameB}: ${JSON.stringify(statsB)}
        
        Output a 3-sentence summary in a "Coach" persona (sassy but supportive):
        1. Who "won" sleep (based on score, readiness, etc).
        2. One specific insight (e.g., "${nameB}'s HRV tanked").
        3. A fun suggestion for their day together based on their energy levels.
        
        Keep it concise and fun.
      `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Error generating briefing:", error);
        return "Failed to generate briefing. Please try again later.";
    }
};
