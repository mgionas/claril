import type { AiProvider } from "@claril/ai-advisor";
import { cn } from "@/lib/utils";

/**
 * Crisp monochrome brand marks for the supported AI providers, drawn with
 * `currentColor` so they inherit the surrounding text color and size via
 * `className` (default `size-4`). Inline SVG — no icon dependency. Glyphs are
 * simplified single-color renditions suitable at small UI sizes.
 */

type IconProps = { className?: string };

function AnthropicMark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={cn("size-4", className)}>
      <path d="M14.6 4h-3.02l5.5 16h3.02L14.6 4Zm-6.18 0L2.9 20h3.08l1.12-3.3h5.78L11.76 20h3.08L9.32 4H8.42Zm-.3 9.86 1.93-5.62 1.92 5.62H8.12Z" />
    </svg>
  );
}

function OpenAiMark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={cn("size-4", className)}>
      <path d="M21.55 10.04a5.42 5.42 0 0 0-.47-4.45 5.5 5.5 0 0 0-5.92-2.64A5.46 5.46 0 0 0 11.04 1a5.5 5.5 0 0 0-5.25 3.81 5.43 5.43 0 0 0-3.63 2.63 5.5 5.5 0 0 0 .68 6.45 5.42 5.42 0 0 0 .47 4.45 5.5 5.5 0 0 0 5.92 2.64A5.45 5.45 0 0 0 12.96 23a5.5 5.5 0 0 0 5.25-3.82 5.43 5.43 0 0 0 3.63-2.63 5.5 5.5 0 0 0-.69-6.5l.01-.01ZM12.96 21.4a4.07 4.07 0 0 1-2.62-.95l.13-.07 4.36-2.52a.71.71 0 0 0 .36-.62v-6.15l1.84 1.07.02.04v5.09a4.1 4.1 0 0 1-4.09 4.1v.01ZM4.16 17.64a4.08 4.08 0 0 1-.49-2.75l.13.08 4.36 2.52a.71.71 0 0 0 .72 0l5.33-3.08v2.13a.07.07 0 0 1-.03.06l-4.41 2.55a4.1 4.1 0 0 1-5.6-1.5l-.01-.01ZM3.02 8.2a4.08 4.08 0 0 1 2.13-1.8v5.18a.7.7 0 0 0 .35.61l5.31 3.07-1.85 1.06a.07.07 0 0 1-.06 0L4.5 13.78a4.1 4.1 0 0 1-1.5-5.59l.02.01Zm15.14 3.52-5.33-3.1L14.81 7.6a.07.07 0 0 1 .06 0l4.41 2.55a4.1 4.1 0 0 1-.62 7.39v-5.18a.71.71 0 0 0-.5-.65v.01Zm1.83-2.76-.13-.08-4.35-2.53a.71.71 0 0 0-.72 0L9.46 9.43V7.3a.07.07 0 0 1 .03-.06l4.41-2.55a4.1 4.1 0 0 1 6.09 4.25l.01.02ZM8.46 12.75 6.6 11.69a.07.07 0 0 1-.03-.05V6.55a4.1 4.1 0 0 1 6.72-3.15l-.13.07L8.8 5.99a.71.71 0 0 0-.36.62l.02 6.14ZM9.46 10.6 11.84 9.23l2.38 1.37v2.74L11.84 14.7l-2.38-1.37V10.6Z" />
    </svg>
  );
}

function GoogleMark({ className }: IconProps) {
  // Gemini "spark" mark.
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={cn("size-4", className)}>
      <path
        d="M12 2c.4 4.55 1.3 7.06 3.17 8.83C17.04 12.7 19.55 13.6 24 14c-4.45.4-6.96 1.3-8.83 3.17C13.3 19.04 12.4 21.55 12 26c-.4-4.45-1.3-6.96-3.17-8.83C6.96 15.3 4.45 14.4 0 14c4.45-.4 6.96-1.3 8.83-3.17C10.7 9.06 11.6 6.55 12 2Z"
        transform="translate(0 -2)"
      />
    </svg>
  );
}

function MistralMark({ className }: IconProps) {
  // Stylized stepped "M" tiles, flattened to a single color.
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={cn("size-4", className)}>
      <path d="M2 4h4v4H2V4Zm16 0h4v4h-4V4ZM6 8h4v4H6V8Zm8 0h4v4h-4V8Zm-4 4h4v4h-4v-4ZM2 12h4v4H2v-4Zm16 0h4v4h-4v-4ZM2 16h4v4H2v-4Zm16 0h4v4h-4v-4Z" />
    </svg>
  );
}

function OllamaMark({ className }: IconProps) {
  // Simplified llama silhouette.
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("size-4", className)}
    >
      <path d="M7 3v3M17 3v3" />
      <path d="M7 6c-2 1-3 3-3 6v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6c0-3-1-5-3-6" />
      <path d="M9 21v-3a3 3 0 0 1 6 0v3" />
      <circle cx="9" cy="11" r=".6" fill="currentColor" stroke="none" />
      <circle cx="15" cy="11" r=".6" fill="currentColor" stroke="none" />
    </svg>
  );
}

const MARKS: Record<AiProvider, (p: IconProps) => React.ReactElement> = {
  anthropic: AnthropicMark,
  openai: OpenAiMark,
  google: GoogleMark,
  mistral: MistralMark,
  ollama: OllamaMark,
};

export function ProviderIcon({
  provider,
  className,
}: {
  provider: AiProvider;
  className?: string;
}) {
  const Mark = MARKS[provider] ?? AnthropicMark;
  return <Mark className={className} />;
}
