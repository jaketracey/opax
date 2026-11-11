// Paths and poses ported from portal/public/wombat.js. Keep the drawings in step.
import { Circle, Ellipse, G, Path } from 'react-native-svg';
import { AnimalPart } from './motion';
import type { AnimalName } from './poses';

export function AnimalDrawing({
  name,
  ink,
  wash,
}: {
  name: AnimalName;
  ink: string;
  wash: string;
}) {
  const line = {
    fill: 'none',
    stroke: ink,
    strokeWidth: 2.2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const;
  const shape = { ...line, fill: wash };
  const solid = { fill: ink, stroke: 'none' };
  switch (name) {
    case 'wombat':
      return (
        <G>
          <AnimalPart kind="beat" origin={[80, 68.6]}>
            <AnimalPart kind="rock" origin={[60, 68.6]}>
              <AnimalPart kind="legB" origin={[71.5, 62.5]} opacity={0.5}>
                <Path
                  {...shape}
                  d="M 67.5 62.5 L 67.5 65.3 Q 67.5 68.6 70.5 68.6 L 72.5 68.6 Q 75.5 68.6 75.5 65.3 L 75.5 62.5"
                />
              </AnimalPart>
              <AnimalPart kind="legA" origin={[42, 62.5]} opacity={0.5}>
                <Path
                  {...shape}
                  d="M 38 62.5 L 38 65.3 Q 38 68.6 41 68.6 L 43 68.6 Q 46 68.6 46 65.3 L 46 62.5"
                />
              </AnimalPart>

              <Path
                {...shape}
                d="M 26 63
              C 12 62 7 52 8 42
              C 9 28 20 18 40 16
              C 55 14.5 70 14 82 17
              C 94 20 103 26 107 35
              C 109.5 41 109.5 49 106 54
              C 102 60 94 62.5 86 63
              Z"
              />

              <Path
                {...line}
                strokeWidth={1.7}
                opacity={0.55}
                d="M 20.5 33 C 15 41 15.5 52 23 58.5"
              />

              <Path
                {...shape}
                d="M 80.5 16.8 C 80.8 10.4 88.8 10.6 88.3 18.7"
              />
              <Path {...shape} d="M 90 19.6 C 90.2 12.8 99 13.2 98.6 22.2" />

              <AnimalPart kind="eye">
                <Circle {...solid} cx="96" cy="33" r="1.8" />
              </AnimalPart>
              <Ellipse {...solid} cx="105.6" cy="46.8" rx="5.6" ry="5" />

              <AnimalPart kind="legA" origin={[85, 62.5]}>
                <Path
                  {...shape}
                  d="M 81 62.5 L 81 65.3 Q 81 68.6 84 68.6 L 86 68.6 Q 89 68.6 89 65.3 L 89 62.5"
                />
              </AnimalPart>
              <AnimalPart kind="legB" origin={[30, 62.5]}>
                <Path
                  {...shape}
                  d="M 26 62.5 L 26 65.3 Q 26 68.6 29 68.6 L 31 68.6 Q 34 68.6 34 65.3 L 34 62.5"
                />
              </AnimalPart>
            </AnimalPart>
          </AnimalPart>
        </G>
      );
    case 'echidna':
      return (
        <G>
          <AnimalPart kind="beat" origin={[87, 68.6]}>
            <AnimalPart kind="rock" origin={[60, 68.6]}>
              <AnimalPart kind="legB" origin={[68, 63.5]} opacity={0.5}>
                <Path
                  {...shape}
                  d="M 64 63.5 L 64 65.3 Q 64 68.6 67 68.6 L 69 68.6 Q 72 68.6 72 65.3 L 72 63.5"
                />
              </AnimalPart>
              <AnimalPart kind="legA" origin={[42, 63.5]} opacity={0.5}>
                <Path
                  {...shape}
                  d="M 38 63.5 L 38 65.3 Q 38 68.6 41 68.6 L 43 68.6 Q 46 68.6 46 65.3 L 46 63.5"
                />
              </AnimalPart>

              <Path
                {...shape}
                d="M 89 64.5
              C 99 63.5 104 57 102.5 50
              C 100 36.5 85.5 27.5 64 27.5
              C 43 27.5 27 36.5 23 48.5
              C 20 58 27.5 63.7 37 64.5
              Z"
              />

              <Path {...line} strokeWidth={1.5} d="M 25 45 L 15.5 39.5" />
              <Path {...line} strokeWidth={1.5} d="M 29.5 37 L 21 29.5" />
              <Path {...line} strokeWidth={1.5} d="M 37 31.5 L 30.5 22.5" />
              <Path {...line} strokeWidth={1.5} d="M 46.5 28.5 L 42 19" />
              <Path {...line} strokeWidth={1.5} d="M 57 27 L 54.5 17" />
              <Path {...line} strokeWidth={1.5} d="M 68 27 L 67.5 17" />
              <Path {...line} strokeWidth={1.5} d="M 78.5 28.5 L 80.5 19" />
              <Path {...line} strokeWidth={1.5} d="M 87.5 32 L 91.5 23.5" />
              <Path {...line} strokeWidth={1.5} d="M 94.5 37.5 L 100.5 30" />

              <Path
                {...shape}
                d="M 96 49.5 C 103 50 109 53 113.5 57.5 C 108.5 58.8 102 58.3 95.5 56.3"
              />

              <AnimalPart kind="eye">
                <Circle {...solid} cx="93" cy="45" r="1.6" />
              </AnimalPart>

              <AnimalPart kind="legA" origin={[80, 63.5]}>
                <Path
                  {...shape}
                  d="M 76 63.5 L 76 65.3 Q 76 68.6 79 68.6 L 81 68.6 Q 84 68.6 84 65.3 L 84 63.5"
                />
              </AnimalPart>
              <AnimalPart kind="legB" origin={[31, 63.5]}>
                <Path
                  {...shape}
                  d="M 27 63.5 L 27 65.3 Q 27 68.6 30 68.6 L 32 68.6 Q 35 68.6 35 65.3 L 35 63.5"
                />
              </AnimalPart>
            </AnimalPart>
          </AnimalPart>
        </G>
      );
    case 'platypus':
      return (
        <G>
          <AnimalPart kind="beat" origin={[83, 68.6]}>
            <AnimalPart kind="rock" origin={[60, 68.6]}>
              <AnimalPart kind="tail" origin={[28, 56.5]}>
                <Path
                  {...shape}
                  d="M 28 52.5 C 18 50 8.5 51.5 5 56 C 8.5 60.5 18 62.5 29 60.5"
                />
              </AnimalPart>

              <AnimalPart kind="legB" origin={[64, 64]} opacity={0.5}>
                <Path
                  {...shape}
                  d="M 60 64 L 60 65.3 Q 60 68.6 63 68.6 L 65 68.6 Q 68 68.6 68 65.3 L 68 64"
                />
              </AnimalPart>
              <AnimalPart kind="legA" origin={[46, 64]} opacity={0.5}>
                <Path
                  {...shape}
                  d="M 42 64 L 42 65.3 Q 42 68.6 45 68.6 L 47 68.6 Q 50 68.6 50 65.3 L 50 64"
                />
              </AnimalPart>

              <Path
                {...shape}
                d="M 34 66.2
              C 23 65.5 16.5 59.5 18.5 52.5
              C 21 45.5 33 41.8 51 41.8
              C 69 42 83.5 45.5 90 50.5
              C 95.5 55 94.5 61.5 87 64.5
              C 77 67.5 55 67.2 34 66.2
              Z"
              />

              <Path
                {...shape}
                d="M 89 51 C 96.5 49.6 104 50 109.5 51.8 C 111.4 52.6 111.4 55 109.5 55.9 C 104 58 96.5 58.3 89 57.2"
              />

              <AnimalPart kind="eye">
                <Circle {...solid} cx="86.5" cy="50.3" r="1.4" />
              </AnimalPart>

              <AnimalPart kind="legA" origin={[78, 64]}>
                <Path
                  {...shape}
                  d="M 74 64 L 74 65.3 Q 74 68.6 77 68.6 L 79 68.6 Q 82 68.6 82 65.3 L 82 64"
                />
              </AnimalPart>
              <AnimalPart kind="legB" origin={[34, 64]}>
                <Path
                  {...shape}
                  d="M 30 64 L 30 65.3 Q 30 68.6 33 68.6 L 35 68.6 Q 38 68.6 38 65.3 L 38 64"
                />
              </AnimalPart>
            </AnimalPart>
          </AnimalPart>
        </G>
      );
    case 'emu':
      return (
        <G>
          <AnimalPart kind="rock" origin={[60, 68.6]}>
            <AnimalPart kind="legB" origin={[55, 49]} opacity={0.5}>
              <Path {...line} d="M 55 49 L 53.8 58.5 L 52 68.4 L 57.5 68.4" />
            </AnimalPart>

            <Path
              {...shape}
              d="M 35.5 49.5
            C 28.5 44 29.5 32 40.5 26.5
            C 50 21.8 63 23.5 69 30
            C 74 35.5 73 44 66 48.5
            C 57.5 54 42.5 53.8 35.5 49.5
            Z"
            />

            <Path
              {...line}
              strokeWidth={1.7}
              opacity={0.55}
              d="M 37 50.5 C 33 53.5 30.5 57 29 61"
            />
            <Path
              {...line}
              strokeWidth={1.7}
              opacity={0.55}
              d="M 43 52.5 C 40.5 55.5 39 58.5 38.2 62"
            />

            <AnimalPart kind="beat" origin={[65.5, 30.6]}>
              <Path
                {...shape}
                d="M 59 31
              C 64.5 28 66.5 22.5 67 14.5
              C 67.2 10.2 69.4 8.4 71.9 8.7
              C 74.4 9 75.8 11 75.4 13.8
              C 75 17 73.3 20 72 24
              C 70.8 27.6 70.2 31 69.8 34.5"
              />
              <Path {...solid} d="M 75 10.6 L 80.6 12.4 L 74.8 14 Z" />
              <AnimalPart kind="eye">
                <Circle {...solid} cx="72.3" cy="11.2" r="1.15" />
              </AnimalPart>
            </AnimalPart>

            <AnimalPart kind="legA" origin={[47, 49]}>
              <Path {...line} d="M 47 49 L 45.8 58.5 L 44 68.4 L 49.5 68.4" />
            </AnimalPart>
          </AnimalPart>
        </G>
      );
  }
}
