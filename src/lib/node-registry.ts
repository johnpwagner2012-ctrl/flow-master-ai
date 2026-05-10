import { Webhook, Globe, GitBranch, Timer, Sparkles, Clock, Mic, Captions, Video, Youtube } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NodeKind =
  | "cron_trigger"
  | "webhook_trigger"
  | "ai_script"
  | "tts"
  | "subtitles"
  | "video_render"
  | "http_request"
  | "condition"
  | "delay"
  | "youtube_upload";

export type NodeField =
  | { key: string; label: string; type: "text" | "textarea" | "number" | "url"; placeholder?: string; default?: string | number }
  | { key: string; label: string; type: "select"; options: { label: string; value: string }[]; default?: string };

export type NodeDef = {
  kind: NodeKind;
  label: string;
  category: "Trigger" | "AI" | "Media" | "Logic" | "Network" | "Integration";
  icon: LucideIcon;
  description: string;
  /** Hue in oklch for the node accent */
  hue: number;
  fields: NodeField[];
};

export const NODE_REGISTRY: Record<NodeKind, NodeDef> = {
  cron_trigger: {
    kind: "cron_trigger", label: "Cron Trigger", category: "Trigger", icon: Clock, hue: 80,
    description: "Runs on a schedule.",
    fields: [{ key: "expression", label: "Cron expression", type: "text", placeholder: "0 9 * * *", default: "0 9 * * *" }],
  },
  webhook_trigger: {
    kind: "webhook_trigger", label: "Webhook", category: "Trigger", icon: Webhook, hue: 80,
    description: "Listens for inbound HTTP calls.",
    fields: [{ key: "path", label: "Path", type: "text", placeholder: "/incoming", default: "/incoming" }],
  },
  ai_script: {
    kind: "ai_script", label: "AI Script Generator", category: "AI", icon: Sparkles, hue: 305,
    description: "Generate text using an LLM.",
    fields: [
      { key: "model", label: "Model", type: "select",
        options: [
          { label: "Gemini 2.5 Flash", value: "google/gemini-2.5-flash" },
          { label: "Gemini 2.5 Pro", value: "google/gemini-2.5-pro" },
          { label: "GPT-5 Mini", value: "openai/gpt-5-mini" },
        ], default: "google/gemini-2.5-flash" },
      { key: "prompt", label: "Prompt", type: "textarea", placeholder: "Write a 60-second YouTube short about…" },
    ],
  },
  tts: {
    kind: "tts", label: "Text to Speech", category: "Media", icon: Mic, hue: 200,
    description: "Convert text into spoken audio.",
    fields: [
      { key: "voice", label: "Voice", type: "text", placeholder: "alloy", default: "alloy" },
      { key: "text", label: "Text source", type: "text", placeholder: "{{ai_script.output}}" },
    ],
  },
  subtitles: {
    kind: "subtitles", label: "Subtitles", category: "Media", icon: Captions, hue: 200,
    description: "Generate subtitles from audio or text.",
    fields: [{ key: "format", label: "Format", type: "select",
      options: [{ label: "SRT", value: "srt" }, { label: "VTT", value: "vtt" }], default: "srt" }],
  },
  video_render: {
    kind: "video_render", label: "Video Renderer", category: "Media", icon: Video, hue: 200,
    description: "Render the final video.",
    fields: [
      { key: "resolution", label: "Resolution", type: "select",
        options: [{ label: "1080p", value: "1080p" }, { label: "720p", value: "720p" }, { label: "Vertical 1080x1920", value: "vertical" }], default: "vertical" },
    ],
  },
  http_request: {
    kind: "http_request", label: "HTTP Request", category: "Network", icon: Globe, hue: 240,
    description: "Call any HTTP endpoint.",
    fields: [
      { key: "method", label: "Method", type: "select",
        options: ["GET", "POST", "PUT", "DELETE", "PATCH"].map(m => ({ label: m, value: m })), default: "GET" },
      { key: "url", label: "URL", type: "url", placeholder: "https://api.example.com/v1/items" },
      { key: "body", label: "Body (JSON)", type: "textarea", placeholder: "{}" },
    ],
  },
  condition: {
    kind: "condition", label: "Condition", category: "Logic", icon: GitBranch, hue: 60,
    description: "Branch based on an expression.",
    fields: [{ key: "expression", label: "Expression", type: "text", placeholder: "input.status === 'ok'" }],
  },
  delay: {
    kind: "delay", label: "Delay", category: "Logic", icon: Timer, hue: 60,
    description: "Pause for a duration.",
    fields: [{ key: "ms", label: "Milliseconds", type: "number", default: 1000 }],
  },
  youtube_upload: {
    kind: "youtube_upload", label: "YouTube Upload", category: "Integration", icon: Youtube, hue: 25,
    description: "Publish a video to YouTube.",
    fields: [
      { key: "title", label: "Title", type: "text", placeholder: "My video" },
      { key: "description", label: "Description", type: "textarea" },
      { key: "privacy", label: "Privacy", type: "select",
        options: [{ label: "Public", value: "public" }, { label: "Unlisted", value: "unlisted" }, { label: "Private", value: "private" }], default: "private" },
    ],
  },
};

export const NODE_LIST = Object.values(NODE_REGISTRY);
