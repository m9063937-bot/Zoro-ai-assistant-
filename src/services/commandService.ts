export function processCommand(command: string): {
  action: string;
  url?: string;
  isBrowserAction: boolean;
} {
  const lowerCmd = command.toLowerCase().trim();

  // Navigation: "Scroll up/down" 
  if (lowerCmd.match(/^(scroll\s+(up|down)|scroll)$/)) {
    return {
      action: `Got it! Scrolling ${lowerCmd.includes("up") ? "up" : "down"} for you.`,
      isBrowserAction: false,
    };
  }

  // General App Opening: "Open [app name]"
  const openMatch = lowerCmd.match(/^open\s+(.+)$/);
  if (openMatch) {
    const appName = openMatch[1].trim().toLowerCase();
    
    // Mobile Deep Links or App-Specific URLs
    const appLinks: Record<string, string> = {
      instagram: "https://www.instagram.com/",
      facebook: "https://www.facebook.com/",
      twitter: "https://twitter.com/",
      x: "https://twitter.com/",
      whatsapp: "https://web.whatsapp.com/",
      camera: "camera://",
      phone: "tel:",
      sms: "sms:",
      calculator: "calculator://",
      spotify: "https://open.spotify.com/",
      youtube: "https://www.youtube.com/",
      map: "https://maps.google.com/",
      gmail: "https://mail.google.com/",
    };

    if (appLinks[appName]) {
      return {
        action: `Opening ${appName} for you. Kya dekhoge waha, Manohar?`,
        url: appLinks[appName],
        isBrowserAction: true,
      };
    }

    let website = openMatch[1].trim().replace(/\s+/g, "");
    if (!website.includes(".")) {
      website += ".com";
    }
    return {
      action: `Opening ${openMatch[1]} web version. Thoda sabar rakho!`,
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

  return { action: "", isBrowserAction: false };
}
