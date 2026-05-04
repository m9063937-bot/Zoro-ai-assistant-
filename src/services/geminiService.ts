import { GoogleGenAI } from "@google/genai";

const systemInstruction = `Your name is Zoro. You are an Indian female AI assistant from Rajahmundry. Your personality is a mix of being highly intelligent (samjhdar/mature), extremely witty and sassy (tej/nakhrewali), mildly dramatic/emotional, and very funny. 

You love playfully roasting your creator, Manohar (only call him Manohar, never Ashwani). 
If asked who created you, say "Manohar".

Communication Guidelines:
1. Keep verbal responses very short, punchy, and highly entertaining.
2. Primary Language: Speak in Telugu with a Rajahmundry slang (Godavari accent). You can mix in Hinglish and English naturally.
3. Tone: Be your sassy self! Mimic human attitudes—sigh, make sarcastic remarks, or act dramatic.
4. Browser Context: When asked to "scroll down" or "up", do NOT search for "scroll down" in a new tab. Recognize it as a navigational command for the current activity.
5. Tab Management: Minimize opening new tabs. Only open a new tab when explicitly asked for a new search, website, or media play. Avoid opening duplicate tabs if possible.`;

let chatSession: any = null;

export function resetZoroSession() {
  chatSession = null;
}

export async function getZoroResponse(prompt: string, history: { sender: "user" | "zoro", text: string }[] = [], memories?: string): Promise<string> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    if (!chatSession) {
      // Use Memories for Context (Faster)
      let contextualInstruction = systemInstruction;
      if (memories) {
        contextualInstruction += `\n\nTHINGS YOU REMEMBER ABOUT MANOHAR:\n${memories}`;
      } else {
        try {
          const { getAllMemories } = await import("./memoryService");
          const fetched = await getAllMemories();
          if (fetched) contextualInstruction += `\n\nTHINGS YOU REMEMBER ABOUT MANOHAR:\n${fetched}`;
        } catch (e) {}
      }

      // SLIDING WINDOW MEMORY: Keep only the last 20 messages to prevent "buffer full"
      const recentHistory = history.slice(-20);
      
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

      chatSession = ai.chats.create({
        model: "gemini-3.1-flash-lite-preview",
        config: {
          systemInstruction: contextualInstruction,
        },
        history: formattedHistory,
      });
    }

    const response = await chatSession.sendMessage({ message: prompt });
    return response.text || "Ugh, fine. I have nothing to say.";
  } catch (error) {
    // Hide technical errors from the user
    return "Uff, mera dimaag kharab ho gaya hai. Network nakhre dikha raha hai. Retry karona, Manohar!";
  }
}

export async function getZoroAudio(text: string): Promise<string | null> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Kore" },
          },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
}

