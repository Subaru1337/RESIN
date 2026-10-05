import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { useEffect, useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const DEFAULT_PHRASES = [
  "Thinking",
  "Reading the context",
  "Connecting details",
  "Forming a response",
];

const CASCADE_STAGGER = 0.025;
const SPRING_SWAP = { type: "spring", stiffness: 350, damping: 25 } as const;
const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export type ReasoningTextVariant = "cascade" | "swap";

export interface ReasoningTextProps {
  /** Phrases cycled through while the agent works. */
  phrases?: string[];
  /** Animation used when the active phrase changes. */
  variant?: ReasoningTextVariant;
  /** Milliseconds each phrase remains visible. */
  interval?: number;
  /** Optional leading visual. Defaults to a terminal ASCII spinner. */
  indicator?: ReactNode;
  className?: string;
}

type PhraseProps = {
  phrase: string;
  reduce: boolean;
};

const charVariants: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { ...SPRING_SWAP, delay },
  }),
  exit: (delay: number) => ({
    opacity: 0,
    y: -6,
    transition: {
      duration: 0.14,
      ease: EASE_OUT,
      delay: delay * 0.4,
    },
  }),
};

const swapVariants: Variants = {
  initial: (reduce: boolean) => (reduce ? { opacity: 0 } : { opacity: 0, y: 4 }),
  animate: (reduce: boolean) => (reduce ? { opacity: 1 } : { opacity: 1, y: 0 }),
  exit: (reduce: boolean) => (reduce ? { opacity: 0 } : { opacity: 0, y: -4 }),
};

function AsciiSpinner({ className }: { className?: string }) {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % frames.length);
    }, 80);
    return () => clearInterval(timer);
  }, [frames.length]);

  return (
    <span className={cn("font-mono text-primary font-bold select-none text-sm leading-none", className)}>
      {frames[frame]}
    </span>
  );
}

function CascadePhrase({ phrase, reduce }: PhraseProps) {
  const text = `${phrase}…`;

  if (reduce) {
    return (
      <span className="col-start-1 row-start-1 inline-block whitespace-pre text-foreground font-medium text-xs">
        {text}
      </span>
    );
  }

  return (
    <AnimatePresence initial={false} mode="wait">
      <motion.span
        key={phrase}
        className="col-start-1 row-start-1 inline-flex items-center whitespace-pre font-medium text-foreground dark:text-neutral-200 text-xs animate-resin-pulse"
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {text.split("").map((character, characterIndex) => (
          <motion.span
            key={`char-${characterIndex}-${character}`}
            custom={characterIndex * CASCADE_STAGGER}
            variants={charVariants}
            className="inline-block whitespace-pre will-change-[opacity,transform]"
          >
            {character}
          </motion.span>
        ))}
      </motion.span>
    </AnimatePresence>
  );
}

function SwapPhrase({ phrase, reduce }: PhraseProps) {
  return (
    <AnimatePresence initial={false} mode="wait">
      <motion.span
        key={phrase}
        custom={reduce}
        variants={swapVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{
          duration: reduce ? 0.12 : 0.2,
          ease: EASE_OUT,
        }}
        className="col-start-1 row-start-1 inline-block whitespace-nowrap text-foreground dark:text-neutral-200 font-medium text-xs will-change-[opacity,transform] animate-resin-pulse"
      >
        {phrase}…
      </motion.span>
    </AnimatePresence>
  );
}

export function ReasoningText({
  phrases = DEFAULT_PHRASES,
  variant = "cascade",
  interval = 1900,
  indicator,
  className,
}: ReasoningTextProps) {
  const reduce = useReducedMotion() ?? false;
  const [index, setIndex] = useState(0);
  const statusId = useId();
  const safePhrases = phrases.length > 0 ? phrases : DEFAULT_PHRASES;
  const phrase = safePhrases[index % safePhrases.length];
  const longestPhrase = safePhrases.reduce((longest, current) =>
    current.length > longest.length ? current : longest
  );
  const phraseProps = { phrase, reduce };

  useEffect(() => {
    if (safePhrases.length < 2) return;

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % safePhrases.length);
    }, Math.max(600, interval));

    return () => window.clearInterval(timer);
  }, [interval, safePhrases.length]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-labelledby={statusId}
      className={cn(
        "inline-flex items-center gap-2.5 text-xs select-none",
        className
      )}
    >
      <div
        aria-hidden="true"
        className="inline-flex size-4 shrink-0 items-center justify-center"
      >
        {indicator ?? <AsciiSpinner />}
      </div>

      <div aria-hidden="true" className="inline-grid items-center overflow-visible text-left">
        <span className="invisible col-start-1 row-start-1 whitespace-nowrap text-xs font-medium">
          {longestPhrase}…
        </span>
        {variant === "cascade" ? (
          <CascadePhrase {...phraseProps} />
        ) : (
          <SwapPhrase {...phraseProps} />
        )}
      </div>

      <span id={statusId} className="sr-only">
        {phrase}
      </span>
    </div>
  );
}

export default ReasoningText;
