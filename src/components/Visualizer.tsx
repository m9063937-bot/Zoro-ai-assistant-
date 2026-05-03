import { motion } from "motion/react";

type VisualizerState = "idle" | "listening" | "processing" | "speaking";

interface VisualizerProps {
  state: VisualizerState;
}

export default function Visualizer({ state }: VisualizerProps) {
  // Use CSS animations for simple continuous rotation to save JS cycles
  const getRotationClass = (reverse: boolean = false) => {
    if (state === "idle") return "";
    return reverse ? "animate-spin-slow-reverse" : "animate-spin-slow";
  };

  const getPulseAnimation = () => {
    if (state === "speaking") {
      return {
        scale: [1, 1.03, 0.99, 1.01, 1],
        opacity: [0.9, 1, 0.9, 1, 0.9],
        transition: { duration: 0.6, repeat: Infinity, ease: "easeInOut" }
      };
    }
    if (state === "listening") {
      return {
        scale: [1, 1.01, 1],
        opacity: [0.8, 1, 0.8],
        transition: { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
      };
    }
    return {
      scale: [1, 1.005, 1],
      opacity: [0.5, 0.6, 0.5],
      transition: { duration: 5, repeat: Infinity, ease: "easeInOut" }
    };
  };

  const getTheme = () => {
    switch (state) {
      case "listening": return { color: "rgba(139, 92, 246, 1)", glow: "shadow-violet-500/60", border: "border-violet-400" };
      case "processing": return { color: "rgba(56, 189, 248, 1)", glow: "shadow-sky-400/80", border: "border-sky-400" };
      case "speaking": return { color: "rgba(236, 72, 153, 1)", glow: "shadow-pink-500/80", border: "border-pink-400" };
      default: return { color: "rgba(6, 182, 212, 0.8)", glow: "shadow-cyan-500/40", border: "border-cyan-500/50" }; 
    }
  };

  const theme = getTheme();

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none will-change-transform">
      {/* Ambient Glow - Simplified */}
      <motion.div
        animate={getPulseAnimation()}
        className={`absolute w-[50%] h-[50%] rounded-full blur-[40px] ${theme.glow} will-change-[transform,opacity]`}
        style={{ backgroundColor: theme.color, opacity: 0.1 }}
      />

      {/* Reduced Rings for Performance */}
      {/* Outer Ring */}
      <div
        className={`absolute w-[90%] h-[90%] rounded-full border-[1px] border-dashed ${theme.border} opacity-10 ${getRotationClass(false)} will-change-transform`}
      />

      {/* Middle Ring */}
      <div
        className={`absolute w-[70%] h-[70%] rounded-full border-[1px] ${theme.border} border-t-transparent border-b-transparent opacity-20 ${getRotationClass(true)} will-change-transform`}
      />

      {/* Inner Ring */}
      <div
        className={`absolute w-[45%] h-[45%] rounded-full border-[1.5px] border-dotted ${theme.border} opacity-40 ${getRotationClass(false)} will-change-transform`}
      />

      {/* Core Circle */}
      <motion.div
        animate={getPulseAnimation()}
        className={`absolute w-[25%] h-[25%] rounded-full border-[1px] ${theme.border} bg-[#080808] flex items-center justify-center shadow-2xl will-change-[transform,opacity]`}
        style={{ boxShadow: `0 0 20px ${theme.color}, inset 0 0 10px ${theme.color}` }}
      >
        {/* Center Text */}
        <div 
          className="font-bold tracking-[0.3em] text-xl md:text-2xl lg:text-3xl text-white"
          style={{ textShadow: `0 0 10px ${theme.color}` }}
        >
          ZORO
        </div>
      </motion.div>
    </div>
  );
}
