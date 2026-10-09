/** Flat drawings that hold a 3D stage's place until three.js arrives. Shapes from the design v1 boards. */

export function RobotSketch({ width = 240 }: { readonly width?: number }) {
  return (
    <svg viewBox="0 0 240 150" width={width} role="img" aria-label="A small maker robot: wheels, an orange printed chassis, a green controller board and two LED eyes">
      <line x1="78" y1="44" x2="78" y2="22" stroke="#5B6470" strokeWidth="3" />
      <rect x="69" y="12" width="18" height="11" rx="2" fill="#7B4FD6" />
      <rect x="52" y="44" width="110" height="16" rx="2" fill="#2E9D63" />
      <rect x="92" y="47" width="22" height="10" rx="1" fill="#0F1114" />
      <circle cx="62" cy="52" r="2" fill="#E3B341" />
      <circle cx="70" cy="52" r="2" fill="#E3B341" />
      <circle cx="150" cy="52" r="2" fill="#E3B341" />
      <rect x="166" y="28" width="42" height="17" rx="2" fill="#2F6FD6" />
      <circle cx="177" cy="36.5" r="7" fill="#C9CED6" stroke="#8A929C" strokeWidth="2" />
      <circle cx="197" cy="36.5" r="7" fill="#C9CED6" stroke="#8A929C" strokeWidth="2" />
      <rect x="34" y="60" width="170" height="36" rx="8" fill="#FF7A1A" />
      <path d="M40 68h158M40 76h158M40 84h158" stroke="#E0640C" strokeWidth="1" />
      <rect x="194" y="54" width="32" height="42" rx="7" fill="#121418" stroke="#2A2F37" strokeWidth="2" />
      <rect x="201" y="67" width="7" height="13" rx="2" fill="#3FD0E0" />
      <rect x="213" y="67" width="7" height="13" rx="2" fill="#3FD0E0" />
      <rect x="56" y="72" width="30" height="18" rx="2" fill="#16181C" />
      <rect x="150" y="72" width="30" height="18" rx="2" fill="#16181C" />
      <circle cx="72" cy="114" r="27" fill="#17191D" stroke="#2C3038" strokeWidth="7" strokeDasharray="7 4" />
      <circle cx="72" cy="114" r="9" fill="#8A929C" />
      <circle cx="168" cy="114" r="27" fill="#17191D" stroke="#2C3038" strokeWidth="7" strokeDasharray="7 4" />
      <circle cx="168" cy="114" r="9" fill="#8A929C" />
    </svg>
  );
}

/** The exploded stack as five flat layers, top to bottom: sensors, board, chassis, drive and power, wheels. */
export function StackSketch({ height = 250 }: { readonly height?: number }) {
  return (
    <svg viewBox="20 12 200 266" height={height} aria-hidden="true">
      <line x1="120" y1="18" x2="120" y2="272" stroke="#3E5468" strokeWidth="1" strokeDasharray="4 4" />
      <rect x="62" y="20" width="40" height="18" rx="2" fill="#2F6FD6" />
      <circle cx="73" cy="29" r="6" fill="#C9CED6" />
      <circle cx="91" cy="29" r="6" fill="#C9CED6" />
      <rect x="132" y="22" width="28" height="15" rx="2" fill="#7B4FD6" />
      <rect x="54" y="72" width="132" height="22" rx="3" fill="#2E9D63" />
      <rect x="104" y="76" width="30" height="14" rx="1" fill="#0F1114" />
      <rect x="30" y="122" width="180" height="36" rx="9" fill="#FF7A1A" />
      <path d="M36 131h168M36 140h168M36 149h168" stroke="#E0640C" strokeWidth="1" />
      <rect x="40" y="184" width="38" height="22" rx="3" fill="#16181C" stroke="#2C3038" strokeWidth="2" />
      <rect x="162" y="184" width="38" height="22" rx="3" fill="#16181C" stroke="#2C3038" strokeWidth="2" />
      <rect x="92" y="182" width="56" height="12" rx="6" fill="#3B82C4" />
      <rect x="92" y="196" width="56" height="12" rx="6" fill="#3B82C4" />
      <circle cx="70" cy="248" r="24" fill="#17191D" stroke="#2C3038" strokeWidth="6" strokeDasharray="6 4" />
      <circle cx="70" cy="248" r="8" fill="#8A929C" />
      <circle cx="170" cy="248" r="24" fill="#17191D" stroke="#2C3038" strokeWidth="6" strokeDasharray="6 4" />
      <circle cx="170" cy="248" r="8" fill="#8A929C" />
    </svg>
  );
}
