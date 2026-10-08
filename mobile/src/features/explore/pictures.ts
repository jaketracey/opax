import {
  array,
  count,
  invalid,
  nonempty,
  nullable,
  object,
  url,
} from '../../api/validation';
import { isYearPicturePath } from '../../api/year-picture-policy';
export interface YearPicture {
  file: string;
  width: number;
  height: number;
  caption: string;
  event: string;
  date: string | null;
  author: string;
  credit: string;
  licence: string;
  licence_url: string | null;
  source_url: string;
  original_url: string;
}
export function decodePictures(value: unknown): Record<string, YearPicture[]> {
  return Object.fromEntries(
    Object.entries(object(value)).map(([year, rows]) => {
      if (!/^\d{4}$/.test(year)) invalid();
      const seen = new Set<string>();
      const photos = array((value) => {
        const p = object(value),
          file = nonempty(p.file);
        const width = count(p.width),
          height = count(p.height);
        if (
          !isYearPicturePath('/' + file) ||
          !file.startsWith(`years/pictures/${year}/`) ||
          seen.has(file) ||
          width < 1 ||
          height < 1 ||
          width > 2048 ||
          height > 2048
        )
          invalid();
        seen.add(file);
        return {
          file,
          width,
          height,
          caption: nonempty(p.caption),
          event: nonempty(p.event),
          date: nullable(nonempty)(p.date),
          author: nonempty(p.author),
          credit: nonempty(p.credit),
          licence: nonempty(p.licence),
          licence_url: nullable(url)(p.licence_url),
          source_url: url(p.source_url),
          original_url: url(p.original_url),
        };
      })(rows);
      return [year, photos];
    }),
  );
}
