import { useState } from "react";
import { Sparkles } from "lucide-react";

interface LogoBadgeProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function LogoBadge({ size = "md", className = "" }: LogoBadgeProps) {
  const [hasError, setHasError] = useState(false);

  const sizeClasses = {
    sm: "h-7 w-7",
    md: "h-9 w-9",
    lg: "h-12 w-12",
  };

  const iconSizes = {
    sm: "h-3.5 w-3.5",
    md: "h-4 w-4",
    lg: "h-6 w-6",
  };

  // If user puts logo.png in frontend/public/logo.png, this will load it cleanly.
  // If it's missing or fails, it gracefully falls back to the default RESIN gradient badge.
  if (!hasError) {
    return (
      <img
        src="/logo.png"
        alt="RESIN Logo"
        onError={() => setHasError(true)}
        className={`${sizeClasses[size]} rounded-md object-contain shadow-ink group-hover:scale-105 transition-smooth ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded-md bg-gradient-ink flex items-center justify-center shadow-ink group-hover:scale-105 transition-smooth ${className}`}
    >
      <Sparkles className={`${iconSizes[size]} text-paper`} />
    </div>
  );
}
