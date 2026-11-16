import Image from "next/image";

import qcuLogo from "@/app/public/qcu-logo.png";

/**
 * Faint QCU seal behind workspace screens. Fixed to the viewport's content
 * area (right of the sidebar, below the header), so it stays centered and
 * still while long pages scroll. Place inside a `relative isolate`
 * container; content above it should be in normal flow.
 */
export function QcuWatermark() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-[58px] bottom-0 -z-10 flex items-center justify-center overflow-hidden sm:left-[230px] print:hidden"
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
