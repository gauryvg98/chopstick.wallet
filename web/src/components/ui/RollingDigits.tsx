"use client";

import { memo } from "react";

/**
 * A "slot machine" numeric string. Each 0-9 digit rides a vertical strip that
 * CSS-transitions its `translateY` when the digit changes — GPU-composited, so
 * a tick costs a transform, not a React re-layout. Non-digit characters
 * ($ . , % ◎ …) render inline and static.
 *
 * The strip is ONE text node ("0\n1\n…\n9" + white-space:pre + line-height:1),
 * not ten elements — each digit costs 2 nodes instead of 12. On a dense trading
 * page that's the difference between ~10k and ~2k nodes, so the roll stays free.
 *
 * Takes a PRE-FORMATTED string (the caller owns formatting) so it works for any
 * readout — price, market cap, PnL, %. Purely presentational; the parent owns
 * the flash + previous-value tracking.
 */

const STRIP = "0\n1\n2\n3\n4\n5\n6\n7\n8\n9";

const Digit = memo(function Digit({ d }: { d: number }) {
  // translateY(-d em): each line is exactly 1em tall, so shifting up by d ems
  // parks digit `d` in the 1em-tall, overflow-hidden window.
  return (
    <span className="rd-col">
      <span className="rd-strip" style={{ transform: `translateY(-${d}em)` }}>
        {STRIP}
      </span>
    </span>
  );
});

export const RollingDigits = memo(function RollingDigits({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c >= "0" && c <= "9") {
      out.push(<Digit key={i} d={+c} />);
    } else {
      out.push(
        <span className="rd-sep" key={i}>
          {c}
        </span>
      );
    }
  }
  // The visible glyphs are a stack of 0-9 per column, meaningless to a screen
  // reader — hide them and expose the real value as visually-hidden text.
  return (
    <span className="rd">
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{out}</span>
    </span>
  );
});
