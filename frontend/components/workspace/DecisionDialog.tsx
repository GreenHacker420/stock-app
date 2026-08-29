"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface DecisionBodyProps {
  title: string;
  description: string;
  confirmLabel: string;
  destructive: boolean;
  requireReason: boolean;
  reasonPlaceholder: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

function DecisionBody({ title, description, confirmLabel, destructive, requireReason, reasonPlaceholder, pending, onCancel, onConfirm }: DecisionBodyProps) {
  const [reason, setReason] = useState("");
  return <DialogContent className="w-[min(92vw,34rem)] sm:max-w-none">
    <DialogHeader><div className="mb-1 flex size-9 items-center justify-center rounded-lg border bg-muted text-muted-foreground"><AlertTriangle className="size-4" /></div><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
    {requireReason ? <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={reasonPlaceholder} autoFocus className="h-10" /> : null}
    <DialogFooter><Button variant="outline" onClick={onCancel} disabled={pending}>Cancel</Button><Button variant={destructive ? "destructive" : "default"} disabled={pending || (requireReason && !reason.trim())} onClick={() => onConfirm(reason.trim())}>{pending ? "Processing…" : confirmLabel}</Button></DialogFooter>
  </DialogContent>;
}

export function DecisionDialog({ open, onOpenChange, title, description, confirmLabel, destructive = false, requireReason = false, reasonPlaceholder = "Reason…", pending = false, onConfirm }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; confirmLabel: string; destructive?: boolean; requireReason?: boolean; reasonPlaceholder?: string; pending?: boolean; onConfirm: (reason: string) => void; }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>{open ? <DecisionBody title={title} description={description} confirmLabel={confirmLabel} destructive={destructive} requireReason={requireReason} reasonPlaceholder={reasonPlaceholder} pending={pending} onCancel={() => onOpenChange(false)} onConfirm={onConfirm} /> : null}</Dialog>;
}
