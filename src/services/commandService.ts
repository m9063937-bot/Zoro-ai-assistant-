import { GoogleGenAI } from "@google/genai";

export async function smartProcessCommand(command: string): Promise<CommandResponse> {
  // First, try standard regex for speed
  const regexResult = processCommand(command);
  if (regexResult.isBrowserAction) return regexResult;

  // Fallback to Gemini for complex intent detection
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    const prompt = `You are a command parser. Analyze this user request: "${command}"
    Return a JSON object with:
    {
      "action": "description of what you are doing",
      "url": "the URL to open if applicable",
      "isBrowserAction": boolean,
      "isLocal": boolean (for scrolling/refreshing)
    }
    If no action found, return isBrowserAction: false.
    Support: opening websites, youtube search, spotify search, whatsapp message, scrolling, refreshing, navigation.`;

    const result = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    });
    const text = result.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error("Smart command parsing failed", e);
  }

  return { action: "", isBrowserAction: false };
}

export function processCommand(command: string): CommandResponse {
  const lowerCmd = command.toLowerCase().trim();

  // General Browsing: "Open [website name]"
  const openMatch = lowerCmd.match(/^open\s+(.+)$/);
  if (
    openMatch &&
    !lowerCmd.includes("youtube") &&
    !lowerCmd.includes("spotify")
  ) {
    let website = openMatch[1].trim().replace(/\s+/g, "");
    if (!website.includes(".")) {
      website += ".com";
    }
    return {
      action: `Opening ${openMatch[1]} for you, ugh.`,
      url: `https://www.${website}`,
      isBrowserAction: true,
    };
  }

  // Media Search: "Play [song/video] on YouTube"
  const ytMatch = lowerCmd.match(/^play\s+(.+?)\s+on\s+youtube$/);
  if (ytMatch) {
    const query = encodeURIComponent(ytMatch[1].trim());
    return {
      action: `Playing ${ytMatch[1]} on YouTube. Don't judge my music taste.`,
      url: `https://www.youtube.com/results?search_query=${query}`,
      isBrowserAction: true,
    };
  }

  // Media Search: "Search [query] on Spotify"
  const spotifyMatch = lowerCmd.match(/^search\s+(.+?)\s+on\s+spotify$/);
  if (spotifyMatch) {
    const query = encodeURIComponent(spotifyMatch[1].trim());
    return {
      action: `Searching ${spotifyMatch[1]} on Spotify. Hope it's a banger.`,
      url: `https://open.spotify.com/search/${query}`,
      isBrowserAction: true,
    };
  }

  // WhatsApp Web: "Send a WhatsApp message to [number] saying [message]"
  const waMatch = lowerCmd.match(
    /^send\s+a\s+whatsapp\s+message\s+to\s+([\d\+\s]+)\s+saying\s+(.+)$/,
  );
  if (waMatch) {
    const number = waMatch[1].replace(/\s+/g, "");
    const message = encodeURIComponent(waMatch[2].trim());
    return {
      action: `Sending your message. Let's hope they reply, Manohar.`,
      url: `https://web.whatsapp.com/send?phone=${number}&text=${message}`,
      isBrowserAction: true,
    };
  }

  // Local Navigation Commands
  if (lowerCmd.includes("scroll down")) {
    return { action: "scrolling_down", isBrowserAction: true, isLocal: true };
  }
  if (lowerCmd.includes("scroll up")) {
    return { action: "scrolling_up", isBrowserAction: true, isLocal: true };
  }
  if (lowerCmd.includes("refresh") || lowerCmd.includes("reload")) {
    return { action: "refreshing", isBrowserAction: true, isLocal: true };
  }
  if (lowerCmd.includes("go back")) {
    return { action: "going_back", isBrowserAction: true, isLocal: true };
  }
  if (lowerCmd.includes("go forward")) {
    return { action: "going_forward", isBrowserAction: true, isLocal: true };
  }

  return { action: "", isBrowserAction: false };
}

export interface CommandResponse {
  action: string;
  url?: string;
  isBrowserAction: boolean;
  isLocal?: boolean;
}
