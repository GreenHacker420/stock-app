"use client";

import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Barcode, X, CheckCircle2, AlertCircle } from "lucide-react";

interface SerialNumberDialogProps {
  open: boolean;
  onClose: () => void;
  itemName: string;
  required: number;
  value: string[];
  onChange: (serials: string[]) => void;
}

export function SerialNumberDialog({
  open,
  onClose,
  itemName,
  required,
  value,
  onChange,
}: SerialNumberDialogProps) {
  const [inputVal, setInputVal] = useState("");
  const [localSerials, setLocalSerials] = useState<string[]>(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync incoming value when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        setLocalSerials([...value]);
        setInputVal("");
        inputRef.current?.focus();
      }, 0);
    }
  }, [open, value]);

  const handleAdd = () => {
    const trimmed = inputVal.trim();
    if (!trimmed) return;
    if (localSerials.includes(trimmed)) return; // no duplicates
    const next = [...localSerials, trimmed];
    setLocalSerials(next);
    setInputVal("");
    inputRef.current?.focus();
  };

  const handleRemove = (serial: string) => {
    setLocalSerials((prev) => prev.filter((s) => s !== serial));
  };

  const handleConfirm = () => {
    onChange(localSerials);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  const isExact = localSerials.length === required;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold flex items-center gap-2">
            <Barcode className="h-4 w-4 text-indigo-600" />
            Serial Numbers — {itemName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Progress indicator */}
          <div className="flex items-center gap-2 text-xs">
            {isExact ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-amber-500" />
            )}
            <span className={isExact ? "text-emerald-600 font-bold" : "text-muted-foreground"}>
              {localSerials.length} / {required} serial numbers captured
            </span>
          </div>

          {/* Scanner / keyboard input */}
          {!isExact && (
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Scan barcode or type serial number, press Enter"
                className="text-xs h-9 flex-1"
                autoComplete="off"
                aria-label="Serial number input"
              />
              <Button size="sm" onClick={handleAdd} disabled={!inputVal.trim()} className="h-9 text-xs">
                Add
              </Button>
            </div>
          )}

          {/* Captured serials */}
          {localSerials.length > 0 && (
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-2 border rounded-md bg-muted/30">
              {localSerials.map((s, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className="text-[10px] font-mono gap-1 pr-1 cursor-default"
                >
                  <span>{s}</span>
                  <button
                    type="button"
                    onClick={() => handleRemove(s)}
                    className="ml-0.5 rounded hover:bg-destructive/20 p-0.5"
                    aria-label={`Remove serial ${s}`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {localSerials.length > required && (
            <p className="text-xs text-destructive">
              Too many serial numbers. Remove {localSerials.length - required} to continue.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!isExact}
            className="h-8 text-xs font-bold"
          >
            Confirm ({localSerials.length}/{required})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
