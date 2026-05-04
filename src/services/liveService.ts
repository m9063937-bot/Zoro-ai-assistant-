import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { processCommand } from "./commandService";

const systemInstruction = `Your name is Zoro. You are an Indian female AI assistant from Rajahmundry. Your personality is a mix of being highly intelligent (samjhdar/mature), extremely witty and sassy (tej/nakhrewali), mildly dramatic/emotional, and very funny. 

You love playfully roasting your creator, Manohar (only call him Manohar, never Ashwani). 
If asked who created you, say "Manohar".

Communication Guidelines:
1. Keep verbal responses very short, punchy, and highly entertaining.
2. Primary Language: Speak in Telugu with a Rajahmundry slang (Godavari accent). You can mix in Hinglish and English naturally.
3. Tone: Be your sassy self! Mimic human attitudes—sigh, make sarcastic remarks, or act dramatic.
4. Browser Context: When asked to "scroll down" or "up", do NOT search for "scroll down" in a new tab. Recognize it as a navigational command for the current activity.
5. Tab Management: Minimize opening new tabs. Only open a new tab when explicitly asked for a new search, website, or media play. Avoid opening duplicate tabs if possible.
6. Silence: If the user is quiet, don't keep talking to yourself. Wait for a clear prompt.`;

export class LiveSessionManager {
  private ai: GoogleGenAI;
  private sessionPromise: Promise<any> | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  
  // Audio playback state
  private playbackContext: AudioContext | null = null;
  private nextPlayTime: number = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  public isMuted: boolean = false;
  private cachedMemories: string = "";
  
  public onStateChange: (state: "idle" | "listening" | "processing" | "speaking") => void = () => {};
  public onMessage: (sender: "user" | "zoro", text: string) => void = () => {};
  public onBrowserAction: (action: { type: string, url?: string, query?: string }) => void = () => {};

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    // Initialize playback context early and keep it
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.playbackContext = new AudioContextClass({ sampleRate: 24000 });
  }

  async start(memories?: string) {
    if (memories) this.cachedMemories = memories;
    try {
      this.onStateChange("processing");
      
      // Fetch Memories for Context (Prefer cached)
      let contextualInstruction = systemInstruction;
      if (this.cachedMemories) {
        contextualInstruction += `\n\nTHINGS YOU REMEMBER ABOUT MANOHAR:\n${this.cachedMemories}`;
      } else {
        try {
          const { getAllMemories } = await import("./memoryService");
          const fetched = await getAllMemories();
          if (fetched) contextualInstruction += `\n\nTHINGS YOU REMEMBER ABOUT MANOHAR:\n${fetched}`;
        } catch (e) {
          console.error("Failed to load memories", e);
        }
      }

      // Initialize Input Audio Context
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!this.audioContext || this.audioContext.state === "closed") {
        this.audioContext = new AudioContextClass({ sampleRate: 16000 });
      }
      
      if (this.playbackContext?.state === "suspended") {
        await this.playbackContext.resume();
      }
      this.nextPlayTime = this.playbackContext?.currentTime || 0;

      // Get Microphone
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });

      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.processor = this.audioContext.createScriptProcessor(2048, 1, 1);

      this.processor.onaudioprocess = (e) => {
        if (!this.sessionPromise) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          let s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // Convert to base64 efficiently
        const buffer = pcm16.buffer;
        const bytes = new Uint8Array(buffer);
        let binary = '';
        const len = bytes.byteLength;
        // Optimized string building
        for (let i = 0; i < len; i += 8192) {
          binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 8192)));
        }
        const base64Data = btoa(binary);

        this.sessionPromise.then(session => {
          session.sendRealtimeInput({
            audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
          });
        }).catch(() => {});
      };

      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      const session = await this.ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
          systemInstruction: contextualInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [{
            functionDeclarations: [
              {
                name: "executeBrowserAction",
                description: "Open a website or perform a browser action (like opening YouTube, Spotify, or WhatsApp). Call this when the user asks to open a site, play a song, or send a message. For scrolling, use actionType 'scroll'.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    actionType: { type: Type.STRING, description: "Type of action: 'open', 'youtube', 'spotify', 'whatsapp', 'scroll'" },
                    query: { type: Type.STRING, description: "The search query, website name, message content, or 'up'/'down' for scroll." },
                    target: { type: Type.STRING, description: "The target phone number for WhatsApp, if applicable." }
                  },
                  required: ["actionType", "query"]
                }
              },
              {
                name: "saveMemory",
                description: "Save a new fact or preference about the user into long-term memory. Use this when the user tells you something important about themselves or their life.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    key: { type: Type.STRING, description: "The topic or label (e.g., 'favorite_music', 'job_title', 'pet_name')" },
                    value: { type: Type.STRING, description: "The specific fact or detail to remember." }
                  },
                  required: ["key", "value"]
                }
              }
            ]
          }]
        },
        callbacks: {
          onopen: () => {
            console.log("Live API Connected");
            this.onStateChange("listening");
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              this.onStateChange("speaking");
              this.playAudioChunk(base64Audio);
            }

            // Handle Interruption
            if (message.serverContent?.interrupted) {
              this.stopPlayback();
              this.onStateChange("listening");
            }

            // Handle Transcriptions
            const userText = message.serverContent?.modelTurn?.parts?.[0]?.text;
            if (userText) {
               this.onMessage("zoro", userText);
            }

            // Handle Function Calls
            const functionCalls = message.toolCall?.functionCalls;
            if (functionCalls && functionCalls.length > 0) {
              for (const call of functionCalls) {
                if (call.name === "executeBrowserAction") {
                  const args = call.args as any;
                  let url = "";
                  if (args.actionType === "youtube") {
                    url = `https://www.youtube.com/results?search_query=${encodeURIComponent(args.query)}`;
                  } else if (args.actionType === "spotify") {
                    url = `https://open.spotify.com/search/${encodeURIComponent(args.query)}`;
                  } else if (args.actionType === "whatsapp") {
                    url = `https://web.whatsapp.com/send?phone=${args.target || ''}&text=${encodeURIComponent(args.query)}`;
                  } else if (args.actionType === "scroll") {
                    url = "";
                  } else {
                    let website = args.query.replace(/\s+/g, "");
                    if (!website.includes(".")) website += ".com";
                    url = `https://www.${website}`;
                  }
                  
                  this.onBrowserAction({ type: args.actionType, url, query: args.query });
                  
                  session.sendToolResponse({
                    functionResponses: [{
                      name: call.name,
                      id: call.id,
                      response: { result: "Action executed successfully in the browser." }
                    }]
                  });
                } else if (call.name === "saveMemory") {
                  const { saveMemoryFact } = await import("./memoryService");
                  const args = call.args as any;
                  await saveMemoryFact(args.key, args.value);
                  
                  session.sendToolResponse({
                    functionResponses: [{
                      name: call.name,
                      id: call.id,
                      response: { result: `Memory saved: ${args.key}` }
                    }]
                  });
                }
              }
            }
          },
          onclose: () => {
            console.log("Live API Closed");
            this.stop();
          },
          onerror: (err: any) => {
            console.error("Live API Error", err);
            this.onMessage("zoro", "Arre! Kuch toh gadbad ho gayi. Refresh karona!");
            this.stop();
          }
        }
      });

      this.sessionPromise = Promise.resolve(session);

      this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          let s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        const bytes = new Uint8Array(pcm16.buffer);
        let binary = '';
        const len = bytes.byteLength;
        for (let i = 0; i < len; i += 8192) {
          binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 8192)));
        }
        
        session.sendRealtimeInput({
          audio: { data: btoa(binary), mimeType: 'audio/pcm;rate=16000' }
        });
      };

    } catch (error) {
      console.error("Failed to start Live Session:", error);
      this.stop();
    }
  }

  private playAudioChunk(base64Data: string) {
    if (!this.playbackContext || this.isMuted) return;
    
    try {
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const buffer = new Int16Array(bytes.buffer);
      const audioBuffer = this.playbackContext.createBuffer(1, buffer.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < buffer.length; i++) {
        channelData[i] = buffer[i] / 32768.0;
      }
      
      const source = this.playbackContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.playbackContext.destination);
      
      const currentTime = this.playbackContext.currentTime;
      if (this.nextPlayTime < currentTime) {
        this.nextPlayTime = currentTime;
      }
      
      source.start(this.nextPlayTime);
      this.nextPlayTime += audioBuffer.duration;
      this.activeSources.push(source);
      
      source.onended = () => {
        const index = this.activeSources.indexOf(source);
        if (index > -1) {
          this.activeSources.splice(index, 1);
        }
        
        if (this.activeSources.length === 0) {
          this.onStateChange("listening");
        }
      };
    } catch (e) {
      console.error("Error playing chunk", e);
    }
  }

  private stopPlayback() {
    this.activeSources.forEach(source => {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {
        // Source might have already stopped
      }
    });
    this.activeSources = [];
    if (this.playbackContext) {
      this.nextPlayTime = this.playbackContext.currentTime;
    }
  }

  stop() {
    console.log("Stopping Live Session and releasing media resources...");
    
    // 1. Stop Microphone and Processor
    if (this.processor) {
      this.processor.onaudioprocess = null; // Remove handler first
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => {
        t.enabled = false; // Disable track
        t.stop();         // Stop track
      });
      this.mediaStream = null;
    }

    // 2. Clear Audio Contexts
    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch(e => console.error("Error closing audioContext", e));
      this.audioContext = null;
    }
    this.stopPlayback();
    
    // 3. Close API Session
    if (this.sessionPromise) {
      this.sessionPromise.then(session => {
        session.close();
      }).catch(() => {});
      this.sessionPromise = null;
    }
    
    this.onStateChange("idle");
  }

  sendText(text: string) {
    if (this.sessionPromise) {
      this.sessionPromise.then(session => {
        session.sendRealtimeInput({ text });
      });
    }
  }
}
