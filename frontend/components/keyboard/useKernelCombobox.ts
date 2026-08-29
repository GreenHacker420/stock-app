"use client";

import { useCallback, useMemo, useState, type SetStateAction } from "react";

import { useCommand, useKeybinding } from "./KeyboardRuntimeProvider";

interface KernelComboboxOptions<T> {
  id: string;
  open: boolean;
  items: readonly T[];
  onOpenChange: (open: boolean) => void;
  onSelect: (item: T) => void;
  onSelectEndOfList?: () => void;
  pageSize?: number;
  queryEmpty?: boolean;
}

interface RequestedIndexState {
  queryEmpty: boolean;
  index: number;
}

export function useKernelCombobox<T>({
  id,
  open,
  items,
  onOpenChange,
  onSelect,
  onSelectEndOfList,
  pageSize = 5,
  queryEmpty = false,
}: KernelComboboxOptions<T>) {
  const minIndex = queryEmpty ? -1 : 0;
  const [requested, setRequested] = useState<RequestedIndexState>(() => ({
    queryEmpty,
    index: minIndex,
  }));

  const requestedIndex = requested.queryEmpty === queryEmpty ? requested.index : minIndex;

  const setRequestedIndex = useCallback((next: SetStateAction<number>) => {
    setRequested((current) => {
      const currentIndex = current.queryEmpty === queryEmpty ? current.index : minIndex;
      const nextIndex = typeof next === "function" ? next(currentIndex) : next;
      if (current.queryEmpty === queryEmpty && current.index === nextIndex) return current;
      return { queryEmpty, index: nextIndex };
    });
  }, [minIndex, queryEmpty]);

  const activeIndex = items.length > 0
    ? Math.max(minIndex, Math.min(requestedIndex, items.length - 1))
    : -1;

  const activeItem = activeIndex >= 0 ? items[activeIndex] : undefined;
  const commandPrefix = `combobox.${id}`;
  const whenOpen = `combobox.open && combobox.id == ${id}`;
  const whenItems = `${whenOpen} && (combobox.hasItems || combobox.queryEmpty)`;

  const move = useCallback((delta: number) => {
    setRequestedIndex((current) => Math.max(minIndex, Math.min(current + delta, items.length - 1)));
  }, [items.length, minIndex, setRequestedIndex]);

  const commands = useMemo(() => ({
    next: { id: `${commandPrefix}.next`, title: "Next option", repeatable: true, execute: () => move(1) },
    previous: { id: `${commandPrefix}.previous`, title: "Previous option", repeatable: true, execute: () => move(-1) },
    first: { id: `${commandPrefix}.first`, title: "First option", repeatable: true, execute: () => setRequestedIndex(minIndex) },
    last: { id: `${commandPrefix}.last`, title: "Last option", repeatable: true, execute: () => setRequestedIndex(Math.max(items.length - 1, minIndex)) },
    pageUp: { id: `${commandPrefix}.pageUp`, title: "Previous option block", repeatable: true, execute: () => move(-pageSize) },
    pageDown: { id: `${commandPrefix}.pageDown`, title: "Next option block", repeatable: true, execute: () => move(pageSize) },
    accept: {
      id: `${commandPrefix}.accept`,
      title: "Accept option",
      execute: () => {
        if (activeIndex === -1 && onSelectEndOfList) {
          onSelectEndOfList();
        } else if (activeItem) {
          onSelect(activeItem);
        }
      },
    },
    close: { id: `${commandPrefix}.close`, title: "Close suggestions", execute: () => onOpenChange(false) },
  }), [activeIndex, activeItem, commandPrefix, items.length, minIndex, move, onOpenChange, onSelect, onSelectEndOfList, pageSize, setRequestedIndex]);

  useCommand(commands.next);
  useCommand(commands.previous);
  useCommand(commands.first);
  useCommand(commands.last);
  useCommand(commands.pageUp);
  useCommand(commands.pageDown);
  useCommand(commands.accept);
  useCommand(commands.close);

  useKeybinding(useMemo(() => ({ id: `${commandPrefix}.bind.next`, key: "arrowdown", command: commands.next.id, when: whenItems, priority: 240, allowRepeat: true }), [commandPrefix, commands.next.id, whenItems]));
  useKeybinding(useMemo(() => ({ id: `${commandPrefix}.bind.previous`, key: "arrowup", command: commands.previous.id, when: whenItems, priority: 240, allowRepeat: true }), [commandPrefix, commands.previous.id, whenItems]));
  useKeybinding(useMemo(() => ({ id: `${commandPrefix}.bind.first`, key: "home", command: commands.first.id, when: whenItems, priority: 240, allowRepeat: true }), [commandPrefix, commands.first.id, whenItems]));
  useKeybinding(useMemo(() => ({ id: `${commandPrefix}.bind.last`, key: "end", command: commands.last.id, when: whenItems, priority: 240, allowRepeat: true }), [commandPrefix, commands.last.id, whenItems]));
  useKeybinding(useMemo(() => ({ id: `${commandPrefix}.bind.page-up`, key: "pageup", command: commands.pageUp.id, when: whenItems, priority: 240, allowRepeat: true }), [commandPrefix, commands.pageUp.id, whenItems]));
  useKeybinding(useMemo(() => ({ id: `${commandPrefix}.bind.page-down`, key: "pagedown", command: commands.pageDown.id, when: whenItems, priority: 240, allowRepeat: true }), [commandPrefix, commands.pageDown.id, whenItems]));
  useKeybinding(useMemo(() => ({ id: `${commandPrefix}.bind.accept`, key: "enter", command: commands.accept.id, when: whenItems, priority: 250 }), [commandPrefix, commands.accept.id, whenItems]));
  useKeybinding(useMemo(() => ({ id: `${commandPrefix}.bind.close`, key: "esc", command: commands.close.id, when: whenOpen, priority: 260 }), [commandPrefix, commands.close.id, whenOpen]));

  const scope = useMemo(() => JSON.stringify({
    "combobox.open": open,
    "combobox.id": id,
    "combobox.hasItems": items.length > 0,
    "combobox.queryEmpty": queryEmpty,
    "keyboard.scope": "combobox",
  }), [id, items.length, open, queryEmpty]);

  return {
    activeIndex,
    activeItem,
    setActiveIndex: setRequestedIndex,
    resetActiveIndex: () => setRequestedIndex(minIndex),
    scope,
  };
}
