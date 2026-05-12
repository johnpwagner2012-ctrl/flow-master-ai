import {
  Webhook, Globe, GitBranch, Timer, Sparkles, Clock,
  Mic, Captions, Video, Youtube, Save, ImageIcon, Film,
  Wand2, Combine, Download,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NodeKind =
  | "cron_trigger"
  | "webhook_trigger"
  | "ai_script"
  | "text_to_speech"
  | "subtitle_generator"
  | "image_generator"
  | "video_assembler"
  | "ffmpeg_processor"
  | "http_request"
  | "condition"
  | "delay"
  | "youtube_upload"
  | "save_asset"
  | "asset_transform"
  | "asset_merge"
  | "asset_export";

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
  /** Where this node executes. server = engine handler. browser = paused for client executor. */
  executor: "server" | "browser";
  /** Default provider id (lookup in the provider abstraction layer). */
  provider?: string;
  /** Whether this node can run from a cron trigger (false = browser-only). */
  cronCompatible?: boolean;
};

export const NODE_REGISTRY: Record<NodeKind, NodeDef> = {
  cron_trigger: {
    kind: "cron_trigger", label: "Cron Trigger", category: "Trigger", icon: Clock, hue: 80,
    executor: "server", cronCompatible: true,
    description: "Runs on a schedule.",
    fields: [{ key: "expression", label: "Cron expression", type: "text", placeholder: "0 9 * * *", default: "0 9 * * *" }],
  },
  webhook_trigger: {
    kind: "webhook_trigger", label: "Webhook", category: "Trigger", icon: Webhook, hue: 80,
    executor: "server", cronCompatible: true,
    description: "Listens for inbound HTTP calls.",
    fields: [{ key: "path", label: "Path", type: "text", placeholder: "/incoming", default: "/incoming" }],
  },
  ai_script: {
    kind: "ai_script", label: "AI Script Generator", category: "AI", icon: Sparkles, hue: 305,
    executor: "server", cronCompatible: true, provider: "lovable_ai",
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
  text_to_speech: {
    kind: "text_to_speech", label: "Text to Speech", category: "Media", icon: Mic, hue: 200,
    executor: "browser", cronCompatible: false, provider: "browser_speech",
    description: "Generates speech from script text using the Web Speech API in the browser. Free, no API key.",
    fields: [
      { key: "voice", label: "Voice (browser default)", type: "text", placeholder: "default", default: "default" },
      { key: "rate", label: "Rate (0.5–2)", type: "number", default: 1 },
      { key: "source_field", label: "Upstream field", type: "text", default: "text" },
    ],
  },
  subtitle_generator: {
    kind: "subtitle_generator", label: "Subtitle Generator", category: "Media", icon: Captions, hue: 200,
    executor: "server", cronCompatible: true, provider: "text_timing",
    description: "Builds an SRT + JSON subtitle timeline from script text and an estimated duration.",
    fields: [
      { key: "format", label: "Format", type: "select",
        options: [{ label: "SRT", value: "srt" }, { label: "VTT", value: "vtt" }], default: "srt" },
      { key: "wpm", label: "Words per minute", type: "number", default: 150 },
      { key: "max_chars_per_line", label: "Max chars / line", type: "number", default: 38 },
      { key: "source_field", label: "Upstream field", type: "text", default: "text" },
    ],
  },
  image_generator: {
    kind: "image_generator", label: "Image Generator", category: "AI", icon: ImageIcon, hue: 305,
    executor: "server", cronCompatible: true, provider: "lovable_ai_image",
    description: "Generate images via the Lovable AI Gateway (Gemini image). Free with the gateway.",
    fields: [
      { key: "prompt", label: "Prompt", type: "textarea", placeholder: "A cinematic vertical shot of …" },
      { key: "model", label: "Model", type: "select",
        options: [
          { label: "Gemini 2.5 Flash Image", value: "google/gemini-2.5-flash-image" },
          { label: "Gemini 3 Flash Image", value: "google/gemini-3.1-flash-image-preview" },
          { label: "Gemini 3 Pro Image (slow, higher quality)", value: "google/gemini-3-pro-image-preview" },
        ], default: "google/gemini-2.5-flash-image" },
    ],
  },
  video_assembler: {
    kind: "video_assembler", label: "Video Assembler", category: "Media", icon: Video, hue: 200,
    executor: "browser", cronCompatible: false, provider: "ffmpeg_wasm",
    description: "Combines images, audio, and subtitles into a vertical 9:16 MP4 using ffmpeg.wasm in the browser.",
    fields: [
      { key: "resolution", label: "Resolution", type: "select",
        options: [
          { label: "Vertical 1080×1920", value: "vertical" },
          { label: "Square 1080×1080", value: "square" },
          { label: "Landscape 1920×1080", value: "landscape" },
        ], default: "vertical" },
      { key: "fps", label: "FPS", type: "number", default: 30 },
      { key: "burn_subtitles", label: "Burn subtitles", type: "select",
        options: [{ label: "Yes", value: "true" }, { label: "No", value: "false" }], default: "true" },
    ],
  },
  ffmpeg_processor: {
    kind: "ffmpeg_processor", label: "FFmpeg Processor", category: "Media", icon: Film, hue: 200,
    executor: "browser", cronCompatible: false, provider: "ffmpeg_wasm",
    description: "Run an ffmpeg.wasm operation (crop, compress, thumbnail, mix audio) on an upstream asset.",
    fields: [
      { key: "operation", label: "Operation", type: "select",
        options: [
          { label: "Compress", value: "compress" },
          { label: "Extract thumbnail", value: "thumbnail" },
          { label: "Crop to vertical 9:16", value: "crop_vertical" },
          { label: "Mix audio over video", value: "mix_audio" },
        ], default: "compress" },
      { key: "source_field", label: "Source field", type: "text", default: "url" },
    ],
  },
  http_request: {
    kind: "http_request", label: "HTTP Request", category: "Network", icon: Globe, hue: 240,
    executor: "server", cronCompatible: true,
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
    executor: "server", cronCompatible: true,
    description: "Branch based on an expression.",
    fields: [{ key: "expression", label: "Expression", type: "text", placeholder: "input.status === 'ok'" }],
  },
  delay: {
    kind: "delay", label: "Delay", category: "Logic", icon: Timer, hue: 60,
    executor: "server", cronCompatible: true,
    description: "Pause for a duration.",
    fields: [{ key: "ms", label: "Milliseconds", type: "number", default: 1000 }],
  },
  youtube_upload: {
    kind: "youtube_upload", label: "YouTube Upload", category: "Integration", icon: Youtube, hue: 25,
    executor: "server", cronCompatible: true, provider: "youtube_oauth",
    description: "Publish a video to YouTube.",
    fields: [
      { key: "title", label: "Title", type: "text", placeholder: "My video" },
      { key: "description", label: "Description", type: "textarea" },
      { key: "privacy", label: "Privacy", type: "select",
        options: [{ label: "Public", value: "public" }, { label: "Unlisted", value: "unlisted" }, { label: "Private", value: "private" }], default: "private" },
      { key: "source_field", label: "Video URL field", type: "text", default: "url" },
    ],
  },
  save_asset: {
    kind: "save_asset", label: "Save Asset", category: "Integration", icon: Save, hue: 140,
    executor: "server", cronCompatible: true,
    description: "Persist the upstream node output as an asset in your library.",
    fields: [
      { key: "asset_type", label: "Asset type", type: "select",
        options: [
          { label: "Script (text)", value: "script" },
          { label: "Audio", value: "audio" },
          { label: "Video", value: "video" },
          { label: "Image", value: "image" },
          { label: "Subtitles", value: "subtitles" },
        ], default: "script" },
      { key: "name", label: "Name (optional)", type: "text", placeholder: "My generated script" },
      { key: "source", label: "Source field", type: "text", placeholder: "text", default: "text" },
    ],
  },
  asset_transform: {
    kind: "asset_transform", label: "Asset Transform", category: "Media", icon: Wand2, hue: 200,
    executor: "server", cronCompatible: true,
    description: "Run a JSON transformation on the upstream asset metadata before passing it on.",
    fields: [
      { key: "expression", label: "Expression (JS, returns object)", type: "textarea",
        placeholder: "({ ...input, name: input.name?.toUpperCase() })" },
    ],
  },
  asset_merge: {
    kind: "asset_merge", label: "Asset Merge", category: "Media", icon: Combine, hue: 200,
    executor: "server", cronCompatible: true,
    description: "Combine all upstream node outputs into a single object keyed by node.",
    fields: [],
  },
  asset_export: {
    kind: "asset_export", label: "Asset Export", category: "Integration", icon: Download, hue: 140,
    executor: "server", cronCompatible: true,
    description: "Export the upstream payload as JSON to your library for download.",
    fields: [
      { key: "name", label: "Export name", type: "text", placeholder: "export.json" },
    ],
  },
};

export const NODE_LIST = Object.values(NODE_REGISTRY);

// ============ Provider abstraction layer ============
// Each node kind can resolve to one of N providers. Engine picks based on availability.
export type ProviderInfo = { id: string; label: string; free: boolean; requiresKey?: string };

export const PROVIDERS: Record<string, ProviderInfo> = {
  // Text generation
  lovable_ai: { id: "lovable_ai", label: "Lovable AI Gateway", free: true },
  // Image
  lovable_ai_image: { id: "lovable_ai_image", label: "Lovable AI (Gemini Image)", free: true },
  // TTS
  browser_speech: { id: "browser_speech", label: "Web Speech API (browser)", free: true },
  elevenlabs: { id: "elevenlabs", label: "ElevenLabs", free: false, requiresKey: "ELEVENLABS_API_KEY" },
  // Subtitles
  text_timing: { id: "text_timing", label: "Text-timing (server)", free: true },
  // Video / FFmpeg
  ffmpeg_wasm: { id: "ffmpeg_wasm", label: "ffmpeg.wasm (browser)", free: true },
  shotstack: { id: "shotstack", label: "Shotstack API", free: false, requiresKey: "SHOTSTACK_API_KEY" },
  // YouTube
  youtube_oauth: { id: "youtube_oauth", label: "YouTube Data API (OAuth)", free: true },
};
