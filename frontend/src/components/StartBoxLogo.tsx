interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

const SIZES = {
  sm: { mark: 26, font: 15, gap: 8 },
  md: { mark: 32, font: 18, gap: 10 },
  lg: { mark: 48, font: 26, gap: 12 },
};

export function StartBoxLogo({ size = 'md', showText = true }: LogoProps) {
  const s = SIZES[size];
  const innerPad = s.mark * 0.18;
  const innerSize = s.mark - innerPad * 2;
  const outerR = s.mark * 0.22;
  const innerR = s.mark * 0.14;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: s.gap }}>
      <svg
        width={s.mark}
        height={s.mark}
        viewBox={`0 0 ${s.mark} ${s.mark}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="sb-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
        {/* Outer rounded box */}
        <rect
          width={s.mark}
          height={s.mark}
          rx={outerR}
          fill="url(#sb-grad)"
        />
        {/* Inner rounded box (shifted to show depth/box-in-box) */}
        <rect
          x={innerPad}
          y={innerPad}
          width={innerSize}
          height={innerSize}
          rx={innerR}
          fill="none"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth={s.mark * 0.06}
        />
        {/* Stylized "S" */}
        <text
          x="50%"
          y="54%"
          dominantBaseline="middle"
          textAnchor="middle"
          fill="#fff"
          fontSize={s.mark * 0.48}
          fontWeight="800"
          fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"
        >
          S
        </text>
      </svg>
      {showText && (
        <span
          className="startbox-logo-text"
          style={{
            fontSize: s.font,
            fontWeight: 700,
            letterSpacing: '-0.3px',
            lineHeight: 1,
          }}
        >
          StartBox
        </span>
      )}
    </div>
  );
}
