import React from 'react';

interface Props {
  isVeg: boolean;
  size?: 'sm' | 'md';
}

export const VegNonVegIndicator: React.FC<Props> = ({ isVeg, size = 'sm' }) => {
  const boxSize = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5';

  if (isVeg) {
    return (
      <span
        title="Vegetarian"
        className={`inline-flex items-center justify-center border-2 border-emerald-600 rounded-sm ${boxSize} bg-white flex-shrink-0`}
      >
        <span className={`rounded-full bg-emerald-600 ${dotSize}`} />
      </span>
    );
  }

  return (
    <span
      title="Non-Vegetarian"
      className={`inline-flex items-center justify-center border-2 border-red-700 rounded-sm ${boxSize} bg-white flex-shrink-0`}
    >
      <span
        style={{
          width: 0,
          height: 0,
          borderLeft: size === 'sm' ? '3.5px solid transparent' : '4.5px solid transparent',
          borderRight: size === 'sm' ? '3.5px solid transparent' : '4.5px solid transparent',
          borderBottom: size === 'sm' ? '7px solid #b91c1c' : '9px solid #b91c1c',
        }}
      />
    </span>
  );
};
