import {
  Webhook, Globe, GitBranch, Timer, Sparkles, Clock,
  Mic, Captions, Video, Youtube, Save, ImageIcon, Film,
  Wand2, Combine, Download, Layers, Layout, Image as ImageIcon2, FileVideo,
  TrendingUp, ClipboardList, Type, Zap, MessageSquareText, Hash,
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
  | "asset_export"
  | "timeline_builder"
  | "media_overlay"
  | "thumbnail_generator"
  | "video_export"
  | "trend_fetcher"
  | "content_planner"
  | "title_generator"
  | "hook_generator"
  | "caption_generator"
  | "hashtag_generator";

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
  timeline_builder: {
    kind: "timeline_builder", label: "Timeline Builder", category: "Media", icon: Layout, hue: 200,
    executor: "server", cronCompatible: true, provider: "text_timing",
    description: "Compose a structured render timeline from upstream images, audio (with word timings), and subtitles.",
    fields: [
      { key: "scene_seconds", label: "Default seconds per scene", type: "number", default: 3 },
      { key: "resolution", label: "Resolution", type: "select",
        options: [
          { label: "Vertical 1080×1920", value: "vertical" },
          { label: "Square 1080×1080", value: "square" },
          { label: "Landscape 1920×1080", value: "landscape" },
        ], default: "vertical" },
      { key: "fps", label: "FPS", type: "number", default: 30 },
    ],
  },
  media_overlay: {
    kind: "media_overlay", label: "Media Overlay", category: "Media", icon: Layers, hue: 200,
    executor: "server", cronCompatible: true,
    description: "Attach a text or image overlay (logo, watermark, hook text) to the upstream timeline.",
    fields: [
      { key: "overlay_type", label: "Overlay type", type: "select",
        options: [
          { label: "Hook text (top)", value: "hook_text" },
          { label: "Watermark text (bottom-right)", value: "watermark" },
          { label: "Image (top-left logo)", value: "image" },
        ], default: "hook_text" },
      { key: "text", label: "Text (for text overlays)", type: "text", placeholder: "Wait for it…" },
      { key: "image_field", label: "Upstream field for image URL", type: "text", default: "url" },
    ],
  },
  thumbnail_generator: {
    kind: "thumbnail_generator", label: "Thumbnail Generator", category: "Media", icon: ImageIcon2, hue: 200,
    executor: "browser", cronCompatible: false, provider: "ffmpeg_wasm",
    description: "Extract a single high-quality JPG thumbnail from an upstream video at a chosen timestamp.",
    fields: [
      { key: "timestamp_seconds", label: "Timestamp (seconds)", type: "number", default: 1 },
      { key: "source_field", label: "Upstream video URL field", type: "text", default: "url" },
    ],
  },
  video_export: {
    kind: "video_export", label: "Video Export", category: "Media", icon: FileVideo, hue: 200,
    executor: "browser", cronCompatible: false, provider: "ffmpeg_wasm",
    description: "Render the final 9:16 MP4 from a Timeline Builder output: images + audio + burned bold-white subtitles. Auto-generates a thumbnail.",
    fields: [
      { key: "burn_subtitles", label: "Burn subtitles", type: "select",
        options: [{ label: "Yes", value: "true" }, { label: "No", value: "false" }], default: "true" },
      { key: "subtitle_style", label: "Subtitle style", type: "select",
        options: [
          { label: "Bold white + black stroke", value: "bold_stroke" },
          { label: "Karaoke word highlight", value: "karaoke" },
          { label: "Minimal caption bar", value: "minimal" },
        ], default: "bold_stroke" },
    ],
  },
  trend_fetcher: {
    kind: "trend_fetcher", label: "Trend Fetcher", category: "AI", icon: TrendingUp, hue: 305,
    executor: "server", cronCompatible: true, provider: "reddit_json",
    description: "Fetch trending posts from one or more subreddits (free, no API key). Persists results as a structured asset.",
    fields: [
      { key: "subreddits", label: "Subreddits (comma-separated)", type: "text", placeholder: "todayilearned,Damnthatsinteresting", default: "todayilearned" },
      { key: "time", label: "Time window", type: "select",
        options: [
          { label: "Hour", value: "hour" }, { label: "Day", value: "day" },
          { label: "Week", value: "week" }, { label: "Month", value: "month" },
        ], default: "day" },
      { key: "limit", label: "Top N per subreddit", type: "number", default: 10 },
    ],
  },
  content_planner: {
    kind: "content_planner", label: "Content Planner", category: "AI", icon: ClipboardList, hue: 305,
    executor: "server", cronCompatible: true, provider: "lovable_ai",
    description: "Turn raw trends/keywords into a structured short-form content plan (topic, angle, target audience, key beats).",
    fields: [
      { key: "template_slug", label: "Prompt template slug (optional)", type: "text", placeholder: "default" },
      { key: "model", label: "Model", type: "select",
        options: [
          { label: "Gemini 2.5 Flash", value: "google/gemini-2.5-flash" },
          { label: "Gemini 2.5 Pro", value: "google/gemini-2.5-pro" },
          { label: "GPT-5 Mini", value: "openai/gpt-5-mini" },
        ], default: "google/gemini-2.5-flash" },
      { key: "count", label: "Plan items", type: "number", default: 5 },
      { key: "niche", label: "Niche / brand voice", type: "text", placeholder: "Tech curiosities for Gen-Z" },
      { key: "extra_instructions", label: "Extra instructions", type: "textarea", placeholder: "" },
    ],
  },
  title_generator: {
    kind: "title_generator", label: "Title Generator", category: "AI", icon: Type, hue: 305,
    executor: "server", cronCompatible: true, provider: "lovable_ai",
    description: "Generate scroll-stopping titles for short-form videos. Returns a list and persists as an asset.",
    fields: [
      { key: "template_slug", label: "Prompt template slug (optional)", type: "text", placeholder: "default" },
      { key: "model", label: "Model", type: "select",
        options: [
          { label: "Gemini 2.5 Flash", value: "google/gemini-2.5-flash" },
          { label: "Gemini 2.5 Pro", value: "google/gemini-2.5-pro" },
        ], default: "google/gemini-2.5-flash" },
      { key: "count", label: "How many titles", type: "number", default: 5 },
      { key: "platform", label: "Platform", type: "select",
        options: [
          { label: "YouTube Shorts", value: "youtube_shorts" },
          { label: "TikTok", value: "tiktok" },
          { label: "Instagram Reels", value: "reels" },
        ], default: "youtube_shorts" },
      { key: "extra_instructions", label: "Extra instructions", type: "textarea", placeholder: "" },
    ],
  },
  hook_generator: {
    kind: "hook_generator", label: "Hook Generator", category: "AI", icon: Zap, hue: 305,
    executor: "server", cronCompatible: true, provider: "lovable_ai",
    description: "Generate 1–3 second opening hooks designed to stop the scroll. Persists list as an asset.",
    fields: [
      { key: "template_slug", label: "Prompt template slug (optional)", type: "text", placeholder: "default" },
      { key: "model", label: "Model", type: "select",
        options: [
          { label: "Gemini 2.5 Flash", value: "google/gemini-2.5-flash" },
          { label: "Gemini 2.5 Pro", value: "google/gemini-2.5-pro" },
        ], default: "google/gemini-2.5-flash" },
      { key: "count", label: "How many hooks", type: "number", default: 5 },
      { key: "extra_instructions", label: "Extra instructions", type: "textarea", placeholder: "" },
    ],
  },
  caption_generator: {
    kind: "caption_generator", label: "Caption Generator", category: "AI", icon: MessageSquareText, hue: 305,
    executor: "server", cronCompatible: true, provider: "lovable_ai",
    description: "Generate platform-optimized post captions from upstream script/topic. Persists as an asset.",
    fields: [
      { key: "template_slug", label: "Prompt template slug (optional)", type: "text", placeholder: "default" },
      { key: "model", label: "Model", type: "select",
        options: [
          { label: "Gemini 2.5 Flash", value: "google/gemini-2.5-flash" },
          { label: "Gemini 2.5 Pro", value: "google/gemini-2.5-pro" },
        ], default: "google/gemini-2.5-flash" },
      { key: "platform", label: "Platform", type: "select",
        options: [
          { label: "YouTube Shorts", value: "youtube_shorts" },
          { label: "TikTok", value: "tiktok" },
          { label: "Instagram Reels", value: "reels" },
        ], default: "youtube_shorts" },
      { key: "extra_instructions", label: "Extra instructions", type: "textarea", placeholder: "" },
    ],
  },
  hashtag_generator: {
    kind: "hashtag_generator", label: "Hashtag Generator", category: "AI", icon: Hash, hue: 305,
    executor: "server", cronCompatible: true, provider: "lovable_ai",
    description: "Generate a relevant hashtag set for the upstream topic/caption. Persists as an asset.",
    fields: [
      { key: "template_slug", label: "Prompt template slug (optional)", type: "text", placeholder: "default" },
      { key: "model", label: "Model", type: "select",
        options: [
          { label: "Gemini 2.5 Flash", value: "google/gemini-2.5-flash" },
          { label: "Gemini 2.5 Flash Lite", value: "google/gemini-2.5-flash-lite" },
        ], default: "google/gemini-2.5-flash" },
      { key: "count", label: "How many hashtags", type: "number", default: 15 },
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
  // Trends
  reddit_json: { id: "reddit_json", label: "Reddit JSON (free, no key)", free: true },
};
