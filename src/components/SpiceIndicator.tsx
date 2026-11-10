import React from 'react';
import { Flame } from 'lucide-react';

interface Props {
  level: number;
}

export const SpiceIndicator: React.FC<Props> = ({ level }) => {
  if (level <= 0) return null;

  const label = level === 1 ? 'Mild' : level === 2 ? 'Medium' : 'Spicy';

  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200"
      title={`Spice Level: ${label}`}
    >
      <span className="flex items-center -space-x-1">
        {Array.from({ length: level }).map((_, i) => (
          <Flame key={i} className="w-3 h-3 fill-amber-600 text-amber-600" />
        ))}
      </span>
      <span>{label}</span>
    </span>
  );
};
