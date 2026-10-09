import type { ReactNode } from 'react';
import { MachineLabel } from './labels';

export { MACHINE_GUIDANCE, MACHINE_LABEL, MachineLabel } from './labels';

/**
 * @deprecated Use `MachineLabel`. The label says one phrase everywhere,
 * "Machine-written": `label` ("Machine summary", "Machine brief") is no
 * longer drawn or spoken.
 */
export function MachineWritten({
  explanation,
  testID,
  children,
}: {
  explanation: string;
  /** @deprecated Ignored: the pill always reads "Machine-written". */
  label?: string;
  testID?: string;
  children?: ReactNode;
}) {
  return (
    <MachineLabel explanation={explanation} testID={testID}>
      {children}
    </MachineLabel>
  );
}
