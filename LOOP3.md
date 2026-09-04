# Loop 3 critique — density, framing and restraint

Screens reviewed: every step for the Westpac donor page and Liberal party page at 390×844 and 1280×900, using WebGL through ANGLE/SwiftShader. The reduced-motion Westpac sequence was also checked at 390×844 as five pixel-stable end states. All record requests were intercepted locally; no paid ask was made.

1. **Who gives**
   - The picture now carries provenance-shaped density: Westpac is surrounded by exactly 1,091 receipt points on a 1998–2025 clock, with log-scaled size retaining donor→party→year variation, while Liberal begins with a ranked field of contributing-industry medallions rather than a generic source ring.
   - Still compressed: only the seven largest destinations or industries can be labelled without turning the phone plate into a ledger, and the graph exposes amounts only at edge/year level, so point size is necessarily that cell's average rather than a raw individual receipt value.
2. **How much, and when**
   - The completed frame makes the temporal shape legible at a glance: peaks rise out of an engraved 28-year baseline, election ticks establish cadence, and the final quiet drift keeps the money path alive without erasing the accumulated history.
   - Still small on phone: non-peak bars and election years require deliberate looking, and showing 2025 as the terminal key gives an empty final year more visual authority than its $0 or tiny amount deserves, even after dimming it.
3. **Where it lands**
   - Ribbon width, arrow direction, destination-ring size and the receiver gauge now reinforce the same share story; the donor and party routes also read in opposite directions without changing the camera grammar.
   - Still dense at the receiving edge: the smallest of seven ribbons converge tightly at 390px, and flows below the top seven disappear rather than receiving a misleading hairline label.
4. **What parliament said**
   - Exact citation dates occupy collision-aware lanes on the 1993–2026 record; party-coloured card edges connect the stage to the source list, and desktop hover/focus visibly selects the corresponding card.
   - Still austere: the stage carries dates, not full speech titles or speaker names, and six near-identical dates would consume most of the available vertical lanes even though they no longer collide.
5. **What this cannot show**
   - The taller, quieter hatched floor and the separately crossed state/federal arc make absence and non-additivity spatial facts, not footnotes; dimming the reported flow correctly shifts attention to the missing territory.
   - Still diagrammatic: the crossed arc needs its nearby label to explain what the X negates, and the threshold band's height is rhetorical rather than an estimate because the missing amount is unknowable.

Worst two loop-3 findings fixed before close: the phone capture initially let step 4's off-screen citation hover scroll its heading behind the sticky stage, so initial framing and desktop interaction evidence were separated and mobile step changes now reset the dialog; the Westpac seed cloud still brushed the left plate edge, so its clock centre moved inward without reducing its 1,091 points. Party and recipient medallions were also collapsed into instanced rings plus batched hatch/arc geometry, keeping the richer scene to a small draw-call budget.
