import type { TextProps } from 'react-native';

export type ProbeLine = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
export type ProbeFrame = { width: number; height: number };
export interface ProbeProps extends TextProps {
  testDrawnText?: boolean;
}
