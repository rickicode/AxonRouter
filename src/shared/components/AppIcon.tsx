"use client";

import { createElement, type ComponentType, type CSSProperties } from "react";
import PropTypes from "prop-types";
import {
  Activity,
  AppWindow,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpen,
  AudioLines,
  Bot,
  Brain,
  Brush,
  ChartColumn,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleHelp,
  CircleAlert,
  CircleArrowDown,
  CirclePlay,
  CircleStop,
  Cloud,
  CloudOff,
  CloudUpload,
  Code2,
  Copy,
  Cpu,
  Database,
  DatabaseZap,
  Download,
  Eye,
  EyeOff,
  FileCode2,
  Flame,
  FlaskConical,
  FolderCog,
  Globe,
  Gauge,
  Grid3x3,
  Grid2x2,
  HardDrive,
  Image,
  KeyRound,
  Languages,
  Layers3,
  Lightbulb,
  Lock,
  Link2,
  LoaderCircle,
  LockOpen,
  MessageSquareText,
  Mic,
  Monitor,
  MonitorSpeaker,
  Moon,
  Network,
  OctagonAlert,
  PackageOpen,
  Play,
  Plus,
  PowerOff,
  RadioTower,
  Rocket,
  RefreshCw,
  RotateCcw,
  Route,
  Save,
  ScrollText,
  Search,
  Sun,
  SearchX,
  Settings,
  Shield,
  ShieldCheck,
  ShieldOff,
  Sparkle,
  SlidersHorizontal,
  Sparkles,
  Speaker,
  SquarePen,
  Star,
  Terminal,
  Telescope,
  Trash2,
  Upload,
  Users,
  Waypoints,
  Wifi,
  Workflow,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";

// Brand icons — inline SVG components (replaces react-icons dependency)
function svgIcon(d: string) {
  function SvgIcon({ size, strokeWidth: _strokeWidth, ...props }: any) {
    return createElement(
      "svg",
      { viewBox: "0 0 24 24", fill: "currentColor", width: size || "1em", height: size || "1em", ...props },
      createElement("path", { d })
    );
  }
  SvgIcon.displayName = "InlineSvgIcon";
  return SvgIcon;
}

const SiAnthropic = svgIcon("M17.17 12.64l-3.77-9.27h-2.8l-3.77 9.27h2.56l.72-1.86h3.78l.72 1.86h2.56zm-5.78-3.86l1.11-2.87 1.11 2.87h-2.22zM6.83 11.37L12 22.63l5.17-11.26H6.83z");
const SiDeepgram = svgIcon("M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-2-6h4v-4h-4v4z");
const SiGithub = svgIcon("M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z");
const SiGoogle = svgIcon("M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z");
const SiOpenai = svgIcon("M22.28 9.37c.5-1.63.23-3.4-.73-4.82a5.86 5.86 0 00-6.33-2.43A5.86 5.86 0 0010.8.12a5.87 5.87 0 00-5.59 4.04 5.86 5.86 0 00-3.92 2.84 5.87 5.87 0 00.72 6.88 5.86 5.86 0 00.73 4.82 5.86 5.86 0 006.33 2.43 5.86 5.86 0 004.42 2 5.87 5.87 0 005.59-4.04 5.86 5.86 0 003.92-2.84 5.87 5.87 0 00-.72-6.88zM14.18 21.3a4.4 4.4 0 01-2.82-1.02l.14-.08 4.68-2.7a.76.76 0 00.38-.66v-6.6l1.98 1.14a.07.07 0 01.04.05v5.47a4.41 4.41 0 01-4.4 4.4zM4.05 17.47a4.38 4.38 0 01-.53-2.95l.14.08 4.68 2.7a.76.76 0 00.76 0l5.72-3.3v2.28a.07.07 0 01-.03.06l-4.74 2.74a4.41 4.41 0 01-6-1.61zM2.94 7.92a4.38 4.38 0 012.3-1.93v5.56a.76.76 0 00.38.66l5.72 3.3-1.98 1.14a.07.07 0 01-.06 0L4.56 13.9a4.41 4.41 0 01-1.62-6zm16.3 3.8l-5.72-3.3 1.98-1.15a.07.07 0 01.06 0l4.74 2.74a4.4 4.4 0 01-.67 7.94v-5.56a.76.76 0 00-.38-.66zm1.97-2.97l-.14-.08-4.68-2.7a.76.76 0 00-.76 0l-5.72 3.3V7a.07.07 0 01.03-.06l4.74-2.74a4.41 4.41 0 016.53 4.56zM8.68 13.3l-1.98-1.14a.07.07 0 01-.04-.06V6.64a4.41 4.41 0 017.22-3.38l-.14.08-4.68 2.7a.76.76 0 00-.38.66v6.6zm1.07-2.32l2.55-1.47 2.55 1.47v2.94l-2.55 1.47-2.55-1.47V11z");
const FaCloudflare = svgIcon("M16.5 12.5l.6-2.1c.1-.4.1-.7-.1-1-.2-.2-.5-.4-.8-.4l-9.5-.1c-.1 0-.2 0-.2-.1s0-.2.1-.2l.2-.1h9.6c1.1 0 2.1-.8 2.4-1.8l.3-1.1c0-.1 0-.2 0-.2C18.2 3.2 16.2 1.5 13.8 1.5c-2.1 0-3.9 1.3-4.6 3.2-.5-.4-1.1-.6-1.8-.5-1.2.1-2.1 1.1-2.2 2.3 0 .3 0 .5.1.8C3.3 7.5 1.8 9.2 1.8 11.2c0 .4 0 .8.1 1.2 0 .1.1.1.2.1h14.2c.1 0 .2-.1.2-.2zm3.8-2.1c-.1 0-.2 0-.3 0l-.1.1-.3 1c-.1.4-.1.7.1 1 .2.2.5.4.8.4h1.3c.1 0 .2 0 .2.1s0 .2-.1.2l-.2.1h-1.4c-1.1 0-2.1.8-2.4 1.8l-.1.4c0 .1 0 .2.2.2h5.5c.1 0 .2-.1.2-.1.3-.6.4-1.3.4-2 0-1.7-1.4-3.1-3.1-3.1z");
const FaGitlab = svgIcon("M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 01-.3-.94l1.22-3.78 2.44-7.51a.42.42 0 01.82 0l2.44 7.51h8.06l2.44-7.51a.42.42 0 01.82 0l2.44 7.51 1.22 3.78a.84.84 0 01-.3.94z");

const iconRegistry = {
  add: Plus,
  autoawesome: Sparkle,
  addcircle: AppWindow,
  antigravity: Sparkles,
  anthropic: SiAnthropic,
  "anthropic-compatible": SiAnthropic,
  api: AppWindow,
  arrowupward: ArrowUp,
  arrowdownward: ArrowDown,
  arrowforward: ArrowRight,
  backup: RotateCcw,
  bolt: Zap,
  appwindow: AppWindow,
  sparkles: Sparkles,
  assemblyai: AudioLines,
  azure: Cloud,
  barchart: ChartColumn,
  chartcolumn: ChartColumn,
  gauge: Gauge,
  blackbox: Cpu,
  brave: Search,
  cartesia: AudioLines,
  cerebras: Brain,
  chat: MessageSquareIcon,
  check: Check,
  checkcircle: CheckCheck,
  chevronleft: ChevronLeft,
  chevronright: ChevronRight,
  cookie: ShieldOff,
  chutes: Cloud,
  claude: SiAnthropic,
  cline: Terminal,
  close: X,
  code: Code2,
  codex: SiOpenai,
  cancel: X,
  cloudoff: CloudOff,
  cloudupload: CloudUpload,
  cohere: Network,
  computer: Monitor,
  contentcopy: Copy,
  copy: Copy,
  commandcode: Terminal,
  comfyui: Workflow,
  consolelog: Monitor,
  continue: Route,
  copilot: SiGithub,
  cursor: Code2,
  data: Database,
  dataobject: DatabaseZap,
  datausage: HardDrive,
  harddrive: HardDrive,
  deepgram: SiDeepgram,
  deepseek: Zap,
  dns: RadioTower,
  radiotower: RadioTower,
  droid: Cpu,
  edge: Globe,
  elevenlabs: AudioLines,
  east: ArrowRight,
  edit: SquarePen,
  exa: Search,
  error: CircleAlert,
  expandless: ChevronUp,
  expandmore: ChevronDown,
  extension: PackageOpen,
  network: Network,
  packageopen: PackageOpen,
  firecrawl: Flame,
  fireworks: Flame,
  gemini: SiGoogle,
  github: SiGithub,
  gitlab: FaGitlab,
  glm: Brain,
  globe: Globe,
  google: SiGoogle,
  grok: Sparkles,
  groq: Zap,
  hub: Grid2x2,
  grid22: Grid2x2,
  gridview: Grid3x3,
  huggingface: Network,
  icon: Sparkles,
  iflow: Waypoints,
  image: Image,
  info: Activity,
  key: KeyRound,
  history: BookOpen,
  keyboardarrowdown: ChevronDown,
  keyboardarrowup: ChevronUp,
  kiro: Wrench,
  kilocode: Code2,
  lan: FolderCog,
  foldercog: FolderCog,
  language: Languages,
  languages: Languages,
  layers: LayersIcon,
  link: Link2,
  local: Speaker,
  loader: LoaderCircle,
  lightbulb: Lightbulb,
  lockopen: LockOpen,
  lock: Lock,
  loading: LoaderCircle,
  mic: Mic,
  memory: Cpu,
  minimax: Brain,
  mimo: Brain,
  mistral: WindIcon,
  monitor: Monitor,
  scrolltext: ScrollText,
  monitorspeaker: MonitorSpeaker,
  system: Monitor,
  nanobanana: Image,
  nebius: Cloud,
  ollama: Cloud,
  openai: SiOpenai,
  opencode: FileCode2,
  "openai-compatible": SiOpenai,
  openrouter: Route,
  openinnew: ArrowRight,
  logout: PowerOff,
  permmedia: Image,
  perplexity: Search,
  pi: Sparkles,
  playarrow: Play,
  playcircle: CirclePlay,
  playht: AudioLines,
  progressactivity: LoaderCircle,
  provider: Network,
  poweroff: PowerOff,
  psychology: Brain,
  psychologyalt: Brain,
  qwen: Brain,
  route: Route,
  router: Waypoints,
  refresh: RefreshCw,
  restartalt: RotateCcw,
  recordvoiceover: Mic,
  restore: RotateCcw,
  search: Search,
  searchoff: SearchX,
  searxng: Search,
  security: Shield,
  settings: Settings,
  schedule: Activity,
  save: Save,
  science: FlaskIcon,
  shieldlock: ShieldCheck,
  star: Star,
  stopcircle: CircleStop,
  tune: SlidersHorizontal,
  shield: Shield,
  siliconflow: Workflow,
  smarttoy: Cpu,
  speaker: Speaker,
  tavily: Search,
  terminal: Terminal,
  delete: Trash2,
  darkmode: MoonIcon,
  developerboard: Cpu,
  diamond: Sparkle,
  air: WindIcon,
  face: Users,
  help: CircleHelp,
  imagesearch: Search,
  donutlarge: Activity,
  download: Download,
  upload: Upload,
  groupwork: Workflow,
  localfiredepartment: Flame,
  lightmode: SunIcon,
  managesearch: Telescope,
  movie: Monitor,
  musicnote: AudioLines,
  modeltraining: Brain,
  together: Network,
  translate: Languages,
  unfoldmore: ChevronDown,
  usage: Activity,
  speed: Gauge,
  spatialaudio: AudioLines,
  travelexplore: Globe,
  vertex: Cloud,
  verifieduser: ShieldCheck,
  visibility: Eye,
  visibilityoff: EyeOff,
  volcengine: Cloud,
  warning: OctagonAlert,
  wifitethering: Wifi,
  x: X,
  web: Globe,
  xai: Sparkles,
};

function WindIcon(props) {
  return <Activity {...props} />;
}

function SunIcon(props) {
  return <Sun {...props} />;
}

function MoonIcon(props) {
  return <Moon {...props} />;
}

function FlaskIcon(props) {
  return <FlaskConical {...props} />;
}

function LayersIcon(props) {
  return <Layers3 {...props} />;
}

function MessageSquareIcon(props) {
  return <MessageSquareText {...props} />;
}

function normalizeIconKey(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/^\/providers\//, "")
    .replace(/\.(png|svg|jpg|jpeg|webp)$/i, "")
    .replace(/^openai-compatible-.+$/, "openai-compatible")
    .replace(/^anthropic-compatible-.+$/, "anthropic-compatible")
    .replace(/^(oai-r|oai-cc)$/, "openai")
    .replace(/^anthropic-m$/, "anthropic")
    .replace(/[-_ ]+(web|local|cloud|free|intl|cn)$/g, "")
    .replace(/[^a-z0-9-]/g, "");
}

function resolveIconComponent(name, fallback) {
  const normalized = normalizeIconKey(name);
  return iconRegistry[normalized] || fallback || Bot;
}

type AppIconProps = {
  name?: string;
  fallback?: ComponentType<any>;
  className?: string;
  size?: number;
  strokeWidth?: number;
  title?: string;
  style?: CSSProperties;
};

export default function AppIcon({
  name,
  fallback,
  className,
  size = 20,
  strokeWidth = 1.8,
  title,
  style,
}: AppIconProps) {
  const Icon = resolveIconComponent(name, fallback);
  return createElement(Icon, {
    title,
    size,
    strokeWidth,
    className: cn("shrink-0", className),
    style,
    "aria-hidden": title ? undefined : true,
  });
}

AppIcon.propTypes = {
  name: PropTypes.string,
  fallback: PropTypes.elementType,
  className: PropTypes.string,
  size: PropTypes.number,
  strokeWidth: PropTypes.number,
  title: PropTypes.string,
  style: PropTypes.object,
};

export { normalizeIconKey, resolveIconComponent };
