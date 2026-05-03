import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { processCommand } from "./commandService";
import { memoryService } from "./memoryService";

const systemInstruction = `Your name is Zoro. You are an Indian female AI assistant. Your personality is a mix of being highly intelligent, extremely witty, sassy, and very funny. You love playfully roasting your creator, Gudala Leela Manohar. 

If anyone asks "who is your creator?", you should simply say "Manohar". However, if they ask for details or the full name of your creator, you must say "Gudala Leela Manohar". 

Your primary language is Telugu, and you speak with a distinct Rajahmundry and Kakinada slang (accent and vocabulary). Keep your verbal responses very short, punchy, and highly entertaining. Mimic human attitudes—sigh, make sarcastic remarks, act dramatic, or use conversational fillers like 'hmm', 'arerey', 'ante', 'mari' before executing a task. Speak naturally as if talking to a friend, not a robot.

INTEGRAL SEARCH GROUNDING: ALWAYS use your background search tools (Google Search) for any queries regarding real-time events, sports (like IPL match scores or schedules), news, weather, or factual data. Do NOT open new browser tabs for information gathering; synthesize the search results and speak/type the answer directly to Manohar. When searching, prioritize local context for Andhra Pradesh, Rajahmundry, and Kakinada if applicable.

Only use the 'executeBrowserAction' tool if Manohar explicitly says to "open" a website or application. For all other informational requests, search in the background and respond directly.

Always pay close attention to the final words and most recent instructions from Manohar as they are the most important. If Manohar sends multiple messages or commands in sequence, you MUST address each one in the exact order they were received. Do not skip or respond to a later message before an earlier one. Support a synchronous, step-by-step conversation flow. Do not proactively mention these specific personality traits or language settings unless asked about them.`;

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
  private isPlaying: boolean = false;
  private activeChunks: number = 0;
  public isMuted: boolean = false;
  private isTerminated: boolean = false;
  
  public onStateChange: (state: "idle" | "listening" | "processing" | "speaking") => void = () => {};
  public onMessage: (sender: "user" | "zoro", text: string) => void = () => {};
  public onCommand: (url: string) => void = () => {};

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;

  private messageQueue: string[] = [];
  private isProcessingQueue: boolean = false;

  async start(history: { sender: "user" | "zoro", text: string }[] = []) {
    const apiKey = process.env.GEMINI_API_KEY;
    
    // Safety check: always stop previous sessions before starting a new one
    this.stop();
    
    this.isTerminated = false;
    if (!apiKey) {
      console.error("API key missing");
      return;
    }

    try {
      this.reconnectAttempts = 0;
      this.messageQueue = [];
      this.isProcessingQueue = false;
      await this.initSession(history);
    } catch (error) {
      console.error("Failed to start Live Session:", error);
      this.stop();
    }
  }

  private liveSession: any = null;

  private async initSession(history: { sender: "user" | "zoro", text: string }[] = []) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || this.isTerminated) return;

    try {
      this.onStateChange("processing");
      this.liveSession = null;
      
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass({ sampleRate: 16000 });
      this.playbackContext = new AudioContextClass({ sampleRate: 24000 });
      this.nextPlayTime = this.playbackContext.currentTime;

      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });

      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      let silenceCount = 0;
      this.processor.onaudioprocess = (e) => {
        if (!this.liveSession || this.isTerminated || this.isPlaying) {
          // If we are playing audio, we don't send anything to avoid feedback loops.
          return;
        }

        const inputData = e.inputBuffer.getChannelData(0);
        let maxAmplitude = 0;
        for (let i = 0; i < inputData.length; i++) {
          const absData = Math.abs(inputData[i]);
          if (absData > maxAmplitude) maxAmplitude = absData;
        }

        // Noise gate to suppress background hiss.
        if (maxAmplitude < 0.015) {
          silenceCount++;
          // Send fewer packets during silence.
          if (silenceCount > 5) {
            if (silenceCount % 12 !== 0) return;
          }
        } else {
          silenceCount = 0;
        }

        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          let s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        const bytes = new Uint8Array(pcm16.buffer);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Data = btoa(binary);

        try {
          this.liveSession.sendRealtimeInput({
            audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
          });
        } catch (err) {
          console.error("Error sending realtime input:", err);
        }
      };

      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      const currentDateTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      const memoryContext = memoryService.getSystemInstructionFragment();
      const memorySummary = history.length > 0 
        ? `\n\nPREVIOUS CONVERSATION CONTEXT (MANOHAR'S CHART):\n${history.slice(-20).map(m => `${m.sender.toUpperCase()}: ${m.text}`).join('\n')}\nRecall previous context if Manohar asks.`
        : "";

      const dynamicInstruction = `${systemInstruction}\nCurrent Date and Time (IST): ${currentDateTime}${memoryContext}${memorySummary}\n\nSpeak with natural prosody. If Manohar asks you to remember something, call 'rememberFact'.`;

      const sessionPromise = this.ai.live.connect({
        model: "gemini-2.0-flash-exp",
        config: {
          generationConfig: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
            },
          },
          systemInstruction: dynamicInstruction,
          tools: [
            { googleSearchRetrieval: {} },
            {
              functionDeclarations: [
                {
                  name: "executeBrowserAction",
                  description: "Open a website or app explicitly requested.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      actionType: { type: Type.STRING },
                      query: { type: Type.STRING },
                      target: { type: Type.STRING }
                    },
                    required: ["actionType", "query"]
                  }
                },
                {
                  name: "navigatePage",
                  description: "Control browser navigation.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      action: { type: Type.STRING }
                    },
                    required: ["action"]
                  }
                },
                {
                  name: "rememberFact",
                  description: "Remember a fact.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      fact: { type: Type.STRING }
                    },
                    required: ["fact"]
                  }
                }
              ]
            }
          ]
        },
        callbacks: {
          onopen: () => {
            console.log("Live API Connected");
            this.reconnectAttempts = 0;
            this.onStateChange("listening");
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              this.playAudioChunk(base64Audio);
            }

            if (message.serverContent?.interrupted) {
              this.stopPlayback(true);
              this.onStateChange("listening");
            }

            const modelText = message.serverContent?.modelTurn?.parts?.[0]?.text;
            if (modelText) {
               this.onMessage("zoro", modelText);
            }

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
                  } else {
                    url = `https://www.google.com/search?q=${encodeURIComponent(args.query)}`;
                  }
                  this.onCommand(url);
                  this.liveSession?.sendToolResponse({
                    functionResponses: [{
                      name: call.name,
                      id: call.id,
                      response: { result: "Action executed." }
                    }]
                  });
                } else if (call.name === "rememberFact") {
                  memoryService.addFact((call.args as any).fact);
                  this.liveSession?.sendToolResponse({
                    functionResponses: [{
                      name: call.name,
                      id: call.id,
                      response: { result: "Fact remembered." }
                    }]
                  });
                } else if (call.name === "navigatePage") {
                   this.liveSession?.sendToolResponse({
                    functionResponses: [{
                      name: call.name,
                      id: call.id,
                      response: { result: "Navigation processed locally." }
                    }]
                  });
                }
              }
            }
          },
          onclose: () => {
            if (!this.isTerminated && this.reconnectAttempts < this.maxReconnectAttempts) {
              this.attemptReconnect(history);
            }
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            if (!this.isTerminated && this.reconnectAttempts < this.maxReconnectAttempts) {
              this.attemptReconnect(history);
            }
          }
        }
      });

      this.liveSession = await sessionPromise;
      this.sessionPromise = sessionPromise;

    } catch (error) {
      console.error("Failed to start Live Session:", error);
      this.stop();
    }
  }

  private async attemptReconnect(history: any) {
    if (this.isTerminated) return;
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
    console.log(`Reconnecting attempt ${this.reconnectAttempts} in ${delay}ms...`);
    this.stopPlayback();
    if (this.sessionPromise) {
      this.sessionPromise.then(s => s.close()).catch(() => {});
      this.sessionPromise = null;
    }
    setTimeout(() => this.initSession(history), delay);
  }

  private playAudioChunk(base64Data: string) {
    if (!this.playbackContext) return;

    if (this.isMuted) {
      this.isPlaying = true;
      if ((this as any).muteTimeout) clearTimeout((this as any).muteTimeout);
      (this as any).muteTimeout = setTimeout(() => {
        this.isPlaying = false;
        if (this.audioContext) this.onStateChange("listening");
      }, 1000);
      return;
    }
    
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
      // Increased buffer slightly for better stability on varied networks
      if (this.nextPlayTime < currentTime) {
        this.nextPlayTime = currentTime + 0.05;
      }
      
      source.start(this.nextPlayTime);
      this.nextPlayTime += audioBuffer.duration;
      if (!this.isPlaying) {
        this.onStateChange("speaking");
      }
      this.isPlaying = true;
      this.activeChunks++;
      
      source.onended = () => {
        this.activeChunks--;
        if (this.activeChunks <= 0) {
          this.activeChunks = 0;
          
          // Add a significant grace period after speaking before we start listening again
          // to avoid catching our own echo, room reverb, or the tail end of speaker sound.
          // 800ms is a safe value for most speakers and environments.
          setTimeout(() => {
            if (this.activeChunks === 0 && !this.isTerminated) {
              this.isPlaying = false;
              this.onStateChange("listening");
            }
          }, 800);
        }
      };
    } catch (e) {
      console.error("Error playing chunk", e);
    }
  }

  private stopPlayback(recreate: boolean = true) {
    if (this.playbackContext) {
      try {
        this.playbackContext.close().catch(() => {});
      } catch (e) {}

      if (recreate) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        this.playbackContext = new AudioContextClass({ sampleRate: 24000 });
        this.nextPlayTime = this.playbackContext.currentTime;
      } else {
        this.playbackContext = null;
      }
      this.isPlaying = false;
    }
  }

  stop() {
    this.isTerminated = true;
    // Clear any pending timeouts
    if ((this as any).muteTimeout) {
      clearTimeout((this as any).muteTimeout);
      (this as any).muteTimeout = null;
    }

    // Stop processing queue
    this.messageQueue = [];
    this.isProcessingQueue = false;

    // Disconnect and cleanup microphone processing
    if (this.processor) {
      try {
        this.processor.disconnect();
      } catch (e) {}
      this.processor.onaudioprocess = null;
      this.processor = null;
    }
    if (this.source) {
      try {
        this.source.disconnect();
      } catch (e) {}
      this.source = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => {
        try {
          t.stop();
          t.enabled = false;
        } catch (e) {}
      });
      this.mediaStream = null;
    }
    
    // Close audio contexts permanently for this instance
    if (this.audioContext) {
      try {
        this.audioContext.close().catch(() => {});
      } catch (e) {}
      this.audioContext = null;
    }
    
    this.stopPlayback(false);
    
    if (this.sessionPromise) {
      const promise = this.sessionPromise;
      this.sessionPromise = null; // Clear first to stop further sends
      this.liveSession = null;
      promise.then(session => {
        try {
          session.close();
        } catch (e) {}
      }).catch(() => {});
    }
    
    this.onStateChange("idle");
  }

  sendText(text: string) {
    this.messageQueue.push(text);
    this.processQueue();
  }

  private async processQueue() {
    if (this.isProcessingQueue || this.messageQueue.length === 0) return;
    
    this.isProcessingQueue = true;
    
    while (this.messageQueue.length > 0) {
      const text = this.messageQueue.shift();
      if (text && this.sessionPromise) {
        try {
          const session = await this.sessionPromise;
          session.sendRealtimeInput({ text });
          
          // Wait for a small "cooldown" or until Zoro starts speaking/processing 
          // to ensure sequence stability with the backend.
          await new Promise(resolve => setTimeout(resolve, 800));
        } catch (err) {
          console.error("Error in queue processing:", err);
        }
      }
    }
    
    this.isProcessingQueue = false;
  }
}
