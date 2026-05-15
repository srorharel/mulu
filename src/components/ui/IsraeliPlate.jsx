// Visual Israeli license plate widget.
// Colors are fixed to the Israeli plate standard (#FFE74A yellow, #1452AF EU strip).
// 1.5px border and box-shadow are the only inline styles — no Tailwind equivalent.
export default function IsraeliPlate({ number = '12-345-67' }) {
  return (
    <div
      className="inline-flex items-stretch h-[38px] rounded-[6px] bg-[#FFE74A] overflow-hidden font-mono shrink-0"
      dir="ltr"
      style={{ border: '1.5px solid #2a2a2a', boxShadow: '0 1px 0 rgba(0,0,0,0.1)' }}
    >
      {/* Blue EU-style country strip */}
      <div className="w-[14px] bg-[#1452AF] flex items-end justify-center pb-[4px]">
        <span className="text-[7px] font-bold text-[#FFE74A] leading-none">IL</span>
      </div>
      {/* Plate number — always LTR regardless of app locale */}
      <div className="flex items-center justify-center px-[10px] text-[20px] font-extrabold text-[#1a1a1a] tracking-[1.5px]" dir="ltr">
        {number}
      </div>
    </div>
  )
}
