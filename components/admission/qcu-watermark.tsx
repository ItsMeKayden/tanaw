import Image from "next/image";

import qcuLogo from "@/app/public/qcu-logo.png";

/**
 * Faint QCU seal behind admission screens. Place inside a `relative isolate`
 * container; content above it should be in normal flow.
 */
export function QcuWatermark() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center overflow-hidden print:hidden"
    >
      <Image
        src={qcuLogo}
        alt=""
        className="h-auto w-[min(70%,520px)] opacity-[0.12] select-none"
        priority={false}
      />
    </div>
  );
}
