import { contextKeyService } from "@/lib/context/context-key-service";
import { compileContextExpression } from "@/lib/context/context-expression";
import type { ContextSnapshot } from "@/lib/context/context-types";
import { commandFeedbackStore } from "./command-feedback";
import { commandRegistry } from "./command-registry";
import type { CommandContext, CommandId } from "./command-types";

function executionSnapshot(context: CommandContext): ContextSnapshot {
  const snapshot = context.context ?? contextKeyService.snapshot();
  if (context.source !== "palette" || snapshot["dialog.commandPalette"] !== true) return snapshot;
  return Object.freeze({
    ...snapshot,
    "dialog.open": false,
    "dialog.commandPalette": false,
    "input.editable": false,
  });
}

export class CommandExecutor {
  canExecute(id: CommandId, context: ContextSnapshot = contextKeyService.snapshot()): boolean {
    const command = commandRegistry.get(id);
    if (!command) return false;
    return !command.when || compileContextExpression(command.when)(context);
  }

  async execute(id: CommandId, context: CommandContext): Promise<boolean> {
    const command = commandRegistry.get(id);
    const snapshot = executionSnapshot(context);
    if (!command || !this.canExecute(id, snapshot)) return false;

    await command.execute({ ...context, context: snapshot });

    if (context.source === "keyboard") {
      commandFeedbackStore.publish(id, context.key);
    }

    return true;
  }
}

export const commandExecutor = new CommandExecutor();
