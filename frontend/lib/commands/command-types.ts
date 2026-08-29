import type { ContextSnapshot } from "@/lib/context/context-types";

export type CommandId = string;

export interface CommandContext {
  source: "keyboard" | "mouse" | "touch" | "palette" | "system";
  args?: Readonly<Record<string, unknown>>;
  key?: string;
  event?: KeyboardEvent;
  target?: EventTarget | null;
  context?: ContextSnapshot;
}

export interface CommandDefinition {
  id: CommandId;
  title: string;
  category?: string;
  description?: string;
  when?: string;
  repeatable?: boolean;
  execute: (context: CommandContext) => void | Promise<void>;
}

export interface CommandState {
  visible: boolean;
  enabled: boolean;
}
