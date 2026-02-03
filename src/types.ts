export type FoundRef = {
  file: string; // relative posix path to importer file
  line: number;
  text: string;
};

export type GitOrigin = {
  commit: string;
  date: string; // YYYY-MM-DD
  subject: string;
  author?: {
    name: string;
    email?: string;
  };
} | null;

export type ScanOptions = {
  hardIgnore?: string[];
  targetAbs?: string;
};

export const DEFAULT_MAX_LINES = 5;
