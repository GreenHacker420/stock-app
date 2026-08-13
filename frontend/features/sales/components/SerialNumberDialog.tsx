"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Barcode, CheckCircle2, X } from "lucide-react";

import { useCommand, useKeybinding } from "@/components/keyboard/KeyboardRuntimeProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface SerialNumberDialogProps {
  id: string;
  open: boolean;
  onClose: () => void;
  itemName: string;
  required: number;
  value: string[];
  onChange: (serials: string[]) => void;
}

export function SerialNumberDialog({ id, open, onClose, itemName, required, value, onChange }: SerialNumberDialogProps) {
  const [inputValue, setInputValue] = useState("");
  const [localSerials, setLocalSerials] = useState<string[]>(value);
  const [activeIndex, setActiveIndex] = useState(0);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const commandPrefix = `serial.${id}`;
  const resolvedIndex = localSerials.length > 0 ? Math.min(activeIndex, localSerials.length - 1) : -1;
  const isExact = localSerials.length === required;
  const dialogWhen = `serial.dialog && serial.id == ${id}`;
  const serialsWhen = `${dialogWhen} && serial.hasItems`;
  const addWhen = `${dialogWhen} && !serial.exact && input.editable`;
  const confirmWhen = `${dialogWhen} && serial.exact`;

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      setLocalSerials([...value]);
      setInputValue("");
      setValidationMessage(null);
      setActiveIndex(0);
      inputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, value]);

  const addSerial = useCallback(() => {
    const serial = inputValue.trim();
    if (!serial) return;
    if (localSerials.includes(serial)) {
      setValidationMessage(`Serial ${serial} is already captured.`);
      return;
    }
    if (localSerials.length >= required) {
      setValidationMessage(`Exactly ${required} serial number${required === 1 ? " is" : "s are"} required.`);
      return;
    }
    const next = [...localSerials, serial];
    setLocalSerials(next);
    setInputValue("");
    setValidationMessage(null);
    setActiveIndex(Math.max(next.length - 1, 0));
    requestAnimationFrame(() => {
      if (next.length === required) confirmRef.current?.focus();
      else inputRef.current?.focus();
    });
  }, [inputValue, localSerials, required]);

  const removeActive = useCallback(() => {
    if (resolvedIndex < 0) return;
    setLocalSerials((current) => current.filter((_, index) => index !== resolvedIndex));
    setActiveIndex((current) => Math.max(0, current - 1));
    setValidationMessage(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [resolvedIndex]);

  const confirm = useCallback(() => {
    if (!isExact) return;
    onChange(localSerials);
    onClose();
  }, [isExact, localSerials, onChange, onClose]);

  const commands = useMemo(() => ({
    add: {
      id: `${commandPrefix}.add`,
      title: "Add Serial",
      category: "Serial Numbers",
      when: addWhen,
      execute: addSerial,
    },
    next: {
      id: `${commandPrefix}.next`,
      title: "Next Serial",
      category: "Serial Numbers",
      when: serialsWhen,
      repeatable: true,
      execute: () => setActiveIndex((current) => Math.min(current + 1, Math.max(localSerials.length - 1, 0))),
    },
    previous: {
      id: `${commandPrefix}.previous`,
      title: "Previous Serial",
      category: "Serial Numbers",
      when: serialsWhen,
      repeatable: true,
      execute: () => setActiveIndex((current) => Math.max(current - 1, 0)),
    },
    first: {
      id: `${commandPrefix}.first`,
      title: "First Serial",
      category: "Serial Numbers",
      when: serialsWhen,
      repeatable: true,
      execute: () => setActiveIndex(0),
    },
    last: {
      id: `${commandPrefix}.last`,
      title: "Last Serial",
      category: "Serial Numbers",
      when: serialsWhen,
      repeatable: true,
      execute: () => setActiveIndex(Math.max(localSerials.length - 1, 0)),
    },
    remove: {
      id: `${commandPrefix}.remove`,
      title: "Remove Serial",
      category: "Serial Numbers",
      when: serialsWhen,
      execute: removeActive,
    },
    close: {
      id: `${commandPrefix}.close`,
      title: "Close Serial Dialog",
      category: "Serial Numbers",
      when: dialogWhen,
      execute: onClose,
    },
    confirm: {
      id: `${commandPrefix}.confirm`,
      title: "Confirm Serials",
      category: "Serial Numbers",
      when: confirmWhen,
      execute: confirm,
    },
  }), [addSerial, addWhen, commandPrefix, confirm, confirmWhen, dialogWhen, localSerials.length, onClose, removeActive, serialsWhen]);

  useCommand(commands.add);
  useCommand(commands.next);
  useCommand(commands.previous);
  useCommand(commands.first);
  useCommand(commands.last);
  useCommand(commands.remove);
  useCommand(commands.close);
  useCommand(commands.confirm);

  useKeybinding(useMemo(() => ({ id: `${commandPrefix}.bind.add`, key: "enter", command: commands.add.id, when: addWhen, priority: 330 }), [addWhen, commandPrefix, commands.add.id]));
  useKeybinding(useMemo(() => ({ id: `${commandPrefix}.bind.next`, key: "arrowdown", command: commands.next.id, when: serialsWhen, priority: 320, allowRepeat: true }), [commandPrefix, commands.next.id, serialsWhen]));
  useKeybinding(useMemo(() => ({ id: `${commandPrefix}.bind.previous`, key: "arrowup", command: commands.previous.id, when: serialsWhen, priority: 320, allowRepeat: true }), [commandPrefix, commands.previous.id, serialsWhen]));
  useKeybinding(useMemo(() => ({ id: `${commandPrefix}.bind.first`, key: "home", command: commands.first.id, when: `${serialsWhen} && !input.editable`, priority: 320, allowRepeat: true }), [commandPrefix, commands.first.id, serialsWhen]));
  useKeybinding(useMemo(() => ({ id: `${commandPrefix}.bind.last`, key: "end", command: commands.last.id, when: `${serialsWhen} && !input.editable`, priority: 320, allowRepeat: true }), [commandPrefix, commands.last.id, serialsWhen]));
  useKeybinding(useMemo(() => ({ id: `${commandPrefix}.bind.remove`, key: "ctrl+d", command: commands.remove.id, when: serialsWhen, priority: 340 }), [commandPrefix, commands.remove.id, serialsWhen]));
  useKeybinding(useMemo(() => ({ id: `${commandPrefix}.bind.delete`, key: "delete", command: commands.remove.id, when: `${serialsWhen} && !input.editable`, priority: 340 }), [commandPrefix, commands.remove.id, serialsWhen]));
  useKeybinding(useMemo(() => ({ id: `${commandPrefix}.bind.close`, key: "esc", command: commands.close.id, when: dialogWhen, priority: 400 }), [commandPrefix, commands.close.id, dialogWhen]));
  useKeybinding(useMemo(() => ({ id: `${commandPrefix}.bind.confirm`, key: "enter", command: commands.confirm.id, when: `${confirmWhen} && !input.editable`, priority: 330 }), [commandPrefix, commands.confirm.id, confirmWhen]));

  const scope = JSON.stringify({
    "dialog.open": true,
    "serial.dialog": true,
    "serial.id": id,
    "serial.hasItems": localSerials.length > 0,
    "serial.exact": isExact,
    "keyboard.scope": "dialog.serial",
  });

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="max-w-md" data-keyboard-scope={scope}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-bold">
            <Barcode className="h-4 w-4 text-indigo-600" />
            Serial Numbers — {itemName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs">
            {isExact ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertCircle className="h-4 w-4 text-amber-500" />}
            <span className={isExact ? "font-bold text-emerald-600" : "text-muted-foreground"}>
              {localSerials.length} / {required} serial numbers captured
            </span>
          </div>
          {!isExact ? (
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(event) => {
                  setInputValue(event.target.value);
                  setValidationMessage(null);
                }}
                placeholder="Scan barcode or type serial number, press Enter"
                className="h-9 flex-1 text-xs"
                autoComplete="off"
                aria-label="Serial number input"
              />
              <Button size="sm" onClick={addSerial} disabled={!inputValue.trim()} className="h-9 text-xs">Add</Button>
            </div>
          ) : null}
          {validationMessage ? <p role="alert" className="text-xs font-medium text-destructive">{validationMessage}</p> : null}
          {localSerials.length > 0 ? (
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-md border bg-muted/30 p-2" role="listbox" aria-label="Captured serial numbers">
              {localSerials.map((serial, index) => {
                const active = index === resolvedIndex;
                return (
                  <Badge key={serial} variant="outline" data-keyboard-active={active || undefined} className={`gap-1 pr-1 font-mono text-[10px] ${active ? "ring-2 ring-primary ring-offset-1" : ""}`}>
                    <span>{serial}</span>
                    <button
                      type="button"
                      onFocus={() => setActiveIndex(index)}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => {
                        setLocalSerials((current) => current.filter((item) => item !== serial));
                        setActiveIndex(Math.max(0, index - 1));
                      }}
                      className="ml-0.5 rounded p-0.5 hover:bg-destructive/20"
                      aria-label={`Remove serial ${serial}`}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          ) : null}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">Cancel</Button>
          <Button ref={confirmRef} size="sm" onClick={confirm} disabled={!isExact} className="h-8 text-xs font-bold">Confirm ({localSerials.length}/{required})</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
