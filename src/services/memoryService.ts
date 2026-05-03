
interface UserMemory {
  name: string;
  preferences: string[];
  facts: string[];
  lastSessionDate: string;
  mood?: string;
}

const MEMORY_KEY = "zoro_memory";

export const memoryService = {
  getMemory(): UserMemory {
    const saved = localStorage.getItem(MEMORY_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse memory", e);
      }
    }
    return {
      name: "Manohar",
      preferences: [],
      facts: [],
      lastSessionDate: new Date().toISOString(),
    };
  },

  saveMemory(memory: Partial<UserMemory>) {
    const current = this.getMemory();
    const updated = { ...current, ...memory };
    localStorage.setItem(MEMORY_KEY, JSON.stringify(updated));
  },

  addFact(fact: string) {
    const memory = this.getMemory();
    if (!memory.facts.includes(fact)) {
      memory.facts.push(fact);
      this.saveMemory(memory);
    }
  },

  addPreference(pref: string) {
    const memory = this.getMemory();
    if (!memory.preferences.includes(pref)) {
      memory.preferences.push(pref);
      this.saveMemory(memory);
    }
  },

  updateMood(mood: string) {
    this.saveMemory({ mood });
  },

  async extractFactsFromConversation(text: string) {
    // This is a placeholder for a more complex extraction
    // For now, we'll just look for simple patterns if we wanted to be local
    // But better to have Zoro explicitly "remember" things or we use Gemini in the background
    // Since we're in the frontend, we'll keep it simple or use a lightweight regex for now
    // Actually, I'll just leave this as a place for Zoro to call via some 'learn' command if I add it.
  },

  getSystemInstructionFragment(): string {
    const memory = this.getMemory();
    let fragment = `\n\n[LONG-TERM MEMORY]:\n- User Name: ${memory.name}`;
    if (memory.facts.length > 0) {
      fragment += `\n- Known Facts: ${memory.facts.slice(-10).join(", ")}`;
    }
    if (memory.preferences.length > 0) {
      fragment += `\n- Preferences: ${memory.preferences.slice(-10).join(", ")}`;
    }
    if (memory.mood) {
      fragment += `\n- Recent Mood: ${memory.mood}`;
    }
    fragment += `\nUse this memory to make Manohar feel like you truly know him. Reference past facts naturally.`;
    return fragment;
  }
};
