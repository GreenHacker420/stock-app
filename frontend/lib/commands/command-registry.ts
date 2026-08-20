import type { CommandDefinition, CommandId } from "./command-types";

export class CommandRegistry {
  private readonly commands = new Map<CommandId, CommandDefinition>();
  private readonly listeners = new Set<() => void>();
  private version = 0;

  register(command: CommandDefinition): () => void {
    if (this.commands.has(command.id)) throw new Error(`Command already registered: ${command.id}`);
    this.commands.set(command.id, command);
    this.bump();
    return () => this.unregister(command.id);
  }

  unregister(id: CommandId): void {
    if (this.commands.delete(id)) this.bump();
  }

  get(id: CommandId): CommandDefinition | undefined {
    return this.commands.get(id);
  }

  getAll(): CommandDefinition[] {
    return [...this.commands.values()];
  }

  clear(): void {
    if (!this.commands.size) return;
    this.commands.clear();
    this.bump();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;
  getServerVersion = (): number => 0;

  private bump(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }
}

export const commandRegistry = new CommandRegistry();
