import { File, Paths } from 'expo-file-system';
import { decodeChoice, type SeatChoice } from './model';
const file = () => new File(Paths.document, 'opax-seat-v1.json');
export async function loadChoice(): Promise<SeatChoice | null> {
  const saved = file();
  if (!saved.exists) return null;
  try {
    return decodeChoice(JSON.parse(await saved.text()));
  } catch {
    return null;
  }
}
export async function saveChoice(choice: SeatChoice): Promise<void> {
  const temporary = new File(Paths.document, 'opax-seat-v1.tmp');
  temporary.write(JSON.stringify(choice));
  temporary.move(file(), { overwrite: true });
}
