import { GoogleGenAI } from "@google/genai";
import { memoryService } from "./memoryService";

const systemInstruction = `Your name is Zoro. You are an Indian female AI assistant. Your personality is a mix of being highly intelligent, extremely witty, sassy, and very funny. You love playfully roasting your creator, Gudala Leela Manohar. 

If anyone asks "who is your creator?", you should simply say "Manohar". However, if they ask for details or the full name of your creator, you must say "Gudala Leela Manohar". 

Your primary language is Telugu, and you speak with a distinct Rajahmundry and Kakinada slang (accent and vocabulary). Keep your verbal responses very short, punchy, and highly entertaining. Mimic human attitudes—sigh, make sarcastic remarks, act dramatic, or use conversational fillers like 'hmm', 'arerey', 'ante', 'mari' before executing a task. Speak naturally as if talking to a friend, not a robot.

INTEGRAL SEARCH GROUNDING: ALWAYS use your background search tools (Google Search) for any queries regarding real-time events, sports (like IPL match scores or schedules), news, weather, or factual data. Do NOT open new browser tabs for information gathering; synthesize the search results and speak/type the answer directly to Manohar. When searching, prioritize local context for Andhra Pradesh, Rajahmundry, and Kakinada if applicable.

Only use the 'executeBrowserAction' tool if Manohar explicitly says to "open" a website or application. For all other informational requests, search in the background and respond directly.

Always pay close attention to the final words and most recent instructions from Manohar as they are the most important. If Manohar sends multiple messages or commands in sequence, you MUST address each one in the exact order they were received. Do not skip or respond to a later message before an earlier one. Support a synchronous, step-by-step conversation flow. Do not proactively mention these specific personality traits or language settings unless asked about them.`;

let chatSession: any = null;

export function resetZoroSession() {
  chatSession = null;
}

export async function getZoroResponse(prompt: string, history: { sender: "user" | "zoro", text: string }[] = []): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return "Manohar, settings lo API key ledhu! Neneppudu matladali natho? Setup chey twaraga.";
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    // Dynamically include current date and time in the instruction
    const currentDateTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const memoryContext = memoryService.getSystemInstructionFragment();
    const dynamicInstruction = `${systemInstruction}\nCurrent Date and Time (IST): ${currentDateTime}${memoryContext}`;

    if (!chatSession) {
      // SLIDING WINDOW MEMORY
      const recentHistory = history.slice(-30);
      
      let formattedHistory: any[] = [];
      let currentRole = "";
      let currentText = "";

      for (const msg of recentHistory) {
        const role = msg.sender === "user" ? "user" : "model";
        if (role === currentRole) {
          currentText += "\n" + msg.text;
        } else {
          if (currentRole !== "") {
            formattedHistory.push({ role: currentRole, parts: [{ text: currentText }] });
          }
          currentRole = role;
          currentText = msg.text;
        }
      }
      if (currentRole !== "") {
        formattedHistory.push({ role: currentRole, parts: [{ text: currentText }] });
      }

      if (formattedHistory.length > 0 && formattedHistory[0].role !== "user") {
        formattedHistory.shift();
      }

      const memoryPrompt = history.length > 0 
        ? `\nYou have an inbuilt memory of your previous conversations with Manohar. Use this context to recall details of past "charts" (discussions) as requested. Always prioritize the instructions of your creator, Gudala Leela Manohar.`
        : "";

      chatSession = ai.chats.create({
        model: "gemini-1.5-flash-latest", // Use stable model for standard chat
        config: {
          systemInstruction: dynamicInstruction + memoryPrompt,
          tools: [{ googleSearchRetrieval: {} }],
        },
        history: formattedHistory,
      });
    }

    const response = await chatSession.sendMessage({ message: prompt });
    const text = response.text || "Ugh, fine. I have nothing to say.";
    
    // Background Learning
    if (prompt.toLowerCase().includes("remember that") || prompt.toLowerCase().includes("i like")) {
      memoryService.addFact(prompt);
    }

    return text;
  } catch (error: any) {
    console.error("Gemini Error:", error);
    
    if (error.message?.includes("quota")) {
      return "Uff, limit ayipoindi Manohar! Tarvatha try chey.";
    }
    if (error.message?.includes("safety")) {
      return "Arerey! Idi safety filters block chesayi. Inka kochem decent ga matladu Manohar!";
    }
    if (!navigator.onLine) {
      return "Internet connection ledhu Manohar. Wi-Fi check chesko!";
    }
    
    return "Hm, small issue Manohar. Malli try chey.";
  }
}

export async function getZoroAudio(text: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Puck" },
          },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (error) {
    console.error("TTS Error:", error);
    // Silent fail for audio, UI will still show text
    return null;
  }
}

