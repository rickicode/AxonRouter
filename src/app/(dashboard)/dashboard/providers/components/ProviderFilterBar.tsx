"use client";

import { Button } from "@/components/ui/button";

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "free", label: "Free" },
  { value: "oauth", label: "OAuth" },
  { value: "apikey", label: "API Key" },
  { value: "freetier", label: "Free Tier" },
  { value: "local", label: "Local" },
  { value: "compatible", label: "Compatible" },
];

interface ProviderFilterBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function ProviderFilterBar({ value, onChange }: ProviderFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {FILTER_OPTIONS.map((option) => (
        <Button
          key={option.value}
          variant={value === option.value ? "default" : "outline"}
          size="sm"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
