"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "lucide-react";

interface DatePeriodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectPeriod?: (startDate: string, endDate: string) => void;
}

export function DatePeriodDialog({ open, onOpenChange, onSelectPeriod }: DatePeriodDialogProps) {
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);

  const handleApply = () => {
    if (onSelectPeriod) onSelectPeriod(startDate, endDate);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Calendar className="h-4 w-4 text-primary" />
            <span>Select Date & Report Period (F2)</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Choose transaction reporting window for registers and statements.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold">From Date</label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 text-xs" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold">To Date</label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 text-xs" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-9 text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={handleApply} className="h-9 font-bold text-xs">
            Apply Period (Enter)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
