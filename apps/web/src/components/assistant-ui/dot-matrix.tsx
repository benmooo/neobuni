import { cn } from "@neobuni/ui/lib/utils";
import type { ComponentProps, CSSProperties } from "react";

const gridSize = 5;
const center = (gridSize - 1) / 2;
const dotIndexes = Array.from(
  { length: gridSize * gridSize },
  (_, index) => index
);

type DotMatrixState = "connecting" | "working";

interface DotAnimation {
  delay: number;
  duration: number;
  lowOpacity: number;
}

const getDotAnimation = (
  state: DotMatrixState,
  row: number,
  column: number
): DotAnimation =>
  state === "connecting"
    ? {
        duration: 1.4,
        delay:
          -Math.max(Math.abs(row - center), Math.abs(column - center)) * 0.18,
        lowOpacity: 0.15,
      }
    : {
        duration: 1.1,
        delay: -(row * 0.12 + column * 0.08),
        lowOpacity: 0.2,
      };

type DotMatrixProps = Omit<ComponentProps<"span">, "children"> & {
  state?: DotMatrixState;
  label?: string;
};

const dotMatrixCss =
  "@keyframes buni-dot-matrix-blink{0%,100%{opacity:var(--buni-dot-matrix-high-opacity)}50%{opacity:var(--buni-dot-matrix-low-opacity)}}";

function DotMatrix({
  className,
  state = "working",
  label,
  ...props
}: DotMatrixProps) {
  return (
    <span
      className={cn(
        "inline-block size-4 shrink-0 text-muted-foreground",
        className
      )}
      data-slot="dot-matrix"
      data-state={state}
      role="status"
      {...props}
    >
      <span className="sr-only">{label ?? state}</span>
      <style href="buni-dot-matrix" precedence="low">
        {dotMatrixCss}
      </style>
      <svg
        aria-hidden
        className="size-full"
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        {dotIndexes.map((index) => {
          const row = Math.floor(index / gridSize);
          const column = index % gridSize;
          const animation = getDotAnimation(state, row, column);

          return (
            <circle
              className="[animation-iteration-count:infinite] [animation-name:buni-dot-matrix-blink] [animation-timing-function:ease-in-out] motion-reduce:[animation-name:none]"
              cx={2 + column * 4}
              cy={2 + row * 4}
              key={index}
              r={1.3}
              style={
                {
                  animationDelay: `${animation.delay}s`,
                  animationDuration: `${animation.duration}s`,
                  "--buni-dot-matrix-high-opacity": 1,
                  "--buni-dot-matrix-low-opacity": animation.lowOpacity,
                } as CSSProperties
              }
            />
          );
        })}
      </svg>
    </span>
  );
}

export type { DotMatrixProps, DotMatrixState };
export { DotMatrix };
