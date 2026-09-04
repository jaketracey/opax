# Loop 3 critique — motion budget, touch targets and final phone cleanup

Reviewed all five steps from the Westpac donor and Liberal party entries at 360×780, 390×844 and 430×932: 30 WebGL captures through ANGLE/SwiftShader. A second 10-capture pass at 390×844 verified the reduced-motion stills. Every step-four request was intercepted with six citations from the same year; no paid ask was made.

1. **Who gives**
   - The phone camera still keeps the receipt cloud, medallions and five largest destinations inside the frame at all three widths. There is no empty lower third and no cloud crop.
   - At 360px the long Westpac heading takes two lines and the ranked labels remain necessarily dense, but the top-right heading, close control, rings and label plates all have distinct space. No scene text is below 11px.
2. **How much, and when**
   - The taller filled histogram, 11px election years and explicit peak summary survive the final phone pass. The peak is the clear hierarchy; the terminal year is merely part of the axis.
   - Ten election labels across 296px are close to the practical density limit. They remain separate and readable, but any additional year should trigger a reduced tick set rather than tighter type.
3. **Where it lands**
   - The gauge caption stays on the lower edge and does not cover a ring or destination label. Five labels plus `+2 smaller` remain the right compromise at 360px.
   - The smallest ribbons are still visually quiet beside the leading flow. This accurately reflects their share, and the separate coloured landing rings preserve identification without turning the scene into a label ladder again.
4. **What parliament said**
   - Six same-year citations remain individually legible at 11px with six non-overlapping lanes at 360px, so clustering is not necessary for the current maximum.
   - Dates are the information ceiling for the stage. Titles correctly remain in the narrative; putting them in the scene would make the phone plate unreadable.
5. **What this cannot prove**
   - Both disclosure labels are now 11px. The state/federal note is anchored beside the crossed arc and says what the cross means, while the disclosure-threshold card retains its own lower band.
   - At 360px the state/federal note wraps to three short lines. It is the busiest remaining annotation, but it no longer floats away from the cross or touches the close control, arc, or threshold card.

The motion audit measured a 14.34fps effective render rate under SwiftShader at 390×844, with a 49.4ms minimum sampled interval; the narrow-screen gate is explicitly `1000 / 30`, so it cannot exceed 30fps on a faster device. A simulated hidden-tab transition added zero rendered frames, returning to visible resumed rendering, and closing added zero frames. The close audit also exposed a disposal exception on non-mesh scene nodes: rendering stopped, but the canvas was left attached. The material lookup is now null-safe, and the repeated probe confirmed the canvas is removed on close. Reduced-motion captures for both flow directions were pixel-identical across a 600ms interval on all five steps while retaining the peak, ribbons, citations and limits.

The two worst findings from the loop were fixed before close: short party-name links now have a full 44×44px minimum target, and scene disposal now completes without leaving its WebGL canvas behind. Final phone diagnostics found zero label overlaps, zero sub-11px scene labels, zero undersized dialog targets, zero horizontal dialog overflow, and a 14.4px minimum gap between every top-right label and the close control.
