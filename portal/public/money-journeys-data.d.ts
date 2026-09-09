export interface JourneyStep {
  title: string;
  body: string;
  metric?: { label: string; value: number; format: string };
  scene: { focusId: string; withIds: string[]; edges: {source:string;target:string}[]; from?:number; to?:number };
  links?: {label:string;href:string}[];
}
export interface Journey {
  id: string; title: string; description: string; selection: string; steps: JourneyStep[];
  choices: {value:string;label:string}[];
}
export function buildMoneyJourneys(data: unknown, selections?: Record<string,string>): Journey[];
