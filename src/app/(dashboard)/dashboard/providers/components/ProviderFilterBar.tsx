"use client";

import { Button } from "@/components/ui/button";
import { CategoryDot } from "./CategoryDot";

export interface FilterOption {
  value: string;
  label: string;
  category: string;
  count: number;
}

interface ProviderFilterBarProps {
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
}

export function ProviderFilterBar({ value, onChange, options }: ProviderFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((option) => (
        <Button
          key={option.value}
          variant={value === option.value ? "default" : "outline"}
          size="sm"
          onClick={() => onChange(option.value)}
          className="gap-1.5"
        >
          {option.value !== "all" && (
            <CategoryDot category={option.category} />
          )}
          {option.label}
          <span className="ml-0.5 text-xs opacity-70">{option.count}</span>
        </Button>
      ))}
    </div>
  );
}
