"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/lib/auth/auth-store";
import { Calendar } from "lucide-react";

interface DatePeriodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectPeriod?: (startDate: string, endDate: string) => void;
}

function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function DatePeriodForm({
  initialStart,
  initialEnd,
  onApply,
  onCancel,
}: {
  initialStart: string;
  initialEnd: string;
  onApply: (startDate: string, endDate: string) => void;
  onCancel: () => void;
}) {
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);

  return <>
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2 text-base font-bold"><Calendar className="h-4 w-4 text-primary" /><span>Select Date & Report Period (F2)</span></DialogTitle>
      <DialogDescription className="text-xs">Choose transaction reporting window for registers and statements.</DialogDescription>
    </DialogHeader>
    <div className="grid grid-cols-2 gap-4 py-3">
      <div className="space-y-1"><label className="text-xs font-semibold">From Date</label><Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="h-9 text-xs" /></div>
      <div className="space-y-1"><label className="text-xs font-semibold">To Date</label><Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="h-9 text-xs" /></div>
    </div>
    <DialogFooter><Button variant="outline" size="sm" onClick={onCancel} className="h-9 text-xs">Cancel</Button><Button size="sm" onClick={() => onApply(startDate, endDate)} className="h-9 text-xs font-bold">Apply Period (Enter)</Button></DialogFooter>
  </>;
}

export function DatePeriodDialog({ open, onOpenChange, onSelectPeriod }: DatePeriodDialogProps) {
  const { startDate: storeStart, endDate: storeEnd, setPeriod } = useAuthStore();
  const today = todayInIndia();

  const handleApply = (startDate: string, endDate: string) => {
    setPeriod(startDate, endDate);
    onSelectPeriod?.(startDate, endDate);
    onOpenChange(false);
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    {open ? <DialogContent className="sm:max-w-md"><DatePeriodForm initialStart={storeStart || today} initialEnd={storeEnd || today} onApply={handleApply} onCancel={() => onOpenChange(false)} /></DialogContent> : null}
  </Dialog>;
}
